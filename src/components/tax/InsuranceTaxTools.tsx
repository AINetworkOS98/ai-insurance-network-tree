'use client';
/**
 * InsuranceTaxTools.tsx — ประกันลดหย่อนภาษี (แสดงบนสุดของแท็บคำนวณภาษี)
 * ---------------------------------------------------------------------------
 * ปุ่มเลือก 3 แบบ: ประกันชีวิตแบบสะสมทรัพย์ (ใบแนบ ข้อ 7.1) · ประกันชีวิตแบบบำนาญ (ข้อ 7.3)
 *                 · ประกันสุขภาพ (ข้อ 7.2)
 * ทุกตัวเลขคำนวณสดจาก computePit() ตัวเดียวกับโปรแกรมคำนวณ (ไม่ hardcode)
 * เงื่อนไข/เพดานอ้างจากคำชี้แจงการกรอก ภ.ง.ด.90 ปีภาษี 2568 ข้อ 7.1–7.6 + ประกาศอธิบดีฯ ฉบับที่ 301
 */
import { useMemo, useState } from 'react';
import { computePit, DEFAULT_TAX_YEAR, LIM, type PitPerson, type PitIncomeItem } from '@/lib/tax/thaiPit';

const baht0 = (v: number) => Number(v || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 });
const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

const LIFE = LIM.life_insurance;            // 100,000 (ข้อ 7.1)
const HEALTH = LIM.health_insurance;        // 25,000 (ข้อ 7.2)
const COMBINED = LIM.life_health_combined;  // 100,000 (7.1 + 7.2)
const PENSION = LIM.pension_life;           // 200,000 (ข้อ 7.3)
const RETIRE_CAP = LIM.retirement_cap;      // 500,000 (วงเงินกลุ่มเกษียณ)

type Key = 'savings' | 'pension' | 'health';

type Tab = {
  key: Key;
  label: string;
  item: string;              // เลขข้อในใบแนบ
  badge: string;
  defaultPremium: number;
  capText: string;
  rules: string[];
  nuance: string;
};

