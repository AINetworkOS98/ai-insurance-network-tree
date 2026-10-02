import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * /api/maintenance/members — จัดการสมาชิก (ใช้ครั้งเดียว/เฉพาะกิจ)
 * ประตู: Authorization: Bearer $CRON_SECRET เท่านั้น
 *
 * GET  → นับจำนวน + รายชื่อ (ปิดอีเมลบางส่วน) + จำนวนข้อมูลที่ผูกอยู่  (อ่านอย่างเดียว ปลอดภัย)
 * POST → ลบสมาชิกทั้งหมด "ยกเว้น" อีเมลที่กำหนด
 *        บังคับ ?confirm=DELETE-OTHERS  (กันกดพลาด)
 *        สำรองข้อมูลทุกแถวที่จะลบลง NotificationLog ก่อนลบ (กู้คืนได้) แล้วค่อยลบ
 */
const DEFAULT_KEEP = 'akarapol.pro798@gmail.com';

function allowed(req: NextRequest) {
  const secret = process.env.CRON_SECRET || '';
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return secret.length > 0 && got === secret;
}

const mask = (e: string | null | undefined) => {
  const s = String(e || '');
  const [u, d] = s.split('@');
  if (!d) return s.slice(0, 2) + '***';
  return `${(u || '').slice(0, 2)}***@${d}`;
};

async function inventory() {
  const db = prisma as any;
  const users: any[] = await db.user.findMany({
    select: { id: true, email: true, displayName: true, firstName: true, lastName: true, status: true, createdAt: true },
    orderBy: { createdAt: 'asc' },
  });
  const rows: any[] = [];
  // นับแบบทนพลาด: ถ้าชื่อโมเดลต่างไปจากที่คาด จะได้ -1 ไม่ทำให้ทั้ง endpoint ล้ม
  const c = async (fn: () => any) => { try { return await fn(); } catch { return -1; } };
  for (const u of users) {
    const [sessions, consents, memberships, commissions, prospectsOwned, outbox] = await Promise.all([
      c(() => db.userSession.count({ where: { userId: u.id } })),
      c(() => db.consentRecord.count({ where: { userId: u.id } })),
      c(() => db.member.count({ where: { userId: u.id } })),
      c(() => db.commission.count({ where: { userId: u.id } })),
      c(() => db.prospect.count({ where: { userId: u.id } })),
      c(() => db.eventOutbox.count({ where: { userId: u.id } })),
    ]);
    rows.push({
      email: mask(u.email),
      emailFull: u.email,
      name: [u.displayName, `${u.firstName || ''} ${u.lastName || ''}`.trim()].filter(Boolean)[0] || null,
      status: u.status,
      createdAt: u.createdAt,
      related: { sessions, consents, memberships, commissions, prospects: prospectsOwned, outbox },
    });
  }
  return rows;
}

export async function GET(req: NextRequest) {
  if (!allowed(req)) return NextResponse.json({ ok: false, error: 'ต้องมีสิทธิ์ (Bearer CRON_SECRET)' }, { status: 401 });
  const rows = await inventory();
  return NextResponse.json({
    ok: true,
    totalUsers: rows.length,
    willKeep: DEFAULT_KEEP,
    willDeleteCount: rows.filter((r) => r.emailFull !== DEFAULT_KEEP).length,
    users: rows.map(({ emailFull, ...r }) => r),
  });
}

export async function POST(req: NextRequest) {
  if (!allowed(req)) return NextResponse.json({ ok: false, error: 'ต้องมีสิทธิ์ (Bearer CRON_SECRET)' }, { status: 401 });
  const url = new URL(req.url);
  if (url.searchParams.get('confirm') !== 'DELETE-OTHERS') {
    return NextResponse.json({ ok: false, error: 'ต้องระบุ ?confirm=DELETE-OTHERS' }, { status: 400 });
  }
  const db = prisma as any;

  // 0) ต้องมีผู้ใช้ที่เก็บไว้จริง (กันลบหมดเกลี้ยง)
  const keep = DEFAULT_KEEP;
  const keeper = await db.user.findUnique({ where: { email: keep }, select: { id: true, email: true } }).catch(() => null);
  if (!keeper) return NextResponse.json({ ok: false, error: `ไม่พบบัญชีที่จะเก็บไว้: ${keep} — ยกเลิกเพื่อความปลอดภัย` }, { status: 409 });

  // 1) สำรองข้อมูลผู้ใช้ที่จะลบ (กู้คืนได้)
  const full = await db.user.findMany({ where: { email: { not: keep } } });
  const backupMeta = await db.notificationLog.create({
    data: {
      type: 'maintenance.members_backup',
      channel: 'system',
      status: 'SENT',
      title: `สำรองข้อมูลสมาชิกก่อนลบ (${full.length} บัญชี)`,
      payload: { kept: keep, users: full, at: new Date().toISOString() } as any,
    },
    select: { id: true, createdAt: true },
  }).catch((e: any) => ({ id: null, error: String(e?.message || e).slice(0, 160) }));

  // 2) ลบ (relation ที่ผูกอยู่จะถูกจัดการตาม onDelete ของสคีมา)
  const before = await db.user.count();
  const del = await db.user.deleteMany({ where: { email: { not: keep } } });
  const after = await db.user.count();
  const remaining = await db.user.findMany({ select: { email: true, status: true } });

  return NextResponse.json({
    ok: true,
    backupLogId: (backupMeta as any).id,
    backupRows: full.length,
    deletedCount: del.count,
    usersBefore: before,
    usersAfter: after,
    remaining: remaining.map((r: any) => ({ email: mask(r.email), status: r.status })),
    note: 'ข้อมูลสำรองอยู่ใน NotificationLog (type=maintenance.members_backup) กู้คืนได้จากที่นั่น',
  });
}
