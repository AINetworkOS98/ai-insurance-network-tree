import { NextRequest, NextResponse } from 'next/server';
import { verifyTicket } from '@/lib/oauthRelay';
import { signToken } from '@/lib/auth';

/**
 * GET /auth/session?ticket=... — แลก "ตั๋ว" ที่โฮสต์ที่แลกโค้ดออกให้ เป็นคุกกี้เซสชันของโฮสต์นี้
 *
 * ใช้ในโหมดส่งต่อ (relay): โฮสต์แชร์ไม่ต้องคุยกับ Google/ฐานข้อมูลเอง — ตรวจลายเซ็นตั๋ว (HMAC)
 * แล้วออกคุกกี้ httpOnly อายุ 7 วัน ใช้เวลาไม่กี่มิลลิวินาที จึงไม่ชนเพดานเวลาแพลนแชร์
 * ตั๋วอายุสั้น (2 นาที) และตรวจไม่ได้ถ้าลายเซ็นไม่ตรง → ใช้เป็นกุญแจล็อกอินแทนรหัสไม่ได้
 */
export async function GET(req: NextRequest) {
  const ticket = new URL(req.url).searchParams.get('ticket') || '';
  const p = verifyTicket(ticket);
  if (!p) return NextResponse.redirect(new URL('/login?error=ticket_invalid', req.nextUrl.origin));

  const token = signToken({ sub: p.sub, email: p.email, rankLevel: p.rankLevel, status: p.status });
  const target = p.next && String(p.next).startsWith('/') ? String(p.next) : '/dashboard';
  const res = NextResponse.redirect(new URL(target, req.nextUrl.origin));
  res.cookies.set('token', token, {
    httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 7, sameSite: 'lax',
    secure: req.nextUrl.protocol === 'https:',
  });
  return res;
}