const TABS: Tab[] = [
  {
    key: 'savings',
    label: '🛡 ประกันชีวิตแบบสะสมทรัพย์',
    item: '7.1',
    badge: 'ใบแนบ ข้อ 7.1',
    defaultPremium: LIFE,
    capText: `ลดหย่อนได้ตามที่จ่ายจริง แต่ไม่เกิน ${baht0(LIFE)} บาท/ปี`,
    rules: [
      `เพดาน: ตามที่จ่ายจริง แต่ไม่เกิน ${baht0(LIFE)} บาท (และเมื่อรวมกับเบี้ยประกันสุขภาพ ข้อ 7.2 แล้วต้องไม่เกิน ${baht0(COMBINED)} บาท ตามประกาศอธิบดีกรมสรรพากรเกี่ยวกับภาษีเงินได้ ฉบับที่ 301)`,
      'กรมธรรม์ต้องมีกำหนดเวลาคุ้มครองตั้งแต่ 10 ปีขึ้นไป',
      'ต้องจ่ายเบี้ยให้บริษัทประกันชีวิตที่ประกอบกิจการในราชอาณาจักร และมีหลักฐานจากผู้รับประกันภัย',
      'ผู้เอาประกันต้องเป็นผู้มีเงินได้เอง (เบี้ยที่จ่ายเพื่อบุตร/ผู้อื่นไม่นับ ยกเว้นกรณีคู่สมรสที่ไม่มีเงินได้ หักได้ไม่เกิน 10,000 บาท)',
      'กรณีกรมธรรม์มีเงินคืนระหว่างอายุกรมธรรม์ ต้องมีเงื่อนไขว่าจ่ายเบี้ย 10 ปีติดต่อกัน หรือจ่ายเท่ากับจำนวนเงินเอาประกันภัย— ถ้าไม่เข้าเงื่อนไขจะไม่ได้รับสิทธิ',
    ],
    nuance: 'เงินฝากประเภทสงเคราะห์ชีวิตและครอบครัวของออมสิน หรือเงินฝากกับธนาคารที่มีข้อตกลงจ่ายผลประโยชน์ตามความทรงชีพ/มรณะ ระยะเวลาฝาก 10 ปีขึ้นไป นับเข้าเกณฑ์นี้ได้ (เพดานรวมกันไม่เกิน 100,000 บาท)',
  },
  {
    key: 'pension',
    label: '💰 ประกันชีวิตแบบบำนาญ',
    item: '7.3',
    badge: 'ใบแนบ ข้อ 7.3',
    defaultPremium: 150_000,
    capText: `ลดหย่อนได้ไม่เกินร้อยละ 15 ของเงินได้ และไม่เกิน ${baht0(PENSION)} บาท/ปี`,
    rules: [
      `เพดาน: ร้อยละ 15 ของเงินได้พึงประเมิน แต่ไม่เกิน ${baht0(PENSION)} บาท/ปี (คำชี้แจง ข้อ 7.6)`,
      'กรมธรรม์ประกันชีวิตแบบบำนาญต้องมีกำหนดเวลาตั้งแต่ 10 ปีขึ้นไป และจ่ายเบี้ยครบถ้วนก่อนรับบำนาญ',
      'ต้องมีการจ่ายผลประโยชน์เงินบำนาญเป็นรายงวดอย่างสม่ำเสมอ (งวดแรกเป็นเงินก้อนได้ แต่ไม่เกินร้อยละ 30 ของจำนวนเงินเอาประกันภัย)',
      'กำหนดช่วงอายุที่จ่ายบำนาญ ตั้งแต่อายุ 55 ปีขึ้นไป ถึง 85 ปี หรือกว่านั้น',
      `นับรวมในวงเงินกลุ่มเกษียณ ${baht0(RETIRE_CAP)} บาท ร่วมกับสำรองเลี้ยงชีพ · กบข. · กองทุนสงเคราะห์ครู · RMF · SSF`,
    ],
    nuance: 'ตามคำชี้แจง ข้อ 7.6 ให้ใช้สิทธิเบี้ยประกันชีวิตแบบอื่น (ข้อ 7.1) ให้เต็ม 100,000 บาทก่อน แล้วส่วนที่เหลือจึงนับเป็นเบี้ยประกันชีวิตแบบบำนาญ · เมื่อเริ่มรับบำนาญ เงินบำนาญที่ได้รับต้องนำมารวมคำนวณภาษีในปีที่รับ (มาตรา 40(1))',
  },
  {
    key: 'health',
    label: '🏥 ประกันสุขภาพ (ตนเอง)',
    item: '7.2',
    badge: 'ใบแนบ ข้อ 7.2',
    defaultPremium: HEALTH,
    capText: `ลดหย่อนได้ตามที่จ่ายจริง แต่ไม่เกิน ${baht0(HEALTH)} บาท/ปี และรวมกับข้อ 7.1 ไม่เกิน ${baht0(COMBINED)} บาท`,
    rules: [
      `เพดาน: ตามที่จ่ายจริง แต่ไม่เกิน ${baht0(HEALTH)} บาท/ปี`,
      `เมื่อรวมกับเบี้ยประกันชีวิต (ข้อ 7.1) ต้องไม่เกิน ${baht0(COMBINED)} บาท (ประกาศอธิบดีฯ ฉบับที่ 301)`,
      'ต้องจ่ายให้บริษัทประกันชีวิตหรือบริษัทประกันวินาศภัยที่ประกอบกิจการในราชอาณาจักร สำหรับการประกันสุขภาพของผู้มีเงินได้เอง',
      'ใช้สิทธิได้สำหรับเบี้ยที่จ่ายตั้งแต่วันที่ 1 มกราคม 2563 เป็นต้นไป',
    ],
    nuance: 'จุดที่คนมักเข้าใจผิด: ซื้อประกันชีวิต 100,000 + ประกันสุขภาพ 25,000 ไม่ได้ลดหย่อน 125,000 แต่ใช้ได้เพียง 100,000 บาท',
  },
];

