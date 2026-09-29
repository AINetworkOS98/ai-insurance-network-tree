import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/members/count — ตัวเลขสรุปจำนวนสมาชิก (สาธารณะ)
 * ใช้แสดงบนแถบล่างของทุกหน้า "ตลอดเวลา" — คืนแค่ตัวเลข ไม่มีข้อมูลส่วนบุคคล
 */
export async function GET() {
  try {
    const [total, active, withRank] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { status: 'ACTIVE' } }).catch(() => 0),
      prisma.user.count({ where: { rankLevel: { gte: 1 } } }).catch(() => 0),
    ]);
    return NextResponse.json({ ok: true, total, active, withRank, at: new Date().toISOString() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
