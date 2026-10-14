/**
 * thaiPit.ts — เครื่องคำนวณภาษีเงินได้บุคคลธรรมดา v3.0.0
 * ---------------------------------------------------------------------------
 * โครงสร้าง/ลำดับ/เลขข้อ ตรงตามเอกสารราชการปีภาษี 2568:
 *   • แบบ ภ.ง.ด.90 ข้อ 1–7 (เงินได้ + ค่าใช้จ่าย) และ ข้อ 11 การคำนวณภาษี 1.–16.
 *   • ใบแนบแสดงรายละเอียดรายการลดหย่อนและยกเว้นหลังจากหักค่าใช้จ่าย ข้อ 1.–24.
 *     (ข้อ 8 = สำรองเลี้ยงชีพส่วนไม่เกิน 10,000 · ข้อ 9 กอช. · ข้อ 13 CCTV · ข้อ 15 พรรคการเมือง
 *      · ข้อ 17 Easy E-Receipt 2.0 (17.1–17.4) · ข้อ 19 Thai ESGX (19.1–19.2)
 *      · ข้อ 20 ค่าจ้างก่อสร้างบ้าน · ข้อ 21 งานศิลปะ · ข้อ 22 เที่ยวดีมีคืน (22.1–22.2) · ข้อ 23 อื่น ๆ)
 *   • เงินสะสมสำรองเลี้ยงชีพ ส่วนที่เกิน 10,000 + กบข. + กองทุนสงเคราะห์ครู + เงินค่าชดเชย
 *     หักที่ "แบบ ข้อ 2(1)–(4)" ก่อนคิดค่าใช้จ่าย 50% (ข้อ 5) ตามตัวแบบจริง
 *
 * แหล่งอ้างอิง: ไฟล์ราชการที่ดาวน์โหลดจาก rd.go.th (ไฟล์ในเครื่องผู้ใช้:
 *   C:\Users\User\Desktop\เอกสารภาษี-กรมสรรพากร-2568) และ https://www.rd.go.th/67335.html
 *
 * ⚠️ แก้กติกาที่ไฟล์นี้ = ต้องแก้ python/thai_tax_calculator.py ให้ตรงกัน
 *    (ชุดทดสอบร่วม: python/testcases_thai_pit.json · GET /api/tax/thai-pit?selftest=1)
 */

export const TAX_CALC_VERSION = '3.0.0';
export const DEFAULT_TAX_YEAR = 2568;

/** อัตราภาษีขั้นบันได (แบบ ข้อ 11.8 — มาตรา 48(1)) */
export const TAX_BRACKETS: Array<[number, number]> = [
  [150_000, 0.0], [300_000, 0.05], [500_000, 0.1], [750_000, 0.15],
  [1_000_000, 0.2], [2_000_000, 0.25], [5_000_000, 0.3], [Number.POSITIVE_INFINITY, 0.35],
];

export type IncomeKey =
  | 'salary' | 'service' | 'royalty' | 'interest'
  | 'rent' | 'professional' | 'contractor' | 'business';

/** หัวข้อเงินได้ตามแบบ ภ.ง.ด.90 ข้อ 1–7 */
export const INCOME_SECTION: Record<IncomeKey, { form: string; label: string; short: string }> = {
  salary: { form: 'ข้อ 1', label: 'มาตรา 40(1) เงินเดือน ค่าจ้าง บำนาญ ฯลฯ', short: 'เงินเดือน/ค่าจ้าง (40(1))' },
  service: { form: 'ข้อ 3', label: 'มาตรา 40(2) เบี้ยประชุม ค่านายหน้า ฯลฯ', short: 'รับทำงานให้/ค่านายหน้า (40(2))' },
  royalty: { form: 'ใบแนบ ข้อ 2', label: 'มาตรา 40(3) ค่าแห่งลิขสิทธิ์/กู๊ดวิลล์/สิทธิอย่างอื่น', short: 'ค่าแห่งลิขสิทธิ์/กู๊ดวิลล์ (40(3))' },
  interest: { form: 'ใบแนบ ข้อ 3', label: 'มาตรา 40(4) ดอกเบี้ย เงินปันผล ส่วนแบ่งกำไร', short: 'ดอกเบี้ย/เงินปันผล (40(4))' },
  rent: { form: 'ใบแนบ ข้อ 4', label: 'มาตรา 40(5) ค่าเช่าทรัพย์สิน/ผิดสัญญาเช่าซื้อ', short: 'ค่าเช่าทรัพย์สิน (40(5))' },
  professional: { form: 'ใบแนบ ข้อ 5', label: 'มาตรา 40(6) วิชาชีพอิสระ', short: 'วิชาชีพอิสระ (40(6))' },
  contractor: { form: 'ใบแนบ ข้อ 6', label: 'มาตรา 40(7) รับเหมาก่อสร้าง', short: 'รับเหมาก่อสร้าง (40(7))' },
  business: { form: 'ใบแนบ ข้อ 7', label: 'มาตรา 40(8) ธุรกิจ/พาณิชย์/เกษตร/อุตสาหกรรม/ขนส่ง/อื่น ๆ', short: 'ธุรกิจ/อื่น ๆ (40(8))' },
};

/** ค่าใช้จ่ายแบบเหมา (แบบ ข้อ 5 และใบแนบข้อ 2/4/5/6/7) */
export const EXPENSE_RULES: Record<IncomeKey, { label: string; rate: number; cap: number | null }> = {
  salary: { label: 'เงินเดือน ค่าจ้าง โบนัส เบี้ยเลี้ยง', rate: 0.5, cap: 100_000 },
  service: { label: 'รับทำงานให้ ค่านายหน้า เบี้ยประชุม', rate: 0.5, cap: 100_000 },
  royalty: { label: 'ค่าแห่งลิขสิทธิ์/กู๊ดวิลล์/สิทธิอย่างอื่น', rate: 0.5, cap: 100_000 },
  interest: { label: 'ดอกเบี้ย เงินปันผล ส่วนแบ่งกำไร', rate: 0.0, cap: 0 },
  rent: { label: 'ค่าเช่าทรัพย์สิน/ผิดสัญญาเช่าซื้อ', rate: 0.3, cap: null },
  professional: { label: 'วิชาชีพอิสระ', rate: 0.3, cap: null },
  contractor: { label: 'รับเหมาก่อสร้าง', rate: 0.6, cap: null },
  business: { label: 'ธุรกิจ/พาณิชย์/อื่น ๆ', rate: 0.6, cap: null },
};

export const SHARED_CAP_1_2 = 100_000;
export const CAP_40_3 = 100_000;

