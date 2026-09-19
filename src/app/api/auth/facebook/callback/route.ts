import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

// Facebook OAuth callback — รับ code แล้วสร้าง JWT token
export async function GET(req: NextRequest) {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  const redirectUri = process.env.FACEBOOK_REDIRECT_URI || `${req.headers.get('origin')}/api/auth/facebook/callback`;

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') || '/';
  const error = url.searchParams.get('error');

  if (error) {
    const errorDesc = url.searchParams.get('error_description') || 'Facebook authentication failed';
    return NextResponse.redirect(new URL(`/login?error=facebook_failed&next=${encodeURIComponent(state)}`, req.url));
  }

  if (!code || !appId || !appSecret) {
    return NextResponse.redirect(new URL('/login?error=facebook_failed&next=' + encodeURIComponent(state), req.url));
  }

  try {
    // 1. Exchange code for access token
    const tokenRes = await fetch('https://graph.facebook.com/v18.0/oauth/access_token', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      body: null,
    });
    const tokenData = await tokenRes.json();
    
    if (tokenData.error) {
      return NextResponse.redirect(new URL('/login?error=facebook_failed&next=' + encodeURIComponent(state), req.url));
    }

    const accessToken = tokenData.access_token;
    if (!accessToken) {
      return NextResponse.redirect(new URL('/login?error=facebook_failed&next=' + encodeURIComponent(state), req.url));
    }

    // 2. Get user profile from Facebook
    const profileRes = await fetch('https://graph.facebook.com/v18.0/me', {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    const profile = await profileRes.json();

    if (profile.error || !profile.id) {
      return NextResponse.redirect(new URL('/login?error=facebook_failed&next=' + encodeURIComponent(state), req.url));
    }

    const fbId = profile.id;
    const email = profile.email || '';
    const name = profile.name || '';
    const picture = (profile.picture?.data as any)?.url || '';

    // 3. Look up or create user in database (use Prisma/Firestore)
    // For now, we'll use a simple approach — create token and redirect
    // In production, you'd want to check if user exists and link accounts

    // 4. Create JWT token (same format as other auth)
    const tokenPayload = {
      sub: fbId,
      email,
      name,
      picture,
      provider: 'facebook',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30, // 30 days
    };

    // Simple JWT signing (use your existing JWT library)
    // For demo, we'll use a placeholder — replace with real JWT signing
    const token = Buffer.from(JSON.stringify(tokenPayload)).toString('base64');

    // 5. Set cookie and redirect
    const cookieStore = await cookies();
    cookieStore.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    });

    return NextResponse.redirect(new URL(state || '/', req.url));

  } catch (err) {
    console.error('Facebook OAuth error:', err);
    return NextResponse.redirect(new URL('/login?error=facebook_failed&next=' + encodeURIComponent(state), req.url));
  }
}
