'use client';
/**
 * TaxExamplesByOccupation.tsx — ตัวอย่างการยื่นภาษีตามอาชีพ (ประมาณการรายได้)
 * + เปรียบเทียบการลดหย่อนด้วยเบี้ยประกันชีวิต ตามหลักกฎหมายที่ถูกต้อง
 * --------------------------------------------------------------------------
 * ทุกตัวเลขในหน้านี้คำนวณสดจาก computePit() ตัวเดียวกับโปรแกรมคำนวณด้านบน
 * (ไม่มีเลขที่พิมพ์ค้างไว้) — ถ้าแก้กติกาที่ thaiPit.ts ตัวเลขทั้งหมดจะเปลี่ยนตามทันที
 * เอกสารอ้างอิง: ภ.ง.ด.90 + ใบแนบลดหย่อน ข้อ 7.1–7.3 + คำชี้แจงการกรอก ภ.ง.ด.90 (ข้อ 7)
 */
import { useMemo, useState } from 'react';
import occFile from '../../../python/occupations_examples.json';
import {
  computePit, DEFAULT_TAX_YEAR, LIM, TAX_BRACKETS,
  type PitPerson, type PitIncomeItem, type PitResult, type IncomeKey,
} from '@/lib/tax/thaiPit';

const baht0 = (v: number) => Number(v || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 });
const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

const item = (category: IncomeKey, amount: number, variant?: string, description?: string): PitIncomeItem => ({
  category, amount, variant: variant ?? '', description: description ?? '', expense_mode: 'standard',
});
const run = (items: PitIncomeItem[], extra: Partial<PitPerson> = {}): PitResult =>
  computePit([{ personal: true, income_items: items, ...extra }], DEFAULT_TAX_YEAR);

const formOf = (items: PitIncomeItem[], extra: Partial<PitPerson> = {}) => {
  const cats = new Set(items.map((i) => i.category));
  if (extra.personal_special || extra.spouse_no_income || extra.spouse_life_insurance || extra.children) return 'ภ.ง.ด.90';
  return cats.size === 1 && cats.has('salary') ? 'ภ.ง.ด.91' : 'ภ.ง.ด.90';
};

/** อัตราภาษีที่ต้องเสียจริงของเงินได้ระดับนี้ (สำหรับอธิบาย "ประหยัดได้กี่บาทต่อเบี้ย 100) */
const marginalBand = (r: PitResult) => r.marginal_rate;

/* ───────────────────────── 1) ตัวอย่างตามอาชีพ ───────────────────────── */
type Occ = {
  id: string; job: string; form: string; items: PitIncomeItem[]; extra?: Partial<PitPerson>; assume: string;
};

type RawOcc = {
  id: string; job: string; income_label: string; assume: string;
  items: Array<{ category: string; amount: number; variant?: string; description?: string }>;
  extra?: Partial<PitPerson>;
};

/** รายการอาชีพ: อ่านจาก python/occupations_examples.json — ไฟล์เดียวกับโปรแกรม Python */
const OCCUPATIONS: Occ[] = (occFile as unknown as { occupations: RawOcc[] }).occupations.map((o) => ({
  id: o.id,
  job: o.job,
  form: o.income_label,
  assume: o.assume,
  items: o.items.map((i) => ({
    category: i.category as IncomeKey,
    amount: i.amount,
    variant: i.variant ?? '',
    description: i.description ?? '',
    expense_mode: 'standard',
  })),
  extra: o.extra ?? {},
}));

/* ───────────────── 2) เปรียบเทียบลดหย่อนประกันชีวิต ───────────────── */
const LIFE = LIM.life_insurance;          // 100,000 (ข้อ 7.1)
const HEALTH = LIM.health_insurance;      // 25,000 (ข้อ 7.2)
const COMBINED = LIM.life_health_combined; // 100,000 (7.1+7.2)
const PENSION = LIM.pension_life;         // 200,000 (ข้อ 7.3)

/** ตาราง A: ระดับเงินได้ × เบี้ยประกันชีวิต 100,000 (เต็มเพดาน) */
const LEVELS = [300_000, 480_000, 600_000, 1_000_000, 2_000_000, 5_000_000];

/** ตาราง B: เบี้ยที่จ่ายจริงต่าง ๆ ที่เงินได้ 1,000,000 */
const PREMIUMS = [0, 12_000, 30_000, 60_000, 100_000, 150_000, 200_000];

/** ตาราง C: กรณีที่คนมักเข้าใจผิด (เงินได้ 1,000,000) */
const MIXED: Array<{ label: string; extra: Partial<PitPerson>; note: string }> = [
  { label: 'ไม่ซื้อประกันเลย', extra: {}, note: 'ฐานเปรียบเทียบ' },
  { label: `ประกันชีวิต ${baht0(LIFE)}`, extra: { life_insurance: LIFE }, note: `ใช้สิทธิได้เต็มเพดานข้อ 7.1` },
  { label: `ประกันสุขภาพ ${baht0(HEALTH)} อย่างเดียว`, extra: { health_insurance: HEALTH }, note: 'ใช้สิทธิได้ 25,000 (ไม่เกินเพดานข้อ 7.2)' },
  { label: `ชีวิต 60,000 + สุขภาพ ${baht0(HEALTH)}`, extra: { life_insurance: 60_000, health_insurance: HEALTH }, note: 'รวม 85,000 — ยังไม่ชนเพดานรวม' },
  { label: `ชีวิต ${baht0(LIFE)} + สุขภาพ ${baht0(HEALTH)}`, extra: { life_insurance: LIFE, health_insurance: HEALTH }, note: `⚠️ จ่ายรวม 125,000 แต่ใช้สิทธิได้แค่ ${baht0(COMBINED)}` },
  { label: `ชีวิตแบบบำนาญ 150,000`, extra: { pension_life_insurance: 150_000 }, note: 'ร้อยละ 15 ของเงินได้ (150,000) ไม่เกิน 200,000 · นับในวงเงินเกษียณ 500,000' },
];

