import { NextRequest, NextResponse } from 'next/server';
import { searchAddress, resolvePostal, resolveDistrict, districtsOf, autoFillFromQuery, THAI_PROVINCES } from '@/lib/thaiAddress';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/address/lookup — ค้นหาที่อยู่ไทย (สาธารณะ ไม่ต้องล็อกอิน)
//   ?q=10900            → อำเภอ/เขต + จังหวัด ที่ใช้รหัสไปรษณีย์นั้น (+ auto = ค่าที่ควรเติม)
//   ?q=จตุจักร          → อำเภอที่ชื่อตรง/ใกล้เคียง พร้อมรหัสไปรษณีย์
//   ?q=เชียงใหม่        → รายการในจังหวัดนั้น
//   ?by=provinces       → รายชื่อจังหวัดทั้งหมด (77)
//   ?by=districts&q=<จังหวัด> → อำเภอทั้งหมดของจังหวัด
// ใช้เอนจินเดียวกับฟอร์ม /recruit (src/lib/thaiAddress.ts) — ข้อมูลฝังในโค้ด ไม่พึ่ง API ภายนอก
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q = (sp.get('q') || '').trim();
  const by = (sp.get('by') || '').trim();

  if (by === 'provinces') {
    return NextResponse.json({ ok: true, count: THAI_PROVINCES.length, provinces: THAI_PROVINCES });
  }
  if (by === 'districts') {
    if (!q) return NextResponse.json({ ok: false, error: 'ต้องส่ง ?by=districts&q=<ชื่อจังหวัด>' }, { status: 400 });
    const districts = districtsOf(q);
    return NextResponse.json({ ok: true, province: q, count: districts.length, districts });
  }
  if (!q) {
    return NextResponse.json(
      { ok: false, error: 'ต้องส่ง ?q= (รหัสไปรษณีย์ / ชื่ออำเภอ / ชื่อจังหวัด) — ดูทั้งหมดที่ ?by=provinces' },
      { status: 400 },
    );
  }

  const limit = Math.min(20, Math.max(1, Number(sp.get('limit') || 8) || 8));
  const hits = searchAddress(q, limit);
  const auto = autoFillFromQuery(q, {});
  return NextResponse.json({
    ok: true,
    q,
    count: hits.length,
    hits,
    /** ค่าที่ระบบจะเติมให้ทันที (ว่าง = ต้องให้ผู้ใช้เลือกจาก hits) */
    auto: { province: auto.province ?? null, district: auto.district ?? null, postalCode: auto.postalCode ?? null },
    exact: { postal: resolvePostal(q).length, district: resolveDistrict(q).length },
  });
}
