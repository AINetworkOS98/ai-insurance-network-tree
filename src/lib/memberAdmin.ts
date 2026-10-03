// memberAdmin.ts — กติกากลางของการจัดการสมาชิกฝั่งผู้ดูแล (สเปค: อนุมัติ/ไม่อนุมัติ · ลบออก/คืนค่า · ต่ออายุอัตโนมัติ)
//
// แหล่งความจริง: ตาราง User (Postgres) = ทะเบียนสมาชิกจริง + สถานะตาม enum UserStatus
// ที่เก็บเพิ่มเติม: Firestore collection `memberAdminState` (doc id = User.id) สำหรับธงที่สคีมาไม่มีคอลัมน์
//   { adminStatus: 'pending'|'approved'|'rejected', deleted, deletedAt, deletedFromStatus, autoRenew, autoRenewAt }
//   และ doc `system` = { autoRenewGlobal } (สวิตช์ทั้งระบบ)
// เหตุที่ไม่เพิ่มคอลัมน์ใน Postgres: build บน Vercel รันแค่ `prisma generate` ไม่รัน migrate
// (คอมมิต migration แล้วก็ไม่ถูกใช้) — ธงผู้ดูแลจึงเก็บฝั่ง Firestore และ mirror สถานะกลับตาราง User เสมอ
//
// ทุกฟังก์ชันเป็น best-effort ต่อ Firestore: ถ้า Firestore ใช้ไม่ได้ (credential ขาด/ถูกปิด)
// การเปลี่ยนสถานะใน Postgres ต้องยังสำเร็จ — ห้ามให้ทั้ง endpoint เป็น 500

import { prisma } from '@/lib/prisma';
import { isAdminEmail, isSystemAdmin } from '@/lib/admin';

export type MemberAction = 'approve' | 'reject' | 'delete' | 'restore' | 'autoRenew' | 'autoRenewGlobal' | 'previewRenewal' | 'runRenewal';

export const ADMIN_STATE_COLLECTION = 'memberAdminState';
export const GLOBAL_STATE_DOC = 'system';

/** สถานะสำหรับแสดงผล: pending (รออนุมัติ) · approved (อนุมัติแล้ว) · rejected (ไม่อนุมัติ) · deleted (ลบออกแล้ว) */
export type AdminStatus = 'pending' | 'approved' | 'rejected' | 'deleted';

export interface MemberAdminState {
  adminStatus: AdminStatus;
  deleted: boolean;
  deletedAt?: string | null;
  deletedFromStatus?: string | null;
  autoRenew: boolean;
  /** true = ผู้ดูแลตั้งค่าต่ออายุรายคนไว้เอง · false = ยังไม่ตั้ง ใช้ค่าสวิตช์ทั้งระบบ */
  autoRenewSet?: boolean;
  autoRenewAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string) { return UUID_RE.test(String(v || '')); }

async function fdb() { const { getDb } = await import('@/lib/firebase-admin'); return getDb(); }

function emptyState(): MemberAdminState {
  return { adminStatus: 'pending', deleted: false, autoRenew: false };
}

/** แปลงข้อมูลดิบจาก Firestore/Postgres เป็นสถานะผู้ดูแลที่ใช้แสดงผลได้ */
export function normalizeState(raw: any, fallbackStatus?: string): MemberAdminState {
  const s: MemberAdminState = { ...emptyState(), ...(raw || {}) };
  s.autoRenewSet = !!(raw && Object.prototype.hasOwnProperty.call(raw, 'autoRenew'));
  const userStatus = String(fallbackStatus || '').toUpperCase();
  if (s.deleted) { s.adminStatus = 'deleted'; return s; }
  if (raw?.adminStatus) {
    s.adminStatus = raw.adminStatus as AdminStatus;
    return s;
  }
  // ไม่มีบันทึกฝั่งผู้ดูแล → อนุมานจากสถานะจริงในตาราง User
  if (userStatus === 'ACTIVE') s.adminStatus = 'approved';
  else if (userStatus === 'INACTIVE' || userStatus === 'SUSPENDED' || userStatus === 'RESIGNED') s.adminStatus = 'rejected';
  else s.adminStatus = 'pending';
  return s;
}

