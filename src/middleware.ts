import { NextRequest, NextResponse } from 'next/server';
import { verifyTokenEdge } from '@/lib/auth-edge';

// สเปคหมวด 2: ตรวจสิทธิใน API และฐานข้อมูลด้วย — ไม่ใช้การซ่อนเมนูเป็นวิธีป้องกันเพียงอย่างเดียว
// สมาชิกทั่วไป (rankLevel 0) เห็นหน้าแรกเท่านั้น — เรียก API หลังบ้านโดยตรงต้องถูกบล็อก
// เมื่อสถานะถูกพัก/คัดออก (SUSPENDED/RESIGNED/INACTIVE) ต้องยกเลิกสิทธิทันที

const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/verify-email',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/verify-otp',
  '/api/ocr/health',
];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
    || pathname.startsWith('/api/_next') || pathname.startsWith('/_next');
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Only guard /api/*
  if (!pathname.startsWith('/api/')) return NextResponse.next();
  if (isPublic(pathname)) return NextResponse.next();

  const auth = req.headers.get('authorization') || req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
  let token: string | null = null;
  if (auth) {
    token = auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  }
  // Also check cookie named 'token' via header
  if (!token) {
    const cookieHeader = req.headers.get('cookie') || '';
    const m = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/);
    if (m) token = decodeURIComponent(m[1]);
  }

  if (!token) {
    return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ', errorEn: 'Unauthorized' }, { status: 401 });
  }

  const payload = verifyTokenEdge(token);
  if (!payload) {
    return NextResponse.json({ ok: false, error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' }, { status: 401 });
  }

  // สเปค: เมื่อสถานะถูกพักหรือคัดออก ต้องยกเลิกสิทธิทันทีรวมถึง session ที่ค้าง
  const status = payload.status as string | undefined;
  if (status && ['SUSPENDED', 'RESIGNED', 'INACTIVE'].includes(status)) {
    return NextResponse.json({ ok: false, error: 'บัญชีถูกระงับสิทธิ กรุณาติดต่อผู้ดูแลระบบ' }, { status: 403 });
  }

  // สมาชิกทั่วไป (rankLevel 0) ห้ามเรียก API หลังบ้านโดยตรง — ยกเว้นหน้าแรก/โปรไฟล์ตนเอง
  const rankLevel = typeof payload.rankLevel === 'number' ? payload.rankLevel : 0;
  const isGeneral = rankLevel === 0;
  const allowedForGeneral = [
    '/api/auth/',
    '/api/members', // จะตรวจสิทธิ์ละเอียดใน route เอง (เฉพาะของตนเอง)
    '/api/notifications',
  ];
  // For general users, block sensitive APIs entirely
  const blockedForGeneralPrefixes = ['/api/admin', '/api/tree', '/api/income', '/api/members/approve', '/api/documents'];
  if (isGeneral && blockedForGeneralPrefixes.some(p => pathname.startsWith(p))) {
    return NextResponse.json({ ok: false, error: 'สมาชิกทั่วไปเข้าถึงได้เฉพาะหน้าแรก — กรุณาสมัครเป็นตัวแทนเพื่อใช้งานระบบหลังบ้าน' }, { status: 403 });
  }

  // Attach user info to headers for downstream handlers
  const res = NextResponse.next();
  res.headers.set('x-user-id', String(payload.sub || ''));
  res.headers.set('x-user-rank', String(rankLevel));
  res.headers.set('x-user-status', String(status || ''));
  return res;
}

export const config = {
  matcher: ['/api/:path*'],
};
