// renewalEngine.ts — เครื่องยนต์ "ต่ออายุอัตโนมัติ" (รอบปีของสมาชิก)
//
// กติกา:
//  1) ต่ออายุเฉพาะสมาชิกที่ "ถึงรอบ" (วันครบรอบปีจากวันที่อนุมัติ/สมัคร) และเปิดต่ออายุอัตโนมัติอยู่
//     — ค่าที่ใช้ตัดสิน: ตั้งรายคนก่อน ถ้าไม่มีจึงใช้สวิตช์ทั้งระบบ (เหมือนที่หน้า /admin แสดง)
//  2) รันซ้ำได้ไม่ซ้ำซ้อน (idempotent): เก็บ `nextRenewalAt` ที่เลื่อนไปรอบถัดไปแล้วใน Firestore
//     รอบที่ผ่านไปแล้วจะไม่ถูกต่อซ้ำ และรอบถัดไปจะต่อเมื่อถึงวันจริงเท่านั้น
//  3) สมาชิกที่ถูกลบออก (soft delete) / ไม่ได้ ACTIVE → ข้าม ไม่ต่ออายุให้
//  4) ทุกครั้งที่ต่ออายุจริง: เขียน AuditLog `member.auto_renew` + แจ้งเตือนสมาชิกและผู้ดูแล
//     — dry run ไม่เขียนอะไรเลย (ใช้ตรวจก่อนตัดสินใจ)

import { prisma } from '@/lib/prisma';
import { readAdminStates, readGlobalAutoRenew, normalizeState, writeAdminStatePatch } from '@/lib/memberAdmin';

export type RenewalOutcome = 'renewed' | 'would_renew' | 'skipped' | 'error';

export interface RenewalRow {
  id: string;
  memberCode: string | null;
  name: string;
  email: string | null;
  autoRenewSource: 'self' | 'global';
  nextRenewalAt: string | null;
  daysLeft: number | null;
  outcome: RenewalOutcome;
  reason?: string;
}

export interface RenewalRunResult {
  ok: boolean;
  dry: boolean;
  ranAt: string;
  checked: number;
  renewed: number;
  wouldRenew: number;
  skipped: number;
  errors: number;
  autoRenewGlobal: boolean;
  rows: RenewalRow[];
  error?: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** วันครบรอบปีถัดไปจากวันที่เริ่มนับ (Asia/Bangkok ไม่กระทบเพราะเทียบเป็น UTC วันที่เท่านั้น) */
export function nextAnniversary(anchor: Date | string, now = new Date()): string {
  const a = new Date(anchor);
  if (isNaN(a.getTime())) return new Date(now.getTime() + 365 * DAY_MS).toISOString();
  const next = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate(), a.getUTCHours(), a.getUTCMinutes()));
  while (next.getTime() <= now.getTime()) next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next.toISOString();
}

function plusOneYear(iso: string): string {
  const d = new Date(iso);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  return d.toISOString();
}

function daysBetween(from: Date, to: Date) {
  return Math.round((to.getTime() - from.getTime()) / DAY_MS);
}

/**
 * ตรวจ/ต่ออายุอัตโนมัติให้สมาชิกทุกคน
 * @param dry true = ตรวจเท่านั้น ไม่เขียนข้อมูล (ใช้โชว์บนหน้า /admin)
 */
