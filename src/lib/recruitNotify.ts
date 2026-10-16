// recruitNotify.ts — แจ้งเตือนทันทีเมื่อมีใบสมัครตัวแทนใหม่ (LINE + แจ้งเตือนในแอป)
//
// PDPA: ส่งเฉพาะข้อมูลที่จำเป็นต่อการติดต่อกลับ (ชื่อ/เบอร์/อีเมล/ผู้แนะนำ/รหัสผู้มุ่งหวัง)
//       ไม่ส่งเลขบัตรประชาชน ที่อยู่เต็ม หรือข้อมูลสุขภาพใด ๆ
import { prisma } from '@/lib/prisma';
import { notifyAdmins } from '@/lib/notify';
import { sendLineAlert } from '@/lib/lineAlert';

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://ai-insurance-network-tree.vercel.app').replace(/\/$/, '');
}

export function buildRecruitAlert(o: {
  name: string;
  phone?: string | null;
  email?: string | null;
  prospectCode: string;
  sponsorCode?: string | null;
  queueRef?: string | null;
  province?: string | null;
  occupation?: string | null;
  isUpdate?: boolean;
}): string {
  const L = [
    `${o.isUpdate ? '🔁 อัปเดตใบสมัคร' : '🔔 มีใบสมัครตัวแทนใหม่'}`,
    `ชื่อ: ${o.name || '-'}`,
    `เบอร์: ${o.phone || '-'}`,
    o.email ? `อีเมล: ${o.email}` : null,
    o.province ? `จังหวัด: ${o.province}` : null,
    o.occupation ? `อาชีพ: ${o.occupation}` : null,
    `ผู้แนะนำ: ${o.sponsorCode || '-'}`,
    `รหัสผู้มุ่งหวัง: ${o.prospectCode}${o.queueRef ? ` · เลขคิว: ${o.queueRef}` : ''}`,
    `ที่มา: ลิงก์รับสมัครออนไลน์`,
    `เวลา: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
    ``,
    `เปิดไปป์ไลน์: ${appUrl()}/recruit/pipeline`,
  ].filter(Boolean);
  return L.join('\n');
}

export type RecruitNotifyResult = {
  line: { configured: boolean; sent: boolean; error?: string | null };
  inApp: { notified: number };
};

export async function notifyNewRecruitApplication(o: {
  prospect: { id: string; prospectId: string; firstName?: string | null; lastName?: string | null };
  phone?: string | null;
  email?: string | null;
  sponsorCode?: string | null;
  queueRef?: string | null;
  province?: string | null;
  occupation?: string | null;
  isUpdate?: boolean;
}): Promise<RecruitNotifyResult> {
  const name = [o.prospect.firstName, o.prospect.lastName].filter(Boolean).join(' ').trim();
  const text = buildRecruitAlert({
    name,
    phone: o.phone,
    email: o.email,
    prospectCode: o.prospect.prospectId,
    sponsorCode: o.sponsorCode,
    queueRef: o.queueRef,
    province: o.province,
    occupation: o.occupation,
    isUpdate: o.isUpdate,
  });

  // ① LINE — ส่งทันทีถ้าตั้งค่าไว้ · ถ้ายังไม่ตั้งค่า/ส่งไม่ผ่าน เก็บคิวไว้ (โดย sendLineAlert)
  const line = await sendLineAlert({ text, refId: o.prospect.id, kind: 'recruit' });

  // ② แจ้งเตือนในแอป (กระดิ่ง 🔔) ให้ผู้ดูแลทุกคน — ทำงานได้แม้ไม่มี LINE
  let notified = 0;
  try {
    const { ADMIN_EMAILS } = await import('@/lib/admin');
    const admins: any[] = await prisma.user.findMany({ where: { email: { in: ADMIN_EMAILS } }, select: { id: true } }).catch(() => []);
    notified = admins.length;
  } catch { /* ignore */ }
  await notifyAdmins({
    type: 'recruit_application',
    title: `ใบสมัครตัวแทนใหม่: ${name || o.prospect.prospectId}`,
    body: `${o.phone || '-'} · ผู้แนะนำ ${o.sponsorCode || '-'} · รหัส ${o.prospect.prospectId}`,
    referenceId: o.prospect.id,
  }).catch(() => null);

  return { line, inApp: { notified } };
}
