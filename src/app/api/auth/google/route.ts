import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getAdminApp } from '@/lib/firebase-admin';
import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/auth';
import { generateMemberCode, generateReferralCode } from '@/lib/referral';

// สร้าง user ใหม่พร้อมรหัสสมาชิก/รหัสแนะนำ + เข้าคิวผัง — ฐานเดียวกับสมัครอีเมล
async function createGoogleUser(email:string, emailVerified:boolean, name:string){
  const [firstName, ...rest] = name.split(' ');
  let user:any = null;
  let newReferralCode: string | null = null;
  for(let attempt=0; attempt<3; attempt++){
    try{
      newReferralCode = generateReferralCode();
      user = await prisma.user.create({ data:{ email, emailVerified, firstName: firstName||name, lastName: rest.join(' ')||'', displayName: name, memberCode: generateMemberCode(), referralCode: newReferralCode, status:'PENDING', rankLevel:0 }});
      break;
    }catch(e:any){ if(String(e.code)==='P2002' && attempt<2) continue; throw e; }
  }
  if(!user) return null;
  await prisma.referralCode.create({ data:{ userId: user.id, code: newReferralCode! } }).catch(()=>null);
  await prisma.placementQueue.create({ data:{ userId: user.id, sponsorId: null, reason:'สมัครด้วย Google — รออนุมัติและจัดวางผัง' } }).catch(()=>null);
  return user;
}

// POST /api/auth/google {idToken} — สเปคหมวด 3: เข้าสู่ระบบด้วย Google
// รองรับ 2 ทาง: Firebase idToken (popup) + OAuth code (server-side redirect ไม่ต้องพึ่ง Firebase Web API Key)
// ป้องกันบัญชีซ้ำและการเชื่อมผิดคน: ต้องยืนยันความเป็นเจ้าของทั้งสองช่องทาง
function getBaseUrl(req: NextRequest){
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
}
function getRedirectUri(req: NextRequest){
  // ใช้ /auth/callback ที่ Next.js build ได้ปกติ (ไม่ใช้ __ prefix ที่อาจถูก ignore)
  if(process.env.GOOGLE_CALLBACK_URL) return process.env.GOOGLE_CALLBACK_URL;
  return `${getBaseUrl(req)}/auth/callback`;
}

