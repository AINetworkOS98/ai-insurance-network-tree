import { NextRequest, NextResponse, after } from 'next/server';
import { randomUUID } from 'node:crypto';
import { sql, sqlOne, sqlRun } from '@/lib/sqlLite';
import { signToken } from '@/lib/auth';
import { generateMemberCode, generateReferralCode } from '@/lib/referral';

/**
 * GET /auth/callback — รับ callback จาก Google (server-side OAuth)
 *
 * ทำไม route นี้ไม่ใช้ Prisma: @prisma/client พ่วง query engine ที่กินแรมมาก
 * บนโฮสต์แชร์ (Hostinger Cloud Startup) การโหลด Prisma ใน bundle ของ route นี้ทำให้ worker
 * ถูก kill กลางคำขอ → proxy ตอบ 504 (ยืนยันจาก worker รีสตาร์ทตรงเวลาที่มีคำขอ และไม่มี error ใน log)
 * จึงใช้ไดรเวอร์ pg ตรง ๆ (เบามาก) เฉพาะเส้นทางล็อกอินนี้ — ที่เหลือของแอปยังใช้ Prisma ตามเดิม
 *
 * งานที่ไม่จำเป็นต่อการตอบกลับ (บันทึก session) ย้ายไป after() เพื่อตอบผู้ใช้ให้เร็วที่สุด
 */
function getBaseUrl(req: NextRequest) {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || `${req.nextUrl.protocol}//${req.nextUrl.host}`;
}

