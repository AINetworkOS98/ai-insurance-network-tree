import { NextRequest, NextResponse } from 'next/server';
import { verifyTokenEdge } from '@/lib/auth-edge';

// สเปคหมวด 2: ตรวจสิทธิใน API และฐานข้อมูลด้วย — ไม่ใช้การซ่อนเมนูเป็นวิธีป้องกันเพียงอย่างเดียว
// สมาชิกทั่วไป (rankLevel 0) เห็นหน้าแรกเท่านั้น — เรียก API หลังบ้านโดยตรงต้องถูกบล็อก
// เมื่อสถานะถูกพัก/คัดออก (SUSPENDED/RESIGNED/INACTIVE) ต้องยกเลิกสิทธิทันที

const PUBLIC_API = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/verify-email',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-otp',
  '/api/auth/tiktok',
  '/api/auth/oauth',
  '/api/auth/google',
  '/api/ocr/health',
  '/api/ai/query',
  '/api/ai/status',
  '/api/ai/stream',
  '/api/cron/hermes-sync',
  '/api/cron/backup',
  '/api/read-file',
  '/api/fetch-url',
  '/api/search',
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

  // --- API guard ---
  if(isApi){
    if (isPublicApi(pathname)) return NextResponse.next();
    // allow static
    if (pathname.startsWith('/_next') || pathname.startsWith('/api/_next')) return NextResponse.next();

    const token = getToken(req);
    if (!token) {
      return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ', errorEn: 'Unauthorized' }, { status: 401 });
    }
    const payload = verifyTokenEdge(token);
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
  const protectedPrefixes = ['/dashboard','/chat','/tree','/income','/members','/reports','/receipts','/documents','/prospects','/appointments','/referral','/settings','/notifications','/periods','/rank-plans','/progress','/recruit'];

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
  const payload = verifyTokenEdge(token);
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