// GET /api/auth/google — เริ่ม OAuth หรือรับ callback ?code=
// ถ้าไม่มี code → redirect ไป Google
// ถ้ามี code → แลก token + สร้าง session + redirect ไปหน้า next
export async function GET(req: NextRequest){
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const err = searchParams.get('error');
  if(err) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(err)}`, req.url));
  if(!code){
    const next = searchParams.get('next') || '/';
    const clientId = process.env.GOOGLE_CLIENT_ID;
    if(!clientId) return NextResponse.json({ ok:false, error:'ยังไม่ได้ตั้ง GOOGLE_CLIENT_ID' }, { status:500 });
    const redirectUri = getRedirectUri(req);
    const state = Buffer.from(JSON.stringify({ next, t: Date.now() })).toString('base64url');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', 'openid email profile');
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'select_account');
    url.searchParams.set('state', state);
    return NextResponse.redirect(url.toString());
  }
  // callback — แลก code เป็น tokens
  try{
    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectUri = getRedirectUri(req);
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
    // reuse POST logic by verifying via Google userinfo (ไม่ต้องผ่าน Firebase Admin)
    // decode id_token payload
    const parts = idToken.split('.');
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString());
    const email = String(payload.email||'').toLowerCase();
    const emailVerified = !!payload.email_verified;
    const googleSub = String(payload.sub||'');
    const name = String(payload.name|| email.split('@')[0] || 'ผู้ใช้ Google');
    if(!email) return NextResponse.redirect(new URL('/login?error=no_email', req.url));
    // หา/สร้าง user เหมือน POST เดิม
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
        user = await createGoogleUser(email, emailVerified, name);
        if(!user) return NextResponse.redirect(new URL('/login?error=server', req.url));
        identity = await prisma.authIdentity.create({ data:{ userId: user.id, provider:'google', providerUserId: googleSub, email } });
        await prisma.auditLog.create({ data:{ userId: user.id, action:'auth.register_google', entity:'User', entityId: user.id, newValue:{ email, rankLevel:0 } } });
      }
    }
    if(!user) return NextResponse.redirect(new URL('/login?error=server', req.url));
    if(['SUSPENDED','RESIGNED','INACTIVE'].includes(String(user.status))) return NextResponse.redirect(new URL('/login?error=suspended', req.url));
    const token = signToken({ sub: user.id, email: user.email, rankLevel: user.rankLevel ?? 0, status: String(user.status) });
    await prisma.userSession.create({ data:{ userId: user.id, tokenHash: token.slice(-32), expiresAt: new Date(Date.now()+7*24*60*60*1000) } }).catch(()=>null);
    const stateRaw = searchParams.get('state');
    let next = '/';
    try{ if(stateRaw){ const s=JSON.parse(Buffer.from(stateRaw,'base64url').toString()); if(s.next && String(s.next).startsWith('/')) next=s.next; } }catch{}
    const res = NextResponse.redirect(new URL(next, req.url));
    res.cookies.set('token', token, { httpOnly:true, path:'/', maxAge:60*60*24*7, sameSite:'lax' });
    return res;
  }catch(e:any){
    console.error('google GET callback', e);
    return NextResponse.redirect(new URL('/login?error=google_failed', req.url));
  }
}
export async function POST(req: NextRequest){
  try{
    const { idToken } = await req.json();
    if(!idToken) return NextResponse.json({ ok:false, error:'กรุณาส่ง idToken จาก Google' }, { status:400 });

    // ต้อง init Admin SDK ก่อนเรียก getAuth() — ไม่งั้น default app ไม่มี (500)
    try { getAdminApp(); } catch (e: any) {
      return NextResponse.json({ ok:false, error:'เซิร์ฟเวอร์ยังไม่ได้ตั้งค่า Firebase Admin — ติดต่อผู้ดูแลระบบ' }, { status:500 });
    }
    const decoded: any = await getAuth().verifyIdToken(idToken);
    const googleSub = decoded.uid as string;
    const email = String(decoded.email||'').toLowerCase();
    const emailVerified = !!decoded.email_verified;
    const name = String(decoded.name || decoded.email?.split('@')[0] || 'ผู้ใช้ Google');

    if(!email) return NextResponse.json({ ok:false, error:'บัญชี Google นี้ไม่มีอีเมล' }, { status:400 });

    // 1) หา AuthIdentity google ก่อน
    let identity = await prisma.authIdentity.findFirst({ where:{ provider:'google', providerUserId: googleSub } }).catch(()=>null);
    let user: any = null;

    if(identity){
      user = await prisma.user.findUnique({ where:{ id: identity.userId } });
    } else {
      // 2) ยังไม่เคยเชื่อม — หา user จากอีเมล
      user = await prisma.user.findUnique({ where:{ email } }).catch(()=>null);
      if(user){
        // มี user อีเมลอยู่แล้ว — เชื่อม Google เข้าบัญชีเดิม แต่ต้องตรวจว่า email ตรงกันและ emailVerified
        if(!emailVerified){
          return NextResponse.json({ ok:false, error:'กรุณายืนยันอีเมล Google ก่อนเชื่อมบัญชี' }, { status:403 });
        }
        // กันชน provider+email ซ้ำ
        const emailIdentity = await prisma.authIdentity.findFirst({ where:{ provider:'google', email } }).catch(()=>null);
        if(emailIdentity && emailIdentity.userId !== user.id){
          return NextResponse.json({ ok:false, error:'อีเมลนี้ถูกเชื่อมกับบัญชีอื่นแล้ว' }, { status:409 });
        }
        identity = await prisma.authIdentity.create({
          data:{ userId: user.id, provider:'google', providerUserId: googleSub, email }
        });
        await prisma.auditLog.create({ data:{ userId: user.id, action:'auth.link_google', entity:'User', entityId: user.id, newValue:{ googleSub, email } } });
      } else {
        // 3) สมัครใหม่จาก Google — ทุกคนเริ่ม rankLevel 0 พร้อมรหัสสมาชิก/คิวผัง
        user = await createGoogleUser(email, emailVerified, name);
        if(!user) return NextResponse.json({ ok:false, error:'เกิดข้อผิดพลาด' }, { status:500 });
        identity = await prisma.authIdentity.create({
          data:{ userId: user.id, provider:'google', providerUserId: googleSub, email }
        });
        // เผื่อมี password identity ด้วยในอนาคต
        await prisma.auditLog.create({ data:{ userId: user.id, action:'auth.register_google', entity:'User', entityId: user.id, newValue:{ email, rankLevel:0 } } });
      }
    }

    if(!user) return NextResponse.json({ ok:false, error:'เกิดข้อผิดพลาด' }, { status:500 });
    if(['SUSPENDED','RESIGNED','INACTIVE'].includes(String(user.status))){
      return NextResponse.json({ ok:false, error:'บัญชีถูกระงับสิทธิ กรุณาติดต่อผู้ดูแลระบบ' }, { status:403 });
    }

    // สร้าง session
    const token = signToken({ sub: user.id, email: user.email, rankLevel: user.rankLevel ?? 0, status: String(user.status) });
    await prisma.userSession.create({
      data:{ userId: user.id, tokenHash: token.slice(-32), expiresAt: new Date(Date.now()+7*24*60*60*1000) }
    }).catch(()=>null);

    const res = NextResponse.json({ ok:true, token, user:{ id:user.id, email:user.email, rankLevel: user.rankLevel, status: user.status } });
    res.cookies.set('token', token, { httpOnly:true, path:'/', maxAge:60*60*24*7, sameSite:'lax' });
    return res;
  }catch(e:any){
    console.error('google auth', e);
    const code = e.code as string | undefined;
    if(code === 'auth/id-token-expired') return NextResponse.json({ ok:false, error:'เซสชัน Google หมดอายุ — ลองใหม่' }, { status:401 });
    return NextResponse.json({ ok:false, error:'เข้าสู่ระบบด้วย Google ไม่สำเร็จ' }, { status:500 });
  }
}