export default function TaxExamplesByOccupation() {
  /** แบ่งหน้า: แสดงหน้าละ 20 อาชีพ (ผู้ใช้ขอปุ่ม "หน้าถัดไป") */
  const PAGE_SIZE = 20;
  const [page, setPage] = useState(1);

  const occRows = useMemo(() => OCCUPATIONS.map((o) => {
    const r = run(o.items, o.extra);
    const gross = r.gross_total;
    return {
      ...o,
      formDoc: formOf(o.items, o.extra),
      r,
      gross,
      eff: gross > 0 ? r.tax_before_credit / gross : 0,
    };
  }), []);

  /** ตาราง A */
  const tableA = useMemo(() => LEVELS.map((income) => {
    const base: Partial<PitPerson> = { social_security: 9_000 };
    const noIns = run([item('salary', income, '', 'เงินเดือน')], base);
    const withIns = run([item('salary', income, '', 'เงินเดือน')], { ...base, life_insurance: LIFE });
    const allowed = Math.min(LIFE, LIM.life_insurance);
    return {
      income, noIns, withIns,
      saved: noIns.tax_before_credit - withIns.tax_before_credit,
      savedPer100: allowed > 0 ? (noIns.tax_before_credit - withIns.tax_before_credit) / allowed : 0,
      marginal: marginalBand(noIns),
    };
  }), []);

  /** ตาราง B */
  const tableB = useMemo(() => {
    const income = 1_000_000;
    const base: Partial<PitPerson> = { social_security: 9_000 };
    const noIns = run([item('salary', income, '', 'เงินเดือน')], base);
    return PREMIUMS.map((premium) => {
      const r = run([item('salary', income, '', 'เงินเดือน')], { ...base, life_insurance: premium });
      const usedItem = r.allowance_items.find((a) => a.item === '7.1');
      const used = usedItem ? usedItem.amount : 0;
      return {
        premium, r, used,
        saved: noIns.tax_before_credit - r.tax_before_credit,
        wasted: Math.max(0, premium - used),
        effective: premium > 0 ? (noIns.tax_before_credit - r.tax_before_credit) / premium : 0,
      };
    });
  }, []);

  /** ตาราง C */
  const tableC = useMemo(() => {
    const income = 1_000_000;
    const base: Partial<PitPerson> = { social_security: 9_000 };
    const noIns = run([item('salary', income, '', 'เงินเดือน')], base);
    return MIXED.map((m) => {
      const r = run([item('salary', income, '', 'เงินเดือน')], { ...base, ...m.extra });
      const paidPremium =
        Number(m.extra.life_insurance || 0) + Number(m.extra.health_insurance || 0) + Number(m.extra.pension_life_insurance || 0);
      const used = ['7.1', '7.2', '7.3'].reduce((s, k) => {
        const a = r.allowance_items.find((x) => x.item === k);
        return s + (a ? a.amount : 0);
      }, 0);
      return {
        ...m, r, paidPremium, used,
        saved: noIns.tax_before_credit - r.tax_before_credit,
      };
    });
  }, []);

  /** 1ข) เปรียบเทียบรายได้–ภาษี ของทุกอาชีพที่ต้องยื่นแบบ */
  const compare = useMemo(() => {
    const filing = occRows.filter((o) => o.r.must_file);
    const maxGross = Math.max(1, ...filing.map((o) => o.gross));
    const maxTax = Math.max(1, ...filing.map((o) => o.r.tax_before_credit));
    const byTax = [...filing].sort((a, b) => b.r.tax_before_credit - a.r.tax_before_credit);
    const grossSum = filing.reduce((s, o) => s + o.gross, 0);
    const taxSum = filing.reduce((s, o) => s + o.r.tax_before_credit, 0);
    const groupMap = new Map<number, typeof filing>();
    filing.forEach((o) => groupMap.set(o.gross, [...(groupMap.get(o.gross) ?? []), o]));
    const sameIncome = [...groupMap.entries()]
      .filter(([, v]) => v.length > 1)
      .map(([income, v]) => {
        const sorted = [...v].sort((a, b) => b.r.tax_before_credit - a.r.tax_before_credit);
        const top = sorted[0];
        const low = sorted[sorted.length - 1];
        return {
          income, rows: sorted,
          gap: top.r.tax_before_credit - low.r.tax_before_credit,
          rateGap: top.eff - low.eff,
          cheaper: low.job, expensive: top.job,
        };
      })
      .sort((a, b) => b.gap - a.gap);
    return {
      filing, maxGross, maxTax, byTax, sameIncome, grossSum, taxSum,
      payTax: filing.filter((o) => o.r.tax_before_credit > 0).length,
      zeroTax: filing.filter((o) => o.r.tax_before_credit <= 0).length,
      avgRate: grossSum > 0 ? taxSum / grossSum : 0,
    };
  }, [occRows]);

  const maxBand = TAX_BRACKETS[TAX_BRACKETS.length - 1][1];

  /* ── แบ่งหน้าอาชีพ ── */
  const pageCount = Math.max(1, Math.ceil(occRows.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const pageRows = occRows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const pageByTax = [...pageRows].sort((a, b) => b.r.tax_before_credit - a.r.tax_before_credit);
  const fromNo = (safePage - 1) * PAGE_SIZE + 1;
  const toNo = Math.min(safePage * PAGE_SIZE, occRows.length);
  const top10 = compare.byTax.slice(0, 10);
  const sameIncomeShown = compare.sameIncome.slice(0, 12);

  const goPage = (p: number) => {
    setPage(Math.min(Math.max(1, p), pageCount));
    if (typeof document !== 'undefined') {
      const el = document.getElementById('tax-examples');
      if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 12, behavior: 'smooth' });
    }
  };

  /** แถบแบ่งหน้า (ใช้ร่วมกันทั้งตารางอาชีพและกราฟเปรียบเทียบ) */
  const Pager = ({ at }: { at: 'table' | 'chart' }) => {
    const win = 2;
    const pages: number[] = [];
    for (let p = 1; p <= pageCount; p++) {
      if (p === 1 || p === pageCount || Math.abs(p - safePage) <= win) pages.push(p);
    }
    const btn = 'px-3 py-1.5 rounded-full border text-[11px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed';
    return (
      <div className={`flex flex-wrap items-center gap-2 ${at === 'chart' ? 'mt-3' : 'mt-4'}`}>
        <button disabled={safePage <= 1} onClick={() => goPage(safePage - 1)} className={`${btn} border-gray-200 bg-white text-slate-600 hover:bg-sky-50`}>
          ‹ หน้าก่อนหน้า
        </button>
        {pages.map((p, i) => (
          <span key={p} className="flex items-center gap-2">
            {i > 0 && p - pages[i - 1] > 1 && <span className="text-[11px] text-slate-300">…</span>}
            <button onClick={() => goPage(p)}
              className={`px-3 py-1.5 rounded-full border text-[11px] font-semibold tabular-nums ${p === safePage ? 'bg-[#475569] text-white border-[#475569]' : 'bg-white text-slate-600 border-gray-200 hover:bg-sky-50'}`}>
              {p}
            </button>
          </span>
        ))}
        <button disabled={safePage >= pageCount} onClick={() => goPage(safePage + 1)}
          className={`${btn} bg-[#475569] text-white border-[#475569] hover:opacity-90`}>
          หน้าถัดไป ›
        </button>
        <span className="text-[11px] text-slate-400 ml-1 tabular-nums">
          หน้า {safePage} จาก {pageCount} · แสดงอาชีพที่ {fromNo.toLocaleString('en-US')}–{toNo.toLocaleString('en-US')} จากทั้งหมด {occRows.length.toLocaleString('en-US')} อาชีพ
        </span>
      </div>
    );
  };


  return (
    <div className="space-y-4" id="tax-examples">
      {/* ── หัวข้อ ── */}
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold text-[#475569]">ตัวอย่างการยื่นภาษีตามอาชีพ + การลดหย่อนด้วยประกันชีวิต</h2>
          <span className="text-xs px-2 py-1 rounded-full border bg-white text-slate-500">ปีภาษี {DEFAULT_TAX_YEAR}</span>
          <span className="text-xs px-2 py-1 rounded-full border border-sky-100 bg-sky-50 text-sky-700">คำนวณสดจากเอนจินเดียวกับโปรแกรมด้านบน</span>
        </div>
        <p className="text-xs text-slate-500 mt-2 leading-5">
          ทุกตัวเลขเป็น <b>ประมาณการ</b> จากรายได้ตัวอย่างตามอาชีพจริง (สมมติโสด ไม่มีบุตร) โดยใช้ค่าใช้จ่ายเหมาที่กฎหมายกำหนด
          และค่าลดหย่อนเฉพาะที่อาชีพนั้นมีจริง — ตัวเลขในตาราง <b>คำนวณใหม่ทุกครั้งที่เปิดหน้า</b> จากฟังก์ชัน <code>computePit()</code> ตัวเดียวกับโปรแกรมด้านบน
          (ไม่ใช่เลขที่พิมพ์ค้างไว้) จึงตรงกับแบบ ภ.ง.ด.90 ข้อ 11 เสมอ ·
          <b> ตารางและกราฟแบ่งหน้าละ 20 อาชีพ — ใช้ปุ่ม “หน้าถัดไป” ด้านล่างของแต่ละส่วน</b>
        </p>
      </div>

      {/* ── ตารางอาชีพ ── */}
      <div className="card p-4 sm:p-5">
        <h3 className="text-sm font-bold text-[#475569] mb-3">1) ประมาณการภาษีตามอาชีพ ({OCCUPATIONS.length} อาชีพ)</h3>
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-[11px] tabular-nums min-w-[880px]">
            <thead>
              <tr className="text-slate-400 text-left border-b">
                <th className="py-2 pr-2 font-semibold">อาชีพ</th>
                <th className="py-2 pr-2 font-semibold">ประเภทเงินได้</th>
                <th className="py-2 pr-2 font-semibold text-right">รายได้/ปี (ประมาณ)</th>
                <th className="py-2 pr-2 font-semibold text-right">หักค่าใช้จ่าย</th>
                <th className="py-2 pr-2 font-semibold text-right">ลดหย่อน</th>
                <th className="py-2 pr-2 font-semibold text-right">เงินได้สุทธิ (ข้อ 11.7)</th>
                <th className="py-2 pr-2 font-semibold text-right">ภาษีต้องชำระ</th>
                <th className="py-2 pr-2 font-semibold text-right">อัตราเฉลี่ย</th>
                <th className="py-2 font-semibold">แบบที่ยื่น</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((o) => (
                <tr key={o.id} className="border-b border-dashed last:border-0 align-top">
                  <td className="py-2 pr-2">
                    <div className="font-semibold text-slate-700">{o.job}</div>
                    <div className="text-[10px] text-slate-400 leading-3 mt-0.5 max-w-[300px]">{o.assume}</div>
                  </td>
                  <td className="py-2 pr-2 text-slate-500 whitespace-nowrap">{o.form}</td>
                  <td className="py-2 pr-2 text-right text-slate-700">{baht0(o.gross)}</td>
                  <td className="py-2 pr-2 text-right text-rose-600">−{baht0(o.r.expenses_total)}</td>
                  <td className="py-2 pr-2 text-right text-rose-600">−{baht0(o.r.allowances_total)}</td>
                  <td className="py-2 pr-2 text-right text-slate-700">{baht0(o.r.net_income)}</td>
                  <td className="py-2 pr-2 text-right font-semibold text-slate-800">{baht0(o.r.tax_before_credit)}</td>
                  <td className="py-2 pr-2 text-right text-slate-500">{pct(o.eff)}</td>
                  <td className="py-2 whitespace-nowrap">
                    <span className={`px-1.5 py-0.5 rounded border text-[10px] ${o.formDoc === 'ภ.ง.ด.91' ? 'bg-sky-50 border-sky-100 text-sky-700' : 'bg-slate-50 border-gray-200 text-slate-600'}`}>
                      {o.formDoc}
                    </span>
                    <span className="block text-[10px] text-slate-400 mt-1">
                      {o.r.must_file ? `ต้องยื่น (เกิน ${baht0(o.r.file_threshold)})` : 'ไม่ถึงเกณฑ์ต้องยื่น'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 mt-3 leading-4">
          • ค่าใช้จ่ายเป็นแบบ <b>เหมา</b> ตามอัตราที่กฎหมายกำหนด — ผู้ที่ทำบัญชีได้ (40(5)–(8)) เลือกหัก <b>ตามจริง</b> แทนได้ ถ้าสูงกว่า<br/>
          • เกณฑ์ต้องยื่นแบบ: เงินได้ 40(1) เกิน 60,000 บาท หรือเงินได้ประเภทอื่นรวมเกิน 120,000 บาท · เงินเดือนอย่างเดียวทั้งปี → ยื่น ภ.ง.ด.91 (แบบสั้น)<br/>
          • กรณีมีบุตร/คู่สมรส/ซื้อบ้าน/กองทุนเกษียณ ให้กรอกเพิ่มในโปรแกรมคำนวณด้านบนเพื่อดูผลจริงของตัวเอง
        </p>
        <Pager at="table" />
      </div>

      {/* ── 1ข) เปรียบเทียบรายได้–ภาษี ทุกอาชีพที่ต้องยื่นแบบ ── */}
      <div className="card p-4 sm:p-5" id="tax-income-compare">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-[#475569]">1ข) เปรียบเทียบรายได้–ภาษี ของทุกอาชีพที่ต้องยื่นแบบภาษี</h3>
          <span className="text-[11px] px-2 py-0.5 rounded-full border border-sky-100 bg-sky-50 text-sky-700">
            {compare.filing.length} อาชีพ · หน้านี้แสดง {pageByTax.length} อาชีพ (เรียงจากภาษีมาก → น้อย)
          </span>
        </div>

        {/* สรุปภาพรวม */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-3">
          {[
            { label: 'อาชีพที่ต้องยื่นแบบ', value: `${compare.filing.length}`, unit: 'อาชีพ', tone: 'text-[#475569]' },
            { label: 'ต้องชำระภาษี', value: `${compare.payTax}`, unit: 'อาชีพ', tone: 'text-rose-600' },
            { label: 'ต้องยื่นแต่ภาษี 0 บาท', value: `${compare.zeroTax}`, unit: 'อาชีพ', tone: 'text-emerald-600' },
            { label: 'อัตราภาษีเฉลี่ยรวม', value: pct(compare.avgRate), unit: `จากรายได้รวม ${baht0(compare.grossSum)}`, tone: 'text-sky-700' },
          ].map((s) => (
            <div key={s.label} className="rounded-2xl border border-gray-100 bg-slate-50/40 p-3">
              <div className="text-[10px] text-slate-400 leading-3">{s.label}</div>
              <div className={`text-xl font-bold tabular-nums mt-1 ${s.tone}`}>{s.value}</div>
              <div className="text-[10px] text-slate-400 leading-3">{s.unit}</div>
            </div>
          ))}
        </div>

        {/* กราฟแท่งเทียบรายได้ vs ภาษี */}
        <div className="mt-4">
          <div className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500 mb-2">
            <span className="flex items-center gap-1"><span className="inline-block w-4 h-2 rounded-full bg-sky-400" /> รายได้/ปี</span>
            <span className="flex items-center gap-1"><span className="inline-block w-4 h-2 rounded-full bg-rose-400" /> ภาษีที่ต้องชำระ</span>
            <span className="text-slate-400">(แต่ละแท่งเทียบเป็นสัดส่วนกับค่าสูงสุดของตัวเอง — แท่งรายได้เต็ม = {baht0(compare.maxGross)} · แท่งภาษีเต็ม = {baht0(compare.maxTax)})</span>
          </div>
          <div className="space-y-2.5">
            {pageByTax.map((o) => (
              <div key={o.id} className="grid grid-cols-[minmax(110px,190px)_1fr_auto] gap-2 items-center">
                <div className="text-[11px] text-slate-600 leading-3">{o.job}</div>
                <div className="space-y-1">
                  <div className="h-2.5 rounded-full bg-slate-100">
                    <div className="h-2.5 rounded-full bg-sky-400" style={{ width: `${Math.max(1.5, (o.gross / compare.maxGross) * 100).toFixed(1)}%` }} />
                  </div>
                  <div className="h-2.5 rounded-full bg-slate-100">
                    <div className="h-2.5 rounded-full bg-rose-400" style={{ width: `${(o.r.tax_before_credit / compare.maxTax) * 100 <= 0 ? 0 : Math.max(1.5, (o.r.tax_before_credit / compare.maxTax) * 100).toFixed(1)}%` }} />
                  </div>
                </div>
                <div className="text-[11px] tabular-nums text-right leading-3 min-w-[150px]">
                  <div className="text-slate-600">{baht0(o.gross)}</div>
                  <div className="text-rose-600 font-semibold">
                    {baht0(o.r.tax_before_credit)}
                    <span className="text-slate-400 font-normal"> · {pct(o.eff)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Pager at="chart" />
        </div>

        {/* 10 อันดับภาษีสูงสุดจากทั้งหมด */}
        <h4 className="text-xs font-bold text-[#475569] mt-5 mb-2">
          1ข-2) 10 อันดับภาษีสูงสุดจากทั้งหมด {compare.filing.length} อาชีพ (คิดจากทุกหน้า)
        </h4>
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-[11px] tabular-nums min-w-[560px]">
            <thead>
              <tr className="text-slate-400 text-left border-b">
                <th className="py-2 pr-2 font-semibold">อันดับ · อาชีพ</th>
                <th className="py-2 pr-2 font-semibold text-right">รายได้/ปี</th>
                <th className="py-2 pr-2 font-semibold text-right">ภาษีที่ต้องชำระ</th>
                <th className="py-2 pr-2 font-semibold text-right">อัตราเฉลี่ย</th>
                <th className="py-2 font-semibold text-right">สัดส่วนของภาษีรวม</th>
              </tr>
            </thead>
            <tbody>
              {top10.map((o, i) => (
                <tr key={o.id} className="border-b border-dashed last:border-0">
                  <td className="py-2 pr-2 text-slate-700">
                    <span className="text-slate-400 mr-1">{i + 1}.</span>{o.job}
                    <span className="text-[10px] text-slate-400"> · {o.form}</span>
                  </td>
                  <td className="py-2 pr-2 text-right text-slate-600">{baht0(o.gross)}</td>
                  <td className="py-2 pr-2 text-right font-semibold text-rose-600">{baht0(o.r.tax_before_credit)}</td>
                  <td className="py-2 pr-2 text-right text-slate-500">{pct(o.eff)}</td>
                  <td className="py-2 text-right text-slate-500">
                    {compare.taxSum > 0 ? pct(o.r.tax_before_credit / compare.taxSum) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* รายได้เท่ากัน แต่ภาษีต่างกัน */}
        <h4 className="text-xs font-bold text-[#475569] mt-5 mb-2">
          1ค) รายได้เท่ากัน แต่ภาษีต่างกัน — เพราะประเภทเงินได้/ค่าใช้จ่ายเหมาไม่เหมือนกัน
          {compare.sameIncome.length > sameIncomeShown.length
            ? ` (แสดง 12 กลุ่มที่ต่างกันมากที่สุด จากทั้งหมด ${compare.sameIncome.length} กลุ่ม)`
            : ` (${compare.sameIncome.length} กลุ่ม)`}
        </h4>
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-[11px] tabular-nums min-w-[720px]">
            <thead>
              <tr className="text-slate-400 text-left border-b">
                <th className="py-2 pr-2 font-semibold text-right">รายได้เท่ากัน</th>
                <th className="py-2 pr-2 font-semibold">อาชีพ · ประเภทเงินได้ · ภาษี</th>
                <th className="py-2 pr-2 font-semibold text-right">ภาษีต่างกัน</th>
                <th className="py-2 font-semibold">เหตุผล</th>
              </tr>
            </thead>
            <tbody>
              {sameIncomeShown.map((g) => (
                <tr key={g.income} className="border-b border-dashed last:border-0 align-top">
                  <td className="py-2 pr-2 text-right text-slate-700 font-semibold">{baht0(g.income)}</td>
                  <td className="py-2 pr-2">
                    {g.rows.map((o) => (
                      <div key={o.id} className="flex flex-wrap items-baseline gap-1.5">
                        <span className="text-slate-700">{o.job}</span>
                        <span className="text-[10px] text-slate-400">{o.form}</span>
                        <span className={`font-semibold ${o === g.rows[0] ? 'text-rose-600' : 'text-emerald-700'}`}>
                          ภาษี {baht0(o.r.tax_before_credit)}
                        </span>
                        <span className="text-[10px] text-slate-400">(อัตรา {pct(o.eff)})</span>
                      </div>
                    ))}
                  </td>
                  <td className="py-2 pr-2 text-right">
                    <span className="font-semibold text-rose-600">{baht0(g.gap)}</span>
                    <span className="block text-[10px] text-slate-400">คิดเป็น {pct(g.rateGap)} ของรายได้</span>
                  </td>
                  <td className="py-2 text-slate-500 leading-4">
                    หักค่าใช้จ่ายเหมาต่างกัน ({g.rows.map((o) => `${o.form} ${baht0(o.r.expenses_total)}`).join(' · ')})
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 mt-3 leading-4">
          • รายได้เท่ากันไม่ได้แปลว่าภาษีเท่ากัน — ขึ้นกับ <b>ประเภทเงินได้ (40(1)–(8))</b> ที่ทำให้หักค่าใช้จ่ายเหมาได้ต่างกัน (40(1)/(2)/(3) 50% เพดาน 100,000 · 40(5)–(8) 30–60% ไม่มีเพดาน)
          จึงเป็นเหตุผลว่าทำไม “ขายของออนไลน์ 1.2 ล้าน” เสียภาษีน้อยกว่า “วิศวกรรับงานเอง 1.2 ล้าน” มาก<br/>
          • ในทางกลับกัน ธุรกิจที่หักเหมา 60% จะเสียเปรียบเมื่อมีค่าใช้จ่ายจริงสูงกว่า 60% → เลือก <b>หักตามจริง</b> ในโปรแกรมคำนวณด้านบนได้<br/>
          • อาชีพที่มีรายได้เท่ากันและภาษีเท่ากัน (เช่นพนักงานเงินเดือนด้วยกัน) จะไม่แสดงในตารางนี้
        </p>
      </div>

      {/* ── เปรียบเทียบประกันชีวิต ── */}
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-[#475569]">2) เปรียบเทียบการลดหย่อนด้วย “เบี้ยประกันชีวิต” ตามหลักกฎหมาย</h3>
          <span className="text-[11px] text-slate-400">ใบแนบ ข้อ 7.1–7.3</span>
        </div>

        {/* กติกากฎหมาย */}
        <div className="grid md:grid-cols-2 gap-3 mt-3">
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3">
            <div className="text-[11px] font-bold text-emerald-800 mb-1.5">เพดานที่กฎหมายให้ (ปีภาษี {DEFAULT_TAX_YEAR})</div>
            <ul className="text-[11px] text-slate-600 leading-5 space-y-1">
              <li><b>ข้อ 7.1 เบี้ยประกันชีวิต</b> — ตามที่จ่ายจริง แต่<b>ไม่เกิน {baht0(LIFE)} บาท</b> (ผู้เอาประกันต้องเป็นผู้มีเงินได้เอง)</li>
              <li><b>ข้อ 7.2 เบี้ยประกันสุขภาพ</b> — <b>ไม่เกิน {baht0(HEALTH)} บาท</b> และเมื่อรวมกับข้อ 7.1 แล้ว<b>ต้องไม่เกิน {baht0(COMBINED)} บาท</b></li>
              <li><b>ข้อ 7.3 เบี้ยประกันชีวิตแบบบำนาญ</b> — ร้อยละ 15 ของเงินได้ แต่<b>ไม่เกิน {baht0(PENSION)} บาท</b> และนับรวมในวงเงินกลุ่มเกษียณ 500,000 บาท</li>
              <li><b>คู่สมรสที่ไม่มีเงินได้</b> — เบี้ยประกันชีวิตของคู่สมรส หักได้ไม่เกิน 10,000 บาท</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-3">
            <div className="text-[11px] font-bold text-amber-800 mb-1.5">เงื่อนไขที่ต้องครบจึงจะใช้สิทธิได้</div>
            <ul className="text-[11px] text-slate-600 leading-5 space-y-1">
              <li>กรมธรรม์ประกันชีวิตต้องมี<b>กำหนดเวลาคุ้มครองตั้งแต่ 10 ปีขึ้นไป</b> (แบบบำนาญ: จ่ายเบี้ยต่อเนื่อง ≥ 10 ปี และรับบำนาญตั้งแต่อายุ 55–85 ปี)</li>
              <li>ต้องจ่ายเบี้ยให้<b>บริษัทประกันชีวิต/วินาศภัยที่ประกอบกิจการในราชอาณาจักร</b> และมีหลักฐานจากผู้รับประกันภัย</li>
              <li>ใช้สิทธิซ้ำไม่ได้ — เบี้ยที่จ่ายเพื่อผู้อื่น (เช่น บุตร) ไม่นับเป็นของตนเอง (ยกเว้นกรณีคู่สมรสที่ไม่มีเงินได้ 10,000 บาท)</li>
              <li>ประหยัดภาษีจริง = เบี้ย × <b>อัตราภาษีขั้นสูงสุดของผู้จ่าย</b> — ถ้าอยู่ฐาน {baht0(TAX_BRACKETS[0][0])} แรกยกเว้นภาษี ประกันไม่ช่วยประหยัด (ดูตาราง 2ก.)</li>
            </ul>
          </div>
        </div>

        {/* ตาราง 2ก. */}
        <h4 className="text-xs font-bold text-[#475569] mt-5 mb-2">2ก. ประหยัดภาษีได้เท่าไร — ตามระดับเงินได้ (เบี้ยประกันชีวิต {baht0(LIFE)} เต็มเพดาน)</h4>
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-[11px] tabular-nums min-w-[700px]">
            <thead>
              <tr className="text-slate-400 text-left border-b">
                <th className="py-2 pr-2 font-semibold text-right">เงินได้/ปี (40(1))</th>
                <th className="py-2 pr-2 font-semibold text-right">ภาษีก่อนใช้สิทธิ</th>
                <th className="py-2 pr-2 font-semibold text-right">ลดหย่อนประกันที่ได้จริง</th>
                <th className="py-2 pr-2 font-semibold text-right">ภาษีหลังใช้สิทธิ</th>
                <th className="py-2 pr-2 font-semibold text-right">ประหยัดภาษี</th>
                <th className="py-2 font-semibold text-right">คิดเป็น % ของเบี้ย</th>
              </tr>
            </thead>
            <tbody>
              {tableA.map((x) => (
                <tr key={x.income} className="border-b border-dashed last:border-0">
                  <td className="py-2 pr-2 text-right text-slate-700">{baht0(x.income)}</td>
                  <td className="py-2 pr-2 text-right">{baht0(x.noIns.tax_before_credit)}</td>
                  <td className="py-2 pr-2 text-right text-emerald-700">
                    {baht0(Math.min(LIFE, LIM.life_insurance))}
                    <span className="block text-[10px] text-slate-400">ขั้นภาษี {Math.round(x.marginal * 100)}%</span>
                  </td>
                  <td className="py-2 pr-2 text-right">{baht0(x.withIns.tax_before_credit)}</td>
                  <td className="py-2 pr-2 text-right font-semibold text-emerald-700">{baht0(x.saved)}</td>
                  <td className="py-2 text-right text-slate-500">{x.income > 0 ? pct(x.savedPer100) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 mt-2 leading-4">
          ⚠️ เงินได้ 300,000 บาท: เงินได้สุทธิหลังหักค่าใช้จ่ายและลดหย่อนพื้นฐานยังไม่ถึงเกณฑ์เสียภาษี → <b>ไม่มีภาษีให้ประหยัดเลย</b>
          (การซื้อประกันเพื่อลดภาษีจะคุ้มเมื่ออยู่ในฐานภาษี 10% ขึ้นไป)
        </p>

        {/* ตาราง 2ข. */}
        <h4 className="text-xs font-bold text-[#475569] mt-5 mb-2">2ข. จ่ายเบี้ยเกินเพดาน = ใช้สิทธิไม่ได้เพิ่ม (เงินได้ 1,000,000 บาท)</h4>
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-[11px] tabular-nums min-w-[700px]">
            <thead>
              <tr className="text-slate-400 text-left border-b">
                <th className="py-2 pr-2 font-semibold text-right">เบี้ยที่จ่ายจริง</th>
                <th className="py-2 pr-2 font-semibold text-right">ลดหย่อนได้จริง (ข้อ 7.1)</th>
                <th className="py-2 pr-2 font-semibold text-right">ใช้สิทธิไม่ได้</th>
                <th className="py-2 pr-2 font-semibold text-right">ภาษีต้องชำระ</th>
                <th className="py-2 pr-2 font-semibold text-right">ประหยัดภาษี</th>
                <th className="py-2 font-semibold text-right">ผลตอบแทนภาษีต่อเบี้ย</th>
              </tr>
            </thead>
            <tbody>
              {tableB.map((x) => (
                <tr key={x.premium} className="border-b border-dashed last:border-0">
                  <td className="py-2 pr-2 text-right text-slate-700">{baht0(x.premium)}</td>
                  <td className="py-2 pr-2 text-right text-emerald-700">{baht0(x.used)}</td>
                  <td className={`py-2 pr-2 text-right ${x.wasted > 0 ? 'text-rose-600 font-semibold' : 'text-slate-300'}`}>
                    {x.wasted > 0 ? baht0(x.wasted) : '—'}
                  </td>
                  <td className="py-2 pr-2 text-right">{baht0(x.r.tax_before_credit)}</td>
                  <td className="py-2 pr-2 text-right font-semibold text-emerald-700">{baht0(x.saved)}</td>
                  <td className="py-2 text-right text-slate-500">{x.premium > 0 ? pct(x.effective) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[11px] text-slate-400 mt-2 leading-4">
          จ่าย 200,000 บาท ใช้สิทธิได้แค่ {baht0(LIM.life_insurance)} บาท — ส่วนเกินไม่ได้ลดหย่อน และ<b>ไม่ได้คืนภาษีเพิ่ม</b>
          (ถ้าต้องการลดหย่อนมากกว่านี้ ต้องใช้เครื่องมือเกษียณ เช่น ข้อ 7.3 บำนาญ · ข้อ 10 RMF · ข้อ 23 SSF ซึ่งมีเพดานของตัวเอง)
        </p>

        {/* ตาราง 2ค. */}
        <h4 className="text-xs font-bold text-[#475569] mt-5 mb-2">2ค. ประกันชีวิต + ประกันสุขภาพ: รวมกันไม่เกิน {baht0(COMBINED)} บาท (เงินได้ 1,000,000 บาท)</h4>
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-[11px] tabular-nums min-w-[760px]">
            <thead>
              <tr className="text-slate-400 text-left border-b">
                <th className="py-2 pr-2 font-semibold">กรณี</th>
                <th className="py-2 pr-2 font-semibold text-right">เบี้ยที่จ่ายรวม</th>
                <th className="py-2 pr-2 font-semibold text-right">ลดหย่อนที่ใช้ได้ (7.1+7.2+7.3)</th>
                <th className="py-2 pr-2 font-semibold text-right">ภาษีต้องชำระ</th>
                <th className="py-2 pr-2 font-semibold text-right">ประหยัดภาษี</th>
              </tr>
            </thead>
            <tbody>
              {tableC.map((x) => (
                <tr key={x.label} className="border-b border-dashed last:border-0 align-top">
                  <td className="py-2 pr-2">
                    <div className="font-semibold text-slate-700">{x.label}</div>
                    <div className="text-[10px] text-slate-400 leading-3 mt-0.5">{x.note}</div>
                  </td>
                  <td className="py-2 pr-2 text-right">{baht0(x.paidPremium)}</td>
                  <td className="py-2 pr-2 text-right text-emerald-700 font-semibold">{baht0(x.used)}</td>
                  <td className="py-2 pr-2 text-right">{baht0(x.r.tax_before_credit)}</td>
                  <td className="py-2 pr-2 text-right text-emerald-700">{baht0(x.saved)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2 leading-4">
          <b>จุดที่คนมักเข้าใจผิด:</b> คิดว่าซื้อประกันชีวิต 100,000 + ประกันสุขภาพ 25,000 = ลดหย่อนได้ 125,000 —
          ตามประกาศอธิบดีกรมสรรพากรเกี่ยวกับภาษีเงินได้ (ฉบับที่ 301) ระบุว่าเมื่อรวมเบี้ยประกันชีวิต (ข้อ 7.1) กับเบี้ยประกันสุขภาพ (ข้อ 7.2) แล้ว
          <b> ต้องไม่เกิน {baht0(COMBINED)} บาท</b> → จ่าย 125,000 แต่ใช้สิทธิได้ {baht0(COMBINED)} (ส่วนเกิน 25,000 ไม่ได้ใช้)
          และตามคำชี้แจงการกรอก ภ.ง.ด.90 ข้อ 7.6 กรณีมีเบี้ยประกันชีวิตแบบบำนาญ ให้ใช้สิทธิ 7.1 ให้เต็ม {baht0(LIFE)} บาทก่อน แล้วส่วนที่เหลือจึงกรอกเป็นแบบบำนาญ (ข้อ 7.3)
        </div>
      </div>

      <div className="card p-4 text-[11px] text-slate-400 leading-5">
        <div className="font-bold text-slate-500 mb-1">แหล่งอ้างอิงของเกณฑ์ทั้งหมดในหน้านี้</div>
        • ใบแนบแสดงรายละเอียดรายการลดหย่อนและยกเว้น (ข้อ 7. เบี้ยประกันชีวิต / 7.1–7.3) — ดาวน์โหลดได้ที่{' '}
        <a className="underline decoration-slate-300 hover:text-sky-700" href="https://www.rd.go.th/67335.html" target="_blank" rel="noreferrer">rd.go.th</a><br/>
        • คำชี้แจงการกรอกแบบ ภ.ง.ด.90 ปีภาษี {DEFAULT_TAX_YEAR} — ข้อ 7.6 การใช้สิทธิเบี้ยประกันชีวิตแบบบำนาญ · ข้อ 7.7 หลักฐานจากผู้รับประกันภัย<br/>
        • อัตราภาษีขั้นบันได 8 ขั้น (สูงสุด {pct(maxBand)}) ตามมาตรา 48(1) แห่งประมวลรัษฎากร — ดูตารางฐานภาษีด้านบน<br/>
        • ค่าใช้จ่ายเหมาแยกประเภทเงินได้ มาตรา 42 ทวิ–46 และมาตรา 8 ทวิ ·{' '}
        <a className="underline decoration-slate-300 hover:text-sky-700" href="https://www.rd.go.th/67335.html" target="_blank" rel="noreferrer">ไฟล์ราชการทั้งหมดที่ rd.go.th</a><br/>
        ตัวเลขทั้งหมดเป็น<b>การประมาณการเพื่อวางแผนภาษี</b> · กรณีมีสิทธิพิเศษเฉพาะราย โทร. 1161 (สรรพากร)
      </div>
    </div>
  );
}
