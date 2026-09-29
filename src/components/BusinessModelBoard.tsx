/**
 * BusinessModelBoard — โมเดลธุรกิจตัวแทนประกันชีวิต "รายได้ 2 ทาง"
 * ต่อลงมาจากหน้า /progress (เส้นทางตำแหน่ง)
 *
 * กฎการแสดงผล (ตามที่ผู้ใช้กำหนด):
 *   [เอกสาร] = ตัวเลข/เงื่อนไขที่มาจากเอกสาร "สร้างโมเดลธุรกิจ" เท่านั้น
 *   [ประมาณการ] = ตัวเลขที่ระบบคำนวณ/สมมติขึ้น — ไม่ใช่การรับประกันรายได้
 *   [รอข้อมูล] = ยังไม่มีข้อมูลจากผู้ใช้ จึงไม่คำนวณให้ (ห้ามแต่งตัวเลข)
 * ไม่มี state/hook ใด ๆ — เป็น presentational component ทั้งหมด
 */

import type { ReactNode } from 'react';

type TagKind = 'doc' | 'est' | 'need';

const SECTIONS = [
  { id: 'bm', n: 1, th: 'โมเดลธุรกิจ' },
  { id: 'income', n: 2, th: 'โมเดลรายได้ 2 เครื่องยนต์' },
  { id: 'funnel', n: 3, th: 'Funnel การขาย' },
  { id: 'recruit', n: 4, th: 'Funnel การสร้างทีม' },
  { id: 'kpi', n: 5, th: 'KPI 4 ระดับ' },
  { id: 'roadmap', n: 6, th: 'Roadmap 24 เดือน' },
  { id: 'auto', n: 7, th: 'AI + Automation' },
  { id: 'dash', n: 8, th: 'Dashboard ผู้บริหาร' },
  { id: 'action', n: 9, th: 'แผนปฏิบัติการ' },
  { id: 'daily', n: 10, th: 'ตารางทำงานรายวัน' },
  { id: 'ask', n: 11, th: 'ข้อมูลที่ต้องยืนยัน' },
];

/** เงื่อนไขตำแหน่ง — คัดจากเอกสารเท่านั้น (ห้ามเติมเอง) */
const CAREER = [
  {
    rank: 'ตัวแทน',
    doc: 'อายุงาน 1–6 เดือน • ค่าคอมมิชชั่น 20,000 บาทขึ้นไป',
    duty: 'ขายประกันชีวิต • ดูแลลูกค้า',
    engine: 'Active Income',
  },
  {
    rank: 'ผู้บริหารหน่วย',
    doc: 'อายุงาน 3–6 เดือน • ค่าคอมมิชชั่น 75,000 บาทขึ้นไป • สร้าง 3 หน่วย',
    duty: 'ขาย + เริ่มสร้างทีม + ดูแลทีมชุดแรก',
    engine: 'Active + Team',
  },
  {
    rank: 'ผู้บริหารศูนย์',
    doc: 'เอกสารชุดนี้ไม่ระบุเงื่อนไข — ต้องยืนยัน',
    duty: 'บริหารหลายหน่วย + ดูแลผู้บริหารหน่วย',
    engine: 'Team Income',
    warn: 'หน้า /career ระบุเงื่อนไขผู้บริหารศูนย์ไว้ที่ 75,000 บาท/3–6 เดือน/แยกหน่วย ซึ่งซ้ำกับผู้บริหารหน่วยในเอกสารชุดนี้ — ต้องยืนยันว่าเลขถูกต้องที่ระดับใด',
  },
  {
    rank: 'ผู้บริหารภาค',
    doc: 'อายุงาน 12–24 เดือน • ค่าคอมมิชชั่น 1,200,000 บาท • สร้าง 5 ศูนย์',
    duty: 'บริหารศูนย์หลายแห่ง + พัฒนาผู้บริหารรุ่นต่อไป',
    engine: 'Team Income',
  },
  {
    rank: 'ผู้จัดการฝ่าย',
    doc: 'อายุงาน 24 เดือนขึ้นไป • เบี้ยปีแรกทั้งปีรวม 30 ล้านบาท • สร้างภาค 8 ภาค',
    duty: 'บริหารภาค + วางกลยุทธ์องค์กร',
    engine: 'Team Income',
    warn: 'เอกสารชุดนี้ให้เงื่อนไขผู้บริหารภาค = สร้าง 5 ศูนย์ แต่หน้า /career ระบุ 4 ศูนย์ — ต้องยืนยัน',
  },
];