export async function GET(req: NextRequest) {
  const LOG = process.env.LOG_OAUTH === '1';
  const t0 = Date.now();
  const step: string[] = [];
  const mark = (label: string) => { const dt = Date.now() - t0; step.push(`${label}:${dt}ms`); if (LOG) console.log(`[oauth] ${label} @${dt}ms`); };

  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const back = (path: string) => NextResponse.redirect(new URL(path, getBaseUrl(req)));

  if (error) return back(`/login?error=${encodeURIComponent(error)}`);
  if (!code) return back('/login?error=no_code');

  try {
    const clientId = process.env.GOOGLE_CLIENT_ID!;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET!;
    const redirectUri = process.env.GOOGLE_CALLBACK_URL || `${getBaseUrl(req)}/auth/callback`;
    mark('params-ready');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
    });
    const tokenJson: any = await tokenRes.json();
    mark('token-exchange');
    if (!tokenRes.ok) return back(`/login?error=${encodeURIComponent(tokenJson.error_description || tokenJson.error || 'google token exchange failed')}`);

    const idToken = tokenJson.id_token;
    if (!idToken) return back('/login?error=no_id_token');
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString());
    const email = String(payload.email || '').toLowerCase();
    const emailVerified = !!payload.email_verified;
    const googleSub = String(payload.sub || '');
    const name = String(payload.name || email.split('@')[0] || 'ผู้ใช้ Google');
    if (!email) return back('/login?error=no_email');

    // ---- หา/สร้างผู้ใช้ ด้วย SQL ตรง (ไม่โหลด Prisma) ----
    const identity: any = await sqlOne(`select * from "AuthIdentity" where provider=$1 and "providerUserId"=$2 limit 1`, ['google', googleSub]);
    mark('identity-query');
    let user: any = null;

    if (identity) {
      user = await sqlOne(`select * from "User" where id=$1 limit 1`, [identity.userId]);
      mark('user-lookup');
    } else {
      user = await sqlOne(`select * from "User" where lower(email)=lower($1) limit 1`, [email]);
      if (user) {
        if (!emailVerified) return back('/login?error=google_email_not_verified');
        const emailIdentity: any = await sqlOne(`select * from "AuthIdentity" where provider=$1 and lower(email)=lower($2) limit 1`, ['google', email]);
        if (emailIdentity && emailIdentity.userId !== user.id) return back('/login?error=email_linked_to_other');
        if (emailIdentity) {
          if (emailIdentity.providerUserId !== googleSub) {
            await sqlRun(`update "AuthIdentity" set "providerUserId"=$1 where id=$2`, [googleSub, emailIdentity.id]).catch(() => 0);
          }
        } else {
          await sqlRun(`insert into "AuthIdentity" (id, "userId", provider, "providerUserId", email, "createdAt") values ($1,$2,$3,$4,$5,now())`,
            [randomUUID(), user.id, 'google', googleSub, email]);
        }
        await sqlRun(`insert into "AuditLog" (id, "userId", action, entity, "entityId", "newValue", "createdAt") values ($1,$2,$3,$4,$5,$6::jsonb,now())`,
          [randomUUID(), user.id, 'auth.link_google', 'User', user.id, JSON.stringify({ googleSub, email })]).catch(() => 0);
      } else {
        const [firstName, ...rest] = name.split(' ');
        let memberCode: string | null = null;
        let newReferralCode: string | null = null;
        for (let attempt = 0; attempt < 3 && !user; attempt++) {
          try {
            memberCode = generateMemberCode();
            newReferralCode = generateReferralCode();
            const rows = await sql(`insert into "User"
              (id, email, "emailVerified", "phoneVerified", "firstName", "lastName", "displayName", "memberCode", "referralCode",
               status, "rankLevel", "mfaEnabled", "createdAt", "updatedAt")
              values ($1,lower($2),$3,false,$4,$5,$6,$7,$8,'PENDING',0,false,now(),now()) returning *`,
              [randomUUID(), email, !!emailVerified, firstName || name, rest.join(' ') || '', name, memberCode, newReferralCode]);
            user = rows[0];
          } catch (e: any) {
            // 23505 = unique violation (อีเมล/รหัสซ้ำ) → ลองใหม่ด้วยรหัสใหม่
            if (String(e.code) === '23505' && attempt < 2) { user = null; continue; }
            throw e;
          }
        }
        if (!user) return back('/login?error=server');
        await sqlRun(`insert into "ReferralCode" (id, "userId", code, "isActive", "createdAt") values ($1,$2,$3,true,now())`,
          [randomUUID(), user.id, newReferralCode]).catch(() => 0);
        await sqlRun(`insert into "PlacementQueue" (id, "userId", "sponsorId", "queueNo", reason, "createdAt")
                      values ($1,$2,null,(select coalesce(max("queueNo"),0)+1 from "PlacementQueue"),$3,now())`,
          [randomUUID(), user.id, 'สมัครด้วย Google — รออนุมัติและจัดวางผัง']).catch(() => 0);
        await sqlRun(`insert into "AuthIdentity" (id, "userId", provider, "providerUserId", email, "createdAt") values ($1,$2,$3,$4,$5,now())`,
          [randomUUID(), user.id, 'google', googleSub, email]);
        await sqlRun(`insert into "AuditLog" (id, "userId", action, entity, "entityId", "newValue", "createdAt") values ($1,$2,$3,$4,$5,$6::jsonb,now())`,
          [randomUUID(), user.id, 'auth.register_google', 'User', user.id, JSON.stringify({ email, rankLevel: 0 })]).catch(() => 0);
      }
    }

    if (!user) return back('/login?error=server');
    mark('user-resolved');
    if (['SUSPENDED', 'RESIGNED', 'INACTIVE'].includes(String(user.status))) return back('/login?error=suspended');

    const token = signToken({ sub: user.id, email: user.email, rankLevel: user.rankLevel ?? 0, status: String(user.status) });
    mark('token-signed');

    let next = '/';
    try { if (state) { const s = JSON.parse(Buffer.from(state, 'base64url').toString()); if (s.next && String(s.next).startsWith('/')) next = s.next; } } catch {}

    const res = back(next);
    res.cookies.set('token', token, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 7, sameSite: 'lax' });

    // งานติดตามผล — ตอบผู้ใช้ก่อน แล้วค่อยเขียน
    // (การตรวจสิทธิ์ใช้ลายเซ็น JWT ไม่ได้อ่านตาราง UserSession จึงย้ายมา after() ได้โดยไม่ทำให้ล็อกอินเสีย)
    const userId = user.id;
    after(async () => {
      try {
        await sqlRun(`insert into "UserSession" (id, "userId", "tokenHash", "expiresAt", "lastActiveAt", "createdAt")
                      values ($1,$2,$3,now() + interval '7 days',now(),now())`, [randomUUID(), userId, token.slice(-32)]);
      } catch {}
      if (LOG) {
        try {
          await sqlRun(`insert into "AuditLog" (id,"userId",action,entity,"entityId","newValue","createdAt") values ($1,$2,'oauth_trace','Auth',$3,$4::jsonb,now())`,
            [randomUUID(), userId, userId, JSON.stringify({ steps: step.join(' '), total: Date.now() - t0 })]);
        } catch {}
      }
    });
    if (LOG) console.log('[oauth] success ' + step.join(' ') + ` total:${Date.now() - t0}ms`);
    return res;
  } catch (e: any) {
    console.error('auth handler', e, step.join(' '));
    return back('/login?error=google_failed');
  }
}
