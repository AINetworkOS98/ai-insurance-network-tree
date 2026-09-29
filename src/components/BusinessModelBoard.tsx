'use client';

/**
 * BusinessModelBoard — บอร์ด "โมเดลธุรกิจตัวแทนประกันชีวิต รายได้ 2 ทาง"
 * ต่อลงมาจากหน้า /progress · ธีมพรีเมียม navy–electric blue–gold (เข้าเซ็ตกับภาพ Career Network Tree)
 *
 * กฎการแสดงผลตัวเลข (ตามที่ผู้ใช้กำหนด):
 *   [เอกสาร] = ตัวเลข/เงื่อนไขจากเอกสาร "สร้างโมเดลธุรกิจ" เท่านั้น
 *   [ประมาณการ] = ตัวเลขที่ระบบคำนวณ/สมมติขึ้น — ไม่ใช่การรับประกันรายได้
 *   [รอข้อมูล] = ยังไม่มีข้อมูลจากผู้ใช้ จึงไม่คำนวณให้ (ห้ามแต่งตัวเลข)
 */

import { useEffect, useState, type ReactNode } from 'react';

type TagKind = 'doc' | 'est' | 'need';

const SECTIONS = [
  { id: 'bm', n: 1, th: 'โมเดลธุรกิจ', icon: '◆' },
  { id: 'income', n: 2, th: 'รายได้ 2 เครื่องยนต์', icon: '⚙' },
  { id: 'funnel', n: 3, th: 'Funnel การขาย', icon: '▽' },
  { id: 'recruit', n: 4, th: 'Funnel สร้างทีม', icon: '◈' },
  { id: 'kpi', n: 5, th: 'KPI 4 ระดับ', icon: '◎' },
  { id: 'roadmap', n: 6, th: 'Roadmap 24 เดือน', icon: '⌁' },
  { id: 'auto', n: 7, th: 'AI + Automation', icon: '⚡' },
  { id: 'dash', n: 8, th: 'Dashboard', icon: '▦' },
  { id: 'action', n: 9, th: 'แผน 90 วัน', icon: '▶' },
  { id: 'daily', n: 10, th: 'ตารางรายวัน', icon: '◷' },
  { id: 'ask', n: 11, th: 'ข้อมูลที่ต้องยืนยัน', icon: '?' },
];

/** ตัวเลขสรุปโครงสร้าง (นับจากเอกสาร/โครงสร้าง ไม่ใช่ตัวเลขรายได้) */
const HERO_STATS = [
  { v: '5', l: 'ระดับตำแหน่ง', s: 'ตัวแทน → ผู้จัดการฝ่าย' },
  { v: '2', l: 'เครื่องยนต์รายได้', s: 'ขาย (Active) + สร้างทีม (Team)' },
  { v: '10', l: 'ขั้นตอน Funnel ขาย', s: 'Traffic → Referral' },
  { v: '9', l: 'ขั้นตอน Funnel สร้างทีม', s: 'Content → ผู้บริหารรุ่นต่อไป' },
  { v: '24', l: 'เดือน Roadmap', s: '5 ช่วงการเติบโต' },
  { v: '4', l: 'ระดับ KPI', s: 'Daily · Weekly · Monthly · Leadership' },
];

