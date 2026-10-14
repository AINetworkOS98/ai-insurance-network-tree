'use client';
/**
 * ThaiTaxCalculator.tsx (v3) — คำนวณภาษีเงินได้บุคคลธรรมดา ตามเอกสารราชการปีภาษี 2568
 *  • กรอกเงินได้ตามแบบ ภ.ง.ด.90 ข้อ 1–7 (รายแหล่ง + ภาษีหัก ณ ที่จ่ายรายแหล่ง)
 *  • หักค่าใช้จ่ายตามแบบ ข้อ 5 / ใบแนบข้อ 2-7
 *  • ค่าลดหย่อนตามใบแนบแสดงรายละเอียดรายการลดหย่อนและยกเว้น ข้อ 1.–24. (เลขข้อตรงกับเอกสาร)
 *  • คำนวณตามแบบ ข้อ 11 (1.–16.) — วิธีที่ 1 (ขั้นบันได) เทียบ วิธีที่ 2 (0.5%)
 * ใช้เอนจินเดียวกับโปรแกรม Python: python/thai_tax_calculator.py (v3.0.0)
 */
import { useMemo, useState } from 'react';
import {
  computePit, computeExpenses, buildItems, INCOME_SECTION, EXPENSE_RULES, VARIANT_RATES,
  itemRateLabel, LIM, DEFAULT_TAX_YEAR, TAX_CALC_VERSION, PIT_SOURCES,
  type PitPerson, type PitIncomeItem, type IncomeKey,
} from '@/lib/tax/thaiPit';

type Num = number | undefined;
const baht = (v: number) => Number(v || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const baht0 = (v: number) => Number(v || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 });

