import { NextRequest, NextResponse } from 'next/server';

const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';

// POST { action:'init' } -> { url }  หรือ  POST { code, state } -> สร้าง session
// GET ?code=xxx&state=yyy  -> callback จาก TikTok (redirect)
export async function POST(req: NextRequest){
  try{
    const body = await req.json().catch(()=> ({}));
    const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
    const clientSecret = process.env.TIKTOK_CLIENT_SECRET || '';
    const appUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const redirectUri = process.env.TIKTOK_REDIRECT_URI || `${appUrl}/api/auth/tiktok`;

    if(body.action === 'init'){
      if(!clientKey){
        return NextResponse.json({ ok:false, error:'ยังไม่ได้ตั้ง TIKTOK_CLIENT_KEY ใน .env — ใช้อีเมล/Google/Facebook/GitHub ก่อน' }, { status:501 });
      }
      const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
      const scope = 'user.info.basic';
      const url = `${TIKTOK_AUTH_URL}?client_key=${encodeURIComponent(clientKey)}&response_type=code&scope=${encodeURIComponent(scope)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${encodeURIComponent(state)}`;
      const res = NextResponse.json({ ok:true, url });
      res.cookies.set('tiktok_state', state, { httpOnly:true, path:'/', maxAge:600, sameSite:'lax' });
      return res;
    }

    // ถ้าส่ง code มาโดยตรง (SPA flow)
    if(body.code){
      if(!clientKey || !clientSecret){
        return NextResponse.json({ ok:false, error:'TikTok ยังไม่พร้อม — ตั้งค่า CLIENT_KEY/SECRET ก่อน' }, { status:501 });
      }
      // แลก code -> token -> user info แล้วสร้าง JWT ของระบบ
      const tokenRes = await fetch(TIKTOK_TOKEN_URL, {
        method:'POST',
        headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_key: clientKey,
          client_secret: clientSecret,
          code: String(body.code),
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }).toString(),
      });
      const tokenJson:any = await tokenRes.json().catch(()=> ({}));
      if(!tokenJson.access_token){
        return NextResponse.json({ ok:false, error:'แลก TikTok token ไม่สำเร็จ', detail: tokenJson }, { status:400 });
      }
      // ดึงข้อมูลผู้ใช้ TikTok
      // หมายเหตุ: ต้องมี scope user.info.basic
      const userRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url', {
        headers:{ Authorization: `Bearer ${tokenJson.access_token}` },
      });
      const userJson:any = await userRes.json().catch(()=> ({}));
      const openId = userJson?.data?.user?.open_id || tokenJson.open_id || '';
      const displayName = userJson?.data?.user?.display_name || 'TikTok User';

      // สร้าง/หา user ในระบบ (ใช้ AuthIdentity provider=tiktok)
      const { prisma } = await import('@/lib/prisma');
      const { signToken } = await import('@/lib/auth');
      let identity = await prisma.authIdentity.findFirst({ where:{ provider:'tiktok', providerUserId: openId } }).catch(()=>null);
      let user:any = null;
      if(identity){
        user = await prisma.user.findUnique({ where:{ id: identity.userId } });
      } else {
        // สร้าง user ใหม่ — ใช้อีเมลจำลองจาก open_id (TikTok ไม่ให้อีเมล)
        const pseudoEmail = `tiktok_${openId}@tiktok.local`.toLowerCase();
        user = await prisma.user.findUnique({ where:{ email: pseudoEmail } }).catch(()=>null);
        if(!user){
          const [first,...rest] = displayName.split(' ');
          const { generateMemberCode, generateReferralCode } = await import('@/lib/referral');
          let newReferralCode: string | null = null;
          for(let attempt=0; attempt<3; attempt++){
            try{
              newReferralCode = generateReferralCode();
              user = await prisma.user.create({ data:{
                email: pseudoEmail,
                emailVerified: false,
                firstName: first || displayName,
                lastName: rest.join(' ') || '',
                displayName,
                memberCode: generateMemberCode(),
                referralCode: newReferralCode,
                status: 'PENDING',
                rankLevel: 0,
              }});
              break;
            }catch(e:any){ if(String(e.code)==='P2002' && attempt<2) continue; throw e; }
          }
          if(!user) return NextResponse.json({ ok:false, error:'สร้างบัญชีไม่สำเร็จ' }, { status:500 });
          await prisma.referralCode.create({ data:{ userId: user.id, code: newReferralCode! } }).catch(()=>null);
          await prisma.placementQueue.create({ data:{ userId: user.id, sponsorId: null, reason:'สมัครด้วย TikTok — รออนุมัติและจัดวางผัง' } }).catch(()=>null);
        }
        identity = await prisma.authIdentity.create({ data:{ userId: user.id, provider:'tiktok', providerUserId: openId, email: pseudoEmail } });
        await prisma.auditLog.create({ data:{ userId: user.id, action:'auth.register_tiktok', entity:'User', entityId: user.id, newValue:{ openId } }}).catch(()=>{});
      }
      if(['SUSPENDED','RESIGNED','INACTIVE'].includes(String(user.status))){
        return NextResponse.json({ ok:false, error:'บัญชีถูกระงับสิทธิ' }, { status:403 });
      }
      const token = signToken({ sub: user.id, email: user.email, rankLevel: user.rankLevel ?? 0, status: String(user.status) });
      await prisma.userSession.create({ data:{ userId: user.id, tokenHash: token.slice(-32), expiresAt: new Date(Date.now()+7*24*60*60*1000) }}).catch(()=>{});
      const res = NextResponse.json({ ok:true, token, user:{ id:user.id, email:user.email, displayName }});
      res.cookies.set('token', token, { httpOnly:true, path:'/', maxAge:60*60*24*7, sameSite:'lax' });
      return res;
    }

    return NextResponse.json({ ok:false, error:'กรุณาส่ง action:init หรือ code' }, { status:400 });
  }catch(e:any){
    console.error('tiktok auth POST', e);
    return NextResponse.json({ ok:false, error:'TikTok login ผิดพลาด' }, { status:500 });
  }
}

