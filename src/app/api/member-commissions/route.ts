import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { verifyTokenEdge } from '@/lib/auth-edge';

/**
 * ค่าคอมมิชชันสะสมรายสมาชิก — ใช้กับปุ่ม "เฉพาะตัวแทนที่มีผล" ในหน้า /members
 * • เส้นทางนี้ตั้งใจให้อยู่นอก prefix /api/members (ซึ่ง middleware ประกาศเป็นสาธารณะ)
 * • ตรวจ session ใน route เองอีกชั้น (Defense in Depth) — ไม่พึ่ง middleware อย่างเดียว
 * • นับเฉพาะรายการที่ยังมีผล (ตัด REJECTED / REVERSED) จาก IncomeTransaction.netAmount
 * • PDPA: คืนเฉพาะ userId + ยอดรวม (ตัวเลขเงิน) ไม่มีชื่อ/อีเมล/เบอร์/ข้อมูลอ่อนไหว
 */
export const dynamic = 'force-dynamic';

async function sessionPayload(req: NextRequest) {
  const auth = req.headers.get('authorization') || '';
  let token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) {
    const c = await cookies();
    token = c.get('token')?.value || c.get('auth_token')?.value || '';
  }
  if (!token) return null;
  try {
    return await verifyTokenEdge(token);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const payload = await sessionPayload(req);
  if (!payload) {
    return NextResponse.json(
      { ok: false, error: 'กรุณาเข้าสู่ระบบ', errorEn: 'Unauthorized' },
      { status: 401, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }

  try {
    const rows = await prisma.incomeTransaction.groupBy({
      by: ['userId'],
      where: { status: { notIn: ['REJECTED', 'REVERSED'] } },
      _sum: { netAmount: true },
    });

    const map: Record<string, number> = {};
    let total = 0;
    for (const r of rows as Array<{ userId: string; _sum: { netAmount: unknown } }>) {
      const v = Number(r._sum?.netAmount ?? 0);
      if (!Number.isFinite(v)) continue;
      map[r.userId] = v;
      total += v;
    }

    return NextResponse.json(
      { ok: true, count: Object.keys(map).length, total, map },
      { headers: { 'Cache-Control': 'private, no-store' } }
    );
  } catch {
    // ฐานข้อมูลยังไม่มีตาราง/สิทธิ์ — คืน map ว่างเพื่อให้หน้าเว็บทำงานต่อได้ (ไม่ทำให้หน้าพัง)
    return NextResponse.json(
      { ok: false, error: 'อ่านข้อมูลค่าคอมมิชชันไม่สำเร็จ', count: 0, total: 0, map: {} },
      { status: 200, headers: { 'Cache-Control': 'private, no-store' } }
    );
  }
}
