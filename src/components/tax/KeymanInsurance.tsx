'use client';
/**
 * KeymanInsurance.tsx — แท็บ "🛡 ประกันคีย์แมน (Keyman)" (ต่อจากแท็บภาษีนิติบุคคล)
 * • ประเมินวงเงินคุ้มครองที่ธุรกิจควรมี (3 วิธี) + เช็กลิสต์เงื่อนไขทางภาษี
 * • ผลทางภาษี: ใช้เอนจินเดิมทั้งสอง — computeCit() ภาษีนิติบุคคล และ computePit() ภาษีบุคคลธรรมดา
 * • หลักเกณฑ์อ้างหนังสือตอบข้อหารือกรมสรรพากร: กค 0706/5249 · 0706/8707 · 0702/9358 · 0811/408 · 0702/10407 · 0706/397
 * ไม่มีตัวเลข hardcode — ทุกค่าคำนวณสดจาก computeKeyman()
 */
import { useMemo, useState } from 'react';
import { computeKeyman, KEYMAN_VERSION, KEYMAN_YEAR, type KeymanInput } from '@/lib/tax/keyman';

const b0 = (v: number) => Number(v || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 });
const b2 = (v: number) => Number(v || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Money({ label, value, onChange, hint }: { label: string; value: number | undefined; onChange: (v: number) => void; hint?: string }) {
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

const PRESETS: Array<{ label: string; input: KeymanInput }> = [
  {
    label: 'SME · ผู้บริหารได้ 2 ล้าน (จ่ายทุกคนตามระเบียบ)',
    input: { profit_per_year: 1_500_000, years_to_replace: 3, successor_cost: 500_000, revenue_at_risk: 500_000, guaranteed_debt: 2_000_000, share_buyout: 3_000_000, premium: 100_000, deductible: true, benefit_to_executive: true, company_revenue: 8_000_000, company_expenses: 6_500_000, company_capital: 3_000_000, executive_income: 2_000_000 },
  },
  {
    label: 'บริษัททั่วไป CIT 20% · ผู้บริหารได้ 1 ล้าน',
    input: { profit_per_year: 8_000_000, years_to_replace: 3, successor_cost: 1_000_000, revenue_at_risk: 2_000_000, guaranteed_debt: 10_000_000, share_buyout: 8_000_000, premium: 100_000, deductible: true, benefit_to_executive: true, company_revenue: 50_000_000, company_expenses: 42_000_000, company_capital: 10_000_000, executive_income: 1_000_000 },
  },
  {
    label: 'จ่ายเฉพาะผู้ถือหุ้นรายเดียว → หักค่าใช้จ่ายไม่ได้',
    input: { profit_per_year: 1_500_000, years_to_replace: 3, successor_cost: 500_000, revenue_at_risk: 500_000, guaranteed_debt: 2_000_000, share_buyout: 3_000_000, premium: 100_000, deductible: false, benefit_to_executive: true, company_revenue: 8_000_000, company_expenses: 6_500_000, company_capital: 3_000_000, executive_income: 2_000_000 },
  },
  {
    label: 'ธุรกิจเริ่มต้น · ผู้บริหารเงินได้ต่ำ',
    input: { profit_per_year: 600_000, years_to_replace: 3, successor_cost: 300_000, revenue_at_risk: 200_000, guaranteed_debt: 1_000_000, share_buyout: 1_000_000, premium: 60_000, deductible: true, benefit_to_executive: true, company_revenue: 5_000_000, company_expenses: 4_400_000, company_capital: 1_000_000, executive_income: 150_000 },
  },
];

export default function KeymanInsurance() {
  const [input, setInput] = useState<KeymanInput>(PRESETS[0].input);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const set = (p: Partial<KeymanInput>) => setInput((prev) => ({ ...prev, ...p }));
  const r = useMemo(() => computeKeyman(input), [input]);

  async function selftest() {
    setBusy(true); setMsg('');
    try {
      const res = await fetch('/api/tax/keyman?selftest=1', { cache: 'no-store' });
      const j = await res.json();
      setMsg(j?.ok
        ? `✓ ตรวจแล้วผ่านทั้ง ${j.passed}/${j.total} กรณี — เว็บให้ผลตรงกับชุดทดสอบมาตรฐาน (ชุดเดียวกับโปรแกรม Python)`
        : `✗ ผ่าน ${j?.passed}/${j?.total} กรณี — ต้องตรวจ: ${(j?.cases || []).filter((c: { passed: boolean }) => !c.passed).map((c: { name: string }) => c.name).join(' · ')}`);
    } catch (e) {
      setMsg(`ตรวจไม่สำเร็จ: ${e instanceof Error ? e.message : 'เชื่อมต่อไม่ได้'}`);
    } finally { setBusy(false); }
  }

  const netColor = r.net_cost <= 0 ? 'text-emerald-600' : 'text-rose-600';

  return (
    <div className="space-y-4" id="keyman-insurance">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] px-2 py-0.5 rounded-full border bg-white text-slate-500">KEYMAN · BUSINESS CONTINUITY</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold">หนังสือตอบข้อหารือ 6 ฉบับ</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full border bg-white text-slate-500">รอบปี {KEYMAN_YEAR}</span>
          <span className="ml-auto flex flex-wrap gap-2">
            <a href="?tab=sim" className="px-3 py-2 rounded-full border border-emerald-600 bg-emerald-600 text-xs font-semibold text-white">📊 เปิดโปรแกรมเปรียบเทียบผลประกอบการ</a>
            <button onClick={selftest} disabled={busy}
              className="px-3 py-2 rounded-full border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700 disabled:opacity-50">
              {busy ? 'กำลังตรวจ…' : '✓ ตรวจความถูกต้อง'}
            </button>
            <button onClick={() => window.print()} className="px-3 py-2 rounded-full border bg-white text-xs font-semibold text-slate-600">🖨 พิมพ์ / บันทึก PDF</button>
          </span>
        </div>
        <h2 className="text-lg font-bold text-[#475569] mt-3">ประกันคีย์แมน (Keyman Insurance)</h2>
        <p className="text-xs text-slate-500 mt-1 leading-5">
          ประกันชีวิตที่ <b>ธุรกิจ</b> ทำกับ <b>บุคคลสำคัญ</b> (กรรมการ · ผู้บริหาร · ผู้ถือหุ้น · ช่างฝีมือตัวหลัก) โดยบริษัทเป็นผู้จ่ายเบี้ยและเป็นผู้รับประโยชน์
          เพื่อให้ธุรกิจเดินต่อได้เมื่อบุคคลนั้นจากไป — นำเงินไปซื้อหุ้นคืนจากทายาท · ชดเชยกำไรที่หายระหว่างหาผู้สืบทอด · ใช้ค้ำสินเชื่อ/ทุนหมุนเวียน
          เครื่องมือนี้ประเมิน <b>วงเงินคุ้มครองที่ควรมี</b> และ <b>ผลทางภาษีจริง</b> (ประหยัดภาษีนิติบุคคล เทียบกับภาระภาษีบุคคลธรรมดาของผู้บริหาร)
        </p>
        <div className="flex flex-wrap gap-2 mt-3">
          <span className="text-[11px] text-slate-400 self-center">ตัวอย่าง:</span>
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
        <div className="lg:col-span-2 space-y-4">
          <section className="card p-4 sm:p-5">
            <h3 className="text-sm font-bold text-[#475569] mb-3">1) ข้อมูลธุรกิจ – บุคคลสำคัญ (ใช้ประเมินวงเงิน)</h3>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              <Money label="กำไรสุทธิของธุรกิจต่อปี (บาท)" value={input.profit_per_year} onChange={(v) => set({ profit_per_year: v })} hint="วิธีที่ 1: ทดแทนกำไรที่หายไป" />
              <Money label="จำนวนปีที่ต้องการทดแทน" value={input.years_to_replace} onChange={(v) => set({ years_to_replace: v })} hint="โดยทั่วไป 3–5 ปี (ช่วงฟื้นตัว/หาผู้สืบทอด)" />
              <Money label="ค่าใช้จ่ายสรรหา/ฝึกผู้สืบทอด" value={input.successor_cost} onChange={(v) => set({ successor_cost: v })} hint="วิธีที่ 2: ต้นทุนทดแทน" />
              <Money label="รายได้ที่คาดว่าจะหายช่วงเปลี่ยนผ่าน" value={input.revenue_at_risk} onChange={(v) => set({ revenue_at_risk: v })} hint="ลูกค้าที่ผูกกับตัวบุคคลนั้น" />
              <Money label="หนี้สินที่บุคคลสำคัญค้ำประกันไว้" value={input.guaranteed_debt} onChange={(v) => set({ guaranteed_debt: v })} hint="วิธีที่ 3: ภาระผูกพัน" />
              <Money label="ภาระซื้อหุ้นคืนจากทายาท" value={input.share_buyout} onChange={(v) => set({ share_buyout: v })} hint="Buy–Sell Agreement" />
            </div>
            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
              <div className="text-[11px] text-emerald-800">วงเงินคุ้มครองที่แนะนำ (ค่าสูงสุดของ 3 วิธี)</div>
              <div className="text-2xl font-bold text-emerald-800 mt-0.5">
                {b0(r.recommended_cover)} <span className="text-sm font-semibold">บาท</span>
              </div>
              <div className="text-[11px] text-emerald-700 mt-1">เลือกตาม: {r.cover_method}{r.premium > 0 ? ` · = ${r.cover_per_premium.toLocaleString('th-TH', { maximumFractionDigits: 1 })} เท่าของเบี้ยประกัน` : ''}</div>
            </div>
            <table className="w-full text-xs tabular-nums mt-3" id="keyman-cover-methods">
              <thead><tr className="text-slate-400 text-left border-b"><th className="py-1 font-semibold">วิธีประเมินวงเงิน</th><th className="py-1 text-right font-semibold">วงเงิน (บาท)</th><th className="py-1 text-right font-semibold">สถานะ</th></tr></thead>
              <tbody className="[&_td]:py-1.5">
                <tr className="border-b border-dashed"><td>ทดแทนกำไร = กำไรสุทธิ × จำนวนปี</td><td className="text-right">{b0(r.profit_need)}</td><td className="text-right">{r.profit_need === r.recommended_cover && r.profit_need > 0 ? '★ ใช้' : ''}</td></tr>
                <tr className="border-b border-dashed"><td>ต้นทุนทดแทน = สรรหาผู้สืบทอด + รายได้ที่หายไป</td><td className="text-right">{b0(r.replacement_need)}</td><td className="text-right">{r.replacement_need === r.recommended_cover && r.replacement_need > 0 ? '★ ใช้' : ''}</td></tr>
                <tr><td>ภาระผูกพัน = หนี้ค้ำประกัน + ซื้อหุ้นคืนจากทายาท</td><td className="text-right">{b0(r.obligation_need)}</td><td className="text-right">{r.obligation_need === r.recommended_cover && r.obligation_need > 0 ? '★ ใช้' : ''}</td></tr>
              </tbody>
            </table>
          </section>

          <section className="card p-4 sm:p-5">
            <h3 className="text-sm font-bold text-[#475569] mb-3">2) ผลทางภาษีของเบี้ยประกัน (บริษัท จ่าย · ใครได้อะไร)</h3>
            <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
              <Money label="เบี้ยประกันที่บริษัทจ่าย/ปี" value={input.premium} onChange={(v) => set({ premium: v })} hint="ดูผลประหยัดภาษีนิติบุคคลด้านล่าง" />
              <Money label="เงินได้ประจำปีของบุคคลสำคัญ" value={input.executive_income} onChange={(v) => set({ executive_income: v })} hint="ใช้คิดภาษีเงินได้บุคคลธรรมดา 40(1)" />
              <Money label="รายได้ของบริษัท/ปี" value={input.company_revenue} onChange={(v) => set({ company_revenue: v })} hint="ใช้ทดสอบเกณฑ์ SME" />
              <Money label="ค่าใช้จ่ายของบริษัท/ปี" value={input.company_expenses} onChange={(v) => set({ company_expenses: v })} hint="ก่อนรวมเบี้ยประกันคีย์แมน" />
              <Money label="ทุนจดทะเบียนที่ชำระแล้ว" value={input.company_capital} onChange={(v) => set({ company_capital: v })} hint="เกณฑ์ SME: ไม่เกิน 5 ล้านบาท" />
              <div className="space-y-2">
                <label className="flex gap-2 items-start p-3 rounded-xl border border-gray-200 bg-white cursor-pointer">
                  <input type="checkbox" checked={input.deductible !== false} onChange={(e) => set({ deductible: e.target.checked })} className="mt-0.5" />
                  <span className="text-[11px] text-slate-600 leading-4">จ่ายให้กรรมการ/พนักงาน <b>ทุกคนเป็นการทั่วไปตามระเบียบ</b><br /><span className="text-slate-400">ถ้าไม่ติ๊ก = จ่ายเฉพาะราย → หักค่าใช้จ่ายไม่ได้ (มาตรา 65 ตรี (3))</span></span>
                </label>
                <label className="flex gap-2 items-start p-3 rounded-xl border border-gray-200 bg-white cursor-pointer">
                  <input type="checkbox" checked={input.benefit_to_executive !== false} onChange={(e) => set({ benefit_to_executive: e.target.checked })} className="mt-0.5" />
                  <span className="text-[11px] text-slate-600 leading-4">เบี้ยถือเป็น <b>เงินได้ 40(1)/(2) ของกรรมการ-พนักงาน</b><br /><span className="text-slate-400">ตามแนววินิจฉัยกรมสรรพากร (ต้องนำไปยื่น ภ.ง.ด.90/91)</span></span>
                </label>
                <label className="flex gap-2 items-start p-3 rounded-xl border border-gray-200 bg-white cursor-pointer">
                  <input type="checkbox" checked={input.company_pays_exec_tax !== false} onChange={(e) => set({ company_pays_exec_tax: e.target.checked })} className="mt-0.5" />
                  <span className="text-[11px] text-slate-600 leading-4">บริษัท <b>ออกภาษีเงินได้บุคคลธรรมดาให้</b> ด้วย<br /><span className="text-slate-400">คำนวณเป็นทอด ๆ จนไม่มีภาษีต้องออกแทนอีก (ป. 96/2543 ข้อ 1(7),(8))</span></span>
                </label>
              </div>
            </div>
            <table className="w-full text-xs tabular-nums mt-3" id="keyman-tax-effect">
              <tbody className="[&_td]:py-1.5">
                <tr className="border-b border-dashed"><td className="text-slate-500">ภาษีเงินได้นิติบุคคล — ก่อนหักเบี้ย</td><td className="text-right">{b0(r.cit_before)}</td></tr>
                <tr className="border-b border-dashed"><td className="text-slate-500">ภาษีเงินได้นิติบุคคล — หลังหักเบี้ย {input.deductible !== false ? '' : '(หักไม่ได้)'}</td><td className="text-right">{b0(r.cit_after)}</td></tr>
                <tr className="border-b"><td className="font-semibold text-emerald-700">บริษัทประหยัดภาษีนิติบุคคล</td><td className="text-right font-semibold text-emerald-700">−{b2(r.cit_saving)}</td></tr>
                <tr className="border-b border-dashed"><td className="text-slate-500">ภาษีเงินได้บุคคลธรรมดาของบุคคลสำคัญ — ก่อน</td><td className="text-right">{b0(r.pit_before)}</td></tr>
                <tr className="border-b border-dashed"><td className="text-slate-500">ภาษีเงินได้บุคคลธรรมดาของบุคคลสำคัญ — หลังได้รับเบี้ยเป็นเงินได้</td><td className="text-right">{b0(r.pit_after)}</td></tr>
                <tr className="border-b"><td className="font-semibold text-rose-600">ภาระภาษีบุคคลธรรมดาเพิ่มขึ้น</td><td className="text-right font-semibold text-rose-600">+{b2(r.exec_tax_increase)}</td></tr>
                <tr><td className="font-semibold text-slate-700 pt-2">ต้นทุนภาษีสุทธิ = เบี้ย − ประหยัดนิติบุคคล + ภาษีบุคคลธรรมดาเพิ่ม</td><td className={`text-right font-semibold pt-2 ${netColor}`}>{b2(r.net_cost)}</td></tr>
              </tbody>
            </table>
            <ul className="mt-3 space-y-1.5">
              {r.notes.map((nt) => <li key={nt} className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 leading-4">⚠ {nt}</li>)}
            </ul>
          </section>

          <section className="card p-4 sm:p-5" id="keyman-grossup">
            <h3 className="text-sm font-bold text-[#475569] mb-1">2.1) บริษัทออกภาษีให้ — คำนวณเป็นทอด ๆ (Gross-up)</h3>
            <p className="text-[11px] text-slate-500 mb-3 leading-4">
              ตาม<b>คำสั่งกรมสรรพากรที่ ป. 96/2543</b> ข้อ 1(7),(8): <i>“ให้นำเงินค่าภาษีที่นายจ้างออกแทนให้ไปรวมกับเงินเดือนหรือค่าจ้างที่ลูกจ้างได้รับในปีนั้น
              แล้วคำนวณภาษีตามเกณฑ์ในมาตรา 48 (1) … จนกว่าจะไม่มีเงินค่าภาษีที่นายจ้างต้องออกแทนให้อีก”</i>{' '}
              และ<b>มาตรา 39</b> นับ “เงินค่าภาษีอากรที่ผู้จ่ายเงินหรือผู้อื่นออกแทนให้” เป็นเงินได้พึงประเมินด้วย — ภาษีที่บริษัทออกให้จึงหักเป็นรายจ่ายได้ (ไม่ต้องห้าม มาตรา 65 ตรี (6) ตาม กค 0811/408)
            </p>
            {input.company_pays_exec_tax === false ? (
              <div className="text-[11px] text-slate-500 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2">
                ปิดการคำนวณ “ออกภาษีให้” อยู่ — ติ๊กที่ช่องในหัวข้อ 2 เพื่อให้ระบบคำนวณภาษีทอดต่าง ๆ
              </div>
            ) : (
              <>
                <div className="grid sm:grid-cols-3 gap-3 mb-3">
                  <div className="rounded-xl border border-rose-100 bg-rose-50 p-3">
                    <div className="text-[11px] text-rose-700">ภาษีที่บริษัทต้องออกให้ทั้งสิ้น</div>
                    <div className="text-xl font-bold text-rose-700">{b0(r.gu_tax_borne)} บาท</div>
                    <div className="text-[10px] text-rose-600 mt-0.5">บรรจบใน {r.gu_rounds} ทอด · ขั้นภาษีสูงสุด {Math.round(r.gu_marginal_rate * 100)}%</div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-[11px] text-slate-500">บริษัทจ่ายจริงทั้งปี (เบี้ย + ภาษี)</div>
                    <div className="text-xl font-bold text-slate-700">{b0(r.gu_total_outlay)} บาท</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">เบี้ย {b0(r.premium)} + ภาษี {b0(r.gu_tax_borne)}</div>
                  </div>
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                    <div className="text-[11px] text-emerald-700">หักได้ทั้งเบี้ย+ภาษี → ประหยัดภาษีนิติบุคคล</div>
                    <div className="text-xl font-bold text-emerald-700">{b0(r.gu_cit_saving)} บาท</div>
                    <div className="text-[10px] text-emerald-600 mt-0.5">ต้นทุนสุทธิของบริษัท {b0(r.gu_net_cost)} บาท/ปี</div>
                  </div>
                </div>
                <div className="overflow-x-auto -mx-1 px-1">
                  <table className="w-full text-[11px] min-w-[560px] tabular-nums" id="keyman-grossup-rounds">
                    <thead>
                      <tr className="text-slate-400 text-left border-b">
                        <th className="py-1.5 pr-2 font-semibold">ทอดที่</th>
                        <th className="py-1.5 pr-2 font-semibold">เงินได้ของกรรมการ/พนักงาน (รวมภาษีที่ออกให้ทอดก่อน ๆ)</th>
                        <th className="py-1.5 pr-2 text-right font-semibold">ภาษีที่คำนวณได้</th>
                        <th className="py-1.5 text-right font-semibold">ต้องออกให้เพิ่ม</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.gu_rounds_detail.slice(0, 12).map((g) => (
                        <tr key={g.round} className="border-b border-dashed last:border-0">
                          <td className="py-1 pr-2 text-slate-500">ทอด {g.round}</td>
                          <td className="py-1 pr-2">{b2(g.income_with_tax)}</td>
                          <td className="py-1 pr-2 text-right">{b2(g.tax)}</td>
                          <td className={`py-1 text-right ${g.increase <= 0.01 ? 'text-emerald-600 font-semibold' : 'text-rose-600'}`}>
                            {g.increase <= 0.01 ? '✓ ไม่มีอีกแล้ว' : `+${b2(g.increase)}`}
                          </td>
                        </tr>
                      ))}
                      {r.gu_rounds_detail.length > 12 && (
                        <tr><td colSpan={4} className="py-1 text-slate-400">… แสดง 12 ทอดแรกจากทั้งหมด {r.gu_rounds} ทอด (บรรจบเมื่อไม่มีภาษีต้องออกให้เพิ่ม)</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="mt-3 grid sm:grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-slate-700">
                    <b>กรรมการ/พนักงาน</b> ได้รับประโยชน์เต็มมูลค่าเบี้ย {b0(r.gu_employee_gets - (input.executive_income || 0))} บาท
                    (ภาษีส่วนตัวบริษัทออกให้ทั้งหมด) · แต่<b>ต้องนำเงินได้รวม {b0(r.gu_employee_declared_income)} บาท</b> ไปยื่น ภ.ง.ด.90/91
                  </div>
                  <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-slate-700">
                    <b>บริษัท</b> จ่ายจริง {b0(r.gu_total_outlay)} บาท → หักเป็นค่าใช้จ่ายได้ทั้งจำนวน → รับรู้เป็นค่าใช้จ่ายหลังภาษี {b0(r.gu_net_cost)} บาท/ปี
                    (ภาษีนิติบุคคลลดลง {b0(r.gu_cit_saving)} บาท)
                  </div>
                </div>
              </>
            )}
          </section>

          <section className="card p-4 sm:p-5" id="keyman-beneficiary">
            <h3 className="text-sm font-bold text-[#475569] mb-1">2.2) ผู้รับผลประโยชน์ — เลือกแบบไหน เสียภาษีอย่างไร</h3>
            <p className="text-[11px] text-slate-500 mb-3 leading-4">
              เงินค่าสินไหมจะไปถึง “มือใคร” ขึ้นอยู่กับผู้รับประโยชน์ในกรมธรรม์ และ<b>ภาษีต่างกันคนละมาตรา</b>:
              บริษัทเป็นผู้รับ → สินไหมเป็น<b>รายได้</b>ของบริษัท (มาตรา 65) · ครอบครัว/ทายาทเป็นผู้รับ → เงินได้จากการประกันภัย<b>ยกเว้น</b>ภาษีเงินได้บุคคลธรรมดา (มาตรา 42(13))
            </p>
            <div className="grid sm:grid-cols-3 gap-3 mb-3">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <div className="text-[11px] text-slate-500">บริษัทได้จริงหลังภาษีนิติบุคคล (วงเงิน {b0(r.bn_claim)})</div>
                <div className="text-xl font-bold text-slate-700">{b0(r.bn_net_to_company)} บาท</div>
                <div className="text-[10px] text-slate-400 mt-0.5">หักภาษีจากสินไหม {b0(r.bn_cit_on_claim)} บาท</div>
              </div>
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                <div className="text-[11px] text-emerald-700">ทายาทได้เต็ม (ยกเว้นภาษี มาตรา 42(13))</div>
                <div className="text-xl font-bold text-emerald-700">{b0(r.bn_net_to_family)} บาท</div>
                <div className="text-[10px] text-emerald-600 mt-0.5">แต่เงินไม่เข้าระบบธุรกิจ</div>
              </div>
              <div className="rounded-xl border border-amber-100 bg-amber-50 p-3">
                <div className="text-[11px] text-amber-700">วงเงินที่ต้องทำ เพื่อให้บริษัทได้เงินพอภาระผูกพัน {b0(r.bn_obligation)}</div>
                <div className="text-xl font-bold text-amber-700">{b0(r.bn_cover_needed)} บาท</div>
                <div className="text-[10px] text-amber-600 mt-0.5">
                  {r.bn_shortfall_company > 0 ? `ถ้าทำแค่ ${b0(r.bn_claim)} จะขาด ${b0(r.bn_shortfall_company)} บาท` : 'วงเงินปัจจุบันเพียงพอแล้ว'}
                </div>
              </div>
            </div>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-[11px] min-w-[820px]" id="keyman-beneficiary-table">
                <thead>
                  <tr className="text-slate-400 text-left border-b">
                    <th className="py-2 pr-2 font-semibold">ผู้รับผลประโยชน์</th>
                    <th className="py-2 pr-2 font-semibold">ภาษีที่เกี่ยวข้อง</th>
                    <th className="py-2 pr-2 text-right font-semibold">เงินที่ได้</th>
                    <th className="py-2 pr-2 font-semibold">ใช้กับธุรกิจ</th>
                    <th className="py-2 font-semibold">ข้อควรทำ / ข้อควรระวัง</th>
                  </tr>
                </thead>
                <tbody>
                  {r.bn_rows.map((row) => (
                    <tr key={row.key} className="border-b border-dashed last:border-0 align-top">
                      <td className="py-2 pr-2 text-slate-700 font-semibold">{row.who}</td>
                      <td className="py-2 pr-2 text-slate-600">{row.tax}</td>
                      <td className="py-2 pr-2 text-right tabular-nums">{b0(row.net)}</td>
                      <td className="py-2 pr-2">
                        <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${row.business_use.startsWith('ใช้ได้เต็ม') ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : row.business_use.startsWith('ใช้ได้บางส่วน') ? 'bg-amber-50 text-amber-700 border border-amber-100' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}>
                          {row.business_use}
                        </span>
                      </td>
                      <td className="py-2 text-slate-600">{row.note}<div className="text-[10px] text-slate-400 mt-0.5">อ้างอิง: {row.refs}</div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-3 grid sm:grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-slate-700">
                <b>ตามหลักการประกันชีวิต</b> — ต้อง <b>ระบุชื่อ "ผู้รับประโยชน์" ให้ชัดเจน</b> (และควรระบุ <b>ผู้รับประโยชน์สำรอง</b> ด้วย) ·
                ผู้เอาประกันขอ<b>เปลี่ยนผู้รับประโยชน์ได้</b>ตลอดอายุกรมธรรม์ (เว้นแต่ผู้รับประโยชน์คนเดิมได้ถือเอาประโยชน์ตามกรมธรรม์แล้วและได้รับมอบกรมธรรม์ไป) ·
                หาก<b>ไม่ระบุชื่อ</b> หรือผู้รับประโยชน์เสียชีวิตก่อน/พร้อมกับผู้เอาประกัน เงินจะ<b>ตกเป็นกองมรดก</b>ของผู้เอาประกัน ต้องผ่านการจัดการมรดก
              </div>
              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-slate-700">
                <b>ตามหลักเกณฑ์สรรพากร</b> — บริษัทซื้อประกันให้บุคคลสำคัญ ถือว่าบริษัทมี<b>ส่วนได้เสีย</b>และเป็นผู้เอาประกันภัยได้ ·
                จ่ายเบี้ยให้กรรมการ/พนักงาน<b>ทุกคนเป็นการทั่วไปตามระเบียบ</b> → หักค่าใช้จ่ายได้ (ไม่ต้องห้าม 65 ตรี (3),(13)) ·
                สินไหมที่ทายาทรับ <b>ยกเว้นภาษีเงินได้บุคคลธรรมดา มาตรา 42(13)</b> · สินไหมที่บริษัทรับเป็น<b>รายได้</b>และเงินที่ซื้อหุ้นคืนเป็น<b>รายจ่ายลงทุน หักไม่ได้ (65 ตรี (5))</b>
              </div>
            </div>
            <p className="text-[10px] text-slate-400 mt-2 leading-4">
              หมายเหตุเรื่องภาษีการรับมรดก (พ.ร.บ.ภาษีการรับมรดก พ.ศ. 2558): ภาษีเกิดเมื่อมรดกที่ทายาทแต่ละคนได้รับจากเจ้ามรดกแต่ละราย<b>รวมกันเกิน 100 ล้านบาท</b> เสียเฉพาะส่วนที่เกิน —
              สินไหมประกันชีวิตที่จ่ายตรงให้ผู้รับประโยชน์ที่ระบุชื่อโดยทั่วไปไม่นำมารวมเป็นทรัพย์มรดก แต่<b>หากเป็นกรณีบริษัท/ผู้อื่นเป็นผู้ชำระเบี้ยแทน</b> ควรให้ที่ปรึกษาตรวจข้อเท็จจริงกับสำนักงานสรรพากรก่อนวางแผน
            </p>
          </section>

          <section className="card p-4 sm:p-5">
            <h3 className="text-sm font-bold text-[#475569] mb-3">3) หลักเกณฑ์ภาษี แยกตามสถานการณ์ (จากหนังสือตอบข้อหารือ)</h3>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-[11px] min-w-[720px]" id="keyman-rules">
                <thead>
                  <tr className="text-slate-400 text-left border-b">
                    <th className="py-2 pr-2 font-semibold">สถานการณ์</th>
                    <th className="py-2 pr-2 font-semibold">หักค่าใช้จ่ายบริษัท</th>
                    <th className="py-2 pr-2 font-semibold">ใครมีเงินได้</th>
                    <th className="py-2 font-semibold">ผลประโยชน์/สินไหม</th>
                  </tr>
                </thead>
                <tbody>
                  {r.rules.map((ru) => (
                    <tr key={ru.situation} className="border-b border-dashed last:border-0 align-top">
                      <td className="py-2 pr-2 text-slate-700 font-semibold">{ru.situation}<div className="text-[10px] text-slate-400 font-normal mt-0.5">อ้างอิง: {ru.source}</div></td>
                      <td className="py-2 pr-2 text-slate-600">{ru.deduct}</td>
                      <td className="py-2 pr-2 text-slate-600">{ru.income}</td>
                      <td className="py-2 text-slate-600">{ru.claim}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card p-4 sm:p-5">
            <h3 className="text-sm font-bold text-[#475569] mb-2">4) เช็กลิสต์ก่อนทำประกันคีย์แมน (กันโดนปรับ)</h3>
            <ul className="space-y-1.5">
              {r.checklist.map((c) => (
                <li key={c.item} className={`text-[11px] rounded-lg px-2 py-1.5 leading-4 border ${c.ok ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-rose-50 border-rose-100 text-rose-800'}`}>
                  {c.ok ? '✓' : '✗'} {c.item}
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="space-y-4 lg:sticky lg:top-4">
          <div className="card p-4 sm:p-5">
            <div className="text-xs text-slate-500">วงเงินคุ้มครองที่แนะนำ</div>
            <div className="text-3xl font-bold text-[#475569] mt-1">{b0(r.recommended_cover)}<span className="text-sm font-semibold ml-1">บาท</span></div>
            <div className="text-[11px] text-slate-400 mt-1">{r.cover_method}</div>
            <div className="mt-4 pt-3 border-t">
              <div className="text-xs text-slate-500">เบี้ยประกันต่อปี</div>
              <div className="text-lg font-bold text-slate-700">{b0(r.premium)} บาท</div>
              <div className="text-xs text-slate-500 mt-2">ต้นทุนภาษีสุทธิ/ปี</div>
              <div className={`text-xl font-bold ${netColor}`}>{b0(r.net_cost)} บาท</div>
              <div className={`text-[11px] font-semibold mt-1 ${netColor}`}>{r.result}</div>
            </div>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-bold text-[#475569] mb-2">สรุปผลทางภาษี</h3>
            <table className="w-full text-[11px] tabular-nums">
              <tbody className="[&_td]:py-1">
                <tr className="border-b"><td className="text-slate-500">ประหยัดภาษีนิติบุคคล</td><td className="text-right text-emerald-700 font-semibold">{b0(r.cit_saving)}</td></tr>
                <tr className="border-b"><td className="text-slate-500">ภาษีบุคคลธรรมดาเพิ่ม</td><td className="text-right text-rose-600 font-semibold">{b0(r.exec_tax_increase)}</td></tr>
                <tr><td className="text-slate-600 font-semibold">ต้นทุนสุทธิ</td><td className="text-right font-semibold">{b0(r.net_cost)}</td></tr>
              </tbody>
            </table>
            <p className="text-[10px] text-slate-400 mt-2 leading-4">
              ผลทางภาษีอ้างเอนจินเดียวกับแท็บ “ภาษีนิติบุคคล” และ “ภาษีบุคคลธรรมดา” ของหน้านี้ จึงเทียบเลขกันได้ทันที
            </p>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-bold text-[#475569] mb-2">กรณีบริษัทออกภาษีให้ (ทอด ๆ)</h3>
            <table className="w-full text-[11px] tabular-nums">
              <tbody className="[&_td]:py-1">
                <tr className="border-b"><td className="text-slate-500">เบี้ยประกัน/ปี</td><td className="text-right">{b0(r.premium)}</td></tr>
                <tr className="border-b"><td className="text-slate-500">ภาษีที่บริษัทออกให้ ({r.gu_rounds} ทอด)</td><td className="text-right text-rose-600 font-semibold">{b0(r.gu_tax_borne)}</td></tr>
                <tr className="border-b"><td className="text-slate-600 font-semibold">จ่ายจริงทั้งปี</td><td className="text-right font-semibold">{b0(r.gu_total_outlay)}</td></tr>
                <tr className="border-b"><td className="text-slate-500">ประหยัดภาษีนิติบุคคล</td><td className="text-right text-emerald-700">−{b0(r.gu_cit_saving)}</td></tr>
                <tr><td className="text-slate-700 font-semibold">ต้นทุนสุทธิของบริษัท</td><td className="text-right font-bold">{b0(r.gu_net_cost)}</td></tr>
              </tbody>
            </table>
            <p className="text-[10px] text-slate-400 mt-2 leading-4">
              วิธีคำนวณตามคำสั่งกรมสรรพากรที่ ป. 96/2543 ข้อ 1(7),(8) — นำภาษีที่ออกให้ไปรวมเป็นเงินได้แล้วคำนวณซ้ำจนไม่มีภาษีต้องออกเพิ่ม
            </p>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-bold text-[#475569] mb-2">ผู้รับผลประโยชน์ (Beneficiary)</h3>
            <table className="w-full text-[11px] tabular-nums">
              <tbody className="[&_td]:py-1">
                <tr className="border-b"><td className="text-slate-500">วงเงินคุ้มครอง</td><td className="text-right">{b0(r.bn_claim)}</td></tr>
                <tr className="border-b"><td className="text-slate-500">บริษัทได้หลังภาษีนิติบุคคล</td><td className="text-right font-semibold">{b0(r.bn_net_to_company)}</td></tr>
                <tr className="border-b"><td className="text-slate-500">ทายาทได้ (ยกเว้นภาษี 42(13))</td><td className="text-right text-emerald-700 font-semibold">{b0(r.bn_net_to_family)}</td></tr>
                <tr className="border-b"><td className="text-slate-500">ภาระผูกพันที่ต้องใช้เงิน</td><td className="text-right">{b0(r.bn_obligation)}</td></tr>
                <tr className="border-b"><td className="text-slate-500">วงเงินที่ต้องทำ (ให้บริษัทพอใช้)</td><td className="text-right font-semibold text-amber-700">{b0(r.bn_cover_needed)}</td></tr>
                <tr><td className="text-slate-700 font-semibold">เงินที่ยังขาด</td><td className="text-right font-bold text-rose-600">{b0(r.bn_shortfall_company)}</td></tr>
              </tbody>
            </table>
            <p className="text-[10px] text-slate-400 mt-2 leading-4">
              ถ้าต้องการให้ <b>บริษัท</b> ได้เงินหลังภาษีครบตามภาระผูกพัน ต้องทำวงเงินสูงกว่าภาระผูกพัน เพราะสินไหมเป็นรายได้ที่ต้องเสียภาษีนิติบุคคลก่อนนำไปใช้
            </p>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-bold text-[#475569] mb-2">เอกสารอ้างอิง (กรมสรรพากร)</h3>
            <ul className="space-y-1">
              {r.sources.map((s) => <li key={s} className="text-[11px] text-slate-500 leading-4">• {s}</li>)}
            </ul>
            <p className="text-[11px] text-slate-400 mt-3 leading-4">{r.disclaimer}</p>
            <p className="text-[10px] text-slate-400 mt-2">
              เวอร์ชัน {KEYMAN_VERSION} · โปรแกรมคู่กัน (Python): <code>python/keyman_insurance.py</code> · ตรวจความถูกต้อง: <code>/api/tax/keyman?selftest=1</code>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