export async function GET(req: NextRequest){
  // callback จาก TikTok redirect
  const url = req.nextUrl;
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if(error){
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, req.url));
  }
  if(!code){
    return NextResponse.redirect(new URL('/login?error=no_code', req.url));
  }

  // แลก code ผ่าน POST handler เดียวกันแล้ว redirect หน้าแรก
  const clientKey = process.env.TIKTOK_CLIENT_KEY || '';
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET || '';
  const appUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const redirectUri = process.env.TIKTOK_REDIRECT_URI || `${appUrl}/api/auth/tiktok`;

  if(!clientKey || !clientSecret){
    return NextResponse.redirect(new URL('/login?error=tiktok_not_configured', req.url));
  }

  try{
    const tokenRes = await fetch(TIKTOK_TOKEN_URL, {
      method:'POST',
      headers:{ 'Content-Type':'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        code,
        grant_type:'authorization_code',
        redirect_uri: redirectUri,
      }).toString(),
    });
    const tokenJson:any = await tokenRes.json().catch(()=> ({}));
    if(!tokenJson.access_token){
      return NextResponse.redirect(new URL('/login?error=tiktok_token_failed', req.url));
    }
    const userRes = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,display_name,avatar_url', {
      headers:{ Authorization: `Bearer ${tokenJson.access_token}` },
    });
    const userJson:any = await userRes.json().catch(()=> ({}));
    const openId = userJson?.data?.user?.open_id || tokenJson.open_id || '';
    const displayName = userJson?.data?.user?.display_name || 'TikTok User';
    const { prisma } = await import('@/lib/prisma');
    const { signToken } = await import('@/lib/auth');
    let identity = await prisma.authIdentity.findFirst({ where:{ provider:'tiktok', providerUserId: openId } }).catch(()=>null);
    let user:any = null;
    if(identity){
      user = await prisma.user.findUnique({ where:{ id: identity.userId } });
    } else {
      const pseudoEmail = `tiktok_${openId}@tiktok.local`.toLowerCase();
      user = await prisma.user.findUnique({ where:{ email: pseudoEmail } }).catch(()=>null);
      if(!user){
        const [first,...rest] = displayName.split(' ');
        const { generateMemberCode, generateReferralCode } = await import('@/lib/referral');
        let newReferralCode: string | null = null;
        for(let attempt=0; attempt<3; attempt++){
          try{
            newReferralCode = generateReferralCode();
            user = await prisma.user.create({ data:{
              email: pseudoEmail,
              emailVerified:false,
              firstName: first || displayName,
              lastName: rest.join(' ') || '',
              displayName,
              memberCode: generateMemberCode(),
              referralCode: newReferralCode,
              status:'PENDING',
              rankLevel:0,
            }});
            break;
          }catch(e:any){ if(String(e.code)==='P2002' && attempt<2) continue; throw e; }
        }
        if(!user) return NextResponse.redirect(new URL('/login?error=user_create_failed', req.url));
        await prisma.referralCode.create({ data:{ userId: user.id, code: newReferralCode! } }).catch(()=>null);
        await prisma.placementQueue.create({ data:{ userId: user.id, sponsorId: null, reason:'สมัครด้วย TikTok — รออนุมัติและจัดวางผัง' } }).catch(()=>null);
      }
      identity = await prisma.authIdentity.create({ data:{ userId: user.id, provider:'tiktok', providerUserId: openId, email: pseudoEmail }}).catch(()=> identity);
    }
    if(!user) return NextResponse.redirect(new URL('/login?error=user_create_failed', req.url));
    const token = signToken({ sub: user.id, email: user.email, rankLevel: user.rankLevel ?? 0, status: String(user.status) });
    await prisma.userSession.create({ data:{ userId: user.id, tokenHash: token.slice(-32), expiresAt: new Date(Date.now()+7*24*60*60*1000) }}).catch(()=>{});
    const res = NextResponse.redirect(new URL('/', req.url));
    res.cookies.set('token', token, { httpOnly:true, path:'/', maxAge:60*60*24*7, sameSite:'lax' });
    return res;
  }catch(e:any){
    console.error('tiktok GET callback', e);
    return NextResponse.redirect(new URL('/login?error=tiktok_callback_failed', req.url));
  }
}