const ENGINE_A = [
  { k: 'Lead ทั้งหมด', note: 'จำนวนคนที่เข้ามา (จากทุกช่องทาง)' },
  { k: 'นัดหมาย', note: 'จำนวนนัดที่เกิดขึ้นจริง' },
  { k: 'นำเสนอ (FNA)', note: 'วิเคราะห์ความต้องการ + เสนอแบบ' },
  { k: 'Conversion Rate', note: 'ปิดได้กี่รายจากที่นำเสนอ' },
  { k: 'จำนวนกรมธรรม์', note: 'ฉบับที่ออกจริง' },
  { k: 'เบี้ยประกันรวม', note: 'เบี้ยปีแรกของกรมธรรม์ที่ออก' },
  { k: 'ค่าคอมมิชชั่นโดยประมาณ', note: '% ตามตารางผลิตภัณฑ์ (ต้องยืนยันอัตราจริง)' },
];

const ENGINE_B = [
  { k: 'Recruit', note: 'จำนวนคนที่เริ่มต้นเป็นตัวแทน' },
  { k: 'ตัวแทน Active', note: 'คนที่ยังออกผลงานสม่ำเสมอ' },
  { k: 'ผู้บริหารหน่วย', note: 'คนที่ขึ้นตำแหน่งตามเงื่อนไขเอกสาร' },
  { k: 'จำนวนหน่วย', note: 'นับหน่วยที่สร้างได้' },
  { k: 'จำนวนศูนย์', note: 'จำนวนศูนย์ในเครือข่าย' },
  { k: 'จำนวนภาค', note: 'เป้าหมายสูงสุดของเส้นทาง' },
];

const SALES_FUNNEL = ['Traffic', 'Lead', 'Contact', 'Appointment', 'Financial Needs Analysis', 'Proposal', 'Closing', 'Policy Issued', 'Customer Care', 'Referral'];
const RECRUIT_FUNNEL = ['Content', 'ผู้สนใจอาชีพ', 'Recruit Lead', 'สัมภาษณ์', 'สมัคร', 'เริ่มงาน', 'สร้างผลงาน', 'ขึ้นผู้บริหารหน่วย', 'สร้างผู้บริหารรุ่นต่อไป'];

const KPI: { group: string; tone: string; items: string[] }[] = [
  { group: 'Daily KPI', tone: 'sky', items: ['จำนวนคนที่ติดต่อ', 'จำนวน Follow-up', 'จำนวน Lead ใหม่', 'จำนวนการนัดหมาย'] },
  { group: 'Weekly KPI', tone: 'indigo', items: ['จำนวน Meeting', 'จำนวน Proposal', 'จำนวน Closing', 'จำนวน Recruit', 'จำนวน Training'] },
  { group: 'Monthly KPI', tone: 'amber', items: ['เบี้ยประกัน', 'ค่าคอมมิชชั่น', 'จำนวนลูกค้าใหม่', 'จำนวนตัวแทนใหม่', 'จำนวนตัวแทน Active', 'จำนวนผู้บริหารที่สร้างได้'] },
  { group: 'Leadership KPI', tone: 'emerald', items: ['จำนวนหน่วย', 'จำนวนศูนย์', 'ผลงานรวมทีม', 'จำนวนผู้บริหารรุ่นใหม่', 'Retention ของทีม'] },
];

