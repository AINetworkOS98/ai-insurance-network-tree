import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/auth';
import { generateMemberCode, generateReferralCode } from '@/lib/referral';

// Server-side OAuth สำหรับ Facebook + GitHub (ไม่ผ่าน Firebase popup — กัน unauthorized-domain)
// redirect_uri เดียว: {base}/api/auth/oauth (provider อยู่ใน state)
// ต้องตั้งค่าใน Vercel: FB_APP_ID/FB_APP_SECRET หรือ GITHUB_CLIENT_ID/GITHUB_CLIENT_SECRET
// และเพิ่ม redirect URI นี้ใน Facebook App / GitHub OAuth App settings
type Provider = 'facebook' | 'github';

function getBaseUrl(req: NextRequest){
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
}
function getRedirectUri(req: NextRequest){
  return `${getBaseUrl(req)}/api/auth/oauth`;
}
function getCreds(provider: Provider){
  if(provider === 'facebook') return { id: process.env.FB_APP_ID || '', secret: process.env.FB_APP_SECRET || '' };
  return { id: process.env.GITHUB_CLIENT_ID || '', secret: process.env.GITHUB_CLIENT_SECRET || '' };
}
function failUrl(req: NextRequest, code: string){
  return new URL(`/login?error=${encodeURIComponent(code)}`, req.url);
}

async function findOrCreateUser(provider: Provider, providerUserId: string, email: string, emailVerified: boolean, name: string){
  let identity = await prisma.authIdentity.findFirst({ where:{ provider, providerUserId } }).catch(()=>null);
  let user:any = null;
  if(identity){
    user = await prisma.user.findUnique({ where:{ id: identity.userId } });
  } else if(email){
    user = await prisma.user.findUnique({ where:{ email } }).catch(()=>null);
    if(user){
      if(!emailVerified) return { error: 'email_not_verified' as const };
      const emailIdentity = await prisma.authIdentity.findFirst({ where:{ provider, email } }).catch(()=>null);
      if(emailIdentity && emailIdentity.userId !== user.id) return { error: 'email_linked_to_other' as const };
      if(emailIdentity){
        identity = emailIdentity;
        if(emailIdentity.providerUserId !== providerUserId){
          identity = await prisma.authIdentity.update({ where:{ id: emailIdentity.id }, data:{ providerUserId } }).catch(()=>emailIdentity);
        }
      } else {
        identity = await prisma.authIdentity.create({ data:{ userId: user.id, provider, providerUserId, email } });
      }
      await prisma.auditLog.create({ data:{ userId: user.id, action:`auth.link_${provider}`, entity:'User', entityId: user.id, newValue:{ providerUserId, email } } }).catch(()=>null);
    } else {
      const [firstName, ...rest] = name.split(' ');
      let newReferralCode: string | null = null;
      for(let attempt=0; attempt<3; attempt++){
        try{
          newReferralCode = generateReferralCode();
          user = await prisma.user.create({ data:{ email, emailVerified, firstName: firstName||name, lastName: rest.join(' ')||'', displayName: name, memberCode: generateMemberCode(), referralCode: newReferralCode, status:'PENDING', rankLevel:0 }});
          break;
        }catch(e:any){ if(String(e.code)==='P2002' && attempt<2) continue; throw e; }
      }
      if(!user) return { error: 'server' as const };
      await prisma.referralCode.create({ data:{ userId: user.id, code: newReferralCode! } }).catch(()=>null);
      await prisma.placementQueue.create({ data:{ userId: user.id, sponsorId: null, reason:`สมัครด้วย ${provider} — รออนุมัติและจัดวางผัง` } }).catch(()=>null);
      identity = await prisma.authIdentity.create({ data:{ userId: user.id, provider, providerUserId, email } });
      await prisma.auditLog.create({ data:{ userId: user.id, action:`auth.register_${provider}`, entity:'User', entityId: user.id, newValue:{ email, rankLevel:0 } } }).catch(()=>null);
    }
  } else {
    return { error: 'no_email' as const };
  }
  if(!user) return { error: 'server' as const };
  if(['SUSPENDED','RESIGNED','INACTIVE'].includes(String(user.status))) return { error: 'suspended' as const };
  return { user };
}

async function getFacebookProfile(accessToken: string){
  const r = await fetch(`https://graph.facebook.com/v18.0/me?fields=id,name,email&access_token=${encodeURIComponent(accessToken)}`);
  const j:any = await r.json().catch(()=> ({}));
  if(!j.id) throw new Error(j.error?.message || 'facebook profile failed');
  return { id: String(j.id), name: String(j.name || 'ผู้ใช้ Facebook'), email: String(j.email || '').toLowerCase() };
}

async function getGitHubProfile(accessToken: string){
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.github+json', 'User-Agent': 'ai-insurance-network-tree' };
  const r = await fetch('https://api.github.com/user', { headers });
  const j:any = await r.json().catch(()=> ({}));
  if(!j.id) throw new Error(j.message || 'github profile failed');
  let email = String(j.email || '').toLowerCase();
  if(!email){
    const er = await fetch('https://api.github.com/user/emails', { headers });
    const ej:any = await er.json().catch(()=> []);
    const primary = Array.isArray(ej) ? (ej.find((e:any)=> e.primary && e.verified) || ej.find((e:any)=> e.verified) || ej[0]) : null;
    email = String(primary?.email || '').toLowerCase();
  }
  return { id: String(j.id), name: String(j.name || j.login || 'ผู้ใช้ GitHub'), email };
}