/** อ่านธงผู้ดูแลของสมาชิกหลายคนพร้อมกัน (คืน Map: id → state) */
export async function readAdminStates(ids: string[]): Promise<Map<string, any>> {
  const map = new Map<string, any>();
  const clean = Array.from(new Set(ids.filter((i) => i && isUuid(i)))).slice(0, 300);
  if (!clean.length) return map;
  try {
    const db = await fdb();
    const docs = await db.getAll(...clean.map((id) => db.collection(ADMIN_STATE_COLLECTION).doc(id)));
    docs.forEach((d: any) => { if (d.exists) map.set(d.id, d.data()); });
  } catch (e: any) {
    console.warn('[memberAdmin] read states skipped:', e?.message);
  }
  return map;
}

export async function readAdminState(id: string): Promise<any> {
  const m = await readAdminStates([id]);
  return m.get(id) || null;
}

async function writeAdminState(id: string, patch: Record<string, any>) {
  try {
    const db = await fdb();
    await db.collection(ADMIN_STATE_COLLECTION).doc(id).set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true });
    return true;
  } catch (e: any) {
    console.warn('[memberAdmin] write state skipped:', e?.message);
    return false;
  }
}

/** เขียนธงผู้ดูแลบางฟิลด์ (ใช้ร่วมกับเครื่องยนต์ต่ออายุอัตโนมัติ) */
export async function writeAdminStatePatch(id: string, patch: Record<string, any>) {
  return writeAdminState(id, patch);
}

/** สวิตช์ต่ออายุอัตโนมัติทั้งระบบ (เก็บที่ doc `system`) */
export async function readGlobalAutoRenew(): Promise<boolean> {
  try {
    const db = await fdb();
    const d = await db.collection(ADMIN_STATE_COLLECTION).doc(GLOBAL_STATE_DOC).get();
    return d.exists ? d.data()?.autoRenewGlobal === true : false;
  } catch { return false; }
}

async function writeGlobalAutoRenew(on: boolean, actor?: string | null) {
  try {
    const db = await fdb();
    await db.collection(ADMIN_STATE_COLLECTION).doc(GLOBAL_STATE_DOC).set(
      { autoRenewGlobal: on, updatedBy: actor || null, updatedAt: new Date().toISOString() },
      { merge: true },
    );
    return true;
  } catch (e: any) {
    console.warn('[memberAdmin] global toggle skipped:', e?.message);
    return false;
  }
}

/** เขียน per-doc ให้สมาชิกทุกคน (เก็บไว้ใช้เมื่อต้องการบังคับทั้งระบบแบบทับค่าตัวเอง) — batch ละ 400 */
export async function writeAllAutoRenew(ids: string[], on: boolean, actor?: string | null) {
  const clean = Array.from(new Set(ids.filter((i) => i && isUuid(i))));
  try {
    const db = await fdb();
    for (let i = 0; i < clean.length; i += 400) {
      const batch = db.batch();
      for (const id of clean.slice(i, i + 400)) {
        batch.set(db.collection(ADMIN_STATE_COLLECTION).doc(id),
          { autoRenew: on, autoRenewAt: new Date().toISOString(), updatedBy: actor || null, updatedAt: new Date().toISOString() },
          { merge: true });
      }
      await batch.commit();
    }
    return clean.length;
  } catch (e: any) {
    console.warn('[memberAdmin] bulk autoRenew skipped:', e?.message);
    return 0;
  }
}

async function audit(actorId: string | null | undefined, action: string, entityId: string, oldValue: any, newValue: any, reason?: string) {
  const actor = isUuid(String(actorId || '')) ? String(actorId) : null;
  const payload: any = {
    action,
    entity: 'User',
    entityId,
    oldValue: oldValue ?? undefined,
    newValue: newValue ?? undefined,
    reason: reason || null,
  };
  try {
    await (prisma as any).auditLog.create({ data: { userId: actor, ...payload } });
  } catch (e: any) {
    // FK userId ล้มได้เมื่อผู้ลงมือไม่ใช่แถวในตาราง User (เช่นโทเคนผู้ดูแลที่ไม่มีบัญชีจริง)
    // บันทึกแบบไม่ผูกผู้ใช้แทน — ห้ามให้ประวัติการแก้ไขหายเงียบ ๆ
    try {
      await (prisma as any).auditLog.create({ data: { userId: null, ...payload, newValue: { ...(newValue || {}), actorId: actor || actorId || null } } });
    } catch (e2: any) {
      console.error('[memberAdmin] audit failed:', e2?.message || e2);
    }
  }
}

