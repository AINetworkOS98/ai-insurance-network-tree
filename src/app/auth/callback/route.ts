import { NextRequest, NextResponse, after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/auth';
import { generateMemberCode, generateReferralCode } from '@/lib/referral';

function getBaseUrl(req: NextRequest){
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
}

// GET /auth/callback — รับ callback จาก Google (server-side OAuth ไม่ผ่าน Firebase)
// LOG_OAUTH=1 → พิมพ์เวลาที่ใช้แต่ละขั้นลง runtime log (ใช้หาจุดที่ช้าบนโฮสต์แรมจำกัด)
export async function GET(req: NextRequest){
  const LOG = process.env.LOG_OAUTH === '1';
  const t0 = Date.now();
  const step: string[] = [];
  const mark = (label: string) => { const dt = Date.now() - t0; step.push(`${label}:${dt}ms`); if (LOG) console.log(`[oauth] ${label} @${dt}ms`); };
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  if(error) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, getBaseUrl(req)));
  if(!code) return NextResponse.redirect(new URL('/login?error=no_code', getBaseUrl(req)));
  try{
    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectUri = process.env.GOOGLE_CALLBACK_URL || `${getBaseUrl(req)}/auth/callback`;
    mark('params-ready');
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
    mark('token-exchange');
    if(!tokenRes.ok) return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(tokenJson.error_description||tokenJson.error||'google token exchange failed')}`, getBaseUrl(req)));
    const idToken = tokenJson.id_token;
    if(!idToken) return NextResponse.redirect(new URL('/login?error=no_id_token', getBaseUrl(req)));
    const parts = idToken.split('.');
    const payload = JSON.parse(Buffer.from(parts[1].replace(/-/g,'+').replace(/_/g,'/'),'base64').toString());
    const email = String(payload.email||'').toLowerCase();
    const emailVerified = !!payload.email_verified;
    const googleSub = String(payload.sub||'');
    const name = String(payload.name|| email.split('@')[0] || 'ผู้ใช้ Google');
    if(!email) return NextResponse.redirect(new URL('/login?error=no_email', getBaseUrl(req)));
    let identity = await prisma.authIdentity.findFirst({ where:{ provider:'google', providerUserId: googleSub } }).catch(()=>null);
    mark('identity-query');
    let user:any = null;
    if(identity){
      user = await prisma.user.findUnique({ where:{ id: identity.userId } });
      mark('user-lookup');
    } else {
      user = await prisma.user.findUnique({ where:{ email } }).catch(()=>null);
      if(user){
        if(!emailVerified) return NextResponse.redirect(new URL('/login?error=google_email_not_verified', getBaseUrl(req)));
        const emailIdentity = await prisma.authIdentity.findFirst({ where:{ provider:'google', email } }).catch(()=>null);
        if(emailIdentity && emailIdentity.userId !== user.id) return NextResponse.redirect(new URL('/login?error=email_linked_to_other', getBaseUrl(req)));
        if(emailIdentity){
          // เคยเชื่อมไว้แล้ว (อาจค้างจากรอบก่อน) — reuse ไม่สร้างซ้ำ
          identity = emailIdentity;
          if(emailIdentity.providerUserId !== googleSub){
            identity = await prisma.authIdentity.update({ where:{ id: emailIdentity.id }, data:{ providerUserId: googleSub } }).catch(()=>emailIdentity);
          }
        } else {
          identity = await prisma.authIdentity.create({ data:{ userId: user.id, provider:'google', providerUserId: googleSub, email } });
        }
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
        if(!user) return NextResponse.redirect(new URL('/login?error=server', getBaseUrl(req)));
        await prisma.referralCode.create({ data:{ userId: user.id, code: newReferralCode! } }).catch(()=>null);
        await prisma.placementQueue.create({ data:{ userId: user.id, sponsorId: null, reason:'สมัครด้วย Google — รออนุมัติและจัดวางผัง' } }).catch(()=>null);

      // แจ้งเตือนสมัครเข้า (social): ตัวเอง + ผู้บริหารระบบ — ทำเบื้องหลัง ไม่บล็อกการล็อกอิน
      void (async () => {
        try{
          const { emitNotification: __em, notifyAdmins: __na } = await import('@/lib/notify');
          await __em({ userId: user.id, type:'register_welcome', title:'สมัครสมาชิกสำเร็จ', body:`รหัสสมาชิก ${user.memberCode}`, referenceId:'/members' }).catch(()=>null);
          await __na({ type:'member_registered', title:'สมาชิกสมัครใหม่', body:`${user.email}`, referenceId:'/admin/members' });
        }catch{}
      })();
        identity = await prisma.authIdentity.create({ data:{ userId: user.id, provider:'google', providerUserId: googleSub, email } });
        await prisma.auditLog.create({ data:{ userId: user.id, action:'auth.register_google', entity:'User', entityId: user.id, newValue:{ email, rankLevel:0 } } });
      }
    }
    if(!user) return NextResponse.redirect(new URL('/login?error=server', getBaseUrl(req)));
    mark('user-resolved');
    if(['SUSPENDED','RESIGNED','INACTIVE'].includes(String(user.status))) return NextResponse.redirect(new URL('/login?error=suspended', getBaseUrl(req)));
    const token = signToken({ sub: user.id, email: user.email, rankLevel: user.rankLevel ?? 0, status: String(user.status) });
    mark('token-signed');
    // ร่องรอยไว้ตรวจ (เปิดด้วย LOG_OAUTH=1) — เขียนก่อนตอบ เพื่อให้รู้ว่าไปถึงขั้นนี้ได้จริง
    if (LOG) { try { await prisma.auditLog.create({ data:{ userId: user.id, action:'oauth_trace', entity:'Auth', entityId: user.id, newValue:{ step:'user-resolved', ms: Date.now()-t0 } } }); } catch {} }
    let next = '/';
    try{ if(state){ const s=JSON.parse(Buffer.from(state,'base64url').toString()); if(s.next && String(s.next).startsWith('/')) next=s.next; } }catch{}
    const res = NextResponse.redirect(new URL(next, getBaseUrl(req)));
    res.cookies.set('token', token, { httpOnly:true, path:'/', maxAge:60*60*24*7, sameSite:'lax' });

    // งานเบื้องหลังทั้งหมด — ตอบผู้ใช้ "ก่อน" แล้วค่อยเขียน DB
    // เหตุผล: บนโฮสต์แชร์ (Hostinger Cloud Startup) การรอเขียน DB ในคำขอเดียวกันทำให้ proxy ตัดที่ ~55s เป็น 504
    // ความปลอดภัย: การยืนยันสิทธิ์ใช้ลายเซ็น JWT (ไม่มีการอ่านตาราง UserSession ตอนตรวจ token)
    // การบันทึก session/สิทธิ์แอดมินเป็นงานติดตามผล จึงย้ายมาที่นี่ได้โดยไม่ทำให้ล็อกอินเสีย
    after(async () => {
      try { await prisma.userSession.create({ data:{ userId: user.id, tokenHash: token.slice(-32), expiresAt: new Date(Date.now()+7*24*60*60*1000) } }); } catch {}
      try{ const __adm = await import('@/lib/admin'); if(__adm.isAdminEmail(user.email)) await __adm.ensureSuperAdmin(user.id); }catch{}
      if (LOG) { try { await prisma.auditLog.create({ data:{ userId: user.id, action:'oauth_trace', entity:'Auth', entityId: user.id, newValue:{ step:'background-done', ms: Date.now()-t0 } } }); } catch {} }
    });
    if (LOG) console.log('[oauth] success ' + step.join(' ') + ` total:${Date.now()-t0}ms`);
    return res;
  }catch(e:any){
    console.error('auth handler', e, step.join(' '));
    return NextResponse.redirect(new URL('/login?error=google_failed', getBaseUrl(req)));
  }
}
