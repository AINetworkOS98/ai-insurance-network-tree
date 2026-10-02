'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/**
 * AutomationShowcase — ส่วน "ระบบอัตโนมัติทำงานจริง" สำหรับหน้า /financial-freedom
 *
 * เป้าหมาย: ให้สมาชิกทั่วไป "เห็น" ว่าระบบอัตโนมัติ (ชุด Passive Income 01–11 บน n8n) ทำงานกับข้อมูลจริงอย่างไร
 *  - สุ่มสดงตัวอย่างจริงทีละ 1 รายการ หมุนอัตโนมัติ (ข้อมูลถูกปิดชื่อ/เบอร์/อีเมลจาก API แล้ว)
 *  - มีปุ่มเลือกลิงก์ (11 ขั้นตอน) + แถบควบคุมแบบติดบนจอ (sticky) ให้เห็นตลอดเวลา
 *  - ไม่มีข้อมูลส่วนบุคคล และไม่มีการแก้ไขข้อมูลใด ๆ (อ่านอย่างเดียว)
 */

type Step = { id: string; code: string; icon: string; name: string; tagline: string; value: number; unit: string };
type Sample = { step: string; badge: string; tone: 'blue' | 'violet' | 'emerald' | 'amber' | 'rose'; title: string; lines: string[]; when?: string };
type Totals = Record<string, number>;
type ShowcaseData = { ok: boolean; at?: string; totals?: Totals; steps?: Step[]; samples?: Sample[]; note?: string };

const TONE: Record<string, string> = {
  blue: 'from-sky-50 to-blue-50 border-sky-200 text-sky-700',
  violet: 'from-violet-50 to-fuchsia-50 border-violet-200 text-violet-700',
  emerald: 'from-emerald-50 to-teal-50 border-emerald-200 text-emerald-700',
  amber: 'from-amber-50 to-orange-50 border-amber-200 text-amber-700',
  rose: 'from-rose-50 to-pink-50 border-rose-200 text-rose-700',
};

const TONE_DOT: Record<string, string> = {
  blue: 'bg-sky-500',
  violet: 'bg-violet-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
};

const FALLBACK_STEPS: Step[] = [
  { id: '01', code: '01_LEAD_CAPTURE', icon: '🎯', name: 'รับลีดทุกช่องทาง', tagline: 'เว็บ · ฟอร์ม · TikTok · LINE', value: 0, unit: 'ลีดในระบบ' },
  { id: '02', code: '02_LEAD_SCORING', icon: '🧠', name: 'AI ให้คะแนนลีด', tagline: 'แยกลีดร้อน + มอบงานให้ตัวแทน', value: 0, unit: 'ลีดคะแนน 80+' },
  { id: '03', code: '03_FOLLOWUP_ENGINE', icon: '🔁', name: 'ติดตามอัตโนมัติ D0–D14', tagline: 'ไม่ลืมติดตาม ไม่รบกวนเกินจำเป็น', value: 0, unit: 'ครบกำหนด' },
  { id: '04', code: '04_APPOINTMENT', icon: '📅', name: 'นัดหมาย + เตือนอัตโนมัติ', tagline: 'เตือน 24 ชม. / 2 ชม.', value: 0, unit: 'นัดข้างหน้า' },
  { id: '05', code: '05_TEAM_NETWORK', icon: '🌳', name: 'นับเครือข่าย 1×5', tagline: 'ผู้แนะนำ · ชั้นสายงาน · ผลงานทีม', value: 0, unit: 'สมาชิก' },
  { id: '06', code: '06_DAILY_KPI', icon: '📊', name: 'KPI รายวันอัตโนมัติ', tagline: 'ลีด · นัด · ปิดการขาย · งานค้าง', value: 0, unit: 'ลีดใหม่วันนี้' },
  { id: '07', code: '07_WEEKLY_REPORT', icon: '🗓️', name: 'รายงานสัปดาห์ + AI', tagline: 'ส่งให้หัวหน้าทีมเอง', value: 0, unit: 'ลีด 7 วัน' },
  { id: '08', code: '08_MONTHLY_FINANCIAL', icon: '💠', name: 'สรุปการเงินรายเดือน', tagline: 'กระแสเงินสด · การออม · เงินฉุกเฉิน', value: 0, unit: 'สมาชิกมีระดับ' },
  { id: '09', code: '09_AI_COACH', icon: '🧭', name: 'โค้ชการเงิน AI', tagline: 'Foundation → Assets', value: 0, unit: 'งานที่ AI ชี้' },
  { id: '10', code: '10_NOTIFICATION', icon: '🔔', name: 'แจ้งเตือนหลายช่องทาง', tagline: 'อีเมล · เว็บ · LINE', value: 0, unit: 'การแจ้งเตือน' },
  { id: '11', code: '11_ERROR_HANDLER', icon: '🛡️', name: 'เฝ้าระวัง + แก้ข้อผิดพลาด', tagline: 'บันทึก · แจ้งผู้ดูแล · ทำงานต่อ', value: 0, unit: 'งานที่ระบบมอบ' },
];

