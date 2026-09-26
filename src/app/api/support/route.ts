import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getCurrentUser, createTicket, getMyTickets, SUBJECT_OPTIONS,
} from '@/lib/support';
import { createSupportTicketEvent } from '@/lib/supportEvents';

// POST /api/support — สร้าง ticket ใหม่ (ผู้ใช้ทั่วไป)
export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if (!token) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });

    const user = await getCurrentUser(token);
    if (!user) return NextResponse.json({ ok: false, error: 'ไม่พบข้อมูลผู้ใช้' }, { status: 403 });

    const body = await req.json().catch(() => ({} as any));
    const subject = String(body?.subject || '').trim();
    const message = String(body?.message || '').trim();
    const phone = String(body?.phone || '').trim();
    const lineId = String(body?.lineId || '').trim();

    // validation
    if (!subject) return NextResponse.json({ ok: false, error: 'กรุณาระบุหัวข้อ' }, { status: 400 });
    if (!message) return NextResponse.json({ ok: false, error: 'กรุณากรอกข้อความ' }, { status: 400 });
    if (message.length > 5000) return NextResponse.json({ ok: false, error: 'ข้อความยาวเกิน 5000 ตัวอักษร' }, { status: 400 });
    if (!subjectOptions.includes(subject)) {
      return NextResponse.json({ ok: false, error: 'หัวข้อไม่ถูกต้อง' }, { status: 400 });
    }
    if (phone && !/^[0-9]{10,11}$/.test(phone.replace(/-/g, ''))) {
      return NextResponse.json({ ok: false, error: 'เบอร์โทรไม่ถูกต้อง (ภาษะ 10-11 หลัก)' }, { status: 400 });
    }
    if (lineId && !/^[a-zA-Z0-9._]{3,50}$/.test(lineId)) {
      return NextResponse.json({ ok: false, error: 'LINE ID ไม่ถูกต้อง' }, { status: 400 });
    }

    const name = user.displayName || `${user.firstName} ${user.lastName}`.trim() || user.email || 'สมาชิก';

    const ticket = await createTicket({
      userId: user.id,
      name,
      phone: phone || undefined,
      lineId: lineId || undefined,
      subject,
      message,
    });

    // บันทึกข้อความแรกใน ticket (จากผู้ใช้)
    await prisma.supportMessage.create({
      data: {
        ticketId: ticket.id,
        senderType: 'USER',
        senderId: user.id,
        message,
      },
    });
    await createSupportTicketEvent(ticket);

    return NextResponse.json({
      ok: true,
      ticket: {
        id: ticket.id,
        subject: ticket.subject,
        status: ticket.status,
        createdAt: ticket.createdAt,
      },
    });
  } catch (e: any) {
    console.error('Support ticket create error:', e);
    return NextResponse.json({ ok: false, error: e?.message || 'เกิดข้อผิดพลาด' }, { status: 500 });
  }
}

// GET /api/support — ดู ticket ของผู้ใช้ปัจจุบัน
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if (!token) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });

    const user = await getCurrentUser(token);
    if (!user) return NextResponse.json({ ok: false, error: 'ไม่พบข้อมูลผู้ใช้' }, { status: 403 });

    const tickets = await getMyTickets(user.id);
    return NextResponse.json({ ok: true, tickets });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}

const subjectOptions: readonly string[] = SUBJECT_OPTIONS;