const ROADMAP = [
  { range: 'เดือน 1–3', goal: 'สร้างตัวเองให้ขายได้', detail: 'เน้นทำ Lead ให้พอ + ปิดเคสให้ได้สม่ำเสมอ (ฐานรายได้ Active)' },
  { range: 'เดือน 4–6', goal: 'สร้างทีมชุดแรก', detail: 'เริ่ม Recruit + วางระบบติดตามคนใหม่ (ปูทาง Team Income)' },
  { range: 'เดือน 7–12', goal: 'สร้างระบบและผู้บริหาร', detail: 'ทำให้การขายและ Recruit เป็นระบบ ทำซ้ำได้ + ดันคนแรกขึ้นผู้บริหาร' },
  { range: 'เดือน 13–18', goal: 'ขยายศูนย์', detail: 'เพิ่มจำนวนหน่วย/ศูนย์ในเครือข่าย + พัฒนาผู้บริหารที่มีอยู่' },
  { range: 'เดือน 19–24', goal: 'สร้างองค์กรระดับภาค', detail: 'เป้าหมายตามเงื่อนไขเอกสาร: สร้าง 5 ศูนย์ → ภาค', cond: true },
];

const AUTOMATION = [
  { g: 'Lead Generation', items: ['TikTok / Facebook / LINE', 'Content ปกติต่อเนื่อง', 'Landing Page + ฟอร์มเก็บ Lead', 'ป้าย QR/ลิงก์ในทุกรีล'] },
  { g: 'Lead Management', items: ['เก็บ Lead ลงฐานข้อมูลเดียว', 'Lead Score จัดลำดับความร้อน', 'Follow-up อัตโนมัติตามรอบ', 'Pipeline + นัดหมาย'] },
  { g: 'Sales Automation', items: ['Script/สคริปต์ขาย', 'ข้อความ Follow-up ตามสถานะ', 'สร้าง Proposal จากข้อมูลลูกค้า', 'Reminder + Customer Care'] },
  { g: 'Recruitment Automation', items: ['Recruit Lead เข้าคิว', 'นัดสัมภาษณ์', 'ส่งข้อมูลอาชีพให้ผู้สนใจ', 'ติดตามผู้สมัคร + Onboarding'] },
  { g: 'Team Management', items: ['Dashboard ทีม', 'KPI รายวัน/สัปดาห์', 'Training และคลังความรู้', 'Performance Tracking + พัฒนาผู้นำ'] },
];

const DASH = [
  { k: 'รายได้ส่วนตัว', tag: 'Active' },
  { k: 'รายได้ทีม', tag: 'Team' },
  { k: 'ยอดเบี้ยรวม', tag: 'ทั้งทีม' },
  { k: 'จำนวน Lead', tag: 'ต้นน้ำ' },
  { k: 'Conversion Rate', tag: 'คุณภาพการปิด' },
  { k: 'จำนวนตัวแทน', tag: 'ขนาดทีม' },
  { k: 'จำนวน Active Agent', tag: 'ทีมที่ออกผลงาน' },
  { k: 'จำนวนผู้บริหาร', tag: 'ผู้นำที่สร้างได้' },
  { k: 'จำนวนหน่วย', tag: 'โครงสร้าง' },
  { k: 'จำนวนศูนย์', tag: 'โครงสร้าง' },
  { k: 'ความก้าวหน้าสู่ตำแหน่งถัดไป', tag: 'เทียบเกณฑ์เอกสาร' },
];

const STATUS_RULE = [
  { icon: '🔴', label: 'ต้องเร่ง', desc: 'ต่ำกว่าเป้าที่วางไว้ชัดเจน — ต้องแก้ทันทีสัปดาห์นี้' },
  { icon: '🟡', label: 'ต้องติดตาม', desc: 'ใกล้เป้าแต่ยังไม่ถึง — เฝ้าดูและเพิ่มกิจกรรมต้นน้ำ' },
  { icon: '🟢', label: 'ตามเป้าหมาย', desc: 'อยู่ในจังหวะ — รักษาอัตราเดิมและต่อยอด' },
];

