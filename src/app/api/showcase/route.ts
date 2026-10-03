import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/showcase — ข้อมูลจริงสำหรับส่วน "ระบบอัตโนมัติทำงานจริง" บนหน้า /financial-freedom
 *
 * แสดงให้สมาชิกทั่วไปเห็นว่าระบบอัตโนมัติ (ชุด Passive Income 01–11 ของ n8n) ทำงานกับข้อมูลจริงอย่างไร
 * หลักการ:
 *  - คืน "ตัวเลขรวม" + "ตัวอย่างที่ปิดข้อมูลส่วนบุคคลแล้ว" เท่านั้น (PDPA)
 *  - ห้ามส่งชื่อเต็ม/เบอร์/อีเมล/เลขที่เอกสาร/รหัสอ้างอิง ออกไป — ชื่อย่อเหลือตัวอักษรแรก, เบอร์เหลือ 4 ตัวท้ายแบบปิด
 *  - ไม่มี mutation ทุกชนิด (อ่านอย่างเดียว)
 *  - ทุก query ถูกห่อ .catch() เพื่อให้ข้อมูลส่วนใดส่วนหนึ่งล้มแล้วส่วนอื่นยังแสดงได้
 */

// ข้อความจากฐานข้อมูลอาจมีอักขระเสีย (encoding เพี้ยนจากข้อมูลทดสอบ/นำเข้า) —
// ล้างให้เหลือเฉพาะไทย/ละติน/ตัวเลข/อักขระทั่วไป ถ้าเหลือน้อยเกินไปให้ใช้ค่าสำรอง
const cleanText = (raw?: string | null, fallback = '') => {
  const t = String(raw || '');
  const cleaned = t.replace(/[^\u0E00-\u0E7F\u0020-\u007E]/g, '').replace(/\s+/g, ' ').trim();
  const useful = cleaned.replace(/[^A-Za-z\u0E00-\u0E7F0-9]/g, '');
  return useful.length >= 2 ? cleaned : fallback;
};

// ชื่อที่แสดง: เก็บตัวอักษรแรกไว้เท่านั้น และถ้าข้อมูลเพี้ยนจนไม่เหลือตัวอักษรจริง ให้ใช้ข้อความกลาง ๆ
const maskName = (s?: string | null) => {
  const t = cleanText(s).trim();
  if (!t) return 'สมาชิกใหม่';
  const first = t[0];
  const isThai = first >= '\u0E00' && first <= '\u0E7F';
  const isLatin = /[A-Za-z]/.test(first);
  if (isThai && t.length >= 2) return `${first}***`;
  if (isLatin && t.replace(/[^A-Za-z]/g, '').length >= 4) return `${first}***`;
  return 'สมาชิกใหม่';
};

