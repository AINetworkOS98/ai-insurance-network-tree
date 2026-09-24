// ระบบข้อความสมาชิก — สร้างข้อความ + แจ้งเตือน (Email + LINE) แบบแยก error
// ห้ามให้ Email/LINE ส่งไม่สำเร็จทำให้การบันทึกข้อความล้มเหลว (สเปคหมวด 10)
import { prisma } from '@/lib/prisma';
import { sendLineMessage } from '@/lib/line';

export const MEMBER_QUESTION_ADMIN_EMAIL = 'akarapol.pro798@gmail.com';

function adminUrl(path: string) {
  return `${process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || 'http://localhost:3000'}${path}`;
}

// ส่งอีเมลผ่าน Resend (server-side เท่านั้น) — คืนผลเพื่อ log
async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.EMAIL_API_KEY;
  const from = process.env.EMAIL_FROM_ADDRESS;
  if (!apiKey || !from) {
    return { ok: false, error: 'EMAIL_API_KEY / EMAIL_FROM_ADDRESS ยังไม่ได้ตั้งค่า' };
  }
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(apiKey);
    const r: any = await resend.emails.send({ from, to: [opts.to], subject: opts.subject, html: opts.html });
    if (r?.error) return { ok: false, error: typeof r.error === 'string' ? r.error : r.error?.message || 'Resend error' };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'Email send failed' };
  }
}

// เขียน log ลง NotificationLog (best-effort ไม่ throw)
async function logNotification(opts: {
  type: string; channel: string; target: string; messageId?: string;
  status: 'SENT' | 'FAILED'; error?: string; payload?: any;
}) {
  try {
    await (prisma as any).notificationLog.create({
      data: {
        type: opts.type, channel: opts.channel, target: opts.target,
        messageId: opts.messageId || null, status: opts.status,
        error: opts.error || null, payload: opts.payload || null,
        sentAt: opts.status === 'SENT' ? new Date() : null,
      },
    });
  } catch {}
}

// ── สร้างข้อความใหม่จากสมาชิก + แจ้งเตือน admin (email + LINE) ──
export async function createMemberMessage(opts: { memberId: string; message: string }): Promise<{ ok: boolean; message?: any; error?: string }> {
  try {
    const member: any = await prisma.user.findUnique({
      where: { id: opts.memberId },
      select: { id: true, displayName: true, firstName: true, lastName: true, email: true },
    }).catch(() => null);
    const memberName = member?.displayName || [member?.firstName, member?.lastName].filter(Boolean).join(' ') || member?.email || 'สมาชิก';

    const msg: any = await prisma.memberMessage.create({
      data: { memberId: opts.memberId, message: opts.message, status: 'PENDING' } as any,
    });

    // แจ้งเตือนแบบ fire-and-forget — ไม่บล็อกการบันทึก
    const question = opts.message;
    const time = new Date(msg.createdAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    const link = adminUrl('/admin/messages');

    // 1) Email
    const emailSubject = 'มีสมาชิกส่งคำถามใหม่';
    const emailHtml = `<div style="font-family:sans-serif;max-width:560px">
      <h3 style="margin:0 0 12px">📩 มีสมาชิกส่งคำถามใหม่</h3>
      <p><b>👤 สมาชิก:</b> ${escapeHtml(memberName)}</p>
      <p><b>🕐 เวลา:</b> ${time}</p>
      <p><b>💬 คำถาม:</b></p>
      <p style="background:#f8fafc;padding:12px;border-radius:8px;white-space:pre-wrap">${escapeHtml(question)}</p>
      <p><a href="${link}" style="display:inline-block;padding:10px 16px;background:#0284c7;color:#fff;border-radius:8px;text-decoration:none">👉 เปิดหน้า Admin ตอบสมาชิก</a></p>
    </div>`;

    (async () => {
      const r = await sendEmail({ to: MEMBER_QUESTION_ADMIN_EMAIL, subject: emailSubject, html: emailHtml });
      await logNotification({ type: 'member.question.new', channel: 'email', target: MEMBER_QUESTION_ADMIN_EMAIL, messageId: msg.id, status: r.ok ? 'SENT' : 'FAILED', error: r.error, payload: { memberName, question: question.slice(0, 200) } });
    })();

    // 2) LINE
    (async () => {
      const lineText = `🔔 มีคำถามจากสมาชิกใหม่\n\n👤 สมาชิก: ${memberName}\n🕐 เวลา: ${time}\n\n💬 คำถาม:\n${question}\n\n👉 กรุณาเข้า Admin เพื่อดำเนินการตอบ:\n${link}`;
      const r = await sendLineMessage(lineText);
      await logNotification({ type: 'member.question.new', channel: 'line', target: process.env.LINE_TARGET_ID || 'LINE_TARGET_ID', messageId: msg.id, status: r.ok ? 'SENT' : 'FAILED', error: r.error, payload: { memberName } });
    })();

    return { ok: true, message: msg };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'บันทึกข้อความไม่สำเร็จ' };
  }
}

// ── ตอบสมาชิก + เปลี่ยนสถานะเป็น REPLIED + แจ้งเตือน LINE ──
export async function replyMemberMessage(opts: { messageId: string; repliedBy: string; replyMessage: string }): Promise<{ ok: boolean; reply?: any; error?: string }> {
  try {
    const msg: any = await prisma.memberMessage.findUnique({ where: { id: opts.messageId }, include: { member: { select: { displayName: true, firstName: true, lastName: true, email: true } } } }).catch(() => null);
    if (!msg) return { ok: false, error: 'ไม่พบข้อความ' };

    const reply: any = await prisma.messageReply.create({
      data: { messageId: opts.messageId, repliedBy: opts.repliedBy, replyMessage: opts.replyMessage } as any,
    });
    await prisma.memberMessage.update({ where: { id: opts.messageId }, data: { status: 'REPLIED' } as any });

    const memberName = msg.member?.displayName || [msg.member?.firstName, msg.member?.lastName].filter(Boolean).join(' ') || msg.member?.email || 'สมาชิก';
    const time = new Date(reply.createdAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });

    // LINE แจ้งว่า admin ตอบแล้ว (fire-and-forget)
    (async () => {
      const lineText = `✅ ตอบสมาชิกแล้ว\n\n👤 สมาชิก: ${memberName}\n🕐 เวลาตอบ: ${time}\n\n💬 คำตอบ:\n${opts.replyMessage}`;
      const r = await sendLineMessage(lineText);
      await logNotification({ type: 'member.question.replied', channel: 'line', target: process.env.LINE_TARGET_ID || 'LINE_TARGET_ID', messageId: opts.messageId, status: r.ok ? 'SENT' : 'FAILED', error: r.error, payload: { memberName } });
    })();

    return { ok: true, reply };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'บันทึกคำตอบไม่สำเร็จ' };
  }
}

function escapeHtml(s: string) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}
