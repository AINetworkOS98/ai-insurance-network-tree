/**
 * thaiPit.ts — เครื่องคำนวณภาษีเงินได้บุคคลธรรมดา (ประเทศไทย)
 * ---------------------------------------------------------------------------
 * พอร์ต 1:1 จากโปรแกรม Python `python/thai_tax_calculator.py` (v1.0.0)
 * อ้างอิง: ประมวลรัษฎากร มาตรา 40, 42 ทวิ, 42 ตรี, 43, 47, 48
 *          ตารางสรุปการหักลดหย่อน กรมสรรพากร https://www.rd.go.th/59674.html
 * ปีภาษีเริ่มต้น: 2568 (2025)
 *
 * ⚠️ กฎสำคัญของทีม: แก้กติกาภาษีที่ไฟล์นี้ = ต้องแก้ python/thai_tax_calculator.py
 *    ให้ตรงกันด้วย เพราะชุดทดสอบ `python/testcases_thai_pit.json` ใช้ตรวจทั้งสองฝั่ง
 *    (ตรวจได้ที่ GET /api/tax/thai-pit?selftest=1)
 */

export const TAX_CALC_VERSION = '1.0.0';
export const DEFAULT_TAX_YEAR = 2568;

/** อัตราภาษีขั้นบันได (มาตรา 48(1)): [เพดานบนของขั้น, อัตราภาษี] */
export const TAX_BRACKETS: Array<[number, number]> = [
  [150_000, 0.0],
  [300_000, 0.05],
  [500_000, 0.1],
  [750_000, 0.15],
  [1_000_000, 0.2],
  [2_000_000, 0.25],
  [5_000_000, 0.3],
  [Number.POSITIVE_INFINITY, 0.35],
];

export type IncomeKey =
  | 'salary' | 'service' | 'royalty' | 'interest'
  | 'rent' | 'professional' | 'contractor' | 'business';

export const EXPENSE_RULES: Record<IncomeKey, { label: string; rate: number; cap: number | null }> = {
  salary: { label: 'เงินเดือน ค่าจ้าง โบนัส (40(1))', rate: 0.5, cap: 100_000 },
  service: { label: 'รับจ้างทำของ/ค่าบริการ (40(2))', rate: 0.5, cap: 100_000 },
  royalty: { label: 'ค่าแห่งลิขสิทธิ์/ค่ากู๊ดวิลล์ (40(3))', rate: 0.5, cap: null },
  interest: { label: 'ดอกเบี้ย/เงินปันผล (40(4))', rate: 0.0, cap: 0 },
  rent: { label: 'ค่าเช่าทรัพย์สิน (40(5))', rate: 0.3, cap: null },
  professional: { label: 'วิชาชีพอิสระ (40(6))', rate: 0.3, cap: null },
  contractor: { label: 'รับเหมาก่อสร้าง (40(7))', rate: 0.6, cap: null },
  business: { label: 'ธุรกิจ/พาณิชย์/อื่น ๆ (40(8))', rate: 0.6, cap: null },
};

export const MEDICAL_RATE = 0.6;
export const SHARED_CAP_1_2 = 100_000;

export const LIM = {
  personal: 60_000,
  spouse: 60_000,
  child: 30_000,
  child_extra: 30_000,
  adopted_child: 60_000,
  adopted_max: 3,
  prenatal: 60_000,
  parent: 30_000,
  disabled_dependent: 60_000,
  life_insurance: 100_000,
  health_insurance: 25_000,
  life_health_combined: 100_000,
  parent_health: 15_000,
  spouse_life: 10_000,
  social_security: 9_000,
  pension_life: 200_000,
  retirement_cap: 500_000,
  nsf: 30_000,
  thai_esg: 300_000,
  social_enterprise: 100_000,
  home_loan_interest: 100_000,
  home_construction_exempt: 100_000,
  easy_e_receipt: 50_000,
  travel_main: 20_000,
  travel_secondary: 30_000,
  donation_political: 10_000,
  senior_disabled_exemption: 190_000,
  min_tax_rate: 0.005,
} as const;

