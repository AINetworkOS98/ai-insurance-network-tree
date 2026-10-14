/**
 * thaiPit.ts — เครื่องคำนวณภาษีเงินได้บุคคลธรรมดา (ประเทศไทย) v2.0.0
 * ---------------------------------------------------------------------------
 * พอร์ต 1:1 จากโปรแกรม Python `python/thai_tax_calculator.py` (v2.0.0)
 * โครงสร้างและลำดับการคำนวณตรงตาม "แบบแสดงรายการ ภ.ง.ด.90" และโปรแกรมคำนวณภาษี
 * ของกรมสรรพากร (rd.go.th) ข้อ 1 → ข้อ 14
 *
 * อ้างอิง
 *  • แบบ ภ.ง.ด.90 กรมสรรพากร (ข้อ 1–23)  https://www.rd.go.th/fileadmin/tax_pdf/pit/2567/201267PIT90.pdf
 *  • วิธีการคำนวณภาษีสิ้นปี (วิธีที่ 1 / วิธีที่ 2)  https://rd.go.th/555.html
 *  • การหักค่าใช้จ่าย (อัตราเหมาแยกประเภทเงินได้)  https://www.rd.go.th/556.html
 *  • ตารางสรุปการหักลดหย่อนและยกเว้นภาษี  https://www.rd.go.th/59674.html
 *
 * ⚠️ กฎของทีม: แก้กติกาภาษาที่ไฟล์นี้ = ต้องแก้ python/thai_tax_calculator.py ให้ตรงกัน
 *    เพราะชุดทดสอบ python/testcases_thai_pit.json ใช้ตรวจทั้งสองฝั่ง
 *    (ตรวจสดได้ที่ GET /api/tax/thai-pit?selftest=1)
 */

export const TAX_CALC_VERSION = '2.0.0';
export const DEFAULT_TAX_YEAR = 2568;

/** อัตราภาษีขั้นบันได (แบบข้อ 8 — มาตรา 48(1)): [เพดานบนของขั้น, อัตราภาษี] */
export const TAX_BRACKETS: Array<[number, number]> = [
  [150_000, 0.0], [300_000, 0.05], [500_000, 0.1], [750_000, 0.15],
  [1_000_000, 0.2], [2_000_000, 0.25], [5_000_000, 0.3], [Number.POSITIVE_INFINITY, 0.35],
];

export type IncomeKey =
  | 'salary' | 'service' | 'royalty' | 'interest'
  | 'rent' | 'professional' | 'contractor' | 'business';

/** ค่าใช้จ่ายตามแบบข้อ 5 (rate = เหมาเริ่มต้น, cap = เพดานบาท) */
export const EXPENSE_RULES: Record<IncomeKey, { label: string; short: string; rate: number; cap: number | null }> = {
  salary: { label: 'เงินเดือน ค่าจ้าง โบนัส เบี้ยเลี้ยง (40(1))', short: 'เงินเดือน/ค่าจ้าง (40(1))', rate: 0.5, cap: 100_000 },
  service: { label: 'รับทำงานให้ ค่านายหน้า เบี้ยประชุม (40(2))', short: 'รับทำงานให้/ค่านายหน้า (40(2))', rate: 0.5, cap: 100_000 },
  royalty: { label: 'ค่าแห่งลิขสิทธิ์/กู๊ดวิลล์/สิทธิอย่างอื่น (40(3))', short: 'ค่าแห่งลิขสิทธิ์/กู๊ดวิลล์ (40(3))', rate: 0.5, cap: 100_000 },
  interest: { label: 'ดอกเบี้ย เงินปันผล ส่วนแบ่งกำไร (40(4))', short: 'ดอกเบี้ย/เงินปันผล (40(4))', rate: 0.0, cap: 0 },
  rent: { label: 'ค่าเช่าทรัพย์สิน/ผิดสัญญาเช่าซื้อ (40(5))', short: 'ค่าเช่าทรัพย์สิน (40(5))', rate: 0.3, cap: null },
  professional: { label: 'วิชาชีพอิสระ (40(6))', short: 'วิชาชีพอิสระ (40(6))', rate: 0.3, cap: null },
  contractor: { label: 'รับเหมาก่อสร้าง (40(7))', short: 'รับเหมาก่อสร้าง (40(7))', rate: 0.6, cap: null },
  business: { label: 'ธุรกิจ/พาณิชย์/อื่น ๆ (40(8))', short: 'ธุรกิจ/อื่น ๆ (40(8))', rate: 0.6, cap: null },
};

