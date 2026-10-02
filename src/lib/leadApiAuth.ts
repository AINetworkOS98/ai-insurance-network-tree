import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { requireCronAuth } from '@/lib/cronAuth';

// ─────────────────────────────────────────────────────────────────────────────
// ด่านตรวจสิทธิ์ของเส้นทาง Lead Nurturing — รับ 2 ทาง (แบบเดียวกับ src/app/api/cron/*)
//   ① คุกกี้ token / auth_token (ผู้ใช้ที่ล็อกอินในหน้าเว็บ) → ตรวจลายเซ็น JWT
//   ② Authorization: Bearer <CRON_SECRET> (n8n / Vercel Cron) → ผ่าน requireCronAuth
// ถ้าไม่ผ่านทั้งสองทาง → 401 (ไม่เปิดสาธารณะ)
//
// ⚠️ หมายเหตุสำคัญ: middleware (src/middleware.ts) บล็อก '/api/*' ที่ไม่อยู่ใน PUBLIC_API
//    ด้วยการตรวจ JWT เท่านั้น — คำขอที่เป็น Bearer CRON_SECRET จะโดน 401 ก่อนถึง route
//    จึงต้องเพิ่ม path ของเส้นทางเหล่านี้ใน PUBLIC_API (แบบเดียวกับ /api/line และ /api/cron/*)
//    แล้วให้ route ตรวจสิทธิ์เองด้วยฟังก์ชันนี้ (ผู้เรียกด้วย CRON_SECRET จะผ่านด่าน ②)
// ─────────────────────────────────────────────────────────────────────────────

export type LeadApiAuth =
  | { ok: true; via: 'session' | 'cron'; userId: string | null }
  | { ok: false; res: NextResponse };

export function authorizeLeadApi(req: NextRequest): LeadApiAuth {
  const cookieToken =
    req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value || null;
  const authHeader = req.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
  const token = cookieToken || bearer;

  if (token) {
    const payload = verifyToken(token);
    if (payload && payload.sub) return { ok: true, via: 'session', userId: payload.sub };
  }

  // ไม่ใช่ session ที่ใช้ได้ → ลอง CRON_SECRET (คืน null = ผ่าน)
  const cronDenied = requireCronAuth(req);
  if (!cronDenied) return { ok: true, via: 'cron', userId: null };

  return {
    ok: false,
    res: NextResponse.json(
      { ok: false, error: 'ต้องเข้าสู่ระบบก่อน หรือแนบ Authorization: Bearer CRON_SECRET' },
      { status: 401 },
    ),
  };
}
