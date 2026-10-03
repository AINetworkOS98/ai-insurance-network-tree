import { NextRequest, NextResponse } from 'next/server';
import { verifyTokenEdge } from '@/lib/auth-edge';
import { isAdminOnlyPage, canAccessAdminOnlyPage } from '@/lib/access-rules';

// สเปคหมวด 2: ตรวจสิทธิใน API และฐานข้อมูลด้วย — ไม่ใช้การซ่อนเมนูเป็นวิธีป้องกันเพียงอย่างเดียว
// สมาชิกทั่วไป (rankLevel 0) เห็นหน้าแรกเท่านั้น — เรียก API หลังบ้านโดยตรงต้องถูกบล็อก
// เมื่อสถานะถูกพัก/คัดออก (SUSPENDED/RESIGNED/INACTIVE) ต้องยกเลิกสิทธิทันที

const PUBLIC_API = [
  '/api/support', // ฟอร์มติดต่อสาธารณะ — เข้าถึงได้โดยไม่ต้องล็อกอิน (route ตรวจ rate-limit + เบอร์โทรเอง)
  '/api/track', // เก็บพฤติกรรมผู้เข้าชม — ต้องยินยอมก่อนเก็บ (route ตรวจ consent เอง)
  '/api/lead', // ลงทะเบียนลีดจากฟอร์มสาธารณะ (route ตรวจความยินยอม + กันสแปมเอง)
  '/api/maintenance', // งานดูแลระบบ — route บังคับ Authorization: Bearer $CRON_SECRET เอง
  // เส้นทางที่ n8n (และเว็บ) เรียก — route ตรวจสิทธิ์เอง (คุกกี้ token หรือ Bearer CRON_SECRET)
  '/api/dashboard/leads',
  '/api/agent-log',
  '/api/agent-tasks',
  '/api/lead/score',
  '/api/recommend',
  '/api/followup/due',
  '/api/followup/result',
  '/api/sim', // ระบบจำลองเครือข่าย "1 แตก 5" (Network Simulator) — อ่าน/เขียนเฉพาะตาราง sim_* (ข้อมูลจำลอง) และ route ตรวจสิทธิ์โหมด live เอง (Bearer)
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/verify-email',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-otp',
  '/api/auth/tiktok',
  '/api/auth/oauth',
  '/api/auth/google',
  '/api/auth/facebook',
  '/api/auth/facebook/start',
  '/api/auth/facebook/callback',
  '/api/ocr/health',
  '/api/ai/query',
  '/api/ai/status',
  '/api/ai/stream',
  '/api/cron/hermes-sync',
  '/api/cron/backup',
  '/api/cron/renewal',
  '/api/cron/registration-sync',
  '/api/cron/email-sync',
  '/api/cron/net-1x5', // ตัวเฝ้าให้ข้อมูลระบบ 1 แตก 5 เป็นปัจจุบันเสมอ (Bearer CRON_SECRET / ผู้ดูแลที่ล็อกอิน)
  '/api/read-file',
  '/api/fetch-url',
  '/api/search',
  '/api/members',
  '/api/visitor',
  '/api/showcase', // ตัวอย่างจริง (ปิดข้อมูลส่วนบุคคล) สำหรับส่วน "ระบบอัตโนมัติทำงานจริง" หน้า /financial-freedom
  '/api/videos', // ช่องดูวีดีโอ TikTok แบบสุ่มต่อเนื่อง — route ตรวจสิทธิ์เอง (next/played เปิดสาธารณะ, add/list ต้องมี Bearer)
  // เส้นทางสำหรับระบบอัตโนมัติ: route ตรวจสิทธิ์เอง (ผู้ดูแล หรือ Bearer CRON_SECRET) — ถ้าไม่มีสิทธิ์ตอบ 401
  '/api/line',
  '/api/net/1x5', // ระบบบริหารเครือข่าย 1 แตก 5 (ข้อมูลจริง) — route ตรวจสิทธิ์เอง (สมาชิก/ผู้ดูแล/Bearer CRON_SECRET สำหรับ n8n)
  '/api/automation', // สถานะระบบอัตโนมัติ n8n ที่แสดงบนหน้าเว็บ — อ่านอย่างเดียว ไม่มีข้อมูลส่วนบุคคล (route ไม่แตะข้อมูลสำคัญ)
  '/api/activity', // เรดาร์กิจกรรม/รายงานสมาชิก — route ตรวจสิทธิ์เอง (สมาชิก หรือ Bearer CRON_SECRET สำหรับ n8n)
];

const PUBLIC_PAGES = [
  '/',
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  '/verify',
  '/verify-email',
  '/privacy',
  '/terms',
  '/faq',
  '/admin',
];

function isPublicApi(pathname: string) {
  return PUBLIC_API.some(p => pathname === p || pathname.startsWith(p + '/'))
    || pathname.startsWith('/api/_next') || pathname.startsWith('/_next');
}

function isPublicPage(pathname: string){
  // exact or prefix for public pages
  if(PUBLIC_PAGES.includes(pathname)) return true;
  // allow /verify/*, /api/auth/tiktok callback
  if(pathname.startsWith('/verify')) return true;
  if(pathname.startsWith('/api/auth/tiktok')) return true;
  return false;
}

