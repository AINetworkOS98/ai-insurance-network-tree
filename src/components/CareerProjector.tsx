'use client';
import { useMemo, useState } from 'react';
import {
  calculatePersonalCommission,
  calculateUnitCommission,
  calculateUnitSeparation,
  calculateCenterType1,
  calculateCenterType2,
  calculateCenterType3,
  calculateCenterSeparation,
  calculateCenterBonus,
  calculateRegionType1,
  calculateRegionBonus,
  calculateAnnualBonus,
} from '@/lib/calculationEngine';

/* ─────────────────────────────────────────────────────────────
   ตัวคำนวณการขึ้นตำแหน่ง + ประมาณการรายได้ล่วงหน้า (ผัง 1 แตก 5)
   - ใช้ฟังก์ชันเกณฑ์ค่าตอบแทนจริงจาก lib/calculationEngine (ไม่ประดิษฐ์สูตรใหม่)
   - ทุกตัวเลขเป็น "ประมาณการจากสมมติฐานที่ผู้ใช้ตั้งได้" — ไม่ใช่การรับประกันรายได้
   - บันไดตำแหน่งจริงมี 4 ระดับ (ตัวแทน → หน่วย → ศูนย์ → ภาค); ชั้นที่ 5 ขึ้นไป = ความจุผังเท่านั้น
   ───────────────────────────────────────────────────────────── */

type RankRow = {
  level: number; code: string; name: string; nameRef: string;
  qualifyCOM: number;          // บำเหน็จสะสมที่ต้องได้ (เกณฑ์บริษัท)
  timeTh: string;              // กรอบเวลาตามเกณฑ์
  incomeTh: string;            // โครงสร้างรายได้ตามเกณฑ์
};

// เกณฑ์จริงจากหน้า "ขึ้นตำแหน่ง" (ไทยประกันชีวิต, 15 Jan 64)
const RANKS: RankRow[] = [
  { level: 1, code: 'agent', name: 'ตัวแทน', nameRef: 'ระดับเริ่มงาน', qualifyCOM: 0, timeTh: 'เริ่มต้น', incomeTh: 'ค่าบำเหน็จ + ค่าพาหนะ (ปีแรก 25–40% ตามผลิตภัณฑ์)' },
  { level: 2, code: 'unit_manager', name: 'ผู้บริหารหน่วย', nameRef: 'ผู้บริหารหน่วย', qualifyCOM: 20000, timeTh: '1–6 เดือน', incomeTh: 'ค่าจัดงานหน่วย 25–40% ของ COM ทีม + ค่าแยกหน่วย 2,000/หน่วย' },
  { level: 3, code: 'center_manager', name: 'ผู้บริหารศูนย์', nameRef: 'ผู้บริหารศูนย์', qualifyCOM: 75000, timeTh: '3–6 เดือน', incomeTh: 'จัดงานศูนย์ ป.1 15–30% + ป.2 0.8% + ป.3 + แยกศูนย์ + โบนัสศูนย์' },
  { level: 4, code: 'regional_manager', name: 'ผู้บริหารภาค', nameRef: 'ผู้บริหารภาค (สูงสุด)', qualifyCOM: 1200000, timeTh: '12–24 เดือน', incomeTh: 'จัดงานภาค ป.1 10–18% + ป.2 + โบนัสภาค + ค่าแยกภาค + โบนัสปี' },
];

const fmt = (n: number) => (Number.isFinite(n) ? Math.round(n).toLocaleString('th-TH') : '0');
const fmtShort = (n: number) => {
  if (!Number.isFinite(n)) return '0';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1) + ' ล้าน';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K';
  return String(Math.round(n));
};