export const PCT_RULES: Record<string, number> = {
  provident_fund: 0.15,
  gpf: 0.3,
  teacher_fund: 0.15,
  rmf: 0.3,
  ssf: 0.3,
  pension_life_insurance: 0.15,
  thai_esg: 0.3,
  thai_esgx: 0.3,
};

export const EFFECTIVE_TAX_YEARS = [2568, 2569];

export const PIT_SOURCES = [
  'กรมสรรพากร — ตารางสรุปการหักลดหย่อนและยกเว้นภาษี: https://www.rd.go.th/59674.html',
  'กรมสรรพากร — อัตราภาษีเงินได้บุคคลธรรมดา (มาตรา 48): https://www.rd.go.th/315.html',
  'ประมวลรัษฎากร มาตรา 40 (ประเภทเงินได้) / 42 ทวิ-ตรี, 43 (ค่าใช้จ่าย) / 47, 48 (การคำนวณภาษี)',
  'มาตรการเที่ยวดีมีคืน 2568: https://www.rd.go.th/fileadmin/user_upload/lorkhor/newsbanner/2025/10/PR22102568.pdf',
];

export const PIT_DISCLAIMER =
  'ผลคำนวณนี้เป็นเครื่องช่วยประมาณการตามหลักเกณฑ์กรมสรรพากร ไม่ใช่การวินิจฉัยภาษีอย่างเป็นทางการ — ' +
  'กรณีมีเงินได้หลายประเภท/สิทธิพิเศษ โปรดตรวจสอบกับสำนักงานสรรพากรหรือผู้ทำบัญชีก่อนยื่นแบบ';

/** ข้อมูลผู้เสียภาษี 1 คน (ทุกช่องเป็นบาท/ปี) */
export type PitPerson = {
  salary?: number; service?: number; royalty?: number; interest?: number;
  rent?: number; professional?: number; contractor?: number; business?: number;
  medical_professional?: boolean;
  actual_expense?: Partial<Record<IncomeKey, number>>;

  personal?: boolean;
  spouse_no_income?: boolean;
  children?: number;
  children_born_2561_plus?: number;
  adopted_children?: number;
  pregnancies?: number;
  prenatal_expense?: number;
  parents?: number;
  disabled_dependents?: number;

  life_insurance?: number;
  health_insurance?: number;
  spouse_life_insurance?: number;
  parent_health_insurance?: number;
  social_security?: number;
  pension_life_insurance?: number;

  provident_fund?: number;
  gpf?: number;
  teacher_fund?: number;
  rmf?: number;
  ssf?: number;
  nsf?: number;
  thai_esg?: number;
  thai_esgx?: number;
  social_enterprise?: number;

  home_loan_interest?: number;
  home_construction_cost?: number;
  easy_e_receipt?: number;
  travel_main_city?: number;
  travel_secondary_city?: number;
  other_measure_amount?: number;

  donation_general?: number;
  donation_education?: number;
  donation_political?: number;

  senior_or_disabled_exemption?: number;

  withholding?: number;
  dividend_credit?: number;
};

export type AllowanceItem = { code: string; label: string; amount: number; note?: string };
export type ExpenseLine = { group: string; label: string; gross: number; deductible: number };
export type BracketStep = { range: string; rate: number; amount: number; tax: number };

export type PitResult = {
  program: string;
  version: string;
  year: number;
  filing_mode: string;
  gross_by_category: Record<string, number>;
  gross_total: number;
  expense_lines: ExpenseLine[];
  expenses_total: number;
  income_after_expense: number;
  exemptions: Array<{ label: string; amount: number; note?: string }>;
  exemptions_total: number;
  allowance_items: AllowanceItem[];
  allowances_total: number;
  allowance_notes: string[];
  net_income: number;
  bracket_steps: BracketStep[];
  tax_by_bracket: number;
  marginal_rate: number;
  min_tax_05pct: number;
  min_tax_applied: boolean;
  tax_before_credit: number;
  tax_credits: number;
  net_payable: number;
  result: string;
  must_file: boolean;
  file_threshold: number;
  sources: string[];
  disclaimer: string;
};

