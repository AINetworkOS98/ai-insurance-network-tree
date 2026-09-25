// Support Ticket API helpers — สร้าง ticket, จัดการ status, บันทึกข้อความ
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

export type SupportStatus = 'NEW' | 'IN_PROGRESS' | 'REPLIED' | 'CLOSED';

export const SUBJECT_OPTIONS = [
  'สอบถามรายได้',
  'เอกสาร',
  'ปัญหาการใช้งานระบบ',
  'บัญชีผู้ใช้',
  'แจ้งปัญหา',
  'อื่น ๆ',
] as const;

// ตรวจว่า user เป็น admin หรือไม่ (จาก roles ใน JWT payload)
export function isAdmin(payload: any): boolean {
  const roles = payload?.roles || [];
  return roles.includes('admin') || roles.includes('super_admin');
}

// ดึงข้อมูล user ปัจจุบันสำหรับสร้าง ticket
export async function getCurrentUser(token: string) {
  const payload = verifyToken(token);
  if (!payload) return null;
  if (['SUSPENDED', 'RESIGNED', 'INACTIVE'].includes(String(payload.status))) return null;
  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, displayName: true, firstName: true, lastName: true, email: true, phone: true, lineId: true, status: true },
    });
    return user;
  } catch {
    return null;
  }
}

// สร้าง ticket ใหม่จากผู้ใช้ทั่วไป
export async function createTicket(data: {
  userId: string;
  name: string;
  phone?: string;
  lineId?: string;
  subject: string;
  message: string;
}) {
  const ticket = await prisma.supportTicket.create({
    data: {
      userId: data.userId,
      name: data.name,
      phone: data.phone || null,
      lineId: data.lineId || null,
      subject: data.subject,
      message: data.message,
      status: 'NEW',
    },
  });
  return ticket;
}

// ดู ticket ของ user ปัจจุบัน
export async function getMyTickets(userId: string) {
  return prisma.supportTicket.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, phone: true, lineId: true,
      subject: true, message: true, status: true,
      createdAt: true, updatedAt: true, closedAt: true,
    },
  });
}

// ดู ticket สำหรับ admin (ทั้งหมด)
export async function getAdminTickets(filters?: {
  status?: SupportStatus | 'ALL';
  search?: string;
}) {
  const where: any = {};
  if (filters?.status && filters.status !== 'ALL') {
    where.status = filters.status;
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { phone: { contains: q, mode: 'insensitive' } },
      { lineId: { contains: q, mode: 'insensitive' } },
      { id: { contains: q } },
    ];
  }
  return prisma.supportTicket.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, senderType: true, senderId: true, message: true, createdAt: true, _count: { select: {} },
          sender: { select: { displayName: true, firstName: true, lastName: true } },
        },
      },
    },
  });
}

// ดู ticket รายละเอียด
export async function getTicketDetail(ticketId: string) {
  return prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      messages: {
        orderBy: { createdAt: 'asc' },
        include: {
          sender: { select: { displayName: true, firstName: true, lastName: true } },
        },
      },
    },
  });
}

// อัปเดต status + admin note
export async function updateTicketStatus(ticketId: string, data: { status?: SupportStatus; adminNote?: string }) {
  return prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      ...(data.status && { status: data.status }),
      ...(data.adminNote !== undefined && { adminNote: data.adminNote }),
      ...(data.status === 'CLOSED' && { closedAt: new Date() }),
      ...(data.status !== 'CLOSED' && { closedAt: null }),
    },
  });
}

// บันทึกข้อความใน ticket (USER หรือ ADMIN)
export async function addTicketMessage(data: {
  ticketId: string;
  senderType: 'USER' | 'ADMIN';
  senderId: string;
  message: string;
}) {
  return prisma.supportMessage.create({
    data: {
      ticketId: data.ticketId,
      senderType: data.senderType,
      senderId: data.senderId,
      message: data.message,
    },
    include: {
      sender: { select: { displayName: true, firstName: true, lastName: true } },
    },
  });
}

// นับ ticket ตาม status สำหรับ admin dashboard
export async function getSupportStats() {
  const all = await prisma.supportTicket.findMany();
  const counts: Record<string, number> = { NEW: 0, IN_PROGRESS: 0, REPLIED: 0, CLOSED: 0 };
  for (const t of all) {
    if (counts[t.status] !== undefined) counts[t.status]++;
  }
  return counts;
}