export default function CareerProjector() {
  // ── สมมติฐาน (ปรับได้) ──────────────────────────────────────
  const [spread, setSpread] = useState(5);            // 1 แตก 5
  const [premiumPerMonth, setPremiumPerMonth] = useState(20000);  // เบี้ยเฉลี่ย/คน/เดือน
  const [comRate, setComRate] = useState(30);          // % ค่าบำเหน็จจากเบี้ย
  const [activeRate, setActiveRate] = useState(70);    // % สมาชิกที่ยังผลิตงานจริง
  const [selfPremium, setSelfPremium] = useState(30000); // เบี้ยของตัวเอง/เดือน
  const [years, setYears] = useState(5);               // จำนวนปีที่คำนวณ
  const [ladderLayers, setLadderLayers] = useState(4);  // ชั้นบันไดที่แสดง (4 = ระดับจริงทั้งหมด)
  const [stackLevels, setStackLevels] = useState(false); // รวมรายได้ทุกระดับซ้อนกัน (ปิด = คิดเฉพาะตำแหน่งที่ถึง)
  const [computed, setComputed] = useState(true);
  const [tab, setTab] = useState<'ladder' | 'income'>('ladder');

  const r = comRate / 100;
  const ar = activeRate / 100;

  // ── คำนวณปีต่อปี (ใช้เกณฑ์จริง) ────────────────────────────
  const rows = useMemo(() => {
    const out: {
      year: number; members: number; active: number; premiumYear: number;
      teamComMonth: number; annualCOM: number; qualifyCOM: number; rankLevel: number; rankName: string;
      personal: number; unit: number; unitSep: number; center: number; region: number; annual: number; total: number; cumulative: number;
    }[] = [];

    let cumulative = 0;
    let qualifyCOM = 0;

    for (let y = 1; y <= years; y++) {
      // ทีม: ปีแรก 1 คน แล้วแต่ละคนแนะนำเพิ่ม spread คน/ปี
      const members = Math.pow(spread, y);
      const active = members * ar;
      const premiumYear = active * premiumPerMonth * 12;
      const teamComMonth = active * premiumPerMonth * r;
      const annualCOM = teamComMonth * 12;

      // ตัวเองผลิตงานสม่ำเสมอ (สมมติฐาน)
      const selfComYear = selfPremium * r * 12;

      const ownRank = active >= 1 ? [...RANKS].reverse().find((k) => k.level > 1 && qualifyCOM >= k.qualifyCOM) : undefined;
      const rankLevel = ownRank?.level ?? 1;
      const rankName = RANKS.find((k) => k.level === rankLevel)?.name || 'ตัวแทน';

      const personal = calculatePersonalCommission({ personalCOM: selfComYear } as any);
      // โหมดอนุรักษ์นิยม (ค่าเริ่มต้น): คิดรายได้เฉพาะตำแหน่งที่ถึงจริง — ไม่รวมทุกระดับซ้อนกัน
      const useUnit = stackLevels ? rankLevel >= 2 : rankLevel === 2;
      const useCenter = stackLevels ? rankLevel >= 3 : rankLevel === 3;
      const useRegion = stackLevels ? rankLevel >= 4 : rankLevel === 4;

      const unit = useUnit ? calculateUnitCommission(teamComMonth) * 12 : 0;
      const separatedUnits = useUnit ? Math.floor(active / (spread * spread)) : 0;
      const unitSep = useUnit ? calculateUnitSeparation(separatedUnits) * 12 : 0;

      const separatedCenters = useCenter ? Math.floor(active / (spread * spread * spread)) : 0;
      const renewalYear = premiumYear * 0.4; // สมมติฐาน: เบี้ยต่ออายุ 40% ของเบี้ยรวม
      const center = useCenter
        ? (calculateCenterType1(teamComMonth) + calculateCenterType3(teamComMonth)) * 12
          + calculateCenterType2(renewalYear)
          + calculateCenterSeparation(separatedCenters, teamComMonth)
          + calculateCenterBonus(annualCOM)
        : 0;

      const region = useRegion
        ? calculateRegionType1(premiumYear) + calculateRegionBonus(premiumYear)
        : 0;

      const annual = calculateAnnualBonus(premiumYear);

      const total = personal + unit + unitSep + center + region + annual;
      cumulative += total;
      // เกณฑ์คุณสมบัติ (บำเหน็จสะสม) คิดจากรายได้/บำเหน็จที่ตัวเองทำได้จริงในแต่ละปี — ไม่ใช่ COM ทั้งทีม
      qualifyCOM += total;

      out.push({
        year: y, members, active, premiumYear, teamComMonth, annualCOM, qualifyCOM,
        rankLevel, rankName, personal, unit, unitSep, center, region, annual, total, cumulative,
      });
    }
    return out;
  }, [years, spread, premiumPerMonth, r, ar, selfPremium, stackLevels]);

  const maxTotal = Math.max(...rows.map((x) => x.total), 1);
  const finalRow = rows[rows.length - 1];

  // ── บันไดชั้น ๆ (ต่อไม่สิ้นสุด) ──────────────────────────────
  const ladder = useMemo(() => {
    const out: {
      level: number; capacity: number; rank?: RankRow; real: boolean;
      comMonth: number; incomeMonth: number; reachYear: number | null; reached: boolean;
    }[] = [];
    for (let lv = 1; lv <= ladderLayers; lv++) {
      const capacity = Math.pow(spread, lv);           // 5^lv
      const rank = RANKS.find((k) => k.level === lv);
      const activeAtLevel = capacity * ar;
      const premiumMonth = activeAtLevel * premiumPerMonth;
      const comMonth = premiumMonth * r;
      // รายได้ต่อเดือน: ใช้สูตรตามระดับจริง (ชั้นเกิน 4 ใช้สูตรระดับสูงสุด — ติดป้ายชัดเจน)
      const effLevel = Math.min(lv, 4);
      let incomeMonth = 0;
      if (effLevel >= 1) {
        const lUseUnit = effLevel >= 2 && (stackLevels ? effLevel >= 2 : effLevel === 2);
        const lUseCenter = effLevel >= 3 && (stackLevels ? effLevel >= 3 : effLevel === 3);
        const lUseRegion = effLevel >= 4 && (stackLevels ? effLevel >= 4 : effLevel === 4);
        const separatedUnits = lUseUnit ? Math.floor(activeAtLevel / (spread * spread)) : 0;
        const separatedCenters = lUseCenter ? Math.floor(activeAtLevel / (spread * spread * spread)) : 0;
        incomeMonth += calculatePersonalCommission({ personalCOM: selfPremium * r } as any);
        if (lUseUnit) incomeMonth += calculateUnitCommission(comMonth) + calculateUnitSeparation(separatedUnits);
        if (lUseCenter) {
          incomeMonth += calculateCenterType1(comMonth) + calculateCenterType3(comMonth)
            + calculateCenterSeparation(separatedCenters, comMonth)
            + calculateCenterBonus(comMonth * 12);
        }
        if (lUseRegion) incomeMonth += calculateRegionType1(premiumMonth * 12) + calculateRegionBonus(premiumMonth * 12);
      }
      const reach = rows.find((x) => x.rankLevel >= Math.min(lv, 4));
      out.push({
        level: lv, capacity, rank, real: !!rank,
        comMonth, incomeMonth,
        reachYear: rank ? (reach?.year ?? null) : null,
        reached: !!rank && (finalRow?.rankLevel ?? 1) >= rank.level,
      });
    }
    return out;
  }, [ladderLayers, spread, premiumPerMonth, r, ar, selfPremium, rows, finalRow, stackLevels]);

  return (
    <div className="space-y-4">
      <style>{`
        @keyframes cpFlow { to { stroke-dashoffset: -60; } }
        @keyframes cpGlow { 0%,100% { opacity:.35 } 50% { opacity:.9 } }
        .cp-flow { stroke-dasharray: 8 14; animation: cpFlow 1s linear infinite; }
        .cp-glow { animation: cpGlow 3s ease-in-out infinite; }
        .cp-bar { transition: height .5s ease; }
      `}</style>

      {/* ── ปุ่มคำนวณ + สมมติฐาน ─────────────────────────────── */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-semibold text-sm">🧮 คำนวณการขึ้นตำแหน่งและรายได้ล่วงหน้า</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-800">
            ประมาณการจากเกณฑ์ในระบบ — ไม่ใช่การรับประกันรายได้
          </span>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setComputed(true)}
              className="px-5 py-2 rounded-full bg-[#c8a84e] text-[#1e293b] text-xs font-semibold hover:brightness-105"
            >คำนวณการขึ้นตำแหน่ง</button>
            <button
              onClick={() => { setComputed(true); setYears((y) => Math.min(30, y + 1)); }}
              className="px-4 py-2 rounded-full border bg-white text-xs font-semibold"
            >+ อีก 1 ปี</button>
            <button
              onClick={() => setLadderLayers((l) => Math.min(10, l + 1))}
              className="px-4 py-2 rounded-full border bg-white text-xs font-semibold"
              title="เพิ่มชั้นในบันได — ต่อเนื่องแบบไม่สิ้นสุด (เกินระดับสายงานจริงจะแสดงเป็นความจุผัง)"
            >+ อีก 1 ชั้น</button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
          <label className="p-2 rounded-xl border bg-slate-50">
            <span className="block text-slate-500">แตกละ (คน)</span>
            <input type="number" min={2} max={9} value={spread} onChange={(e) => setSpread(Math.max(2, Math.min(9, +e.target.value || 5)))}
              className="w-full mt-1 border rounded-lg px-2 py-1" />
          </label>
          <label className="p-2 rounded-xl border bg-slate-50">
            <span className="block text-slate-500">เบี้ย/คน/เดือน</span>
            <input type="number" step={1000} value={premiumPerMonth} onChange={(e) => setPremiumPerMonth(Math.max(0, +e.target.value || 0))}
              className="w-full mt-1 border rounded-lg px-2 py-1" />
          </label>
          <label className="p-2 rounded-xl border bg-slate-50">
            <span className="block text-slate-500">บำเหน็จ (%)</span>
            <input type="number" min={1} max={45} value={comRate} onChange={(e) => setComRate(Math.max(1, Math.min(45, +e.target.value || 30)))}
              className="w-full mt-1 border rounded-lg px-2 py-1" />
          </label>
          <label className="p-2 rounded-xl border bg-slate-50">
            <span className="block text-slate-500">สมาชิกผลิตงานจริง (%)</span>
            <input type="number" min={0} max={100} value={activeRate} onChange={(e) => setActiveRate(Math.max(0, Math.min(100, +e.target.value || 0)))}
              className="w-full mt-1 border rounded-lg px-2 py-1" />
          </label>
          <label className="p-2 rounded-xl border bg-slate-50">
            <span className="block text-slate-500">เบี้ยตัวเอง/เดือน</span>
            <input type="number" step={1000} value={selfPremium} onChange={(e) => setSelfPremium(Math.max(0, +e.target.value || 0))}
              className="w-full mt-1 border rounded-lg px-2 py-1" />
          </label>
          <label className="p-2 rounded-xl border bg-slate-50">
            <span className="block text-slate-500">คำนวณกี่ปี</span>
            <input type="number" min={1} max={30} value={years} onChange={(e) => setYears(Math.max(1, Math.min(30, +e.target.value || 1)))}
              className="w-full mt-1 border rounded-lg px-2 py-1" />
          </label>
          <label className="p-2 rounded-xl border bg-slate-50 col-span-2 md:col-span-3 lg:col-span-6 flex items-center gap-2">
            <input type="checkbox" checked={stackLevels} onChange={(e) => setStackLevels(e.target.checked)} className="mt-0.5" />
            <span className="text-slate-600">
              นับรายได้<strong>ทุกระดับซ้อนกัน</strong> (ปิดไว้ = คิดเฉพาะตำแหน่งที่ถึงจริง ปลอดภัยกว่า เพราะตำแหน่งที่สูงขึ้นไม่ได้รับค่าจัดงานของระดับล่างซ้ำ)
            </span>
          </label>
        </div>
      </div>

      {!computed ? null : (
        <>
          {/* ── แท็บ ─────────────────────────────────────────── */}
          <div className="flex gap-2 text-xs">
            <button onClick={() => setTab('ladder')}
              className={`px-4 py-2 rounded-full border ${tab === 'ladder' ? 'bg-navy text-white' : 'bg-white text-slate-600'}`}>
              บันไดการขึ้นตำแหน่ง ({ladder.length} ชั้น)
            </button>
            <button onClick={() => setTab('income')}
              className={`px-4 py-2 rounded-full border ${tab === 'income' ? 'bg-navy text-white' : 'bg-white text-slate-600'}`}>
              ประมาณการรายได้ {years} ปี
            </button>
          </div>

          {tab === 'ladder' && (
            <div className="card p-5">
              <h3 className="font-semibold text-sm">บันไดขึ้นตำแหน่ง — ชั้นต่อชั้น ลงไปเรื่อย ๆ</h3>
              <p className="text-[11px] text-slate-500 mt-1">
                ตำแหน่งจริงในสายงานมี 4 ระดับ • ชั้นที่ 5 ขึ้นไปแสดงเป็น <b>ความจุผัง 5<sup>n</sup></b> (ประมาณการต่อเนื่อง ไม่ใช่ตำแหน่งจริง)
              </p>
              <div className="mt-4 space-y-2">
                {ladder.map((L, i) => (
                  <div key={L.level} className="relative pl-8">
                    {/* เส้นไฟวิ่งระหว่างชั้น */}
                    {i < ladder.length - 1 && (
                      <svg className="absolute left-3 top-9 w-3 h-full" viewBox="0 0 12 100" preserveAspectRatio="none" aria-hidden>
                        <line x1="6" y1="0" x2="6" y2="100" stroke="#e2e8f0" strokeWidth="2" />
                        <line x1="6" y1="0" x2="6" y2="100" stroke="#38bdf8" strokeWidth="2" className="cp-flow" />
                      </svg>
                    )}
                    <span className={`absolute left-0 top-3 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${L.real ? 'bg-navy text-white' : 'bg-slate-200 text-slate-600'}`}>
                      {L.level}
                    </span>
                    <div className={`p-3 rounded-xl border text-xs ${L.reached ? 'bg-emerald-50 border-emerald-200' : 'bg-white'}`}>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold">{L.real ? L.rank!.name : `ชั้นที่ ${L.level} (เกินระดับสายงาน)`}</span>
                        {L.real && L.rank!.qualifyCOM > 0 && (
                          <span className="text-slate-500">เกณฑ์บำเหน็จสะสม {fmt(L.rank!.qualifyCOM)} ฿ • เวลา {L.rank!.timeTh}</span>
                        )}
                        {L.reached && <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px]">ถึงแล้ว</span>}
                        {L.real && L.reachYear && <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px]">คาดถึงปีที่ {L.reachYear}</span>}
                        <span className="ml-auto text-slate-500">ความจุผัง {fmt(L.capacity)} ตำแหน่ง</span>
                      </div>
                      <div className="mt-1 grid grid-cols-2 md:grid-cols-4 gap-2 text-[11px]">
                        <span className="text-slate-600">COM ทีม/เดือน <b>{fmtShort(L.comMonth)}</b></span>
                        <span className="text-slate-600">รายได้/เดือน (ตามเกณฑ์ระดับนี้) <b className="text-emerald-700">{fmt(L.incomeMonth)} ฿</b></span>
                        <span className="text-slate-600">ขยายต่อ <b>×{spread}</b> ทุกชั้น</span>
                        <span className="text-slate-600">{L.real ? 'ตำแหน่งจริงตามเกณฑ์บริษัท' : 'ประมาณการเพื่อวางแผนเท่านั้น'}</span>
                      </div>
                      {L.real && <div className="mt-1 text-[11px] text-slate-500">รายได้ตามเกณฑ์: {L.rank!.incomeTh}</div>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center gap-2">
                <button onClick={() => setLadderLayers((l) => Math.min(10, l + 1))}
                  className="px-4 py-2 rounded-full border bg-white text-xs font-semibold">+ เพิ่มชั้น (ต่อไม่สิ้นสุด)</button>
                <span className="text-[11px] text-slate-500">เพิ่มได้ถึง 10 ชั้น — ถัดจากนั้นตัวเลขความจุจะสูงเกินจริง (5<sup>n</sup>)</span>
              </div>
            </div>
          )}

          {tab === 'income' && (
            <div className="card p-5">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-sm">ประมาณการรายได้อัตโนมัติ ปีที่ 1 → ปีที่ {years}</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  คำนวณจากเกณฑ์ค่าตอบแทนในระบบ (ค่าบำเหน็จ/จัดงานหน่วย/ศูนย์/ภาค/โบนัสปี)
                </span>
                <button onClick={() => setYears((y) => Math.min(30, y + 1))}
                  className="ml-auto px-4 py-2 rounded-full border bg-white text-xs font-semibold">+ ดูปีถัดไป</button>
              </div>

              {/* กราฟแท่ง (SVG) */}
              <div className="mt-4 overflow-x-auto">
                <div className="flex items-end gap-2 h-40 min-w-[560px]">
                  {rows.map((row) => (
                    <div key={row.year} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-slate-500 tabular-nums">{fmtShort(row.total)}</span>
                      <div className="w-full rounded-t-lg cp-bar bg-gradient-to-t from-[#0e2a55] to-[#38bdf8]"
                        style={{ height: `${Math.max(4, (row.total / maxTotal) * 120)}px` }} />
                      <span className="text-[10px] text-slate-500">ปี {row.year}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* ตาราง */}
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-[11px] text-slate-500 border-b">
                      <th className="py-2 pr-2">ปี</th>
                      <th className="py-2 pr-2">ทีม (ผลิตงานจริง)</th>
                      <th className="py-2 pr-2">ระดับที่ถึง</th>
                      <th className="py-2 pr-2">COM ทีม/เดือน</th>
                      <th className="py-2 pr-2">ตัวเอง</th>
                      <th className="py-2 pr-2">หน่วย</th>
                      <th className="py-2 pr-2">ศูนย์</th>
                      <th className="py-2 pr-2">ภาค</th>
                      <th className="py-2 pr-2">โบนัสปี</th>
                      <th className="py-2 pr-2 font-bold">รวม/ปี</th>
                      <th className="py-2 pr-2 font-bold">สะสม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.year} className="border-b last:border-0 hover:bg-[#FFFBF5]">
                        <td className="py-2 pr-2 font-semibold">{row.year}</td>
                        <td className="py-2 pr-2 text-slate-600">{fmt(row.members)} ({fmt(row.active)})</td>
                        <td className="py-2 pr-2">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] ${row.rankLevel >= 3 ? 'bg-[#0e2a55] text-white' : row.rankLevel === 2 ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                            {row.rankName}
                          </span>
                        </td>
                        <td className="py-2 pr-2 tabular-nums">{fmt(row.teamComMonth)}</td>
                        <td className="py-2 pr-2 tabular-nums">{fmt(row.personal)}</td>
                        <td className="py-2 pr-2 tabular-nums">{fmt(row.unit + row.unitSep)}</td>
                        <td className="py-2 pr-2 tabular-nums">{fmt(row.center)}</td>
                        <td className="py-2 pr-2 tabular-nums">{fmt(row.region)}</td>
                        <td className="py-2 pr-2 tabular-nums">{fmt(row.annual)}</td>
                        <td className="py-2 pr-2 tabular-nums font-bold text-emerald-700">{fmt(row.total)}</td>
                        <td className="py-2 pr-2 tabular-nums text-slate-700">{fmt(row.cumulative)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {finalRow && (
                <div className="mt-3 grid md:grid-cols-3 gap-3 text-xs">
                  <div className="p-3 rounded-xl bg-[#0e2a55] text-white">
                    <div className="text-[11px] opacity-80">รายได้รวมสะสมถึงปีที่ {years}</div>
                    <div className="text-xl font-bold">{fmt(finalRow.cumulative)} ฿</div>
                  </div>
                  <div className="p-3 rounded-xl bg-sky-50 border">
                    <div className="text-[11px] text-slate-500">เฉลี่ยต่อเดือน (ปีที่ {years})</div>
                    <div className="text-xl font-bold text-sky-800">{fmt(finalRow.total / 12)} ฿</div>
                  </div>
                  <div className="p-3 rounded-xl bg-amber-50 border">
                    <div className="text-[11px] text-slate-500">ทีมทั้งหมด (ปีที่ {years})</div>
                    <div className="text-xl font-bold text-amber-800">{fmt(finalRow.members)} ตำแหน่ง · ผลิตงานจริง {fmt(finalRow.active)}</div>
                  </div>
                </div>
              )}

              <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
                <b>อ่านตัวเลขนี้ให้ถูก:</b> เป็น <b>ประมาณการ</b>จากสมมติฐานด้านบน (แตกละ {spread} คน • เบี้ย {fmt(premiumPerMonth)} ฿/คน/เดือน • บำเหน็จ {comRate}% • สมาชิกผลิตงานจริง {activeRate}% • เบี้ยต่ออายุ 40%)
                {' '}เกณฑ์คุณสมบัติคิดจาก<strong>บำเหน็จสะสมของตัวเอง</strong> (ไม่ใช่ COM ทั้งทีม)
                {stackLevels ? ' • โหมดรวมทุกระดับซ้อนกัน (ตัวเลขจะสูงกว่าความเป็นจริง)' : ' • คิดรายได้เฉพาะตำแหน่งที่ถึง (โหมดอนุรักษ์นิยม)'}
                {' '}สมมติฐานนี้ถือว่า<strong>ทุกคนแนะนำครบ {spread} คนทุกปี</strong> ซึ่งเป็นกรณีสูงสุด (ถ้าต้องการดูกรณีธรรมดาให้ลด "แตกละ" ลง เช่น 2–3)
                คำนวณด้วยฟังก์ชันเกณฑ์ค่าตอบแทนจริงของระบบ — <b>รายได้จริงขึ้นอยู่กับผลงานที่ตรวจสอบและอนุมัติแล้วเท่านั้น</b> ไม่ใช่การรับประกันรายได้
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