const money = (x: unknown): number => {
  const v = typeof x === 'number' ? x : parseFloat(String(x ?? 0).replace(/,/g, ''));
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.round(v * 100) / 100;
};

const r2 = (x: number): number => Math.round(x * 100) / 100;

/** 5) หักค่าใช้จ่าย (มาตรา 42 ทวิ / 42 ตรี / 43) */
export function computeExpenses(p: PitPerson): { lines: ExpenseLine[]; total: number } {
  const lines: ExpenseLine[] = [];
  const gross12 = money(p.salary) + money(p.service);
  if (gross12 > 0) {
    lines.push({
      group: '40(1)+(2)',
      label: 'เงินเดือน/ค่าจ้าง/ค่าบริการ — หักเหมา 50% (รวมกันไม่เกิน 100,000)',
      gross: r2(gross12),
      deductible: r2(Math.min(gross12 * 0.5, SHARED_CAP_1_2)),
    });
  }

  (['royalty', 'rent', 'professional', 'contractor', 'business'] as IncomeKey[]).forEach((key) => {
    const gross = money(p[key]);
    if (gross <= 0) return;
    const rule = EXPENSE_RULES[key];
    const rate = key === 'professional' && p.medical_professional ? MEDICAL_RATE : rule.rate;
    let hedged = gross * rate;
    if (rule.cap !== null) hedged = Math.min(hedged, rule.cap);
    const actual = money(p.actual_expense?.[key]);
    const used = actual > 0 ? Math.min(actual, gross) : hedged;
    const how = actual > 0 ? 'ตามจริง' : `เหมา ${Math.round(rate * 100)}%`;
    lines.push({ group: rule.label, label: `${rule.label} — หัก${how}`, gross: r2(gross), deductible: r2(used) });
  });

  const interestGross = money(p.interest);
  if (interestGross > 0) {
    lines.push({
      group: '40(4)',
      label: 'ดอกเบี้ย/เงินปันผล (40(4)) — หักค่าใช้จ่ายไม่ได้',
      gross: r2(interestGross),
      deductible: 0,
    });
  }

  return { lines, total: r2(lines.reduce((s, l) => s + l.deductible, 0)) };
}