/** ประเภทย่อยตามแบบ (ใบแนบข้อ 4 "อื่น ๆ ระบุ ร้อยละ..." / ข้อ 5 / ข้อ 7) */
export const VARIANT_RATES: Partial<Record<IncomeKey, Record<string, { rate: number; label: string }>>> = {
  rent: {
    building: { rate: 0.3, label: 'บ้าน โรงเรือน สิ่งปลูกสร้างอย่างอื่น หรือแพ (ร้อยละ 30)' },
    vehicle: { rate: 0.3, label: 'ยานพาหนะ (ร้อยละ 30)' },
    agri_land: { rate: 0.2, label: 'ที่ดินที่ใช้ในการเกษตร (ร้อยละ 20)' },
    other_land: { rate: 0.15, label: 'ที่ดินที่มิได้ใช้ในการเกษตร (ร้อยละ 15)' },
    other: { rate: 0.1, label: 'ทรัพย์สินอื่น (ร้อยละ 10)' },
  },
  professional: {
    medical: { rate: 0.6, label: 'การประกอบโรคศิลปะ (ร้อยละ 60)' },
    fine_arts: { rate: 0.6, label: 'ประณีตศิลปกรรม (ร้อยละ 60)' },
    other: { rate: 0.3, label: 'อื่น ๆ กฎหมาย วิศวกรรม สถาปัตยกรรม การบัญชี (ร้อยละ 30)' },
  },
  business: {
    general: { rate: 0.6, label: 'ธุรกิจ/พาณิชย์/เกษตร/อุตสาหกรรม/อื่น ๆ (ร้อยละ 60)' },
    transport: { rate: 0.6, label: 'การขนส่งหรือรับจ้างด้วยยานพาหนะ (ร้อยละ 60)' },
    entertainer: { rate: 0.6, label: 'นักแสดง นักร้อง นักดนตรี นักกีฬาอาชีพ (ร้อยละ 60 ส่วนไม่เกิน 300,000 · ร้อยละ 40 ส่วนที่เกิน · รวมไม่เกิน 600,000)' },
  },
};

/** กติกาพิเศษท้ายตารางที่ 2 ของคำชี้แจง ภ.ง.ด.90 — ข้อ (1) นักแสดง/นักกีฬาอาชีพ */
export const ENTERTAINER_RULE = { tier: 300_000, tier1_rate: 0.6, tier2_rate: 0.4, cap: 600_000 };

/**
 * ค่าใช้จ่ายเหมาของกลุ่มเงินได้หนึ่ง ๆ
 * ปกติ = เงินได้ × อัตรา · ยกเว้น 40(8) ประเภทนักแสดง/นักกีฬาอาชีพ ที่ใช้สองขั้นตามตารางที่ 2
 */
export function flatExpense(category: IncomeKey, variant: string, gross: number, rate: number): number {
  if (category === 'business' && variant === 'entertainer') {
    const t1 = Math.min(gross, ENTERTAINER_RULE.tier) * ENTERTAINER_RULE.tier1_rate;
    const t2 = Math.max(0, gross - ENTERTAINER_RULE.tier) * ENTERTAINER_RULE.tier2_rate;
    return Math.min(t1 + t2, ENTERTAINER_RULE.cap);
  }
  return gross * rate;
}

/** เพดานและเงื่อนไขตามเอกสารปีภาษี 2568 */
export const LIM = {
  personal: 60_000,            // ใบแนบ ข้อ 1 (กรณีพิเศษ 120,000 ตามที่กรมสรรพากรกำหนด)
  personal_special: 120_000,
  spouse: 60_000,              // ข้อ 2
  child: 30_000,               // ข้อ 3
  child_2nd_born_2561: 60_000, // ข้อ 3 (บุตรตั้งแต่คนที่ 2 ที่เกิดใน/หลังปี 2561)
  parent: 30_000,              // ข้อ 4 (บิดา/มารดา ผู้มีเงินได้ และคู่สมรส)
  parent_max: 4,
  disabled_dependent: 60_000,  // ข้อ 5 (ยกมาจาก ล.ย.04)
  parent_health: 15_000,       // ข้อ 6
  life_insurance: 100_000,     // ข้อ 7.1
  health_insurance: 25_000,    // ข้อ 7.2
  life_health_combined: 100_000,
  pension_life: 200_000,       // ข้อ 7.3
  spouse_life: 10_000,
  provident_allowance: 10_000, // ข้อ 8 (ส่วนที่ไม่เกิน 10,000)
  nsf: 30_000,                 // ข้อ 9 กอช.
  rmf: 500_000,                // ข้อ 10
  home_loan_interest: 100_000, // ข้อ 11
  social_security: 9_000,      // ข้อ 12
  cctv: 100_000,               // ข้อ 13 (เขตพัฒนาพิเศษเฉพาะกิจ · เงินได้ 40(5)–(8))
  prenatal: 60_000,            // ข้อ 14
  donation_political: 10_000,  // ข้อ 15
  social_enterprise: 100_000,  // ข้อ 16
  easy_e_receipt: 50_000,      // ข้อ 17 (รวม 17.1–17.4)
  thai_esg: 300_000,           // ข้อ 18
  thai_esgx: 300_000,          // ข้อ 19
  home_construction: 100_000,  // ข้อ 20 (ล้านละหมื่น)
  art: 100_000,                // ข้อ 21
  travel_main: 20_000,         // ข้อ 22.1
  travel_secondary: 30_000,    // ข้อ 22.2
  ssf: 200_000,                // ข้อ 23 (อื่น ๆ)
  retirement_cap: 500_000,     // วงเงินรวมกลุ่มเกษียณ
  adopted_child: 60_000,       // ใช้ในกรณีบุตรบุญธรรม
  adopted_max: 3,
  senior_disabled_exemption: 190_000,
  min_tax_rate: 0.005,         // แบบ ข้อ 11.9
  min_tax_threshold: 120_000,
  min_tax_exempt: 5_000,
} as const;

export const PCT_RULES: Record<string, number> = {
  provident_fund: 0.15, gpf: 0.3, teacher_fund: 0.15,
  rmf: 0.3, ssf: 0.3, pension_life_insurance: 0.15,
  thai_esg: 0.3, thai_esgx: 0.3,
};

export const EFFECTIVE_TAX_YEARS = [2568, 2569];

export const PIT_SOURCES = [
  'แบบ ภ.ง.ด.90 + ใบแนบแสดงรายละเอียดรายการลดหย่อนและยกเว้น ปีภาษี 2568 (ไฟล์ราชการในเครื่อง: Desktop\\เอกสารภาษี-กรมสรรพากร-2568)',
  'หน้าดาวน์โหลดแบบ ภ.ง.ด. ปี 2568 กรมสรรพากร: https://www.rd.go.th/67335.html',
  'การหักค่าใช้จ่าย (อัตราเหมาแยกประเภทเงินได้): https://www.rd.go.th/556.html',
  'วิธีการคำนวณภาษีเงินได้บุคคลธรรมดาสิ้นปี (วิธีที่ 1 / วิธีที่ 2): https://rd.go.th/555.html',
];

