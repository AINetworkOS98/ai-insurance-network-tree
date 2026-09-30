import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';
import { isAdminFromPayload } from '@/lib/admin';
import { rankName } from '@/lib/rankCatalog';
import { DEFAULT_POSITIONS } from '@/lib/compensationRules';
import { applyMemberAction, readAdminStates, readGlobalAutoRenew, normalizeState, type MemberAction } from '@/lib/memberAdmin';

interface FirestoreMember {
  id: string;
  memberCode?: string;
  displayName?: string;
  name?: string;
  positionId?: string;
  role?: string;
  status?: string;
  personalFYC?: number;
  personalCOM?: number;
  uid?: string;
  email?: string;
}

/** แปลง rankLevel (0–4 ตาม rankCatalog) → ตำแหน่งในผัง แบบแผนเดียวกับ /api/admin/positions */
const RANK_TO_POSITION: Record<number, string> = {
  1: 'agent',
  2: 'unit_manager',
  3: 'center_manager',
  4: 'region_manager',
};

function positionLabel(rankLevel: number, positionId?: string) {
  const pid = positionId || RANK_TO_POSITION[rankLevel] || (rankLevel === 0 ? 'general' : undefined);
  if (!pid) return '—';
  return DEFAULT_POSITIONS.find((p: any) => p.id === pid)?.name || rankName(rankLevel as any) || pid;
}

/** ยืนยันสิทธิ์ผู้ดูแล — คืน decoded payload หรือ response ที่ต้องส่งกลับ */
async function guard(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '') || req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
  if (!token) return { error: NextResponse.json({ ok: false, error: 'ไม่พบโทเค็นการยืนยันตัวตน' }, { status: 401 }) };
  const decoded: any = verifyToken(token);
  if (!decoded) return { error: NextResponse.json({ ok: false, error: 'โทเค็นไม่ถูกต้องหรือหมดอายุ' }, { status: 401 }) };
  const isAdmin = await isAdminFromPayload(decoded);
  if (!isAdmin) return { error: NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 }) };
  return { decoded };
}

export async function GET(req: NextRequest) {
  try {
    const g = await guard(req);
    if (g.error) return g.error;

    // ── ทะเบียนจริง = ตาราง User (Postgres) — Firestore `members` เป็นข้อมูลเดิม/สำรอง ──
    const { prisma } = await import('@/lib/prisma');
    const users: any[] = await (prisma as any).user.findMany({
      take: 300,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true, email: true, firstName: true, lastName: true, displayName: true, phone: true,
        memberCode: true, referralCode: true, status: true, rankLevel: true, approvedAt: true, createdAt: true,
      },
    }).catch((e: any) => { console.error('admin members prisma skipped', e?.message); return []; });

    const states = await readAdminStates(users.map((u) => u.id));
    const globalAutoRenew = await readGlobalAutoRenew();

    const members: any[] = users.map((u: any) => {
      const raw = states.get(u.id) || null;
      const st = normalizeState(raw, u.status);
      return {
        id: u.id,
        source: 'postgres',
        memberCode: u.memberCode || null,
        name: u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email,
        email: u.email || null,
        phone: u.phone || null,
        rankLevel: u.rankLevel ?? 0,
        positionId: RANK_TO_POSITION[u.rankLevel ?? 0] || null,
        positionName: positionLabel(u.rankLevel ?? 0),
        status: String(u.status || 'PENDING'),
        adminStatus: st.adminStatus,
        deleted: st.deleted === true,
        deletedAt: st.deletedAt || null,
        autoRenew: st.autoRenew === true || globalAutoRenew === true,
        autoRenewSelf: st.autoRenew === true,
        approvedAt: st.approvedAt || (u.approvedAt ? new Date(u.approvedAt).toISOString() : null),
        joinDate: u.createdAt ? new Date(u.createdAt).toISOString() : null,
        personalFYC: 0,
        personalCOM: 0,
        legacy: false,
      };
    });

    // ── รวมข้อมูลเดิมใน Firestore (ไม่นับซ้ำ) — ถ้า Firestore ล่มต้องยังตอบจาก Postgres ได้ ──
    let legacyCount = 0;
    try {
      const db = getDb();
      const snap = await db.collection('members').get();
      const seen = new Set(members.map((m: any) => String(m.memberCode || '').trim()).filter(Boolean));
      const seenEmails = new Set(members.map((m: any) => String(m.email || '').trim().toLowerCase()).filter(Boolean));
      for (const doc of snap.docs) {
        const m: FirestoreMember = { id: doc.id, ...doc.data() } as FirestoreMember;
        if (!m.memberCode && !m.displayName && !m.name) continue; // ข้ามเอกสารสรุปที่ไม่ใช่แถวสมาชิก (เช่น MANUAL_TEST)
        if (m.memberCode && seen.has(String(m.memberCode).trim())) continue;
        // คนเดียวกันที่มีอยู่แล้วในทะเบียนหลัก (เทียบอีเมล) — ไม่ต้องแสดงซ้ำ
        if (m.email && seenEmails.has(String(m.email).trim().toLowerCase())) continue;
        const st = normalizeState(states.get(doc.id) || null, m.status);
        members.push({
          id: doc.id,
          source: 'firestore',
          memberCode: m.memberCode || null,
          name: m.displayName || m.name || doc.id,
          email: m.email || null,
          phone: null,
          rankLevel: 0,
          positionId: m.positionId || null,
          positionName: DEFAULT_POSITIONS.find((p: any) => p.id === m.positionId)?.name || m.positionId || '—',
          status: String(m.status || 'PENDING'),
          adminStatus: st.adminStatus,
          deleted: st.deleted === true,
          deletedAt: st.deletedAt || null,
          autoRenew: st.autoRenew === true || globalAutoRenew === true,
          autoRenewSelf: st.autoRenew === true,
          approvedAt: st.approvedAt || null,
          joinDate: null,
          personalFYC: m.personalFYC || 0,
          personalCOM: m.personalCOM || 0,
          legacy: true,
        });
        legacyCount++;
      }
    } catch (e: any) {
      console.warn('admin members firestore skipped:', e?.message);
    }

    const count = (s: string) => members.filter((m: any) => m.adminStatus === s).length;
    const summary = {
      total: members.length,
      totalActiveMembers: members.filter((m: any) => !m.deleted && m.adminStatus === 'approved').length,
      pending: count('pending'),
      approved: count('approved'),
      rejected: count('rejected'),
      deleted: count('deleted'),
      autoRenew: members.filter((m: any) => m.autoRenew).length,
      autoRenewGlobal: globalAutoRenew,
      sources: { postgres: members.length - legacyCount, legacy: legacyCount },
    };

    return NextResponse.json({ ok: true, members, count: members.length, summary, autoRenewGlobal: globalAutoRenew });

  } catch (error: any) {
    console.error('Admin members API error:', error);
    return NextResponse.json({ ok: false, error: 'เกิดข้อผิดพลาดในการดึงข้อมูลสมาชิก' }, { status: 500 });
  }
}

