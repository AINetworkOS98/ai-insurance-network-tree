'use client';
/**
 * TaxTable2569.tsx — "ตารางคำนวณภาษี 2569 (จากโปรแกรมภาษี2569.xls)"
 * ---------------------------------------------------------------------------
 * ดึงสูตรจากไฟล์ Excel ของตัวแทน (ชีต PITrate + คำนวณภาษี) มาแสดงบนเว็บ:
 *   1) อัตราภาษีขั้นบันได 2569 + ภาษีสะสม
 *   2) เพดานค่าใช้จ่าย/ค่าลดหย่อน 2569
 *   3) เครื่องคำนวณ "บริษัทออกภาษีให้ทุกทอด" (gross-up) — วนซ้ำจนลู่เข้า
 *   4) ข้อควรรู้จากการคำนวณ (ข้อผิดพลาดที่พบในไฟล์เดิม + กฎที่ต้องระวัง)
 * เอนจินอัตราภาษี: src/lib/tax/thaiPit.ts (TAX_BRACKETS)
 */
import { useMemo, useState } from 'react';
import { TAX_BRACKETS } from '@/lib/tax/thaiPit';

const b0 = (v: number) => Number(v || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 });
const b2 = (v: number) => Number(v || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** ภาษีขั้นบันไดจากเงินได้สุทธิ (ขั้นสุดท้าย = 35% ไม่มีเพดาน) */
function pit(net: number): number {
  let tax = 0;
  let lower = 0;
  for (const [cap, rate] of TAX_BRACKETS) {
    if (net <= lower) break;
    const upper = Math.min(net, cap);
    tax += (upper - lower) * rate;
    lower = cap;
  }
  return Math.round(tax * 100) / 100;
}

/** แถวตารางขั้น: [ชั้น, ตั้งแต่, ถึง, อัตรา, ภาษีขั้น, ภาษีสะสม] */
function bracketRows() {
  const rows: Array<{ step: number; from: number; to: number | null; rate: number; part: number | null; cum: number | null }> = [];
  let lower = 0;
  let cum = 0;
  let step = 0;
  for (const [cap, rate] of TAX_BRACKETS) {
    step += 1;
    const infinite = !Number.isFinite(cap);
    const part = infinite ? null : (cap - lower) * rate;
    if (part !== null) cum += part;
    rows.push({ step, from: lower, to: infinite ? null : cap, rate, part, cum: infinite ? null : cum });
    lower = cap;
  }
  return rows;
}

type GrossUp = {
  taxNoPremium: number;
  netNoPremium: number;
  firstIncrease: number;
  grossedUp: number;
  finalIncome: number;
  rounds: number;
  history: Array<{ round: number; total: number; net: number; tax: number; increase: number }>;
};

/** บริษัทจ่ายเบี้ย + ภาษีแทนกรรมการ → ภาษีที่จ่ายแทนกลายเป็นเงินได้รอบถัดไป */
function grossUp(income: number, premium: number, deduction: number, maxRounds = 20): GrossUp {
  const netNoPremium = Math.max(0, income - deduction);
  const taxNoPremium = pit(netNoPremium);
  let prev = taxNoPremium;
  let total = income + premium + prev;
  const history: GrossUp['history'] = [];
  for (let i = 1; i <= maxRounds; i += 1) {
    const net = Math.max(0, total - deduction);
    const tax = pit(net);
    const increase = Math.round((tax - prev) * 100) / 100;
    history.push({ round: i, total, net, tax, increase });
    if (Math.abs(tax - prev) < 0.01) { prev = tax; break; }
    prev = tax;
    total = income + premium + prev;
  }
  const last = history[history.length - 1];
  return {
    taxNoPremium,
    netNoPremium,
    firstIncrease: history[0]?.increase ?? 0,
    grossedUp: last?.tax ?? 0,
    finalIncome: last?.total ?? 0,
    rounds: history.length,
    history,
  };
}

const CAPS_2569: Array<[string, string]> = [
  ['ค่าใช้จ่ายเงินได้ 40(1)(2)', '50% ของเงินได้ ไม่เกิน 100,000'],
  ['ลดหย่อนส่วนตัว / คู่สมรสไม่มีเงินได้', '60,000 / 60,000'],
  ['บุตร', '30,000/คน (คนที่ 2+ เกิดตั้งแต่ 2561 = 60,000)'],
  ['อุปการะบิดามารดา / คนพิการ', '30,000 / 60,000 ต่อคน'],
  ['ประกันชีวิต + สุขภาพตนเอง', 'รวมไม่เกิน 100,000 (สุขภาพภายใน 25,000)'],
  ['ประกันสุขภาพบิดามารดา', '15,000/คน'],
  ['ประกันชีวิตแบบบำนาญ', '15% ของเงินได้ และไม่เกิน 200,000'],
  ['กองทุนสำรองเลี้ยงชีพ / กบข.', 'ตามจ่ายจริง (กลุ่มเกษียณรวม ≤ 500,000)'],
  ['RMF / SSF', '30% ของเงินได้ (กลุ่มเกษียณรวม ≤ 500,000)'],
  ['Thai ESG', '30% ของเงินได้ ไม่เกิน 300,000 (นอกกลุ่มเกษียณ)'],
  ['ประกันสังคม ม.33 / กอช.', '10,500 / 30,000'],
  ['ดอกเบี้ยเงินกู้ที่อยู่อาศัย / Solar Rooftop', '100,000 / 200,000'],
  ['เงินบริจาค', 'การศึกษา 2 เท่า · กีฬา 1.5 เท่า · ทั่วไป 1 เท่า — ไม่เกิน 10% และต้องผ่าน e-Donation'],
];

const NOTES: string[] = [
  'ขั้น 30% กว้างถึงเงินได้สุทธิ 5,000,000 บาท ⇒ ภาษีสะสมที่ 5 ล้าน = 1,265,000 บาท (ไฟล์ Excel เดิมพิมพ์ไว้ 965,000 ซึ่งเป็นตัวเลขกฎเดิมที่เพดาน 4 ล้าน)',
  'ไฟล์ Excel เดิมไม่บังคับเพดานลดหย่อน — พิมพ์ประกันชีวิต 150,000 ก็หักเต็ม 100,000 ไม่ได้ เว็บนี้ตัดเพดานให้อัตโนมัติทุกบรรทัด',
  'ค่าใช้จ่ายเงินได้ 40(1)(2) หักได้ 50% แต่ไม่เกิน 100,000 บาท (เพิ่มจากเดิม 60,000)',
  '"ออกภาษีให้ทุกทอด" คือภาษีที่บริษัทจ่ายแทนกลายเป็นเงินได้ของกรรมการในรอบถัดไป ต้องวนซ้ำจนตัวเลขนิ่ง (ปกติ 15–17 ทอด) จึงจะได้ภาษีจริง',
  'ภาษีหัก ณ ที่จ่ายครั้งเดียว (รอบแรก) ไม่เท่ากับภาษีที่ต้องเสียจริงเมื่อออกให้ทุกทอด — ต้องนำส่ง ภ.ง.ด.1 และ ภ.ง.ด.1ก ให้ครบ',
  'LTF หมดสิทธิ์ลดหย่อนแล้ว · RMF ใช้ได้ 30% ของเงินได้ · ประกันสังคมปี 2569 เพดานค่าจ้าง 17,500 บาท/เดือน = 875 บาท/เดือน (10,500/ปี)',
  'เงินบริจาคต้องจ่ายผ่านระบบ e-Donation จึงจะใช้สิทธิลดหย่อนได้',
  'ตัวเลขทั้งหมดคิดจากเงินได้ 40(1)(2) (เงินเดือน/ค่าจ้าง/ค่านายหน้า) เท่านั้น — เงินได้ประเภทอื่นมีหลักหักค่าใช้จ่ายต่างกัน',
];

function Num({ label, value, onChange, hint }: { label: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-slate-600 mb-1 leading-4">{label}</div>
      <input type="text" inputMode="numeric"
        value={value ? value.toLocaleString('en-US') : ''}
        placeholder="0"
        onChange={(e) => onChange(Math.max(0, Number(e.target.value.replace(/[^\d.]/g, '')) || 0))}
        className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200" />
      {hint && <div className="text-[11px] text-slate-400 mt-1 leading-4">{hint}</div>}
    </label>
  );
}

export default function TaxTable2569() {
  const [income, setIncome] = useState(2_500_000);
  const [premium, setPremium] = useState(500_000);
  const [deduction, setDeduction] = useState(160_000);
  const [showRounds, setShowRounds] = useState(false);

  const rows = useMemo(bracketRows, []);
  const g = useMemo(() => grossUp(income, premium, deduction), [income, premium, deduction]);

  return (
    <div className="space-y-4">
      <section className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-[#475569]">🔎 ตารางคำนวณภาษี ปีภาษี 2569</h3>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
            อัตราตาม พ.ร.บ. แก้ไขเพิ่มเติมประมวลรัษฎากร (ฉบับที่ 44) พ.ศ. 2560
          </span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500">
            ชีต PITrate + คำนวณภาษี · เอนจิน src/lib/tax/thaiPit.ts
          </span>
        </div>
        <p className="text-[11px] text-slate-500 mt-2 leading-4">
          สูตรเดียวกับไฟล์ Excel ของตัวแทน แต่ตัดเพดานค่าใช้จ่าย/ลดหย่อนให้อัตโนมัติ และคำนวณ “ออกภาษีให้ทุกทอด” ด้วยการวนซ้ำจนลู่เข้า
        </p>

        <div className="grid lg:grid-cols-2 gap-4 mt-4">
          <div className="overflow-x-auto">
            <div className="text-xs font-semibold text-slate-600 mb-1.5">อัตราภาษีขั้นบันได — ตาม พ.ร.บ. ฉบับที่ 44 พ.ศ. 2560 (ใช้กับปีภาษี 2569)</div>
            <table className="w-full text-[11px] tabular-nums">
              <thead>
                <tr className="bg-[#475569] text-white">
                  <th className="py-1.5 px-2 text-left font-semibold">ขั้น</th>
                  <th className="py-1.5 px-2 text-right font-semibold">ตั้งแต่</th>
                  <th className="py-1.5 px-2 text-right font-semibold">ไม่เกิน</th>
                  <th className="py-1.5 px-2 text-right font-semibold">อัตรา</th>
                  <th className="py-1.5 px-2 text-right font-semibold">ภาษีขั้น</th>
                  <th className="py-1.5 px-2 text-right font-semibold">สะสม</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.step} className="border-b border-dashed last:border-0 odd:bg-slate-50/60">
                    <td className="py-1.5 px-2">{r.step}</td>
                    <td className="py-1.5 px-2 text-right">{b0(r.step === 1 ? 0 : r.from + 1)}</td>
                    <td className="py-1.5 px-2 text-right text-slate-500">{r.to === null ? 'ขึ้นไป' : b0(r.to)}</td>
                    <td className="py-1.5 px-2 text-right">{(r.rate * 100).toFixed(0)}%</td>
                    <td className="py-1.5 px-2 text-right">{r.part === null ? 'ตามส่วนที่เกิน' : b0(r.part)}</td>
                    <td className="py-1.5 px-2 text-right font-medium text-emerald-700">{r.cum === null ? '—' : b0(r.cum)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[10px] text-slate-400 mt-1.5 leading-4">
              ที่มา: บัญชีอัตราภาษีเงินได้ ท้ายประมวลรัษฎากร มาตรา 48 — <b>แก้ไขล่าสุด พ.ร.บ. แก้ไขเพิ่มเติมประมวลรัษฎากร (ฉบับที่ 44) พ.ศ. 2560</b> ใช้บังคับสำหรับเงินได้ประจำปีภาษี 2560 เป็นต้นไป จึงใช้ตารางเดิมต่อเนื่องถึงปีภาษี 2569 · rd.go.th/5938
            </p>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-600 mb-1.5">เพดานค่าใช้จ่าย/ลดหย่อน ปีภาษี 2569</div>
            <ul className="space-y-1 max-h-[260px] overflow-y-auto pr-1">
              {CAPS_2569.map(([k, v]) => (
                <li key={k} className="flex gap-2 text-[11px] leading-4 border-b border-dashed last:border-0 py-1">
                  <span className="text-slate-600 flex-1">{k}</span>
                  <span className="text-slate-500 text-right tabular-nums max-w-[52%]">{v}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="card p-4 sm:p-5">
        <h3 className="text-sm font-bold text-[#475569] mb-1">🧮 เครื่องคำนวณ “บริษัทออกภาษีให้ทุกทอด”</h3>
        <p className="text-[11px] text-slate-500 mb-3 leading-4">
          กรอกเงินได้ของกรรมการ + เบี้ยประกันที่บริษัทจ่ายแทน + ค่าใช้จ่าย&ลดหย่อนรวม → ระบบวนซ้ำภาษีที่จ่ายแทนจนลู่เข้า
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          <Num label="เงินได้พึงประเมิน 40(1)(2)" value={income} onChange={setIncome} hint="เงินเดือน/ค่าจ้าง/ค่านายหน้า" />
          <Num label="เบี้ยประกันที่บริษัทจ่ายแทน" value={premium} onChange={setPremium} />
          <Num label="ค่าใช้จ่าย + ลดหย่อนรวม" value={deduction} onChange={setDeduction} hint="เช่น 100,000 (ค่าใช้จ่าย) + 60,000 (ส่วนตัว)" />
        </div>

        <div className="mt-4 grid sm:grid-cols-2 gap-2 text-xs">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-slate-500 text-[11px]">เงินได้สุทธิ (ยังไม่รวมเบี้ย)</div>
            <div className="font-semibold tabular-nums text-slate-700">{b2(g.netNoPremium)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="text-slate-500 text-[11px]">ภาษีเมื่อไม่มีเบี้ยประกัน</div>
            <div className="font-semibold tabular-nums text-slate-700">{b2(g.taxNoPremium)}</div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="text-amber-700 text-[11px]">ภาษีหัก ณ ที่จ่ายครั้งเดียว (รอบแรก)</div>
            <div className="font-semibold tabular-nums text-amber-800">{b2(g.firstIncrease)}</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
            <div className="text-emerald-700 text-[11px]">ภาษีเมื่อออกให้ทุกทอด (ลู่เข้า)</div>
            <div className="font-bold tabular-nums text-emerald-800 text-base">{b2(g.grossedUp)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <div className="text-slate-500 text-[11px]">เงินได้รวมสุดท้ายที่กรรมการได้รับ</div>
            <div className="font-semibold tabular-nums text-slate-700">{b2(g.finalIncome)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
            <div className="text-slate-500 text-[11px]">ภาระรวมของบริษัท (เบี้ย + ภาษี)</div>
            <div className="font-semibold tabular-nums text-slate-700">{b2(premium + g.grossedUp)}</div>
          </div>
        </div>

        <button onClick={() => setShowRounds((v) => !v)}
          className="mt-3 text-[11px] px-3 py-1.5 rounded-full border bg-white text-slate-600 hover:bg-slate-50">
          {showRounds ? '▲ ซ่อน' : '▼ ดู'}การวนซ้ำ {g.rounds} ทอด
        </button>
        {showRounds && (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[11px] tabular-nums">
              <thead>
                <tr className="bg-slate-100 text-slate-600">
                  <th className="py-1 px-2 text-left">ทอด</th>
                  <th className="py-1 px-2 text-right">เงินได้รวม</th>
                  <th className="py-1 px-2 text-right">เงินได้สุทธิ</th>
                  <th className="py-1 px-2 text-right">ภาษี</th>
                  <th className="py-1 px-2 text-right">เพิ่มขึ้น</th>
                </tr>
              </thead>
              <tbody>
                {g.history.map((h) => (
                  <tr key={h.round} className="border-b border-dashed last:border-0">
                    <td className="py-1 px-2">{h.round}</td>
                    <td className="py-1 px-2 text-right">{b0(h.total)}</td>
                    <td className="py-1 px-2 text-right">{b0(h.net)}</td>
                    <td className="py-1 px-2 text-right">{b2(h.tax)}</td>
                    <td className="py-1 px-2 text-right text-slate-500">{b2(h.increase)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card p-4 sm:p-5">
        <h3 className="text-sm font-bold text-[#475569] mb-2">ข้อควรรู้จากการคำนวณ</h3>
        <ul className="space-y-1.5">
          {NOTES.map((n) => (
            <li key={n} className="text-[11px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 leading-4">
              ⚠ {n}
            </li>
          ))}
        </ul>
        <p className="text-[10px] text-slate-400 mt-3 leading-4">
          ที่มา: ไฟล์ “โปรแกรมภาษี2569.xls” ของตัวแทน (ชีต PITrate / คำนวณภาษี / อัปเดต2569) · ตรวจสูตรด้วย Excel COM แล้วตรงกับไฟล์ทุกคอลัมน์ C–S
        </p>
      </section>
    </div>
  );
}
