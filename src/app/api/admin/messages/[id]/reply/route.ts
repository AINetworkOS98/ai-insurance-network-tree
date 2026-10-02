import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { isSystemAdmin } from '@/lib/admin';
import { replyMemberMessage } from '@/lib/memberMessages';

// POST /api/admin/messages/[id]/reply — admin ตอบสมาชิก
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if (!token) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    let payload: any;
    try { payload = verifyToken(token); } catch { return NextResponse.json({ ok: false, error: 'โทเค็นไม่ถูกต้อง' }, { status: 401 }); }
    const userId = payload.sub || payload.id;
    const adm = await isSystemAdmin(userId);
    if (!adm.ok) return NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์ตอบข้อความ' }, { status: 403 });

    const { id } = await params;
    const body = await req.json().catch(() => ({} as any));
    const replyMessage = String(body?.replyMessage || '').trim();
    if (!replyMessage) return NextResponse.json({ ok: false, error: 'กรุณากรอกคำตอบ' }, { status: 400 });

    const result = await replyMemberMessage({ messageId: id, repliedBy: userId, replyMessage });
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: result.error === 'ไม่พบข้อความ' ? 404 : 500 });
    return NextResponse.json({ ok: true, reply: result.reply });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}
