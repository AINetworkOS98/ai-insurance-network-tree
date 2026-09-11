import { prisma } from '@/lib/prisma';
import crypto from 'crypto';

export function makeEventId(eventType: string, recipientId: string, channel: string, period?: string){
  const base = `${eventType}:${recipientId}:${channel}:${period || ''}`;
  return crypto.createHash('sha256').update(base).digest('hex').slice(0,32);
}

// สร้าง Notification + EventOutbox แบบ idempotent (event_id+recipient+channel)
export async function emitNotification(opts:{
  userId: string;
  type: string; // สมัครสำเร็จ, ได้สมาชิกแนะนำใหม่, รับรองยอด ...
  title: string;
  body?: string;
  referenceId?: string;
  channel?: string; // in_app | email
  period?: string;
}){
  const channel = opts.channel || 'in_app';
  const eventId = makeEventId(opts.type, opts.userId, channel, opts.period);
  // กันส่งซ้ำ
  const exists: any = await prisma.eventOutbox.findUnique({ where:{ eventId } }).catch(()=> null);
  if(exists) return { deduped:true, eventId };

  // ตรวจการตั้งค่าผู้รับ (NotificationPreference) — ถ้าปิดไว้ให้ข้าม email
  if(channel==='email'){
    const pref: any = await prisma.notificationPreference.findUnique({ where:{ userId_eventKey_channel:{ userId: opts.userId, eventKey: opts.type, channel:'email' } } as any }).catch(()=> null);
    if(pref && pref.enabled===false) return { skipped:true, reason:'preference off' };
  }

  await prisma.notification.create({
    data:{ userId: opts.userId, type: opts.type, title: opts.title, body: opts.body || null, channel, referenceId: opts.referenceId || null } as any
  });
  await prisma.eventOutbox.create({
    data:{ eventId, eventType: opts.type, payload:{ title: opts.title, body: opts.body, referenceId: opts.referenceId } as any, recipientId: opts.userId, channel, status:'sent', sentAt: new Date() } as any
  }).catch(()=>{});

  // ถ้าเป็น email ให้สร้าง EmailMessage queue (Pending -> Sent/Failed แยกการส่งจริง)
  if(channel==='email'){
    const user: any = await prisma.user.findUnique({ where:{ id: opts.userId } }).catch(()=> null);
    if(user?.email && !user.email.includes('example.com')){
      // ไม่ส่งใบเสร็จ/ข้อมูลลูกค้าเต็มลงอีเมล — ส่งลิงก์ไปดูหลังล็อกอินเท่านั้น
      await prisma.emailMessage.create({
        data:{
          eventId, idempotencyKey: eventId, toEmail: user.email, toUserId: opts.userId,
          subject: opts.title, bodyHtml:`<p>${opts.body||''}</p><p><a href="${process.env.NEXT_PUBLIC_APP_URL||''}/notifications">ดูรายละเอียดหลังเข้าสู่ระบบ</a></p>`,
          status:'QUEUED' as any
        } as any
      }).catch(()=>{});
    }
  }
  return { ok:true, eventId };
}

export async function maintenanceWarningTemplate(periodLabel: string, metricLabel: string, verified: number, required: number){
  const remaining = Math.max(0, required - verified);
  const link = `${process.env.NEXT_PUBLIC_APP_URL||''}/periods`;
  return `แจ้งเตือนรอบ ${periodLabel}: ผลงาน ${metricLabel} ที่รับรองแล้ว ${verified.toLocaleString('th-TH')} บาท จากเกณฑ์ ${required.toLocaleString('th-TH')} บาท ยังขาด ${remaining.toLocaleString('th-TH')} บาท กรุณาตรวจสอบรายการก่อนปิดยอด ดูรายละเอียดได้ที่ ${link}`;
}