const ACTION_90 = [
  {
    month: 'เดือนที่ 1',
    theme: 'สร้างยอดขาย + สร้าง Lead',
    rows: [
      { k: 'เป้าหมาย', v: 'ตั้งฐานรายได้จาก Active Income ให้เกิดขึ้นจริง + มี Lead ไหลสม่ำเสมอ' },
      { k: 'KPI', v: 'KPI รายวัน (คนที่ติดต่อ / Follow-up / Lead ใหม่ / นัดหมาย) + เบี้ยปิดได้รายสัปดาห์' },
      { k: 'กิจกรรม', v: 'Content ทุกวันผ่าน TikTok/Facebook/LINE • ติดต่อรายชื่อเดิม + ใหม่ • นัดและนำเสนอ' },
      { k: 'จำนวนที่ต้องทำ', v: 'รอข้อมูลจากคุณ (จำนวนชั่วโมงทำงาน/รายชื่อที่มี) ก่อนกำหนดตัวเลข' },
      { k: 'ผลลัพธ์ที่คาดหวัง', v: 'มี Pipeline กลางที่เดินได้เอง + ตัวเลขจริงพอจะคำนวณ Conversion ของคุณ' },
      { k: 'สิ่งที่ต้องปรับปรุง', v: 'ช่องทาง Lead ที่ให้ผลจริง vs ที่กินเวลา' },
    ],
  },
  {
    month: 'เดือนที่ 2',
    theme: 'เพิ่ม Conversion + เริ่มสร้างทีม',
    rows: [
      { k: 'เป้าหมาย', v: 'ทำอัตราปิดให้ดีขึ้นจากเดือนแรก + Recruit คนแรกให้เริ่มงาน' },
      { k: 'KPI', v: 'Weekly KPI (Meeting / Proposal / Closing / Recruit / Training)' },
      { k: 'กิจกรรม', v: 'เก็บ Lead ลงระบบ + Lead Score • Follow-up ตามรอบ • เปิดช่อง Recruit (Content + บอกต่อ)' },
      { k: 'จำนวนที่ต้องทำ', v: 'รอข้อมูลจากคุณ (Conversion จริงเดือน 1) ก่อนกำหนดตัวเลข' },
      { k: 'ผลลัพธ์ที่คาดหวัง', v: 'Conversion สูงขึ้น + มีตัวแทนชุดแรกที่กำลังเริ่มออกผลงาน' },
      { k: 'สิ่งที่ต้องปรับปรุง', v: 'สคริปต์/ข้อเสนอ + ขั้นตอนติดตามผู้สนใจอาชีพ' },
    ],
  },
  {
    month: 'เดือนที่ 3',
    theme: 'สร้างระบบ + สร้างผู้นำ',
    rows: [
      { k: 'เป้าหมาย', v: 'ทำให้ ขาย และ Recruit เป็นระบบทำซ้ำได้ พร้อมดันคนแรกขึ้นผู้บริหารหน่วย' },
      { k: 'KPI', v: 'Monthly KPI + Leadership KPI (จำนวนหน่วย / ผลงานรวมทีม / ผู้บริหารรุ่นใหม่)' },
      { k: 'กิจกรรม', v: 'วางระบบ Follow-up + Training • Coaching รายสัปดาห์ • วัดผลและปรับเป้า' },
      { k: 'จำนวนที่ต้องทำ', v: 'รอข้อมูลจากคุณ (จำนวนตัวแทน in team + เวลาที่มีจริง)' },
      { k: 'ผลลัพธ์ที่คาดหวัง', v: 'ทีมทำงานตามระบบได้แม้คุณไม่ต้องอยู่ทุกขั้นตอน' },
      { k: 'สิ่งที่ต้องปรับปรุง', v: 'จุดที่ระบบยังพังเมื่อคุณไม่ว่าง + เรื่องที่ต้องสอนซ้ำ' },
    ],
  },
];

