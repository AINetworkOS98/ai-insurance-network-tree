import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/auth';
import { generateMemberCode, generateReferralCode } from '@/lib/referral';

function getBaseUrl(req: NextRequest){
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
}

// GET /auth/callback — รับ callback จาก Google (server-side OAuth ไม่ผ่าน Firebase)
export async function GET(req: NextRequest){
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  if(error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, req.url));
  if(!code) return NextResponse.redirect(new URL('/login?error=no_code', req.url));
  try{
    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectUri = process.env.GOOGLE_CALLBACK_URL || `${getBaseUrl(req)}/auth/callback`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method:'POST',
      headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });
    const tokenJson:any = await tokenRes.json();
    if(!tokenRes.ok) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(tokenJson.error_description||tokenJson.error||'google token exchange failed')}`, req.url));
    const idToken = tokenJson.id_token;
    if(!idToken) return NextResponse.redirect(new URL('/login?error=no_id_token', req.url));
    const parts = idToken.split('.');
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString());
    const email = String(payload.email||'').toLowerCase();
    const emailVerified = !!payload.email_verified;
    const googleSub = String(payload.sub||'');
    const name = String(payload.name|| email.split('@')[0] || 'ผู้ใช้ Google');
    if(!email) return NextResponse.redirect(new URL('/login?error=no_email', req.url));
    let identity = await prisma.authIdentity.findFirst({ where:{ provider:'google', providerUserId: googleSub } }).catch(()=>null);
    let user:any = null;
    if(identity){
      user = await prisma.user.findUnique({ where:{ id: identity.userId } });
    } else {
      user = await prisma.user.findUnique({ where:{ email } }).catch(()=>null);
      if(user){
        if(!emailVerified) return NextResponse.redirect(new URL('/login?error=google_email_not_verified', req.url));
        const emailIdentity = await prisma.authIdentity.findFirst({ where:{ provider:'google', email } }).catch(()=>null);
        if(emailIdentity && emailIdentity.userId !== user.id) return NextResponse.redirect(new URL('/login?error=email_linked_to_other', req.url));
        identity = await prisma.authIdentity.create({ data:{ userId: user.id, provider:'google', providerUserId: googleSub, email } });
        await prisma.auditLog.create({ data:{ userId: user.id, action:'auth.link_google', entity:'User', entityId: user.id, newValue:{ googleSub, email } } });
      } else {
        const [firstName, ...rest] = name.split(' ');
        // ออกรหัสสมาชิก/รหัสแนะนำเหมือนสมัครอีเมล — ฐานเดียวกันสำหรับสร้างทีมและคำนวณผลประโยชน์
        let memberCode: string | null = null;
        let newReferralCode: string | null = null;
        for(let attempt=0; attempt<3; attempt++){
          try{
            memberCode = generateMemberCode();
            newReferralCode = generateReferralCode();
            user = await prisma.user.create({ data:{ email, emailVerified: !!emailVerified, firstName: firstName||name, lastName: rest.join(' ')||'', displayName: name, memberCode, referralCode: newReferralCode, status:'PENDING', rankLevel:0 }});
            break;
          }catch(e:any){ if(String(e.code)==='P2002' && attempt<2) continue; throw e; }
        }
        if(!user) return NextResponse.redirect(new URL('/login?error=server', req.url));
        await prisma.referralCode.create({ data:{ userId: user.id, code: newReferralCode! } }).catch(()=>null);
        await prisma.placementQueue.create({ data:{ userId: user.id, sponsorId: null, reason:'สมัครด้วย Google — รออนุมัติและจัดวางผัง' } }).catch(()=>null);
        identity = await prisma.authIdentity.create({ data:{ userId: user.id, provider:'google', providerUserId: googleSub, email } });
        await prisma.auditLog.create({ data:{ userId: user.id, action:'auth.register_google', entity:'User', entityId: user.id, newValue:{ email, rankLevel:0 } } });
      }
    }
    if(!user) return NextResponse.redirect(new URL('/login?error=server', req.url));
    if(['SUSPENDED','RESIGNED','INACTIVE'].includes(String(user.status))) return NextResponse.redirect(new URL('/login?error=suspended', req.url));
    const token = signToken({ sub: user.id, email: user.email, rankLevel: user.rankLevel ?? 0, status: String(user.status) });
    await prisma.userSession.create({ data:{ userId: user.id, tokenHash: token.slice(-32), expiresAt: new Date(Date.now()+7*24*60*60*1000) } }).catch(()=>null);
    let next = '/';
    try{ if(state){ const s=JSON.parse(Buffer.from(state,'base64url').toString()); if(s.next && String(s.next).startsWith('/')) next=s.next; } }catch{}
    const res = NextResponse.redirect(new URL(next, req.url));
    res.cookies.set('token', token, { httpOnly:true, path:'/', maxAge:60*60*24*7, sameSite:'lax' });
    return res;
  }catch(e:any){
    console.error('auth handler', e);
    return NextResponse.redirect(new URL('/login?error=google_failed', req.url));
  }
}
