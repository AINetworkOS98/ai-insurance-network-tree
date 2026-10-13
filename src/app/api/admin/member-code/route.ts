import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, payloadUserId } from '@/lib/auth';
import { isAdminFromPayload } from '@/lib/admin';
import { ensureMemberCodes } from '@/lib/referral';

export const dynamic = 'force-dynamic';

/**
 * /api/admin/member-code — ลบ/คืนค่า "รหัสสมาชิก" (memberCode) ของสมาชิก
 *
 * คำสั่งเจ้าของระบบ (13 ต.ค. 2026): หน้า /income ต้องมีปุ่มลบรหัสสมาชิก และ "ผู้ดูแลระบบเท่านั้น" ที่ลบได้
 *
 * หลักการ:
 *  1) ตรวจสิทธิ์ที่เซิร์ฟเวอร์ทุกครั้ง — ผู้ใช้ทั่วไปได้ 403 แม้จะยิงตรงเข้ามา (ไม่ใช่แค่ซ่อนปุ่ม)
 *  2) ต้องยืนยันด้วยข้อความ 'DELETE' ทุกครั้ง + ปุ่มฝั่งหน้าเว็บมี window.confirm
 *  3) ลบ = ตั้ง memberCode เป็น null + บันทึก AuditLog (action member.code_delete) → ใช้ AuditLog เป็น "ตราประทับ"
 *     เพื่อไม่ให้ ensureMemberCodes สร้างรหัสใหม่ให้เองอัตโนมัติ (ไม่งั้นลบแล้วรหัสจะงอกกลับ)
 *  4) คืนค่า = ลบตราประทับ + สร้างรหัสใหม่ (AuditLog member.code_restore) — ไม่แตะรหัสแนะนำ (referralCode) ของผู้ใช้
 */

const MEMBER_CODE_DELETE_ACTION = 'member.code_delete';
const MEMBER_CODE_RESTORE_ACTION = 'member.code_restore';

async function guard(req: NextRequest) {
  const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!token) return { error: NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 }) };
  const decoded: any = verifyToken(token);
  if (!decoded) return { error: NextResponse.json({ ok: false, error: 'เซสชันหมดอายุ' }, { status: 401 }) };
  const isAdmin = await isAdminFromPayload(decoded);
  if (!isAdmin) return { error: NextResponse.json({ ok: false, adminOnly: true, error: 'เฉพาะผู้ดูแลระบบเท่านั้นที่ลบรหัสสมาชิกได้' }, { status: 403 }) };
  return { decoded };
}

/** GET — ให้หน้าจอรู้ว่าใครถูกลบรหัสไปแล้ว (ผู้ดูแลเท่านั้น) */
export async function GET(req: NextRequest) {
  const g = await guard(req);
  if (g.error) return g.error;
  try {
    const logs = await prisma.auditLog.findMany({
      where: { action: { in: [MEMBER_CODE_DELETE_ACTION, MEMBER_CODE_RESTORE_ACTION] }, entity: 'User' },
      select: { action: true, entityId: true, createdAt: true, oldValue: true },
      orderBy: { createdAt: 'asc' },
    });
    // นับครั้งสุดท้ายต่อผู้ใช้ — delete = ถูกลบ, restore = คืนค่าแล้ว
    const last = new Map<string, { deleted: boolean; at: string; code?: string }>();
    for (const l of logs) {
      const id = String(l.entityId || '');
      if (!id) continue;
      last.set(id, { deleted: l.action === MEMBER_CODE_DELETE_ACTION, at: l.createdAt.toISOString(), code: (l.oldValue as any)?.memberCode || undefined });
    }
    const revoked = [...last.entries()].filter(([, v]) => v.deleted).map(([userId, v]) => ({ userId, at: v.at, memberCode: v.code || null }));
    return NextResponse.json({ ok: true, revoked, count: revoked.length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

/** POST — { action:'delete'|'restore', userId | memberCode, confirm:'DELETE', reason? } (ผู้ดูแลเท่านั้น) */
export async function POST(req: NextRequest) {
  const g = await guard(req);
  if (g.error) return g.error;
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '').trim();
    if (!['delete', 'restore'].includes(action)) return NextResponse.json({ ok: false, error: 'action ต้องเป็น delete หรือ restore' }, { status: 400 });
    if (String(body.confirm || '') !== 'DELETE') return NextResponse.json({ ok: false, error: 'ต้องยืนยันด้วยข้อความ DELETE' }, { status: 400 });

    const userId = payloadUserId({ sub: body.userId }) || (String(body.userId || '').length === 36 ? String(body.userId) : null);
    let user = userId
      ? await prisma.user.findUnique({ where: { id: userId }, select: { id: true, memberCode: true, referralCode: true, firstName: true, lastName: true, email: true } })
      : null;
    if (!user && body.memberCode) {
      user = await prisma.user.findFirst({
        where: { memberCode: String(body.memberCode).trim() },
        select: { id: true, memberCode: true, referralCode: true, firstName: true, lastName: true, email: true },
      });
    }
    if (!user) return NextResponse.json({ ok: false, error: 'ไม่พบสมาชิกที่ระบุ' }, { status: 404 });

    const adminId = payloadUserId(g.decoded as any);
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;

    if (action === 'delete') {
      if (!user.memberCode) return NextResponse.json({ ok: false, error: 'สมาชิกคนนี้ไม่มีรหัสสมาชิกอยู่แล้ว' }, { status: 400 });
      const removed = String(user.memberCode);
      await prisma.user.update({ where: { id: user.id }, data: { memberCode: null } });
      await prisma.auditLog.create({
        data: {
          userId: adminId || undefined,
          action: MEMBER_CODE_DELETE_ACTION,
          entity: 'User',
          entityId: user.id,
          oldValue: { memberCode: removed } as any,
          reason: String(body.reason || 'ลบรหัสสมาชิกจากหน้า /income (ผู้ดูแลระบบ)'),
          ip: ip || undefined,
        },
      }).catch(() => null);
      return NextResponse.json({ ok: true, action: 'delete', userId: user.id, memberCode: removed, memberName: `${user.firstName} ${user.lastName}`.trim(), at: new Date().toISOString() }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // restore — ลบตราประทับ แล้วให้ระบบออกรหัสใหม่
    const del = await prisma.auditLog.deleteMany({ where: { action: MEMBER_CODE_DELETE_ACTION, entity: 'User', entityId: user.id } });
    const filled = await ensureMemberCodes(prisma, user.id);
    await prisma.auditLog.create({
      data: {
        userId: adminId || undefined,
        action: MEMBER_CODE_RESTORE_ACTION,
        entity: 'User',
        entityId: user.id,
        newValue: { memberCode: (filled as any)?.memberCode || null } as any,
        reason: String(body.reason || 'คืนรหัสสมาชิกจากหน้า /income (ผู้ดูแลระบบ)'),
        ip: ip || undefined,
      },
    }).catch(() => null);
    return NextResponse.json({ ok: true, action: 'restore', userId: user.id, removedTombstones: del.count, memberCode: (filled as any)?.memberCode || null }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