/** 6) ค่าลดหย่อนของผู้เสียภาษี 1 คน · assessable = เงินได้พึงประเมิน (ใช้คิดเพดานร้อยละ) */
export function computeAllowances(
  p: PitPerson,
  assessable: number,
  marriedCombined: boolean,
): { items: AllowanceItem[]; subtotal: number; notes: string[] } {
  const items: AllowanceItem[] = [];
  const notes: string[] = [];
  const add = (code: string, label: string, amount: number, note = '') => {
    const v = r2(Math.max(0, amount));
    if (v > 0) items.push({ code, label, amount: v, note });
  };

  // 6.1 ส่วนตัว/ครอบครัว
  if (p.personal !== false) add('personal', 'ค่าลดหย่อนส่วนตัว', LIM.personal);

  if (p.spouse_no_income && !marriedCombined) {
    add('spouse', 'ค่าลดหย่อนคู่สมรส (ไม่มีเงินได้)', LIM.spouse,
      'คู่สมรสต้องมีเงินได้พึงประเมินไม่เกิน 60,000 บาท/ปี และจดทะเบียนสมรสถูกต้อง');
  } else if (p.spouse_no_income && marriedCombined) {
    notes.push('ยื่นรวมกับคู่สมรส → ใช้สิทธิลดหย่อนคู่สมรสไม่ได้ (แต่หักลดหย่อนส่วนตัวของคู่สมรส 60,000 บาทได้)');
  }

  const kids = money(p.children);
  const kidsExtra = money(p.children_born_2561_plus);
  add('children',
    `ค่าลดหย่อนบุตร (${kids} คน${kidsExtra ? ` + บุตรคนที่ 2 ขึ้นไปเกิดตั้งแต่ 2561 อีก ${kidsExtra} คน` : ''})`,
    kids * LIM.child + kidsExtra * LIM.child_extra,
    'บุตรชอบด้วยกฎหมาย คนละ 30,000 · บุตรคนที่ 2+ เกิดตั้งแต่ปี 2561 ได้เพิ่มอีก 30,000');

  const adopted = Math.min(money(p.adopted_children), LIM.adopted_max);
  add('adopted_children', `ค่าลดหย่อนบุตรบุญธรรม (${adopted} คน)`, adopted * LIM.adopted_child,
    'บุตรบุญธรรมคนละ 60,000 บาท ไม่เกิน 3 คน');

  const pregnancies = money(p.pregnancies);
  if (pregnancies > 0) {
    add('prenatal', `ค่าฝากครรภ์และค่าคลอดบุตร (${pregnancies} ครั้ง)`,
      Math.min(money(p.prenatal_expense), LIM.prenatal * Math.max(1, pregnancies)),
      'ตามที่จ่ายจริง ไม่เกิน 60,000 บาทต่อการตั้งครรภ์ 1 ครั้ง');
  }

  add('parents', `ค่าอุปการะบิดามารดา (${money(p.parents)} คน)`, money(p.parents) * LIM.parent,
    'คนละ 30,000 บาท — อายุ 60 ปีขึ้นไป และมีเงินได้ไม่เกิน 30,000 บาท/ปี');
  add('disabled_dependents', `ค่าอุปการะผู้พิการ/ทุพพลภาพ (${money(p.disabled_dependents)} คน)`,
    money(p.disabled_dependents) * LIM.disabled_dependent, 'คนละ 60,000 บาท');

  // 6.2 ประกัน
  let life = Math.min(money(p.life_insurance), LIM.life_insurance);
  let health = Math.min(money(p.health_insurance), LIM.health_insurance);
  let cut = Math.max(0, life + health - LIM.life_health_combined);
  if (cut > 0) {
    health = Math.max(0, health - cut);
    cut = Math.max(0, life + health - LIM.life_health_combined);
    if (cut > 0) life = Math.max(0, life - cut);
    notes.push('เบี้ยประกันชีวิต + ประกันสุขภาพ รวมกันได้ไม่เกิน 100,000 บาท/ปี (ตัดส่วนเกินให้แล้ว)');
  }
  add('life_insurance', 'เบี้ยประกันชีวิต/สะสมทรัพย์', life,
    'ตามที่จ่ายจริง ไม่เกิน 100,000 บาท · กรมธรรม์อายุความคุ้มครอง 10 ปีขึ้นไป');
  add('health_insurance', 'เบี้ยประกันสุขภาพ (ตนเอง)', health,
    'ไม่เกิน 25,000 บาท และรวมกับประกันชีวิตไม่เกิน 100,000 บาท');
  add('parent_health_insurance', 'เบี้ยประกันสุขภาพบิดามารดา',
    Math.min(money(p.parent_health_insurance), LIM.parent_health),
    'บิดามารดามีเงินได้ไม่เกิน 30,000 บาท/ปี — ไม่เกิน 15,000 บาท');
  if (!marriedCombined) {
    add('spouse_life_insurance', 'เบี้ยประกันชีวิตคู่สมรส (ไม่มีเงินได้)',
      Math.min(money(p.spouse_life_insurance), LIM.spouse_life), 'ไม่เกิน 10,000 บาท');
  }
  add('social_security', 'เงินสมทบประกันสังคม (มาตรา 33)',
    Math.min(money(p.social_security), LIM.social_security), 'ตามที่จ่ายจริง ไม่เกิน 9,000 บาท/ปี');

  // 6.3 กองทุนเพื่อการเกษียณ (เพดานรวม 500,000)
  const retirementOrders: Array<{ key: keyof PitPerson & string; label: string; cap: number; note: string }> = [
    { key: 'provident_fund', label: 'เงินสะสมกองทุนสำรองเลี้ยงชีพ', cap: LIM.retirement_cap, note: '15% ของเงินได้ ไม่เกิน 500,000' },
    { key: 'gpf', label: 'เงินสะสม กบข. (ข้าราชการ)', cap: LIM.retirement_cap, note: '30% ของเงินได้ ไม่เกิน 500,000' },
    { key: 'teacher_fund', label: 'เงินสะสมกองทุนสงเคราะห์ครูโรงเรียนเอกชน', cap: LIM.retirement_cap, note: '15% ของเงินได้ ไม่เกิน 500,000' },
    { key: 'pension_life_insurance', label: 'เบี้ยประกันชีวิตแบบบำนาญ', cap: LIM.pension_life, note: '15% ของเงินได้ ไม่เกิน 200,000' },
    { key: 'rmf', label: 'ค่าซื้อหน่วยลงทุน RMF', cap: LIM.retirement_cap, note: '30% ของเงินได้ ไม่เกิน 500,000' },
    { key: 'ssf', label: 'ค่าซื้อหน่วยลงทุน SSF', cap: 200_000, note: '30% ของเงินได้ ไม่เกิน 200,000' },
  ];
  const retirement: Array<{ key: string; label: string; amount: number; note: string }> = [];
  retirementOrders.forEach((o) => {
    const raw = money(p[o.key] as number);
    if (raw <= 0) return;
    const allowed = Math.min(raw, assessable * (PCT_RULES[o.key] ?? 0), o.cap);
    retirement.push({ key: o.key, label: o.label, amount: allowed, note: o.note });
  });
  let over = retirement.reduce((s, i) => s + i.amount, 0) - LIM.retirement_cap;
  if (over > 0) {
    for (let i = retirement.length - 1; i >= 0 && over > 0; i -= 1) {
      const cutAmt = Math.min(retirement[i].amount, over);
      retirement[i].amount -= cutAmt;
      over -= cutAmt;
    }
    notes.push('กองทุนเกษียณ (สำรองเลี้ยงชีพ/กบข./สงเคราะห์ครู/ประกันบำนาญ/RMF/SSF) รวมกันได้ไม่เกิน 500,000 บาท/ปี — ปรับลดส่วนเกินให้แล้ว');
  }
  retirement.forEach((i) => add(i.key, i.label, i.amount, i.note));

  add('nsf', 'เงินสะสมกองทุนการออมแห่งชาติ (กอช.)', Math.min(money(p.nsf), LIM.nsf),
    'ตามที่จ่ายจริง ไม่เกิน 30,000 บาท (วงเงินแยกจากกองทุนเกษียณ 500,000)');
  add('thai_esg', 'ค่าซื้อหน่วยลงทุน Thai ESG',
    Math.min(money(p.thai_esg), assessable * PCT_RULES.thai_esg, LIM.thai_esg),
    '30% ของเงินได้ ไม่เกิน 300,000 บาท (ถือหน่วยลงทุนไม่น้อยกว่า 5 ปี)');
  add('thai_esgx', 'ค่าซื้อหน่วยลงทุน Thai ESGX (เฉพาะปีภาษี 2568)',
    Math.min(money(p.thai_esgx), assessable * 0.3, 300_000),
    'ลงทุนใหม่ 1 พ.ค.–30 มิ.ย. 2568 — 30% ของเงินได้ ไม่เกิน 300,000 บาท');
  add('social_enterprise', 'เงินลงทุนวิสาหกิจเพื่อสังคม (Social Enterprise)',
    Math.min(money(p.social_enterprise), LIM.social_enterprise), 'ไม่เกิน 100,000 บาท');

  // 6.4 อสังหาริมทรัพย์ + มาตรการรัฐเฉพาะปี
  add('home_loan_interest', 'ดอกเบี้ยเงินกู้ยืมเพื่อที่อยู่อาศัย',
    Math.min(money(p.home_loan_interest), LIM.home_loan_interest), 'ตามที่จ่ายจริง ไม่เกิน 100,000 บาท');
  add('easy_e_receipt', 'มาตรการ Easy E-Receipt 2.0 (16 ม.ค.–28 ก.พ. 2568)',
    Math.min(money(p.easy_e_receipt), LIM.easy_e_receipt), 'ไม่เกิน 50,000 บาท ต้องมีใบกำกับภาษีอิเล็กทรอนิกส์');
  add('travel_main_city', 'เที่ยวดีมีคืน 2568 — ท่องเที่ยวเมืองหลัก (29 ต.ค.–15 ธ.ค. 2568)',
    Math.min(money(p.travel_main_city), LIM.travel_main),
    '1 เท่าของที่จ่ายจริง ไม่เกิน 20,000 บาท (ค่าที่พัก/ร้านอาหารที่จด VAT)');
  add('travel_secondary_city', 'เที่ยวดีมีคืน 2568 — ท่องเที่ยวเมืองรอง 55 จังหวัด',
    Math.min(Math.min(money(p.travel_secondary_city), LIM.travel_main) * 1.5, LIM.travel_secondary),
    '1.5 เท่าของที่จ่ายจริง (จ่ายจริงไม่เกิน 20,000) รวมไม่เกิน 30,000 บาท');
  add('other_measure_amount', 'มาตรการรัฐอื่นของปีภาษี (เช่น ค่าติดตั้งโซลาร์รูฟท็อป)',
    money(p.other_measure_amount), 'ใส่ยอดที่ใช้สิทธิได้จริงตามหลักฐาน — ไม่มีหลักฐาน = ไม่ควรใส่');

  return { items, subtotal: r2(items.reduce((s, i) => s + i.amount, 0)), notes };
}