// ── จัดการสมาชิก: อนุมัติ / ไม่อนุมัติ · ลบออก / คืนค่า · ต่ออายุอัตโนมัติ ──────
export async function POST(req: NextRequest) {
  try {
    const g = await guard(req);
    if (g.error) return g.error;
    const body = await req.json().catch(() => ({} as any));
    const id = String(body?.id || '').trim();
    const action = String(body?.action || '').trim() as MemberAction;
    const allowed: MemberAction[] = ['approve', 'reject', 'delete', 'restore', 'autoRenew', 'autoRenewGlobal'];
    if (!allowed.includes(action)) {
      return NextResponse.json({ ok: false, error: 'คำสั่งไม่ถูกต้อง (รองรับ: approve · reject · delete · restore · autoRenew · autoRenewGlobal)' }, { status: 400 });
    }
    if (action !== 'autoRenewGlobal' && !id) {
      return NextResponse.json({ ok: false, error: 'ไม่ระบุสมาชิก' }, { status: 400 });
    }
    if (action === 'delete' && body?.confirm !== 'DELETE') {
      return NextResponse.json({ ok: false, error: 'ต้องยืนยันก่อนลบ (confirm: "DELETE")' }, { status: 400 });
    }

    const actorId = g.decoded?.sub || g.decoded?.id || null;
    const actorEmail = g.decoded?.email || null;

    const result = await applyMemberAction({
      id,
      action,
      autoRenew: body?.autoRenew === true,
      actorId,
      actorEmail,
      reason: typeof body?.reason === 'string' ? body.reason : undefined,
    });

    if (!result.ok) return NextResponse.json(result, { status: 400 });

    // สถานะล่าสุดหลังลงมือ — ให้ UI อัปเดตแถวได้โดยไม่ต้องเดา
    const fresh = await (async () => {
      try {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
        const { prisma } = await import('@/lib/prisma');
        const u: any = isUuid
          ? await (prisma as any).user.findUnique({ where: { id }, select: { status: true, approvedAt: true } }).catch(() => null)
          : null;
        const states = await readAdminStates([id]);
        const st = normalizeState(states.get(id) || null, u?.status);
        return { status: u?.status || null, ...st };
      } catch { return null; }
    })();

    return NextResponse.json({ ...result, member: fresh, autoRenewGlobal: await readGlobalAutoRenew() });
  } catch (error: any) {
    console.error('Admin member action error:', error);
    return NextResponse.json({ ok: false, error: error?.message || 'ทำรายการไม่สำเร็จ' }, { status: 500 });
  }
}
