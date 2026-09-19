import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function GET(req: NextRequest) {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI || `${req.headers.get('origin')}/api/auth/facebook/callback`;

  if (!appId || !appSecret) {
    return NextResponse.json({ ok: false, error: 'Facebook Login ยังไม่ได้ตั้งค่า — ผู้ดูแลต้องเพิ่ม FACEBOOK_APP_ID/FACEBOOK_APP_SECRET ใน Vercel ก่อน' }, { status: 503 });
  }

  const next = req.nextUrl.searchParams.get('next') || '/';
  const safeNext = next.startsWith('/') && !next.startsWith('/login') && !next.startsWith('/register') ? next : '/';

  const authUrl = new URL('https://www.facebook.com/v18.0/dialog/oauth');
  authUrl.searchParams.set('client_id', appId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'public_profile,email');
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', safeNext);

  return NextResponse.redirect(authUrl.toString());
}
