import { NextRequest, NextResponse } from 'next/server';

// GET /api/me/ip — คืน IP ของผู้เรียกเอง (ใช้แสดงในหน้า /notifications ว่า "IP ของคุณ")
// แสดงค่าเต็มเฉพาะกับเจ้าของคำขอ · ไม่บันทึกที่ไหน · ไม่ส่งต่อบุคคลที่สาม
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function clientIp(req: NextRequest): string {
  const fwd = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  return fwd || req.headers.get('x-real-ip') || req.headers.get('cf-connecting-ip') || '';
}

/** ปิดบังบางส่วนเพื่อความปลอดภัยเมื่อต้องแสดงบนหน้าจอ: IPv4 = a.b.x.x · IPv6 = 4 กลุ่มแรก */
function maskIp(ip: string): string {
  if (!ip) return '';
  if (ip.includes(':')) {
    const parts = ip.split(':').filter(Boolean);
    return parts.slice(0, 4).join(':') + '::••••';
  }
  const p = ip.split('.');
  if (p.length === 4) return `${p[0]}.${p[1]}.•••.•••`;
  return ip;
}

export async function GET(req: NextRequest) {
  const ip = clientIp(req);
  return NextResponse.json({
    ok: true,
    ip: ip || null,
    masked: ip ? maskIp(ip) : null,
    at: new Date().toISOString(),
    note: 'IP ของคุณเอง (ใช้ตรวจว่าเข้าใช้งานจากเครือข่ายไหน) · ระบบไม่บันทึกค่านี้ในโปรไฟล์',
  }, { headers: { 'cache-control': 'no-store' } });
}
