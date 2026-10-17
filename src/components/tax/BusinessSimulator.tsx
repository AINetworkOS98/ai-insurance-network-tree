'use client';
/**
 * BusinessSimulator.tsx — แท็บ "📊 ผลประกอบการ (Keyman)"
 * ---------------------------------------------------------------------------
 * โปรแกรมให้สมาชิกกรอกข้อมูลลูกค้า แล้วเทียบ "ผลประกอบการ" 3 สถานการณ์
 * ตามแบบโปรแกรม "โครงการวางแผนภาษีสำหรับธุรกิจและผู้ประกอบการ" (ชีต จำลองงบ):
 *   ก่อนวางแผน · วางแผน (บริษัทจ่ายเบี้ย) · บริษัทออกภาษีให้ทุกทอด
 * ทุกตัวเลขมาจาก computeBusinessSim() ซึ่งเรียกเอนจินภาษีเดิม (computePit/computeCit)
 */
import { useEffect, useMemo, useState } from 'react';
import { computeBusinessSim, BUSINESS_SIM_VERSION, BUSINESS_SIM_YEAR, type SimInput, type SimRow } from '@/lib/tax/businessSim';

const b0 = (v: number) => Number(v || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 });
const STORE_KEY = 'keyman-business-sim-v1';

function Num({ label, value, onChange, hint }: { label: string; value: number | undefined; onChange: (v: number) => void; hint?: string }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-slate-600 mb-1 leading-4">{label}</div>
      <input type="text" inputMode="numeric" placeholder="0"
        value={typeof value === 'number' && value !== 0 ? value.toLocaleString('en-US') : ''}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value.replace(/[^\d.]/g, '')) || 0))}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200" />
      {hint && <div className="text-[11px] text-slate-400 mt-1 leading-4">{hint}</div>}
    </label>
  );
}

const BASE: SimInput = {
  client_name: '',
  company_revenue: 50_000_000,
  company_expenses: 45_000_000,
  director_income: 4_000_000,
  premium: 300_000,
  years: 10,
  capital_paid_up: 3_000_000,
  spouse_no_income: false,
  children: 0,
  life_insurance: 0,
  health_insurance: 0,
  social_security: 0,
  home_loan_interest: 0,
  other_allowances: 0,
  deductible: true,
  benefit_to_executive: true,
  company_pays_tax: true,
  include_dividend_wht: true,
};

const PRESETS: Array<{ label: string; input: Partial<SimInput> }> = [
  { label: 'ตัวอย่างชีต จำลองงบ (50 ล้าน / เบี้ย 3 แสน)', input: { ...BASE } },
  { label: 'SME กำไร 5 แสน · ผู้บริหาร 2 ล้าน', input: { ...BASE, company_revenue: 12_000_000, company_expenses: 9_500_000, director_income: 2_000_000, premium: 100_000, capital_paid_up: 3_000_000, other_allowances: 0, years: 10 } },
  { label: 'บริษัทเล็ก · ผู้บริหารเงินได้ต่ำ', input: { ...BASE, company_revenue: 5_000_000, company_expenses: 4_300_000, director_income: 300_000, premium: 60_000, capital_paid_up: 1_000_000, other_allowances: 0, years: 10 } },
  { label: 'จ่ายเฉพาะผู้ถือหุ้น → หักเบี้ยไม่ได้', input: { ...BASE, premium: 200_000, deductible: false, other_allowances: 0 } },
];

/** แถวในตาราง 비교 1 บรรทัด */
function Row({ label, cells, strong, tone, indent }: { label: string; cells: Array<{ v: number; neg?: boolean }>; strong?: boolean; tone?: 'ok' | 'warn'; indent?: boolean }) {
  return (
    <tr className={`border-b border-dashed last:border-0 ${strong ? 'font-semibold' : ''}`}>
      <td className={`py-1.5 pr-2 ${indent ? 'pl-3 text-slate-500' : 'text-slate-600'}`}>{label}</td>
      {cells.map((c, i) => (
        <td key={i} className={`py-1.5 px-2 text-right tabular-nums ${tone === 'ok' ? 'text-emerald-700' : tone === 'warn' ? 'text-rose-600' : 'text-slate-700'}`}>
          {c.neg && c.v !== 0 ? '−' : ''}{b0(Math.abs(c.v))}
        </td>
      ))}
    </tr>
  );
}

