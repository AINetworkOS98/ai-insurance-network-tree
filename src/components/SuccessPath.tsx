'use client';

import { useEffect, useState } from 'react';

/**
 * SuccessPath — ส่วน "เส้นทางก้าวสู่ความสำเร็จ" บนหน้า /financial-freedom
 *
 * หลักการออกแบบ (ตามที่ผู้ใช้กำหนด):
 *  - มีเพียง "หลักการทำงาน" เท่านั้น — ห้ามอ้างอิงบุคคล องค์กร หรือคำกล่าวของใครทั้งสิ้น
 *  - ทุกข้อความเป็นหลักการที่นำไปปฏิบัติได้จริงในระบบนี้
 *
 * 4 องค์ประกอบ:
 *  1) แผนที่เส้นทาง 5 ช่วง (P1–P5) — ก้าวสู่ความสำเร็จแบบเป็นขั้น
 *  2) ฟองสบู่หลักการ — ข้อความหลักการสั้น ๆ (ไม่มีชื่อผู้พูด)
 *  3) แนะนำ — 3 ข้อที่ทำได้จริงในแต่ละช่วง
 *  4) หลักการทำงาน 12 ข้อ — ใช้เป็นเกณฑ์ตรวจตัวเอง
 */

type Stage = {
  id: string;
  span: string;
  title: string;
  principle: string;
  detail: string;
  actions: string[];
};

const STAGES: Stage[] = [
  {
    id: 'P1',
    span: 'ช่วงที่ 1 · 0–90 วัน',
    title: 'เริ่มต้นด้วยวินัย',
    principle: 'เริ่มจากสิ่งที่มี ไม่รอความพร้อม',
    detail: 'ช่วงแรกยังไม่ต้องเก่ง ต้องสม่ำเสมอ — เลือกงานที่ทำได้จริงทุกวัน แล้ววัดผลให้เห็นเป็นตัวเลข',
    actions: [
      'ทำงาน 3 อย่างที่ทำได้จริงให้จบทุกวัน',
      'บันทึกผลงานรายวัน ให้ระบบช่วยนับและสรุปให้',
      'เริ่มจากคนที่รู้จักก่อน 5 คน — ไม่ต้องรอพร้อมทุกอย่าง',
    ],
  },
  {
    id: 'P2',
    span: 'ช่วงที่ 2 · 3–6 เดือน',
    title: 'สร้างความชำนาญ',
    principle: 'ความสม่ำเสมอชนะความสมบูรณ์แบบ',
    detail: 'ทักษะมาจากการทำซ้ำอย่างมีแบบแผน ทบทวนเคสที่ยังไม่สำเร็จเพื่อเก็บเป็นบทเรียน ไม่ใช่เพื่อตำหนิตัวเอง',
    actions: [
      'ฝึกนำเสนอ/ปิดการขายวันละ 10 นาที (role-play)',
      'ทบทวนเคสที่ไม่ปิด — เก็บบทเรียน ไม่โทษโชค',
      'ให้ AI ช่วยบอกว่าลีดไหนควรโฟกัสก่อน',
    ],
  },
  {
    id: 'P3',
    span: 'ช่วงที่ 3 · 6–12 เดือน',
    title: 'สร้างทีม',
    principle: 'ความสำเร็จที่ยั่งยืนต้องพาคนอื่นไปด้วย',
    detail: 'งานที่ทำคนเดียวจะชนเพดานเวลา — เมื่อมีทีม ต้องมีระบบที่คนอื่นทำตามได้ ไม่ใช่พึ่งความจำของเรา',
    actions: [
      'สร้างทีม 1×5 — หาคนที่ไว้ใจได้ 5 คน',
      'ให้ระบบช่วยแบกงาน (รับลีด · ติดตาม · เตือนนัด)',
      'ยกความดีให้ทีมทุกครั้งที่ปิดการขายได้',
    ],
  },
  {
    id: 'P4',
    span: 'ช่วงที่ 4 · 1–2 ปี',
    title: 'สร้างระบบ',
    principle: 'สิ่งที่วัดได้ จะพัฒนาได้',
    detail: 'เปลี่ยนงานซ้ำ ๆ ให้เป็นกระบวนการที่ตรวจสอบได้ และใช้ตัวเลขตัดสินใจแทนความรู้สึก',
    actions: [
      'ตั้ง KPI รายวัน/รายสัปดาห์ แล้วดูที่ระบบสรุปให้',
      'ใช้ระบบอัตโนมัติทำงานซ้ำแทนคน',
      'ใช้ AI ช่วยวิเคราะห์งานค้างและภาพการเงิน',
    ],
  },
  {
    id: 'P5',
    span: 'ช่วงที่ 5 · 2 ปีขึ้นไป',
    title: 'สร้างสินทรัพย์และส่งต่อ',
    principle: 'ทำสิ่งที่ทำซ้ำได้ แล้วปล่อยให้มันทำงานแทนเรา',
    detail: 'เมื่อระบบเดินได้เอง งานของเราคือดูแลคุณภาพและส่งต่อความรู้ เพื่อให้คนอื่นสร้างเส้นทางของตัวเองได้',
    actions: [
      'แชร์ลิงก์ชวน เพื่อให้คนอื่นได้เริ่มเส้นทางของเขา',
      'วางรายได้ 3 ชั้น: จากงานขาย · จากทีม · จากสินทรัพย์',
      'ดูแลการเงิน: กระแสเงินสด · เงินฉุกเฉิน · การออมอย่างสม่ำเสมอ',
    ],
  },
];

