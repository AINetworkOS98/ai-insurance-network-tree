'use client';
/**
 * ThaiTaxCalculator.tsx (v2) — คำนวณภาษีเงินได้บุคคลธรรมดา ตามแบบ ภ.ง.ด.90 ของกรมสรรพากร
 * ใช้เอนจินเดียวกับโปรแกรม Python: python/thai_tax_calculator.py (v2.0.0)
 * กรอกเงินได้ได้หลายแหล่ง (หลายนายจ้าง/หลายทรัพย์สิน) พร้อมภาษีหัก ณ ที่จ่ายรายแหล่ง
 * แล้วเดินตามลำดับข้อ 1 → ข้อ 14 ของแบบจริง
 */
import { useMemo, useState } from 'react';
import {
  computePit, computeExpenses, buildItems, EXPENSE_RULES, VARIANT_RATES, itemRateLabel,
  LIM, DEFAULT_TAX_YEAR, TAX_CALC_VERSION, PIT_SOURCES,
  type PitPerson, type PitIncomeItem, type IncomeKey,
} from '@/lib/tax/thaiPit';

type Num = number | undefined;

const baht = (v: number) => Number(v || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const baht0 = (v: number) => Number(v || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 });

function Money({ label, value, onChange, hint, max, placeholder = '0' }: {
  label: string; value: Num; onChange: (v: number) => void; hint?: string; max?: number; placeholder?: string;
}) {
  const over = typeof value === 'number' && typeof max === 'number' && value > max;
  return (
    <label className="block">
      <div className="text-xs font-medium text-slate-600 mb-1 leading-4">{label}</div>
      <input
        type="text" inputMode="numeric" placeholder={placeholder}
        value={typeof value === 'number' && value !== 0 ? value.toLocaleString('en-US') : ''}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.]/g, '');
          onChange(raw === '' ? 0 : Math.max(0, Number(raw) || 0));
        }}
        className={`w-full border rounded-xl px-3 py-2 text-sm tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-sky-200 ${over ? 'border-amber-300 bg-amber-50' : 'border-gray-200'}`}
      />
      {hint && <div className="text-[11px] text-slate-400 mt-1 leading-4">{hint}</div>}
      {over && <div className="text-[11px] text-amber-600 mt-0.5">เกินเพดาน {baht0(max as number)} — ระบบใช้เพดานให้อัตโนมัติ</div>}
    </label>
  );
}

function Count({ label, value, onChange, hint }: { label: string; value: Num; onChange: (v: number) => void; hint?: string }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-slate-600 mb-1 leading-4">{label}</div>
      <input
        type="number" min={0} step={1} value={typeof value === 'number' && value !== 0 ? value : ''}
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-sky-200"
      />
      {hint && <div className="text-[11px] text-slate-400 mt-1 leading-4">{hint}</div>}
    </label>
  );
}

function Check({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  return (
    <label className="flex gap-2 items-start p-3 rounded-xl border border-gray-200 bg-white cursor-pointer hover:bg-sky-50/40">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span>
        <span className="text-xs font-medium text-slate-700 leading-4 block">{label}</span>
        {hint && <span className="text-[11px] text-slate-400 leading-4 block">{hint}</span>}
      </span>
    </label>
  );
}

function Section({ title, badge, note, children, cols = 3 }: {
  title: string; badge?: string; note?: string; children: React.ReactNode; cols?: 2 | 3;
}) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-[#475569]">{title}</h3>
        {badge && <span className="text-[10px] px-2 py-0.5 rounded-full border border-sky-100 bg-sky-50 text-sky-700 font-semibold">{badge}</span>}
      </div>
      {note && <p className="text-[11px] text-slate-400 mt-1 mb-2 leading-4">{note}</p>}
      <div className={`grid sm:grid-cols-2 ${cols === 3 ? 'xl:grid-cols-3' : ''} gap-3 mt-3`}>{children}</div>
    </section>
  );
}

function Details({ title, badge, children }: { title: string; badge?: string; children: React.ReactNode }) {
  return (
    <details className="card p-4 sm:p-5 group">
      <summary className="cursor-pointer text-sm font-bold text-[#475569] flex items-center justify-between list-none">
        <span><span className="inline-block transition-transform group-open:rotate-90 mr-1 text-slate-400">▸</span>{title}</span>
        {badge && <span className="text-[11px] text-slate-400 font-normal">{badge}</span>}
      </summary>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-3">{children}</div>
    </details>
  );
}

const CATS: IncomeKey[] = ['salary', 'service', 'royalty', 'interest', 'rent', 'professional', 'contractor', 'business'];

/** แถวเงินได้ 1 แหล่ง = 1 บรรทัดในแบบ ภ.ง.ด.90 */
type Row = {
  id: string;
  category: IncomeKey;
  description: string;
  amount: number;
  mode: 'standard' | 'actual';
  actual: number;
  variant: string;
  withholding: number;
};

const newRow = (category: IncomeKey = 'salary'): Row => ({
  id: Math.random().toString(36).slice(2, 9),
  category, description: '', amount: 0, mode: 'standard', actual: 0,
  variant: VARIANT_RATES[category] ? Object.keys(VARIANT_RATES[category] as object)[0] : '',
  withholding: 0,
});

const toItem = (r: Row): PitIncomeItem => ({
  category: r.category,
  amount: r.amount,
  description: r.description,
  expense_mode: r.mode,
  actual_expense: r.actual,
  variant: r.variant,
  withholding: r.withholding,
});

/** ค่าใช้จ่ายที่หักได้จริงของแถวนี้ (คิดตามเพดานของประเภทนั้น) */
function rowExpense(r: Row): number {
  const { total } = computeExpenses(buildItems({ income_items: [toItem(r)] }));
  return total;
}