async function history(userId: string, fromStatus: string | null, toStatus: string, changedBy: string | null, reason: string) {
  try {
    await (prisma as any).membershipStatusHistory.create({
      data: { userId, fromStatus, toStatus, changedBy: isUuid(String(changedBy || '')) ? changedBy : null, reason },
    });
  } catch (e: any) {
    console.warn('[memberAdmin] history skipped:', e?.message);
  }
}

export interface ActionInput {
  id: string;
  action: MemberAction;
  autoRenew?: boolean;
  actorId?: string | null;
  actorEmail?: string | null;
  reason?: string;
}

export interface ActionResult {
  ok: boolean;
  error?: string;
  action?: MemberAction;
  adminStatus?: AdminStatus;
  status?: string | null;
  deleted?: boolean;
  autoRenew?: boolean;
  autoRenewGlobal?: boolean;
  affected?: number;
  stateStored?: boolean;
  note?: string;
}

/** ลงมือตามคำสั่งผู้ดูแล — คืนค่าที่เกิดขึ้นจริงให้ UI แสดงผลได้ทันที */
export async function applyMemberAction(input: ActionInput): Promise<ActionResult> {
  const { id, action, actorId, actorEmail } = input;

  // ── สวิตช์ทั้งระบบ = "ค่าเริ่มต้น" ของทุกคน ไม่ทับค่าที่ตั้งรายคน ──────────────
  // กติกา: สมาชิกที่ยังไม่ตั้งรายคน → ใช้ค่าทั้งระบบ · สมาชิกที่ตั้งไว้เอง (เปิด/ปิด) → ใช้ค่าตัวเอง
  // จึงไม่เขียนทับเอกสารรายคนเลย เพื่อไม่ให้คำสั่ง "ปิดทั้งระบบ" ไปทับchoice ของสมาชิกแต่ละคนเงียบ ๆ
  if (action === 'autoRenewGlobal') {
    const on = input.autoRenew === true;
    const stored = await writeGlobalAutoRenew(on, actorEmail || actorId);
    const users: any[] = await (prisma as any).user.findMany({ select: { id: true } }).catch(() => []);
    const states = await readAdminStates(users.map((u: any) => u.id));
    const governed = users.filter((u: any) => !Object.prototype.hasOwnProperty.call(states.get(u.id) || {}, 'autoRenew')).length;
    await audit(actorId, on ? 'member.auto_renew_global_on' : 'member.auto_renew_global_off', GLOBAL_STATE_DOC, null, { autoRenewGlobal: on, governed }, input.reason);
    return { ok: true, action, autoRenewGlobal: on, affected: governed, stateStored: stored };
  }

  if (!id) return { ok: false, error: 'ไม่ระบุสมาชิก' };

  const user: any = isUuid(id)
    ? await (prisma as any).user.findUnique({ where: { id }, select: { id: true, status: true, email: true, memberCode: true } }).catch(() => null)
    : null;
  const prevState = (await readAdminState(id)) || {};
  const prevStatus = String(user?.status || prevState.adminStatus || 'PENDING').toUpperCase();

  // ── สมาชิกในทะเบียนจริงเท่านั้นที่เปลี่ยนสถานะได้ ────────────────
  if (!user && action !== 'autoRenew') {
    return { ok: false, error: 'ไม่พบสมาชิกคนนี้ในทะเบียนจริง (Postgres) — จัดการได้เฉพาะสมาชิกที่มีบัญชีในระบบ' };
  }

  // ── กันการล็อกตัวเองออกจากระบบ (เคสจริง: ลบทั้งเครือข่ายรวมบัญชีผู้ดูแลตัวเอง) ──
  // บัญชีผู้ดูแล/ผู้มีสิทธิ์ system.manage และสมาชิกที่ใช้งานได้คนสุดท้าย ลบหรือระงับไม่ได้
  if (user && (action === 'delete' || action === 'reject')) {
    if (isAdminEmail(user.email)) {
      return { ok: false, error: 'บัญชีผู้ดูแลระบบลบ/ระงับไม่ได้ — กันการล็อกตัวเองออกจากระบบ' };
    }
    const adm = await isSystemAdmin(id).catch(() => ({ ok: false }));
    if (adm.ok) {
      return { ok: false, error: 'บัญชีนี้มีสิทธิ์ผู้ดูแลระบบ (super_admin/admin) — ลบ/ระงับไม่ได้' };
    }
    if (String(user.status) === 'ACTIVE') {
      const activeCount = await prisma.user.count({ where: { status: 'ACTIVE' } }).catch(() => 0);
      if (activeCount <= 1) {
        return { ok: false, error: 'เหลือสมาชิกที่ใช้งานได้คนสุดท้าย — ลบไม่ได้ (ระบบจะไม่เหลือคนเข้าใช้งาน)' };
      }
    }
  }

  const nowIso = new Date().toISOString();
  const actor = actorEmail || actorId || null;

  const setUserStatus = async (to: 'ACTIVE' | 'PENDING' | 'INACTIVE' | 'RESIGNED' | 'SUSPENDED', extra: any = {}) => {
    if (!user) return;
    await (prisma as any).user.update({ where: { id }, data: { status: to, ...extra } });
  };

  switch (action) {
    case 'approve': {
      await setUserStatus('ACTIVE', { approvedAt: new Date() });
      await writeAdminState(id, { adminStatus: 'approved', approvedAt: nowIso, rejectedAt: null, deleted: false, deletedAt: null, updatedBy: actor });
      await history(id, prevStatus, 'ACTIVE', actorId || null, input.reason || 'ผู้ดูแลอนุมัติสมาชิก');
      await audit(actorId, 'member.approve', id, { status: prevStatus }, { status: 'ACTIVE' }, input.reason);
      return { ok: true, action, adminStatus: 'approved', status: 'ACTIVE', deleted: false };
    }

    case 'reject': {
      await setUserStatus('INACTIVE');
      await writeAdminState(id, { adminStatus: 'rejected', rejectedAt: nowIso, approvedAt: null, deleted: false, deletedAt: null, updatedBy: actor });
      await history(id, prevStatus, 'INACTIVE', actorId || null, input.reason || 'ผู้ดูแลไม่อนุมัติสมาชิก');
      await audit(actorId, 'member.reject', id, { status: prevStatus }, { status: 'INACTIVE' }, input.reason);
      return { ok: true, action, adminStatus: 'rejected', status: 'INACTIVE', deleted: false };
    }

    case 'delete': {
      // ลบออก = ซ่อนจากทะเบียนที่ใช้งาน (soft delete) — ไม่ลบแถวจริง เพื่อคืนค่าได้และไม่ทำลายประวัติ
      await setUserStatus('RESIGNED');
      await writeAdminState(id, { adminStatus: 'deleted', deleted: true, deletedAt: nowIso, deletedFromStatus: prevStatus, updatedBy: actor });
      await history(id, prevStatus, 'RESIGNED', actorId || null, input.reason || 'ผู้ดูแลลบสมาชิกออกจากระบบ (คืนค่าได้)');
      await audit(actorId, 'member.delete', id, { status: prevStatus }, { status: 'RESIGNED', softDelete: true }, input.reason);
      return { ok: true, action, adminStatus: 'deleted', status: 'RESIGNED', deleted: true, note: 'ลบแบบซ่อน (soft delete) — กดคืนค่าได้ทุกเมื่อ' };
    }

    case 'restore': {
      const back = String(prevState.deletedFromStatus || 'ACTIVE').toUpperCase();
      const to = (['ACTIVE', 'PENDING', 'INACTIVE', 'SUSPENDED'].includes(back) ? back : 'ACTIVE') as any;
      await setUserStatus(to);
      await writeAdminState(id, { deleted: false, deletedAt: null, adminStatus: to === 'ACTIVE' ? 'approved' : 'pending', updatedBy: actor });
      await history(id, prevStatus, to, actorId || null, input.reason || 'ผู้ดูแลคืนค่าสมาชิกกลับเข้าระบบ');
      await audit(actorId, 'member.restore', id, { status: prevStatus, deleted: true }, { status: to, deleted: false }, input.reason);
      return { ok: true, action, adminStatus: to === 'ACTIVE' ? 'approved' : 'pending', status: to, deleted: false };
    }

    case 'autoRenew': {
      const on = input.autoRenew === true;
      const stored = await writeAdminState(id, {
        autoRenew: on,
        autoRenewAt: on ? nowIso : null,
        updatedBy: actor,
      });
      await audit(actorId, on ? 'member.auto_renew_on' : 'member.auto_renew_off', id, { autoRenew: !!prevState.autoRenew }, { autoRenew: on }, input.reason);
      return { ok: true, action, autoRenew: on, stateStored: stored, status: prevStatus };
    }

    default:
      return { ok: false, error: 'ไม่รู้จักคำสั่งนี้' };
  }
}