const HOW_IT_WORKS: Record<string, string[]> = {
  '01': ['สมาชิกแชร์ลิงก์ชวน → คนสนใจกรอกฟอร์ม', 'ระบบบันทึกลีดพร้อมช่องทางที่มาให้อัตโนมัติ', 'ตรวจซ้ำก่อนบันทึก — ลีดซ้ำจะอัปเดตข้อมูลเดิม ไม่สร้างซ้ำ'],
  '02': ['ระบบให้คะแนน 0–100 จากข้อมูลที่ให้มาเท่านั้น', 'แยกลีดร้อน (80+) / อุ่น (60–79) / ต้องบ่ม (40–59)', 'ลีดร้อนถูกมอบเป็นงานให้ตัวแทนทันที พร้อมข้อความแนะนำ'],
  '03': ['ติดตามตามกำหนด D0 / D1 / D3 / D7 / D14', 'ถ้าลูกค้ายังไม่ยินยอมในช่องทางนั้น ระบบจะไม่ส่ง', 'ครบกำหนดแล้วยังไม่ติดต่อ → แจ้งเตือนตัวแทนอีกครั้ง'],
  '04': ['มีนัด → ระบบบันทึกและตั้งเวลาเตือนเอง', 'เตือนตัวแทน 24 ชม. และ 2 ชม. ก่อนนัด', 'ไม่มาตามนัด → สร้างงานติดตามอัตโนมัติ'],
  '05': ['บันทึกผู้แนะนำ + ตำแหน่งในผัง 1×5 ให้เอง', 'นับจำนวนและชั้นสายงานโดยไม่ต้องนับมือ', 'ตัวเลขทีมใช้ประเมินงานและ KPI — ไม่ใช่การรับประกันรายได้'],
  '06': ['สรุปทุกวัน: ลีด · ติดต่อ · นัด · ปิดการขาย', 'รวมงานค้างและงานเกินกำหนดให้เห็นในที่เดียว', 'AI วิเคราะห์ให้ว่าวันนี้ควรโฟกัสอะไร'],
  '07': ['รวมผลงานทั้งสัปดาห์เป็นรายงานเดียว', 'AI สรุปแนวโน้มและข้อเสนอแนะ 3–5 ข้อ', 'ส่งให้หัวหน้าทีมทางอีเมล/ช่องทางที่เชื่อมไว้'],
  '08': ['คำนวณกระแสเงินสด · อัตราการออม · เงินฉุกเฉิน', 'ติดตามสัดส่วนรายได้เสริมและเงินลงทุน', 'เป็นการให้ข้อมูลเพื่อการเรียนรู้ ไม่ใช่สัญญาผลตอบแทน'],
  '09': ['AI ช่วยมองภาพการเงินเป็นลำดับขั้น', 'ชี้จุดแข็งและจุดที่ควรปรับ พร้อมข้อคำถามชวนคิด', 'แนะนำเชิงการศึกษา ไม่สั่งซื้อ/ขายหลักทรัพย์'],
  '10': ['เหตุการณ์สำคัญถูกส่งถึงผู้เกี่ยวข้องอัตโนมัติ', 'จัดลำดับความสำคัญ ปกติ/สูง/เร่งด่วน', 'กันการแจ้งซ้ำในเรื่องเดียวกัน'],
  '11': ['ทุกงานอัตโนมัติมีระบบเฝ้าระวัง', 'เกิดข้อผิดพลาด → บันทึก + แจ้งผู้ดูแลทันที', 'งานอื่นยังทำงานต่อ ไม่ล้มทั้งระบบ'],
};