const EMPTY: PitPerson = { personal: true };

export default function ThaiTaxCalculator() {
  const [rows, setRows] = useState<Row[]>([newRow('salary')]);
  const [spouseRows, setSpouseRows] = useState<Row[]>([]);
  const [main, setMain] = useState<PitPerson>({ ...EMPTY });
  const [spouse, setSpouse] = useState<PitPerson>({ personal: true });
  const [married, setMarried] = useState(false);
  const [busyTest, setBusyTest] = useState(false);
  const [testMsg, setTestMsg] = useState('');

  const set = (patch: Partial<PitPerson>) => setMain((p) => ({ ...p, ...patch }));
  const setS = (patch: Partial<PitPerson>) => setSpouse((p) => ({ ...p, ...patch }));

  const updateRow = (id: string, patch: Partial<Row>, target: 'main' | 'spouse' = 'main') => {
    const fn = (list: Row[]) => list.map((r) => (r.id === id ? { ...r, ...patch } : r));
    target === 'main' ? setRows(fn) : setSpouseRows(fn);
  };

  const result = useMemo(() => {
    const person: PitPerson = { ...main, income_items: rows.map(toItem) };
    if (!married) return computePit([person], DEFAULT_TAX_YEAR);
    const sp: PitPerson = { ...spouse, income_items: spouseRows.map(toItem) };
    return computePit([person, sp], DEFAULT_TAX_YEAR);
  }, [main, rows, spouse, spouseRows, married]);

  async function runSelftest() {
    setBusyTest(true); setTestMsg('');
    try {
      const r = await fetch('/api/tax/thai-pit?selftest=1', { cache: 'no-store' });
      const j = await r.json();
      if (j?.ok) setTestMsg(`✓ ตรวจแล้วผ่านทั้ง ${j.passed}/${j.total} กรณี — เว็บให้ผลตรงกับชุดทดสอบมาตรฐาน (ชุดเดียวกับโปรแกรม Python)`);
      else {
        const bad = (j?.cases || []).filter((c: { passed: boolean }) => !c.passed).map((c: { name: string }) => c.name);
        setTestMsg(`✗ ผ่าน ${j?.passed}/${j?.total} กรณี — ต้องตรวจ: ${bad.join(' · ')}`);
      }
    } catch (e) {
      setTestMsg(`ตรวจไม่สำเร็จ: ${e instanceof Error ? e.message : 'เชื่อมต่อไม่ได้'}`);
    } finally {
      setBusyTest(false);
    }
  }

  function downloadJson() {
    const person = { ...main, income_items: rows.map(toItem) };
    const payload = { persons: married ? [person, { ...spouse, income_items: spouseRows.map(toItem) }] : [person], result };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `thai-tax-pnd90-${DEFAULT_TAX_YEAR}-${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(url);
  }

  const presets: Array<{ label: string; run: () => void }> = [
    {
      label: 'พนักงาน 2 นายจ้าง 600,000',
      run: () => {
        setMarried(false);
        setRows([
          { ...newRow('salary'), description: 'บริษัท ก', amount: 400000, withholding: 12000 },
          { ...newRow('salary'), description: 'บริษัท ข', amount: 200000, withholding: 6000 },
        ]);
        setMain({ ...EMPTY, social_security: 9000 });
        setSpouseRows([]);
      },
    },
    {
      label: 'ค่าเช่าหลายทรัพย์',
      run: () => {
        setMarried(false);
        setRows([
          { ...newRow('rent'), description: 'อาคารพาณิชย์', amount: 1000000, variant: 'building' },
          { ...newRow('rent'), description: 'ที่ดินเกษตร', amount: 200000, variant: 'agri_land' },
        ]);
        setMain({ ...EMPTY });
        setSpouseRows([]);
      },
    },
    {
      label: 'ฟรีแลนซ์ + หักตามจริง',
      run: () => {
        setMarried(false);
        setRows([{ ...newRow('business'), description: 'ขายออนไลน์', amount: 1200000, mode: 'actual', actual: 700000, variant: 'general' }]);
        setMain({ ...EMPTY, social_security: 9000, life_insurance: 60000 });
        setSpouseRows([]);
      },
    },
    {
      label: 'คู่สมรสยื่นรวม',
      run: () => {
        setMarried(true);
        setRows([{ ...newRow('salary'), amount: 900000, withholding: 60000 }]);
        setMain({ ...EMPTY, social_security: 9000, home_loan_interest: 100000 });
        setSpouseRows([{ ...newRow('salary'), amount: 600000, withholding: 30000 }]);
        setSpouse({ personal: true, social_security: 9000, provident_fund: 90000 });
      },
    },
  ];

  const surplus = result.net_payable;
  const summaryColor = surplus > 0 ? 'text-rose-600' : surplus < 0 ? 'text-emerald-600' : 'text-slate-600';

  const renderRows = (target: 'main' | 'spouse') => {
    const list = target === 'main' ? rows : spouseRows;
    const setList = target === 'main' ? setRows : setSpouseRows;
    return (
      <div className="space-y-3">
        {list.length === 0 && <div className="text-xs text-slate-400 border border-dashed rounded-xl p-3">ยังไม่มีรายการเงินได้ของคู่สมรส — กด “+ เพิ่มแหล่งเงินได้”</div>}
        {list.map((r, i) => {
          const variants = VARIANT_RATES[r.category];
          const ded = rowExpense(r);
          return (
            <div key={r.id} className="rounded-2xl border border-gray-100 bg-slate-50/40 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-500">แหล่งเงินได้ที่ {i + 1}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-emerald-700 tabular-nums">หักค่าใช้จ่ายได้ {baht0(ded)}</span>
                  <button onClick={() => setList((l) => l.filter((x) => x.id !== r.id))}
                    className="text-[11px] px-2 py-0.5 rounded-full border border-rose-200 bg-rose-50 text-rose-600">ลบ</button>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                <label className="block sm:col-span-2 xl:col-span-1">
                  <div className="text-xs font-medium text-slate-600 mb-1">ประเภทเงินได้ (มาตรา 40)</div>
                  <select
                    value={r.category}
                    onChange={(e) => {
                      const cat = e.target.value as IncomeKey;
                      updateRow(r.id, { category: cat, variant: VARIANT_RATES[cat] ? Object.keys(VARIANT_RATES[cat] as object)[0] : '' }, target);
                    }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"
                  >
                    {CATS.map((c) => <option key={c} value={c}>{EXPENSE_RULES[c].short}</option>)}
                  </select>
                </label>
                <Money label="จำนวนเงินทั้งปี (ก่อนหักภาษี)" value={r.amount} onChange={(v) => updateRow(r.id, { amount: v }, target)} />
                <Money label="ภาษีหัก ณ ที่จ่ายของแหล่งนี้" value={r.withholding} onChange={(v) => updateRow(r.id, { withholding: v }, target)} hint="ตามหนังสือรับรองการหักภาษี 50 ทวิ" />
                {variants && (
                  <label className="block sm:col-span-2">
                    <div className="text-xs font-medium text-slate-600 mb-1">ประเภทย่อย (กำหนดอัตราหักค่าใช้จ่าย — ตามตารางกรมสรรพากร)</div>
                    <select value={r.variant} onChange={(e) => updateRow(r.id, { variant: e.target.value }, target)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
                      {Object.entries(variants).map(([k, v]) => (
                        <option key={k} value={k}>{v.label} — เหมา {Math.round(v.rate * 100)}%</option>
                      ))}
                    </select>
                  </label>
                )}
                <label className="block">
                  <div className="text-xs font-medium text-slate-600 mb-1">วิธีหักค่าใช้จ่าย</div>
                  <select value={r.mode} onChange={(e) => updateRow(r.id, { mode: e.target.value as 'standard' | 'actual' }, target)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
                    <option value="standard">หักเหมาตามประเภทเงินได้</option>
                    <option value="actual">หักตามจริง (มีหลักฐาน)</option>
                  </select>
                </label>
                {r.mode === 'actual' && (
                  <Money label="ค่าใช้จ่ายตามจริง" value={r.actual} onChange={(v) => updateRow(r.id, { actual: v }, target)} hint="ต้องมีหลักฐานครบ" />
                )}
                <label className="block">
                  <div className="text-xs font-medium text-slate-600 mb-1">รายละเอียด/ชื่อผู้จ่าย (ไม่บังคับ)</div>
                  <input value={r.description} onChange={(e) => updateRow(r.id, { description: e.target.value }, target)}
                    placeholder="เช่น บริษัท…, อาคาร…, ลูกค้า…"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" />
                </label>
              </div>
            </div>
          );
        })}
        <button
          onClick={() => setList((l) => [...l, newRow(VARIANT_RATES.rent ? 'rent' : 'salary')])}
          className="px-3 py-2 rounded-full border border-sky-200 bg-sky-50 text-xs font-semibold text-sky-700"
        >+ เพิ่มแหล่งเงินได้</button>
      </div>
    );
  };

  return (
    <div className="space-y-4" id="thai-tax-calculator">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold text-[#475569]">คำนวณภาษีเงินได้บุคคลธรรมดา (ตามแบบ ภ.ง.ด.90)</h2>
          <span className="text-xs px-2 py-1 rounded-full border bg-white text-slate-500">ปีภาษี {DEFAULT_TAX_YEAR} · ยื่นแบบปี {DEFAULT_TAX_YEAR + 1}</span>
          <span className="text-xs px-2 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">โครงสร้างตรงแบบกรมสรรพากร ข้อ 1–14</span>
          <span className="ml-auto flex flex-wrap gap-2">
            <button onClick={runSelftest} disabled={busyTest}
              className="px-3 py-2 rounded-full border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700 disabled:opacity-50">
              {busyTest ? 'กำลังตรวจ…' : '✓ ตรวจความถูกต้อง'}
            </button>
            <button onClick={downloadJson} className="px-3 py-2 rounded-full border bg-white text-xs font-semibold text-slate-600">⤓ ดาวน์โหลดผล (JSON)</button>
            <button onClick={() => window.print()} className="px-3 py-2 rounded-full border bg-white text-xs font-semibold text-slate-600">🖨 พิมพ์ / บันทึก PDF</button>
            <button onClick={() => { setRows([newRow('salary')]); setMain({ ...EMPTY }); setSpouse({ personal: true }); setSpouseRows([]); setMarried(false); setTestMsg(''); }}
              className="px-3 py-2 rounded-full border bg-white text-xs font-semibold text-slate-600">↺ ล้างข้อมูล</button>
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-2 leading-5">
          กรอกเงินได้ได้หลายแหล่ง (หลายนายจ้าง/หลายทรัพย์สิน) พร้อมภาษีหัก ณ ที่จ่ายรายแหล่ง —
          ระบบหักค่าใช้จ่ายให้ตามประเภทเงินได้ ตรวจเพดานค่าลดหย่อนทุกตัว และคิดภาษีทั้ง <b>วิธีที่ 1 (ขั้นบันได)</b> และ <b>วิธีที่ 2 (0.5%)</b>
          ตามแบบข้อ 8–10 ให้อัตโนมัติ
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <span className="text-[11px] text-slate-400 self-center">ตัวอย่างเริ่มต้น:</span>
          {presets.map((p) => (
            <button key={p.label} onClick={p.run}
              className="px-3 py-1.5 rounded-full border border-gray-200 bg-white text-[11px] text-slate-600 hover:bg-sky-50">{p.label}</button>
          ))}
        </div>
        {testMsg && (
          <div className={`mt-3 p-3 rounded-xl text-xs border ${testMsg.startsWith('✓') ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>
            {testMsg}
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-4 flex flex-wrap gap-2 items-center">
            <span className="text-xs font-semibold text-slate-600 mr-1">รูปแบบการยื่นแบบ:</span>
            <button onClick={() => setMarried(false)}
              className={`px-4 py-2 rounded-full text-xs font-semibold border ${!married ? 'bg-[#475569] text-white border-[#475569]' : 'bg-white text-slate-600'}`}>
              ยื่นคนเดียว (ภ.ง.ด.90/91)
            </button>
            <button onClick={() => { setMarried(true); if (spouseRows.length === 0) setSpouseRows([newRow('salary')]); }}
              className={`px-4 py-2 rounded-full text-xs font-semibold border ${married ? 'bg-[#475569] text-white border-[#475569]' : 'bg-white text-slate-600'}`}>
              ยื่นรวมกับคู่สมรส (ภ.ง.ด.90)
            </button>
          </div>

          <Section title="ข้อ 1–7) เงินได้พึงประเมิน แยกรายแหล่ง" badge="1 แหล่ง = 1 บรรทัดในแบบ"
            note="ค่าเช่าแยกประเภทย่อยตามตารางกรมสรรพากร: อาคาร/แพ/ยานพาหนะ 30% · ที่ดินเกษตร 20% · ที่ดินอื่น 15% · ทรัพย์สินอื่น 10%">
            <div className="sm:col-span-2 xl:col-span-3">{renderRows('main')}</div>
          </Section>

          {married && (
            <Section title="ข้อ 1–7) เงินได้ของคู่สมรส" badge="ยื่นรวมกัน">
              <div className="sm:col-span-2 xl:col-span-3">{renderRows('spouse')}</div>
            </Section>
          )}

          <Section title="ข้อ 5) ค่าใช้จ่าย — สรุปที่ระบบหักให้" note="หักเหมาอัตโนมัติตามประเภทเงินได้ (40(1)+(2) รวมกันไม่เกิน 100,000 · 40(3) ไม่เกิน 100,000) หรือหักตามจริงถ้าเลือกไว้"
            cols={2}>
            <div className="sm:col-span-2">
              <table className="w-full text-xs">
                <tbody className="[&_td]:py-1">
                  {result.expense_lines.map((l) => (
                    <tr key={l.label} className="border-b border-dashed last:border-0">
                      <td className="text-slate-500">{l.label}</td>
                      <td className="text-right tabular-nums text-rose-600">−{baht(l.deductible)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="text-slate-700">รวมค่าใช้จ่าย (แบบข้อ 5)</td>
                    <td className="text-right tabular-nums">−{baht(result.expenses_total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="ข้อ 2) ค่าลดหย่อน — ครอบครัว" note="บุตร/บิดามารดา/ผู้พิการ/ค่าคลอดบุตร (ต้องมีหลักฐาน เช่น ล.ย.01/ล.ย.03)">
            <Count label="บุตรชอบด้วยกฎหมาย (คน)" value={main.children} onChange={(v) => set({ children: v })} hint="คนละ 30,000" />
            <Count label="บุตรคนที่ 2+ เกิดตั้งแต่ปี 2561 (คน)" value={main.children_born_2561_plus} onChange={(v) => set({ children_born_2561_plus: v })} hint="ได้เพิ่มอีกคนละ 30,000" />
            <Count label="บุตรบุญธรรม (คน, ไม่เกิน 3)" value={main.adopted_children} onChange={(v) => set({ adopted_children: v })} hint="คนละ 60,000" />
            <Count label="จำนวนครั้งตั้งครรภ์/คลอดบุตร" value={main.pregnancies} onChange={(v) => set({ pregnancies: v })} hint="ไม่เกิน 60,000 ต่อครั้ง" />
            {Number(main.pregnancies) > 0 && <Money label="ค่าฝากครรภ์ + ค่าคลอดบุตร (รวม)" value={main.prenatal_expense} onChange={(v) => set({ prenatal_expense: v })} max={60000} />}
            <Count label="บิดามารดาที่อุปการะ (คน)" value={main.parents} onChange={(v) => set({ parents: v })} hint="คนละ 30,000 · อายุ 60+ และเงินได้ไม่เกิน 30,000/ปี" />
            <Count label="ผู้พิการ/ทุพพลภาพที่อุปการะ (คน)" value={main.disabled_dependents} onChange={(v) => set({ disabled_dependents: v })} hint="คนละ 60,000" />
            {!married && <Check label="คู่สมรสไม่มีเงินได้" checked={!!main.spouse_no_income} onChange={(v) => set({ spouse_no_income: v })} hint="ลดหย่อน 60,000 (คู่สมรสมีเงินได้ไม่เกิน 60,000/ปี)" />}
          </Section>

          <Section title="ข้อ 2) ค่าลดหย่อน — ประกันและประกันสังคม" note="กรมธรรม์ของบริษัทประกันชีวิตในไทย อายุความคุ้มครอง 10 ปีขึ้นไป">
            <Money label="เงินสมทบประกันสังคม (มาตรา 33)" value={main.social_security} onChange={(v) => set({ social_security: v })} max={LIM.social_security} hint="ตามจริง ไม่เกิน 9,000/ปี" />
            <Money label="เบี้ยประกันชีวิต + สะสมทรัพย์" value={main.life_insurance} onChange={(v) => set({ life_insurance: v })} max={LIM.life_insurance} hint="ไม่เกิน 100,000/ปี" />
            <Money label="เบี้ยประกันสุขภาพ (ตนเอง)" value={main.health_insurance} onChange={(v) => set({ health_insurance: v })} max={LIM.health_insurance} hint="ไม่เกิน 25,000 และรวมกับประกันชีวิตไม่เกิน 100,000" />
            <Money label="เบี้ยประกันสุขภาพบิดามารดา" value={main.parent_health_insurance} onChange={(v) => set({ parent_health_insurance: v })} max={LIM.parent_health} hint="ไม่เกิน 15,000/ปี" />
            {!married && <Money label="เบี้ยประกันชีวิตคู่สมรส (ไม่มีเงินได้)" value={main.spouse_life_insurance} onChange={(v) => set({ spouse_life_insurance: v })} max={LIM.spouse_life} hint="ไม่เกิน 10,000/ปี" />}
            <Money label="เบี้ยประกันชีวิตแบบบำนาญ" value={main.pension_life_insurance} onChange={(v) => set({ pension_life_insurance: v })} max={LIM.pension_life} hint="15% ของเงินได้ ไม่เกิน 200,000" />
          </Section>

          <Details title="ข้อ 2) ค่าลดหย่อน — กองทุน/การลงทุน" badge="วงเงินเกษียณรวม 500,000">
            <Money label="กองทุนสำรองเลี้ยงชีพ" value={main.provident_fund} onChange={(v) => set({ provident_fund: v })} hint="15% ของเงินได้ ไม่เกิน 500,000" />
            <Money label="กบข." value={main.gpf} onChange={(v) => set({ gpf: v })} hint="30% ของเงินได้ ไม่เกิน 500,000" />
            <Money label="กองทุนสงเคราะห์ครูโรงเรียนเอกชน" value={main.teacher_fund} onChange={(v) => set({ teacher_fund: v })} hint="15% ของเงินได้ ไม่เกิน 500,000" />
            <Money label="RMF" value={main.rmf} onChange={(v) => set({ rmf: v })} hint="30% ของเงินได้ ไม่เกิน 500,000" />
            <Money label="SSF" value={main.ssf} onChange={(v) => set({ ssf: v })} hint="30% ของเงินได้ ไม่เกิน 200,000" />
            <Money label="กอช." value={main.nsf} onChange={(v) => set({ nsf: v })} max={LIM.nsf} hint="ตามจริง ไม่เกิน 30,000" />
            <Money label="Thai ESG" value={main.thai_esg} onChange={(v) => set({ thai_esg: v })} max={LIM.thai_esg} hint="30% ของเงินได้ ไม่เกิน 300,000" />
            <Money label="Thai ESGX (1 พ.ค.–30 มิ.ย. 2568)" value={main.thai_esgx} onChange={(v) => set({ thai_esgx: v })} max={300000} hint="30% ของเงินได้ ไม่เกิน 300,000" />
            <Money label="วิสาหกิจเพื่อสังคม (SE)" value={main.social_enterprise} onChange={(v) => set({ social_enterprise: v })} max={LIM.social_enterprise} hint="ไม่เกิน 100,000" />
          </Details>

          <Details title="ข้อ 2) บ้าน + มาตรการรัฐของปีภาษี" badge="ดอกเบี้ยบ้าน · Easy E-Receipt · เที่ยวดีมีคืน">
            <Money label="ดอกเบี้ยเงินกู้เพื่อที่อยู่อาศัย" value={main.home_loan_interest} onChange={(v) => set({ home_loan_interest: v })} max={LIM.home_loan_interest} hint="ตามจริง ไม่เกิน 100,000" />
            <Money label="ค่าจ้างก่อสร้างบ้านใหม่ (มูลค่าก่อสร้าง)" value={main.home_construction_cost} onChange={(v) => set({ home_construction_cost: v })} hint="ยกเว้นเงินได้ ล้านละ 10,000 (ไม่เกิน 100,000) สัญญา 9 เม.ย. 2567–31 ธ.ค. 2568" />
            <Money label="Easy E-Receipt 2.0 (16 ม.ค.–28 ก.พ. 2568)" value={main.easy_e_receipt} onChange={(v) => set({ easy_e_receipt: v })} max={LIM.easy_e_receipt} hint="ไม่เกิน 50,000 ต้องมี e-Tax Invoice" />
            <Money label="เที่ยวดีมีคืน — เมืองหลัก (29 ต.ค.–15 ธ.ค. 2568)" value={main.travel_main_city} onChange={(v) => set({ travel_main_city: v })} max={LIM.travel_main} hint="1 เท่า ไม่เกิน 20,000" />
            <Money label="เที่ยวดีมีคืน — เมืองรอง 55 จังหวัด" value={main.travel_secondary_city} onChange={(v) => set({ travel_secondary_city: v })} max={LIM.travel_main} hint="1.5 เท่า (จ่ายจริงไม่เกิน 20,000) รวมไม่เกิน 30,000" />
            <Money label="มาตรการรัฐอื่นของปี (เช่น โซลาร์รูฟท็อป)" value={main.other_measure_amount} onChange={(v) => set({ other_measure_amount: v })} hint="ใส่ยอดที่ใช้สิทธิได้จริงตามหลักฐาน" />
          </Details>

          <Details title="ข้อ 4 / 6) เงินบริจาค" badge="การศึกษา 2 เท่าก่อน → ทั่วไป 10% ของยอดที่เหลือ">
            <Money label="บริจาคเพื่อการศึกษา/กีฬา/สถานพยาบาลรัฐ" value={main.donation_education} onChange={(v) => set({ donation_education: v })} hint="ลดหย่อน 2 เท่า แต่ไม่เกิน 10% ของเงินได้หลังหักค่าใช้จ่ายและลดหย่อน (แบบข้อ 4)" />
            <Money label="บริจาคทั่วไป (วัด/มูลนิธิ ฯลฯ)" value={main.donation_general} onChange={(v) => set({ donation_general: v })} hint="ไม่เกิน 10% ของเงินได้คงเหลือหลังหักบริจาคการศึกษา (แบบข้อ 6)" />
            <Money label="บริจาคให้พรรคการเมือง" value={main.donation_political} onChange={(v) => set({ donation_political: v })} max={LIM.donation_political} hint="ไม่เกิน 10,000" />
          </Details>

          <Details title="ข้อ 13) ภาษีที่ชำระไว้แล้ว / เครดิตภาษี" badge="หัก ณ ที่จ่าย · เครดิตเงินปันผล · ภ.ง.ด.93/94">
            <Money label="ภาษีหัก ณ ที่จ่าย (กรณียังไม่กรอกรายแหล่ง)" value={main.withholding} onChange={(v) => set({ withholding: v })} hint="ถ้ากรอกรายแหล่งไว้แล้ว ระบบจะรวมจากรายแหล่งให้เอง" />
            <Money label="เครดิตภาษีเงินปันผล" value={main.dividend_credit} onChange={(v) => set({ dividend_credit: v })} />
            <Money label="ภาษีชำระไว้ตาม ภ.ง.ด.93" value={main.pnd93} onChange={(v) => set({ pnd93: v })} />
            <Money label="ภาษีชำระไว้ตาม ภ.ง.ด.94 (ครึ่งปี)" value={main.pnd94} onChange={(v) => set({ pnd94: v })} hint="สำหรับเงินได้ 40(5)–(8) ที่ยื่นครึ่งปีไว้" />
            <Check label="อายุ 65 ปีขึ้นไป หรือเป็นผู้พิการ/ทุพพลภาพ" checked={Number(main.senior_or_disabled_exemption) > 0}
              onChange={(v) => set({ senior_or_disabled_exemption: v ? LIM.senior_disabled_exemption : 0 })}
              hint="ยกเว้นเงินได้ไม่เกิน 190,000 บาท/ปี" />
          </Details>

          {married && (
            <Details title="ค่าลดหย่อนของคู่สมรส (ยื่นรวมกัน)" badge="ลดหย่อนส่วนตัวของคู่สมรสนับให้อัตโนมัติ">
              <Money label="(คู่สมรส) ประกันสังคม" value={spouse.social_security} onChange={(v) => setS({ social_security: v })} max={LIM.social_security} />
              <Money label="(คู่สมรส) ประกันชีวิต" value={spouse.life_insurance} onChange={(v) => setS({ life_insurance: v })} max={LIM.life_insurance} />
              <Money label="(คู่สมรส) ประกันสุขภาพ" value={spouse.health_insurance} onChange={(v) => setS({ health_insurance: v })} max={LIM.health_insurance} />
              <Money label="(คู่สมรส) สำรองเลี้ยงชีพ" value={spouse.provident_fund} onChange={(v) => setS({ provident_fund: v })} />
              <Money label="(คู่สมรส) RMF" value={spouse.rmf} onChange={(v) => setS({ rmf: v })} />
              <Money label="(คู่สมรส) SSF" value={spouse.ssf} onChange={(v) => setS({ ssf: v })} />
              <Money label="(คู่สมรส) ดอกเบี้ยบ้าน" value={spouse.home_loan_interest} onChange={(v) => setS({ home_loan_interest: v })} max={LIM.home_loan_interest} />
              <Money label="(คู่สมรส) บริจาคทั่วไป" value={spouse.donation_general} onChange={(v) => setS({ donation_general: v })} />
              <Money label="(คู่สมรส) บริจาคการศึกษา" value={spouse.donation_education} onChange={(v) => setS({ donation_education: v })} />
              <Money label="(คู่สมรส) ภาษีหัก ณ ที่จ่าย" value={spouse.withholding} onChange={(v) => setS({ withholding: v })} />
              <div className="sm:col-span-2 xl:col-span-3 text-[11px] text-slate-400 leading-4">
                ลดหย่อนระดับครอบครัว (บุตร/บิดามารดา/ค่าคลอดบุตร) นับครั้งเดียวที่ผู้ยื่นหลัก — กรณียื่นรวมกันใช้สิทธิลดหย่อนคู่สมรส (60,000) ไม่ได้
              </div>
            </Details>
          )}
        </div>

        {/* ── ผลลัพธ์ตามลำดับข้อของแบบ ── */}
        <div className="space-y-4 lg:sticky lg:top-4">
          <div className="card p-4 sm:p-5">
            <div className="text-xs text-slate-500">ข้อ 14 · {result.filing_mode}</div>
            <div className={`text-3xl font-bold mt-1 ${summaryColor}`}>
              {surplus > 0.5 ? baht(surplus) : surplus < -0.5 ? baht(Math.abs(surplus)) : '0.00'}
              <span className="text-sm font-semibold ml-1">บาท</span>
            </div>
            <div className={`text-xs font-semibold mt-1 ${summaryColor}`}>
              {surplus > 0.5 ? 'ต้องชำระภาษีเพิ่ม' : surplus < -0.5 ? 'ชำระไว้เกิน — ขอคืนภาษีได้' : 'ไม่มีภาษีต้องชำระเพิ่ม และไม่มีภาษีขอคืน'}
            </div>

            <table className="w-full text-xs mt-4 tabular-nums">
              <tbody className="[&_td]:py-1">
                <tr><td className="text-slate-500">เงินได้พึงประเมินทั้งปี</td><td className="text-right">{baht(result.gross_total)}</td></tr>
                <tr><td className="text-slate-500">หัก ค่าใช้จ่าย (ข้อ 5)</td><td className="text-right text-rose-600">−{baht(result.expenses_total)}</td></tr>
                <tr className="border-t"><td className="text-slate-600 font-medium pt-1">ข้อ 1 เงินได้หลังหักค่าใช้จ่าย</td><td className="text-right pt-1">{baht(result.income_after_expense)}</td></tr>
                {result.exemptions_total > 0 && (
                  <tr><td className="text-slate-500">หัก เงินได้ที่ได้รับยกเว้น</td><td className="text-right text-rose-600">−{baht(result.exemptions_total)}</td></tr>
                )}
                <tr><td className="text-slate-500">หัก ค่าลดหย่อน (ข้อ 2)</td><td className="text-right text-rose-600">−{baht(result.allowances_total - result.allowance_items.filter((i) => i.code.startsWith('donation')).reduce((s, i) => s + i.amount, 0))}</td></tr>
                <tr><td className="text-slate-600 font-medium">ข้อ 3 คงเหลือหลังหักค่าลดหย่อน</td><td className="text-right">{baht(result.base_after_allowances)}</td></tr>
                <tr><td className="text-slate-500">ข้อ 4/6 หัก เงินบริจาค</td><td className="text-right text-rose-600">−{baht(result.allowance_items.filter((i) => i.code.startsWith('donation')).reduce((s, i) => s + i.amount, 0))}</td></tr>
                <tr className="border-t"><td className="text-slate-700 font-semibold pt-1">ข้อ 7 เงินได้สุทธิ</td><td className="text-right font-semibold pt-1">{baht(result.net_income)}</td></tr>
                <tr><td className="text-slate-500">ข้อ 8 ภาษีวิธีที่ 1 (ขั้นบันได)</td><td className="text-right">{baht(result.tax_method1)}</td></tr>
                <tr>
                  <td className="text-slate-500">ข้อ 9 ภาษีวิธีที่ 2 (0.5% ของเงินได้ 40(2)–(8))</td>
                  <td className="text-right">{baht(result.tax_method2)}</td>
                </tr>
                <tr><td className="text-slate-700 font-semibold">ข้อ 10 ภาษีที่ต้องชำระ{result.min_tax_applied ? ' (ใช้วิธีที่ 2)' : ''}</td><td className="text-right font-semibold">{baht(result.tax_before_credit)}</td></tr>
                {result.tax_credits > 0 && (
                  <tr><td className="text-slate-500">ข้อ 13 หัก ภาษีที่ชำระไว้/เครดิต</td><td className="text-right text-emerald-600">−{baht(result.tax_credits)}</td></tr>
                )}
                <tr className="border-t">
                  <td className="text-slate-700 font-bold pt-1">ข้อ 14 {surplus >= 0 ? 'ต้องชำระเพิ่ม' : 'ขอคืนภาษี'}</td>
                  <td className={`text-right font-bold pt-1 ${summaryColor}`}>{baht(Math.abs(surplus))}</td>
                </tr>
              </tbody>
            </table>

            {result.method2_note && (
              <div className="mt-3 text-[11px] text-sky-800 bg-sky-50 border border-sky-100 rounded-lg px-2 py-1.5 leading-4">ℹ {result.method2_note}</div>
            )}
            <div className="mt-3 text-[11px] text-slate-500 leading-4">
              อัตราภาษีขั้นสูงสุดที่เข้าข่าย: <b>{Math.round(result.marginal_rate * 100)}%</b> ·{' '}
              {result.must_file
                ? <>มีหน้าที่<b>ต้องยื่นแบบ</b> (เงินได้เกิน {baht0(result.file_threshold)} บาท/ปี) ภายใน 31 มี.ค. (ออนไลน์ถึง 8 เม.ย.)</>
                : <>เงินได้ไม่ถึง {baht0(result.file_threshold)} บาท — ไม่มีหน้าที่ต้องยื่น (ยื่นเพื่อขอคืนภาษีได้)</>}
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-bold text-[#475569] mb-2">ตารางคำนวณตามแบบ (ข้อ 1 → 14)</h3>
            <table className="w-full text-[11px] tabular-nums">
              <thead>
                <tr className="text-slate-400 text-left"><th className="py-1">รายการ</th><th className="py-1 text-right">จำนวน (บาท)</th></tr>
              </thead>
              <tbody className="[&_td]:py-1">
                <tr className="border-t"><td>1. เงินได้หลังจากหักค่าใช้จ่าย</td><td className="text-right">{baht0(result.income_after_expense)}</td></tr>
                <tr className="border-t"><td>2. ค่าลดหย่อน</td><td className="text-right">{baht0(result.allowances_total - result.allowance_items.filter((i) => i.code.startsWith('donation')).reduce((s, i) => s + i.amount, 0))}</td></tr>
                <tr className="border-t"><td>3. คงเหลือ (1 − 2)</td><td className="text-right">{baht0(result.base_after_allowances)}</td></tr>
                <tr className="border-t"><td>4. บริจาคการศึกษา 2 เท่า (≤10% ของ 3 = {baht0(result.donation_caps.education_10pct_of_item3)})</td><td className="text-right">{baht0(result.allowance_items.filter((i) => i.code === 'donation_education').reduce((s, i) => s + i.amount, 0))}</td></tr>
                <tr className="border-t"><td>5. คงเหลือ (3 − 4)</td><td className="text-right">{baht0(Math.max(0, result.base_after_allowances - result.allowance_items.filter((i) => i.code === 'donation_education').reduce((s, i) => s + i.amount, 0)))}</td></tr>
                <tr className="border-t"><td>6. บริจาคทั่วไป (≤10% ของ 5 = {baht0(result.donation_caps.general_10pct_of_item5)})</td><td className="text-right">{baht0(result.allowance_items.filter((i) => i.code === 'donation_general' || i.code === 'donation_political').reduce((s, i) => s + i.amount, 0))}</td></tr>
                <tr className="border-t font-semibold"><td>7. เงินได้สุทธิ</td><td className="text-right">{baht0(result.net_income)}</td></tr>
                <tr className="border-t"><td>8. ภาษีจากเงินได้สุทธิ (วิธีที่ 1)</td><td className="text-right">{baht0(result.tax_method1)}</td></tr>
                <tr className="border-t"><td>9. ภาษี 0.5% ของเงินได้ 40(2)–(8) (วิธีที่ 2)</td><td className="text-right">{baht0(result.tax_method2)}</td></tr>
                <tr className="border-t font-semibold"><td>10. ภาษีที่ต้องชำระ</td><td className="text-right">{baht0(result.tax_before_credit)}</td></tr>
                <tr className="border-t"><td>13. หัก ภาษีหัก ณ ที่จ่าย/เครดิต</td><td className="text-right">{baht0(result.tax_credits)}</td></tr>
                <tr className="border-t font-semibold"><td>14. ต้องชำระเพิ่ม / ชำระไว้เกิน</td><td className={`text-right ${summaryColor}`}>{baht0(Math.abs(surplus))}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-bold text-[#475569] mb-2">ภาษีขั้นบันไดที่คำนวณได้</h3>
            <table className="w-full text-[11px] tabular-nums">
              <thead>
                <tr className="text-slate-400 text-left">
                  <th className="py-1">ช่วงเงินได้สุทธิ</th><th className="py-1 text-right">อัตรา</th>
                  <th className="py-1 text-right">คิดจาก</th><th className="py-1 text-right">ภาษี</th>
                </tr>
              </thead>
              <tbody className="[&_td]:py-1">
                {result.bracket_steps.map((s) => (
                  <tr key={s.range} className="border-t">
                    <td>{s.range}</td><td className="text-right">{Math.round(s.rate * 100)}%</td>
                    <td className="text-right">{baht0(s.amount)}</td><td className="text-right">{baht0(s.tax)}</td>
                  </tr>
                ))}
                <tr className="border-t font-semibold"><td colSpan={3}>รวมภาษีวิธีที่ 1</td><td className="text-right">{baht0(result.tax_method1)}</td></tr>
              </tbody>
            </table>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-bold text-[#475569] mb-2">เงินได้รายแหล่ง — แบบ ภ.ง.ด.90</h3>
            <table className="w-full text-[11px] tabular-nums">
              <tbody className="[&_td]:py-1">
                {result.income_items.map((it, i) => (
                  <tr key={`${it.category}-${i}`} className="border-b border-dashed last:border-0 align-top">
                    <td className="text-slate-600 pr-2">
                      {it.category_label}
                      {it.description && <span className="block text-[10px] text-slate-400">{it.description}{it.owner === 'คู่สมรส' ? ' · คู่สมรส' : ''}</span>}
                    </td>
                    <td className="text-right">
                      {baht0(it.amount)}
                      {it.withholding > 0 && <span className="block text-[10px] text-emerald-700">หัก ณ ที่จ่าย {baht0(it.withholding)}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-bold text-[#475569] mb-2">ค่าใช้จ่ายและค่าลดหย่อนที่ใช้จริง</h3>
            <div className="max-h-72 overflow-y-auto pr-1 space-y-1">
              {result.expense_lines.map((l) => (
                <div key={`e-${l.label}`} className="text-[11px] flex justify-between gap-2 border-b border-dashed pb-1">
                  <span className="text-slate-500">หักค่าใช้จ่าย · {l.label}</span>
                  <span className="tabular-nums text-rose-600 shrink-0">{baht(l.deductible)}</span>
                </div>
              ))}
              {result.allowance_items.map((i) => (
                <div key={i.code} className="text-[11px] flex justify-between gap-2 border-b border-dashed pb-1">
                  <span className="text-slate-500">
                    {i.label}
                    {i.note && <span className="block text-[10px] text-slate-400">{i.note}</span>}
                  </span>
                  <span className="tabular-nums text-emerald-700 shrink-0">{baht(i.amount)}</span>
                </div>
              ))}
            </div>
            {result.allowance_notes.length > 0 && (
              <ul className="mt-3 space-y-1">
                {result.allowance_notes.map((n) => (
                  <li key={n} className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">⚠ {n}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-bold text-[#475569] mb-2">แหล่งอ้างอิง</h3>
            <ul className="space-y-1">
              {PIT_SOURCES.map((s) => <li key={s} className="text-[11px] text-slate-500 leading-4">• {s}</li>)}
            </ul>
            <p className="text-[11px] text-slate-400 mt-3 leading-4">{result.disclaimer}</p>
            <p className="text-[10px] text-slate-400 mt-2">
              เอนจินเวอร์ชัน {TAX_CALC_VERSION} · โปรแกรมคู่กัน (Python): <code>python/thai_tax_calculator.py</code> ·
              API ตรวจความถูกต้อง: <code>/api/tax/thai-pit?selftest=1</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
