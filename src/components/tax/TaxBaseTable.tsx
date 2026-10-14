'use client';
/**
 * TaxBaseTable.tsx — ฐานภาษีเงินได้บุคคลธรรมดา (ปีภาษีล่าสุด)
 * ดึงขั้น/อัตราภาษีจากเอนจินจริง (TAX_BRACKETS ใน @/lib/tax/thaiPit) — แก้ที่เดียวตารางนี้เปลี่ยนตาม
 * ที่มา: บัญชีอัตราภาษีเงินได้บุคคลธรรมดา ท้ายหมวด 3 ลักษณะ 2 แห่งประมวลรัษฎากร (มาตรา 48)
 *        แก้ไขล่าสุดโดย พ.ร.บ. แก้ไขเพิ่มเติมประมวลรัษฎากร (ฉบับที่ 44) พ.ศ. 2560 (ใช้ตั้งแต่ปีภาษี 2560)
 *        ยกเว้นเงินได้สุทธิ 150,000 บาทแรก ตาม พ.ร.ฎ. (ฉบับที่ 470) พ.ศ. 2551
 */
import { TAX_BRACKETS, DEFAULT_TAX_YEAR } from '@/lib/tax/thaiPit';

const baht0 = (v: number) => v.toLocaleString('th-TH', { maximumFractionDigits: 0 });

/** สีของแต่ละขั้น (อ่อน → เข้ม ตามภาระภาษี) */
const BAND_COLORS = ['#e2e8f0', '#bae6fd', '#7dd3fc', '#38bdf8', '#0ea5e9', '#6366f1', '#4338ca', '#312e81'];
/** เพดานที่ใช้ "แสดง" ความกว้างของขั้นสูงสุด (ขั้นสุดท้ายไม่จำกัดจริง) */
const VISUAL_CAP = 5_000_000;

type Row = {
  index: number; rate: number; from: number; to: number | null;
  bandWidth: number; maxInStep: number | null; cumulative: number | null; rangeLabel: string;
};

function buildRows(): Row[] {
  let lower = 0;
  let cumulative = 0;
  return TAX_BRACKETS.map(([upper, rate], i) => {
    const infinite = !Number.isFinite(upper);
    const width = infinite ? VISUAL_CAP : upper - lower;
    const maxInStep = infinite ? null : width * rate;
    if (maxInStep !== null) cumulative += maxInStep;
    const row: Row = {
      index: i,
      rate,
      from: i === 0 ? 0 : lower + 1,
      to: infinite ? null : upper,
      bandWidth: width,
      maxInStep: maxInStep === null ? null : Math.round(maxInStep),
      cumulative: infinite ? null : Math.round(cumulative),
      rangeLabel: i === 0
        ? `0 – ${baht0(upper)}`
        : `${baht0(lower + 1)} – ${infinite ? 'ขึ้นไป' : baht0(upper)}`,
    };
    lower = upper;
    return row;
  });
}

const ROWS = buildRows();
const TOTAL_WIDTH = ROWS.reduce((s, r) => s + r.bandWidth, 0);
const STEPS = ROWS.length;

