import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/automation/flow — ข้อมูลจริงสำหรับแสดง "ระบบอัตโนมัติ (n8n) กำลังทำงาน"
// ใช้โดยคอมโพเนนต์ N8nLiveFlow บนหน้า /network/1x5-autopilot
//
// หลักการ:
//   • ตัวเลขทุกตัวมาจากฐานข้อมูลจริง (ไม่มีการสุ่ม/ไม่มีการแต่งตัวเลข)
//   • อ่านอย่างเดียว ไม่มีการเขียนข้อมูล
//   • ไม่มีข้อมูลส่วนบุคคลออกไปเลย — มีแต่ชื่อ event/หน้า และตัวเลขรวม
//   • ทุก query ห่อ .catch() เพื่อให้ส่วนใดส่วนหนึ่งล้มแล้วส่วนอื่นยังแสดงได้
// ─────────────────────────────────────────────────────────────────────────────

type Tone = 'sky' | 'emerald' | 'amber' | 'violet' | 'rose';
type FlowNode = {
  id: string;
  icon: string;
  label: string;
  sub: string;
  value: number;
  unit: string;
  tone: Tone;
};
type FlowEdge = [string, string];

const EVENT_TH: Record<string, string> = {
  page_view: 'เปิดดูหน้า',
  session_start: 'เริ่มใช้งาน',
  return_visit: 'กลับมาเยี่ยมชม',
  cta_click: 'กดปุ่มชวนทำต่อ (CTA)',
  form_open: 'เปิดฟอร์ม',
  form_submit: 'ส่งฟอร์ม',
  topic_select: 'เลือกหัวข้อที่สนใจ',
  callback_request: 'ขอให้ติดต่อกลับ',
  video_view: 'เริ่มดูคลิป',
  video_progress: 'ดูคลิปต่อเนื่อง',
  video_complete: 'ดูคลิปจบ',
};

// หน้าเว็บ → ชื่อที่คนทั่วไปอ่านเข้าใจ
const PAGE_TH: Record<string, string> = {
  '/network/1x5-autopilot': '1×5 Autopilot',
  '/network-simulator': 'โครงข่าย 1 แตก 5',
  '/financial-freedom': 'อิสรภาพทางการเงิน',
  '/prospects': 'ลีด/ผู้สนใจ',
  '/dashboard': 'แดชบอร์ดผลงาน',
  '/tree': 'ผังเครือข่าย',
  '/': 'หน้าแรก',
};