const DAILY = [
  { t: '08:00–09:00', a: 'Review KPI + วางแผนวัน (Lead ที่ต้องตาม / นัดที่มี)' },
  { t: '09:00–10:30', a: 'Lead Generation (Content + ติดต่อรายชื่อใหม่)' },
  { t: '10:30–12:00', a: 'Sales (นัดหมาย / นำเสนอ / ปิด)' },
  { t: '12:00–13:00', a: 'พัก' },
  { t: '13:00–14:30', a: 'Follow-up + Proposal ที่ค้าง' },
  { t: '14:30–16:00', a: 'Recruitment (ติดต่อผู้สนใจอาชีพ / สัมภาษณ์)' },
  { t: '16:00–17:00', a: 'Customer Care (ดูแลลูกค้าเดิม + ขอ Referral)' },
  { t: '17:00–18:00', a: 'Team Coaching / Training ทีม' },
  { t: '18:00–19:00', a: 'Content Creation (ถ่ายคลิป/เขียนโพสต์ล่วงหน้า)' },
  { t: '19:00–19:30', a: 'Learning (เรียนรู้ผลิตภัณฑ์/ทักษะขาย)' },
  { t: '19:30–20:00', a: 'Review KPI ปิดวัน + วางแผนพรุ่งนี้' },
];

const ASK = [
  'ตอนนี้อยู่ตำแหน่งอะไร',
  'รายได้เฉลี่ยต่อเดือนตอนนี้เท่าไร',
  'เป้าหมายรายได้ต่อเดือนที่ต้องการ',
  'ต้องการไปถึงตำแหน่งใด (ใน 5 ระดับ)',
  'มีลูกค้าเดิม/Lead อยู่กี่ราย',
  'มีตัวแทนในทีมอยู่กี่คน (และ Active กี่คน)',
  'ทำเต็มเวลาหรือพาร์ทไทม์ — มีเวลาใช้งานได้จริงวันละกี่ชั่วโมง',
];

function Tag({ kind }: { kind: TagKind }) {
  const map: Record<TagKind, { t: string; c: string }> = {
    doc: { t: 'ข้อมูลจากเอกสาร', c: 'bg-sky-100 text-sky-800 border-sky-200' },
    est: { t: 'ประมาณการ', c: 'bg-amber-100 text-amber-800 border-amber-200' },
    need: { t: 'รอข้อมูลจากคุณ', c: 'bg-slate-100 text-slate-600 border-slate-200' },
  };
  const m = map[kind];
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${m.c}`}>{m.t}</span>;
}

function Card({ id, n, title, sub, children }: { id: string; n: number; title: string; sub?: string; children: ReactNode }) {
  return (
    <section id={id} className="card p-5 scroll-mt-24">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#475569] text-xs font-bold text-white">{n}</span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[#475569]">{title}</h2>
          {sub && <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Flow({ items, tone = 'sky' }: { items: string[]; tone?: 'sky' | 'amber' }) {
  const base = tone === 'sky' ? 'border-sky-200 bg-sky-50 text-sky-900' : 'border-amber-200 bg-amber-50 text-amber-900';
  return (
    <ol className="space-y-1.5">
      {items.map((it, i) => (
        <li key={it}>
          <div className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${base}`}>
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/70 text-[10px] font-bold">{i + 1}</span>
            <span className="min-w-0 font-medium">{it}</span>
          </div>
          {i < items.length - 1 && <div className="ml-5 h-2 w-px bg-slate-300" aria-hidden="true" />}
        </li>
      ))}
    </ol>
  );
}

