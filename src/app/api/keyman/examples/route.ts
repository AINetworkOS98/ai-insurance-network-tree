import { NextRequest, NextResponse } from 'next/server';
import { KEYMAN_EXAMPLES } from '@/lib/keymanExamples';

/**
 * ตัวอย่างบริษัทกำไรต่อเนื่อง 3 ปี — ต้องล็อกอินเท่านั้น
 * middleware บังคับ token ให้ทุก /api/* ที่ไม่อยู่ใน PUBLIC_API อยู่แล้ว
 * คืนเฉพาะข้อมูลนิติบุคคล: ชื่อ/เลขทะเบียน/จังหวัด/ประเภทธุรกิจ/กำไร 3 ปี
 * ไม่มีชื่อบุคคล อีเมล เบอร์โทร หรือเลขบัตรใด ๆ (PDPA / Data Minimization)
 */
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const rawOffset = Number(sp.get('offset') ?? 0);
  const rawLimit = Number(sp.get('limit') ?? 10);
  const offset = Number.isFinite(rawOffset) ? Math.max(0, Math.floor(rawOffset)) : 0;
  const limit = Number.isFinite(rawLimit) ? Math.min(200, Math.max(1, Math.floor(rawLimit))) : 10;

  const total = KEYMAN_EXAMPLES.length;
  const rows = KEYMAN_EXAMPLES.slice(offset, offset + limit).map((c, i) => ({
    i: offset + i + 1,
    n: c.n,
    r: c.r,
    p: c.p,
    b: c.b,
    y66: c.y66,
    y67: c.y67,
    y68: c.y68,
  }));

  return NextResponse.json({ ok: true, total, offset, limit, rows }, {
    headers: { 'Cache-Control': 'private, no-store' },
  });
}