/** 7) ภาษีขั้นบันได + รายละเอียดแต่ละขั้น */
export function progressiveTax(netIncome: number): { tax: number; steps: BracketStep[]; marginalRate: number } {
  const net = Math.max(0, netIncome);
  let tax = 0;
  let lower = 0;
  const steps: BracketStep[] = [];
  for (const [upper, rate] of TAX_BRACKETS) {
    if (net <= lower) break;
    const amount = Math.min(net, upper) - lower;
    const stepTax = amount * rate;
    tax += stepTax;
    steps.push({
      range: `${lower === 0 ? '0' : `${lower.toLocaleString('en-US')}+1`} – ${upper === Number.POSITIVE_INFINITY ? '∞ ขึ้นไป' : upper.toLocaleString('en-US')}`,
      rate,
      amount: r2(amount),
      tax: r2(stepTax),
    });
    lower = upper;
  }
  return { tax: r2(tax), steps, marginalRate: steps.length ? steps[steps.length - 1].rate : 0 };
}

/** 8) เครื่องยนต์หลัก — persons 1 คน = ยื่นคนเดียว · 2 คน = ยื่นรวมกับคู่สมรส (ภ.ง.ด.90) */
export function computePit(persons: PitPerson[], year: number = DEFAULT_TAX_YEAR): PitResult {
  if (!persons || persons.length === 0) throw new Error('ต้องมีข้อมูลผู้เสียภาษีอย่างน้อย 1 คน');
  const marriedCombined = persons.length > 1;

  // 8.1 เงินได้ + ค่าใช้จ่าย
  const grossByCat: Record<IncomeKey, number> = {
    salary: 0, service: 0, royalty: 0, interest: 0, rent: 0, professional: 0, contractor: 0, business: 0,
  };
  let expensesTotal = 0;
  const expenseLines: ExpenseLine[] = [];
  persons.forEach((p, idx) => {
    (Object.keys(EXPENSE_RULES) as IncomeKey[]).forEach((k) => { grossByCat[k] += money(p[k]); });
    const exp = computeExpenses(p);
    exp.lines.forEach((l) => {
      expenseLines.push(marriedCombined ? { ...l, label: `(คู่สมรส) ${l.label}` } : l);
    });
    expensesTotal += exp.total;
  });

  const grossTotal = r2(Object.values(grossByCat).reduce((s, v) => s + v, 0));
  expensesTotal = r2(expensesTotal);
  const incomeAfterExpense = r2(Math.max(0, grossTotal - expensesTotal));

  // 8.2 ยกเว้นเงินได้
  const exemptions: Array<{ label: string; amount: number; note?: string }> = [];
  const seniorCap = LIM.senior_disabled_exemption * (marriedCombined ? 2 : 1);
  const seniorExempt = Math.min(
    persons.reduce((s, p) => s + money(p.senior_or_disabled_exemption), 0), seniorCap);
  if (seniorExempt > 0) {
    exemptions.push({
      label: 'ยกเว้นเงินได้ผู้มีอายุ 65 ปีขึ้นไป หรือผู้พิการ/ทุพพลภาพ',
      amount: r2(seniorExempt), note: 'ยกเว้นเงินได้ไม่เกิน 190,000 บาท/ปี ต่อคน',
    });
  }
  const constructionCost = persons.reduce((s, p) => s + money(p.home_construction_cost), 0);
  if (constructionCost > 0) {
    exemptions.push({
      label: 'ยกเว้นเงินได้ค่าจ้างก่อสร้างบ้านใหม่ (มาตรการล้านละหมื่น)',
      amount: r2(Math.min(Math.floor(constructionCost / 1_000_000) * 10_000, LIM.home_construction_exempt)),
      note: '10,000 บาทต่อค่าก่อสร้าง 1,000,000 บาท (ไม่เกิน 100,000) สัญญาจ้าง 9 เม.ย. 2567–31 ธ.ค. 2568',
    });
  }
  const exemptionsTotal = r2(exemptions.reduce((s, e) => s + e.amount, 0));

  // 8.3 ค่าลดหย่อน (ลดหย่อนระดับครอบครัวนับครั้งเดียวที่ผู้ยื่นหลัก)
  const allowanceItems: AllowanceItem[] = [];
  const allowanceNotes: string[] = [];
  persons.forEach((p, idx) => {
    const q: PitPerson = idx > 0
      ? {
          ...p, children: 0, children_born_2561_plus: 0, adopted_children: 0,
          pregnancies: 0, prenatal_expense: 0, parents: 0, disabled_dependents: 0, spouse_no_income: false,
        }
      : p;
    const allow = computeAllowances(q, incomeAfterExpense, marriedCombined);
    allow.items.forEach((it) => {
      allowanceItems.push(marriedCombined && idx > 0 ? { ...it, label: `(คู่สมรส) ${it.label}` } : it);
    });
    allowanceNotes.push(...allow.notes);
  });
  const allowancesBeforeDonation = r2(allowanceItems.reduce((s, i) => s + i.amount, 0));

  // 8.4 เงินบริจาค (เพดาน 10% ของเงินได้หลังหักค่าใช้จ่ายและค่าลดหย่อน)
  const donationBase = Math.max(0, incomeAfterExpense - exemptionsTotal - allowancesBeforeDonation);
  const donCap = donationBase * 0.1;
  const donGeneral = Math.min(persons.reduce((s, p) => s + money(p.donation_general), 0), donCap);
  const donEduRaw = persons.reduce((s, p) => s + money(p.donation_education), 0);
  const donEdu = Math.min(donEduRaw * 2, donCap);
  const donPolitical = Math.min(persons.reduce((s, p) => s + money(p.donation_political), 0), LIM.donation_political);
  if (donGeneral > 0) {
    allowanceItems.push({
      code: 'donation_general', label: 'เงินบริจาคทั่วไป (1 เท่า)', amount: r2(donGeneral),
      note: `ไม่เกิน 10% ของเงินได้หลังหักค่าใช้จ่าย/ลดหย่อน = ${donCap.toLocaleString('en-US')}`,
    });
  }
  if (donEdu > 0) {
    allowanceItems.push({
      code: 'donation_education',
      label: `เงินบริจาคเพื่อการศึกษา/กีฬา/สถานพยาบาลรัฐ (2 เท่าของ ${donEduRaw.toLocaleString('en-US')})`,
      amount: r2(donEdu), note: 'ไม่เกิน 10% ของเงินได้หลังหักค่าใช้จ่าย/ลดหย่อน',
    });
    if (donEduRaw * 2 > donCap) allowanceNotes.push('เงินบริจาคเพื่อการศึกษา 2 เท่า ถูกจำกัดด้วยเพดาน 10% ของเงินได้');
  }
  if (donPolitical > 0) {
    allowanceItems.push({
      code: 'donation_political', label: 'เงินบริจาคให้พรรคการเมือง', amount: r2(donPolitical), note: 'ไม่เกิน 10,000 บาท',
    });
  }
  const allowancesTotal = r2(allowanceItems.reduce((s, i) => s + i.amount, 0));

  // 8.5 เงินได้สุทธิ + ภาษี
  const netIncome = r2(Math.max(0, incomeAfterExpense - exemptionsTotal - allowancesTotal));
  const bracket = progressiveTax(netIncome);

  // 8.6 ภาษีขั้นต่ำ 0.5% (มาตรา 48(2)) เฉพาะเงินได้ 40(2)–(8)
  const gross2to8 = r2(grossTotal - grossByCat.salary);
  const minTax = r2(gross2to8 * LIM.min_tax_rate);
  const appliedMinTax = minTax > bracket.tax && gross2to8 > 0;
  const taxBeforeCredit = gross2to8 > 0 ? Math.max(bracket.tax, minTax) : bracket.tax;

  const credits = r2(persons.reduce((s, p) => s + money(p.withholding) + money(p.dividend_credit), 0));
  const netPayable = r2(taxBeforeCredit - credits);

  const salaryOnly = gross2to8 <= 0;
  const fileThreshold = salaryOnly ? 60_000 : 120_000;

  return {
    program: 'thai_tax_calculator.py',
    version: TAX_CALC_VERSION,
    year,
    filing_mode: marriedCombined ? 'ยื่นรวมกับคู่สมรส (ภ.ง.ด.90)' : 'ยื่นคนเดียว (ภ.ง.ด.90/91)',
    gross_by_category: (Object.keys(EXPENSE_RULES) as IncomeKey[])
      .filter((k) => grossByCat[k] > 0)
      .reduce<Record<string, number>>((acc, k) => { acc[EXPENSE_RULES[k].label] = r2(grossByCat[k]); return acc; }, {}),
    gross_total: grossTotal,
    expense_lines: expenseLines,
    expenses_total: expensesTotal,
    income_after_expense: incomeAfterExpense,
    exemptions,
    exemptions_total: exemptionsTotal,
    allowance_items: allowanceItems,
    allowances_total: allowancesTotal,
    allowance_notes: allowanceNotes,
    net_income: netIncome,
    bracket_steps: bracket.steps,
    tax_by_bracket: bracket.tax,
    marginal_rate: bracket.marginalRate,
    min_tax_05pct: minTax,
    min_tax_applied: appliedMinTax,
    tax_before_credit: r2(taxBeforeCredit),
    tax_credits: credits,
    net_payable: netPayable,
    result: netPayable > 0.5 ? 'ต้องชำระเพิ่ม' : netPayable < -0.5 ? 'ขอคืนภาษี' : 'ไม่มีภาษีต้องชำระ/ขอคืน',
    must_file: grossTotal > fileThreshold,
    file_threshold: fileThreshold,
    sources: PIT_SOURCES,
    disclaimer: PIT_DISCLAIMER,
  };
}
