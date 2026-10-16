// ─────────────────────────────────────────────────────────────────────────────
// lineOaAdmin.ts — ตัวช่วยตรวจสิทธิ์ของทุกเส้นทาง /api/admin/line-oa/*
//   อนุญาต: (1) ผู้ดูแลที่ล็อกอินบนเว็บ (cookie session)  (2) Bearer CRON_SECRET (ระบบอัตโนมัติ)
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { isAdminOrDb } from '@/lib/support';
import { requireCronAuth } from '@/lib/cronAuth';

export type LineAdminAuth = { ok: true; via: 'session' | 'cron'; userId?: string; email?: string };

export async function requireLineAdmin(req: NextRequest): Promise<LineAdminAuth | { ok: false; res: NextResponse }> {
  const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
  if (token) {
    const payload: any = verifyToken(token);
    if (!payload) return { ok: false, res: NextResponse.json({ ok: false, error: 'โทเค็นไม่ถูกต้อง' }, { status: 401 }) };
    if (!(await isAdminOrDb(payload))) {
      return { ok: false, res: NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์เข้าถึง (ผู้ดูแลระบบเท่านั้น)' }, { status: 403 }) };
    }
    return { ok: true, via: 'session', userId: payload.sub || payload.id, email: payload.email };
  }
  const denied = requireCronAuth(req);
  if (!denied) return { ok: true, via: 'cron' };
  return { ok: false, res: NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 }) };
}

export function fail(e: any, fallback = 'error') {
  return NextResponse.json({ ok: false, error: e?.message || fallback }, { status: 500 });
}