// ความสนใจถูกเก็บเป็นข้อความที่อาจซ้ำ/ยาว — ตัดซ้ำและจำกัดความยาวก่อนแสดง
const tidyInterest = (raw?: string | null, max = 3) => {
  const t = cleanText(raw);
  if (!t) return '';
  const parts = t
    .split(/[,;|/]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const uniq: string[] = [];
  for (const p of parts) if (!uniq.includes(p)) uniq.push(p);
  if (!uniq.length) return t.slice(0, 80);
  const head = uniq.slice(0, max).join(' · ');
  return uniq.length > max ? `${head} …` : head;
};

const STATUS_TH: Record<string, string> = {
  NEW: 'ลีดใหม่',
  CONTACTED: 'ติดต่อแล้ว',
  INTERESTED: 'สนใจ',
  APPOINTMENT: 'นัดหมายแล้ว',
  FOLLOW_UP: 'กำลังติดตาม',
  PREPARING_DOCUMENTS: 'เตรียมเอกสาร',
  APPLIED: 'ยื่นเอกสาร',
  CONVERTED: 'ปิดการขายแล้ว',
  NOT_INTERESTED: 'ไม่สนใจ',
  UNREACHABLE: 'ติดต่อไม่ได้',
  CANCELLED: 'ยกเลิก',
};

const FU_STATUS_TH: Record<string, string> = {
  scheduled: 'ตั้งเวลาไว้',
  sent: 'ส่งแล้ว',
  skipped: 'ข้าม (ไม่ยินยอม/ห้ามรบกวน)',
  cancelled: 'ยกเลิก',
  failed: 'ส่งไม่สำเร็จ',
};

const CHANNEL_TH: Record<string, string> = { email: 'อีเมล', line: 'LINE', sms: 'SMS', web_push: 'แจ้งเตือนเว็บ' };

const TASK_TYPE_TH: Record<string, string> = {
  high_intent_lead: 'ลีดคะแนนสูง — ให้ตัวแทนติดต่อ',
  follow_up_call: 'ตามผลการติดตาม',
  recommendation_review: 'ทบทวนข้อเสนอที่ AI แนะนำ',
  consent_request: 'ขอความยินยอมก่อนติดต่อ',
  data_cleanup: 'ตรวจความถูกต้องของข้อมูล',
};

const PRIORITY_TH: Record<string, string> = { low: 'ต่ำ', normal: 'ปกติ', high: 'สูง', urgent: 'เร่งด่วน' };

const shortDate = (d?: Date | null) => {
  if (!d) return '';
  try {
    return new Date(d).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const pickSkip = (count: number) => (count > 0 ? Math.floor(Math.random() * count) : 0);

type Sample = {
  step: string;
  badge: string;
  tone: 'blue' | 'violet' | 'emerald' | 'amber' | 'rose';
  title: string;
  lines: string[];
  when?: string;
};

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export async function GET() {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const last7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch {
      return fallback;
    }
  };

  const [
    members,
    activeMembers,
    ranked,
    leads,
    leadsHot,
    leadsToday,
    leads7d,
    tasksOpen,
    tasksHigh,
    tasksDone,
    fuScheduled,
    fuDue,
    fuSent,
    aptUpcoming,
    notifCount,
  ] = await Promise.all([
    safe(prisma.user.count({ where: { status: { notIn: ['RESIGNED'] } } }), 0),
    safe(prisma.user.count({ where: { status: 'ACTIVE' } }), 0),
    safe(prisma.user.count({ where: { status: { notIn: ['RESIGNED'] }, rankLevel: { gte: 1 } } }), 0),
    safe(prisma.prospect.count(), 0),
    safe(prisma.prospect.count({ where: { leadScore: { gte: 80 } } }), 0),
    safe(prisma.prospect.count({ where: { createdAt: { gte: startOfToday } } }), 0),
    safe(prisma.prospect.count({ where: { createdAt: { gte: last7 } } }), 0),
    safe(prisma.agentTask.count({ where: { status: 'open' } }), 0),
    safe(prisma.agentTask.count({ where: { priority: { in: ['high', 'urgent'] } } }), 0),
    safe(prisma.agentTask.count({ where: { status: 'done' } }), 0),
    safe(prisma.followUp.count({ where: { status: 'scheduled' } }), 0),
    safe(prisma.followUp.count({ where: { status: 'scheduled', scheduledAt: { lte: now } } }), 0),
    safe(prisma.followUp.count({ where: { status: 'sent' } }), 0),
    safe(prisma.appointment.count({ where: { startAt: { gte: now } } }), 0),
    safe(prisma.notification.count(), 0),
  ]);

  // ── ตัวอย่างจริง (สุ่ม) — ปิดข้อมูลส่วนบุคคลทุกชิ้น ──────────────────────────
  const samples: Sample[] = [];

  const leadTotal = num(leads);
  if (leadTotal > 0) {
    const row = await safe(
      prisma.prospect.findMany({
        select: { firstName: true, province: true, interest: true, leadScore: true, status: true, createdAt: true },
        skip: pickSkip(leadTotal),
        take: 1,
        orderBy: { createdAt: 'desc' },
      }),
      [] as Array<{ firstName: string; province: string | null; interest: string | null; leadScore: number; status: string; createdAt: Date }>,
    );
    const p = row[0];
    if (p) {
      const hot = p.leadScore >= 80;
      samples.push({
        step: hot ? '02' : '01',
        badge: hot ? 'Lead Scoring (AI) ให้คะแนนแล้ว' : 'Lead Capture รับลีดเข้าระบบ',
        tone: hot ? 'rose' : 'blue',
        title: `${maskName(p.firstName)} จากช่องทางออนไลน์`,
        lines: [
          `พื้นที่: ${cleanText(p.province, 'ไม่ระบุ')}`,
          `ความสนใจ: ${tidyInterest(p.interest) || 'ประกันชีวิต'}`,
          `คะแนนที่ระบบให้: ${p.leadScore}/100 ${hot ? '(ลีดร้อน)' : ''}`,
          `สถานะล่าสุด: ${STATUS_TH[p.status] || p.status}`,
        ],
        when: shortDate(p.createdAt),
      });
    }
  }

  const taskTotal = num(tasksOpen);
  if (taskTotal > 0) {
    const row = await safe(
      prisma.agentTask.findMany({
        where: { status: 'open' },
        select: { type: true, priority: true, status: true, triggerScore: true, channel: true, dueAt: true, createdAt: true },
        skip: pickSkip(taskTotal),
        take: 1,
        orderBy: { createdAt: 'desc' },
      }),
      [] as Array<{ type: string; priority: string; status: string; triggerScore: number | null; channel: string | null; dueAt: Date | null; createdAt: Date }>,
    );
    const t = row[0];
    if (t) {
      samples.push({
        step: '02',
        badge: 'ระบบสร้างงานให้ตัวแทนอัตโนมัติ',
        tone: 'amber',
        title: TASK_TYPE_TH[t.type] || 'งานติดตามลีด',
        lines: [
          `ความสำคัญ: ${PRIORITY_TH[t.priority] || t.priority}`,
          t.triggerScore ? `สร้างเพราะคะแนนแตะ ${t.triggerScore}` : 'สร้างจากเงื่อนไขที่ตั้งไว้',
          `ช่องทางที่ควรใช้: ${CHANNEL_TH[String(t.channel)] || t.channel || 'โทรศัพท์/อีเมล'}`,
          t.dueAt ? `ครบกำหนด: ${shortDate(t.dueAt)}` : 'ยังไม่ครบกำหนด',
        ],
        when: shortDate(t.createdAt),
      });
    }
  }

  // งานที่ระบบสร้างแล้ว "ปิดจบ" — ให้เห็นว่าระบบพางานไปจนจบ ไม่ใช่แค่สร้างงานทิ้งไว้
  const doneTotal = num(tasksDone);
  if (doneTotal > 0) {
    const row = await safe(
      prisma.agentTask.findMany({
        where: { status: 'done' },
        select: { type: true, priority: true, completedAt: true, channel: true },
        skip: pickSkip(doneTotal),
        take: 1,
        orderBy: { completedAt: 'desc' },
      }),
      [] as Array<{ type: string; priority: string; completedAt: Date | null; channel: string | null }>,
    );
    const dt = row[0];
    if (dt) {
      samples.push({
        step: '06',
        badge: 'งานที่ระบบมอบให้ — ปิดจบแล้ว',
        tone: 'emerald',
        title: TASK_TYPE_TH[dt.type] || 'งานติดตามลีด',
        lines: [
          `ความสำคัญ: ${PRIORITY_TH[dt.priority] || dt.priority}`,
          `ช่องทาง: ${CHANNEL_TH[String(dt.channel)] || 'โทรศัพท์/อีเมล'}`,
          'ตัวแทนกดปิดงานในระบบ → ผลถูกนับเข้า KPI รายวันทันที',
          'งานที่ไม่ปิดภายในกำหนด ระบบจะเตือนซ้ำให้เอง',
        ],
        when: shortDate(dt.completedAt),
      });
    }
  }

  const fuTotal = num(fuScheduled) + num(fuSent);
  if (fuTotal > 0) {
    const row = await safe(
      prisma.followUp.findMany({
        select: { dayOffset: true, channel: true, topic: true, status: true, scheduledAt: true, sentAt: true },
        skip: pickSkip(fuTotal),
        take: 1,
        orderBy: { scheduledAt: 'desc' },
      }),
      [] as Array<{ dayOffset: number; channel: string; topic: string | null; status: string; scheduledAt: Date; sentAt: Date | null }>,
    );
    const f = row[0];
    if (f) {
      samples.push({
        step: '03',
        badge: 'Follow-up Engine ทำงานเองตามกำหนด',
        tone: 'violet',
        title: `ติดตามครั้งที่ ${f.dayOffset} วัน ผ่าน${CHANNEL_TH[f.channel] || f.channel}`,
        lines: [
          `หัวข้อ: ${f.topic || 'ให้ข้อมูลเพิ่มเติมอย่างนุ่มนวล'}`,
          `สถานะ: ${FU_STATUS_TH[f.status] || f.status}`,
          'ระบบไม่ส่งหาลูกค้าถ้ายังไม่ยินยอมในช่องทางนั้น',
          f.sentAt ? `ส่งเมื่อ: ${shortDate(f.sentAt)}` : `ตั้งเวลาไว้: ${shortDate(f.scheduledAt)}`,
        ],
        when: shortDate(f.sentAt || f.scheduledAt),
      });
    }
  }

  const aptTotal = await safe(prisma.appointment.count(), 0);
  if (num(aptTotal) > 0) {
    const row = await safe(
      prisma.appointment.findMany({
        select: { title: true, startAt: true, status: true },
        skip: pickSkip(num(aptTotal)),
        take: 1,
        orderBy: { startAt: 'desc' },
      }),
      [] as Array<{ title: string; startAt: Date; status: string }>,
    );
    const a = row[0];
    if (a) {
      const statusTH = a.status === 'scheduled' ? 'นัดไว้แล้ว' : a.status === 'done' ? 'พบกันแล้ว' : a.status;
      samples.push({
        step: '04',
        badge: 'Appointment Automation เตือนอัตโนมัติ',
        tone: 'emerald',
        title: 'นัดนำเสนอ/ให้คำปรึกษา',
        lines: [
          `กำหนดการ: ${shortDate(a.startAt)}`,
          `สถานะ: ${statusTH}`,
          'ระบบเตือนตัวแทนก่อนนัด 24 ชม. และ 2 ชม. อัตโนมัติ',
          'ถ้าไม่มาตามนัด ระบบสร้างงานติดตามให้ทันที',
        ],
        when: shortDate(a.startAt),
      });
    }
  }

  if (num(members) > 0) {
    const row = await safe(
      prisma.user.findMany({
        select: { firstName: true, displayName: true, rankLevel: true, status: true, createdAt: true },
        skip: pickSkip(num(members)),
        take: 1,
        orderBy: { createdAt: 'desc' },
      }),
      [] as Array<{ firstName: string | null; displayName: string | null; rankLevel: number | null; status: string; createdAt: Date }>,
    );
    const u = row[0];
    if (u) {
      samples.push({
        step: '05',
        badge: 'Team Network นับสายงานให้เอง',
        tone: 'blue',
        title: `สมาชิก ${maskName(u.displayName || u.firstName)} เข้าสู่เครือข่าย`,
        lines: [
          `ระดับ: ${u.rankLevel && u.rankLevel > 0 ? `rank ${u.rankLevel}` : 'สมาชิกใหม่'}`,
          `สถานะบัญชี: ${u.status === 'ACTIVE' ? 'ใช้งานอยู่' : u.status}`,
          'ระบบบันทึกผู้แนะนำ + ตำแหน่งในผัง 1×5 อัตโนมัติ',
          'ตัวเลขเครือข่ายอัปเดตทุกวันโดยไม่ต้องนับมือ',
        ],
        when: shortDate(u.createdAt),
      });
    }
  }

  const steps = [
    { id: '01', code: '01_LEAD_CAPTURE', icon: '🎯', name: 'รับลีดทุกช่องทาง', tagline: 'เว็บ · ฟอร์ม · TikTok · LINE · โฆษณา', value: num(leads), unit: 'ลีดในระบบ' },
    { id: '02', code: '02_LEAD_SCORING', icon: '🧠', name: 'AI ให้คะแนนลีด', tagline: 'แยกลีดร้อน/อุ่น + สร้างงานให้ตัวแทน', value: num(leadsHot), unit: 'ลีดคะแนน 80+' },
    { id: '03', code: '03_FOLLOWUP_ENGINE', icon: '🔁', name: 'ติดตามอัตโนมัติ D0–D14', tagline: 'ไม่ลืมติดตาม · ไม่รบกวนเกินจำเป็น', value: num(fuScheduled), unit: 'รอถึงกำหนดส่ง' },
    { id: '04', code: '04_APPOINTMENT', icon: '📅', name: 'นัดหมาย + เตือนอัตโนมัติ', tagline: 'เตือนก่อนนัด 24 ชม. / 2 ชม.', value: num(aptUpcoming), unit: 'นัดข้างหน้า' },
    { id: '05', code: '05_TEAM_NETWORK', icon: '🌳', name: 'นับเครือข่าย 1×5', tagline: 'ผู้แนะนำ · ชั้นสายงาน · ผลงานทีม', value: num(members), unit: 'สมาชิกทั้งหมด' },
    { id: '06', code: '06_DAILY_KPI', icon: '📊', name: 'KPI รายวันอัตโนมัติ', tagline: 'ลีด · นัด · ปิดการขาย · งานค้าง', value: num(leadsToday), unit: 'ลีดใหม่วันนี้' },
    { id: '07', code: '07_WEEKLY_REPORT', icon: '🗓️', name: 'รายงานสัปดาห์ + AI วิเคราะห์', tagline: 'ส่งให้หัวหน้าทีมเองทุกสัปดาห์', value: num(leads7d), unit: 'ลีด 7 วันล่าสุด' },
    { id: '08', code: '08_MONTHLY_FINANCIAL', icon: '💠', name: 'สรุปการเงินรายเดือน', tagline: 'กระแสเงินสด · อัตราการออม · เงินฉุกเฉิน', value: num(ranked), unit: 'สมาชิกที่มีระดับ' },
    { id: '09', code: '09_AI_COACH', icon: '🧭', name: 'โค้ชการเงิน AI', tagline: 'Foundation → Income → Team → System → Assets', value: num(tasksHigh), unit: 'งานสำคัญที่ AI ชี้', },
    { id: '10', code: '10_NOTIFICATION', icon: '🔔', name: 'แจ้งเตือนหลายช่องทาง', tagline: 'อีเมล · เว็บ · LINE', value: num(notifCount), unit: 'การแจ้งเตือน' },
    { id: '11', code: '11_ERROR_HANDLER', icon: '🛡️', name: 'เฝ้าระวัง + แก้ข้อผิดพลาด', tagline: 'บันทึก · แจ้งผู้ดูแล · ทำงานต่อได้', value: num(tasksOpen), unit: 'งานที่ระบบมอบให้' },
  ];

  return NextResponse.json(
    {
      ok: true,
      at: now.toISOString(),
      totals: {
        members: num(members),
        activeMembers: num(activeMembers),
        leads: num(leads),
        leadsHot: num(leadsHot),
        tasksOpen: num(tasksOpen),
        followupsDue: num(fuDue),
        followupsSent: num(fuSent),
        appointmentsUpcoming: num(aptUpcoming),
      },
      steps,
      samples: samples.sort(() => Math.random() - 0.5),
      note: 'ตัวเลขและตัวอย่างทั้งหมดเป็นข้อมูลจริงจากฐานระบบ โดยปิดชื่อ-เบอร์-อีเมลของลูกค้าแล้ว (PDPA)',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