// GET /api/auth/oauth — เริ่ม OAuth (?provider=facebook|github&next=/) หรือรับ callback (?provider=&code=&state=)
export async function GET(req: NextRequest){
  const { searchParams } = new URL(req.url);
  // callback จาก provider จะไม่มี ?provider= ติดมา — อ่านจาก state แทน
  let stateObj: any = null;
  try{
    const raw = searchParams.get('state') || '';
    if(raw) stateObj = JSON.parse(Buffer.from(raw,'base64url').toString());
  }catch{}
  let provider = searchParams.get('provider') as Provider | null;
  if(provider !== 'facebook' && provider !== 'github'){
    provider = (stateObj?.provider === 'facebook' || stateObj?.provider === 'github') ? stateObj.provider : null;
  }
  if(provider !== 'facebook' && provider !== 'github'){
    return NextResponse.redirect(failUrl(req, 'oauth_unknown_provider'));
  }
  const err = searchParams.get('error');
  if(err) return NextResponse.redirect(failUrl(req, `${provider}_failed`));
  const code = searchParams.get('code');

  // 1) เริ่ม OAuth — ยังไม่มี code
  if(!code){
    const next = searchParams.get('next') || '/';
    const { id } = getCreds(provider);
    if(!id) return NextResponse.redirect(failUrl(req, `${provider}_not_configured`));
    const redirectUri = getRedirectUri(req);
    const state = Buffer.from(JSON.stringify({ provider, next, t: Date.now() })).toString('base64url');
    if(provider === 'facebook'){
      const url = new URL('https://www.facebook.com/v18.0/dialog/oauth');
      url.searchParams.set('client_id', id);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('state', state);
      url.searchParams.set('scope', 'email,public_profile');
      url.searchParams.set('response_type', 'code');
      return NextResponse.redirect(url.toString());
    }
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', id);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'user:email');
    url.searchParams.set('state', state);
    return NextResponse.redirect(url.toString());
  }

  // 2) callback — แลก code
  try{
    const { id, secret } = getCreds(provider);
    if(!id || !secret) return NextResponse.redirect(failUrl(req, `${provider}_not_configured`));
    const redirectUri = getRedirectUri(req);
    let stateNext = '/';
    try{
      const s = JSON.parse(Buffer.from(searchParams.get('state') || '', 'base64url').toString());
      if(s.provider !== provider) return NextResponse.redirect(failUrl(req, 'oauth_state_mismatch'));
      if(s.next && String(s.next).startsWith('/')) stateNext = String(s.next);
    }catch{ return NextResponse.redirect(failUrl(req, 'oauth_state_mismatch')); }

    let accessToken = '';
    if(provider === 'facebook'){
      const tr = await fetch(`https://graph.facebook.com/v18.0/oauth/access_token?client_id=${encodeURIComponent(id)}&redirect_uri=${encodeURIComponent(redirectUri)}&client_secret=${encodeURIComponent(secret)}&code=${encodeURIComponent(code)}`);
      const tj:any = await tr.json().catch(()=> ({}));
      if(!tj.access_token) return NextResponse.redirect(failUrl(req, `${provider}_failed`));
      accessToken = tj.access_token;
    } else {
      const tr = await fetch('https://github.com/login/oauth/access_token', {
        method:'POST',
        headers:{ 'Content-Type':'application/json', Accept:'application/json' },
        body: JSON.stringify({ client_id: id, client_secret: secret, code, redirect_uri: redirectUri }),
      });
      const tj:any = await tr.json().catch(()=> ({}));
      if(!tj.access_token) return NextResponse.redirect(failUrl(req, `${provider}_failed`));
      accessToken = tj.access_token;
    }

    const profile = provider === 'facebook' ? await getFacebookProfile(accessToken) : await getGitHubProfile(accessToken);
    if(!profile.email) return NextResponse.redirect(failUrl(req, `${provider}_no_email`));
    const result = await findOrCreateUser(provider, profile.id, profile.email, true, profile.name);
    if('error' in result){
      const code = result.error === 'email_not_verified' ? `${provider}_failed` : String(result.error);
      return NextResponse.redirect(failUrl(req, code));
    }
    const user = result.user!;
    const token = signToken({ sub: user.id, email: user.email, rankLevel: user.rankLevel ?? 0, status: String(user.status) });
    await prisma.userSession.create({ data:{ userId: user.id, tokenHash: token.slice(-32), expiresAt: new Date(Date.now()+7*24*60*60*1000) } }).catch(()=>null);
    const res = NextResponse.redirect(new URL(stateNext, req.url));
    res.cookies.set('token', token, { httpOnly:true, path:'/', maxAge:60*60*24*7, sameSite:'lax' });
    return res;
  }catch(e:any){
    console.error('oauth callback', provider, e?.message || e);
    return NextResponse.redirect(failUrl(req, `${provider}_failed`));
  }
}