function getToken(req: NextRequest): string | null{
  const auth = req.headers.get('authorization') || req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
  let token: string | null = null;
  if (auth) token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  if (!token) {
    const cookieHeader = req.headers.get('cookie') || '';
    const m = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/);
    if (m) token = decodeURIComponent(m[1]);
  }
  return token;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  const isApi = pathname.startsWith('/api/');
  const isPage = !isApi;

  // --- หน้าสงวนสิทธิ์ (เช่น N8N) : เฉพาะ Admin หรือสมาชิกอีเมล akarapol.pro798@gmail.com ---
  // ตรวจที่นี่เสมอ ไม่พึ่งการซ่อนเมนูอย่างเดียว (ตรงกับกติกาหมวด 2 ของระบบ)
  if (isPage && isAdminOnlyPage(pathname)) {
    const restrictedToken = getToken(req);
    const restrictedPayload = restrictedToken ? await verifyTokenEdge(restrictedToken) : null;
    if (!restrictedPayload) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
    const rStatus = String(restrictedPayload.status || '');
    if (['SUSPENDED', 'RESIGNED', 'INACTIVE'].includes(rStatus)) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('error', 'suspended');
      return NextResponse.redirect(loginUrl);
    }
    if (!canAccessAdminOnlyPage({ email: restrictedPayload.email, roles: restrictedPayload.roles })) {
      // ล็อกอินแล้วแต่ไม่มีสิทธิ์ — แสดงหน้าแจ้งสิทธิ์ (rewrite ไม่เปลี่ยน URL จึงไม่วน redirect)
      return NextResponse.rewrite(new URL('/no-access', req.url));
    }
    return NextResponse.next();
  }

  // --- API guard ---
  if(isApi){
    if (isPublicApi(pathname)) return NextResponse.next();
    // allow static
    if (pathname.startsWith('/_next') || pathname.startsWith('/api/_next')) return NextResponse.next();

    const token = getToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ', errorEn: 'Unauthorized' }, { status: 401 });
    }
    const payload = await verifyTokenEdge(token);
    if (!payload) {
      return NextResponse.json({ ok: false, error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' }, { status: 401 });
    }
    const status = payload.status as string | undefined;
    if (status && ['SUSPENDED', 'RESIGNED', 'INACTIVE'].includes(status)) {
      return NextResponse.json({ ok: false, error: 'บัญชีถูกระงับสิทธิ กรุณาติดต่อผู้ดูแลระบบ' }, { status: 403 });
    }
    const rankLevel = typeof payload.rankLevel === 'number' ? payload.rankLevel : 0;
    // หมายเหตุ: ไม่บล็อกตาม rankLevel ที่นี่ — ค่าใน token อาจ stale หลัง admin ปรับระดับ
    // การเช็กสิทธิ์ระดับตำแหน่งทำที่ API แต่ละตัว (อ่าน rank ปัจจุบันจาก DB) เช่น /api/income/summary, /api/career/board
    const res = NextResponse.next();
    res.headers.set('x-user-id', String(payload.sub || ''));
    res.headers.set('x-user-rank', String(rankLevel));
    res.headers.set('x-user-status', String(status || ''));
    return res;
  }

  // --- Page guard: ล็อกอินก่อนเข้าระบบ ---
  // ให้หน้าแรกและหน้าสาธารณะผ่านได้โดยไม่ต้องล็อกอิน
  // หน้าที่ต้องล็อกอิน: /dashboard, /tree, /income, /members, /admin, /reports, /receipts, /prospects, /appointments, /referral, /settings, /notifications, /periods, /rank-plans ฯลฯ
  const protectedPrefixes = ['/dashboard','/tree','/income','/members','/reports','/receipts','/documents','/prospects','/appointments','/referral','/settings','/notifications','/periods','/rank-plans','/progress','/network-simulator','/network/1x5-autopilot'];

  const needsAuth = protectedPrefixes.some(p => pathname === p || pathname.startsWith(p + '/'));

  if(!needsAuth){
    // หน้าไม่ต้องล็อกอิน — ผ่าน
    // แต่ถ้าเป็นหน้า public pages ก็ผ่านเลย
    if(isPublicPage(pathname) || pathname.startsWith('/_next') || pathname.startsWith('/favicon') || pathname.match(/\.(png|jpg|jpeg|svg|ico|css|js|woff2?)$/)) {
      return NextResponse.next();
    }
    // หน้าอื่นๆ ที่ไม่ได้ระบุ — อนุญาต (เช่น / )
    return NextResponse.next();
  }

  // หน้าที่ต้องล็อกอิน — ตรวจ token
  // ยังไม่สมัครสมาชิก (ไม่มี token) → ส่งไปหน้า /admin ซึ่งมีการ์ดชวนเข้าสู่ระบบ
  const token = getToken(req);
  if(!token){
    return NextResponse.redirect(new URL('/admin', req.url));
  }
  const payload = await verifyTokenEdge(token);
  if(!payload){
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('next', pathname);
    // ลบ cookie หมดอายุ
    const res = NextResponse.redirect(loginUrl);
    res.cookies.set('token','',{ path:'/', maxAge:0 });
    return res;
  }
  const status = payload.status as string | undefined;
  if(status && ['SUSPENDED','RESIGNED','INACTIVE'].includes(status)){
    const loginUrl = new URL('/login', req.url);
    loginUrl.searchParams.set('error','suspended');
    return NextResponse.redirect(loginUrl);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/((?!_next/static|_next/image|favicon.ico).*)'],
};
// force redeploy
