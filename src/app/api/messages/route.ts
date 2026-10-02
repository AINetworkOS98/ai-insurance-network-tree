import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { createMemberMessage } from '@/lib/memberMessages';

// POST /api/messages — สมาชิกส่งคำถาม (ต้องล็อกอิน)
export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if (!token) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    let payload: any;
    try { payload = verifyToken(token); } catch { return NextResponse.json({ ok: false, error: 'โทเค็นไม่ถูกต้อง' }, { status: 401 }); }
    const memberId = payload.sub || payload.id;
    const body = await req.json().catch(() => ({} as any));
    const message = String(body?.message || '').trim();
    if (!message) return NextResponse.json({ ok: false, error: 'กรุณากรอกข้อความ' }, { status: 400 });
    if (message.length > 5000) return NextResponse.json({ ok: false, error: 'ข้อความยาวเกิน 5000 ตัวอักษร' }, { status: 400 });

    const result = await createMemberMessage({ memberId, message });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    return NextResponse.json({ ok: true, message: result.message });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}
