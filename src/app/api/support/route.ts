import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sendEmail, escapeHtml } from '@/lib/memberMessages';
import {
  getCurrentUser, createTicket, getMyTickets, SUBJECT_OPTIONS,
} from '@/lib/support';
import { createSupportTicketEvent } from '@/lib/supportEvents';
import { sendToGoogleSheet } from '@/lib/googleSheet';

// ── กันสแปม: จำกัด 5 ครั้ง / 10 นาที ต่อ IP สำหรับผู้ที่ยังไม่ล็อกอิน ──
const RL_ANON = new Map<string, number[]>();
function allowAnonymous(ip: string, max = 5, windowMs = 10 * 60 * 1000) {
  const now = Date.now();
  const arr = (RL_ANON.get(ip) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { RL_ANON.set(ip, arr); return false; }
  arr.push(now);
  RL_ANON.set(ip, arr);
  if (RL_ANON.size > 5000) RL_ANON.clear();
  return true;
}

// POST /api/support — สร้าง ticket ใหม่ (ผู้ใช้ทั่วไป)
export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    const user = token ? await getCurrentUser(token).catch(() => null) : null;

    // คนที่ยังไม่ล็อกอินก็ส่งเรื่องได้ — แต่จำกัดจำนวนครั้งต่อ IP กันสแปม
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
    if (!user && !allowAnonymous(ip)) {
      return NextResponse.json({ ok: false, error: 'ส่งเรื่องบ่อยเกินไป — กรุณารอสักครู่แล้วลองใหม่ (เข้าสู่ระบบเพื่อส่งได้ไม่จำกัด)' }, { status: 429 });
    }

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

    const bodyName = String(body?.name || '').trim();
    const name = user
      ? (user.displayName || `${user.firstName} ${user.lastName}`.trim() || user.email || 'สมาชิก')
      : (bodyName || 'ผู้ติดต่อ (ไม่ระบุชื่อ)');
    // ผู้ที่ยังไม่ล็อกอินต้องให้เบอร์โทรไว้ติดต่อกลับ
    if (!user && !phone) return NextResponse.json({ ok: false, error: 'กรุณากรอกเบอร์โทรเพื่อให้เจ้าหน้าที่ติดต่อกลับ' }, { status: 400 });

    // ผู้ที่ยังไม่ล็อกอิน: ผูก ticket กับบัญชีแอดมิน (สคีมาบังคับต้องมี userId) และกำกับว่ามาจากฟอร์มสาธารณะ
    let ownerId = user?.id;
    if (!ownerId) {
      const admin = await prisma.user.findUnique({ where: { email: 'akarapol.pro798@gmail.com' }, select: { id: true } }).catch(() => null);
      ownerId = admin?.id;
      if (!ownerId) return NextResponse.json({ ok: false, error: 'ระบบยังไม่พร้อมรับข้อความ — กรุณาติดต่อทางโทรศัพท์' }, { status: 503 });
    }
    const finalName = user ? name : `(ฟอร์มสาธารณะ) ${name}`;

    const ticket = await createTicket({
      userId: ownerId,
      name: finalName,
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
        senderId: ownerId,
        message,
      },
    });
    await createSupportTicketEvent(ticket);

    // ── ส่งอีเมล + สร้างแจ้งเตือนในเมนูให้ Admin ──
    const { escapeHtml } = await import('@/lib/memberMessages');
    // ใช้ mailer.ts (เลือกผู้ส่งอัตโนมัติ: SMTP ของ Hostinger ก่อน แล้วค่อย Resend)
    const { sendMail } = await import('@/lib/mailer');
    const adminEmailList = ['akarapol.pro798@gmail.com'];
    const time = new Date(ticket.createdAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    const adminSubject = `📩 Support Ticket ใหม่: ${ticket.subject}`;
    const adminHtml = `<div style="font-family:sans-serif;max-width:600px">
      <h3 style="margin:0 0 12px">มีผู้ใช้ส่ง Support Ticket ใหม่</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <tr><td style="padding:4px 8px;font-weight:bold;background:#f8fafc;width:120px">ชื่อ</td><td style="padding:4px 8px">${escapeHtml(ticket.name)}</td></tr>
        ${ticket.phone ? `<tr><td style="padding:4px 8px;font-weight:bold;background:#f8fafc">โทร</td><td style="padding:4px 8px">${escapeHtml(ticket.phone)}</td></tr>` : ''}
        ${ticket.lineId ? `<tr><td style="padding:4px 8px;font-weight:bold;background:#f8fafc">LINE</td><td style="padding:4px 8px">${escapeHtml(ticket.lineId)}</td></tr>` : ''}
        <tr><td style="padding:4px 8px;font-weight:bold;background:#f8fafc">หัวข้อ</td><td style="padding:4px 8px">${escapeHtml(ticket.subject)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;background:#f8fafc">ข้อความ</td><td style="padding:4px 8px">${escapeHtml(ticket.message)}</td></tr>
        <tr><td style="padding:4px 8px;font-weight:bold;background:#f8fafc">เวลา</td><td style="padding:4px 8px">${time}</td></tr>
      </table>
      <a href="${process.env.NEXT_PUBLIC_APP_URL||'http://localhost:3000'}/admin/support" style="display:inline-block;padding:10px 16px;background:#0284c7;color:#fff;border-radius:8px;text-decoration:none">👉 เปิดดูรายละเอียด</a>
    </div>`;

    for (const adminEmail of adminEmailList) {
      (async () => {
        try {
          const adminUser = await prisma.user.findUnique({ where: { email: adminEmail }, select: { id: true } }).catch(() => null);
          if (adminUser) {
            await prisma.notification.create({
              data: {
                userId: adminUser.id,
                type: 'support.ticket.new',
                title: adminSubject,
                body: `จาก: ${escapeHtml(ticket.name)}\nหัวข้อ: ${ticket.subject}\nข้อความ: ${ticket.message.slice(0, 300)}`,
                channel: 'in_app',
                referenceId: ticket.id,
              } as any,
            });
          }
          const mailRes = await sendMail({ to: adminEmail, subject: adminSubject, html: adminHtml });
          if (mailRes.ok) console.log(`[support] ส่งอีเมลถึงแอดมินสำเร็จ (provider=${mailRes.provider})`);
          else console.error(`[support] ส่งอีเมลล้มเหลว (provider=${mailRes.provider}) error=${mailRes.error}`);
        } catch (e) {
          console.error('Admin notify error:', e);
        }
      })();
    }

    // ── ส่งไป Google Sheet (fire-and-forget) ──
    (async () => {
      try { await sendToGoogleSheet({ type:'support', name:ticket.name, phone:ticket.phone||'', lineId:ticket.lineId||'', subject:ticket.subject, message:ticket.message, ticketId:ticket.id }); } catch {}
    })();

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