export const SHARED_CAP_1_2 = 100_000;
export const CAP_40_3 = 100_000;

/** ประเภทย่อยที่มีอัตราเหมาต่างกัน (ตรงตาราง "การหักค่าใช้จ่าย" ของกรมสรรพากร) */
export const VARIANT_RATES: Partial<Record<IncomeKey, Record<string, { rate: number; label: string }>>> = {
  rent: {
    building: { rate: 0.3, label: 'บ้าน โรงเรือน สิ่งปลูกสร้าง แพ' },
    vehicle: { rate: 0.3, label: 'ยานพาหนะ' },
    agri_land: { rate: 0.2, label: 'ที่ดินที่ใช้ในการเกษตร' },
    other_land: { rate: 0.15, label: 'ที่ดินที่มิได้ใช้ในการเกษตร' },
    other: { rate: 0.1, label: 'ทรัพย์สินอื่น' },
  },
  professional: {
    medical: { rate: 0.6, label: 'ประกอบโรคศิลปะ (แพทย์ ทันตแพทย์ พยาบาล เภสัชกร ฯลฯ)' },
    other: { rate: 0.3, label: 'กฎหมาย วิศวกรรม สถาปัตยกรรม บัญชี ประณีตศิลปกรรม' },
  },
  business: {
    general: { rate: 0.6, label: 'ธุรกิจทั่วไป' },
    transport: { rate: 0.4, label: 'บางประเภทตามที่กรมสรรพากรกำหนด' },
  },
};

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
  min_tax_threshold: 120_000,
  min_tax_exempt: 5_000,
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
  'แบบแสดงรายการ ภ.ง.ด.90 กรมสรรพากร (ข้อ 1–23): https://www.rd.go.th/fileadmin/tax_pdf/pit/2567/201267PIT90.pdf',
  'วิธีการคำนวณภาษีเงินได้บุคคลธรรมดาสิ้นปี (วิธีที่ 1 / วิธีที่ 2): https://rd.go.th/555.html',
  'การหักค่าใช้จ่าย (อัตราเหมาแยกประเภทเงินได้): https://www.rd.go.th/556.html',
  'ตารางสรุปการหักลดหย่อนและยกเว้นภาษี: https://www.rd.go.th/59674.html',
  'อัตราภาษีเงินได้บุคคลธรรมดา (มาตรา 48): https://www.rd.go.th/59670.html',
];

export const PIT_DISCLAIMER =
  'ผลคำนวณนี้ทำตามหลักเกณฑ์และลำดับการคำนวณในแบบ ภ.ง.ด.90 ของกรมสรรพากร เพื่อใช้ประมาณการภาษีของตนเองก่อนยื่นแบบ ' +
  'ไม่ใช่การวินิจฉัยภาษีอย่างเป็นทางการ — กรณีมีเงินได้หลายประเภท/สิทธิพิเศษ โปรดตรวจสอบกับสำนักงานสรรพากรหรือผู้ทำบัญชีก่อนยื่นแบบ';

/** เงินได้ 1 แหล่ง = 1 บรรทัดในแบบ ภ.ง.ด.90 */
export type PitIncomeItem = {
  category: IncomeKey;
  amount: number;
  description?: string;
  expense_mode?: 'standard' | 'actual';
  actual_expense?: number;
  variant?: string;
  withholding?: number;
};

/** ข้อมูลผู้เสียภาษี 1 คน (ทุกช่องเป็นบาท/ปี) */
export type PitPerson = {
  income_items?: PitIncomeItem[];

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
  pnd93?: number;
  pnd94?: number;
};