const LEVELS = [300_000, 480_000, 600_000, 1_000_000, 2_000_000, 5_000_000];

const salary = (amount: number): PitIncomeItem[] => [{ category: 'salary', amount, description: 'เงินได้พึงประเมิน' }];

function run(income: number, extra: Partial<PitPerson>) {
  const p: PitPerson = { personal: true, social_security: 9_000, income_items: salary(income), ...extra };
  return computePit([p], DEFAULT_TAX_YEAR);
}

export default function InsuranceTaxTools() {
  const [tab, setTab] = useState<Key>('savings');
  const [income, setIncome] = useState<number>(600_000);
  const [premium, setPremium] = useState<number>(LIFE);
  const [alsoLife, setAlsoLife] = useState<number>(0); // เบี้ยประกันชีวิตแบบอื่นที่จ่ายควบคู่ (สำหรับแท็บบำนาญ)

  const cfg = TABS.find((t) => t.key === tab) as Tab;

  const pick = (k: Key) => {
    const t = TABS.find((x) => x.key === k) as Tab;
    setTab(k);
    setPremium(t.defaultPremium);
  };

  const extra = (premiumValue: number, lifeValue: number): Partial<PitPerson> => {
    if (tab === 'pension') return { pension_life_insurance: premiumValue, life_insurance: lifeValue };
    if (tab === 'health') return { health_insurance: premiumValue, life_insurance: lifeValue };
    return { life_insurance: premiumValue };
  };

  const base = useMemo(() => run(income, {}), [income]);
  const withIns = useMemo(() => run(income, extra(premium, alsoLife)), [income, premium, alsoLife, tab]);
  const withoutIns = useMemo(
    () => (alsoLife > 0 ? run(income, { life_insurance: alsoLife }) : base),
    [income, alsoLife, base],
  );

  const usedItem = withIns.allowance_items.find((a) => a.item === cfg.item);
  const used = usedItem ? usedItem.amount : 0;
  const saved = Math.max(0, withoutIns.tax_before_credit - withIns.tax_before_credit);
  const paid = premium + (tab === 'pension' ? alsoLife : tab === 'health' ? alsoLife : 0);
  const perBaht = paid > 0 ? saved / paid : 0;
  const marginal = withoutIns.marginal_rate;

  const pensionCap = Math.min(income * 0.15, PENSION);
  const lifeUsed = (() => {
    const a = withIns.allowance_items.find((x) => x.item === '7.1');
    return a ? a.amount : 0;
  })();
  const healthUsed = (() => {
    const a = withIns.allowance_items.find((x) => x.item === '7.2');
    return a ? a.amount : 0;
  })();

  const matrix = useMemo(
    () => LEVELS.map((inc) => {
      const w = run(inc, extra(premium, alsoLife));
      const b = alsoLife > 0 ? run(inc, { life_insurance: alsoLife }) : run(inc, {});
      const item = w.allowance_items.find((a) => a.item === cfg.item);
      return {
        income: inc,
        allowed: item ? item.amount : 0,
        before: b.tax_before_credit,
        after: w.tax_before_credit,
        saved: Math.max(0, b.tax_before_credit - w.tax_before_credit),
        marginal: b.marginal_rate,
      };
    }),
    [premium, alsoLife, tab, cfg.item],
  );

  const rows = [
    { label: `เบี้ยที่จ่ายจริง (${cfg.badge})`, value: baht0(premium) },
    { label: `ลดหย่อนที่ใช้ได้จริง (ข้อ ${cfg.item})`, value: baht0(used) },
    ...(tab === 'pension' ? [{ label: 'ลดหย่อนประกันชีวิตแบบอื่น (ข้อ 7.1)', value: baht0(lifeUsed) }] : []),
    ...(tab === 'health' || tab === 'savings' ? [{ label: 'รวมกับอีกข้อที่เกี่ยวข้อง', value: `${baht0(lifeUsed + healthUsed)} / ${baht0(COMBINED)}` }] : []),
    { label: 'เงินได้สุทธิ (แบบ ข้อ 11.7)', value: baht0(withIns.net_income) },
    { label: 'ภาษีก่อนใช้สิทธิ', value: baht0(withoutIns.tax_before_credit) },
    { label: 'ภาษีหลังใช้สิทธิ', value: baht0(withIns.tax_before_credit) },
  ];

  return (
    <section className="card overflow-hidden" id="insurance-tax-tools">
      <div className="p-5 sm:p-6 border-b border-gray-100 bg-gradient-to-br from-white via-white to-sky-50/50">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-sky-700 bg-sky-50 border border-sky-100 rounded-full px-2.5 py-1">
            Insurance · Tax Deduction
          </span>
          <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-slate-500 bg-white border border-gray-200 rounded-full px-2.5 py-1">
            ใบแนบ ข้อ 7.1–7.3
          </span>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-[#475569] mt-3 tracking-tight">ประกันลดหย่อนภาษี</h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-6 max-w-3xl">
          เลือกแบบประกันที่ต้องการ แล้วดูรายละเอียดสิทธิ + ตัวเลขภาษีที่ประหยัดได้จริง (คำนวณสดจากเอนจินเดียวกับโปรแกรมด้านล่าง)
          — ประกันชีวิตแบบสะสมทรัพย์ (ข้อ 7.1) · ประกันชีวิตแบบบำนาญ (ข้อ 7.3) · ประกันสุขภาพ (ข้อ 7.2)
        </p>
      </div>

      <div className="p-5 sm:p-6">
        {/* ปุ่มเลือกแบบประกัน */}
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => pick(t.key)}
              className={`px-4 py-2 rounded-full border text-xs sm:text-sm font-semibold transition-colors ${
                tab === t.key ? 'bg-[#475569] text-white border-[#475569] shadow-sm' : 'bg-white text-slate-600 border-gray-200 hover:bg-sky-50'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="grid lg:grid-cols-3 gap-4 mt-4 items-start">
          {/* ฝั่งซ้าย: รายละเอียดสิทธิ + ตัวเลข */}
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl border border-gray-100 bg-slate-50/40 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-600">กรอกเพื่อดูของคุณเอง</span>
                <span className="text-[10px] text-slate-400">ค่าเริ่มต้นเป็นตัวอย่าง — แก้ตัวเลขได้เลย</span>
              </div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-2">
                <label className="block">
                  <div className="text-[11px] font-medium text-slate-600 mb-1">เงินได้พึงประเมิน/ปี (บาท)</div>
                  <input type="text" inputMode="numeric" value={income.toLocaleString('en-US')}
                    onChange={(e) => setIncome(Math.max(0, Number(e.target.value.replace(/[^\d]/g, '')) || 0))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-sky-200" />
                </label>
                <label className="block">
                  <div className="text-[11px] font-medium text-slate-600 mb-1">เบี้ยที่จ่ายจริง/ปี (บาท · {cfg.badge})</div>
                  <input type="text" inputMode="numeric" value={premium.toLocaleString('en-US')}
                    onChange={(e) => setPremium(Math.max(0, Number(e.target.value.replace(/[^\d]/g, '')) || 0))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-sky-200" />
                </label>
                {tab === 'pension' && (
                  <label className="block">
                    <div className="text-[11px] font-medium text-slate-600 mb-1">เบี้ยประกันชีวิตแบบอื่น (ข้อ 7.1) ที่จ่ายควบคู่</div>
                    <input type="text" inputMode="numeric" value={alsoLife.toLocaleString('en-US')}
                      onChange={(e) => setAlsoLife(Math.max(0, Number(e.target.value.replace(/[^\d]/g, '')) || 0))}
                      className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-sky-200" />
                  </label>
                )}
              </div>
              <div className="text-[11px] text-slate-500 mt-2 leading-4">
                {cfg.capText}
                {tab === 'pension' && <> · เพดานตามเงินได้ของคุณ = <b>{baht0(pensionCap)}</b> บาท</>}
                {premium > (tab === 'pension' ? pensionCap : tab === 'health' ? HEALTH : LIFE) && (
                  <span className="block text-amber-700 mt-1">⚠️ เบี้ยที่กรอกเกินเพดาน — ระบบใช้เพดานตามกฎหมายให้อัตโนมัติ (ส่วนเกินไม่ลดหย่อน)</span>
                )}
              </div>
            </div>

            <div className="grid sm:grid-cols-3 gap-3">
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3">
                <div className="text-[10px] text-emerald-700">ประหยัดภาษีได้</div>
                <div className="text-xl font-bold text-emerald-700 tabular-nums mt-1">{baht0(saved)}</div>
                <div className="text-[10px] text-emerald-700/70">บาท/ปี · ฐานภาษีขั้นสูงสุดของคุณ {Math.round(marginal * 100)}%</div>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-slate-50/50 p-3">
                <div className="text-[10px] text-slate-500">ลดหย่อนที่ใช้ได้จริง</div>
                <div className="text-xl font-bold text-slate-700 tabular-nums mt-1">{baht0(used)}</div>
                <div className="text-[10px] text-slate-400">จากเบี้ยที่จ่าย {baht0(premium)} บาท</div>
              </div>
              <div className="rounded-2xl border border-gray-100 bg-slate-50/50 p-3">
                <div className="text-[10px] text-slate-500">ผลตอบแทนภาษีต่อเบี้ย</div>
                <div className="text-xl font-bold text-sky-700 tabular-nums mt-1">{paid > 0 ? pct(perBaht) : '—'}</div>
                <div className="text-[10px] text-slate-400">ประหยัดเทียบกับเบี้ยที่จ่ายทั้งหมด</div>
              </div>
            </div>

            <div className="rounded-2xl border border-gray-100 p-3">
              <div className="text-xs font-bold text-[#475569] mb-2">ตัวเลขของท่าน (คำนวณจากเอนจินเดียวกับโปรแกรมด้านล่าง)</div>
              <table className="w-full text-[11px] tabular-nums">
                <tbody className="[&_td]:py-1">
                  {rows.map((r) => (
                    <tr key={r.label} className="border-b border-dashed last:border-0">
                      <td className="text-slate-500">{r.label}</td>
                      <td className="text-right text-slate-700 font-semibold">{r.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {withIns.allowance_notes.length > 0 && (
                <div className="mt-2 text-[10px] text-amber-800 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1.5 leading-4">
                  ⚠ {withIns.allowance_notes.join(' · ')}
                </div>
              )}
            </div>

            <div>
              <div className="text-xs font-bold text-[#475569] mb-2">ประหยัดภาษีตามระดับเงินได้ (เบี้ย {baht0(premium)} บาท/ปี · {cfg.badge})</div>
              <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full text-[11px] tabular-nums min-w-[560px]" id="insurance-savings-matrix">
                  <thead>
                    <tr className="text-slate-400 text-left border-b">
                      <th className="py-2 pr-2 font-semibold text-right">เงินได้/ปี</th>
                      <th className="py-2 pr-2 font-semibold text-right">ลดหย่อนที่ใช้ได้จริง</th>
                      <th className="py-2 pr-2 font-semibold text-right">ภาษีก่อนใช้สิทธิ</th>
                      <th className="py-2 pr-2 font-semibold text-right">ภาษีหลังใช้สิทธิ</th>
                      <th className="py-2 pr-2 font-semibold text-right">ประหยัดภาษี</th>
                      <th className="py-2 font-semibold text-right">ขั้นภาษี</th>
                    </tr>
                  </thead>
                  <tbody>
                    {matrix.map((m) => (
                      <tr key={m.income} className="border-b border-dashed last:border-0">
                        <td className="py-2 pr-2 text-right text-slate-700">{baht0(m.income)}</td>
                        <td className="py-2 pr-2 text-right text-emerald-700">{baht0(m.allowed)}</td>
                        <td className="py-2 pr-2 text-right text-slate-600">{baht0(m.before)}</td>
                        <td className="py-2 pr-2 text-right text-slate-600">{baht0(m.after)}</td>
                        <td className="py-2 pr-2 text-right font-semibold text-emerald-700">{baht0(m.saved)}</td>
                        <td className="py-2 text-right text-slate-500">{Math.round(m.marginal * 100)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-slate-400 mt-2 leading-4">
                ที่เงินได้ 300,000 บาท (หลังหักค่าใช้จ่าย 100,000 + ลดหย่อนพื้นฐาน) เงินได้สุทธิยังไม่ถึงเกณฑ์เสียภาษี → ไม่มีภาษีให้ประหยัด
              </p>
            </div>
          </div>

          {/* ฝั่งขวา: รายละเอียดเงื่อนไขตามกฎหมาย */}
          <div className="space-y-4 lg:sticky lg:top-4">
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
              <div className="text-xs font-bold text-emerald-800 mb-2">รายละเอียดสิทธิ · {cfg.badge}</div>
              <div className="text-[11px] font-semibold text-slate-700 mb-2">{cfg.capText}</div>
              <ul className="text-[11px] text-slate-600 leading-5 space-y-1.5">
                {cfg.rules.map((r) => <li key={r}>• {r}</li>)}
              </ul>
            </div>
            <div className="rounded-2xl border border-amber-100 bg-amber-50/40 p-4">
              <div className="text-xs font-bold text-amber-800 mb-2">ข้อควรรู้เพิ่มเติม</div>
              <p className="text-[11px] text-slate-600 leading-5">{cfg.nuance}</p>
            </div>
            <div className="rounded-2xl border border-gray-100 p-4">
              <div className="text-xs font-bold text-[#475569] mb-2">เพดานที่ใช้บ่อย</div>
              <table className="w-full text-[11px] tabular-nums">
                <tbody className="[&_td]:py-1">
                  <tr className="border-b border-dashed"><td className="text-slate-500">ประกันชีวิต (ข้อ 7.1)</td><td className="text-right">{baht0(LIFE)}</td></tr>
                  <tr className="border-b border-dashed"><td className="text-slate-500">ประกันสุขภาพ (ข้อ 7.2)</td><td className="text-right">{baht0(HEALTH)}</td></tr>
                  <tr className="border-b border-dashed"><td className="text-slate-500">7.1 + 7.2 รวมกัน</td><td className="text-right">{baht0(COMBINED)}</td></tr>
                  <tr className="border-b border-dashed"><td className="text-slate-500">ประกันบำนาญ (ข้อ 7.3 · 15% ของเงินได้)</td><td className="text-right">{baht0(PENSION)}</td></tr>
                  <tr><td className="text-slate-500">วงเงินกลุ่มเกษียณรวม</td><td className="text-right">{baht0(RETIRE_CAP)}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="rounded-2xl border border-gray-100 p-4 text-[11px] text-slate-400 leading-5">
              อ้างอิง: ใบแนบแสดงรายละเอียดรายการลดหย่อนและยกเว้น ข้อ 7.1–7.3 · คำชี้แจงการกรอกแบบ ภ.ง.ด.90 ปีภาษี {DEFAULT_TAX_YEAR} ข้อ 7.1–7.6 ·
              ประกาศอธิบดีกรมสรรพากรเกี่ยวกับภาษีเงินได้ (ฉบับที่ 301) เรื่องเพดานรวมประกันชีวิต+สุขภาพ 100,000 บาท ·{' '}
              <a className="underline decoration-slate-300 hover:text-sky-700" href="https://www.rd.go.th/67335.html" target="_blank" rel="noreferrer">ไฟล์ราชการที่ rd.go.th</a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