const CAREER = [
  { rank: 'ตัวแทน', doc: 'อายุงาน 1–6 เดือน • ค่าคอมมิชชั่น 20,000 บาทขึ้นไป', duty: 'ขายประกันชีวิต • ดูแลลูกค้า', engine: 'Active Income', tone: 'sky' as const },
  { rank: 'ผู้บริหารหน่วย', doc: 'อายุงาน 3–6 เดือน • ค่าคอมมิชชั่น 75,000 บาทขึ้นไป • สร้าง 3 หน่วย', duty: 'ขาย + เริ่มสร้างทีม + ดูแลทีมชุดแรก', engine: 'Active + Team', tone: 'sky' as const },
  { rank: 'ผู้บริหารศูนย์', doc: 'เอกสารชุดนี้ไม่ระบุเงื่อนไข — ต้องยืนยัน', duty: 'บริหารหลายหน่วย + ดูแลผู้บริหารหน่วย', engine: 'Team Income', tone: 'need' as const, warn: 'หน้า /career ระบุเงื่อนไขผู้บริหารศูนย์ไว้ที่ 75,000 บาท/3–6 เดือน/แยกหน่วย ซึ่งซ้ำกับผู้บริหารหน่วยในเอกสารชุดนี้ — ต้องยืนยันว่าเลขถูกต้องที่ระดับใด' },
  { rank: 'ผู้บริหารภาค', doc: 'อายุงาน 12–24 เดือน • ค่าคอมมิชชั่น 1,200,000 บาท • สร้าง 5 ศูนย์', duty: 'บริหารศูนย์หลายแห่ง + พัฒนาผู้บริหารรุ่นต่อไป', engine: 'Team Income', tone: 'gold' as const },
  { rank: 'ผู้จัดการฝ่าย', doc: 'อายุงาน 24 เดือนขึ้นไป • เบี้ยปีแรกทั้งปีรวม 30 ล้านบาท • สร้างภาค 8 ภาค', duty: 'บริหารภาค + วางกลยุทธ์องค์กร', engine: 'Team Income', tone: 'gold' as const, warn: 'เอกสารชุดนี้ให้เงื่อนไขผู้บริหารภาค = สร้าง 5 ศูนย์ แต่หน้า /career ระบุ 4 ศูนย์ — ต้องยืนยัน' },
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

const SALES_FUNNEL = [
  { n: 'Traffic', d: 'คนเห็นคอนเทนต์/โฆษณา' },
  { n: 'Lead', d: 'ทิ้งข้อมูลให้ติดต่อกลับ' },
  { n: 'Contact', d: 'ติดต่อได้แล้ว' },
  { n: 'Appointment', d: 'นัดคุยตัวจริง' },
  { n: 'Financial Needs Analysis', d: 'วิเคราะห์ความต้องการ' },
  { n: 'Proposal', d: 'เสนอแบบประกัน' },
  { n: 'Closing', d: 'ปิดการขาย' },
  { n: 'Policy Issued', d: 'กรมธรรม์ออกจริง' },
  { n: 'Customer Care', d: 'ดูแลหลังขาย' },
  { n: 'Referral', d: 'ลูกค้าแนะนำคนต่อ' },
];

const RECRUIT_FUNNEL = [
  { n: 'Content', d: 'คอนเทนต์อาชีพ' },
  { n: 'ผู้สนใจอาชีพ', d: 'คนที่ทักมาถาม' },
  { n: 'Recruit Lead', d: 'เก็บเป็นลีดสร้างทีม' },
  { n: 'สัมภาษณ์', d: 'นัดคุยรายละเอียด' },
  { n: 'สมัคร', d: 'สมัครเป็นตัวแทน' },
  { n: 'เริ่มงาน', d: 'อบรม + เริ่มขาย' },
  { n: 'สร้างผลงาน', d: 'ออกผลงานสม่ำเสมอ' },
  { n: 'ขึ้นผู้บริหารหน่วย', d: 'ตามเงื่อนไขเอกสาร' },
  { n: 'สร้างผู้บริหารรุ่นต่อไป', d: 'ทำซ้ำเป็นระบบ' },
];

const KPI = [
  { group: 'Daily', th: 'รายวัน', icon: '☀', tone: 'sky', items: ['จำนวนคนที่ติดต่อ', 'จำนวน Follow-up', 'จำนวน Lead ใหม่', 'จำนวนการนัดหมาย'] },
  { group: 'Weekly', th: 'รายสัปดาห์', icon: '◧', tone: 'indigo', items: ['จำนวน Meeting', 'จำนวน Proposal', 'จำนวน Closing', 'จำนวน Recruit', 'จำนวน Training'] },
  { group: 'Monthly', th: 'รายเดือน', icon: '▤', tone: 'gold', items: ['เบี้ยประกัน', 'ค่าคอมมิชชั่น', 'จำนวนลูกค้าใหม่', 'จำนวนตัวแทนใหม่', 'จำนวนตัวแทน Active', 'จำนวนผู้บริหารที่สร้างได้'] },
  { group: 'Leadership', th: 'ภาวะผู้นำ', icon: '★', tone: 'emerald', items: ['จำนวนหน่วย', 'จำนวนศูนย์', 'ผลงานรวมทีม', 'จำนวนผู้บริหารรุ่นใหม่', 'Retention ของทีม'] },
];

const ROADMAP = [
  { range: 'เดือน 1–3', goal: 'สร้างตัวเองให้ขายได้', detail: 'เน้นทำ Lead ให้พอ + ปิดเคสให้ได้สม่ำเสมอ (ฐานรายได้ Active)', icon: '①' },
  { range: 'เดือน 4–6', goal: 'สร้างทีมชุดแรก', detail: 'เริ่ม Recruit + วางระบบติดตามคนใหม่ (ปูทาง Team Income)', icon: '②' },
  { range: 'เดือน 7–12', goal: 'สร้างระบบและผู้บริหาร', detail: 'ทำให้การขายและ Recruit เป็นระบบ ทำซ้ำได้ + ดันคนแรกขึ้นผู้บริหาร', icon: '③' },
  { range: 'เดือน 13–18', goal: 'ขยายศูนย์', detail: 'เพิ่มจำนวนหน่วย/ศูนย์ในเครือข่าย + พัฒนาผู้บริหารที่มีอยู่', icon: '④' },
  { range: 'เดือน 19–24', goal: 'สร้างองค์กรระดับภาค', detail: 'เป้าหมายตามเงื่อนไขเอกสาร: สร้าง 5 ศูนย์ → ภาค', cond: true, icon: '⑤' },
];

const AUTOMATION = [
  { g: 'Lead Generation', icon: '📣', items: ['TikTok / Facebook / LINE', 'Content ต่อเนื่อง', 'Landing Page + ฟอร์มเก็บ Lead', 'ป้าย QR/ลิงก์ในทุกรีล'] },
  { g: 'Lead Management', icon: '🗂', items: ['เก็บ Lead ลงฐานข้อมูลเดียว', 'Lead Score จัดลำดับความร้อน', 'Follow-up อัตโนมัติตามรอบ', 'Pipeline + นัดหมาย'] },
  { g: 'Sales Automation', icon: '💬', items: ['Script / สคริปต์ขาย', 'ข้อความ Follow-up ตามสถานะ', 'สร้าง Proposal จากข้อมูลลูกค้า', 'Reminder + Customer Care'] },
  { g: 'Recruitment Automation', icon: '🤝', items: ['Recruit Lead เข้าคิว', 'นัดสัมภาษณ์', 'ส่งข้อมูลอาชีพให้ผู้สนใจ', 'ติดตามผู้สมัคร + Onboarding'] },
  { g: 'Team Management', icon: '📊', items: ['Dashboard ทีม', 'KPI รายวัน/สัปดาห์', 'Training และคลังความรู้', 'Performance Tracking + พัฒนาผู้นำ'] },
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
  { icon: '🔴', label: 'ต้องเร่ง', desc: 'ต่ำกว่าเป้าที่วางไว้ชัดเจน — ต้องแก้ทันทีสัปดาห์นี้', cls: 'from-rose-500/25 to-rose-500/5 border-rose-400/40' },
  { icon: '🟡', label: 'ต้องติดตาม', desc: 'ใกล้เป้าแต่ยังไม่ถึง — เฝ้าดูและเพิ่มกิจกรรมต้นน้ำ', cls: 'from-amber-400/25 to-amber-400/5 border-amber-300/40' },
  { icon: '🟢', label: 'ตามเป้าหมาย', desc: 'อยู่ในจังหวะ — รักษาอัตราเดิมและต่อยอด', cls: 'from-emerald-500/25 to-emerald-500/5 border-emerald-400/40' },
];

const ACTION_90 = [
  { month: 'เดือนที่ 1', theme: 'สร้างยอดขาย + สร้าง Lead', rows: [
    { k: 'เป้าหมาย', v: 'ตั้งฐานรายได้จาก Active Income ให้เกิดขึ้นจริง + มี Lead ไหลสม่ำเสมอ' },
    { k: 'KPI', v: 'KPI รายวัน (คนที่ติดต่อ / Follow-up / Lead ใหม่ / นัดหมาย) + เบี้ยปิดได้รายสัปดาห์' },
    { k: 'กิจกรรม', v: 'Content ทุกวันผ่าน TikTok/Facebook/LINE • ติดต่อรายชื่อเดิม + ใหม่ • นัดและนำเสนอ' },
    { k: 'จำนวนที่ต้องทำ', v: 'รอข้อมูลจากคุณ (จำนวนชั่วโมงทำงาน/รายชื่อที่มี) ก่อนกำหนดตัวเลข' },
    { k: 'ผลลัพธ์ที่คาดหวัง', v: 'มี Pipeline กลางที่เดินได้เอง + ตัวเลขจริงพอจะคำนวณ Conversion ของคุณ' },
    { k: 'สิ่งที่ต้องปรับปรุง', v: 'ช่องทาง Lead ที่ให้ผลจริง vs ที่กินเวลา' },
  ] },
  { month: 'เดือนที่ 2', theme: 'เพิ่ม Conversion + เริ่มสร้างทีม', rows: [
    { k: 'เป้าหมาย', v: 'ทำอัตราปิดให้ดีขึ้นจากเดือนแรก + Recruit คนแรกให้เริ่มงาน' },
    { k: 'KPI', v: 'Weekly KPI (Meeting / Proposal / Closing / Recruit / Training)' },
    { k: 'กิจกรรม', v: 'เก็บ Lead ลงระบบ + Lead Score • Follow-up ตามรอบ • เปิดช่อง Recruit (Content + บอกต่อ)' },
    { k: 'จำนวนที่ต้องทำ', v: 'รอข้อมูลจากคุณ (Conversion จริงเดือน 1) ก่อนกำหนดตัวเลข' },
    { k: 'ผลลัพธ์ที่คาดหวัง', v: 'Conversion สูงขึ้น + มีตัวแทนชุดแรกที่กำลังเริ่มออกผลงาน' },
    { k: 'สิ่งที่ต้องปรับปรุง', v: 'สคริปต์/ข้อเสนอ + ขั้นตอนติดตามผู้สนใจอาชีพ' },
  ] },
  { month: 'เดือนที่ 3', theme: 'สร้างระบบ + สร้างผู้นำ', rows: [
    { k: 'เป้าหมาย', v: 'ทำให้ ขาย และ Recruit เป็นระบบทำซ้ำได้ พร้อมดันคนแรกขึ้นผู้บริหารหน่วย' },
    { k: 'KPI', v: 'Monthly KPI + Leadership KPI (จำนวนหน่วย / ผลงานรวมทีม / ผู้บริหารรุ่นใหม่)' },
    { k: 'กิจกรรม', v: 'วางระบบ Follow-up + Training • Coaching รายสัปดาห์ • วัดผลและปรับเป้า' },
    { k: 'จำนวนที่ต้องทำ', v: 'รอข้อมูลจากคุณ (จำนวนตัวแทนในทีม + เวลาที่มีจริง)' },
    { k: 'ผลลัพธ์ที่คาดหวัง', v: 'ทีมทำงานตามระบบได้แม้คุณไม่ต้องอยู่ทุกขั้นตอน' },
    { k: 'สิ่งที่ต้องปรับปรุง', v: 'จุดที่ระบบยังพังเมื่อคุณไม่ว่าง + เรื่องที่ต้องสอนซ้ำ' },
  ] },
];

const DAILY = [
  { t: '08:00–09:00', a: 'Review KPI + วางแผนวัน (Lead ที่ต้องตาม / นัดที่มี)', icon: '🎯' },
  { t: '09:00–10:30', a: 'Lead Generation (Content + ติดต่อรายชื่อใหม่)', icon: '📣' },
  { t: '10:30–12:00', a: 'Sales (นัดหมาย / นำเสนอ / ปิด)', icon: '💼' },
  { t: '12:00–13:00', a: 'พัก', icon: '☕' },
  { t: '13:00–14:30', a: 'Follow-up + Proposal ที่ค้าง', icon: '🔁' },
  { t: '14:30–16:00', a: 'Recruitment (ติดต่อผู้สนใจอาชีพ / สัมภาษณ์)', icon: '🤝' },
  { t: '16:00–17:00', a: 'Customer Care (ดูแลลูกค้าเดิม + ขอ Referral)', icon: '💙' },
  { t: '17:00–18:00', a: 'Team Coaching / Training ทีม', icon: '🧑‍🏫' },
  { t: '18:00–19:00', a: 'Content Creation (ถ่ายคลิป/เขียนโพสต์ล่วงหน้า)', icon: '🎬' },
  { t: '19:00–19:30', a: 'Learning (เรียนรู้ผลิตภัณฑ์/ทักษะขาย)', icon: '📚' },
  { t: '19:30–20:00', a: 'Review KPI ปิดวัน + วางแผนพรุ่งนี้', icon: '🌙' },
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

const TONE: Record<string, { dot: string; ring: string }> = {
  sky: { dot: 'bg-sky-400', ring: 'from-sky-400/20 to-transparent border-sky-300/30' },
  indigo: { dot: 'bg-indigo-400', ring: 'from-indigo-400/20 to-transparent border-indigo-300/30' },
  gold: { dot: 'bg-amber-400', ring: 'from-amber-400/20 to-transparent border-amber-300/30' },
  emerald: { dot: 'bg-emerald-400', ring: 'from-emerald-400/20 to-transparent border-emerald-300/30' },
  need: { dot: 'bg-slate-400', ring: 'from-white/10 to-transparent border-white/20' },
};

function Tag({ kind }: { kind: TagKind }) {
  const map: Record<TagKind, { t: string; c: string }> = {
    doc: { t: 'ข้อมูลจากเอกสาร', c: 'border-sky-300/40 bg-sky-400/15 text-sky-100' },
    est: { t: 'ประมาณการ', c: 'border-amber-300/40 bg-amber-400/15 text-amber-100' },
    need: { t: 'รอข้อมูลจากคุณ', c: 'border-white/20 bg-white/10 text-slate-300' },
  };
  const m = map[kind];
  return <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-wide ${m.c}`}>{m.t}</span>;
}

function Panel({ id, n, title, sub, icon, children, delay = 0 }: { id: string; n: number; title: string; sub?: string; icon?: string; children: ReactNode; delay?: number }) {
  return (
    <section
      id={id}
      className="bm-in scroll-mt-32 rounded-3xl border border-white/10 bg-white/[0.035] p-5 shadow-[0_18px_50px_-30px_rgba(56,189,248,0.5)] backdrop-blur-sm transition-colors hover:border-sky-300/25 hover:bg-white/[0.055] sm:p-6"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-start gap-3">
        <span className="bm-badge flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-xs font-black text-[#04122a]">{n}</span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold text-white">
            {icon && <span className="mr-1.5 text-sm opacity-80">{icon}</span>}
            {title}
          </h2>
          {sub && <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{sub}</p>}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Flow({ items, tone = 'sky' }: { items: { n: string; d: string }[]; tone?: 'sky' | 'gold' }) {
  const t = TONE[tone];
  return (
    <ol className="space-y-2">
      {items.map((it, i) => (
        <li key={it.n}>
          <div className={`flex items-center gap-3 rounded-2xl border bg-gradient-to-r px-3 py-2.5 ${t.ring}`}>
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-[#04122a] ${t.dot}`}>{i + 1}</span>
            <span className="min-w-0 text-xs font-semibold text-white">{it.n}</span>
            <span className="ml-auto hidden text-[10px] text-slate-400 sm:block">{it.d}</span>
          </div>
          {i < items.length - 1 && (
            <div className="ml-6 flex h-3 items-center" aria-hidden="true">
              <span className="bm-drop h-3 w-px bg-gradient-to-b from-sky-300/70 to-transparent" />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

export default function BusinessModelBoard() {
  const [active, setActive] = useState<string>('bm');

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActive(top.target.id);
      },
      { rootMargin: '-120px 0px -55% 0px', threshold: 0 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="bm-board min-w-0 rounded-[28px] p-3 sm:p-5">
      <style>{BM_STYLES}</style>

      {/* ── HERO ── */}
      <div className="bm-hero bm-in relative overflow-hidden rounded-3xl border border-white/10 p-5 sm:p-7">
        <div className="relative">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-amber-300/40 bg-amber-400/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-amber-100">Business Model</span>
            <span className="rounded-full border border-sky-300/40 bg-sky-400/15 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-sky-100">2 Engines</span>
          </div>
          <h2 className="mt-3 text-xl font-black leading-tight text-white sm:text-2xl">
            โมเดลธุรกิจตัวแทนประกันชีวิต <span className="bm-gold">รายได้ 2 ทาง</span>
          </h2>
          <p className="mt-2 max-w-3xl text-xs leading-relaxed text-slate-300">
            เปลี่ยนจาก “ขายคนเดียว” → ระบบที่ทำซ้ำได้ · ขายส่วนตัว → สร้างรายได้ → สร้างทีม → สร้างผู้บริหาร → สร้างองค์กร
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            {HERO_STATS.map((s, i) => (
              <div key={s.l} className="bm-stat bm-in rounded-2xl border border-white/10 bg-white/[0.05] px-3 py-2.5" style={{ animationDelay: `${80 + i * 60}ms` }}>
                <div className="text-lg font-black text-white">{s.v}</div>
                <div className="text-[11px] font-semibold text-sky-100">{s.l}</div>
                <div className="mt-0.5 text-[10px] leading-snug text-slate-400">{s.s}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Tag kind="doc" />
            <Tag kind="est" />
            <Tag kind="need" />
            <span className="text-[10px] text-slate-400">— ทุกตัวเลขไม่ใช่การรับประกันรายได้ · ตัวเลขที่คำนวณขึ้นจะถูกระบุว่า “ประมาณการ” เสมอ</span>
          </div>
        </div>
      </div>

      {/* ── แถบสารบัญติดหน้าจอ ── */}
      <nav className="bm-nav sticky top-[64px] z-20 mt-3 -mx-3 min-w-0 px-3 py-2 sm:-mx-5 sm:px-5">
        <div className="flex w-full min-w-0 gap-1.5 overflow-x-auto scrollbar-none">
          {SECTIONS.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition-all ${
                active === s.id
                  ? 'border-transparent bg-gradient-to-r from-sky-400 to-amber-300 text-[#04122a] shadow-[0_6px_18px_-6px_rgba(56,189,248,0.8)]'
                  : 'border-white/15 bg-white/5 text-slate-300 hover:border-sky-300/40 hover:text-white'
              }`}
            >
              <span className="mr-1 opacity-70">{s.icon}</span>
              {s.n}. {s.th}
            </a>
          ))}
        </div>
      </nav>

      <div className="mt-3 space-y-3">
        {/* 1. BUSINESS MODEL */}
        <Panel id="bm" n={1} title="BUSINESS MODEL — โมเดลธุรกิจของฉัน" sub="ธุรกิจมีรายได้ 2 ทาง และตัวแทนมี 4 หน้าที่หลัก" icon="◆" delay={120}>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-sky-300/30 bg-gradient-to-br from-sky-400/20 to-transparent p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base">💼</span>
                <span className="text-xs font-bold text-white">ENGINE A — การขาย</span>
                <span className="rounded-full border border-sky-300/40 bg-sky-400/15 px-2 py-0.5 text-[10px] font-bold text-sky-100">Active Income</span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-300">รายได้จากการลงมือขายเอง ควบคุมได้ด้วยจำนวนกิจกรรมของตัวเอง</p>
            </div>
            <div className="rounded-2xl border border-amber-300/30 bg-gradient-to-br from-amber-400/20 to-transparent p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base">🌱</span>
                <span className="text-xs font-bold text-white">ENGINE B — การสร้างทีม</span>
                <span className="rounded-full border border-amber-300/40 bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-100">Passive Income</span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-300">รายได้จากการสร้างและดูแลทีม โตได้เมื่อทีมโต — ต้องใช้เวลาสะสม</p>
            </div>
          </div>

          <div className="mt-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">หน้าที่ของตัวแทน (4 ข้อ)</div>
          <div className="mt-2 grid gap-2 sm:grid-cols-4">
            {[['ขายประกันชีวิต', '💙'], ['ดูแลลูกค้า', '🤝'], ['สร้างทีม', '🌱'], ['ดูแลและบริหารทีมงาน', '🧭']].map(([d, ic]) => (
              <div key={d} className="bm-tile flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
                <span className="text-base">{ic}</span>
                <span className="text-[11px] font-semibold text-slate-200">{d}</span>
              </div>
            ))}
          </div>

          <div className="mt-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">Career Path + เงื่อนไขตามเอกสาร</div>
          <div className="mt-2 space-y-2">
            {CAREER.map((c, i) => (
              <div key={c.rank} className="bm-tile relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 pl-5">
                <span className={`absolute left-0 top-0 h-full w-1 ${c.tone === 'gold' ? 'bg-gradient-to-b from-amber-300 to-amber-500' : c.tone === 'need' ? 'bg-slate-500' : 'bg-gradient-to-b from-sky-300 to-sky-500'}`} />
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[10px] font-black text-white">{i + 1}</span>
                  <span className="text-sm font-bold text-white">{c.rank}</span>
                  <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300">{c.engine}</span>
                  {c.doc.startsWith('เอกสารชุดนี้ไม่ระบุ') ? <Tag kind="need" /> : <Tag kind="doc" />}
                </div>
                <div className="mt-1.5 text-[11px] text-slate-300">เงื่อนไข: <span className="text-slate-100">{c.doc}</span></div>
                <div className="text-[11px] text-slate-400">บทบาท: {c.duty}</div>
                {c.warn && (
                  <div className="mt-2 flex gap-2 rounded-xl border border-amber-300/30 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-100">
                    <span>⚠</span><span>{c.warn}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>

        {/* 2. INCOME MODEL */}
        <Panel id="income" n={2} title="INCOME MODEL — รายได้จากการขาย + รายได้จากทีม" sub="ตัวเลขทุกตัวเป็น “ประมาณการ” จนกว่าจะมีข้อมูลจริงจากคุณ" icon="⚙" delay={180}>
          <div className="grid gap-3 lg:grid-cols-2">
            {[
              { t: 'ENGINE A — ACTIVE INCOME', ic: '💼', rows: ENGINE_A, tone: 'sky' as const, f: 'สูตรประมาณการ: จำนวนกรมธรรม์ × เบี้ยเฉลี่ย × อัตราคอมมิชชั่น = ค่าคอมมิชชั่นโดยประมาณ (ต้องยืนยันอัตราคอมจริงจากตารางผลิตภัณฑ์)' },
              { t: 'ENGINE B — TEAM INCOME', ic: '🌱', rows: ENGINE_B, tone: 'gold' as const, f: 'เกณฑ์ตำแหน่งจากเอกสาร (ใช้เป็นเป้า ไม่ใช่คำสัญญารายได้): ผู้บริหารหน่วย 75,000 / ผู้บริหารภาค 1,200,000 / ผู้จัดการฝ่าย เบี้ยปีแรก 30 ล้านบาท' },
            ].map((col) => (
              <div key={col.t} className={`rounded-2xl border bg-gradient-to-br p-4 ${TONE[col.tone].ring}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base">{col.ic}</span>
                  <span className="text-xs font-black text-white">{col.t}</span>
                  <span className="ml-auto"><Tag kind="est" /></span>
                </div>
                <div className="mt-3 space-y-1.5">
                  {col.rows.map((r) => (
                    <div key={r.k} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-xl bg-black/20 px-3 py-2">
                      <span className="text-[11px] font-semibold text-white">{r.k}</span>
                      <span className="text-[10px] text-slate-400">{r.note}</span>
                      <span className="ml-auto font-mono text-[10px] text-slate-500">— รอข้อมูล</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-[10px] leading-relaxed text-slate-400">{col.f}</p>
              </div>
            ))}
          </div>
        </Panel>

        {/* 3. SALES FUNNEL */}
        <Panel id="funnel" n={3} title="BUSINESS FUNNEL — Lead → ลูกค้า → Referral" sub="10 ขั้นตอนจากคนแปลกหน้า → ลูกค้าที่บอกต่อ" icon="▽" delay={240}>
          <Flow items={SALES_FUNNEL} />
        </Panel>

        {/* 4. RECRUITMENT FUNNEL */}
        <Panel id="recruit" n={4} title="RECRUITMENT FUNNEL — ผู้สนใจ → ตัวแทน → ผู้บริหาร" sub="9 ขั้นตอนการสร้างคนจนขึ้นเป็นผู้นำ" icon="◈" delay={300}>
          <Flow items={RECRUIT_FUNNEL} tone="gold" />
        </Panel>

        {/* 5. KPI */}
        <Panel id="kpi" n={5} title="KPI — Daily / Weekly / Monthly / Leadership" sub="ทุกเป้าหมายต้องแปลงเป็น KPI ที่วัดได้ และทุก KPI ต้องผูกกับกิจกรรม" icon="◎" delay={360}>
          <div className="grid gap-3 sm:grid-cols-2">
            {KPI.map((g) => (
              <div key={g.group} className={`bm-tile rounded-2xl border bg-gradient-to-br p-4 ${TONE[g.tone].ring}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base">{g.icon}</span>
                  <span className="text-xs font-black text-white">{g.group}</span>
                  <span className="text-[10px] text-slate-400">{g.th}</span>
                  <span className="ml-auto rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-slate-300">{g.items.length} ตัวชี้วัด</span>
                </div>
                <ul className="mt-2.5 space-y-1.5">
                  {g.items.map((it) => (
                    <li key={it} className="flex items-center gap-2 text-[11px] text-slate-200">
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${TONE[g.tone].dot}`} />
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Panel>

        {/* 6. ROADMAP */}
        <Panel id="roadmap" n={6} title="ROADMAP 24 เดือน" sub="5 ช่วงการเติบโต — ปรับตามเงื่อนไขจริงในเอกสารและข้อมูลของคุณ" icon="⌁" delay={420}>
          <ol className="space-y-2">
            {ROADMAP.map((r) => (
              <li key={r.range} className="bm-tile rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base text-slate-400">{r.icon}</span>
                  <span className="text-xs font-black text-white">{r.range}</span>
                  <span className="rounded-full bg-gradient-to-r from-sky-400 to-amber-300 px-2.5 py-0.5 text-[10px] font-bold text-[#04122a]">{r.goal}</span>
                  {r.cond && <Tag kind="doc" />}
                </div>
                <div className="mt-1.5 text-[11px] leading-relaxed text-slate-300">{r.detail}</div>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[10px] text-slate-500">※ เป้าตัวเลขของแต่ละช่วงจะใส่ได้เมื่อมีข้อมูลจริงจากหมวด “ข้อมูลที่ต้องยืนยัน” ด้านล่าง</p>
        </Panel>

        {/* 7. AUTOMATION */}
        <Panel id="auto" n={7} title="AI + AUTOMATION — ระบบที่ต้องมี" sub="5 กลุ่มงานที่เอา AI/ระบบมาช่วยลดงานซ้ำ" icon="⚡" delay={480}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {AUTOMATION.map((a) => (
              <div key={a.g} className="bm-tile rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center gap-2">
                  <span className="text-base">{a.icon}</span>
                  <span className="text-xs font-black text-white">{a.g}</span>
                </div>
                <ul className="mt-2.5 space-y-1.5">
                  {a.items.map((it) => (
                    <li key={it} className="flex items-start gap-2 text-[11px] text-slate-300">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-sky-400/80" />
                      {it}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-slate-500">※ ระบบนี้มีงานอัตโนมัติบางส่วนอยู่แล้ว เช่น ระบบสมาชิก/ผู้สนใจ และตัวเชื่อม n8n — ส่วนที่จะเพิ่มต้องยืนยันก่อน ไม่ได้เปิดใช้งานอัตโนมัติ</p>
        </Panel>

        {/* 8. DASHBOARD */}
        <Panel id="dash" n={8} title="DASHBOARD ผู้บริหาร — ตัวเลขที่ต้องเห็น" sub="11 ตัวชี้วัดหลัก + กติกาสถานะ 3 ระดับ" icon="▦" delay={540}>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {DASH.map((d) => (
              <div key={d.k} className="bm-tile flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3.5">
                <span className="bm-gauge flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[9px] font-bold text-slate-400">—</span>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold text-white">{d.k}</div>
                  <div className="text-[10px] text-slate-400">{d.tag}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {STATUS_RULE.map((s) => (
              <div key={s.label} className={`rounded-2xl border bg-gradient-to-br p-3.5 ${s.cls}`}>
                <div className="text-xs font-bold text-white">{s.icon} {s.label}</div>
                <div className="mt-1 text-[11px] leading-relaxed text-slate-200">{s.desc}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] text-slate-500">※ เกณฑ์ 🔴/🟡/🟢 ต้องตั้งจากเป้าจริงของคุณ (KPI หมวด 5) — จึงยังไม่กำหนดตัวเลขเกณฑ์ให้เอง</p>
        </Panel>

        {/* 9. ACTION PLAN */}
        <Panel id="action" n={9} title="แผนปฏิบัติการ 90 วัน" sub="เป้าหมาย → KPI → กิจกรรม → จำนวนที่ต้องทำ → ผลลัพธ์ → สิ่งที่ต้องปรับ" icon="▶" delay={600}>
          <div className="grid gap-3 lg:grid-cols-3">
            {ACTION_90.map((m, i) => (
              <div key={m.month} className="bm-tile flex flex-col rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center gap-2">
                  <span className="bm-badge flex h-7 w-7 items-center justify-center rounded-xl text-[11px] font-black text-[#04122a]">{i + 1}</span>
                  <span className="text-xs font-black text-white">{m.month}</span>
                </div>
                <div className="mt-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[11px] font-semibold text-sky-100">“{m.theme}”</div>
                <div className="mt-2.5 space-y-1.5">
                  {m.rows.map((r) => (
                    <div key={r.k} className="rounded-xl bg-black/15 px-3 py-2">
                      <div className="text-[10px] font-bold uppercase tracking-wide text-amber-200/80">{r.k}</div>
                      <div className="mt-0.5 text-[11px] leading-relaxed text-slate-300">{r.v}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>

        {/* 10. DAILY OS */}
        <Panel id="daily" n={10} title="ตารางทำงานรายวัน (ตัวอย่าง 08:00–20:00)" sub="ปรับตามเวลาที่คุณมีจริง — ตารางนี้เป็นโครงตั้งต้น" icon="◷" delay={660}>
          <ol className="space-y-1.5">
            {DAILY.map((d) => (
              <li key={d.t} className="bm-tile flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5">
                <span className="text-base">{d.icon}</span>
                <span className="w-[92px] shrink-0 font-mono text-[11px] text-sky-200">{d.t}</span>
                <span className="text-[11px] text-slate-200">{d.a}</span>
              </li>
            ))}
          </ol>
        </Panel>

        {/* 11. ASK */}
        <Panel id="ask" n={11} title="ข้อมูลที่ต้องยืนยันก่อนคำนวณ" sub="ยังไม่ใส่ตัวเลขใด ๆ — ตอบครบเมื่อไร จะสร้าง Business Model เฉพาะบุคคลให้" icon="?" delay={720}>
          <ol className="grid gap-2 sm:grid-cols-2">
            {ASK.map((q, i) => (
              <li key={q} className="bm-tile flex items-start gap-3 rounded-2xl border border-dashed border-sky-300/30 bg-sky-400/[0.07] px-3.5 py-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-sky-400 to-amber-300 text-[10px] font-black text-[#04122a]">{i + 1}</span>
                <span className="text-[11px] leading-relaxed text-slate-200">{q}</span>
              </li>
            ))}
          </ol>
          <div className="mt-3 rounded-2xl border border-amber-300/30 bg-amber-400/10 px-3.5 py-2.5 text-[11px] leading-relaxed text-amber-100">
            ⚠ เอกสารชุดนี้มีจุดที่ไม่ตรงกัน — ผู้บริหารศูนย์ยังไม่มีเงื่อนไข, ผู้บริหารภาคเอกสารระบุ 5 ศูนย์ แต่หน้า /career ระบุ 4 ศูนย์ และการ์ดด้านบนของหน้านี้ใช้เกณฑ์คนละชุด — ต้องยืนยันก่อนใช้คำนวณ
          </div>
        </Panel>
      </div>

      <div className="mt-3 text-center text-[10px] text-slate-500">
        อ้างอิงเอกสาร “สร้างโมเดลธุรกิจ” · ตัวเลขทั้งหมดเป็นการประมาณการเพื่อวางแผน ไม่ใช่การรับประกันรายได้
      </div>
    </div>
  );
}

const BM_STYLES = `
.bm-board { background: linear-gradient(165deg,#040d20 0%,#071a38 42%,#04102a 100%); box-shadow: 0 30px 90px -50px rgba(56,189,248,.55), inset 0 1px 0 rgba(255,255,255,.05); }
.bm-hero { background: radial-gradient(120% 120% at 12% 0%, rgba(56,189,248,.22) 0%, rgba(4,13,32,0) 55%), radial-gradient(100% 100% at 92% 8%, rgba(251,191,36,.18) 0%, rgba(4,13,32,0) 60%); }
.bm-gold { background: linear-gradient(90deg,#7dd3fc 0%,#fde68a 60%,#fbbf24 100%); -webkit-background-clip: text; background-clip: text; color: transparent; }
.bm-badge { background: linear-gradient(135deg,#7dd3fc 0%,#38bdf8 45%,#fbbf24 100%); }
.bm-nav { background: linear-gradient(180deg,rgba(4,13,32,.92) 0%,rgba(4,13,32,.78) 70%,rgba(4,13,32,0) 100%); backdrop-filter: blur(10px); }
.bm-tile { transition: transform .18s ease, border-color .18s ease, background-color .18s ease, box-shadow .18s ease; }
.bm-tile:hover { transform: translateY(-2px); border-color: rgba(125,211,252,.35); box-shadow: 0 14px 34px -22px rgba(56,189,248,.85); }
.bm-stat { transition: transform .18s ease; }
.bm-stat:hover { transform: translateY(-3px) scale(1.01); }
.bm-gauge { background: conic-gradient(from 200deg, rgba(125,211,252,.35) 0 12%, rgba(255,255,255,.06) 12% 100%); }
.bm-drop { box-shadow: 0 0 8px 1px rgba(125,211,252,.5); animation: bm-drop 2.4s ease-in-out infinite; }
@keyframes bm-drop { 0%,100% { opacity:.25; transform: scaleY(.6); } 50% { opacity:1; transform: scaleY(1); } }
.bm-in { animation: bm-rise .55s cubic-bezier(.22,.8,.28,1) both; }
@keyframes bm-rise { from { opacity:0; transform: translateY(14px); } to { opacity:1; transform: none; } }
html { scroll-behavior: smooth; }
@media (prefers-reduced-motion: reduce) {
  html { scroll-behavior: auto; }
  .bm-in, .bm-drop { animation: none; }
  .bm-tile:hover, .bm-stat:hover { transform: none; }
}
`;