export const PIT_DISCLAIMER =
  'โปรแกรมนี้ทำตามลำดับข้อของแบบ ภ.ง.ด.90 และใบแนบลดหย่อน ปีภาษี 2568 เพื่อประมาณการภาษีก่อนยื่นแบบ ' +
  'ไม่ใช่การวินิจฉัยภาษีอย่างเป็นทางการ — กรณีสิทธิพิเศษเฉพาะราย โปรดตรวจสอบกับสำนักงานสรรพากร (โทร. 1161)';

export type PitIncomeItem = {
  category: IncomeKey;
  amount: number;
  description?: string;
  expense_mode?: 'standard' | 'actual';
  actual_expense?: number;
  variant?: string;
  withholding?: number;
};

/** ข้อมูลผู้เสียภาษี 1 คน — ชื่อช่องตรงกับข้อในแบบ/ใบแนบ */
export type PitPerson = {
  income_items?: PitIncomeItem[];
  salary?: number; service?: number; royalty?: number; interest?: number;
  rent?: number; professional?: number; contractor?: number; business?: number;
  medical_professional?: boolean;
  actual_expense?: Partial<Record<IncomeKey, number>>;

  // ── แบบ ข้อ 2(1)–(4): หักจากเงินได้ 40(1) ก่อนคิดค่าใช้จ่าย ──
  provident_fund?: number;     // 2(1) ส่วนที่เกิน 10,000 (ข้อ 8 = 10,000 แรก)
  gpf?: number;                // 2(2) เงินสะสม กบข.
  teacher_fund?: number;       // 2(3) กองทุนสงเคราะห์ครูโรงเรียนเอกชน
  severance_pay?: number;      // 2(4) เงินค่าชดเชยตามกฎหมายแรงงาน (กรณีนำมารวมคำนวณ)

  // ── ใบแนบ ข้อ 1–23 ──
  personal?: boolean;
  personal_special?: boolean;  // ข้อ 1 กรณี 120,000
  spouse_no_income?: boolean;  // ข้อ 2
  children?: number;           // ข้อ 3 (คนละ 30,000)
  children_2nd_2561?: number;  // ข้อ 3 (คนที่ 2 ขึ้นไปเกิดใน/หลัง 2561 → 60,000)
  children_born_2561_plus?: number; // alias เดิมของ children_2nd_2561
  adopted_children?: number;
  parents?: number;            // ข้อ 4 (0–4 ช่อง: บิดา/มารดา ผู้มีเงินได้ + คู่สมรส)
  disabled_dependents?: number; // ข้อ 5 (ล.ย.04)
  parent_health_insurance?: number; // ข้อ 6
  life_insurance?: number;     // ข้อ 7.1
  health_insurance?: number;   // ข้อ 7.2
  pension_life_insurance?: number; // ข้อ 7.3
  spouse_life_insurance?: number;
  nsf?: number;                // ข้อ 9 กอช.
  rmf?: number;                // ข้อ 10
  home_loan_interest?: number; // ข้อ 11
  social_security?: number;    // ข้อ 12
  cctv_amount?: number;        // ข้อ 13
  pregnancies?: number;
  prenatal_expense?: number;   // ข้อ 14
  donation_political?: number; // ข้อ 15
  social_enterprise?: number;  // ข้อ 16
  e_receipt_general?: number;  // ข้อ 17.1
  e_receipt_books?: number;    // ข้อ 17.2
  e_receipt_ebooks?: number;   // ข้อ 17.3
  e_receipt_otop?: number;     // ข้อ 17.4
  easy_e_receipt?: number;     // alias เดิม: ยอดรวม Easy E-Receipt (ใช้เป็น 17.1)
  thai_esg?: number;           // ข้อ 18
  thai_esgx?: number;          // ข้อ 19.1
  thai_esgx_ltf_swap?: number; // ข้อ 19.2
  home_construction_cost?: number; // ข้อ 20 (ล้านละหมื่น)
  art_purchase?: number;       // ข้อ 21
  travel_main_city?: number;   // ข้อ 22.1
  travel_secondary_city?: number; // ข้อ 22.2
  ssf?: number;                // ข้อ 23 (อื่น ๆ)

  donation_general?: number;   // แบบ ข้อ 11.6
  donation_education?: number; // แบบ ข้อ 11.4
  senior_or_disabled_exemption?: number;
  other_measure_amount?: number; // ข้อ 23 อื่น ๆ

  // ── แบบ ข้อ 11.13 / 11.15 ──
  withholding?: number;
  dividend_credit?: number;
  pnd93?: number;
  pnd94?: number;
  foreign_tax_credit?: number;
};

/** รายการลดหย่อน 1 บรรทัด — item = เลขข้อในใบแนบ */
export type AllowanceItem = { item: string; code: string; label: string; amount: number; note?: string };
export type ExpenseLine = { group: string; label: string; gross: number; deductible: number };
export type BracketStep = { range: string; rate: number; amount: number; tax: number };
export type IncomeItemRow = {
  owner: string; category: IncomeKey; form: string; category_label: string; description: string;
  amount: number; variant: string; variant_label: string; expense_mode: 'standard' | 'actual'; withholding: number;
};

export type PitResult = {
  program: string; version: string; year: number; filing_mode: string;
  form_reference: string;
  income_items: IncomeItemRow[];
  gross_total: number;
  expense_lines: ExpenseLine[];
  expenses_total: number;
  section2_items: Array<{ code: string; form: string; label: string; amount: number }>;
  section2_total: number;
  salary_after_section2: number;
  income_after_expense: number;            // แบบ ข้อ 11.1
  allowance_items: AllowanceItem[];
  allowances_total: number;                // ใบแนบ ข้อ 24 → แบบ ข้อ 11.2
  allowance_notes: string[];
  exemptions: Array<{ label: string; amount: number; note?: string }>;
  exemptions_total: number;
  item3_balance: number;                   // ข้อ 11.3
  donation_caps: { education_10pct_of_item3: number; general_10pct_of_item5: number };
  item4_education_donation: number;
  item5_balance: number;
  item6_general_donation: number;
  net_income: number;                      // ข้อ 11.7
  bracket_steps: BracketStep[];
  tax_by_bracket: number;
  marginal_rate: number;
  tax_method1: number;                     // ข้อ 11.8
  tax_method2: number;                     // ข้อ 11.9
  method2_applies: boolean;
  method2_note: string;
  min_tax_05pct: number;
  min_tax_applied: boolean;
  tax_before_credit: number;               // ข้อ 11.10
  item11_special_area: number;             // ข้อ 11.11
  item12_total_tax: number;                // ข้อ 11.12
  foreign_tax_credit: number;              // ข้อ 11.13
  item14_after_foreign_credit: number;     // ข้อ 11.14
  tax_credits: number;                     // ข้อ 11.15 (หัก ณ ที่จ่าย + เครดิต + 93 + 94)
  withholding_total: number;
  net_payable: number;                     // ข้อ 11.16
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
  category: IncomeKey; amount: number; description: string;
  expense_mode: 'standard' | 'actual'; actual_expense: number; variant: string; withholding: number;
};

