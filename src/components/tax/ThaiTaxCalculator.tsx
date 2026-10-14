'use client';
/**
 * ThaiTaxCalculator.tsx — หน้าคำนวณภาษีเงินได้บุคคลธรรมดา (ใช้ง่ายสำหรับสมาชิกทั่วไป)
 * ใช้เอนจินเดียวกับโปรแกรม Python: python/thai_tax_calculator.py (v1.0.0)
 * อ้างอิง: ประมวลรัษฎากร มาตรา 40/42 ทวิ-ตรี/43/47/48 + กรมสรรพากร (rd.go.th)
 */
import { useMemo, useState } from 'react';
import {
  computePit, DEFAULT_TAX_YEAR, LIM, TAX_CALC_VERSION, PIT_SOURCES,
  type PitPerson, type IncomeKey,
} from '@/lib/tax/thaiPit';

type Num = number | undefined;

const baht = (v: number) =>
  Number(v || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const baht0 = (v: number) => Number(v || 0).toLocaleString('th-TH', { maximumFractionDigits: 0 });

/* ── ช่องกรอกจำนวนเงิน (ใส่ได้เฉพาะตัวเลข คั่นหลักพันให้) ── */
function Money({
  label, value, onChange, hint, max, placeholder = '0',
}: {
  label: string; value: Num; onChange: (v: number) => void;
  hint?: string; max?: number; placeholder?: string;
}) {
  const over = typeof value === 'number' && typeof max === 'number' && value > max;
  return (
    <label className="block">
      <div className="text-xs font-medium text-slate-600 mb-1 leading-4">{label}</div>
      <input
        type="text"
        inputMode="numeric"
        value={typeof value === 'number' && value !== 0 ? value.toLocaleString('en-US') : ''}
        placeholder={placeholder}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.]/g, '');
          const v = raw === '' ? 0 : Math.max(0, Number(raw) || 0);
          onChange(v);
        }}
        className={`w-full border rounded-xl px-3 py-2 text-sm tabular-nums bg-white focus:outline-none focus:ring-2 focus:ring-sky-200 ${
          over ? 'border-amber-300 bg-amber-50' : 'border-gray-200'
        }`}
      />
      {hint && <div className="text-[11px] text-slate-400 mt-1 leading-4">{hint}</div>}
      {over && (
        <div className="text-[11px] text-amber-600 mt-0.5">
          เกินเพดานสิทธิ์ {baht0(max as number)} — ระบบจะใช้เพดานให้อัตโนมัติ
        </div>
      )}
    </label>
  );
}