export async function GET() {
  const now = new Date();
  const day1 = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const hour1 = new Date(now.getTime() - 60 * 60 * 1000);

  const safe = async <T>(p: Promise<T>, fallback: T): Promise<T> => {
    try {
      return await p;
    } catch {
      return fallback;
    }
  };

  const db = prisma as any;

  const [
    events24h,
    events1h,
    visitors,
    profiles,
    hotLeads,
    members,
    placementRuns,
    audits,
    placements,
    emails,
    emailLogs,
    reports,
    agentLogs,
    lastEvent,
    recentRaw,
  ] = await Promise.all([
    safe(db.visitorEvent.count({ where: { at: { gte: day1 } } }), 0),
    safe(db.visitorEvent.count({ where: { at: { gte: hour1 } } }), 0),
    safe(db.visitor.count(), 0),
    safe(db.engagementScore.count(), 0),
    safe(prisma.prospect.count({ where: { leadScore: { gte: 60 } } }), 0),
    safe(prisma.user.count(), 0),
    safe(prisma.placementRun.count(), 0),
    safe(prisma.auditLog.count(), 0),
    safe(prisma.treePlacement.count(), 0),
    safe(prisma.emailMessage.count(), 0),
    safe(prisma.emailDeliveryLog.count(), 0),
    safe(db.notificationLog.count({ where: { type: 'activity.report' } }), 0),
    safe(
      prisma.auditLog.count({ where: { action: { contains: 'net1x5' } } }),
      0,
    ),
    safe(
      db.visitorEvent.findFirst({ orderBy: { at: 'desc' }, select: { at: true } }),
      null as any,
    ),
    safe(
      db.visitorEvent.findMany({
        take: 6,
        orderBy: { at: 'desc' },
        select: { type: true, pagePath: true, at: true },
      }),
      [] as Array<{ type: string; pagePath: string | null; at: Date }>,
    ),
  ]);

  // นับครั้งตามการกระทำจริงใน Audit Log (ใช้เป็นตัวเลขของแต่ละขั้นในวงจร 1×5)
  const actionCounts = await safe(
    prisma.auditLog.groupBy({ by: ['action'], _count: { _all: true } }),
    [] as Array<{ action: string; _count: { _all: number } }>,
  );
  const act = (name: string) =>
    Number(actionCounts.find((a) => a.action === name)?._count?._all || 0);

  const cut = act('net1x5.cut_member');
  const promoted = act('net1x5.promote_member');
  const runs = act('net1x5.run');
  const recalc = act('net1x5.tree_recalc');

  const flow1: FlowNode[] = [
    { id: 'cron', icon: '⏰', label: 'ตั้งเวลาตรวจรอบ', sub: 'n8n ทุก 15 นาที', value: runs, unit: 'รอบที่สั่งรัน', tone: 'sky' },
    { id: 'verify', icon: '🔎', label: 'ตรวจใบเสร็จ + เงื่อนไข', sub: 'ยอดรับรอง / ผ่อนผัน', value: audits, unit: 'รายการที่ตรวจ', tone: 'sky' },
    { id: 'cut', icon: '⛔', label: 'คัดสมาชิกที่ไม่ผ่าน', sub: 'ปลดช่องในผังทันที', value: cut, unit: 'ครั้งที่คัดออก', tone: 'rose' },
    { id: 'promote', icon: '⬆️', label: 'เลื่อนผู้มีคุณสมบัติขึ้นแทน', sub: 'ห้ามทิ้งตำแหน่งว่าง', value: promoted, unit: 'ครั้งที่เลื่อน', tone: 'emerald' },
    { id: 'relink', icon: '🧩', label: 'จัดสายงาน 1:5', sub: 'เชื่อม parent + ช่อง', value: placements, unit: 'ตำแหน่งในผัง', tone: 'violet' },
    { id: 'recalc', icon: '🔄', label: 'อัปเดตโครงสร้างทุกระดับ', sub: 'นับสายงานใหม่ทั้งต้นไม้', value: recalc, unit: 'รอบที่คำนวณ', tone: 'violet' },
    { id: 'log', icon: '📝', label: 'บันทึก Audit Log', sub: 'ตรวจย้อนหลังได้ทุกครั้ง', value: audits, unit: 'บันทึกในระบบ', tone: 'amber' },
  ];
  const flow1Edges: FlowEdge[] = [
    ['cron', 'verify'], ['verify', 'cut'], ['cut', 'promote'],
    ['promote', 'relink'], ['relink', 'recalc'], ['recalc', 'log'],
  ];

  const flow2: FlowNode[] = [
    { id: 'collect', icon: '🌐', label: 'รับกิจกรรมจากหน้าเว็บ', sub: 'ยิงเข้า n8n ทันทีที่เกิด', value: Number(events24h), unit: 'event 24 ชม.', tone: 'sky' },
    { id: 'store', icon: '💾', label: 'บันทึกกิจกรรม (ยินยอมก่อน)', sub: 'ไม่ยินยอม = ไม่เก็บ', value: Number(visitors), unit: 'ผู้เข้าชมในระบบ', tone: 'sky' },
    { id: 'score', icon: '🧠', label: 'ให้คะแนนความสนใจ (AI)', sub: 'จากพฤติกรรมจริงเท่านั้น', value: Number(profiles), unit: 'โปรไฟล์คะแนน', tone: 'violet' },
    { id: 'classify', icon: '🎯', label: 'คัดกลุ่มความสนใจสูง', sub: 'คะแนน 60 ขึ้นไป', value: Number(hotLeads), unit: 'รายที่ถึงเกณฑ์', tone: 'amber' },
    { id: 'report', icon: '📄', label: 'สร้างรายงานกิจกรรม', sub: 'สรุปจาก event จริง', value: Number(reports), unit: 'รายงานที่ออก', tone: 'violet' },
    { id: 'email', icon: '✉️', label: 'ส่งอีเมลถึงสมาชิก', sub: 'เฉพาะอีเมลที่ยืนยันแล้ว', value: Number(emails), unit: 'อีเมลในระบบ', tone: 'emerald' },
    { id: 'emaillog', icon: '📮', label: 'บันทึกผลการส่ง', sub: 'ส่งไม่ได้ = ไม่ล้มทั้งระบบ', value: Number(emailLogs), unit: 'บันทึกการส่ง', tone: 'amber' },
    { id: 'dashboard', icon: '📊', label: 'แดชบอร์ดผู้ดูแล', sub: 'เห็นทุกอย่างในที่เดียว', value: Number(members), unit: 'บัญชีในระบบ', tone: 'emerald' },
  ];
  const flow2Edges: FlowEdge[] = [
    ['collect', 'store'], ['store', 'score'], ['score', 'classify'],
    ['classify', 'report'], ['report', 'email'], ['email', 'emaillog'], ['emaillog', 'dashboard'],
  ];

  const recent = (recentRaw as Array<{ type: string; pagePath: string | null; at: Date }>).map((e) => ({
    at: e.at,
    event: EVENT_TH[e.type] || e.type,
    page: PAGE_TH[String(e.pagePath)] || (e.pagePath ? String(e.pagePath) : 'ทั้งเว็บ'),
  }));

  const lastAt: string | null = lastEvent?.at ? new Date(lastEvent.at).toISOString() : null;
  const online = !!lastAt && now.getTime() - new Date(lastAt).getTime() < 30 * 60 * 1000;

  return NextResponse.json(
    {
      ok: true,
      at: now.toISOString(),
      online,
      lastEventAt: lastAt,
      live: { events1h: Number(events1h), events24h: Number(events24h), agentLogs: Number(agentLogs) },
      flows: [
        {
          id: 'autopilot-1x5',
          name: 'วงจรบริหารเครือข่าย 1 แตก 5',
          engine: 'n8n · 5 workflow (01–05)',
          schedule: 'ทุก 15 นาที · ทุกวัน 06:00 · ทุก 30 นาที · ทุกชั่วโมง',
          summary:
            'ตรวจใบเสร็จ → คัดสมาชิกที่ไม่ผ่าน → เลื่อนผู้มีคุณสมบัติขึ้นแทน → จัดสายงาน 1:5 → คำนวณใหม่ทั้งต้นไม้ → บันทึก Log',
          nodes: flow1,
          edges: flow1Edges,
        },
        {
          id: 'member-interest',
          name: 'วงจรติดตามความสนใจสมาชิก',
          engine: 'n8n · Member Interest Radar',
          schedule: 'ทุก 10 นาที · รับ event ทันทีเมื่อมีคนใช้งาน',
          summary:
            'รับ event จากหน้าเว็บ → บันทึกเมื่อได้รับความยินยอม → ให้คะแนนความสนใจจากพฤติกรรมจริง → สร้างรายงาน → ส่งอีเมลถึงสมาชิก → บันทึกผล → แสดงบนแดชบอร์ด',
          nodes: flow2,
          edges: flow2Edges,
        },
      ],
      recent,
      note: 'ตัวเลขทุกตัวเป็นข้อมูลจริงจากฐานระบบ ณ เวลาที่โหลด · เป็นการอ่านอย่างเดียว · ไม่มีข้อมูลส่วนบุคคลของสมาชิกในหน้านี้',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