export default function AutomationShowcase() {
  const [data, setData] = useState<ShowcaseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [idx, setIdx] = useState(0);
  const [play, setPlay] = useState(true);
  const boxRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/showcase', { cache: 'no-store' });
      const j: ShowcaseData = await r.json();
      setData(j);
      setIdx(0);
    } catch {
      setData({ ok: false });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const steps = data?.steps && data.steps.length ? data.steps : FALLBACK_STEPS;
  const allSamples = useMemo(() => data?.samples || [], [data]);
  const samples = useMemo(() => {
    if (!activeStep) return allSamples;
    const only = allSamples.filter((s) => s.step === activeStep);
    return only.length ? only : allSamples;
  }, [allSamples, activeStep]);

  useEffect(() => {
    setIdx(0);
  }, [activeStep]);

  useEffect(() => {
    if (!play || samples.length < 2) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % samples.length), 7000);
    return () => clearInterval(t);
  }, [play, samples.length]);

  const total = Number(data?.totals?.members || 0);
  const current = samples[idx % Math.max(samples.length, 1)];
  const step = steps.find((s) => s.id === (activeStep || current?.step)) || steps[0];
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  const scrollToCard = () => boxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });

  return (
    <div ref={boxRef} className="relative mb-8">
      <div className="rounded-3xl border border-slate-200 bg-white shadow-[0_18px_50px_-24px_rgba(15,23,42,0.35)] overflow-hidden">
        {/* ── แถบควบคุม: ติดบนจอเสมอเวลาอ่านส่วนนี้ (sticky) ───────────────── */}
        <div className="sticky top-0 z-20 backdrop-blur-md bg-white/85 border-b border-slate-200">
          <div className="flex flex-wrap items-center gap-2 px-4 md:px-6 py-3">
            <span className="inline-flex items-center gap-2 text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="relative flex w-2 h-2">
                <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-500" />
              </span>
              ระบบทำงานจริง
            </span>
            <h3 className="text-[15px] md:text-base font-bold text-slate-800">ระบบอัตโนมัติทำงานจริง — เห็นทุกขั้นตอน</h3>
            <span className="hidden md:inline text-[11px] text-slate-400">ข้อมูลจริง {total > 0 ? `จากสมาชิก ${total.toLocaleString('th-TH')} คน` : 'จากฐานระบบ'} · ปิดข้อมูลส่วนบุคคลแล้ว</span>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={() => setPlay((p) => !p)}
                className={`text-[11px] font-semibold px-3 py-1.5 rounded-full border transition ${play ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
              >
                {play ? '⏸ หยุดหมุน' : '▶ เล่นอัตโนมัติ'}
              </button>
              <button
                onClick={() => setIdx((i) => (samples.length ? (i + 1) % samples.length : 0))}
                className="text-[11px] font-semibold px-3 py-1.5 rounded-full bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 transition"
              >
                🎲 ตัวอย่างถัดไป
              </button>
            </div>
          </div>

          {/* ปุ่มเลือกลิงก์ 11 ขั้นตอน — เลื่อนแนวนอนได้ อยู่ติดจอตลอดเวลา */}
          <div ref={scrollerRef} className="flex gap-1.5 overflow-x-auto px-4 md:px-6 pb-3 [scrollbar-width:none]">
            <button
              onClick={() => { setActiveStep(null); }}
              className={`shrink-0 text-[11px] font-semibold px-3 py-1.5 rounded-full border transition ${!activeStep ? 'bg-[#475569] text-white border-[#475569]' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
            >
              ทั้งหมด
            </button>
            {steps.map((s) => {
              const on = activeStep === s.id || (!activeStep && current?.step === s.id);
              return (
                <button
                  key={s.id}
                  onClick={() => { setActiveStep(s.id); scrollToCard(); }}
                  title={s.tagline}
                  className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-full border transition ${on ? 'bg-[#1e293b] text-white border-[#1e293b] shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}
                >
                  <span>{s.icon}</span>
                  {s.id}
                  <span className="hidden lg:inline font-normal opacity-80">{s.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── เนื้อหา ─────────────────────────────────────────────────────── */}
        <div className="p-4 md:p-6 bg-gradient-to-br from-slate-50 via-white to-sky-50/50">
          <div className="grid md:grid-cols-[1.05fr_1fr] gap-4 md:gap-6">
            {/* ซ้าย: ขั้นตอนที่เลือก + วิธีทำงาน */}
            <div className="rounded-2xl bg-white border border-slate-200 p-4 md:p-5">
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-slate-900 text-white flex items-center justify-center text-xl shrink-0">{step.icon}</div>
                <div className="min-w-0">
                  <div className="text-[11px] font-mono text-slate-400">{step.code}</div>
                  <div className="text-[17px] font-bold text-slate-800 leading-snug">{step.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{step.tagline}</div>
                </div>
              </div>

              <div className="mt-4 flex items-end gap-3">
                <div className="text-3xl font-black text-slate-900 leading-none">{step.value.toLocaleString('th-TH')}</div>
                <div className="text-xs text-slate-500 pb-0.5">{step.unit}</div>
              </div>

              <ul className="mt-4 space-y-2">
                {(HOW_IT_WORKS[step.id] || []).map((t, i) => (
                  <li key={i} className="flex gap-2 text-[13px] text-slate-600 leading-relaxed">
                    <span className="text-emerald-500 shrink-0">✓</span>
                    {t}
                  </li>
                ))}
              </ul>

              <div className="mt-5 flex flex-wrap gap-2">
                <a href="/referral" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#475569] text-white text-xs font-semibold hover:bg-slate-800 transition">
                  🤝 ชวนสมาชิกเข้าระบบ
                </a>
                <a href="/tree" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-slate-700 border border-slate-200 text-xs font-semibold hover:bg-slate-50 transition">
                  🌳 ดูผังเครือข่ายของฉัน
                </a>
                <a href="/dashboard" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white text-slate-700 border border-slate-200 text-xs font-semibold hover:bg-slate-50 transition">
                  📊 แดชบอร์ดผลงาน
                </a>
              </div>
            </div>

            {/* ขวา: ตัวอย่างจริงทีละ 1 รายการ */}
            <div className="relative rounded-2xl bg-white border border-slate-200 p-4 md:p-5 overflow-hidden">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">ตัวอย่างจริงจากระบบ</span>
                <span className="text-[11px] text-slate-400">
                  {samples.length ? `${(idx % samples.length) + 1}/${samples.length}` : 'ไม่มีตัวอย่าง'}
                </span>
              </div>

              {loading ? (
                <div className="py-10 text-center text-sm text-slate-400">กำลังโหลดข้อมูลจริง…</div>
              ) : !current ? (
                <div className="py-8 text-center">
                  <div className="text-3xl mb-2">🌱</div>
                  <p className="text-sm text-slate-600 leading-relaxed">
                    ยังไม่มีตัวอย่างข้อมูลจริงให้สุ่มในขณะนี้ — เมื่อมีลีด/นัด/การติดตามเข้าระบบ
                    ตัวอย่างจะปรากฏที่นี่โดยอัตโนมัติ
                  </p>
                  <p className="text-[11px] text-slate-400 mt-2">ตัวเลขทุกขั้นตอนด้านซ้ายยังอัปเดตจากฐานระบบจริง</p>
                </div>
              ) : (
                <div key={`${current.step}-${current.title}-${idx}`} className="mt-3 animate-showcase-fade">
                  <span className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full bg-gradient-to-r border ${TONE[current.tone] || TONE.blue}`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${TONE_DOT[current.tone] || TONE_DOT.blue}`} />
                    {current.badge}
                  </span>
                  <div className="mt-3 text-[15px] font-bold text-slate-800">{current.title}</div>
                  <div className="mt-2 space-y-1.5">
                    {current.lines.map((l, i) => (
                      <div key={i} className="text-[13px] text-slate-600 leading-relaxed flex gap-2">
                        <span className="text-slate-300 shrink-0">•</span>
                        <span>{l}</span>
                      </div>
                    ))}
                  </div>
                  {current.when ? <div className="mt-3 text-[11px] text-slate-400">ข้อมูลเมื่อ {current.when}</div> : null}
                </div>
              )}

              {/* แถบความคืบหน้าการหมุน */}
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-slate-100">
                <div
                  className={`h-full bg-slate-900/70 transition-all duration-500 ${play && samples.length > 1 ? 'animate-showcase-grow' : ''}`}
                  style={{ width: `${samples.length ? (((idx % samples.length) + 1) / samples.length) * 100 : 0}%` }}
                />
              </div>
            </div>
          </div>

          {/* แถบตัวเลขจริง */}
          <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-2 md:gap-3">
            {[
              { k: 'members', label: 'สมาชิกในเครือข่าย', unit: 'คน' },
              { k: 'leads', label: 'ลีดในระบบ', unit: 'ราย' },
              { k: 'tasksOpen', label: 'งานที่ระบบมอบให้', unit: 'งาน' },
              { k: 'followupsDue', label: 'ติดตามครบกำหนด', unit: 'รายการ' },
              { k: 'appointmentsUpcoming', label: 'นัดข้างหน้า', unit: 'นัด' },
            ].map((m) => (
              <div key={m.k} className="rounded-xl bg-white border border-slate-200 px-3 py-2.5">
                <div className="text-[11px] text-slate-500">{m.label}</div>
                <div className="text-lg font-bold text-slate-900 leading-tight">
                  {Number(data?.totals?.[m.k] || 0).toLocaleString('th-TH')}
                  <span className="text-[11px] font-normal text-slate-400 ml-1">{m.unit}</span>
                </div>
              </div>
            ))}
          </div>

          <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
            {data?.note || 'ตัวเลขและตัวอย่างทั้งหมดเป็นข้อมูลจริงจากฐานระบบ โดยปิดชื่อ-เบอร์-อีเมลของลูกค้าแล้ว'}
            {data?.at ? ` · อัปเดตล่าสุด ${new Date(data.at).toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
            {' · '}ระบบอัตโนมัติช่วยลดงานซ้ำ แต่ไม่ได้รับประกันรายได้หรือผลลัพธ์ทางธุรกิจ
          </p>
        </div>
      </div>
    </div>
  );
}
