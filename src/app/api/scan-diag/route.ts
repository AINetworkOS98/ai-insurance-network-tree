import { NextResponse } from 'next/server';

// วินิจฉัยการสแกนใบเสร็จจากฝั่งเครื่องผู้ใช้ — เขียนลง runtime log ของ Vercel เท่านั้น
// ไม่บันทึกไฟล์ ไม่แตะฐานข้อมูล ไม่เก็บข้อมูลส่วนบุคคล (ตัดข้อความที่ยาว/มีตัวเลขบัญชีออก)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clip(v: unknown, n = 160): string | null {
  if (typeof v !== 'string') return null;
  return v.replace(/[0-9]{6,}/g, '#').slice(0, n);
}

export async function POST(req: Request) {
  try {
    const b: any = await req.json().catch(() => ({}));
    const payload = {
      stage: clip(b?.stage, 40),
      ok: b?.ok === true,
      message: clip(b?.message, 160),
      http: typeof b?.http === 'number' ? b.http : null,
      sizeKb: typeof b?.sizeKb === 'number' ? Math.round(b.sizeKb) : null,
      type: clip(b?.type, 40),
      build: clip(b?.build, 12),
      ua: clip(b?.ua, 120),
      inApp: b?.inApp === true,
      isPhone: b?.isPhone === true,
      camSupport: clip(b?.camSupport, 20),
    };
    console.log('[scan-diag] ' + JSON.stringify(payload));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, endpoint: '/api/scan-diag', method: 'POST' });
}