export default function BusinessModelBoard() {
  return (
    <div className="space-y-4">
      {/* หัวเรื่อง + คำอธิบายที่มาของตัวเลข */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-bold text-[#475569]">โมเดลธุรกิจตัวแทนประกันชีวิต — รายได้ 2 ทาง</h2>
          <span className="badge-demo">โมเดลธุรกิจ</span>
        </div>
        <p className="mt-2 text-xs text-slate-600">
          เปลี่ยนจาก “ขายคนเดียว” → ระบบที่ทำซ้ำได้: ขายส่วนตัว → สร้างรายได้ → สร้างทีม → สร้างผู้บริหาร → สร้างองค์กร
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Tag kind="doc" />
          <Tag kind="est" />
          <Tag kind="need" />
        </div>
        <ul className="mt-3 space-y-1 text-[11px] text-slate-500">
          <li>• ตัวเลขทุกตัวในหน้านี้ไม่ใช่การรับประกันรายได้ — ตัวเลขที่คำนวณจะถูกระบุว่า “ประมาณการ” เสมอ</li>
          <li>• เงื่อนไขตำแหน่งยึดจากเอกสาร “สร้างโมเดลธุรกิจ” เท่านั้น จุดที่เอกสารไม่ระบุหรือไม่ตรงกัน จะขึ้นป้ายให้ยืนยัน</li>
        </ul>

        {/* ลิงก์ไปแต่ละหัวข้อ */}
        <nav className="mt-4 flex flex-wrap gap-1.5">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] text-slate-600 hover:border-sky-300 hover:text-sky-700">
              {s.n}. {s.th}
            </a>
          ))}
        </nav>
      </div>

      {/* 1. BUSINESS MODEL */}
      <Card id="bm" n={1} title="BUSINESS MODEL — โมเดลธุรกิจของฉัน" sub="ธุรกิจมีรายได้ 2 ทาง และตัวแทนมี 4 หน้าที่หลัก">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
            <div className="text-xs font-bold text-sky-900">ENGINE A — การขาย = Active Income</div>
            <p className="mt-1 text-[11px] text-sky-800">รายได้จากการลงมือขายเอง ควบคุมได้ด้วยจำนวนกิจกรรมของตัวเอง</p>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-xs font-bold text-amber-900">ENGINE B — การสร้างทีม = Passive Income</div>
            <p className="mt-1 text-[11px] text-amber-800">รายได้จากการสร้างและดูแลทีม โตได้เมื่อทีมโต — ต้องใช้เวลาสะสม</p>
          </div>
        </div>

        <div className="mt-4 text-xs font-semibold text-[#475569]">หน้าที่ของตัวแทน (4 ข้อ)</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {['ขายประกันชีวิต', 'ดูแลลูกค้า', 'สร้างทีม', 'ดูแลและบริหารทีมงาน'].map((d) => (
            <span key={d} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] text-slate-700">{d}</span>
          ))}
        </div>

        <div className="mt-4 text-xs font-semibold text-[#475569]">Career Path + เงื่อนไขตามเอกสาร</div>
        <div className="mt-2 space-y-2">
          {CAREER.map((c, i) => (
            <div key={c.rank} className="rounded-xl border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#475569] text-[10px] font-bold text-white">{i + 1}</span>
                <span className="text-sm font-semibold text-[#475569]">{c.rank}</span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] text-slate-600">{c.engine}</span>
                {c.doc.startsWith('เอกสารชุดนี้ไม่ระบุ') ? <Tag kind="need" /> : <Tag kind="doc" />}
              </div>
              <div className="mt-1.5 text-[11px] text-slate-700">เงื่อนไข: {c.doc}</div>
              <div className="text-[11px] text-slate-500">บทบาท: {c.duty}</div>
              {c.warn && (
                <div className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-900">⚠ {c.warn}</div>
              )}
            </div>
          ))}
        </div>
      </Card>

      {/* 2. INCOME MODEL */}
      <Card id="income" n={2} title="INCOME MODEL — รายได้จากการขาย + รายได้จากทีม" sub="ตัวเลขทุกตัวเป็น “ประมาณการ” จนกว่าจะมีข้อมูลจริงจากคุณ">
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="rounded-xl border p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-sky-900">ENGINE A — ACTIVE INCOME</span>
              <Tag kind="est" />
            </div>
            <div className="mt-2 space-y-1.5">
              {ENGINE_A.map((r) => (
                <div key={r.k} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                  <span className="text-[11px] font-semibold text-slate-700">{r.k}</span>
                  <span className="text-[10px] text-slate-500">{r.note}</span>
                  <span className="ml-auto font-mono text-[11px] text-slate-400">— รอข้อมูล</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-slate-500">
              สูตรประมาณการ: จำนวนกรมธรรม์ × เบี้ยเฉลี่ย × อัตราคอมมิชชั่น = ค่าคอมมิชชั่นโดยประมาณ (ต้องยืนยันอัตราคอมจริงจากตารางผลิตภัณฑ์)
            </p>
          </div>

          <div className="rounded-xl border p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-amber-900">ENGINE B — TEAM INCOME</span>
              <Tag kind="est" />
            </div>
            <div className="mt-2 space-y-1.5">
              {ENGINE_B.map((r) => (
                <div key={r.k} className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                  <span className="text-[11px] font-semibold text-slate-700">{r.k}</span>
                  <span className="text-[10px] text-slate-500">{r.note}</span>
                  <span className="ml-auto font-mono text-[11px] text-slate-400">— รอข้อมูล</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-slate-500">
              เกณฑ์ตำแหน่งจากเอกสาร (ใช้เป็นเป้า ไม่ใช่คำสัญญารายได้): ผู้บริหารหน่วย 75,000 / ผู้บริหารภาค 1,200,000 / ผู้จัดการฝ่าย เบี้ยปีแรก 30 ล้านบาท
            </p>
          </div>
        </div>
      </Card>

      {/* 3. BUSINESS FUNNEL */}
      <Card id="funnel" n={3} title="BUSINESS FUNNEL — Lead → ลูกค้า → Referral" sub="10 ขั้นตอนจากคนแปลกหน้า → ลูกค้าที่บอกต่อ">
        <Flow items={SALES_FUNNEL} />
      </Card>

      {/* 4. RECRUITMENT FUNNEL */}
      <Card id="recruit" n={4} title="RECRUITMENT FUNNEL — ผู้สนใจ → ตัวแทน → ผู้บริหาร" sub="9 ขั้นตอนการสร้างคนจนขึ้นเป็นผู้นำ">
        <Flow items={RECRUIT_FUNNEL} tone="amber" />
      </Card>

      {/* 5. KPI */}
      <Card id="kpi" n={5} title="KPI — Daily / Weekly / Monthly / Leadership" sub="ทุกเป้าหมายต้องแปลงเป็น KPI ที่วัดได้ และทุก KPI ต้องผูกกับกิจกรรม">
        <div className="grid gap-3 sm:grid-cols-2">
          {KPI.map((g) => (
            <div key={g.group} className="rounded-xl border p-3">
              <div className="text-xs font-bold text-[#475569]">{g.group}</div>
              <ul className="mt-2 space-y-1">
                {g.items.map((it) => (
                  <li key={it} className="flex items-center gap-2 text-[11px] text-slate-700">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8a84e]" />
                    {it}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Card>

      {/* 6. ROADMAP */}
      <Card id="roadmap" n={6} title="ROADMAP 24 เดือน" sub="5 ช่วง — ปรับตามเงื่อนไขจริงในเอกสารและข้อมูลของคุณ">
        <div className="space-y-2">
          {ROADMAP.map((r, i) => (
            <div key={r.range} className="flex gap-3">
              <div className="flex flex-col items-center">
                <span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#c8a84e] bg-white text-[10px] font-bold text-[#475569]">{i + 1}</span>
                {i < ROADMAP.length - 1 && <span className="my-1 w-px flex-1 bg-slate-200" />}
              </div>
              <div className="flex-1 rounded-xl border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-[#475569]">{r.range}</span>
                  <span className="rounded-full bg-[#475569] px-2 py-0.5 text-[10px] text-white">{r.goal}</span>
                  {r.cond && <Tag kind="doc" />}
                </div>
                <div className="mt-1 text-[11px] text-slate-600">{r.detail}</div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-slate-500">※ เป้าตัวเลขของแต่ละช่วงจะใส่ได้เมื่อมีข้อมูลจริงจาก STEP “ข้อมูลที่ต้องยืนยัน” ด้านล่าง</p>
      </Card>

      {/* 7. AUTOMATION */}
      <Card id="auto" n={7} title="AI + AUTOMATION — ระบบที่ต้องมี" sub="5 กลุ่มงานที่เอา AI/ระบบมาช่วยลดงานซ้ำ">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {AUTOMATION.map((a) => (
            <div key={a.g} className="rounded-xl border p-3">
              <div className="text-xs font-bold text-[#475569]">{a.g}</div>
              <ul className="mt-2 space-y-1">
                {a.items.map((it) => (
                  <li key={it} className="flex items-start gap-2 text-[11px] text-slate-700">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400" />
                    {it}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-slate-500">
          ※ ระบบนี้ (AI Insurance Network Tree) มีงานอัตโนมัติบางส่วนอยู่แล้ว เช่น ระบบสมาชิก/ผู้สนใจ และตัวเชื่อม n8n — ส่วนที่จะเพิ่มต้องยืนยันก่อน ไม่ได้เปิดใช้งานอัตโนมัติ
        </p>
      </Card>

      {/* 8. DASHBOARD */}
      <Card id="dash" n={8} title="DASHBOARD ผู้บริหาร — ตัวเลขที่ต้องเห็น" sub="11 ตัวชี้วัดหลัก + กติกาสถานะ 3 ระดับ">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {DASH.map((d) => (
            <div key={d.k} className="rounded-xl border p-3">
              <div className="text-[11px] font-semibold text-slate-700">{d.k}</div>
              <div className="text-[10px] text-slate-500">{d.tag}</div>
              <div className="mt-1 font-mono text-[11px] text-slate-400">— รอเชื่อมข้อมูล</div>
            </div>
          ))}
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          {STATUS_RULE.map((s) => (
            <div key={s.label} className="rounded-xl border p-3">
              <div className="text-xs font-bold text-[#475569]">{s.icon} {s.label}</div>
              <div className="mt-1 text-[11px] text-slate-600">{s.desc}</div>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] text-slate-500">※ เกณฑ์ 🔴/🟡/🟢 ต้องตั้งจากเป้าจริงของคุณ (KPI ข้อ 5) — จึงยังไม่กำหนดตัวเลขเกณฑ์ให้เอง</p>
      </Card>

      {/* 9. ACTION PLAN */}
      <Card id="action" n={9} title="แผนปฏิบัติการ 90 วัน" sub="เป้าหมาย → KPI → กิจกรรม → จำนวนที่ต้องทำ → ผลลัพธ์ → สิ่งที่ต้องปรับ">
        <div className="space-y-3">
          {ACTION_90.map((m, i) => (
            <div key={m.month} className="rounded-xl border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#c8a84e] text-[10px] font-bold text-white">{i + 1}</span>
                <span className="text-xs font-bold text-[#475569]">{m.month}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-700">“{m.theme}”</span>
              </div>
              <div className="mt-2 space-y-1.5">
                {m.rows.map((r) => (
                  <div key={r.k} className="flex flex-wrap gap-x-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
                    <span className="text-[11px] font-semibold text-slate-700">{r.k}:</span>
                    <span className="text-[11px] text-slate-600">{r.v}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* 10. DAILY OS */}
      <Card id="daily" n={10} title="ตารางทำงานรายวัน (ตัวอย่าง 08:00–20:00)" sub="ปรับตามเวลาที่คุณมีจริง — ตารางนี้เป็นโครงตั้งต้น">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[11px]">
            <thead>
              <tr className="text-slate-500">
                <th className="w-28 py-1.5 pr-3 font-semibold">เวลา</th>
                <th className="py-1.5 font-semibold">งาน</th>
              </tr>
            </thead>
            <tbody>
              {DAILY.map((d) => (
                <tr key={d.t} className="border-t border-slate-100">
                  <td className="py-2 pr-3 font-mono text-slate-600">{d.t}</td>
                  <td className="py-2 text-slate-700">{d.a}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 11. NEXT QUESTIONS */}
      <Card id="ask" n={11} title="ข้อมูลที่ต้องยืนยันก่อนคำนวณ" sub="ขั้นนี้ยังไม่ใส่ตัวเลขใด ๆ — ตอบครบเมื่อไร จะสร้าง Business Model เฉพาะบุคคลให้">
        <ol className="space-y-2">
          {ASK.map((q, i) => (
            <li key={q} className="flex items-start gap-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-3 py-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate-600">{i + 1}</span>
              <span className="text-[11px] text-slate-700">{q}</span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[10px] text-slate-500">
          ※ เอกสารชุดนี้มีจุดที่ไม่ตรงกัน (ผู้บริหารศูนย์ / จำนวนศูนย์ของผู้บริหารภาค) และยังไม่มีเงื่อนไขของผู้บริหารศูนย์ — ต้องยืนยันก่อนใช้คำนวณ
        </p>
      </Card>
    </div>
  );
}