const PRINCIPLE_POOL = [
  'วินัยรายวันชนะแรงบันดาลใจชั่วครั้งชั่วคราว',
  'ความสม่ำเสมอสำคัญกว่าความสมบูรณ์แบบ',
  'สิ่งที่วัดได้ จะพัฒนาได้',
  'ระบบที่ชัดเจนทำงานได้แม้ไม่มีเรา',
  'งานที่ทำซ้ำได้ ควรให้ระบบทำ',
  'ความสำเร็จที่ยั่งยืนต้องพาคนอื่นไปด้วย',
  'ทบทวนทุกสัปดาห์ ปรับทุกเดือน ไม่รอสิ้นปี',
  'ให้ข้อมูลที่ถูกต้อง ไม่กดดัน ไม่สัญญาเกินจริง',
];

const PRINCIPLES: { k: string; v: string }[] = [
  { k: 'วัดผลได้', v: 'ตั้งเป้าที่นับเป็นตัวเลขได้ และติดตามทุกวัน' },
  { k: 'ทำทุกวัน', v: 'ทำให้น้อยแต่สม่ำเสมอ ดีกว่าทำมากแล้วหยุด' },
  { k: 'บันทึกไว้', v: 'ทุกงานที่ทำต้องมีบันทึก เพื่อดูแนวโน้มและส่งต่อ' },
  { k: 'ติดตามเร็ว', v: 'ตอบกลับลีดให้เร็วที่สุด ไม่ปล่อยค้างข้ามวัน' },
  { k: 'ไม่กดดัน', v: 'ให้ข้อมูลเพื่อการตัดสินใจ ไม่เร่งขาย' },
  { k: 'ขอความยินยอม', v: 'ติดต่อเฉพาะช่องทางที่ลูกค้ายินยอมเท่านั้น' },
  { k: 'เก็บกวาดงานค้าง', v: 'ตรวจงานเกินกำหนดทุกวัน ไม่ปล่อยให้พอกพูน' },
  { k: 'ยกเครดิตให้ทีม', v: 'ความสำเร็จของทีมคือความสำเร็จของทุกคน' },
  { k: 'สอนเพื่อย้ำความรู้', v: 'สอนคนอื่นคือวิธีทบทวนตัวเองที่ดีที่สุด' },
  { k: 'ใช้ข้อมูลตัดสินใจ', v: 'ดูตัวเลขก่อนสรุป ไม่เดาจากความรู้สึก' },
  { k: 'แยกเงินออกเป็นส่วน', v: 'เงินทำงาน เงินออม และเงินฉุกเฉิน ต้องแยกกันชัดเจน' },
  { k: 'ไม่รับปากเกินจริง', v: 'ไม่สัญญาผลลัพธ์ที่ควบคุมไม่ได้ รวมถึงผลตอบแทนการลงทุน' },
];