export default function TaxBaseTable() {
  return (
    <section className="card overflow-hidden" id="tax-base-table">
      {/* ── หัวเรื่อง ── */}
      <div className="p-5 sm:p-6 border-b border-gray-100 bg-gradient-to-br from-white via-white to-sky-50/60">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-sky-700 bg-sky-50 border border-sky-100 rounded-full px-2.5 py-1">
            Thai PIT Rate Schedule
          </span>
          <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-slate-500 bg-white border border-gray-200 rounded-full px-2.5 py-1">
            ปีภาษี {DEFAULT_TAX_YEAR} · ล่าสุด
          </span>
          <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-slate-500 bg-white border border-gray-200 rounded-full px-2.5 py-1">
            {STEPS} ขั้น · 0–35%
          </span>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-[#475569] mt-3 tracking-tight">
          ฐานภาษีเงินได้บุคคลธรรมดา
        </h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-6 max-w-3xl">
          ขั้นและอัตราตามบัญชีท้ายประมวลรัษฎากร (มาตรา 48) — แก้ไขล่าสุดโดย
          <b className="text-slate-600"> พระราชบัญญัติแก้ไขเพิ่มเติมประมวลรัษฎากร (ฉบับที่ 44) พ.ศ. 2560</b>
          {' '}ใช้ตั้งแต่ปีภาษี 2560 ต่อเนื่องถึงปีภาษี {DEFAULT_TAX_YEAR} และ{' '}
          <b className="text-slate-600">ยกเว้นเงินได้สุทธิ 150,000 บาทแรก</b>
          {' '}ตามพระราชกฤษฎีกา (ฉบับที่ 470) พ.ศ. 2551
        </p>

        {/* สูตรฐานภาษี */}
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          <span className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-slate-600">เงินได้พึงประเมิน (มาตรา 40)</span>
          <span className="text-slate-300">−</span>
          <span className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-slate-600">ค่าใช้จ่าย (เหมา/ตามจริง)</span>
          <span className="text-slate-300">−</span>
          <span className="px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-slate-600">ค่าลดหย่อน</span>
          <span className="text-slate-300">=</span>
          <span className="px-3 py-1.5 rounded-lg bg-[#475569] text-white font-semibold">เงินได้สุทธิ = ฐานภาษี</span>
        </div>
      </div>

      {/* ── แถบภาพรวมขั้นภาษี (สัดส่วนความกว้างของแต่ละช่วงเงินได้สุทธิ) ── */}
      <div className="px-5 sm:px-6 pt-6">
        <div className="flex items-end justify-between mb-2">
          <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-slate-400">Progressive structure</span>
          <span className="text-[10px] text-slate-400">ความกว้าง = ช่วงเงินได้สุทธิ (บาท)</span>
        </div>
        <div className="flex h-14 w-full rounded-xl overflow-hidden border border-gray-100">
          {ROWS.map((r) => (
            <div
              key={`band-${r.index}`}
              title={`${r.rangeLabel} · ${Math.round(r.rate * 100)}%`}
              style={{ width: `${(r.bandWidth / TOTAL_WIDTH) * 100}%`, backgroundColor: BAND_COLORS[r.index] }}
              className="relative flex items-center justify-center group"
            >
              <span className={`text-[10px] sm:text-xs font-bold tabular-nums ${r.index <= 1 ? 'text-slate-500' : 'text-white'}`}>
                {Math.round(r.rate * 100)}%
              </span>
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1.5 text-[10px] text-slate-400 tabular-nums">
          <span>0</span><span>300K</span><span>750K</span><span>2M</span><span>5M ขึ้นไป</span>
        </div>
      </div>

      {/* ── ตารางฐานภาษี ── */}
      <div className="px-5 sm:px-6 pb-2 pt-6 overflow-x-auto">
        <table className="w-full text-sm min-w-[620px]">
          <thead>
            <tr className="text-[10px] uppercase tracking-[0.14em] text-slate-400 border-b border-gray-200">
              <th className="text-left font-semibold py-2 pr-3 w-[38%]">ขั้นเงินได้สุทธิ (บาท)</th>
              <th className="text-right font-semibold py-2 px-3">อัตราภาษี</th>
              <th className="text-right font-semibold py-2 px-3">ภาษีสูงสุดในขั้น</th>
              <th className="text-right font-semibold py-2 pl-3">ภาษีสะสมสูงสุด</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r) => (
              <tr key={`row-${r.index}`} className={`border-b last:border-0 ${r.index % 2 ? 'bg-slate-50/40' : ''}`}>
                <td className="py-2.5 pr-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="hidden sm:block h-2 rounded-full shrink-0"
                      style={{ width: `${Math.max(8, (r.bandWidth / TOTAL_WIDTH) * 220)}px`, backgroundColor: BAND_COLORS[r.index] }}
                    />
                    <span className="tabular-nums text-slate-700 whitespace-nowrap">{r.rangeLabel}</span>
                  </div>
                </td>
                <td className="py-2.5 px-3 text-right">
                  <span className={`inline-block min-w-[52px] text-center px-2 py-0.5 rounded-full text-xs font-bold tabular-nums border ${
                    r.rate === 0 ? 'bg-slate-50 text-slate-500 border-slate-200'
                      : r.rate >= 0.3 ? 'bg-indigo-50 text-indigo-700 border-indigo-100'
                      : 'bg-sky-50 text-sky-700 border-sky-100'}`}>
                    {r.rate === 0 ? 'ยกเว้น' : `${Math.round(r.rate * 100)}%`}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right tabular-nums text-slate-600">
                  {r.maxInStep === null ? 'ไม่จำกัด' : r.maxInStep === 0 ? '—' : baht0(r.maxInStep)}
                </td>
                <td className="py-2.5 pl-3 text-right tabular-nums font-semibold text-[#475569]">
                  {r.cumulative === null ? '—' : baht0(r.cumulative)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── ข้อเท็จจริงสำคัญ ── */}
      <div className="px-5 sm:px-6 pb-6 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { k: 'ยกเว้นภาษี', v: '150,000', d: 'เงินได้สุทธิ 150,000 บาทแรก (พ.ร.ฎ. ฉบับที่ 470/2551)' },
          { k: 'อัตราสูงสุด', v: '35%', d: 'เงินได้สุทธิเกิน 5,000,000 บาทขึ้นไป' },
          { k: 'เกณฑ์ต้องยื่นแบบ', v: '60,000 / 120,000', d: 'เงินได้ทั้งปี (40(1) อย่างเดียว / ประเภทอื่น)' },
          { k: 'ภาษีขั้นต่ำ', v: '0.5%', d: 'ของเงินได้ 40(2)–(8) ถ้าสูงกว่าภาษีขั้นบันได (มาตรา 48(2))' },
        ].map((f) => (
          <div key={f.k} className="rounded-2xl border border-gray-100 bg-white p-4">
            <div className="text-[10px] font-semibold tracking-[0.14em] uppercase text-slate-400">{f.k}</div>
            <div className="text-lg font-bold text-[#475569] tabular-nums mt-0.5">{f.v}</div>
            <div className="text-[11px] text-slate-400 leading-4 mt-1">{f.d}</div>
          </div>
        ))}
      </div>

      <div className="px-5 sm:px-6 pb-6 text-[11px] text-slate-400 leading-5 border-t border-gray-100 pt-4">
        กำหนดเวลายื่นแบบ ภ.ง.ด.90/91: ภายใน 31 มีนาคม ของปีถัดไป (ยื่นออนไลน์ได้ถึง 8 เมษายน) ·
        ภาษีคำนวณจาก "เงินได้สุทธิ" หลังหักค่าใช้จ่ายและค่าลดหย่อนเท่านั้น ·
        ขั้นและอัตราใช้กับเงินได้บุคคลธรรมดาทุกประเภท (มาตรา 40(1)–(8)) ·
        ที่มา: กรมสรรพากร <a className="underline decoration-slate-300 hover:text-sky-700" href="https://www.rd.go.th/59670.html" target="_blank" rel="noreferrer">อัตราภาษีเงินได้บุคคลธรรมดา</a>
        {' '}และ <a className="underline decoration-slate-300 hover:text-sky-700" href="https://www.rd.go.th/59674.html" target="_blank" rel="noreferrer">ตารางสรุปการหักลดหย่อน</a>
      </div>
    </section>
  );
}