export function buildItems(p: PitPerson): ResolvedItem[] {
  const items: ResolvedItem[] = [];
  for (const raw of p.income_items ?? []) {
    if (!raw || !(raw.category in EXPENSE_RULES)) continue;
    items.push({
      category: raw.category, amount: money(raw.amount), description: String(raw.description ?? ''),
      expense_mode: raw.expense_mode === 'actual' ? 'actual' : 'standard',
      actual_expense: money(raw.actual_expense), variant: String(raw.variant ?? ''), withholding: money(raw.withholding),
    });
  }
  if (items.some((i) => i.amount > 0)) return items;
  (['salary', 'service', 'royalty', 'interest', 'rent', 'professional', 'contractor', 'business'] as IncomeKey[])
    .forEach((cat) => {
      const amt = money(p[cat]);
      if (amt <= 0) return;
      const actual = money(p.actual_expense?.[cat]);
      items.push({
        category: cat, amount: amt, description: '',
        expense_mode: actual > 0 ? 'actual' : 'standard', actual_expense: actual,
        variant: cat === 'professional' ? (p.medical_professional ? 'medical' : 'other') : '',
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

/**
 * แบบ ข้อ 2(1)–(4): หักจากเงินได้ 40(1)+(2) ก่อนคิดค่าใช้จ่ายร้อยละ 50
 * (สำรองเลี้ยงชีพส่วนที่เกิน 10,000 · กบข. · กองทุนสงเคราะห์ครู · เงินค่าชดเชย)
 */
export function computeSection2(
  p: PitPerson,
  retirement: Record<string, number>,
): { items: Array<{ code: string; form: string; label: string; amount: number }>; total: number } {
  const items: Array<{ code: string; form: string; label: string; amount: number }> = [];
  const providentExcess = Math.max(0, (retirement.provident ?? 0) - LIM.provident_allowance);
  if (providentExcess > 0) {
    items.push({
      code: 'provident_excess', form: 'แบบ ข้อ 2(1)',
      label: 'เงินสะสมกองทุนสำรองเลี้ยงชีพ (ส่วนที่เกิน 10,000 บาท)', amount: r2(providentExcess),
    });
  }
  if (retirement.gpf > 0) {
    items.push({ code: 'gpf', form: 'แบบ ข้อ 2(2)', label: 'เงินสะสม กบข.', amount: r2(retirement.gpf) });
  }
  if (retirement.teacher > 0) {
    items.push({ code: 'teacher_fund', form: 'แบบ ข้อ 2(3)', label: 'เงินสะสมกองทุนสงเคราะห์ครูโรงเรียนเอกชน', amount: r2(retirement.teacher) });
  }
  const severance = money(p.severance_pay);
  if (severance > 0) {
    items.push({
      code: 'severance_pay', form: 'แบบ ข้อ 2(4)',
      label: 'เงินค่าชดเชยที่ได้รับตามกฎหมายแรงงาน (กรณีนำมารวมคำนวณภาษี)', amount: r2(severance),
    });
  }
  return { items, total: r2(items.reduce((s, i) => s + i.amount, 0)) };
}

/** ใบแนบข้อ 1–23: ค่าลดหย่อนและยกเว้นหลังจากหักค่าใช้จ่าย (ยังไม่รวมเงินบริจาคในข้อ 11.4/11.6) */
export function computeAllowances(
  p: PitPerson,
  assessable: number,
  marriedCombined: boolean,
  retirement: { provident: number; rmf: number; ssf: number; pension: number },
): { items: AllowanceItem[]; total: number; notes: string[] } {
  const items: AllowanceItem[] = [];
  const notes: string[] = [];
  const add = (item: string, code: string, label: string, amount: number, note = '') => {
    const v = r2(Math.max(0, amount));
    if (v > 0) items.push({ item, code, label, amount: v, note });
  };

  // ข้อ 1
  if (p.personal !== false) {
    const personal = p.personal_special ? LIM.personal_special : LIM.personal;
    add('1', 'personal', `ผู้มีเงินได้${p.personal_special ? ' (กรณี 120,000 บาท)' : ''}`, personal,
      'ปกติ 60,000 บาท (กรณี 120,000 เป็นไปตามที่กรมสรรพากรกำหนดเป็นรายกรณี)');
  }
  // ข้อ 2
  if (p.spouse_no_income) {
    add('2', 'spouse', 'คู่สมรส' + (marriedCombined ? ' (มีเงินได้รวมคำนวณภาษี)' : ' (ไม่มีเงินได้)'), LIM.spouse,
      'กรณีมีเงินได้รวมคำนวณภาษี หรือไม่มีเงินได้');
  }
  // ข้อ 3
  const kids = money(p.children);
  const kids2nd = Math.min(money(p.children_2nd_2561 ?? p.children_born_2561_plus), kids);
  if (kids > 0) {
    const base = Math.max(0, kids - kids2nd) * LIM.child;
    const extra = kids2nd * LIM.child_2nd_born_2561;
    add('3', 'children', `บุตร ${kids} คน${kids2nd ? ` (ในจำนวนนี้ ${kids2nd} คนเป็นบุตรคนที่ 2 ขึ้นไปเกิดใน/หลังปี 2561)` : ''}`,
      base + extra,
      `คนละ 30,000 บาท · บุตรตั้งแต่คนที่ 2 ที่เกิดในหรือหลังปี พ.ศ. 2561 คนละ 60,000 บาท`);
  }
  const adopted = Math.min(money(p.adopted_children), LIM.adopted_max);
  add('3.1', 'adopted_children', `บุตรบุญธรรม ${adopted} คน`, adopted * LIM.adopted_child, 'คนละ 60,000 บาท ไม่เกิน 3 คน');
  // ข้อ 4
  const parents = Math.min(money(p.parents), LIM.parent_max);
  add('4', 'parents', `อุปการะเลี้ยงดูบิดามารดา ${parents} คน`, parents * LIM.parent,
    'บิดา/มารดาของผู้มีเงินได้ และของคู่สมรส คนละ 30,000 บาท');
  // ข้อ 5
  add('5', 'disabled_dependents', `อุปการะเลี้ยงดูคนพิการ/คนทุพพลภาพ ${money(p.disabled_dependents)} คน`,
    money(p.disabled_dependents) * LIM.disabled_dependent, 'ยกมาจากแบบ ล.ย.04 · คนละ 60,000 บาท');
  // ข้อ 6
  add('6', 'parent_health', 'เบี้ยประกันสุขภาพบิดามารดาของผู้มีเงินได้และคู่สมรส',
    Math.min(money(p.parent_health_insurance), LIM.parent_health), 'ตามที่จ่ายจริง ไม่เกิน 15,000 บาท');
  // ข้อ 7
  let life = Math.min(money(p.life_insurance), LIM.life_insurance);
  let health = Math.min(money(p.health_insurance), LIM.health_insurance);
  let cut = Math.max(0, life + health - LIM.life_health_combined);
  if (cut > 0) {
    health = Math.max(0, health - cut);
    cut = Math.max(0, life + health - LIM.life_health_combined);
    if (cut > 0) life = Math.max(0, life - cut);
    notes.push('ข้อ 7.1 + 7.2 เบี้ยประกันชีวิตและประกันสุขภาพ รวมกันไม่เกิน 100,000 บาท (ตัดส่วนเกินให้แล้ว)');
  }
  add('7.1', 'life_insurance', 'เบี้ยประกันชีวิต', life, 'ตามที่จ่ายจริง ไม่เกิน 100,000 บาท');
  add('7.2', 'health_insurance', 'เบี้ยประกันสุขภาพ', health, 'ไม่เกิน 25,000 บาท และรวมกับ 7.1 ไม่เกิน 100,000 บาท');
  add('7.3', 'pension_life', 'เบี้ยประกันชีวิตแบบบำนาญ', retirement.pension,
    '15% ของเงินได้ ไม่เกิน 200,000 บาท (นับในวงเงินเกษียณ 500,000)');
  if (!marriedCombined) {
    add('7.4', 'spouse_life', 'เบี้ยประกันชีวิตคู่สมรส (ไม่มีเงินได้)',
      Math.min(money(p.spouse_life_insurance), LIM.spouse_life), 'ไม่เกิน 10,000 บาท');
  }
  // ข้อ 8
  add('8', 'provident_10k', 'เงินสะสมกองทุนสำรองเลี้ยงชีพ (ส่วนที่ไม่เกิน 10,000 บาท)',
    Math.min(retirement.provident, LIM.provident_allowance),
    'ส่วนที่เกิน 10,000 บาท หักเป็นเงินได้ที่ได้รับยกเว้นในแบบ ข้อ 2(1)');
  // ข้อ 9
  add('9', 'nsf', 'เงินสะสมกองทุนการออมแห่งชาติ (กอช.)', Math.min(money(p.nsf), LIM.nsf),
    'ตามที่จ่ายจริง ไม่เกิน 30,000 บาท');
  // ข้อ 10
  add('10', 'rmf', 'ค่าซื้อหน่วยลงทุนในกองทุนรวมเพื่อการเลี้ยงชีพ (RMF)', retirement.rmf,
    '30% ของเงินได้ ไม่เกิน 500,000 บาท');
  // ข้อ 11
  add('11', 'home_loan_interest', 'ดอกเบี้ยเงินกู้ยืมเพื่อซื้อ เช่าซื้อ หรือสร้างอาคารอยู่อาศัย',
    Math.min(money(p.home_loan_interest), LIM.home_loan_interest), 'ตามที่จ่ายจริง ไม่เกิน 100,000 บาท');
  // ข้อ 12
  add('12', 'social_security', 'เงินสมทบกองทุนประกันสังคม',
    Math.min(money(p.social_security), LIM.social_security), 'ตามที่จ่ายจริง ไม่เกิน 9,000 บาท');
  // ข้อ 13
  add('13', 'cctv', 'ค่าซื้อและค่าติดตั้งระบบกล้องโทรทัศน์วงจรปิด (เขตพัฒนาพิเศษเฉพาะกิจ)',
    Math.min(money(p.cctv_amount), LIM.cctv),
    'เฉพาะเงินได้ตามมาตรา 40(5)–(8) ในเขตพัฒนาพิเศษเฉพาะกิจ ตามที่จ่ายจริง ไม่เกิน 100,000 บาท');
  // ข้อ 14
  if (money(p.pregnancies) > 0) {
    add('14', 'prenatal', `ค่าฝากครรภ์และค่าคลอดบุตร (${money(p.pregnancies)} ครั้ง)`,
      Math.min(money(p.prenatal_expense), LIM.prenatal * Math.max(1, money(p.pregnancies))),
      'ตามที่จ่ายจริง ไม่เกิน 60,000 บาทต่อการตั้งครรภ์ 1 ครั้ง');
  }
  // ข้อ 15
  add('15', 'donation_political', 'เงินที่บริจาคแก่พรรคการเมือง',
    Math.min(money(p.donation_political), LIM.donation_political), 'ไม่เกิน 10,000 บาท');
  // ข้อ 16
  add('16', 'social_enterprise', 'เงินลงทุนในหุ้น/หุ้นส่วน วิสาหกิจเพื่อสังคม (SE)',
    Math.min(money(p.social_enterprise), LIM.social_enterprise), 'ไม่เกิน 100,000 บาท');
  // ข้อ 17
  let e1 = money(p.e_receipt_general);
  const e2 = money(p.e_receipt_books);
  const e3 = money(p.e_receipt_ebooks);
  const e4 = money(p.e_receipt_otop);
  if (e1 + e2 + e3 + e4 <= 0 && money(p.easy_e_receipt) > 0) e1 = money(p.easy_e_receipt);
  const eTotal = e1 + e2 + e3 + e4;
  if (eTotal > 0) {
    const allowed = Math.min(eTotal, LIM.easy_e_receipt);
    const ratio = eTotal > 0 ? allowed / eTotal : 0;
    ([[e1, '17.1', 'ค่าซื้อสินค้าและค่าบริการในระบบภาษีมูลค่าเพิ่ม'],
      [e2, '17.2', 'ค่าซื้อหนังสือ หนังสือพิมพ์ และนิตยสาร'],
      [e3, '17.3', 'หนังสือ/บริการหนังสือในรูปข้อมูลอิเล็กทรอนิกส์ผ่านอินเทอร์เน็ต'],
      [e4, '17.4', 'ค่าซื้อสินค้า OTOP วิสาหกิจชุมชน และวิสาหกิจเพื่อสังคม']] as Array<[number, string, string]>)
      .forEach(([amt, item, label]) => add(item, `e_receipt_${item}`, label, amt * ratio, item === '17.1' ? 'Easy E-Receipt 2.0 (16 ม.ค.–28 ก.พ. 2568) รวมทั้ง 17.1–17.4 ไม่เกิน 50,000 บาท' : ''));
    if (eTotal > LIM.easy_e_receipt) notes.push('ข้อ 17 Easy E-Receipt 2.0 รวมทั้ง 4 รายการไม่เกิน 50,000 บาท (ปรับลดตามสัดส่วนให้แล้ว)');
  }
  // ข้อ 18
  add('18', 'thai_esg', 'ค่าซื้อหน่วยลงทุนกองทุนรวมไทยเพื่อความยั่งยืน (Thai ESG)',
    Math.min(money(p.thai_esg), assessable * 0.3, LIM.thai_esg), '30% ของเงินได้ ไม่เกิน 300,000 บาท');
  // ข้อ 19
  add('19.1', 'thai_esgx', 'ค่าซื้อหน่วยลงทุน Thai ESGX', Math.min(money(p.thai_esgx), assessable * 0.3, LIM.thai_esgx),
    'ลงทุนใหม่ 1 พ.ค.–30 มิ.ย. 2568 · 30% ของเงินได้ ไม่เกิน 300,000 บาท');
  add('19.2', 'thai_esgx_ltf', 'มูลค่าการสับเปลี่ยนหน่วยลงทุนจากกองทุน LTF ไป Thai ESGX',
    Math.min(money(p.thai_esgx_ltf_swap), assessable * 0.3, LIM.thai_esgx), 'เฉพาะปีภาษี 2568');
  // ข้อ 20
  const construction = money(p.home_construction_cost);
  if (construction > 0) {
    add('20', 'home_construction', 'ค่าจ้างก่อสร้างอาคารเพื่ออยู่อาศัยขึ้นใหม่ (ผู้รับจ้างจดทะเบียน VAT)',
      Math.min(Math.floor(construction / 1_000_000) * 10_000, LIM.home_construction),
      'ล้านละ 10,000 บาท รวมไม่เกิน 100,000 บาท · สัญญาจ้าง 9 เม.ย. 2567–31 ธ.ค. 2568');
  }
  // ข้อ 21
  add('21', 'art_purchase', 'ค่าซื้องานศิลปะ', Math.min(money(p.art_purchase), LIM.art),
    'ตามที่จ่ายจริง ไม่เกิน 100,000 บาท (ตามมาตรการของปีภาษี)');
  // ข้อ 22
  add('22.1', 'travel_main', 'ค่าท่องเที่ยวภายในประเทศ — เที่ยวเมืองหลัก',
    Math.min(money(p.travel_main_city), LIM.travel_main), '29 ต.ค.–15 ธ.ค. 2568 · 1 เท่า ไม่เกิน 20,000 บาท');
  add('22.2', 'travel_secondary', 'ค่าท่องเที่ยวภายในประเทศ — เที่ยวเมืองรอง',
    Math.min(Math.min(money(p.travel_secondary_city), LIM.travel_main) * 1.5, LIM.travel_secondary),
    '29 ต.ค.–15 ธ.ค. 2568 · 1.5 เท่า (จ่ายจริงไม่เกิน 20,000) รวมไม่เกิน 30,000 บาท');
  // ข้อ 23
  add('23', 'ssf', 'อื่น ๆ — ค่าซื้อหน่วยลงทุน SSF', retirement.ssf, '30% ของเงินได้ ไม่เกิน 200,000 บาท');
  add('23.9', 'other_measure', 'อื่น ๆ — มาตรการของรัฐอื่นของปีภาษี', money(p.other_measure_amount), 'ใส่ยอดที่ใช้สิทธิได้จริงตามหลักฐาน');

  items.sort((a, b) => {
    const key = (s: string) => s.split('.').map(Number);
    const [a1, a2 = 0] = key(a.item);
    const [b1, b2 = 0] = key(b.item);
    return a1 === b1 ? a2 - b2 : a1 - b1;
  });
  return { items, total: r2(items.reduce((s, i) => s + i.amount, 0)), notes };
}

/** ภาษีขั้นบันได (แบบ ข้อ 11.8) */
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

/** ค่าใช้จ่าย (แบบ ข้อ 5 + ใบแนบข้อ 2/4/5/6/7) */
export function computeExpenses(items: ResolvedItem[]): { lines: ExpenseLine[]; total: number } {
  const groups = new Map<string, { category: IncomeKey; variant: string; how: string; rate: number | null; gross: number; ded: number; actual: number }>();
  for (const it of items) {
    if (it.amount <= 0) continue;
    let rate: number | null;
    let how: string;
    if (it.category === 'interest') {
      rate = 0;
      how = 'หักค่าใช้จ่ายไม่ได้ (ใบแนบข้อ 3)';
    } else if (it.expense_mode === 'actual') {
      rate = null;
      how = `ตามจริง (จ่ายจริง ${it.actual_expense.toLocaleString('en-US')} บาท)`;
    } else {
      rate = itemRate(it);
      how = it.category === 'business' && it.variant === 'entertainer'
        ? 'ร้อยละ 60 (ส่วนไม่เกิน 300,000) + ร้อยละ 40 (ส่วนที่เกิน) · รวมไม่เกิน 600,000'
        : `ร้อยละ ${Math.round(rate * 100)}${it.variant ? ` · ${itemRateLabel(it)}` : ''}`;
    }
    const key = `${it.category}::${it.variant || ''}::${how}`;
    const g = groups.get(key) ?? { category: it.category, variant: it.variant || '', rate, how, gross: 0, ded: 0, actual: 0 };
    g.gross += it.amount;
    if (rate === null) g.actual += Math.min(it.actual_expense, it.amount);
    groups.set(key, g);
  }
  for (const g of groups.values()) {
    g.ded = g.rate === null ? g.actual : flatExpense(g.category, g.variant, g.gross, g.rate);
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
    if (first) first.how += ' · แบบข้อ 5 จำกัดร้อยละ 50 ไม่เกิน 100,000 บาท';
  }
  const cap3 = all.filter((g) => g.category === 'royalty').reduce((s, g) => s + g.ded, 0);
  if (cap3 > CAP_40_3) {
    let excess = cap3 - CAP_40_3;
    all.forEach((g) => {
      if (g.category === 'royalty' && excess > 0) {
        const cut = Math.min(g.ded, excess);
        g.ded -= cut;
        excess -= cut;
        g.how += ' · ใบแนบข้อ 2 จำกัดไม่เกิน 100,000 บาท';
      }
    });
  }

  const order = Object.keys(EXPENSE_RULES) as IncomeKey[];
  const lines: ExpenseLine[] = all
    .map((g) => ({
      group: g.category as string,
      label: `${INCOME_SECTION[g.category].form} · ${EXPENSE_RULES[g.category].label} — ${g.how}`,
      gross: r2(g.gross), deductible: r2(g.ded),
    }))
    .sort((a, b) => order.indexOf(a.group as IncomeKey) - order.indexOf(b.group as IncomeKey));
  return { lines, total: r2(lines.reduce((s, l) => s + l.deductible, 0)) };
}

/**
 * วงเงินกลุ่มเกษียณรวม 500,000 บาท: สำรองเลี้ยงชีพ + กบข. + สงเคราะห์ครู + ประกันบำนาญ + RMF + SSF
 * (สำรองเลี้ยงชีพ 15% · กบข. 30% · สงเคราะห์ครู 15% · ประกันบำนาญ 15%/200,000 · RMF 30%/500,000 · SSF 30%/200,000)
 */
export function computeRetirement(p: PitPerson, assessable: number) {
  const raw = {
    provident: money(p.provident_fund), gpf: money(p.gpf), teacher: money(p.teacher_fund),
    pension: money(p.pension_life_insurance), rmf: money(p.rmf), ssf: money(p.ssf),
  };
  const allowed: Record<string, number> = {
    provident: Math.min(raw.provident, assessable * PCT_RULES.provident_fund, LIM.retirement_cap),
    gpf: Math.min(raw.gpf, assessable * PCT_RULES.gpf, LIM.retirement_cap),
    teacher: Math.min(raw.teacher, assessable * PCT_RULES.teacher_fund, LIM.retirement_cap),
    pension: Math.min(raw.pension, assessable * PCT_RULES.pension_life_insurance, LIM.pension_life),
    rmf: Math.min(raw.rmf, assessable * PCT_RULES.rmf, LIM.rmf),
    ssf: Math.min(raw.ssf, assessable * PCT_RULES.ssf, LIM.ssf),
  };
  const order = ['provident', 'gpf', 'teacher', 'pension', 'rmf', 'ssf'];
  let over = order.reduce((s, k) => s + allowed[k], 0) - LIM.retirement_cap;
  const notes: string[] = [];
  if (over > 0) {
    for (let i = order.length - 1; i >= 0 && over > 0; i -= 1) {
      const cut = Math.min(allowed[order[i]], over);
      allowed[order[i]] -= cut;
      over -= cut;
    }
    notes.push('วงเงินกลุ่มเกษียณ (สำรองเลี้ยงชีพ/กบข./สงเคราะห์ครู/ประกันบำนาญ/RMF/SSF) รวมกันไม่เกิน 500,000 บาท — ปรับลดส่วนเกินให้แล้ว');
  }
  return { allowed, notes, raw };
}

/** เครื่องยนต์หลัก — เดินตามแบบ ภ.ง.ด.90 ข้อ 1–7 → ข้อ 11.1–11.16 */
export function computePit(persons: PitPerson[], year: number = DEFAULT_TAX_YEAR): PitResult {
  if (!persons || persons.length === 0) throw new Error('ต้องมีข้อมูลผู้เสียภาษีอย่างน้อย 1 คน');
  const marriedCombined = persons.length > 1;

  const grossByCat = {
    salary: 0, service: 0, royalty: 0, interest: 0, rent: 0, professional: 0, contractor: 0, business: 0,
  } as Record<IncomeKey, number>;
  const expenseLines: ExpenseLine[] = [];
  const itemRows: IncomeItemRow[] = [];
  const section2Items: Array<{ code: string; form: string; label: string; amount: number }> = [];
  const allowanceItems: AllowanceItem[] = [];
  const notes: string[] = [];
  const exemptions: Array<{ label: string; amount: number; note?: string }> = [];
  let expensesTotal = 0;
  let creditsFromItems = 0;
  let creditsFlat = 0;

  // ── ข้อ 2 + ใบแนบ ต้องคิดวงเงินเกษียณจากเงินได้ทั้งสิ้นก่อน ──
  const assessableAll = persons.reduce((s, p) => s + Object.values(buildItems(p)).reduce((t, i) => t + i.amount, 0), 0);

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
        form: INCOME_SECTION[it.category].form,
        category_label: INCOME_SECTION[it.category].label,
        description: it.description,
        amount: r2(it.amount),
        variant: it.variant,
        variant_label: it.variant ? itemRateLabel(it) : '',
        expense_mode: it.expense_mode,
        withholding: r2(it.withholding),
      });
    });
    if (!hasItems) creditsFlat += 0;
    creditsFlat += money(p.withholding);

    const ret = computeRetirement(p, r2(assessableAll));
    const sec2 = computeSection2(p, ret.allowed);
    sec2.items.forEach((it) => section2Items.push({ ...it, label: (marriedCombined && idx > 0 ? '(คู่สมรส) ' : '') + it.label }));

    // แบบ ข้อ 5: หักค่าใช้จ่ายจากเงินได้ 40(1)+(2) หลังหัก ข้อ 2 แล้ว
    const salaryBase = personItems.filter((i) => i.category === 'salary' || i.category === 'service').reduce((s, i) => s + i.amount, 0);
    const sec2ForSalary = Math.min(sec2.total, salaryBase);
    const expenseItems = personItems.map((i) => ({ ...i }));
    if (sec2ForSalary > 0) {
      let remaining = sec2ForSalary;
      expenseItems.forEach((i) => {
        if (remaining <= 0 || (i.category !== 'salary' && i.category !== 'service')) return;
        const cut = Math.min(i.amount, remaining);
        i.amount = r2(i.amount - cut);
        remaining -= cut;
      });
    }
    const exp = computeExpenses(expenseItems);
    exp.lines.forEach((l) => {
      expenseLines.push(marriedCombined && idx > 0 ? { ...l, label: `(คู่สมรส) ${l.label}` } : l);
    });
    expensesTotal += exp.total;

    // ใบแนบ ข้อ 1–23
    const q: PitPerson = idx > 0
      ? {
        ...p, children: 0, children_2nd_2561: 0, adopted_children: 0, pregnancies: 0, prenatal_expense: 0,
        parents: 0, disabled_dependents: 0, spouse_no_income: false,
      }
      : p;
    const allow = computeAllowances(q, r2(assessableAll), marriedCombined, {
      provident: ret.allowed.provident, rmf: ret.allowed.rmf, ssf: ret.allowed.ssf, pension: ret.allowed.pension,
    });
    allow.items.forEach((it) => {
      allowanceItems.push(marriedCombined && idx > 0 ? { ...it, label: `(คู่สมรส) ${it.label}` } : it);
    });
    notes.push(...allow.notes, ...ret.notes);

    // ยกเว้นเงินได้ผู้สูงอายุ 65 ปีขึ้นไป / ผู้พิการ
    const senior = money(p.senior_or_disabled_exemption);
    if (senior > 0) {
      exemptions.push({
        label: 'ยกเว้นเงินได้ผู้มีอายุ 65 ปีขึ้นไป หรือผู้พิการ/ทุพพลภาพ',
        amount: r2(Math.min(senior, LIM.senior_disabled_exemption)), note: 'ไม่เกิน 190,000 บาท/ปี ต่อคน',
      });
    }
  });

  const grossTotal = r2(Object.values(grossByCat).reduce((s, v) => s + v, 0));
  const section2Total = r2(section2Items.reduce((s, i) => s + i.amount, 0));
  const salaryAfterSection2 = r2(Math.max(0, grossByCat.salary + grossByCat.service - section2Total));
  expensesTotal = r2(expensesTotal);

  // แบบ ข้อ 11.1 = (เงินได้ทั้งสิ้น − ข้อ 2) − ค่าใช้จ่าย
  const incomeAfterExpense = r2(Math.max(0, grossTotal - section2Total - expensesTotal));
  const exemptionsTotal = r2(exemptions.reduce((s, e) => s + e.amount, 0));
  const allowancesTotal = r2(allowanceItems.reduce((s, i) => s + i.amount, 0));   // ใบแนบ ข้อ 24 → ข้อ 11.2

  // ข้อ 11.3
  const item3Balance = r2(Math.max(0, incomeAfterExpense - exemptionsTotal - allowancesTotal));
  // ข้อ 11.4 (บริจาค 2 เท่า ≤10% ของ 11.3) → 11.5 → 11.6 (บริจาคทั่วไป ≤10% ของ 11.5)
  const capEdu = r2(item3Balance * 0.1);
  const donEduActual = persons.reduce((s, p) => s + money(p.donation_education), 0);
  const donEdu = r2(Math.min(donEduActual * 2, capEdu));
  const item5Balance = r2(Math.max(0, item3Balance - donEdu));
  const capGen = r2(item5Balance * 0.1);
  const donGenActual = persons.reduce((s, p) => s + money(p.donation_general), 0);
  const donGen = r2(Math.min(donGenActual, capGen));
  if (donEduActual > 0 && donEduActual * 2 > capEdu) notes.push('ข้อ 11.4 เงินบริจาค 2 เท่า ถูกจำกัดด้วยเพดาน 10% ของยอดข้อ 11.3');
  if (donGenActual > capGen) notes.push('ข้อ 11.6 เงินบริจาคทั่วไปถูกจำกัดด้วยเพดาน 10% ของยอดข้อ 11.5');

  // ข้อ 11.7
  const netIncome = r2(Math.max(0, item5Balance - donGen));

  // ข้อ 11.8–11.10
  const bracket = progressiveTax(netIncome);
  const taxMethod1 = bracket.tax;
  const gross2to8 = r2(grossTotal - grossByCat.salary);
  const method2Applies = gross2to8 >= LIM.min_tax_threshold;
  const taxMethod2 = r2(gross2to8 * LIM.min_tax_rate);
  const method2Used = Boolean(method2Applies && taxMethod2 > LIM.min_tax_exempt && taxMethod2 > taxMethod1);
  let method2Note = '';
  if (!method2Applies) {
    method2Note = `ข้อ 11.9 · เงินได้ไม่รวมมาตรา 40(1) = ${gross2to8.toLocaleString('en-US')} บาท ไม่ถึง 120,000 บาท → ไม่ต้องคำนวณภาษีวิธีที่ 2`;
  } else if (taxMethod2 <= LIM.min_tax_exempt) {
    method2Note = `ข้อ 11.10 · ภาษีข้อ 11.9 คำนวณได้ ${taxMethod2.toLocaleString('en-US')} บาท ไม่เกิน 5,000 บาท → ให้ชำระภาษีตามข้อ 11.8 (วิธีที่ 1)`;
  }
  const taxBeforeCredit = method2Used ? taxMethod2 : taxMethod1;   // ข้อ 11.10

  // ข้อ 11.11–11.16
  const item11 = 0;                                                // เขตพัฒนาพิเศษเฉพาะกิจ (กรอกเพิ่มได้)
  const item12 = r2(taxBeforeCredit + item11);
  const foreignCredit = Math.min(
    persons.reduce((s, p) => s + money(p.foreign_tax_credit), 0), item12,
  );
  const item14 = r2(item12 - foreignCredit);
  const credits = r2(creditsFromItems + creditsFlat
    + persons.reduce((s, p) => s + money(p.dividend_credit), 0)
    + persons.reduce((s, p) => s + money(p.pnd93) + money(p.pnd94), 0));
  const netPayable = r2(item14 - credits);                          // ข้อ 11.16

  const salaryOnly = gross2to8 <= 0;
  const fileThreshold = salaryOnly ? 60_000 : 120_000;

  return {
    program: 'thai_tax_calculator.py',
    version: TAX_CALC_VERSION,
    year,
    filing_mode: marriedCombined ? 'ยื่นรวมกับคู่สมรส (ภ.ง.ด.90)' : 'ยื่นคนเดียว (ภ.ง.ด.90/91)',
    form_reference: 'เดินตามแบบ ภ.ง.ด.90 ข้อ 1–7 และข้อ 11 (1.–16.) + ใบแนบลดหย่อน ข้อ 1.–24. ปีภาษี 2568',
    income_items: itemRows,
    gross_total: grossTotal,
    expense_lines: expenseLines,
    expenses_total: expensesTotal,
    section2_items: section2Items,
    section2_total: section2Total,
    salary_after_section2: salaryAfterSection2,
    income_after_expense: incomeAfterExpense,
    allowance_items: allowanceItems,
    allowances_total: allowancesTotal,
    allowance_notes: Array.from(new Set(notes)),
    exemptions,
    exemptions_total: exemptionsTotal,
    item3_balance: item3Balance,
    donation_caps: { education_10pct_of_item3: capEdu, general_10pct_of_item5: capGen },
    item4_education_donation: donEdu,
    item5_balance: item5Balance,
    item6_general_donation: donGen,
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
    item11_special_area: item11,
    item12_total_tax: item12,
    foreign_tax_credit: r2(foreignCredit),
    item14_after_foreign_credit: item14,
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