function Count({ label, value, onChange, hint }: { label: string; value: Num; onChange: (v: number) => void; hint?: string }) {
  return (
    <label className="block">
      <div className="text-xs font-medium text-slate-600 mb-1 leading-4">{label}</div>
      <input
        type="number" min={0} step={1}
        value={typeof value === 'number' && value !== 0 ? value : ''}
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

function Section({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className="card p-4 sm:p-5">
      <h3 className="text-sm font-bold text-[#475569] mb-1">{title}</h3>
      {note && <p className="text-[11px] text-slate-400 mb-3 leading-4">{note}</p>}
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-2">{children}</div>
    </section>
  );
}

function Details({ title, children, badge }: { title: string; children: React.ReactNode; badge?: string }) {
  return (
    <details className="card p-4 sm:p-5 group">
      <summary className="cursor-pointer text-sm font-bold text-[#475569] flex items-center justify-between list-none">
        <span>
          <span className="inline-block transition-transform group-open:rotate-90 mr-1 text-slate-400">▸</span>
          {title}
        </span>
        {badge && <span className="text-[11px] text-slate-400 font-normal">{badge}</span>}
      </summary>
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3 mt-3">{children}</div>
    </details>
  );
}

const INCOME_FIELDS: Array<{ k: IncomeKey; label: string; hint: string }> = [
  { k: 'salary', label: 'เงินเดือน / ค่าจ้าง / โบนัส (40(1))', hint: 'หักเหมา 50% ไม่เกิน 100,000 (รวมกับ 40(2))' },
  { k: 'service', label: 'รับจ้างทำของ / ค่าบริการ (40(2))', hint: 'หักเหมา 50% ไม่เกิน 100,000 (รวมกับ 40(1))' },
  { k: 'royalty', label: 'ค่าแห่งลิขสิทธิ์ / ค่ากู๊ดวิลล์ (40(3))', hint: 'หักเหมา 50%' },
  { k: 'interest', label: 'ดอกเบี้ย / เงินปันผล (40(4))', hint: 'หักค่าใช้จ่ายไม่ได้ (กรณีถูกหัก 15% อาจไม่ต้องนำมารวม)' },
  { k: 'rent', label: 'ค่าเช่าทรัพย์สิน (40(5))', hint: 'หักเหมา 30%' },
  { k: 'professional', label: 'วิชาชีพอิสระ (40(6))', hint: 'หักเหมา 30% (แพทย์/พยาบาล/เภสัช ฯลฯ 60%)' },
  { k: 'contractor', label: 'รับเหมาก่อสร้าง (40(7))', hint: 'หักเหมา 60%' },
  { k: 'business', label: 'ธุรกิจ / พาณิชย์ / อื่น ๆ (40(8))', hint: 'หักเหมา 60%' },
];

const EMPTY: PitPerson = { personal: true };

export default function ThaiTaxCalculator() {
  const [main, setMain] = useState<PitPerson>({ ...EMPTY });
  const [spouse, setSpouse] = useState<PitPerson>({ personal: true });
  const [married, setMarried] = useState(false);
  const [busyTest, setBusyTest] = useState(false);
  const [testMsg, setTestMsg] = useState('');

  const set = (patch: Partial<PitPerson>) => setMain((p) => ({ ...p, ...patch }));
  const setS = (patch: Partial<PitPerson>) => setSpouse((p) => ({ ...p, ...patch }));

  const result = useMemo(
    () => computePit(married ? [main, spouse] : [main], DEFAULT_TAX_YEAR),
    [main, spouse, married],
  );

  async function runSelftest() {
    setBusyTest(true); setTestMsg('');
    try {
      const r = await fetch('/api/tax/thai-pit?selftest=1', { cache: 'no-store' });
      const j = await r.json();
      if (j?.ok) {
        setTestMsg(`✓ ตรวจแล้วผ่านทั้ง ${j.passed}/${j.total} กรณี — เครื่องคำนวณบนเว็บให้ผลตรงกับชุดทดสอบมาตรฐาน (ชุดเดียวกับโปรแกรม Python)`);
      } else {
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
    const blob = new Blob([JSON.stringify({ persons: married ? [main, spouse] : [main], result }, null, 2)],
      { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `thai-tax-${DEFAULT_TAX_YEAR}-${Date.now()}.json`;
    a.click(); URL.revokeObjectURL(url);
  }

  const presets: Array<{ label: string; run: () => void }> = [
    { label: 'พนักงานเงินเดือน 500,000', run: () => { setMarried(false); setMain({ ...EMPTY, salary: 500000, social_security: 9000 }); } },
    { label: 'ฟรีแลนซ์ 1,200,000', run: () => { setMarried(false); setMain({ ...EMPTY, business: 1200000, social_security: 9000, life_insurance: 60000 }); } },
    { label: 'มีบ้าน+ลูก 2 คน', run: () => { setMarried(false); setMain({ ...EMPTY, salary: 900000, children: 2, children_born_2561_plus: 1, social_security: 9000, home_loan_interest: 80000, provident_fund: 80000 }); } },
    { label: 'คู่สมรสยื่นรวม', run: () => { setMarried(true); setMain({ ...EMPTY, salary: 900000, social_security: 9000, home_loan_interest: 100000 }); setSpouse({ personal: true, salary: 600000, social_security: 9000, provident_fund: 90000 }); } },
  ];

  const surplus = result.net_payable;
  const summaryColor = surplus > 0 ? 'text-rose-600' : surplus < 0 ? 'text-emerald-600' : 'text-slate-600';

  return (
    <div className="space-y-4" id="thai-tax-calculator">
      {/* ── หัวเรื่อง + ปุ่มเครื่องมือ ── */}
      <div className="card p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold text-[#475569]">คำนวณภาษีเงินได้บุคคลธรรมดา</h2>
          <span className="text-xs px-2 py-1 rounded-full border bg-white text-slate-500">ปีภาษี {DEFAULT_TAX_YEAR} · ยื่นแบบปี {DEFAULT_TAX_YEAR + 1}</span>
          <span className="text-xs px-2 py-1 rounded-full border border-sky-200 bg-sky-50 text-sky-700">อ้างอิงกรมสรรพากร (rd.go.th)</span>
          <span className="text-xs px-2 py-1 rounded-full border bg-white text-slate-500">ใช้ฟรีสำหรับสมาชิกทั่วไป</span>
          <span className="ml-auto flex flex-wrap gap-2">
            <button onClick={runSelftest} disabled={busyTest}
              className="px-3 py-2 rounded-full border border-emerald-200 bg-emerald-50 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
              {busyTest ? 'กำลังตรวจ…' : '✓ ตรวจความถูกต้อง'}
            </button>
            <button onClick={downloadJson} className="px-3 py-2 rounded-full border bg-white text-xs font-semibold text-slate-600">⤓ ดาวน์โหลดผล (JSON)</button>
            <button onClick={() => window.print()} className="px-3 py-2 rounded-full border bg-white text-xs font-semibold text-slate-600">🖨 พิมพ์ / บันทึก PDF</button>
            <button onClick={() => { setMain({ ...EMPTY }); setSpouse({ personal: true }); setMarried(false); setTestMsg(''); }}
              className="px-3 py-2 rounded-full border bg-white text-xs font-semibold text-slate-600">↺ ล้างข้อมูล</button>
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-2 leading-5">
          กรอกเฉพาะช่องที่มี — ช่องว่างถือเป็น 0 ระบบคิดค่าใช้จ่ายแบบเหมาให้อัตโนมัติ
          ตรวจเพดานค่าลดหย่อนทุกตัวตามที่กรมสรรพากรกำหนด ภาษีขั้นบันได 0–35% และตรวจภาษีขั้นต่ำ 0.5% (มาตรา 48(2)) ให้ด้วย
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
        {/* ── ฝั่งกรอกข้อมูล ── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="card p-4 flex flex-wrap gap-2 items-center">
            <span className="text-xs font-semibold text-slate-600 mr-1">รูปแบบการยื่นแบบ:</span>
            <button onClick={() => setMarried(false)}
              className={`px-4 py-2 rounded-full text-xs font-semibold border ${!married ? 'bg-[#475569] text-white border-[#475569]' : 'bg-white text-slate-600'}`}>
              ยื่นคนเดียว (ภ.ง.ด.90/91)
            </button>
            <button onClick={() => setMarried(true)}
              className={`px-4 py-2 rounded-full text-xs font-semibold border ${married ? 'bg-[#475569] text-white border-[#475569]' : 'bg-white text-slate-600'}`}>
              ยื่นรวมกับคู่สมรส (ภ.ง.ด.90)
            </button>
            {married && <span className="text-[11px] text-slate-400">— ระบบจะคิดเงินได้/ลดหย่อนของทั้งสองคนรวมกัน (หักลดหย่อนส่วนตัวคนละ 60,000)</span>}
          </div>

          <Section title="1) เงินได้ทั้งปี (บาท)" note="กรอกยอดรวมทั้งปีก่อนหักภาษี ณ ที่จ่าย — แยกตามประเภทเงินได้ตามมาตรา 40">
            {INCOME_FIELDS.map((f) => (
              <Money key={f.k} label={f.label} hint={f.hint}
                value={main[f.k] as Num} onChange={(v) => set({ [f.k]: v } as Partial<PitPerson>)} />
            ))}
            {Number(main.professional) > 0 && (
              <Check label="เป็นแพทย์/ทันตแพทย์/พยาบาล/เภสัชกร/เทคนิคการแพทย์/กายภาพบำบัด" checked={!!main.medical_professional}
                onChange={(v) => set({ medical_professional: v })} hint="วิชาชีพกลุ่มนี้หักค่าใช้จ่ายเหมาได้ 60%" />
            )}
          </Section>

          <Section title="2) ลดหย่อนครอบครัว" note="บุตร/บิดามารดา/ผู้พิการ ที่อุปการะ — ต้องมีหลักฐาน (แบบ ล.ย.01/ล.ย.03)">
            <Count label="บุตรชอบด้วยกฎหมาย (คน)" value={main.children} onChange={(v) => set({ children: v })} hint="คนละ 30,000" />
            <Count label="ในนั้นบุตรคนที่ 2+ ที่เกิดตั้งแต่ปี 2561 (คน)" value={main.children_born_2561_plus}
              onChange={(v) => set({ children_born_2561_plus: v })} hint="ได้เพิ่มอีกคนละ 30,000" />
            <Count label="บุตรบุญธรรม (คน, ไม่เกิน 3)" value={main.adopted_children} onChange={(v) => set({ adopted_children: v })} hint="คนละ 60,000" />
            <Count label="จำนวนครั้งตั้งครรภ์/คลอดบุตร" value={main.pregnancies} onChange={(v) => set({ pregnancies: v })} hint="ไม่เกิน 60,000 ต่อครั้ง" />
            {Number(main.pregnancies) > 0 && (
              <Money label="ค่าฝากครรภ์ + ค่าคลอดบุตร (รวม)" value={main.prenatal_expense} onChange={(v) => set({ prenatal_expense: v })} max={60000} />
            )}
            <Count label="บิดามารดาที่อุปการะ (คน)" value={main.parents} onChange={(v) => set({ parents: v })}
              hint="คนละ 30,000 · อายุ 60+ และเงินได้ไม่เกิน 30,000/ปี" />
            <Count label="ผู้พิการ/ทุพพลภาพที่อุปการะ (คน)" value={main.disabled_dependents} onChange={(v) => set({ disabled_dependents: v })} hint="คนละ 60,000" />
            {!married && (
              <Check label="คู่สมรสไม่มีเงินได้" checked={!!main.spouse_no_income} onChange={(v) => set({ spouse_no_income: v })}
                hint="ลดหย่อน 60,000 (คู่สมรสมีเงินได้ไม่เกิน 60,000/ปี)" />
            )}
          </Section>

          <Section title="3) ประกัน / ประกันสังคม" note="ต้องเป็นกรมธรรม์ของบริษัทประกันชีวิตในไทย อายุความคุ้มครอง 10 ปีขึ้นไป">
            <Money label="เงินสมทบประกันสังคม (มาตรา 33)" value={main.social_security} onChange={(v) => set({ social_security: v })} max={LIM.social_security} hint="ตามจริง ไม่เกิน 9,000/ปี" />
            <Money label="เบี้ยประกันชีวิต + สะสมทรัพย์" value={main.life_insurance} onChange={(v) => set({ life_insurance: v })} max={LIM.life_insurance} hint="ไม่เกิน 100,000/ปี" />
            <Money label="เบี้ยประกันสุขภาพ (ตนเอง)" value={main.health_insurance} onChange={(v) => set({ health_insurance: v })} max={LIM.health_insurance} hint="ไม่เกิน 25,000 และรวมกับประกันชีวิตไม่เกิน 100,000" />
            <Money label="เบี้ยประกันสุขภาพบิดามารดา" value={main.parent_health_insurance} onChange={(v) => set({ parent_health_insurance: v })} max={LIM.parent_health} hint="ไม่เกิน 15,000/ปี" />
            {!married && (
              <Money label="เบี้ยประกันชีวิตคู่สมรส (ไม่มีเงินได้)" value={main.spouse_life_insurance} onChange={(v) => set({ spouse_life_insurance: v })} max={LIM.spouse_life} hint="ไม่เกิน 10,000/ปี" />
            )}
            <Money label="เบี้ยประกันชีวิตแบบบำนาญ" value={main.pension_life_insurance} onChange={(v) => set({ pension_life_insurance: v })} max={LIM.pension_life} hint="15% ของเงินได้ ไม่เกิน 200,000 (นับในวงเงินเกษียณ 500,000)" />
          </Section>

          <Details title="4) กองทุน / การลงทุนเพื่อลดหย่อน" badge="สำรองเลี้ยงชีพ · RMF · SSF · Thai ESG · กอช.">
            <Money label="กองทุนสำรองเลี้ยงชีพ" value={main.provident_fund} onChange={(v) => set({ provident_fund: v })} hint="15% ของเงินได้ ไม่เกิน 500,000" />
            <Money label="กบข. (ข้าราชการ)" value={main.gpf} onChange={(v) => set({ gpf: v })} hint="30% ของเงินได้ ไม่เกิน 500,000" />
            <Money label="กองทุนสงเคราะห์ครูโรงเรียนเอกชน" value={main.teacher_fund} onChange={(v) => set({ teacher_fund: v })} hint="15% ของเงินได้ ไม่เกิน 500,000" />
            <Money label="RMF" value={main.rmf} onChange={(v) => set({ rmf: v })} hint="30% ของเงินได้ ไม่เกิน 500,000" />
            <Money label="SSF" value={main.ssf} onChange={(v) => set({ ssf: v })} hint="30% ของเงินได้ ไม่เกิน 200,000" />
            <Money label="กอช. (กองทุนการออมแห่งชาติ)" value={main.nsf} onChange={(v) => set({ nsf: v })} max={LIM.nsf} hint="ตามจริง ไม่เกิน 30,000" />
            <Money label="Thai ESG" value={main.thai_esg} onChange={(v) => set({ thai_esg: v })} max={LIM.thai_esg} hint="30% ของเงินได้ ไม่เกิน 300,000" />
            <Money label="Thai ESGX (ลงทุนใหม่ 1 พ.ค.–30 มิ.ย. 2568)" value={main.thai_esgx} onChange={(v) => set({ thai_esgx: v })} max={300000} hint="30% ของเงินได้ ไม่เกิน 300,000" />
            <Money label="วิสาหกิจเพื่อสังคม (Social Enterprise)" value={main.social_enterprise} onChange={(v) => set({ social_enterprise: v })} max={LIM.social_enterprise} hint="ไม่เกิน 100,000" />
            <div className="sm:col-span-2 xl:col-span-3 text-[11px] text-slate-400 leading-4">
              กองทุนเกษียณ (สำรองเลี้ยงชีพ + กบข. + สงเคราะห์ครู + ประกันบำนาญ + RMF + SSF) รวมกันไม่เกิน <b>500,000 บาท/ปี</b> — ระบบตัดเพดานให้อัตโนมัติ
            </div>
          </Details>

          <Details title="5) บ้าน + มาตรการรัฐของปีภาษี" badge="ดอกเบี้ยบ้าน · ก่อสร้างบ้าน · Easy E-Receipt · เที่ยวดีมีคืน">
            <Money label="ดอกเบี้ยเงินกู้เพื่อที่อยู่อาศัย" value={main.home_loan_interest} onChange={(v) => set({ home_loan_interest: v })} max={LIM.home_loan_interest} hint="ตามจริง ไม่เกิน 100,000" />
            <Money label="ค่าจ้างก่อสร้างบ้านใหม่ (มูลค่าก่อสร้าง)" value={main.home_construction_cost} onChange={(v) => set({ home_construction_cost: v })} hint="ยกเว้นเงินได้ ล้านละ 10,000 (ไม่เกิน 100,000) สัญญา 9 เม.ย. 2567–31 ธ.ค. 2568" />
            <Money label="Easy E-Receipt 2.0 (16 ม.ค.–28 ก.พ. 2568)" value={main.easy_e_receipt} onChange={(v) => set({ easy_e_receipt: v })} max={LIM.easy_e_receipt} hint="ไม่เกิน 50,000 ต้องมี e-Tax Invoice" />
            <Money label="เที่ยวดีมีคืน — เมืองหลัก (29 ต.ค.–15 ธ.ค. 2568)" value={main.travel_main_city} onChange={(v) => set({ travel_main_city: v })} max={LIM.travel_main} hint="1 เท่า ไม่เกิน 20,000" />
            <Money label="เที่ยวดีมีคืน — เมืองรอง 55 จังหวัด" value={main.travel_secondary_city} onChange={(v) => set({ travel_secondary_city: v })} max={LIM.travel_main} hint="1.5 เท่า (จ่ายจริงไม่เกิน 20,000) รวมไม่เกิน 30,000" />
            <Money label="มาตรการรัฐอื่นของปี (เช่น โซลาร์รูฟท็อป)" value={main.other_measure_amount} onChange={(v) => set({ other_measure_amount: v })} hint="ใส่ยอดที่ใช้สิทธิได้จริงตามหลักฐานเท่านั้น" />
          </Details>

          <Details title="6) เงินบริจาค" badge="ทั่วไป 1 เท่า · การศึกษา/กีฬา/รพ.รัฐ 2 เท่า">
            <Money label="บริจาคทั่วไป (วัด/มูลนิธิ ฯลฯ)" value={main.donation_general} onChange={(v) => set({ donation_general: v })} hint="ไม่เกิน 10% ของเงินได้หลังหักค่าใช้จ่ายและลดหย่อน" />
            <Money label="บริจาคเพื่อการศึกษา/กีฬา/สถานพยาบาลรัฐ" value={main.donation_education} onChange={(v) => set({ donation_education: v })} hint="ลดหย่อนได้ 2 เท่า เพดาน 10%" />
            <Money label="บริจาคให้พรรคการเมือง" value={main.donation_political} onChange={(v) => set({ donation_political: v })} max={LIM.donation_political} hint="ไม่เกิน 10,000" />
          </Details>

          <Details title="7) ยกเว้นเงินได้ · หักตามจริง · ภาษีที่จ่ายไว้แล้ว">
            <Check label="อายุ 65 ปีขึ้นไป หรือเป็นผู้พิการ/ทุพพลภาพ" checked={Number(main.senior_or_disabled_exemption) > 0}
              onChange={(v) => set({ senior_or_disabled_exemption: v ? LIM.senior_disabled_exemption : 0 })}
              hint="ยกเว้นเงินได้ไม่เกิน 190,000 บาท/ปี" />
            <Money label="ภาษีหัก ณ ที่จ่ายทั้งปี (50 ทวิ)" value={main.withholding} onChange={(v) => set({ withholding: v })} hint="ใส่เพื่อดูว่าต้องจ่ายเพิ่มหรือได้คืน" />
            <Money label="เครดิตภาษีเงินปันผล / อื่น ๆ" value={main.dividend_credit} onChange={(v) => set({ dividend_credit: v })} />
            <div className="sm:col-span-2 xl:col-span-3">
              <div className="text-xs font-medium text-slate-600 mb-1">หักค่าใช้จ่ายตามจริง (ถ้ามีหลักฐานครบ — เว้นว่าง = ใช้วิธีเหมา)</div>
              <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {(['royalty', 'rent', 'professional', 'contractor', 'business'] as IncomeKey[]).map((k) => (
                  <Money key={k} label={`ค่าใช้จ่ายจริงของ ${INCOME_FIELDS.find((f) => f.k === k)?.label}`}
                    value={main.actual_expense?.[k]} onChange={(v) => set({ actual_expense: { ...(main.actual_expense || {}), [k]: v } })} />
                ))}
              </div>
            </div>
          </Details>

          {married && (
            <Details title="8) ข้อมูลคู่สมรส (ยื่นรวมกัน)" badge="เงินได้ + ลดหย่อนของคู่สมรส">
              {INCOME_FIELDS.map((f) => (
                <Money key={`s-${f.k}`} label={`(คู่สมรส) ${f.label}`} value={spouse[f.k] as Num}
                  onChange={(v) => setS({ [f.k]: v } as Partial<PitPerson>)} />
              ))}
              <Money label="(คู่สมรส) เงินสมทบประกันสังคม" value={spouse.social_security} onChange={(v) => setS({ social_security: v })} max={LIM.social_security} />
              <Money label="(คู่สมรส) เบี้ยประกันชีวิต" value={spouse.life_insurance} onChange={(v) => setS({ life_insurance: v })} max={LIM.life_insurance} />
              <Money label="(คู่สมรส) เบี้ยประกันสุขภาพ" value={spouse.health_insurance} onChange={(v) => setS({ health_insurance: v })} max={LIM.health_insurance} />
              <Money label="(คู่สมรส) กองทุนสำรองเลี้ยงชีพ" value={spouse.provident_fund} onChange={(v) => setS({ provident_fund: v })} />
              <Money label="(คู่สมรส) RMF" value={spouse.rmf} onChange={(v) => setS({ rmf: v })} />
              <Money label="(คู่สมรส) SSF" value={spouse.ssf} onChange={(v) => setS({ ssf: v })} />
              <Money label="(คู่สมรส) ดอกเบี้ยบ้าน" value={spouse.home_loan_interest} onChange={(v) => setS({ home_loan_interest: v })} max={LIM.home_loan_interest} />
              <Money label="(คู่สมรส) บริจาคทั่วไป" value={spouse.donation_general} onChange={(v) => setS({ donation_general: v })} />
              <Money label="(คู่สมรส) บริจาคการศึกษา" value={spouse.donation_education} onChange={(v) => setS({ donation_education: v })} />
              <Money label="(คู่สมรส) ภาษีหัก ณ ที่จ่าย" value={spouse.withholding} onChange={(v) => setS({ withholding: v })} />
              <div className="sm:col-span-2 xl:col-span-3 text-[11px] text-slate-400 leading-4">
                ลดหย่อนระดับครอบครัว (บุตร/บิดามารดา/ค่าคลอดบุตร) นับครั้งเดียวที่ผู้ยื่นหลัก — และกรณียื่นรวมกันจะใช้สิทธิลดหย่อนคู่สมรส (60,000) ไม่ได้
              </div>
            </Details>
          )}
        </div>

        {/* ── ฝั่งผลลัพธ์ ── */}
        <div className="space-y-4 lg:sticky lg:top-4">
          <div className="card p-4 sm:p-5">
            <div className="text-xs text-slate-500">ผลการคำนวณ · {result.filing_mode}</div>
            <div className={`text-3xl font-bold mt-1 ${summaryColor}`}>
              {surplus > 0.5 ? baht(surplus) : surplus < -0.5 ? baht(Math.abs(surplus)) : '0.00'}
              <span className="text-sm font-semibold ml-1">บาท</span>
            </div>
            <div className={`text-xs font-semibold mt-1 ${summaryColor}`}>
              {surplus > 0.5 ? 'ต้องชำระภาษีเพิ่ม' : surplus < -0.5 ? 'ขอคืนภาษี (ยื่นเพื่อขอคืนได้)' : 'ไม่มีภาษีต้องชำระเพิ่ม และไม่มีภาษีขอคืน'}
            </div>

            <table className="w-full text-xs mt-4 tabular-nums">
              <tbody className="[&_td]:py-1">
                <tr><td className="text-slate-500">เงินได้ทั้งปี (มาตรา 40)</td><td className="text-right">{baht(result.gross_total)}</td></tr>
                <tr><td className="text-slate-500">หัก ค่าใช้จ่าย</td><td className="text-right text-rose-600">−{baht(result.expenses_total)}</td></tr>
                {result.exemptions_total > 0 && (
                  <tr><td className="text-slate-500">หัก เงินได้ที่ได้รับยกเว้น</td><td className="text-right text-rose-600">−{baht(result.exemptions_total)}</td></tr>
                )}
                <tr><td className="text-slate-500">หัก ค่าลดหย่อน</td><td className="text-right text-rose-600">−{baht(result.allowances_total)}</td></tr>
                <tr className="border-t"><td className="text-slate-700 font-semibold pt-2">เงินได้สุทธิ</td><td className="text-right font-semibold pt-2">{baht(result.net_income)}</td></tr>
                <tr><td className="text-slate-500">ภาษีตามขั้นบันได</td><td className="text-right">{baht(result.tax_by_bracket)}</td></tr>
                {result.min_tax_05pct > 0 && (
                  <tr>
                    <td className="text-slate-500">ภาษีขั้นต่ำ 0.5% (มาตรา 48(2)){result.min_tax_applied ? ' ← ใช้ยอดนี้' : ''}</td>
                    <td className="text-right">{baht(result.min_tax_05pct)}</td>
                  </tr>
                )}
                <tr><td className="text-slate-700 font-semibold">ภาษีที่ต้องเสียทั้งปี</td><td className="text-right font-semibold">{baht(result.tax_before_credit)}</td></tr>
                {result.tax_credits > 0 && (
                  <tr><td className="text-slate-500">หัก ภาษีที่จ่ายไว้/เครดิตภาษี</td><td className="text-right text-emerald-600">−{baht(result.tax_credits)}</td></tr>
                )}
                <tr className="border-t">
                  <td className="text-slate-700 font-bold pt-2">{surplus >= 0 ? 'ต้องชำระเพิ่ม' : 'ขอคืนภาษี'}</td>
                  <td className={`text-right font-bold pt-2 ${summaryColor}`}>{baht(Math.abs(surplus))}</td>
                </tr>
              </tbody>
            </table>

            <div className="mt-3 text-[11px] text-slate-500 leading-4">
              อัตราภาษีขั้นสูงสุดที่คุณเข้าข่าย: <b>{Math.round(result.marginal_rate * 100)}%</b> ·{' '}
              {result.must_file
                ? <>คุณ<b>มีหน้าที่ต้องยื่นแบบ</b> (เงินได้เกิน {baht0(result.file_threshold)} บาท/ปี) — ยื่น ภ.ง.ด.90/91 ภายใน 31 มี.ค. (ออนไลน์ถึง 8 เม.ย.)</>
                : <>เงินได้ทั้งปีไม่เกิน {baht0(result.file_threshold)} บาท — ไม่มีหน้าที่ต้องยื่น (แต่ยื่นเพื่อขอคืนภาษีที่ถูกหักไว้ได้)</>}
            </div>
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
                    <td>{s.range}</td>
                    <td className="text-right">{Math.round(s.rate * 100)}%</td>
                    <td className="text-right">{baht0(s.amount)}</td>
                    <td className="text-right">{baht0(s.tax)}</td>
                  </tr>
                ))}
                <tr className="border-t font-semibold">
                  <td colSpan={3}>รวมภาษีขั้นบันได</td>
                  <td className="text-right">{baht0(result.tax_by_bracket)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="card p-4">
            <h3 className="text-sm font-bold text-[#475569] mb-2">ค่าใช้จ่ายและค่าลดหย่อนที่ใช้จริง ({result.allowance_items.length} รายการ)</h3>
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
              {PIT_SOURCES.map((s) => (
                <li key={s} className="text-[11px] text-slate-500 leading-4">• {s}</li>
              ))}
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
