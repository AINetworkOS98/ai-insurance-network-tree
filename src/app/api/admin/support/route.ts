import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import {
  isAdmin, getAdminTickets, getTicketDetail,
  updateTicketStatus, getSupportStats,
} from '@/lib/support';

// GET /api/admin/support — ดู tickets ทั้งหมด (admin เท่านั้น)
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if (!token) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });

    let payload: any;
    try { payload = verifyToken(token); } catch { return NextResponse.json({ ok: false, error: 'โทเค็นไม่ถูกต้อง' }, { status: 401 }); }
    if (!isAdmin(payload)) return NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });

    const { searchParams } = new URL(req.url);
    const status = searchParams.get('status') as any || 'ALL';
    const search = searchParams.get('q') || '';

    if (status && !['NEW', 'IN_PROGRESS', 'REPLIED', 'CLOSED', 'ALL'].includes(status)) {
      return NextResponse.json({ ok: false, error: 'สถานะไม่ถูกต้อง' }, { status: 400 });
    }

    const tickets = await getAdminTickets({
      status: status === 'ALL' ? undefined : status,
      search: search || undefined,
    });

    // พร้อม stats
    const stats = await getSupportStats();

    return NextResponse.json({
      ok: true,
      tickets,
      stats,
      total: tickets.length,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}

// GET /api/admin/support/[id] — ดูรายละเอียด ticket (admin)
export async function GET_ById(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if (!token) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });

    let payload: any;
    try { payload = verifyToken(token); } catch { return NextResponse.json({ ok: false, error: 'โทเค็นไม่ถูกต้อง' }, { status: 401 }); }
    if (!isAdmin(payload)) return NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });

    const { id } = await params;
    const ticket = await getTicketDetail(id);
    if (!ticket) return NextResponse.json({ ok: false, error: 'ไม่พบ ticket นี้' }, { status: 404 });

    // แปลงข้อมูลให้ frontend ใช้ง่าย
    const plain = {
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
      messages: ticket.messages.map((m) => ({
        id: m.id,
        senderType: m.senderType,
        senderId: m.senderId,
        senderName: m.sender?.displayName || [m.sender?.firstName, m.sender?.lastName].filter(Boolean).join(' ') || 'ระบบ',
        message: m.message,
        createdAt: m.createdAt,
      })),
    };

    return NextResponse.json({ ok: true, ticket: plain });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}

// PATCH /api/admin/support/[id] — แก้สถานะ +หมายเหตุ (admin)
export async function PATCH_ById(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if (!token) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });

    let payload: any;
    try { payload = verifyToken(token); } catch { return NextResponse.json({ ok: false, error: 'โทเค็นไม่ถูกต้อง' }, { status: 401 }); }
    if (!isAdmin(payload)) return NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });

    const { id } = await params;
    const body = await req.json().catch(() => ({} as any));

    const status = body?.status;
    const adminNote = body?.adminNote;

    if (status && !['NEW', 'IN_PROGRESS', 'REPLIED', 'CLOSED'].includes(status)) {
      return NextResponse.json({ ok: false, error: 'สถานะไม่ถูกต้อง' }, { status: 400 });
    }

    // ตรวจสอบ ticket มีอยู่จริง
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
