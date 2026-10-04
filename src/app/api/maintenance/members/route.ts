import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * /api/maintenance/members — จัดการสมาชิก (ใช้ครั้งเดียว/เฉพาะกิจ)
 * ประตู: Authorization: Bearer $CRON_SECRET เท่านั้น
 *
 * GET  → นับจำนวน + รายชื่อ (ปิดอีเมลบางส่วน) + จำนวนข้อมูลที่ผูกอยู่  (อ่านอย่างเดียว ปลอดภัย)
 * POST → ปิดใช้งานแล้ว (405) — ห้ามลบสมาชิกแบบยกชุดผ่าน endpoint นี้
 *        ของเดิมลบ user ทุกบัญชีที่ไม่ใช่ DEFAULT_KEEP ด้วยการมี CRON_SECRET เท่านั้น
 *        และขั้นตอน "สำรองก่อนลบ" เขียนฟิลด์ title/payload ลง NotificationLog ซึ่งตารางนั้น
 *        ไม่มีฟิลด์ดังกล่าว → Prisma error ถูก .catch() กลืน → ลบสำเร็จจริงโดยไม่มีข้อมูลสำรอง
 */
const READ_ONLY_ONLY =
  'การลบสมาชิกแบบยกชุดถูกปิดในระบบจริง (กันข้อมูลเสียหาย) — ใช้การลบเป็นรายบุคคลผ่านหน้าผู้ดูแลระบบแทน';

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
    readOnly: true,
    users: rows.map(({ emailFull, ...r }) => r),
  });
}

// ลบแบบยกชุด: ปิดถาวรใน production
// (ของเดิมลบ user ทุกบัญชีที่ไม่ใช่ DEFAULT_KEEP ด้วยการมี CRON_SECRET เท่านั้น
//  และขั้นตอน "สำรองก่อนลบ" เขียนฟิลด์ title/payload ลง NotificationLog ซึ่งตารางนั้น
//  ไม่มีฟิลด์ดังกล่าว → Prisma error ถูก .catch() กลืน → ลบสำเร็จจริงโดยไม่มีข้อมูลสำรอง)
export async function POST() {
  return NextResponse.json({ ok: false, error: READ_ONLY_ONLY }, { status: 405 });
}