export type AllowanceItem = { code: string; label: string; amount: number; note?: string };
export type ExpenseLine = { group: string; label: string; gross: number; deductible: number };
export type BracketStep = { range: string; rate: number; amount: number; tax: number };
export type IncomeItemRow = {
  owner: string;
  category: IncomeKey;
  category_label: string;
  description: string;
  amount: number;
  variant: string;
  variant_label: string;
  expense_mode: 'standard' | 'actual';
  withholding: number;
};

export type PitResult = {
  program: string;
  version: string;
  year: number;
  filing_mode: string;
  form_reference: string;
  income_items: IncomeItemRow[];
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
  base_after_allowances: number;
  donation_caps: { education_10pct_of_item3: number; general_10pct_of_item5: number };
  net_income: number;
  bracket_steps: BracketStep[];
  tax_by_bracket: number;
  marginal_rate: number;
  tax_method1: number;
  tax_method2: number;
  method2_applies: boolean;
  method2_note: string;
  min_tax_05pct: number;
  min_tax_applied: boolean;
  tax_before_credit: number;
  tax_credits: number;
  withholding_total: number;
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

export type ResolvedItem = {
  category: IncomeKey;
  amount: number;
  description: string;
  expense_mode: 'standard' | 'actual';
  actual_expense: number;
  variant: string;
  withholding: number;
};

/** 4) รวมเงินได้เป็นรายแหล่ง — ถ้ามี income_items ใช้รายการนั้น ไม่งั้นสร้างจากช่องยอดรวม */
export function buildItems(p: PitPerson): ResolvedItem[] {
  const items: ResolvedItem[] = [];
  for (const raw of p.income_items ?? []) {
    if (!raw || !(raw.category in EXPENSE_RULES)) continue;
    items.push({
      category: raw.category,
      amount: money(raw.amount),
      description: String(raw.description ?? ''),
      expense_mode: raw.expense_mode === 'actual' ? 'actual' : 'standard',
      actual_expense: money(raw.actual_expense),
      variant: String(raw.variant ?? ''),
      withholding: money(raw.withholding),
    });
  }
  if (items.some((i) => i.amount > 0)) return items;

  (['salary', 'service', 'royalty', 'interest', 'rent', 'professional', 'contractor', 'business'] as IncomeKey[])
    .forEach((cat) => {
      const amt = money(p[cat]);
      if (amt <= 0) return;
      const actual = money(p.actual_expense?.[cat]);
      items.push({
        category: cat,
        amount: amt,
        description: '',
        expense_mode: actual > 0 ? 'actual' : 'standard',
        actual_expense: actual,
        variant: cat === 'professional' && p.medical_professional ? 'medical' : '',
        withholding: 0,
      });
    });
  return items;
}

export function itemRate(it: { category: IncomeKey; variant: string }): number {
  const table = VARIANT_RATES[it.category];
  if (table) {
    const key = it.variant && table[it.variant] ? it.variant : Object.keys(table)[0];
    return table[key].rate;
  }
  return EXPENSE_RULES[it.category].rate;
}

export function itemRateLabel(it: { category: IncomeKey; variant: string }): string {
  const table = VARIANT_RATES[it.category];
  if (table && it.variant && table[it.variant]) return table[it.variant].label;
  return EXPENSE_RULES[it.category].label;
}

/** 5) หักค่าใช้จ่าย (แบบข้อ 5) */
export function computeExpenses(items: ResolvedItem[]): { lines: ExpenseLine[]; total: number } {
  const groups = new Map<string, { category: IncomeKey; how: string; rate: number | null; gross: number; ded: number }>();
  for (const it of items) {
    if (it.amount <= 0) continue;
    let rate: number | null;
    let how: string;
    if (it.category === 'interest') {
      rate = 0;
      how = 'หักค่าใช้จ่ายไม่ได้';
    } else if (it.expense_mode === 'actual') {
      rate = null;
      how = `ตามจริง (จ่ายจริง ${it.actual_expense.toLocaleString('en-US')} บาท)`;
    } else {
      rate = itemRate(it);
      how = `เหมา ${Math.round(rate * 100)}%${it.variant ? ` (${itemRateLabel(it)})` : ''}`;
    }
    const key = `${it.category}::${how}`;
    const g = groups.get(key) ?? { category: it.category, how, rate, gross: 0, ded: 0 };
    g.gross += it.amount;
    g.ded += rate === null ? Math.min(it.actual_expense, it.amount) : it.amount * rate;
    groups.set(key, g);
  }

  const all = Array.from(groups.values());
  const cap12 = all.filter((g) => g.category === 'salary' || g.category === 'service').reduce((s, g) => s + g.ded, 0);
  if (cap12 > SHARED_CAP_1_2) {
    let excess = cap12 - SHARED_CAP_1_2;
    [...all].sort((a, b) => b.ded - a.ded).forEach((g) => {
      if ((g.category === 'salary' || g.category === 'service') && excess > 0) {
        const cut = Math.min(g.ded, excess);
        g.ded -= cut;
        excess -= cut;
      }
    });
    const first = all.find((g) => g.category === 'salary' || g.category === 'service');
    if (first) first.how += ' · จำกัดเพดานรวม 40(1)+(2) 100,000 บาท';
  }
  const cap3 = all.filter((g) => g.category === 'royalty').reduce((s, g) => s + g.ded, 0);
  if (cap3 > CAP_40_3) {
    let excess = cap3 - CAP_40_3;
    all.forEach((g) => {
      if (g.category === 'royalty' && excess > 0) {
        const cut = Math.min(g.ded, excess);
        g.ded -= cut;
        excess -= cut;
        g.how += ' · จำกัดเพดาน 40(3) 100,000 บาท';
      }
    });
  }

  const order = Object.keys(EXPENSE_RULES) as IncomeKey[];
  const lines: ExpenseLine[] = all
    .map((g) => ({
      group: g.category as string,
      label: `${EXPENSE_RULES[g.category].label} — ${g.how}`,
      gross: r2(g.gross),
      deductible: r2(g.ded),
    }))
    .sort((a, b) => order.indexOf(a.group as IncomeKey) - order.indexOf(b.group as IncomeKey));

  return { lines, total: r2(lines.reduce((s, l) => s + l.deductible, 0)) };
}

/** 6) ค่าลดหย่อน (ใบแนบแสดงรายการลดหย่อนและยกเว้นหลังจากหักค่าใช้จ่าย) */
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

  if (p.personal !== false) add('personal', 'ค่าลดหย่อนส่วนตัว', LIM.personal);

  if (p.spouse_no_income && !marriedCombined) {
    add('spouse', 'ค่าลดหย่อนคู่สมรส (ไม่มีเงินได้)', LIM.spouse,
      'คู่สมรสมีเงินได้พึงประเมินไม่เกิน 60,000 บาท/ปี และจดทะเบียนสมรสถูกต้อง');
  } else if (p.spouse_no_income && marriedCombined) {
    notes.push('ยื่นรวมกับคู่สมรส → ใช้สิทธิลดหย่อนคู่สมรสไม่ได้ (แต่หักส่วนตัวของคู่สมรส 60,000 บาทได้)');
  }

  const kids = money(p.children);
  const kidsExtra = money(p.children_born_2561_plus);
  add('children',
    `ค่าลดหย่อนบุตร (${kids} คน${kidsExtra ? ` + บุตรคนที่ 2 ขึ้นไปเกิดตั้งแต่ 2561 อีก ${kidsExtra} คน` : ''})`,
    kids * LIM.child + kidsExtra * LIM.child_extra,
    'บุตรชอบด้วยกฎหมาย คนละ 30,000 · บุตรคนที่ 2+ เกิดตั้งแต่ปี 2561 ได้เพิ่มอีก 30,000');

  const adopted = Math.min(money(p.adopted_children), LIM.adopted_max);
  add('adopted_children', `ค่าลดหย่อนบุตรบุญธรรม (${adopted} คน)`, adopted * LIM.adopted_child,
    'คนละ 60,000 บาท ไม่เกิน 3 คน');

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
    Math.min(money(p.parent_health_insurance), LIM.parent_health), 'ไม่เกิน 15,000 บาท');
  if (!marriedCombined) {
    add('spouse_life_insurance', 'เบี้ยประกันชีวิตคู่สมรส (ไม่มีเงินได้)',
      Math.min(money(p.spouse_life_insurance), LIM.spouse_life), 'ไม่เกิน 10,000 บาท');
  }
  add('social_security', 'เงินสมทบกองทุนประกันสังคม (มาตรา 33)',
    Math.min(money(p.social_security), LIM.social_security), 'ตามที่จ่ายจริง ไม่เกิน 9,000 บาท/ปี');

  const orders: Array<{ key: keyof PitPerson & string; label: string; cap: number; note: string }> = [
    { key: 'provident_fund', label: 'เงินสะสมกองทุนสำรองเลี้ยงชีพ', cap: LIM.retirement_cap, note: '15% ของเงินได้ ไม่เกิน 500,000' },
    { key: 'gpf', label: 'เงินสะสม กบข.', cap: LIM.retirement_cap, note: '30% ของเงินได้ ไม่เกิน 500,000' },
    { key: 'teacher_fund', label: 'เงินสะสมกองทุนสงเคราะห์ครูโรงเรียนเอกชน', cap: LIM.retirement_cap, note: '15% ของเงินได้ ไม่เกิน 500,000' },
    { key: 'pension_life_insurance', label: 'เบี้ยประกันชีวิตแบบบำนาญ', cap: LIM.pension_life, note: '15% ของเงินได้ ไม่เกิน 200,000' },
    { key: 'rmf', label: 'ค่าซื้อหน่วยลงทุน RMF', cap: LIM.retirement_cap, note: '30% ของเงินได้ ไม่เกิน 500,000' },
    { key: 'ssf', label: 'ค่าซื้อหน่วยลงทุน SSF', cap: 200_000, note: '30% ของเงินได้ ไม่เกิน 200,000' },
  ];
  const retirement: Array<{ key: string; label: string; amount: number; note: string }> = [];
  orders.forEach((o) => {
    const raw = money(p[o.key] as number);
    if (raw <= 0) return;
    retirement.push({
      key: o.key, label: o.label, note: o.note,
      amount: Math.min(raw, assessable * (PCT_RULES[o.key] ?? 0), o.cap),
    });
  });
  let over = retirement.reduce((s, i) => s + i.amount, 0) - LIM.retirement_cap;
  if (over > 0) {
    for (let i = retirement.length - 1; i >= 0 && over > 0; i -= 1) {
      const cutAmt = Math.min(retirement[i].amount, over);
      retirement[i].amount -= cutAmt;
      over -= cutAmt;
    }
    notes.push('กองทุนเกษียณ (สำรองเลี้ยงชีพ/กบข./สงเคราะห์ครู/ประกันบำนาญ/RMF/SSF) รวมกันไม่เกิน 500,000 บาท/ปี — ปรับลดส่วนเกินให้แล้ว');
  }
  retirement.forEach((i) => add(i.key, i.label, i.amount, i.note));

  add('nsf', 'เงินสะสมกองทุนการออมแห่งชาติ (กอช.)', Math.min(money(p.nsf), LIM.nsf), 'ตามที่จ่ายจริง ไม่เกิน 30,000 บาท');
  add('thai_esg', 'ค่าซื้อหน่วยลงทุน Thai ESG',
    Math.min(money(p.thai_esg), assessable * 0.3, LIM.thai_esg), '30% ของเงินได้ ไม่เกิน 300,000 บาท');
  add('thai_esgx', 'ค่าซื้อหน่วยลงทุน Thai ESGX (เฉพาะปีภาษี 2568)',
    Math.min(money(p.thai_esgx), assessable * 0.3, 300_000), 'ลงทุนใหม่ 1 พ.ค.–30 มิ.ย. 2568');
  add('social_enterprise', 'เงินลงทุนวิสาหกิจเพื่อสังคม (Social Enterprise)',
    Math.min(money(p.social_enterprise), LIM.social_enterprise), 'ไม่เกิน 100,000 บาท');

  add('home_loan_interest', 'ดอกเบี้ยเงินกู้ยืมเพื่อที่อยู่อาศัย',
    Math.min(money(p.home_loan_interest), LIM.home_loan_interest), 'ตามที่จ่ายจริง ไม่เกิน 100,000 บาท');
  add('easy_e_receipt', 'มาตรการ Easy E-Receipt 2.0 (16 ม.ค.–28 ก.พ. 2568)',
    Math.min(money(p.easy_e_receipt), LIM.easy_e_receipt), 'ไม่เกิน 50,000 บาท ต้องมี e-Tax Invoice');
  add('travel_main_city', 'เที่ยวดีมีคืน 2568 — ท่องเที่ยวเมืองหลัก (29 ต.ค.–15 ธ.ค. 2568)',
    Math.min(money(p.travel_main_city), LIM.travel_main), '1 เท่าของที่จ่ายจริง ไม่เกิน 20,000 บาท');
  add('travel_secondary_city', 'เที่ยวดีมีคืน 2568 — ท่องเที่ยวเมืองรอง 55 จังหวัด',
    Math.min(Math.min(money(p.travel_secondary_city), LIM.travel_main) * 1.5, LIM.travel_secondary),
    '1.5 เท่าของที่จ่ายจริง (จ่ายจริงไม่เกิน 20,000) รวมไม่เกิน 30,000 บาท');
  add('other_measure_amount', 'มาตรการรัฐอื่นของปีภาษี (เช่น ค่าติดตั้งโซลาร์รูฟท็อป)',
    money(p.other_measure_amount), 'ใส่ยอดที่ใช้สิทธิได้จริงตามหลักฐาน');

  return { items, subtotal: r2(items.reduce((s, i) => s + i.amount, 0)), notes };
}