function SectionTitle({ children, cols }: { children: React.ReactNode; cols: number }) {
  return (
    <tr className="bg-slate-50">
      <td className="py-1.5 pr-2 text-[11px] font-bold text-[#475569]" colSpan={cols + 1}>{children}</td>
    </tr>
  );
}

export default function BusinessSimulator() {
  const [input, setInput] = useState<SimInput>(BASE);
  const [loaded, setLoaded] = useState(false);
  const set = (p: Partial<SimInput>) => setInput((prev) => ({ ...prev, ...p }));
  const r = useMemo(() => computeBusinessSim(input), [input]);

  // จำค่าที่กรอกไว้ล่าสุด (สมาชิกกรอกซ้ำได้ ไม่ต้องเริ่มใหม่)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) setInput({ ...BASE, ...JSON.parse(raw) });
    } catch { /* ignore */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(input)); } catch { /* ignore */ }
  }, [input, loaded]);

  const cols: SimRow[] = r.rows;
  const cells = (pick: (row: SimRow) => number, neg = false) => cols.map((row) => ({ v: pick(row), neg }));

  return (
    <div className="space-y-4" id="business-sim">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full border bg-white text-slate-500">KEYMAN · BUSINESS RESULT</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold">3 สถานการณ์ เทียบผลประกอบการ</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border bg-white text-slate-500">ปีภาษี {BUSINESS_SIM_YEAR}</span>
          <span className="ml-auto flex flex-wrap gap-2">
            <button onClick={() => window.print()} className="px-3 py-2 rounded-full border bg-white text-xs font-semibold text-slate-600">🖨 พิมพ์ / บันทึก PDF</button>
          </span>
        </div>
        <h2 className="text-lg font-bold text-[#475569] mt-3">เปรียบเทียบผลประกอบการเมื่อทำประกันคีย์แมน</h2>
        <p className="text-xs text-slate-500 mt-1 leading-5">
          กรอกข้อมูลจริงของลูกค้า แล้วโปรแกรมจะเทียบ <b>3 สถานการณ์</b> ให้เห็นทั้งฝั่ง <b>ภาษีเงินได้บุคคลธรรมดาของกรรมการ (ภ.ง.ด.90/91)</b>
          และ <b>งบการเงิน–ภาษีนิติบุคคลของบริษัท (ภ.ง.ด.50)</b> พร้อมภาษีที่ประหยัดได้และต้นทุนสุทธิของบริษัท
          — ใช้รูปแบบเดียวกับโปรแกรม “โครงการวางแผนภาษีสำหรับธุรกิจและผู้ประกอบการ” ที่ใช้ในห้องประชุม
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <span className="text-[11px] text-slate-400 self-center">ตัวอย่าง:</span>
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => setInput({ ...BASE, ...p.input })}
              className="px-3 py-1.5 rounded-full border border-gray-200 bg-white text-[11px] text-slate-600 hover:bg-emerald-50">{p.label}</button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 items-start">
        {/* ── ฟอร์มกรอกข้อมูล ── */}
        <div className="lg:col-span-1 space-y-4">
          <section className="card p-4 sm:p-5">
            <h3 className="text-sm font-bold text-[#475569] mb-3">1) ลูกค้า / บริษัท</h3>
            <label className="block">
              <div className="text-xs font-medium text-slate-600 mb-1">ชื่อบริษัท / ชื่อลูกค้า</div>
              <input type="text" value={input.client_name || ''} onChange={(e) => set({ client_name: e.target.value })}
                placeholder="บริษัท ตัวอย่าง จำกัด"
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200" />
            </label>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Num label="รายได้ต่อปี" value={input.company_revenue} onChange={(v) => set({ company_revenue: v })} />
              <Num label="ต้นทุน+ค่าใช้จ่าย/ปี" value={input.company_expenses} onChange={(v) => set({ company_expenses: v })} hint="ไม่รวมค่าตอบแทนกรรมการ" />
              <Num label="ค่าตอบแทนกรรมการ/ปี" value={input.director_income} onChange={(v) => set({ director_income: v })} hint="40(1) เงินเดือน+โบนัส" />
              <Num label="ทุนจดทะเบียนที่ชำระแล้ว" value={input.capital_paid_up} onChange={(v) => set({ capital_paid_up: v })} hint="เกณฑ์ SME ≤ 5 ล้าน" />
            </div>
          </section>

          <section className="card p-4 sm:p-5">
            <h3 className="text-sm font-bold text-[#475569] mb-3">2) เบี้ยประกันคีย์แมน</h3>
            <div className="grid grid-cols-2 gap-3">
              <Num label="เบี้ยประกัน/ปี" value={input.premium} onChange={(v) => set({ premium: v })} />
              <Num label="จ่ายต่อเนื่อง (ปี)" value={input.years} onChange={(v) => set({ years: v })} />
            </div>
            <div className="space-y-2 mt-3">
              <label className="flex gap-2 items-start p-3 rounded-xl border border-gray-200 bg-white cursor-pointer">
                <input type="checkbox" checked={input.deductible !== false} onChange={(e) => set({ deductible: e.target.checked })} className="mt-0.5" />
                <span className="text-[11px] text-slate-600 leading-4">จ่ายให้กรรมการทุกคนตามระเบียบ → <b>หักค่าใช้จ่ายได้</b><br /><span className="text-slate-400">ไม่ติ๊ก = จ่ายเฉพาะราย → หักไม่ได้ (65 ตรี (3))</span></span>
              </label>
              <label className="flex gap-2 items-start p-3 rounded-xl border border-gray-200 bg-white cursor-pointer">
                <input type="checkbox" checked={input.benefit_to_executive !== false} onChange={(e) => set({ benefit_to_executive: e.target.checked })} className="mt-0.5" />
                <span className="text-[11px] text-slate-600 leading-4">เบี้ยเป็น <b>เงินได้ 40(1) ของกรรมการ</b><br /><span className="text-slate-400">ตามแนววินิจฉัย กค 0811/408</span></span>
              </label>
              <label className="flex gap-2 items-start p-3 rounded-xl border border-gray-200 bg-white cursor-pointer">
                <input type="checkbox" checked={input.company_pays_tax !== false} onChange={(e) => set({ company_pays_tax: e.target.checked })} className="mt-0.5" />
                <span className="text-[11px] text-slate-600 leading-4">บริษัท <b>ออกภาษีให้กรรมการ</b> (คำนวณทอด ๆ)<br /><span className="text-slate-400">ป. 96/2543 ข้อ 1(7),(8)</span></span>
              </label>
              <label className="flex gap-2 items-start p-3 rounded-xl border border-gray-200 bg-white cursor-pointer">
                <input type="checkbox" checked={input.include_dividend_wht !== false} onChange={(e) => set({ include_dividend_wht: e.target.checked })} className="mt-0.5" />
                <span className="text-[11px] text-slate-600 leading-4">นับภาษีเงินปันผล 10% ในยอดรวม<br /><span className="text-slate-400">กรณีจ่ายกำไรออกมาเป็นเงินปันผล</span></span>
              </label>
            </div>
          </section>

          <section className="card p-4 sm:p-5">
            <h3 className="text-sm font-bold text-[#475569] mb-3">3) ค่าลดหย่อนของกรรมการ</h3>
            <div className="grid grid-cols-2 gap-3">
              <Num label="บุตร (คน)" value={input.children} onChange={(v) => set({ children: v })} hint="คนละ 30,000" />
              <Num label="เบี้ยประกันชีวิต" value={input.life_insurance} onChange={(v) => set({ life_insurance: v })} hint="รวมสุขภาพ ≤ 100,000" />
              <Num label="เบี้ยประกันสุขภาพ" value={input.health_insurance} onChange={(v) => set({ health_insurance: v })} hint="≤ 25,000" />
              <Num label="ประกันสังคม" value={input.social_security} onChange={(v) => set({ social_security: v })} hint="≤ 10,500" />
              <Num label="ดอกเบี้ยบ้าน" value={input.home_loan_interest} onChange={(v) => set({ home_loan_interest: v })} hint="≤ 100,000" />
              <Num label="ลดหย่อนอื่น ๆ" value={input.other_allowances} onChange={(v) => set({ other_allowances: v })} hint="RMF/SSF/บำนาญ/บริจาค ฯลฯ" />
            </div>
            <label className="flex gap-2 items-start mt-3 p-3 rounded-xl border border-gray-200 bg-white cursor-pointer">
              <input type="checkbox" checked={input.spouse_no_income === true} onChange={(e) => set({ spouse_no_income: e.target.checked })} className="mt-0.5" />
              <span className="text-[11px] text-slate-600 leading-4">คู่สมรสไม่มีเงินได้ (ลดหย่อน 60,000)</span>
            </label>
            <p className="text-[10px] text-slate-400 mt-2 leading-4">ลดหย่อนส่วนตัว 60,000 และค่าใช้จ่าย 50% (ไม่เกิน 100,000) ระบบคิดให้อัตโนมัติตามแบบ ภ.ง.ด.90/91</p>
          </section>
        </div>

        {/* ── ผลลัพธ์ ── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="card p-3">
              <div className="text-[11px] text-slate-500">ภาษีรวม — ก่อนวางแผน</div>
              <div className="text-2xl font-bold text-slate-700 mt-0.5">{b0(r.before.total_tax)}</div>
              <div className="text-[10px] text-slate-400 mt-0.5">PIT {b0(r.before.pit)} + CIT {b0(r.before.cit)} + ปันผล {b0(r.before.dividend_wht)}</div>
            </div>
            <div className="card p-3 border-emerald-200">
              <div className="text-[11px] text-emerald-700">วางแผน (บริษัทจ่ายเบี้ย)</div>
              <div className="text-2xl font-bold text-emerald-700 mt-0.5">{b0(r.plan.total_tax)}</div>
              <div className="text-[10px] text-emerald-600 mt-0.5">
                {r.tax_saved_plan >= 0 ? `ประหยัด ${b0(r.tax_saved_plan)} บาท/ปี` : `เพิ่มขึ้น ${b0(-r.tax_saved_plan)} บาท/ปี`}
              </div>
            </div>
            <div className="card p-3 border-amber-200">
              <div className="text-[11px] text-amber-700">บริษัทออกภาษีให้ทุกทอด</div>
              <div className="text-2xl font-bold text-amber-700 mt-0.5">{b0(r.gross.total_tax)}</div>
              <div className="text-[10px] text-amber-600 mt-0.5">
                {r.tax_saved_gross >= 0 ? `ประหยัด ${b0(r.tax_saved_gross)} บาท/ปี` : `เพิ่มขึ้น ${b0(-r.tax_saved_gross)} บาท/ปี`} · {r.gross_rounds} ทอด
              </div>
            </div>
          </div>

          <section className="card p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-2 flex-wrap mb-2">
              <h3 className="text-sm font-bold text-[#475569]">ตารางเปรียบเทียบ 3 สถานการณ์ {input.client_name ? `· ${input.client_name}` : ''}</h3>
              <span className="text-[10px] text-slate-400">หน่วย: บาท/ปี · ปีภาษี {BUSINESS_SIM_YEAR}</span>
            </div>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-xs min-w-[680px] tabular-nums" id="business-sim-table">
                <thead>
                  <tr className="text-left border-b">
                    <th className="py-2 pr-2 font-semibold text-slate-400">รายการ</th>
                    {cols.map((c) => (
                      <th key={c.key} className="py-2 px-2 text-right font-semibold text-slate-500">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="[&_td]:text-[11.5px]">
                  <SectionTitle cols={3}>ภาษีเงินได้บุคคลธรรมดา (ภ.ง.ด.90/91) — กรรมการ</SectionTitle>
                  <Row label="เงินได้พึงประเมิน (เงินเดือน/ค่าตอบแทน)" cells={cells((x) => x.director_income)} />
                  <Row label="+ เบี้ยประกันที่บริษัทจ่าย (เป็นเงินได้)" cells={cells((x) => x.premium_income)} />
                  <Row label="+ ภาษีที่บริษัทออกให้ (มาตรา 39)" cells={cells((x) => x.tax_borne_income)} />
                  <Row label="รวมเงินได้พึงประเมิน" cells={cells((x) => x.gross_total)} strong />
                  <Row label="หัก ค่าใช้จ่าย 50% (ไม่เกิน 100,000)" cells={cells((x) => x.expense_deduction)} indent />
                  <Row label="หัก ลดหย่อนส่วนตัว" cells={cells((x) => x.personal_allowance)} indent />
                  <Row label="หัก ลดหย่อนอื่น ๆ (คู่สมรส/บุตร/ประกัน/ฯลฯ)" cells={cells((x) => x.other_deductions)} indent />
                  <Row label="เงินได้สุทธิ" cells={cells((x) => x.net_income)} strong />
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <Row key={i} indent label={`ขั้น ${cols[0].brackets[i]?.range ?? ''}`} cells={cols.map((c) => ({ v: c.brackets[i]?.tax ?? 0 }))} />
                  ))}
                  <Row label="ภาษีเงินได้บุคคลธรรมดารวม" cells={cells((x) => x.pit)} strong tone="warn" />

                  <SectionTitle cols={3}>งบการเงินและภาษีเงินได้นิติบุคคล (ภ.ง.ด.50) — บริษัท</SectionTitle>
                  <Row label="รายได้" cells={cells((x) => x.revenue)} />
                  <Row label="หัก ต้นทุนและค่าใช้จ่าย" cells={cells((x) => x.costs)} indent />
                  <Row label="หัก ค่าตอบแทนกรรมการ" cells={cells((x) => x.director_cost)} indent />
                  <Row label="หัก ค่าสวัสดิการกรรมการ (เบี้ยประกัน)" cells={cells((x) => x.welfare)} indent />
                  <Row label="หัก ค่าภาษีจ่ายแทนกรรมการ" cells={cells((x) => x.tax_cost)} indent />
                  <Row label="กำไรก่อนภาษี" cells={cells((x) => x.profit_before_tax)} strong />
                  <Row label="ภาษีเงินได้นิติบุคคล" cells={cells((x) => x.cit)} tone="warn" />
                  <Row label="กำไรสุทธิหลังภาษี" cells={cells((x) => x.profit_after_tax)} strong />
                  <Row label="เงินปันผล หัก ณ ที่จ่าย 10%" cells={cells((x) => x.dividend_wht)} indent />
                  <Row label="รวมภาษีนิติบุคคล + เงินปันผล" cells={cells((x) => x.cit_with_dividend)} strong tone="warn" />

                  <SectionTitle cols={3}>สรุปผลรวมทั้งปี</SectionTitle>
                  <Row label="รวมภาษีทั้งสิ้น (บุคคล + นิติบุคคล + ปันผล)" cells={cells((x) => x.total_tax)} strong />
                  <Row label="ประหยัดกว่าก่อนวางแผน" cells={cols.map((x) => ({ v: r.before.total_tax - x.total_tax }))} tone="ok" strong />
                  <Row label="เบี้ย + ภาษีที่บริษัทจ่ายออกจริง" cells={cells((x) => x.company_outlay)} />
                  <Row label="ต้นทุนสุทธิของบริษัท (หลังประหยัดภาษีนิติบุคคล)" cells={cols.map((x) => ({ v: r2net(x, r) }))} strong />
                  <Row label="เงินได้สุทธิของกรรมการ (หลังภาษี)" cells={cells((x) => x.director_net)} />
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 leading-4">
              “ต้นทุนสุทธิของบริษัท” = เบี้ย + ภาษีที่บริษัทออกให้ − ภาษีนิติบุคคลที่ประหยัดได้ · ตัวเลขทั้งหมดคำนวณสดจากข้อมูลที่กรอก ไม่มีค่าคงที่
            </p>
          </section>

          <section className="card p-4 sm:p-5">
            <h3 className="text-sm font-bold text-[#475569] mb-2">สรุปหลายปี (จ่ายเบี้ย {r.multi_year.years} ปี)</h3>
            <table className="w-full text-xs tabular-nums">
              <tbody className="[&_td]:py-1.5">
                <tr className="border-b border-dashed"><td className="text-slate-500">เบี้ยประกันรวมทั้งสิ้น</td><td className="text-right">{b0(r.multi_year.premium_total)}</td></tr>
                <tr className="border-b border-dashed"><td className="text-slate-500">ภาษีรวมถ้าไม่วางแผน ({r.multi_year.years} ปี)</td><td className="text-right">{b0(r.multi_year.tax_before_total)}</td></tr>
                <tr className="border-b border-dashed"><td className="text-slate-500">ภาษีรวมเมื่อวางแผน</td><td className="text-right text-emerald-700 font-semibold">{b0(r.multi_year.tax_plan_total)}</td></tr>
                <tr className="border-b border-dashed"><td className="text-slate-500">ภาษีรวมเมื่อบริษัทออกภาษีให้</td><td className="text-right text-amber-700 font-semibold">{b0(r.multi_year.tax_gross_total)}</td></tr>
                <tr className="border-b"><td className="text-slate-600 font-semibold">ประหยัดได้รวม (วางแผน)</td><td className="text-right font-bold text-emerald-700">{b0(r.multi_year.saved_plan_total)}</td></tr>
                <tr><td className="text-slate-600 font-semibold">เงินที่กรรมการได้รับเพิ่ม (เบี้ย {r.multi_year.years} ปี)</td><td className="text-right font-bold">{b0(r.multi_year.premium_total)}</td></tr>
              </tbody>
            </table>
            <div className="grid sm:grid-cols-2 gap-2 mt-3 text-[11px]">
              <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-emerald-800">
                <b>ต้นทุนสุทธิของบริษัท</b> — วางแผน {b0(r.net_cost_plan)} บาท/ปี · ออกภาษีให้ {b0(r.net_cost_gross)} บาท/ปี
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-slate-700">
                <b>กรรมการ</b> — ได้รับความคุ้มครอง {b0(input.premium)} บาท/ปี · เงินได้สุทธิหลังภาษี {b0(r.plan.director_net)} บาท (แบบวางแผน)
              </div>
            </div>
          </section>

          {r.notes.length > 0 && (
            <section className="card p-4 sm:p-5">
              <h3 className="text-sm font-bold text-[#475569] mb-2">ข้อควรรู้จากการคำนวณ</h3>
              <ul className="space-y-1.5">
                {r.notes.map((nt) => (
                  <li key={nt} className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 leading-4">⚠ {nt}</li>
                ))}
              </ul>
            </section>
          )}

          <section className="card p-4 sm:p-5">
            <h3 className="text-sm font-bold text-[#475569] mb-2">เอกสารอ้างอิง</h3>
            <ul className="space-y-1">
              {r.sources.map((s) => <li key={s} className="text-[11px] text-slate-500 leading-4">• {s}</li>)}
            </ul>
            <p className="text-[11px] text-slate-400 mt-3 leading-4">{r.disclaimer}</p>
            <p className="text-[10px] text-slate-400 mt-2">เวอร์ชัน {BUSINESS_SIM_VERSION} · เอนจิน: <code>src/lib/tax/businessSim.ts</code> → computePit / computeCit</p>
          </section>
        </div>
      </div>
    </div>
  );
}

/** ต้นทุนสุทธิของบริษัทของแต่ละคอลัมน์ (ก่อนวางแผน = 0) */
function r2net(row: SimRow, r: ReturnType<typeof computeBusinessSim>): number {
  if (row.key === 'before') return 0;
  return Math.round((row.company_outlay - (r.before.cit - row.cit)) * 100) / 100;
}
