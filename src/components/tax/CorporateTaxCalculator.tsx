'use client';
/**
 * CorporateTaxCalculator.tsx — เครื่องคำนวณภาษีเงินได้นิติบุคคล (ภาษีนิติบุคคล)
 * แสดงในแท็บ "🏢 ภาษีนิติบุคคล" ต่อจากแท็บภาษีบุคคลธรรมดา (หน้า /prospects)
 * ทุกตัวเลขคำนวณสดจาก computeCit() — เอนจินเดียวกับโปรแกรม Python (python/thai_cit_calculator.py)
 * อัตรา/เงื่อนไขอ้างอิงกรมสรรพากร: rd.go.th/841 (นิติบุคคล 20% · SME 300,000 ยกเว้น / 15% / 20%)
 */
import { useMemo, useState } from 'react';
import { computeCit, CIT_LIMITS, CIT_SME_BRACKETS, CIT_STANDARD_RATE, CIT_YEAR, CIT_CALC_VERSION, type CitInput } from '@/lib/tax/thaiCit';

const baht = (v: number) => Number(v || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const baht0 = (v: number) => Number(v || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 });
const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

type Num = number | undefined;

function Money({ label, value, onChange, hint, item }: { label: string; value: Num; onChange: (v: number) => void; hint?: string; item?: string }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-slate-600 mb-1 leading-4">
        {item && <span className="inline-block mr-1 px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-100 text-[10px] text-emerald-700 font-semibold">{item}</span>}
        {label}
      </div>
      <input type="text" inputMode="numeric" placeholder="0"
        value={typeof value === 'number' && value !== 0 ? value.toLocaleString('en-US') : ''}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value.replace(/[^\d.]/g, '')) || 0))}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200" />
      {hint && <div className="text-[11px] text-slate-400 mt-1 leading-4">{hint}</div>}
    </label>
  );
}

const PRESETS: Array<{ label: string; input: CitInput }> = [
  { label: 'SME ร้านค้า กำไร 1.5 ล้าน (ทุน 3 ล้าน)', input: { revenue: 8_000_000, expenses: 6_500_000, capital_paid_up: 3_000_000 } },
  { label: 'บริษัททั่วไป กำไร 8 ล้าน (ทุน 10 ล้าน)', input: { revenue: 50_000_000, expenses: 42_000_000, capital_paid_up: 10_000_000 } },
  { label: 'SME กำไร 3.5 ล้าน (เข้า 3 ขั้น)', input: { revenue: 25_000_000, expenses: 21_500_000, capital_paid_up: 4_000_000 } },
  { label: 'มีขาดทุนยกมา + บริจาค', input: { revenue: 10_000_000, expenses: 9_500_000, loss_carry_forward: 200_000, donations: 100_000, capital_paid_up: 2_000_000 } },
  { label: 'ขาดทุนทั้งปี', input: { revenue: 4_000_000, expenses: 4_500_000, capital_paid_up: 2_000_000 } },
];