export default function SuccessPath() {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const [pIdx, setPIdx] = useState(0);

  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => setActive((i) => (i + 1) % STAGES.length), 8000);
    return () => clearInterval(t);
  }, [auto]);

  const s = STAGES[active];
  const bubble = PRINCIPLE_POOL[pIdx % PRINCIPLE_POOL.length];

  return (
    <div className="mb-8">
      {/* ── หัวข้อ ─────────────────────────────────────────────────────── */}
      <div className="mb-3">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-amber-300 text-sm font-semibold border border-slate-800">
          <span>🗺️</span> หลักการทำงาน
        </div>
        <h2 className="mt-4 text-2xl font-bold text-slate-900">เส้นทางก้าวสู่ความสำเร็จ — ทำเป็นขั้น ไม่ข้ามขั้น</h2>
        <p className="mt-2 text-slate-600 leading-relaxed">
          ด้านล่างคือ <strong>แผนที่ 5 ช่วง</strong> ของการสร้างอาชีพนี้ ไล่จากวินัยส่วนตัว → ความชำนาญ → ทีม → ระบบ → สินทรัพย์
          แต่ละช่วงมีหลักการทำงาน 1 ข้อ และสิ่งที่ลงมือทำได้จริง 3 อย่าง — ไม่มีสูตรลัด และไม่มีการรับประกันผลลัพธ์
        </p>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 shadow-[0_24px_60px_-30px_rgba(2,6,23,0.8)] overflow-hidden">
        {/* ── แผนที่: เส้นทาง 5 ช่วง ─────────────────────────────────────── */}
        <div className="sticky top-0 z-20 bg-slate-950/85 backdrop-blur-md border-b border-slate-800">
          <div className="flex items-center gap-2 px-4 md:px-6 py-3">
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-amber-400/10 text-amber-300 border border-amber-400/30">🗺️ แผนที่เส้นทาง</span>
            <span className="hidden md:inline text-[11px] text-slate-400">กดจุดบนเส้นทางเพื่อดูช่วงนั้น</span>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setPIdx((i) => i + 1)}
                className="text-[11px] font-semibold px-3 py-1.5 rounded-full bg-white/5 text-slate-200 border border-white/10 hover:bg-white/10 transition"
              >
                💬 หลักการถัดไป
              </button>
              <button
                onClick={() => setAuto((a) => !a)}
                className={`text-[11px] font-semibold px-3 py-1.5 rounded-full border transition ${auto ? 'bg-amber-400 text-slate-900 border-amber-400' : 'bg-transparent text-slate-300 border-white/15 hover:bg-white/5'}`}
              >
                {auto ? '⏸ หยุดไล่เส้นทาง' : '▶ ไล่เส้นทางอัตโนมัติ'}
              </button>
            </div>
          </div>

          {/* เส้นทางแนวนอน */}
          <div className="relative px-4 md:px-6 pb-4">
            <div className="absolute left-6 right-6 top-[18px] h-[2px] bg-gradient-to-r from-amber-400/20 via-amber-300/50 to-violet-400/20" />
            <div className="relative flex gap-2 overflow-x-auto [scrollbar-width:none]">
              {STAGES.map((st, i) => {
                const on = i === active;
                return (
                  <button key={st.id} onClick={() => { setActive(i); setAuto(false); }} className="shrink-0 w-[210px] text-left group">
                    <div className="flex items-center gap-2">
                      <span className={`w-[13px] h-[13px] rounded-full border-2 transition ${on ? 'bg-amber-400 border-amber-300 scale-125 shadow-[0_0_0_4px_rgba(251,191,36,0.18)]' : 'bg-slate-700 border-slate-600 group-hover:bg-slate-500'}`} />
                      <span className={`text-[10px] font-mono ${on ? 'text-amber-300' : 'text-slate-500'}`}>{st.id}</span>
                    </div>
                    <div className={`mt-2 rounded-xl border px-3 py-2 transition ${on ? 'bg-white/10 border-amber-400/40' : 'bg-white/[0.03] border-white/10 group-hover:bg-white/[0.06]'}`}>
                      <div className={`text-[11px] font-semibold ${on ? 'text-amber-200' : 'text-slate-400'}`}>{st.span}</div>
                      <div className={`text-[12px] mt-0.5 leading-snug ${on ? 'text-white' : 'text-slate-300'}`}>{st.title}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── เนื้อหา: ฟองสบู่หลักการ + แนะนำ ──────────────────────────────── */}
        <div className="grid md:grid-cols-[1fr_1fr] gap-4 md:gap-6 p-4 md:p-6">
          {/* ฟองสบู่หลักการ */}
          <div className="relative">
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-5 pr-6">
              <div className="flex items-center gap-2 text-[11px] text-amber-300/90 font-semibold">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-amber-400 opacity-70 animate-ping" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-amber-400" />
                </span>
                หลักการทำงาน · หลักที่ {(pIdx % PRINCIPLE_POOL.length) + 1}/{PRINCIPLE_POOL.length}
              </div>
              <blockquote className="mt-3 text-[17px] md:text-[19px] leading-relaxed text-white/95 font-semibold">
                “{bubble}”
              </blockquote>
              <div className="mt-3 text-[13px] text-slate-300 leading-relaxed border-t border-white/10 pt-3">
                หลักการนี้ใช้ได้ทั้งงานขาย งานดูแลทีม และงานจัดการการเงินของตัวเอง — เลือกมาใช้ข้อเดียวต่อสัปดาห์
                แล้ววัดผลจากตัวเลขในระบบ
              </div>
            </div>
            {/* หางฟองสบู่ */}
            <div className="absolute -bottom-2 left-8 w-4 h-4 rotate-45 bg-white/[0.04] border-r border-b border-white/10" />
          </div>

          {/* ช่วงที่เลือก: หลักการ + สิ่งที่นำมาปรับใช้ */}
          <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-5">
            <div className="text-[11px] font-mono text-slate-400">{s.span}</div>
            <div className="text-[17px] font-bold text-white mt-1 leading-snug">{s.title}</div>
            <div className="mt-3 rounded-xl bg-amber-400/10 border border-amber-400/25 px-3 py-2">
              <div className="text-[10px] font-bold text-amber-300/90 uppercase tracking-wide">หลักการทำงาน</div>
              <div className="text-[14px] font-semibold text-amber-100 mt-0.5">{s.principle}</div>
            </div>
            <p className="mt-3 text-[13px] text-slate-300 leading-relaxed">{s.detail}</p>
            <div className="mt-4 text-[11px] font-bold text-emerald-300">✅ แนะนำ — สิ่งที่ทำได้จริงในสัปดาห์นี้</div>
            <ul className="mt-2 space-y-2">
              {s.actions.map((a, i) => (
                <li key={i} className="flex gap-2 text-[13px] text-slate-200 leading-relaxed">
                  <span className="text-emerald-400 shrink-0">{i + 1}.</span>
                  {a}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href="/referral" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-amber-400 text-slate-900 text-xs font-bold hover:bg-amber-300 transition">🤝 แชร์ลิงก์ชวนของฉัน</a>
              <a href="/dashboard" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/5 text-slate-200 border border-white/15 text-xs font-semibold hover:bg-white/10 transition">📊 ดู KPI ของฉัน</a>
            </div>
          </div>
        </div>

        {/* ── หลักการทำงาน 12 ข้อ ──────────────────────────────────────────── */}
        <div className="px-4 md:px-6 pb-6">
          <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-violet-400/10 text-violet-300 border border-violet-400/30">📌 หลักการทำงาน 12 ข้อ</span>
              <span className="text-[11px] text-slate-400">ใช้เป็นเกณฑ์ตรวจตัวเองทุกสัปดาห์</span>
            </div>
            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
              {PRINCIPLES.map((h, i) => (
                <div key={h.k} className="rounded-xl bg-slate-900/60 border border-white/10 px-3 py-2.5">
                  <div className="text-[11px] text-amber-300/90 font-semibold">{i + 1}. {h.k}</div>
                  <div className="text-[12px] text-slate-200 leading-snug mt-0.5">{h.v}</div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-[11px] text-slate-400 leading-relaxed">
              หลักการทั้งหมดเป็นข้อกำหนดการทำงานภายในระบบนี้ ใช้เป็นแนวทางปฏิบัติเท่านั้น —
              ไม่ใช่การรับประกันรายได้ ผลลัพธ์ทางธุรกิจ หรือผลตอบแทนจากการลงทุน และไม่เกี่ยวข้องกับผลิตภัณฑ์ของบริษัทใด
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
