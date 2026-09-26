import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { getTicketDetail, updateTicketStatus } from '@/lib/support';

// GET /api/admin/support/[id] — ดูรายละเอียด ticket + messages
export async function GET(
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

    const { id } = await params;
    const ticket = await getTicketDetail(id);
    if (!ticket) return NextResponse.json({ ok: false, error: 'ไม่พบ ticket นี้' }, { status: 404 });

    // แปลง messages ให้ frontend ใช้ง่าย — แก้ sender name
    const messages = ticket.messages.map((m: any) => ({
      id: m.id,
      senderType: m.senderType,
      senderId: m.senderId,
      senderName: m.sender
        ? (m.sender.displayName || [m.sender.firstName, m.sender.lastName].filter(Boolean).join(' ') || 'ผู้ใช้งาน')
        : 'ระบบ',
      message: m.message,
      createdAt: m.createdAt,
    }));

    return NextResponse.json({
      ok: true,
      ticket: {
        id: ticket.id,
        userId: ticket.userId,
        name: ticket.name,
        phone: ticket.phone,
        lineId: ticket.lineId,
        subject: ticket.subject,
        message: ticket.message,
        status: ticket.status,
        adminNote: ticket.adminNote,
        createdAt: ticket.createdAt,
        updatedAt: ticket.updatedAt,
        closedAt: ticket.closedAt,
        messages,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}

// PATCH /api/admin/support/[id] — แก้สถานะ + หมายเหตุ admin
export async function PATCH(
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

    const { id } = await params;
    const body = await req.json().catch(() => ({} as any));

    const status = body?.status;
    const adminNote = body?.adminNote;

    if (status && !['NEW', 'IN_PROGRESS', 'REPLIED', 'CLOSED'].includes(status)) {
      return NextResponse.json({ ok: false, error: 'สถานะไม่ถูกต้อง' }, { status: 400 });
    }

    const existing = await prisma.supportTicket.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ ok: false, error: 'ไม่พบ ticket นี้' }, { status: 404 });

    const updated = await updateTicketStatus(id, {
      status: status || undefined,
      adminNote: adminNote !== undefined ? adminNote : undefined,
    });

    return NextResponse.json({ ok: true, ticket: updated });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}