export default function CorporateTaxCalculator() {
  const [input, setInput] = useState<CitInput>({ revenue: 8_000_000, expenses: 6_500_000, capital_paid_up: 3_000_000, withholding: 0, pnd51_paid: 0, loss_carry_forward: 0, donations: 0 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const set = (patch: Partial<CitInput>) => setInput((p) => ({ ...p, ...patch }));
  const r = useMemo(() => computeCit(input), [input]);

  async function selftest() {
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/tax/thai-cit?selftest=1', { cache: 'no-store' });
      const j = await res.json();
      if (j?.ok) setMsg(`✓ ตรวจแล้วผ่านทั้ง ${j.passed}/${j.total} กรณี — เว็บให้ผลตรงกับชุดทดสอบมาตรฐาน (ชุดเดียวกับโปรแกรม Python)`);
      else setMsg(`✗ ผ่าน ${j?.passed}/${j?.total} กรณี — ต้องตรวจ: ${(j?.cases || []).filter((c: { passed: boolean }) => !c.passed).map((c: { name: string }) => c.name).join(' · ')}`);
    } catch (e) {
      setMsg(`ตรวจไม่สำเร็จ: ${e instanceof Error ? e.message : 'เชื่อมต่อไม่ได้'}`);
    } finally { setBusy(false); }
  }

  const netColor = r.net_payable > 0.5 ? 'text-rose-600' : r.net_payable < -0.5 ? 'text-emerald-600' : 'text-slate-600';

  return (
    <div className="space-y-4" id="corporate-tax-calculator">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold text-[#475569]">คำนวณภาษีเงินได้นิติบุคคล (ภาษีนิติบุคคล)</h2>
          <span className="text-xs px-2 py-1 rounded-full border bg-white text-slate-500">รอบระยะเวลาบัญชี {CIT_YEAR}</span>
          <span className="text-xs px-2 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700">
            นิติบุคคล {Math.round(CIT_STANDARD_RATE * 100)}% · SME {baht0(CIT_LIMITS.sme_exempt_profit)} แรกยกเว้น / 15% / 20%
          </span>
          <span className="ml-auto flex flex-wrap gap-2">
            <button onClick={selftest} disabled={busy}
              className="px-3 py-2 rounded-full border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700 disabled:opacity-50">
              {busy ? 'กำลังตรวจ…' : '✓ ตรวจความถูกต้อง'}
            </button>
            <button onClick={() => window.print()} className="px-3 py-2 rounded-full border bg-white text-xs font-semibold text-slate-600">🖨 พิมพ์ / บันทึก PDF</button>
            <button onClick={() => setInput({ revenue: 0, expenses: 0, capital_paid_up: 0, withholding: 0, pnd51_paid: 0, loss_carry_forward: 0, donations: 0 })}
              className="px-3 py-2 rounded-full border bg-white text-xs font-semibold text-slate-600">↺ ล้างข้อมูล</button>
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-2 leading-5">
          กรอกเฉพาะ “กำไรสุทธิทางภาษี” — ระบบคิดภาษีตามอัตราที่ถูกต้องให้เอง (ตรวจเกณฑ์ SME จากทุนจดทะเบียนที่ชำระแล้วและรายได้ขายสินค้า/ให้บริการ)
          พร้อมคำนวณ <b>ภ.ง.ด.51</b> ครึ่งปี · หักเครดิตภาษีหัก ณ ที่จ่าย · และสรุปที่ต้องชำระตาม <b>ภ.ง.ด.50</b>
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <span className="text-[11px] text-slate-400 self-center">ตัวอย่างเริ่มต้น:</span>
          {PRESETS.map((p) => (
            <button key={p.label} onClick={() => { setInput(p.input); setMsg(''); }}
              className="px-3 py-1.5 rounded-full border border-gray-200 bg-white text-[11px] text-slate-600 hover:bg-emerald-50">{p.label}</button>
          ))}
        </div>
        {msg && (
          <div className={`mt-3 p-3 rounded-xl text-xs border ${msg.startsWith('✓') ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>{msg}</div>
        )}
      </div>

      <div className="grid lg:grid-cols-3 gap-4 items-start">
        {/* ฝั่งกรอกข้อมูล */}
        <div className="lg:col-span-2 space-y-4">
          <section className="card p-4 sm:p-5">
            <h3 className="text-sm font-bold text-[#475569] mb-3">1) รายได้ – ค่าใช้จ่าย – ทุนจดทะเบียน</h3>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              <Money label="รายได้จากการขายสินค้า/ให้บริการทั้งปี" value={input.revenue} onChange={(v) => set({ revenue: v })}
                hint="ใช้ทดสอบเกณฑ์ SME (≤ 30 ล้านบาท)" />
              <Money label="รายได้อื่น (ดอกเบี้ย เงินปันผล ฯลฯ)" value={input.other_income} onChange={(v) => set({ other_income: v })}
                hint="ไม่นับเป็นรายได้ขายสินค้า/ให้บริการในการทดสอบเกณฑ์ SME" />
              <Money label="ค่าใช้จ่ายที่หักได้ (รวมค่าเสื่อมราคา)" value={input.expenses} onChange={(v) => set({ expenses: v })}
                hint="ค่าใช้จ่ายที่ห้ามหัก ตามมาตรา 65 ตรี อย่านำมารวม" />
              <Money label="ทุนจดทะเบียนที่ชำระแล้ว (วันสุดท้ายของรอบบัญชี)" value={input.capital_paid_up} onChange={(v) => set({ capital_paid_up: v })}
                hint={`เกณฑ์ SME: ไม่เกิน ${baht0(CIT_LIMITS.sme_capital)} บาท`} />
              <Money label="ขาดทุนสะสมยกมา" value={input.loss_carry_forward} onChange={(v) => set({ loss_carry_forward: v })}
                hint={`หักได้ไม่เกินกำไรของรอบนี้ · ยกไปได้ ${CIT_LIMITS.loss_carry_years} รอบระยะเวลาบัญชี`} />
              <Money label="เงินบริจาคที่จ่ายในรอบบัญชี" value={input.donations} onChange={(v) => set({ donations: v })}
                hint={`หักได้ไม่เกิน ${Math.round(CIT_LIMITS.donation_rate * 100)}% ของกำไรสุทธิ (มาตรา 65 ตรี (3))`} />
            </div>
            <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-3 mt-3">
              <Money label="ภาษีหัก ณ ที่จ่ายที่ถูกหักไว้ (เครดิต)" value={input.withholding} onChange={(v) => set({ withholding: v })} hint="1% ขนส่ง · 2% โฆษณา · 3% บริการ · 5% ค่าเช่า" />
              <Money label="ภาษี ภ.ง.ด.51 ที่ชำระไปแล้ว" value={input.pnd51_paid} onChange={(v) => set({ pnd51_paid: v })} hint="ครึ่งปี = ร้อยละ 50 ของภาษีประมาณการ" />
              <label className="flex gap-2 items-start p-3 rounded-xl border border-gray-200 bg-white cursor-pointer">
                <input type="checkbox" checked={!!input.boi_promoted} onChange={(e) => set({ boi_promoted: e.target.checked })} className="mt-0.5" />
                <span className="text-[11px] text-slate-600 leading-4">กิจการได้รับการส่งเสริมการลงทุน (BOI)<br /><span className="text-slate-400">รายได้ที่ยกเว้นตามบัตรส่งเสริมให้แยกออก</span></span>
              </label>
            </div>
          </section>

          <section className="card p-4 sm:p-5">
            <h3 className="text-sm font-bold text-[#475569] mb-3">2) ขั้นการคำนวณ</h3>
            <table className="w-full text-xs tabular-nums">
              <tbody className="[&_td]:py-1.5">
                <tr className="border-b border-dashed"><td className="text-slate-500">รายได้รวม</td><td className="text-right">{baht(r.total_revenue)}</td></tr>
                <tr className="border-b border-dashed"><td className="text-slate-500">หัก ค่าใช้จ่ายที่หักได้</td><td className="text-right text-rose-600">−{baht(r.expenses)}</td></tr>
                <tr className="border-b border-dashed"><td className="text-slate-600">กำไรสุทธิก่อนรายการอื่น</td><td className="text-right">{baht(r.profit_before_loss)}</td></tr>
                {r.loss_carry_forward > 0 && (
                  <tr className="border-b border-dashed"><td className="text-slate-500">หัก ขาดทุนยกมา</td><td className="text-right text-rose-600">−{baht(r.loss_carry_forward)}</td></tr>
                )}
                {r.donations_paid > 0 && (
                  <tr className="border-b border-dashed"><td className="text-slate-500">หัก เงินบริจาค (≤{Math.round(CIT_LIMITS.donation_rate * 100)}% ของกำไรสุทธิ)</td><td className="text-right text-rose-600">−{baht(r.donations_allowed)}</td></tr>
                )}
                <tr className="border-t"><td className="font-semibold text-slate-700 pt-2">กำไรสุทธิทางภาษี (taxable profit)</td><td className="text-right font-semibold pt-2">{baht(r.taxable_profit)}</td></tr>
              </tbody>
            </table>
            <div className={`mt-3 text-[11px] rounded-xl px-3 py-2 border leading-4 ${r.is_sme ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-amber-50 border-amber-100 text-amber-800'}`}>
              {r.sme_reason}
            </div>
            <table className="w-full text-xs tabular-nums mt-3">
              <thead>
                <tr className="text-slate-400 text-left">
                  <th className="py-1 font-semibold">ขั้นกำไรสุทธิ (อัตรา SME)</th>
                  <th className="py-1 text-right font-semibold">คิดจาก</th>
                  <th className="py-1 text-right font-semibold">อัตรา</th>
                  <th className="py-1 text-right font-semibold">ภาษี</th>
                </tr>
              </thead>
              <tbody className="[&_td]:py-1">
                {r.sme_steps.map((s) => (
                  <tr key={s.range} className="border-t">
                    <td>{s.range}</td>
                    <td className="text-right">{baht0(s.amount)}</td>
                    <td className="text-right">{Math.round(s.rate * 100)}%</td>
                    <td className="text-right">{baht0(s.tax)}</td>
                  </tr>
                ))}
                <tr className="border-t"><td colSpan={3}>ภาษีตามอัตรา SME</td><td className="text-right font-semibold">{baht0(r.tax_sme)}</td></tr>
                <tr><td colSpan={3}>ภาษีตามอัตราคงที่ {Math.round(CIT_STANDARD_RATE * 100)}%</td><td className="text-right">{baht0(r.tax_standard)}</td></tr>
                <tr className="border-t"><td colSpan={3} className="font-semibold">ภาษีที่ต้องชำระทั้งปี ({r.better_option})</td><td className="text-right font-semibold">{baht0(r.tax_payable)}</td></tr>
              </tbody>
            </table>
            {r.saving_vs_standard > 0 && (
              <div className="mt-2 text-[11px] text-emerald-800 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
                ใช้สิทธิ SME ประหยัดกว่าอัตราคงที่ 20% อยู่ <b>{baht0(r.saving_vs_standard)} บาท</b> (อัตราที่แท้จริง {pct(r.rate_used)})
              </div>
            )}
          </section>

          <section className="card p-4 sm:p-5">
            <h3 className="text-sm font-bold text-[#475569] mb-3">3) การยื่นแบบและชำระภาษี</h3>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-[11px] min-w-[620px]" id="cit-deadlines">
                <thead>
                  <tr className="text-slate-400 text-left border-b">
                    <th className="py-2 pr-2 font-semibold">แบบ</th>
                    <th className="py-2 pr-2 font-semibold">กำหนดยื่น</th>
                    <th className="py-2 font-semibold">รายละเอียด</th>
                  </tr>
                </thead>
                <tbody>
                  {r.deadlines.map((d) => (
                    <tr key={d.form} className="border-b border-dashed last:border-0 align-top">
                      <td className="py-2 pr-2 font-semibold text-slate-700 whitespace-nowrap">{d.form}</td>
                      <td className="py-2 pr-2 text-slate-600">{d.due}</td>
                      <td className="py-2 text-slate-500 leading-4">{d.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card p-4 sm:p-5">
            <h3 className="text-sm font-bold text-[#475569] mb-2">4) ข้อควรระวังทางภาษี</h3>
            <ul className="space-y-1.5">
              {r.notes.map((nt) => (
                <li key={nt} className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 leading-4">⚠ {nt}</li>
              ))}
            </ul>
          </section>
        </div>

        {/* ฝั่งผลลัพธ์ */}
        <div className="space-y-4 lg:sticky lg:top-4">
          <div className="card p-4 sm:p-5">
            <div className="text-xs text-slate-500">ภ.ง.ด.50 · ภาษีที่ต้องชำระ (หักเครดิต/ภ.ง.ด.51 แล้ว)</div>
            <div className={`text-3xl font-bold mt-1 ${netColor}`}>
              {Math.abs(r.net_payable) > 0.5 ? baht0(Math.abs(r.net_payable)) : '0'}
              <span className="text-sm font-semibold ml-1">บาท</span>
            </div>
            <div className={`text-xs font-semibold mt-1 ${netColor}`}>{r.result}</div>
            <table className="w-full text-xs mt-4 tabular-nums">
              <tbody className="[&_td]:py-1">
                <tr><td className="text-slate-500">กำไรสุทธิทางภาษี</td><td className="text-right">{baht0(r.taxable_profit)}</td></tr>
                <tr><td className="text-slate-500">ภาษีทั้งปี ({r.better_option})</td><td className="text-right">{baht0(r.tax_payable)}</td></tr>
                <tr><td className="text-slate-500">ภ.ง.ด.51 ครึ่งปี (50%)</td><td className="text-right">{baht0(r.half_year_due)}</td></tr>
                {r.withholding > 0 && <tr><td className="text-slate-500">หัก ภาษีหัก ณ ที่จ่าย</td><td className="text-right text-emerald-600">−{baht0(r.withholding)}</td></tr>}
                {r.pnd51_paid > 0 && <tr><td className="text-slate-500">หัก ภ.ง.ด.51 ที่ชำระแล้ว</td><td className="text-right text-emerald-600">−{baht0(r.pnd51_paid)}</td></tr>}
                <tr className="border-t"><td className="font-bold text-slate-700 pt-1">ภ.ง.ด.50 ต้องชำระเพิ่ม</td><td className={`text-right font-bold pt-1 ${netColor}`}>{baht0(Math.max(0, r.net_payable))}</td></tr>
              </tbody>
            </table>
            <div className="mt-3 text-[11px] text-slate-500 leading-4">
              อัตราที่แท้จริง <b>{pct(r.rate_used)}</b> · ขั้นภาษีสูงสุดที่เข้าข่าย <b>{Math.round(r.marginal_rate * 100)}%</b>
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-bold text-[#475569] mb-2">อัตราภาษีนิติบุคคล ({CIT_YEAR})</h3>
            <table className="w-full text-[11px] tabular-nums">
              <tbody className="[&_td]:py-1">
                <tr className="border-b"><td className="text-slate-500">นิติบุคคลทั่วไป (ทุกกำไร)</td><td className="text-right font-semibold">{Math.round(CIT_STANDARD_RATE * 100)}%</td></tr>
                {CIT_SME_BRACKETS.map(([up, rate]) => (
                  <tr key={String(up)} className="border-b last:border-0">
                    <td className="text-slate-500">
                      {up === Number.POSITIVE_INFINITY
                        ? `เกิน ${baht0(CIT_SME_BRACKETS[CIT_SME_BRACKETS.length - 2][0])} บาทขึ้นไป`
                        : `${baht0(up)} บาทแรก`}
                    </td>
                    <td className="text-right">{rate === 0 ? 'ยกเว้น' : `${Math.round(rate * 100)}%`}</td>
                  </tr>
                ))}
                <tr><td colSpan={2} className="text-[10px] text-slate-400 pt-2 leading-4">
                  อัตรา 3 ขั้นใช้เมื่อทุนจดทะเบียนที่ชำระแล้ว ≤ {baht0(CIT_LIMITS.sme_capital)} บาท และรายได้ขายสินค้า/ให้บริการ ≤ {baht0(CIT_LIMITS.sme_revenue)} บาท
                </td></tr>
              </tbody>
            </table>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-bold text-[#475569] mb-2">อ้างอิงและเครื่องมือที่เกี่ยวข้อง</h3>
            <ul className="space-y-1">
              {r.sources.map((s) => <li key={s} className="text-[11px] text-slate-500 leading-4">• {s}</li>)}
            </ul>
            <p className="text-[11px] text-slate-400 mt-3 leading-4">{r.disclaimer}</p>
            <p className="text-[10px] text-slate-400 mt-2">
              เอนจินเวอร์ชัน {CIT_CALC_VERSION} · โปรแกรมคู่กัน (Python): <code>python/thai_cit_calculator.py</code> · ตรวจความถูกต้อง: <code>/api/tax/thai-cit?selftest=1</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