export async function runRenewalCycle(opts: { dry?: boolean; actorId?: string | null; actorEmail?: string | null; limit?: number } = {}): Promise<RenewalRunResult> {
  const dry = opts.dry === true;
  const now = new Date();
  const out: RenewalRunResult = {
    ok: true, dry, ranAt: now.toISOString(), checked: 0, renewed: 0, wouldRenew: 0, skipped: 0, errors: 0,
    autoRenewGlobal: false, rows: [],
  };

  try {
    const users: any[] = await (prisma as any).user.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      take: opts.limit || 500,
      select: { id: true, email: true, displayName: true, firstName: true, lastName: true, memberCode: true, status: true, approvedAt: true, createdAt: true },
    });
    const states = await readAdminStates(users.map((u) => u.id));
    const globalAutoRenew = await readGlobalAutoRenew();
    out.autoRenewGlobal = globalAutoRenew;

    for (const u of users) {
      const raw = states.get(u.id) || null;
      const st = normalizeState(raw, u.status);
      const name = u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || u.id;

      const push = (outcome: RenewalOutcome, reason: string, nextRenewalAt: string | null, source: 'self' | 'global' = 'global') => {
        out.rows.push({
          id: u.id,
          memberCode: u.memberCode || null,
          name,
          email: u.email || null,
          autoRenewSource: source,
          nextRenewalAt,
          daysLeft: nextRenewalAt ? daysBetween(now, new Date(nextRenewalAt)) : null,
          outcome,
          reason,
        });
      };

      out.checked++;

      if (st.deleted) { out.skipped++; push('skipped', 'ถูกลบออกจากระบบ (soft delete) — ไม่ต่ออายุ', null); continue; }

      const source: 'self' | 'global' = st.autoRenewSet ? 'self' : 'global';
      const autoRenewOn = st.autoRenewSet ? st.autoRenew === true : globalAutoRenew;
      const nextRenewalAt = (raw?.nextRenewalAt as string) || nextAnniversary(u.approvedAt || u.createdAt || now, now);

      if (!autoRenewOn) { out.skipped++; push('skipped', 'ปิดต่ออายุอัตโนมัติ (รายคน/ทั้งระบบ)', nextRenewalAt, source); continue; }

      if (new Date(nextRenewalAt).getTime() > now.getTime()) {
        out.skipped++;
        push('skipped', `ยังไม่ถึงรอบ (อีก ${daysBetween(now, new Date(nextRenewalAt))} วัน)`, nextRenewalAt, source);
        continue;
      }

      if (dry) { out.wouldRenew++; push('would_renew', 'ถึงรอบแล้ว — จะต่ออายุเมื่อสั่งจริง', nextRenewalAt, source); continue; }

      try {
        const advanced = plusOneYear(nextRenewalAt);
        const count = Number(raw?.renewalCount || 0) + 1;
        await writeAdminStatePatch(u.id, {
          nextRenewalAt: advanced,
          lastRenewedAt: now.toISOString(),
          renewalCount: count,
          autoRenewLastRunAt: now.toISOString(),
        });
        const actor = opts.actorEmail || opts.actorId || 'system';
        await (prisma as any).auditLog.create({
          data: {
            userId: null,
            action: 'member.auto_renew',
            entity: 'User',
            entityId: u.id,
            oldValue: { nextRenewalAt, renewalCount: count - 1 },
            newValue: { nextRenewalAt: advanced, renewalCount: count, source, actor },
            reason: 'ต่ออายุอัตโนมัติตามรอบปี',
          },
        }).catch((e: any) => console.error('[renewal] audit failed:', e?.message));
        try {
          const { emitNotification, notifyAdmins } = await import('@/lib/notify');
          await emitNotification({
            userId: u.id,
            type: 'membership_renewed',
            title: 'ต่ออายุสมาชิกอัตโนมัติแล้ว',
            body: `ระบบต่ออายุให้อัตโนมัติตามรอบปี — รอบถัดไป ${advanced.slice(0, 10)}`,
            referenceId: '/settings',
          }).catch(() => null);
          await notifyAdmins({
            type: 'membership_renewed',
            title: 'ต่ออายุอัตโนมัติสำเร็จ 1 ราย',
            body: `${name}${u.memberCode ? ` (${u.memberCode})` : ''} — รอบถัดไป ${advanced.slice(0, 10)}`,
            referenceId: '/admin',
          }).catch(() => null);
        } catch { /* การแจ้งเตือนล้มไม่ควรทำให้การต่ออายุล้ม */ }

        out.renewed++;
        push('renewed', `ต่ออายุแล้ว — รอบถัดไป ${advanced.slice(0, 10)}`, advanced, source);
      } catch (e: any) {
        out.errors++;
        push('error', e?.message || 'ต่ออายุไม่สำเร็จ', nextRenewalAt, source);
      }
    }
  } catch (e: any) {
    out.ok = false;
    out.error = e?.message || 'รันรอบต่ออายุไม่สำเร็จ';
  }

  return out;
}
