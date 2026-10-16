import { NextRequest, NextResponse } from 'next/server';
import { buildQrDestination } from '@/lib/qrLinks';

// ─────────────────────────────────────────────────────────────────────────────
// GET /q/<slug> — ลิงก์สั้นสำหรับ QR (dynamic QR ของเราเอง)
//
//   https://<โดเมน>/q/contact-flyer
//        → 302 → https://<โดเมน>/contact?utm_source=qr-contact-flyer&utm_medium=offline&…
//
// ทำไมต้องมีชั้นนี้ (มาตรฐานสากล):
//   • ลาย QR ที่พิมพ์แล้วแก้ไม่ได้ — ชั้นนี้ทำให้เปลี่ยนปลายทางได้โดยไม่ต้องพิมพ์ใหม่
//   • UTM อยู่ใน redirect ไม่ได้อยู่ในลาย → ลาย QR สั้น/โปร่ง = สแกนง่าย
//   • ทุกสแกนวิ่งผ่านเส้นทางนี้ = วัดผลได้ (ดู Vercel logs) และปลายทางยังมี UTM ครบให้ระบบเก็บที่มา
//   • เป็นโดเมนของเราเอง ไม่ต้องพึ่งบริการย่อลิงก์ภายนอกที่อาจปิด/หมดอายุ
//
// ใช้ 302 (ไม่ใช่ 301) ตามแนวปฏิบัติ: 301 ถูกเบราว์เซอร์แคชถาวร → นับสแกนซ้ำจะหาย
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const dest = buildQrDestination(slug, req.nextUrl.searchParams);

  const res = NextResponse.redirect(dest, 302);
  res.headers.set('Cache-Control', 'no-store, max-age=0');
  res.headers.set('X-Robots-Tag', 'noindex');
  return res;
}

// HEAD (curl -I, ตัวตรวจลาย QR บางตัว) ให้ผลเหมือน GET
export const HEAD = GET;