function Money({ label, value, onChange, hint, max, item }: {
  label: string; value: Num; onChange: (v: number) => void; hint?: string; max?: number; item?: string;
}) {
  const over = typeof value === 'number' && typeof max === 'number' && value > max;
  return (
    <label className="block">
      <div className="text-xs font-medium text-slate-600 mb-1 leading-4">
        {item && <span className="inline-block mr-1 px-1.5 py-0.5 rounded bg-sky-50 border border-sky-100 text-[10px] text-sky-700 font-semibold">ข้อ {item}</span>}
        {label}
      </div>
      <input
        type="text" inputMode="numeric" placeholder="0"
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

function Count({ label, value, onChange, hint, item }: { label: string; value: Num; onChange: (v: number) => void; hint?: string; item?: string }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-slate-600 mb-1 leading-4">
        {item && <span className="inline-block mr-1 px-1.5 py-0.5 rounded bg-sky-50 border border-sky-100 text-[10px] text-sky-700 font-semibold">ข้อ {item}</span>}
        {label}
      </div>
      <input type="number" min={0} step={1} value={typeof value === 'number' && value !== 0 ? value : ''}
        onChange={(e) => onChange(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-sky-200" />
      {hint && <div className="text-[11px] text-slate-400 mt-1 leading-4">{hint}</div>}
    </label>
  );
}

function Check({ label, checked, onChange, hint, item }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string; item?: string }) {
  return (
    <label className="flex gap-2 items-start p-3 rounded-xl border border-gray-200 bg-white cursor-pointer hover:bg-sky-50/40">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5" />
      <span>
        <span className="text-xs font-medium text-slate-700 leading-4 block">
          {item && <span className="inline-block mr-1 px-1.5 py-0.5 rounded bg-sky-50 border border-sky-100 text-[10px] text-sky-700 font-semibold">ข้อ {item}</span>}
          {label}
        </span>
        {hint && <span className="text-[11px] text-slate-400 leading-4 block">{hint}</span>}
      </span>
    </label>
  );
}

function Section({ title, badge, note, children }: { title: string; badge?: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-bold text-[#475569]">{title}</h3>
        {badge && <span className="text-[10px] px-2 py-0.5 rounded-full border border-sky-100 bg-sky-50 text-sky-700 font-semibold">{badge}</span>}
      </div>
      {note && <p className="text-[11px] text-slate-400 mt-1 mb-2 leading-4">{note}</p>}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-3">{children}</div>
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

type Row = {
  id: string; category: IncomeKey; description: string; amount: number;
  mode: 'standard' | 'actual'; actual: number; variant: string; withholding: number;
};
const newRow = (category: IncomeKey = 'salary'): Row => ({
  id: Math.random().toString(36).slice(2, 9), category, description: '', amount: 0, mode: 'standard', actual: 0,
  variant: VARIANT_RATES[category] ? Object.keys(VARIANT_RATES[category] as object)[0] : '', withholding: 0,
});
const toItem = (r: Row): PitIncomeItem => ({
  category: r.category, amount: r.amount, description: r.description,
  expense_mode: r.mode, actual_expense: r.actual, variant: r.variant, withholding: r.withholding,
});
const rowExpense = (r: Row) => computeExpenses(buildItems({ income_items: [toItem(r)] })).total;

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
    if (target === 'main') setRows(fn); else setSpouseRows(fn);
  };

  const result = useMemo(() => {
    const person: PitPerson = { ...main, income_items: rows.map(toItem) };
    if (!married) return computePit([person], DEFAULT_TAX_YEAR);
    return computePit([person, { ...spouse, income_items: spouseRows.map(toItem) }], DEFAULT_TAX_YEAR);
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
    } finally { setBusyTest(false); }
  }

  function downloadJson() {
    const person = { ...main, income_items: rows.map(toItem) };
    const payload = { persons: married ? [person, { ...spouse, income_items: spouseRows.map(toItem) }] : [person], result };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `pnd90-${DEFAULT_TAX_YEAR}-${Date.now()}.json`;
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
        setMain({ ...EMPTY, social_security: 9000, provident_fund: 60000 });
        setSpouseRows([]);
      },
    },
    {
      label: 'ค่าเช่าหลายทรัพย์',
      run: () => {
        setMarried(false);
        setRows([
          { ...newRow('rent'), description: 'บ้านเช่า', amount: 1000000, variant: 'building' },
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
  const allowanceRows = result.allowance_items;

  const renderRows = (target: 'main' | 'spouse') => {
    const list = target === 'main' ? rows : spouseRows;
    const setList = target === 'main' ? setRows : setSpouseRows;
    return (
      <div className="space-y-3">
        {list.length === 0 && <div className="text-xs text-slate-400 border border-dashed rounded-xl p-3">ยังไม่มีรายการเงินได้ของคู่สมรส — กด “+ เพิ่มแหล่งเงินได้”</div>}
        {list.map((r, i) => {
          const variants = VARIANT_RATES[r.category];
          return (
            <div key={r.id} className="rounded-2xl border border-gray-100 bg-slate-50/40 p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-semibold text-slate-500">
                  {INCOME_SECTION[r.category].form} · แหล่งเงินได้ที่ {i + 1}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-emerald-700 tabular-nums">หักค่าใช้จ่ายได้ {baht0(rowExpense(r))}</span>
                  <button onClick={() => setList((l) => l.filter((x) => x.id !== r.id))}
                    className="text-[11px] px-2 py-0.5 rounded-full border border-rose-200 bg-rose-50 text-rose-600">ลบ</button>
                </div>
              </div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                <label className="block sm:col-span-2 xl:col-span-1">
                  <div className="text-xs font-medium text-slate-600 mb-1">ประเภทเงินได้ (แบบ ภ.ง.ด.90 ข้อ 1–7)</div>
                  <select value={r.category}
                    onChange={(e) => {
                      const cat = e.target.value as IncomeKey;
                      updateRow(r.id, { category: cat, variant: VARIANT_RATES[cat] ? Object.keys(VARIANT_RATES[cat] as object)[0] : '' }, target);
                    }}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
                    {CATS.map((c) => <option key={c} value={c}>{INCOME_SECTION[c].form} · {INCOME_SECTION[c].short}</option>)}
                  </select>
                </label>
                <Money label="จำนวนเงินทั้งปี" value={r.amount} onChange={(v) => updateRow(r.id, { amount: v }, target)} />
                <Money label="ภาษีหัก ณ ที่จ่ายของแหล่งนี้ (ข้อ 11.15)" value={r.withholding}
                  onChange={(v) => updateRow(r.id, { withholding: v }, target)} hint="ตามหนังสือรับรองการหักภาษี ณ ที่จ่าย" />
                {variants && (
                  <label className="block sm:col-span-2">
                    <div className="text-xs font-medium text-slate-600 mb-1">ประเภทย่อย (อัตราหักค่าใช้จ่ายตามใบแนบ)</div>
                    <select value={r.variant} onChange={(e) => updateRow(r.id, { variant: e.target.value }, target)}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
                      {Object.entries(variants).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                  </label>
                )}
                <label className="block">
                  <div className="text-xs font-medium text-slate-600 mb-1">วิธีหักค่าใช้จ่าย</div>
                  <select value={r.mode} onChange={(e) => updateRow(r.id, { mode: e.target.value as 'standard' | 'actual' }, target)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white">
                    <option value="standard">หักเหมาตามที่กฎหมายกำหนด</option>
                    <option value="actual">หักตามจริง (มีหลักฐาน)</option>
                  </select>
                </label>
                {r.mode === 'actual' && (
                  <Money label="ค่าใช้จ่ายตามจริง" value={r.actual} onChange={(v) => updateRow(r.id, { actual: v }, target)}
                    hint="ต้องมีหลักฐานตามความจำเป็นและสมควร" />
                )}
                <label className="block">
                  <div className="text-xs font-medium text-slate-600 mb-1">รายละเอียด/ชื่อผู้จ่าย (ไม่บังคับ)</div>
                  <input value={r.description} onChange={(e) => updateRow(r.id, { description: e.target.value }, target)}
                    placeholder="เช่น บริษัท…, บ้านเช่า…, ลูกค้า…"
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white" />
                </label>
              </div>
            </div>
          );
        })}
        <button onClick={() => setList((l) => [...l, newRow('salary')])}
          className="px-3 py-2 rounded-full border border-sky-200 bg-sky-50 text-xs font-semibold text-sky-700">+ เพิ่มแหล่งเงินได้</button>
      </div>
    );
  };

  return (
    <div className="space-y-4" id="thai-tax-calculator">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold text-[#475569]">คำนวณภาษีเงินได้บุคคลธรรมดา ตามแบบ ภ.ง.ด.90 + ใบแนบ</h2>
          <span className="text-xs px-2 py-1 rounded-full border bg-white text-slate-500">ปีภาษี {DEFAULT_TAX_YEAR}</span>
          <span className="text-xs px-2 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">เลขข้อตรงกับเอกสารกรมสรรพากร</span>
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
          ลำดับการกรอกและการคำนวณตรงกับเอกสารราชการ: เงินได้ ข้อ 1–7 · หัก ข้อ 2(1)–(4) · ค่าใช้จ่าย ข้อ 5 ·
          ค่าลดหย่อน <b>ใบแนบ ข้อ 1.–24.</b> · และคำนวณภาษี <b>ข้อ 11 (1.–16.)</b> ทั้งวิธีที่ 1 (ขั้นบันได) และวิธีที่ 2 (ร้อยละ 0.5)
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
            <span className="text-xs font-semibold text-slate-600 mr-1">การยื่นแบบ:</span>
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
            note="ข้อ 1 40(1) · ข้อ 3 40(2) · ใบแนบข้อ 2 40(3) · ข้อ 3 40(4) · ข้อ 4 40(5) · ข้อ 5 40(6) · ข้อ 6 40(7) · ข้อ 7 40(8)">
            <div className="sm:col-span-2 xl:col-span-3">{renderRows('main')}</div>
          </Section>

          {married && (
            <Section title="ข้อ 1–7) เงินได้ของคู่สมรส" badge="ยื่นรวมกัน">
              <div className="sm:col-span-2 xl:col-span-3">{renderRows('spouse')}</div>
            </Section>
          )}

          <Section title="ข้อ 2(1)–(4)) หักจากเงินได้ 40(1) ก่อนคิดค่าใช้จ่าย" badge="ตามตัวแบบข้อ 2"
            note="สำรองเลี้ยงชีพส่วนที่เกิน 10,000 บาท · กบข. · กองทุนสงเคราะห์ครูโรงเรียนเอกชน · เงินค่าชดเชยตามกฎหมายแรงงาน (กรณีนำมารวมคำนวณ)">
            <Money item="2(1)" label="เงินสะสมกองทุนสำรองเลี้ยงชีพทั้งปี" value={main.provident_fund}
              onChange={(v) => set({ provident_fund: v })} hint="10,000 แรกหักเป็นลดหย่อน (ใบแนบข้อ 8) · ส่วนที่เกินเป็นเงินได้ที่ได้รับยกเว้นที่นี่" />
            <Money item="2(2)" label="เงินสะสม กบข." value={main.gpf} onChange={(v) => set({ gpf: v })} hint="ไม่เกินร้อยละ 30 และไม่เกิน 500,000 บาท (รวมวงเงินเกษียณ)" />
            <Money item="2(3)" label="เงินสะสมกองทุนสงเคราะห์ครูโรงเรียนเอกชน" value={main.teacher_fund} onChange={(v) => set({ teacher_fund: v })} hint="ไม่เกินร้อยละ 15 และไม่เกิน 500,000 บาท" />
            <Money item="2(4)" label="เงินค่าชดเชยที่ได้รับตามกฎหมายแรงงาน" value={main.severance_pay} onChange={(v) => set({ severance_pay: v })} hint="เฉพาะกรณีนำมารวมคำนวณภาษี" />
          </Section>

          <Section title="ข้อ 5) ค่าใช้จ่าย — ที่ระบบหักให้" badge="ร้อยละตามประเภทเงินได้" note="40(1)+(2) รวมกันร้อยละ 50 ไม่เกิน 100,000 บาท · 40(3) ร้อยละ 50 ไม่เกิน 100,000 บาท">
            <div className="sm:col-span-2 xl:col-span-3">
              <table className="w-full text-xs">
                <tbody className="[&_td]:py-1">
                  {result.expense_lines.map((l) => (
                    <tr key={l.label} className="border-b border-dashed last:border-0">
                      <td className="text-slate-500">{l.label}</td>
                      <td className="text-right tabular-nums text-rose-600">−{baht(l.deductible)}</td>
                    </tr>
                  ))}
                  <tr className="font-semibold">
                    <td className="text-slate-700">รวมค่าใช้จ่าย (ข้อ 5 / ใบแนบ)</td>
                    <td className="text-right tabular-nums">−{baht(result.expenses_total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="ใบแนบ ข้อ 1–7) ครอบครัวและประกัน" badge="ตามใบแนบตัวจริง">
            <Check item="1" label="ผู้มีเงินได้ 60,000 บาท" checked={main.personal !== false} onChange={(v) => set({ personal: v })}
              hint="กรณี 120,000 บาท ตามที่กรมสรรพากรกำหนดเป็นรายกรณี" />
            <Check item="1*" label="ใช้สิทธิผู้มีเงินได้ 120,000 บาท (กรณีพิเศษ)" checked={!!main.personal_special}
              onChange={(v) => set({ personal_special: v })} />
            <Check item="2" label="คู่สมรส (มีเงินได้รวมคำนวณภาษี หรือไม่มีเงินได้)" checked={!!main.spouse_no_income}
              onChange={(v) => set({ spouse_no_income: v })} hint="60,000 บาท" />
            <Count item="3" label="บุตรชอบด้วยกฎหมาย (คน) — คนละ 30,000" value={main.children} onChange={(v) => set({ children: v })} />
            <Count item="3" label="ในจำนวนนั้นเป็นบุตรคนที่ 2+ เกิดใน/หลังปี 2561 (คน) — คนละ 60,000"
              value={main.children_2nd_2561} onChange={(v) => set({ children_2nd_2561: v })} />
            <Count item="4" label="อุปการะเลี้ยงดูบิดามารดา (0–4 คน)" value={main.parents} onChange={(v) => set({ parents: v })}
              hint="บิดา/มารดาของผู้มีเงินได้และของคู่สมรส คนละ 30,000" />
            <Count item="5" label="อุปการะคนพิการ/ทุพพลภาพ (คน · ล.ย.04)" value={main.disabled_dependents}
              onChange={(v) => set({ disabled_dependents: v })} hint="คนละ 60,000" />
            <Money item="6" label="เบี้ยประกันสุขภาพบิดามารดา" value={main.parent_health_insurance}
              onChange={(v) => set({ parent_health_insurance: v })} max={LIM.parent_health} hint="ไม่เกิน 15,000 บาท" />
            <Money item="7.1" label="เบี้ยประกันชีวิต" value={main.life_insurance} onChange={(v) => set({ life_insurance: v })}
              max={LIM.life_insurance} hint="ไม่เกิน 100,000 บาท" />
            <Money item="7.2" label="เบี้ยประกันสุขภาพตัวเอง" value={main.health_insurance} onChange={(v) => set({ health_insurance: v })}
              max={LIM.health_insurance} hint="ไม่เกิน 25,000 และรวมกับ 7.1 ไม่เกิน 100,000" />
            <Money item="7.3" label="เบี้ยประกันชีวิตแบบบำนาญ" value={main.pension_life_insurance}
              onChange={(v) => set({ pension_life_insurance: v })} max={LIM.pension_life}
              hint="ร้อยละ 15 ของเงินได้ ไม่เกิน 200,000 (นับในวงเงินเกษียณ 500,000)" />
          </Section>

          <Section title="ใบแนบ ข้อ 8–16) เงินออม ประกันสังคม และการลงทุน" badge="กอช. · RMF · ดอกเบี้ยบ้าน · CCTV · SE">
            <Money item="9" label="เงินสะสมกองทุนการออมแห่งชาติ (กอช.)" value={main.nsf} onChange={(v) => set({ nsf: v })} max={LIM.nsf} hint="ไม่เกิน 30,000 บาท" />
            <Money item="10" label="ค่าซื้อหน่วยลงทุน RMF" value={main.rmf} onChange={(v) => set({ rmf: v })} hint="ร้อยละ 30 ไม่เกิน 500,000 (ในวงเงินเกษียณ)" />
            <Money item="11" label="ดอกเบี้ยเงินกู้ยืมเพื่อซื้อ เช่าซื้อ หรือสร้างที่อยู่อาศัย" value={main.home_loan_interest}
              onChange={(v) => set({ home_loan_interest: v })} max={LIM.home_loan_interest} hint="ไม่เกิน 100,000 บาท" />
            <Money item="12" label="เงินสมทบกองทุนประกันสังคม" value={main.social_security} onChange={(v) => set({ social_security: v })}
              max={LIM.social_security} hint="ไม่เกิน 9,000 บาท" />
            <Money item="13" label="ค่าซื้อ/ติดตั้งกล้องโทรทัศน์วงจรปิด (CCTV)" value={main.cctv_amount}
              onChange={(v) => set({ cctv_amount: v })} max={LIM.cctv} hint="เฉพาะเงินได้ 40(5)–(8) ในเขตพัฒนาพิเศษเฉพาะกิจ ไม่เกิน 100,000" />
            <Count item="14" label="จำนวนครั้งที่ตั้งครรภ์/คลอดบุตร" value={main.pregnancies} onChange={(v) => set({ pregnancies: v })} hint="ไม่เกิน 60,000 บาทต่อครั้ง" />
            {Number(main.pregnancies) > 0 && (
              <Money item="14" label="ค่าฝากครรภ์ + ค่าคลอดบุตร (รวม)" value={main.prenatal_expense} onChange={(v) => set({ prenatal_expense: v })} max={60000} />
            )}
            <Money item="15" label="เงินที่บริจาคแก่พรรคการเมือง" value={main.donation_political} onChange={(v) => set({ donation_political: v })}
              max={LIM.donation_political} hint="ไม่เกิน 10,000 บาท" />
            <Money item="16" label="เงินลงทุนในหุ้น/หุ้นส่วน วิสาหกิจเพื่อสังคม (SE)" value={main.social_enterprise}
              onChange={(v) => set({ social_enterprise: v })} max={LIM.social_enterprise} hint="ไม่เกิน 100,000 บาท" />
          </Section>

          <Details title="ใบแนบ ข้อ 17–23) มาตรการของรัฐของปีภาษี" badge="Easy E-Receipt · Thai ESG/X · บ้าน · งานศิลปะ · ท่องเที่ยว · SSF">
            <Money item="17.1" label="Easy E-Receipt — สินค้า/บริการในระบบ VAT" value={main.e_receipt_general} onChange={(v) => set({ e_receipt_general: v })} hint="16 ม.ค.–28 ก.พ. 2568 · รวม 17.1–17.4 ไม่เกิน 50,000 บาท" />
            <Money item="17.2" label="Easy E-Receipt — หนังสือ หนังสือพิมพ์ นิตยสาร" value={main.e_receipt_books} onChange={(v) => set({ e_receipt_books: v })} />
            <Money item="17.3" label="Easy E-Receipt — หนังสืออิเล็กทรอนิกส์ผ่านอินเทอร์เน็ต" value={main.e_receipt_ebooks} onChange={(v) => set({ e_receipt_ebooks: v })} />
            <Money item="17.4" label="Easy E-Receipt — OTOP วิสาหกิจชุมชน และ SE" value={main.e_receipt_otop} onChange={(v) => set({ e_receipt_otop: v })} />
            <Money item="18" label="ค่าซื้อหน่วยลงทุน Thai ESG" value={main.thai_esg} onChange={(v) => set({ thai_esg: v })} max={LIM.thai_esg} hint="ร้อยละ 30 ไม่เกิน 300,000 บาท" />
            <Money item="19.1" label="ค่าซื้อหน่วยลงทุน Thai ESGX (ลงทุนใหม่ 1 พ.ค.–30 มิ.ย. 2568)" value={main.thai_esgx} onChange={(v) => set({ thai_esgx: v })} max={LIM.thai_esgx} />
            <Money item="19.2" label="มูลค่าสับเปลี่ยนหน่วยลงทุนจากกองทุน LTF → Thai ESGX" value={main.thai_esgx_ltf_swap} onChange={(v) => set({ thai_esgx_ltf_swap: v })} hint="เฉพาะปีภาษี 2568" />
            <Money item="20" label="ค่าจ้างก่อสร้างอาคารเพื่ออยู่อาศัยขึ้นใหม่ (มูลค่าก่อสร้าง)" value={main.home_construction_cost}
              onChange={(v) => set({ home_construction_cost: v })} hint="ล้านละ 10,000 รวมไม่เกิน 100,000 · สัญญา 9 เม.ย. 2567–31 ธ.ค. 2568" />
            <Money item="21" label="ค่าซื้องานศิลปะ" value={main.art_purchase} onChange={(v) => set({ art_purchase: v })} max={LIM.art} hint="ตามที่จ่ายจริง ไม่เกิน 100,000 บาท" />
            <Money item="22.1" label="ค่าท่องเที่ยวภายในประเทศ — เมืองหลัก" value={main.travel_main_city} onChange={(v) => set({ travel_main_city: v })} max={LIM.travel_main} hint="29 ต.ค.–15 ธ.ค. 2568 · 1 เท่า ไม่เกิน 20,000" />
            <Money item="22.2" label="ค่าท่องเที่ยวภายในประเทศ — เมืองรอง" value={main.travel_secondary_city} onChange={(v) => set({ travel_secondary_city: v })} max={LIM.travel_main} hint="1.5 เท่า (จ่ายจริงไม่เกิน 20,000) รวมไม่เกิน 30,000" />
            <Money item="23" label="อื่น ๆ — ค่าซื้อหน่วยลงทุน SSF" value={main.ssf} onChange={(v) => set({ ssf: v })} hint="ร้อยละ 30 ไม่เกิน 200,000 บาท" />
            <Money item="23" label="อื่น ๆ — มาตรการของรัฐอื่นของปีภาษี" value={main.other_measure_amount} onChange={(v) => set({ other_measure_amount: v })} hint="ใส่ยอดที่ใช้สิทธิได้จริงตามหลักฐาน" />
          </Details>

          <Details title="ข้อ 11.4 / 11.6) เงินบริจาค" badge="การศึกษา 2 เท่าก่อน → ทั่วไป 10% ของยอดที่เหลือ">
            <Money label="11.4 เงินบริจาค (2 เท่าของที่จ่ายจริง) — การศึกษา/กีฬา/พัฒนาสังคม/สถานพยาบาลรัฐ" value={main.donation_education}
              onChange={(v) => set({ donation_education: v })} hint="ไม่เกินร้อยละ 10 ของยอดข้อ 11.3" />
            <Money label="11.6 เงินบริจาค (ไม่เกินร้อยละ 10 ของข้อ 11.5)" value={main.donation_general}
              onChange={(v) => set({ donation_general: v })} hint="บริจาคทั่วไป/มูลนิธิ ฯลฯ" />
          </Details>

          <Details title="ข้อ 11.13 / 11.15) เครดิตภาษีและภาษีที่ชำระไว้" badge="หัก ณ ที่จ่าย · เครดิตเงินปันผล · ภ.ง.ด.93/94">
            <Money label="11.13 เครดิตภาษีเงินได้จากต่างประเทศ (ไม่เกินภาษีที่ต้องเสีย)" value={main.foreign_tax_credit}
              onChange={(v) => set({ foreign_tax_credit: v })} />
            <Money label="11.15 ภาษีหัก ณ ที่จ่าย (กรณียังไม่กรอกรายแหล่ง)" value={main.withholding} onChange={(v) => set({ withholding: v })} hint="ถ้ากรอกรายแหล่งไว้แล้ว ระบบจะรวมให้เอง" />
            <Money label="11.15 เครดิตภาษีเงินปันผล" value={main.dividend_credit} onChange={(v) => set({ dividend_credit: v })} />
            <Money label="11.15 ภาษีชำระไว้ตาม ภ.ง.ด.93" value={main.pnd93} onChange={(v) => set({ pnd93: v })} />
            <Money label="11.15 ภาษีชำระไว้ตาม ภ.ง.ด.94 (ครึ่งปี)" value={main.pnd94} onChange={(v) => set({ pnd94: v })} />
            <Check label="อายุ 65 ปีขึ้นไป หรือเป็นผู้พิการ/ทุพพลภาพ" checked={Number(main.senior_or_disabled_exemption) > 0}
              onChange={(v) => set({ senior_or_disabled_exemption: v ? LIM.senior_disabled_exemption : 0 })}
              hint="ยกเว้นเงินได้ไม่เกิน 190,000 บาท/ปี" />
          </Details>

          {married && (
            <Details title="ข้อมูลของคู่สมรส (ยื่นรวมกัน)" badge="ลดหย่อนส่วนตัวของคู่สมรสนับให้อัตโนมัติ">
              <Money label="(คู่สมรส) ประกันสังคม" value={spouse.social_security} onChange={(v) => setS({ social_security: v })} max={LIM.social_security} />
              <Money label="(คู่สมรส) ประกันชีวิต" value={spouse.life_insurance} onChange={(v) => setS({ life_insurance: v })} max={LIM.life_insurance} />
              <Money label="(คู่สมรส) ประกันสุขภาพ" value={spouse.health_insurance} onChange={(v) => setS({ health_insurance: v })} max={LIM.health_insurance} />
              <Money label="(คู่สมรส) สำรองเลี้ยงชีพ (แบบข้อ 2(1)+ใบแนบข้อ 8)" value={spouse.provident_fund} onChange={(v) => setS({ provident_fund: v })} />
              <Money label="(คู่สมรส) กบข." value={spouse.gpf} onChange={(v) => setS({ gpf: v })} />
              <Money label="(คู่สมรส) RMF" value={spouse.rmf} onChange={(v) => setS({ rmf: v })} />
              <Money label="(คู่สมรส) SSF" value={spouse.ssf} onChange={(v) => setS({ ssf: v })} />
              <Money label="(คู่สมรส) ดอกเบี้ยบ้าน" value={spouse.home_loan_interest} onChange={(v) => setS({ home_loan_interest: v })} max={LIM.home_loan_interest} />
              <Money label="(คู่สมรส) บริจาคทั่วไป" value={spouse.donation_general} onChange={(v) => setS({ donation_general: v })} />
              <Money label="(คู่สมรส) บริจาคการศึกษา" value={spouse.donation_education} onChange={(v) => setS({ donation_education: v })} />
              <Money label="(คู่สมรส) ภาษีหัก ณ ที่จ่าย" value={spouse.withholding} onChange={(v) => setS({ withholding: v })} />
            </Details>
          )}
        </div>

        {/* ── ผลลัพธ์ตามลำดับข้อของแบบ ── */}
        <div className="space-y-4 lg:sticky lg:top-4">
          <div className="card p-4 sm:p-5">
            <div className="text-xs text-slate-500">แบบ ข้อ 11.16 · {result.filing_mode}</div>
            <div className={`text-3xl font-bold mt-1 ${summaryColor}`}>
              {surplus > 0.5 ? baht(surplus) : surplus < -0.5 ? baht(Math.abs(surplus)) : '0.00'}
              <span className="text-sm font-semibold ml-1">บาท</span>
            </div>
            <div className={`text-xs font-semibold mt-1 ${summaryColor}`}>
              {surplus > 0.5 ? 'ต้องชำระภาษีเพิ่ม' : surplus < -0.5 ? 'ชำระไว้เกิน — ขอคืนภาษีได้' : 'ไม่มีภาษีต้องชำระเพิ่ม และไม่มีภาษีขอคืน'}
            </div>
            <table className="w-full text-xs mt-4 tabular-nums">
              <tbody className="[&_td]:py-1">
                <tr><td className="text-slate-500">เงินได้พึงประเมินทั้งสิ้น</td><td className="text-right">{baht(result.gross_total)}</td></tr>
                {result.section2_total > 0 && (
                  <tr><td className="text-slate-500">หัก ข้อ 2(1)–(4)</td><td className="text-right text-rose-600">−{baht(result.section2_total)}</td></tr>
                )}
                <tr><td className="text-slate-500">หัก ค่าใช้จ่าย (ข้อ 5)</td><td className="text-right text-rose-600">−{baht(result.expenses_total)}</td></tr>
                <tr className="border-t"><td className="text-slate-600 font-medium pt-1">ข้อ 11.1 เงินได้หลังจากหักค่าใช้จ่าย</td><td className="text-right pt-1">{baht(result.income_after_expense)}</td></tr>
                <tr><td className="text-slate-500">ข้อ 11.2 หัก ค่าลดหย่อน (ใบแนบ ข้อ 24)</td><td className="text-right text-rose-600">−{baht(result.allowances_total)}</td></tr>
                <tr><td className="text-slate-600 font-medium">ข้อ 11.3 คงเหลือ</td><td className="text-right">{baht(result.item3_balance)}</td></tr>
                <tr><td className="text-slate-500">ข้อ 11.4 หัก เงินบริจาค (2 เท่า ≤10% ของ 11.3)</td><td className="text-right text-rose-600">−{baht(result.item4_education_donation)}</td></tr>
                <tr><td className="text-slate-600 font-medium">ข้อ 11.5 คงเหลือ</td><td className="text-right">{baht(result.item5_balance)}</td></tr>
                <tr><td className="text-slate-500">ข้อ 11.6 หัก เงินบริจาค (≤10% ของ 11.5)</td><td className="text-right text-rose-600">−{baht(result.item6_general_donation)}</td></tr>
                <tr className="border-t"><td className="text-slate-700 font-semibold pt-1">ข้อ 11.7 เงินได้สุทธิ</td><td className="text-right font-semibold pt-1">{baht(result.net_income)}</td></tr>
                <tr><td className="text-slate-500">ข้อ 11.8 ภาษีจากเงินได้สุทธิ (วิธีที่ 1)</td><td className="text-right">{baht(result.tax_method1)}</td></tr>
                <tr><td className="text-slate-500">ข้อ 11.9 ภาษีร้อยละ 0.5 (วิธีที่ 2)</td><td className="text-right">{baht(result.tax_method2)}</td></tr>
                <tr><td className="text-slate-700 font-semibold">ข้อ 11.10 ภาษีที่ต้องชำระ{result.min_tax_applied ? ' (ใช้วิธีที่ 2)' : ''}</td><td className="text-right font-semibold">{baht(result.tax_before_credit)}</td></tr>
                {result.foreign_tax_credit > 0 && (
                  <tr><td className="text-slate-500">ข้อ 11.13 หัก เครดิตภาษีจากต่างประเทศ</td><td className="text-right text-emerald-600">−{baht(result.foreign_tax_credit)}</td></tr>
                )}
                {result.tax_credits > 0 && (
                  <tr><td className="text-slate-500">ข้อ 11.15 หัก ภาษีที่ชำระไว้/เครดิต</td><td className="text-right text-emerald-600">−{baht(result.tax_credits)}</td></tr>
                )}
                <tr className="border-t">
                  <td className="text-slate-700 font-bold pt-1">ข้อ 11.16 {surplus >= 0 ? 'ต้องชำระเพิ่ม' : 'ขอคืนภาษี'}</td>
                  <td className={`text-right font-bold pt-1 ${summaryColor}`}>{baht(Math.abs(surplus))}</td>
                </tr>
              </tbody>
            </table>
            {result.method2_note && (
              <div className="mt-3 text-[11px] text-sky-800 bg-sky-50 border border-sky-100 rounded-lg px-2 py-1.5 leading-4">ℹ {result.method2_note}</div>
            )}
            <div className="mt-3 text-[11px] text-slate-500 leading-4">
              ข้อ 11.1 = เงินได้ทั้งสิ้น − ข้อ 2 − ค่าใช้จ่าย · อัตราภาษีขั้นสูงสุดที่เข้าข่าย <b>{Math.round(result.marginal_rate * 100)}%</b> ·{' '}
              {result.must_file
                ? <>มีหน้าที่<b>ต้องยื่นแบบ</b> (เงินได้เกิน {baht0(result.file_threshold)} บาท) ภายใน 31 มี.ค. (ออนไลน์ถึง 8 เม.ย.)</>
                : <>เงินได้ไม่ถึง {baht0(result.file_threshold)} บาท — ไม่มีหน้าที่ต้องยื่น (ยื่นเพื่อขอคืนภาษีได้)</>}
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-bold text-[#475569] mb-2">ใบแนบ ข้อ 1.–24. (ค่าลดหย่อนที่ใช้จริง)</h3>
            <table className="w-full text-[11px] tabular-nums">
              <tbody className="[&_td]:py-1">
                {allowanceRows.map((i) => (
                  <tr key={`${i.item}-${i.code}`} className="border-b border-dashed last:border-0 align-top">
                    <td className="text-slate-400 w-8">{i.item}.</td>
                    <td className="text-slate-600 pr-2">
                      {i.label}
                      {i.note && <span className="block text-[10px] text-slate-400">{i.note}</span>}
                    </td>
                    <td className="text-right text-emerald-700 whitespace-nowrap">{baht0(i.amount)}</td>
                  </tr>
                ))}
                <tr className="font-semibold border-t">
                  <td colSpan={2}>ข้อ 24. รวม (1. ถึง 23.) → แบบ ข้อ 11.2</td>
                  <td className="text-right">{baht0(result.allowances_total)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-bold text-[#475569] mb-2">ภาษีขั้นบันได (ข้อ 11.8)</h3>
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
            <h3 className="text-sm font-bold text-[#475569] mb-2">เงินได้รายแหล่ง (แบบ ข้อ 1–7)</h3>
            <table className="w-full text-[11px] tabular-nums">
              <tbody className="[&_td]:py-1">
                {result.income_items.map((it, i) => (
                  <tr key={`${it.category}-${i}`} className="border-b border-dashed last:border-0 align-top">
                    <td className="text-slate-600 pr-2">
                      <span className="text-slate-400">{it.form} </span>{it.category_label}
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

          {result.allowance_notes.length > 0 && (
            <div className="card p-4">
              <h3 className="text-sm font-bold text-[#475569] mb-2">ข้อสังเกตจากระบบ</h3>
              <ul className="space-y-1">
                {result.allowance_notes.map((n) => (
                  <li key={n} className="text-[10px] text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">⚠ {n}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="card p-4">
            <h3 className="text-sm font-bold text-[#475569] mb-2">อ้างอิงเอกสารราชการ</h3>
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
