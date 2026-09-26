import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { addTicketMessage } from '@/lib/support';
import { createSupportTicketEvent } from '@/lib/supportEvents';

// POST /api/admin/support/[id]/reply — ตอบกลับ ticket (admin)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const token = req.cookies.get('token')?.value
      || req.cookies.get('auth_token')?.value;
    if (!token) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });

    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ ok: false, error: 'โทเค็นไม่ถูกต้อง' }, { status: 401 });
    if (!payload.roles?.includes('admin') && !payload.roles?.includes('super_admin'))
      return NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });

    const { id: ticketId } = await params;
    const body = await req.json().catch(() => ({} as any));
    const message = String(body?.message || '').trim();

    if (!message) return NextResponse.json({ ok: false, error: 'กรุณากรอกข้อความ' }, { status: 400 });
    if (message.length > 5000) return NextResponse.json({ ok: false, error: 'ข้อความยาวเกิน 5000 ตัวอักษร' }, { status: 400 });

    // ตรวจสอบ ticket มีอยู่
    const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
    if (!ticket) return NextResponse.json({ ok: false, error: 'ไม่พบ ticket นี้' }, { status: 404 });

    // สร้างข้อความ admin
    const msg = await addTicketMessage({
      ticketId,
      senderType: 'ADMIN',
      senderId: payload.sub,
      message,
    });

    // อัปเดตสถานะเป็น REPLIED หากยังไม่ใช่ CLOSED
    await createSupportTicketEvent({
      id: ticket.id,
      userId: ticket.userId,
      name: ticket.name,
      phone: ticket.phone as any,
      lineId: ticket.lineId as any,
      subject: ticket.subject,
      message: ticket.message,
      status: 'REPLIED',
      createdAt: ticket.createdAt,
    } as any);
    if (ticket.status !== 'CLOSED') {
      await prisma.supportTicket.update({
        where: { id: ticketId },
        data: { status: 'REPLIED' } as any,
      });
    }

    return NextResponse.json({ ok: true, message: msg });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}