/** 7) ภาษีขั้นบันได (แบบข้อ 8) */
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
      range: `${lower === 0 ? '0' : `${lower.toLocaleString('en-US')}+1`} – ${!Number.isFinite(upper) ? 'ขึ้นไป' : upper.toLocaleString('en-US')}`,
      rate, amount: r2(amount), tax: r2(stepTax),
    });
    lower = upper;
  }
  return { tax: r2(tax), steps, marginalRate: steps.length ? steps[steps.length - 1].rate : 0 };
}

/** 8) เครื่องยนต์หลัก — เดินตามแบบ ภ.ง.ด.90 ข้อ 1 → ข้อ 14 */
export function computePit(persons: PitPerson[], year: number = DEFAULT_TAX_YEAR): PitResult {
  if (!persons || persons.length === 0) throw new Error('ต้องมีข้อมูลผู้เสียภาษีอย่างน้อย 1 คน');
  const marriedCombined = persons.length > 1;

  // ข้อ 1–7: เงินได้ + ค่าใช้จ่าย
  const grossByCat = {
    salary: 0, service: 0, royalty: 0, interest: 0, rent: 0, professional: 0, contractor: 0, business: 0,
  } as Record<IncomeKey, number>;
  const expenseLines: ExpenseLine[] = [];
  const itemRows: IncomeItemRow[] = [];
  let expensesTotal = 0;
  let creditsFromItems = 0;
  let creditsFlat = 0;

  persons.forEach((p, idx) => {
    const personItems = buildItems(p);
    const hasItems = personItems.some((i) => i.amount > 0);
    personItems.forEach((it) => {
      grossByCat[it.category] += it.amount;
      if (it.amount <= 0) return;
      if (hasItems) creditsFromItems += it.withholding;
      itemRows.push({
        owner: marriedCombined && idx > 0 ? 'คู่สมรส' : 'ผู้มีเงินได้',
        category: it.category,
        category_label: EXPENSE_RULES[it.category].label,
        description: it.description,
        amount: r2(it.amount),
        variant: it.variant,
        variant_label: it.variant ? itemRateLabel(it) : '',
        expense_mode: it.expense_mode,
        withholding: r2(it.withholding),
      });
    });
    if (!hasItems) creditsFlat += money(p.withholding);
    const exp = computeExpenses(personItems);
    exp.lines.forEach((l) => {
      expenseLines.push(marriedCombined && idx > 0 ? { ...l, label: `(คู่สมรส) ${l.label}` } : l);
    });
    expensesTotal += exp.total;
  });

  const grossTotal = r2(Object.values(grossByCat).reduce((s, v) => s + v, 0));
  expensesTotal = r2(expensesTotal);
  const incomeAfterExpense = r2(Math.max(0, grossTotal - expensesTotal));   // แบบข้อ 1

  // เงินได้ที่ได้รับยกเว้น
  const exemptions: Array<{ label: string; amount: number; note?: string }> = [];
  const seniorCap = LIM.senior_disabled_exemption * (marriedCombined ? 2 : 1);
  const seniorExempt = Math.min(persons.reduce((s, p) => s + money(p.senior_or_disabled_exemption), 0), seniorCap);
  if (seniorExempt > 0) {
    exemptions.push({
      label: 'ยกเว้นเงินได้ผู้มีอายุ 65 ปีขึ้นไป หรือผู้พิการ/ทุพพลภาพ',
      amount: r2(seniorExempt), note: 'ไม่เกิน 190,000 บาท/ปี ต่อคน',
    });
  }
  const construction = persons.reduce((s, p) => s + money(p.home_construction_cost), 0);
  if (construction > 0) {
    exemptions.push({
      label: 'ยกเว้นเงินได้ค่าจ้างก่อสร้างบ้านใหม่ (มาตรการล้านละหมื่น)',
      amount: r2(Math.min(Math.floor(construction / 1_000_000) * 10_000, LIM.home_construction_exempt)),
      note: '10,000 บาทต่อค่าก่อสร้าง 1,000,000 (ไม่เกิน 100,000) สัญญา 9 เม.ย. 2567–31 ธ.ค. 2568',
    });
  }
  const exemptionsTotal = r2(exemptions.reduce((s, e) => s + e.amount, 0));

  // ข้อ 2: ค่าลดหย่อน (ยกเว้นเงินบริจาค)
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

  // ข้อ 3–6: เงินบริจาคตามลำดับในแบบ
  const base3 = Math.max(0, incomeAfterExpense - exemptionsTotal - allowancesBeforeDonation);  // ข้อ 3
  const capEdu = base3 * 0.1;
  const donEduActual = persons.reduce((s, p) => s + money(p.donation_education), 0);
  const donEdu = Math.min(donEduActual * 2, capEdu);                                          // ข้อ 4
  const base5 = Math.max(0, base3 - donEdu);                                                  // ข้อ 5
  const capGen = base5 * 0.1;
  const donGenActual = persons.reduce((s, p) => s + money(p.donation_general), 0);
  const donGen = Math.min(donGenActual, capGen);                                              // ข้อ 6
  const donPol = Math.min(persons.reduce((s, p) => s + money(p.donation_political), 0), LIM.donation_political);
  if (donEdu > 0) {
    allowanceItems.push({
      code: 'donation_education',
      label: `เงินบริจาคสนับสนุนการศึกษา/กีฬา/สถานพยาบาลรัฐ (2 เท่าของ ${donEduActual.toLocaleString('en-US')})`,
      amount: r2(donEdu), note: `แบบข้อ 4 — ไม่เกิน 10% ของข้อ 3 (${capEdu.toLocaleString('en-US')} บาท)`,
    });
    if (donEduActual * 2 > capEdu) {
      allowanceNotes.push('เงินบริจาคการศึกษา 2 เท่า ถูกจำกัดด้วยเพดาน 10% ของเงินได้หลังหักค่าใช้จ่ายและลดหย่อน (แบบข้อ 4)');
    }
  }
  if (donGen > 0) {
    allowanceItems.push({
      code: 'donation_general', label: 'เงินบริจาคทั่วไป (1 เท่า)', amount: r2(donGen),
      note: `แบบข้อ 6 — ไม่เกิน 10% ของข้อ 5 (${capGen.toLocaleString('en-US')} บาท)`,
    });
    if (donGenActual > capGen) {
      allowanceNotes.push('เงินบริจาคทั่วไปถูกจำกัดด้วยเพดาน 10% ของเงินได้คงเหลือหลังหักบริจาคการศึกษา (แบบข้อ 6)');
    }
  }
  if (donPol > 0) {
    allowanceItems.push({
      code: 'donation_political', label: 'เงินบริจาคให้พรรคการเมือง', amount: r2(donPol), note: 'ไม่เกิน 10,000 บาท',
    });
  }
  const allowancesTotal = r2(allowanceItems.reduce((s, i) => s + i.amount, 0));

  // ข้อ 7: เงินได้สุทธิ
  const netIncome = r2(Math.max(0, base5 - donGen - donPol));

  // ข้อ 8–10: วิธีที่ 1 เทียบ วิธีที่ 2
  const bracket = progressiveTax(netIncome);
  const taxMethod1 = bracket.tax;
  const gross2to8 = r2(grossTotal - grossByCat.salary);
  const method2Applies = gross2to8 >= LIM.min_tax_threshold;
  const taxMethod2 = r2(gross2to8 * LIM.min_tax_rate);
  const method2Used = Boolean(method2Applies && taxMethod2 > LIM.min_tax_exempt && taxMethod2 > taxMethod1);
  let method2Note = '';
  if (!method2Applies) {
    method2Note = `เงินได้ไม่รวม 40(1) = ${gross2to8.toLocaleString('en-US')} บาท ไม่ถึง 120,000 บาท → ไม่ต้องคำนวณภาษีวิธีที่ 2 (แบบข้อ 9)`;
  } else if (taxMethod2 <= LIM.min_tax_exempt) {
    method2Note = `ภาษีวิธีที่ 2 คำนวณได้ ${taxMethod2.toLocaleString('en-US')} บาท ไม่เกิน 5,000 บาท → ได้รับยกเว้นภาษีวิธีที่ 2 ใช้จำนวนภาษีตามวิธีที่ 1 (หมายเหตุท้ายแบบข้อ 9)`;
  }
  const taxBeforeCredit = method2Used ? taxMethod2 : taxMethod1;

  // ข้อ 13
  const credits = r2(creditsFromItems + creditsFlat
    + persons.reduce((s, p) => s + money(p.dividend_credit), 0)
    + persons.reduce((s, p) => s + money(p.pnd93) + money(p.pnd94), 0));
  const netPayable = r2(taxBeforeCredit - credits);

  const salaryOnly = gross2to8 <= 0;
  const fileThreshold = salaryOnly ? 60_000 : 120_000;

  return {
    program: 'thai_tax_calculator.py',
    version: TAX_CALC_VERSION,
    year,
    filing_mode: marriedCombined ? 'ยื่นรวมกับคู่สมรส (ภ.ง.ด.90)' : 'ยื่นคนเดียว (ภ.ง.ด.90/91)',
    form_reference: 'โครงสร้างและลำดับการคำนวณตามแบบ ภ.ง.ด.90 ของกรมสรรพากร (ข้อ 1–14)',
    income_items: itemRows,
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
    base_after_allowances: r2(base3),
    donation_caps: { education_10pct_of_item3: r2(capEdu), general_10pct_of_item5: r2(capGen) },
    net_income: netIncome,
    bracket_steps: bracket.steps,
    tax_by_bracket: taxMethod1,
    marginal_rate: bracket.marginalRate,
    tax_method1: taxMethod1,
    tax_method2: taxMethod2,
    method2_applies: method2Applies,
    method2_note: method2Note,
    min_tax_05pct: taxMethod2,
    min_tax_applied: method2Used,
    tax_before_credit: r2(taxBeforeCredit),
    tax_credits: credits,
    withholding_total: r2(creditsFromItems + creditsFlat),
    net_payable: netPayable,
    result: netPayable > 0.5 ? 'ต้องชำระเพิ่ม' : netPayable < -0.5 ? 'ขอคืนภาษี' : 'ไม่มีภาษีต้องชำระ/ขอคืน',
    must_file: grossTotal > fileThreshold,
    file_threshold: fileThreshold,
    sources: PIT_SOURCES,
    disclaimer: PIT_DISCLAIMER,
  };
}
