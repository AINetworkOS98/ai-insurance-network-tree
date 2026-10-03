import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/members/count — ตัวเลขสรุปจำนวนสมาชิก (สาธารณะ)
 * ใช้แสดงบนแถบล่างของทุกหน้า "ตลอดเวลา" — คืนแค่ตัวเลข ไม่มีข้อมูลส่วนบุคคล
 */
export async function GET() {
  try {
    // สมาชิกที่ "ลบออกแล้ว" (soft delete → status = RESIGNED) ต้องไม่ถูกนับเป็นสมาชิกของระบบ
    // ไม่งั้นกดลบแล้วตัวเลขบนแดชบอร์ด/แถบล่างจะไม่ลด (ดูเหมือนลบไม่สำเร็จ)
    const [total, active, withRank, deleted] = await Promise.all([
      prisma.user.count({ where: { status: { notIn: ['RESIGNED'] } } }),
      prisma.user.count({ where: { status: 'ACTIVE' } }).catch(() => 0),
      prisma.user.count({ where: { status: { notIn: ['RESIGNED'] }, rankLevel: { gte: 1 } } }).catch(() => 0),
      prisma.user.count({ where: { status: 'RESIGNED' } }).catch(() => 0),
    ]);
    return NextResponse.json({ ok: true, total, active, withRank, deleted, at: new Date().toISOString() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
