/**
 * businessSim.ts — เอนจิน "เปรียบเทียบผลประกอบการเมื่อทำประกันคีย์แมน"
 * ---------------------------------------------------------------------------
 * ต่อยอดจากโปรแกรม "โครงการวางแผนภาษีสำหรับธุรกิจและผู้ประกอบการ" (ชีต จำลองงบ)
 * ที่ใช้ในห้องประชุมลูกค้า ให้สมาชิกกรอกข้อมูลจริงของลูกค้าแล้วเทียบ 3 สถานการณ์
 *
 *   1) before  = ก่อนวางแผน (บริษัทจ่ายแค่เงินเดือนกรรมการ)
 *   2) plan    = วางแผน (บริษัทจ่ายเบี้ยคีย์แมนเป็นสวัสดิการกรรมการ)
 *   3) gross   = บริษัทออกภาษีเงินได้บุคคลธรรมดาให้ด้วย (คำนวณเป็นทอด ๆ)
 *
 * กติกาสำคัญ: ห้ามคัดลอกสูตรภาษีมาคำนวณซ้ำในไฟล์นี้ —
 *   • ภาษีบุคคลธรรมดา → computePit()  (src/lib/tax/thaiPit.ts)
 *   • ภาษีนิติบุคคล     → computeCit() (src/lib/tax/thaiCit.ts)
 * เพื่อให้เลขตรงกับแท็บ "ภาษีบุคคลธรรมดา" และ "ภาษีนิติบุคคล" ของหน้าเดียวกันเป๊ะ
 *
 * การคำนวณภาษีที่บริษัทออกแทน (gross-up) ใช้วิธีวนซ้ำตามคำสั่งกรมสรรพากร
 * ที่ ป. 96/2543 ข้อ 1(7),(8): "นำเงินค่าภาษีที่นายจ้างออกแทนให้ไปรวมกับเงินเดือน
 * … แล้วคำนวณภาษี … จนกว่าจะไม่มีเงินค่าภาษีที่นายจ้างต้องออกแทนให้อีก"
 */
import { computePit, type PitPerson } from './thaiPit';
import { computeCit } from './thaiCit';

export const BUSINESS_SIM_VERSION = '1.0.0';
export const BUSINESS_SIM_YEAR = 2569;
/** เพดานวนซ้ำของ gross-up (ปกติบรรจบใน 15 ทอด — กันลูปไม่จบ) */
const MAX_ROUNDS = 40;
const EPS = 0.01;

export type SimInput = {
  /** ชื่อลูกค้า/บริษัท (แสดงบนหัวตาราง ไม่มีผลต่อการคำนวณ) */
  client_name?: string;
  /** รายได้จากการขายสินค้า/ให้บริการทั้งปี */
  company_revenue: number;
  /** ต้นทุนและค่าใช้จ่ายที่หักได้ทั้งปี (ไม่รวมค่าตอบแทนกรรมการ และไม่รวมเบี้ยประกัน) */
  company_expenses: number;
  /** ค่าตอบแทนกรรมการ/ผู้บริหารต่อปี (เงินเดือน + โบนัส) */
  director_income: number;
  /** เบี้ยประกันคีย์แมนต่อปี */
  premium: number;
  /** จำนวนปีที่จ่ายเบี้ย (ใช้สรุปผลรวมหลายปี) */
  years: number;
  /** ทุนจดทะเบียนที่ชำระแล้ว (ทดสอบเกณฑ์ SME) */
  capital_paid_up: number;

  // ── ค่าลดหย่อนของกรรมการ (ส่งเข้า computePit ตรง ๆ) ──
  spouse_no_income?: boolean;
  children?: number;
  life_insurance?: number;
  health_insurance?: number;
  social_security?: number;
  home_loan_interest?: number;
  other_allowances?: number;

  // ── สวิตช์กติกาภาษี ──
  /** จ่ายให้กรรมการ/พนักงานทุกคนเป็นการทั่วไป → หักค่าใช้จ่ายได้ (65 ตรี (3),(13)) */
  deductible: boolean;
  /** เบี้ยถือเป็นเงินได้ 40(1)/(2) ของกรรมการ (แนววินิจฉัย กค 0811/408) */
  benefit_to_executive: boolean;
  /** บริษัทออกภาษีเงินได้บุคคลธรรมดาให้ (gross-up) */
  company_pays_tax: boolean;
  /** แสดงภาษีเงินปันผล 10% ในผลรวม (กรณีจ่ายกำไรออกมาเป็นเงินปันผล) */
  include_dividend_wht?: boolean;
};

export type SimRow = {
  key: 'before' | 'plan' | 'gross';
  label: string;
  /** ฝั่งบุคคลธรรมดา (ภ.ง.ด.90/91) */
  director_income: number;
  premium_income: number;
  tax_borne_income: number;
  gross_total: number;
  expense_deduction: number;
  personal_allowance: number;
  other_deductions: number;
  net_income: number;
  brackets: Array<{ range: string; rate: number; tax: number; amount: number }>;
  pit: number;
  marginal_rate: number;
  /** ฝั่งนิติบุคคล (ภ.ง.ด.50) */
  revenue: number;
  costs: number;
  director_cost: number;
  welfare: number;
  tax_cost: number;
  profit_before_tax: number;
  cit: number;
  profit_after_tax: number;
  dividend_wht: number;
  cit_with_dividend: number;
  /** รวมทุกภาษี */
  total_tax: number;
  /** เงินได้สุทธิของกรรมการหลังภาษี (กรณีบริษัทออกให้ = เต็มจำนวน) */
  director_net: number;
  /** เงินที่บริษัทจ่ายออกจริง (เบี้ย + ภาษีที่ออกให้) */
  company_outlay: number;
};

export type SimResult = {
  program: string;
  version: string;
  year: number;
  input: SimInput;
  rows: SimRow[];
  before: SimRow;
  plan: SimRow;
  gross: SimRow;
  /** ภาษีที่ประหยัดได้เมื่อเทียบกับก่อนวางแผน */
  tax_saved_plan: number;
  tax_saved_gross: number;
  /** ต้นทุนสุทธิของบริษัทในแต่ละแบบ = เบี้ย + ภาษีออกให้ − ภาษีนิติบุคคลที่ประหยัดได้ */
  net_cost_plan: number;
  net_cost_gross: number;
  /** ผลรวมหลายปี */
  multi_year: {
    years: number;
    premium_total: number;
    tax_before_total: number;
    tax_plan_total: number;
    tax_gross_total: number;
    saved_plan_total: number;
    saved_gross_total: number;
  };
  gross_rounds: number;
  notes: string[];
  sources: string[];
  disclaimer: string;
};

const n = (v: unknown): number => {
  const x = typeof v === 'number' ? v : parseFloat(String(v ?? 0).replace(/,/g, ''));
  return Number.isFinite(x) && x > 0 ? Math.round(x * 100) / 100 : 0;
};
const r2 = (x: number): number => Math.round(x * 100) / 100;

/** สร้างข้อมูลผู้เสียภาษีของกรรมการ 1 คน (40(1) เงินเดือน + เบี้ยที่บริษัทออกให้) */
function person(sim: SimInput, salary: number): PitPerson {
  return {
    salary,
    personal: true,                                   // ใบแนบ ข้อ 1 → 60,000
    spouse_no_income: sim.spouse_no_income === true,
    children: n(sim.children),
    life_insurance: n(sim.life_insurance),
    health_insurance: n(sim.health_insurance),
    social_security: n(sim.social_security),
    home_loan_interest: n(sim.home_loan_interest),
    // ลดหย่อนอื่น ๆ ที่กรอกเอง (ใช้ช่อง "ข้อ 23 อื่น ๆ" ซึ่งไม่ถูกตัดเพดานเกษียณ)
    other_measure_amount: n(sim.other_allowances),
  };
}

function pitOf(sim: SimInput, salary: number) {
  const res = computePit([person(sim, r2(salary))], BUSINESS_SIM_YEAR);
  const other = Math.max(0, r2(
    res.allowances_total
    - (res.allowance_items.find((a) => a.code === 'personal')?.amount ?? 0),
  ));
  return {
    gross: r2(res.gross_total),
    expense: r2(res.expenses_total),
    personal: r2(res.allowance_items.find((a) => a.code === 'personal')?.amount ?? 0),
    other,
    net: r2(res.net_income),
    tax: r2(res.item12_total_tax),
    marginal: res.marginal_rate,
    brackets: res.bracket_steps.map((s) => ({ range: s.range, rate: s.rate, amount: s.amount, tax: r2(s.tax) })),
  };
}

/** ภาษีเงินได้บุคคลธรรมดาเมื่อมีภาษีออกแทนให้ T (ใช้ตรวจการบรรจบของ gross-up) */
function pitWithBorne(sim: SimInput, baseIncome: number, borne: number): number {
  return pitOf(sim, baseIncome + borne).tax;
}

/**
 * คำนวณทอดต่าง ๆ ของ "บริษัทออกภาษีให้"
 * T₀ = 0 ; Tₙ = PIT(เงินได้ + เบี้ย + Tₙ₋₁) ; หยุดเมื่อ |Tₙ − Tₙ₋₁| ≤ 0.01
 */
function solveGrossUp(sim: SimInput, incomeBeforeBorne: number): { borne: number; rounds: number } {
  let prev = 0;
  let rounds = 0;
  for (let i = 1; i <= MAX_ROUNDS; i++) {
    const t = pitWithBorne(sim, incomeBeforeBorne, prev);
    rounds = i;
    if (Math.abs(t - prev) <= EPS) return { borne: r2(t), rounds };
    prev = t;
  }
  return { borne: r2(prev), rounds };
}

function citOf(sim: SimInput, expenses: number): number {
  return r2(computeCit({
    revenue: n(sim.company_revenue),
    expenses: r2(expenses),
    capital_paid_up: n(sim.capital_paid_up),
  }).tax_payable);
}

function buildRow(
  key: SimRow['key'],
  label: string,
  sim: SimInput,
  opts: { premiumAsIncome: boolean; welfare: number; taxBorne: number; borneIsDeductible: boolean },
): SimRow {
  const revenue = n(sim.company_revenue);
  const costs = n(sim.company_expenses);
  const directorCost = n(sim.director_income);
  const premiumIncome = opts.premiumAsIncome ? n(sim.premium) : 0;
  const incomeBeforeBorne = directorCost + premiumIncome;
  const p = pitOf(sim, incomeBeforeBorne + opts.taxBorne);
  const companyExpenses =
    costs
    + directorCost
    + opts.welfare
    + (opts.borneIsDeductible ? opts.taxBorne : 0);
  const cit = citOf(sim, companyExpenses);
  const profitBeforeTax = Math.max(0, r2(revenue - companyExpenses));
  const profitAfterTax = r2(profitBeforeTax - cit);
  const dividendWht = sim.include_dividend_wht === false ? 0 : r2(profitAfterTax * 0.1);
  const totalTax = r2(p.tax + cit + dividendWht);
  return {
    key,
    label,
    director_income: directorCost,
    premium_income: premiumIncome,
    tax_borne_income: r2(opts.taxBorne),
    gross_total: r2(p.gross),
    expense_deduction: p.expense,
    personal_allowance: p.personal,
    other_deductions: p.other,
    net_income: p.net,
    brackets: p.brackets,
    pit: p.tax,
    marginal_rate: p.marginal,
    revenue,
    costs,
    director_cost: directorCost,
    welfare: r2(opts.welfare),
    tax_cost: r2(opts.taxBorne),
    profit_before_tax: profitBeforeTax,
    cit,
    profit_after_tax: profitAfterTax,
    dividend_wht: dividendWht,
    cit_with_dividend: r2(cit + dividendWht),
    total_tax: totalTax,
    director_net: r2(p.net - p.tax + opts.taxBorne),
    company_outlay: r2(opts.welfare + opts.taxBorne),
  };
}

export function computeBusinessSim(input: SimInput): SimResult {
  const sim: SimInput = {
    ...input,
    company_revenue: n(input.company_revenue),
    company_expenses: n(input.company_expenses),
    director_income: n(input.director_income),
    premium: n(input.premium),
    years: Math.max(1, Math.round(n(input.years) || 1)),
    capital_paid_up: n(input.capital_paid_up),
    deductible: input.deductible !== false,
    benefit_to_executive: input.benefit_to_executive !== false,
    company_pays_tax: input.company_pays_tax !== false,
    include_dividend_wht: input.include_dividend_wht !== false,
  };

  // 1) ก่อนวางแผน
  const before = buildRow('before', 'ก่อนวางแผน', sim, {
    premiumAsIncome: false, welfare: 0, taxBorne: 0, borneIsDeductible: true,
  });

  // 2) วางแผน — บริษัทจ่ายเบี้ย (หักได้/ไม่ได้ตามสวิตช์) + เบี้ยเป็นเงินได้กรรมการ (ถ้าติ๊ก)
  const plan = buildRow('plan', 'วางแผน (จ่ายเบี้ย)', sim, {
    premiumAsIncome: sim.benefit_to_executive,
    welfare: sim.deductible ? sim.premium : 0,
    taxBorne: 0,
    borneIsDeductible: true,
  });

  // 3) บริษัทออกภาษีให้ — ภาษีที่ออกให้เป็นเงินได้ของกรรมการด้วย → ต้องวนซ้ำจนบรรจบ
  const incomeBeforeBorne = sim.director_income + (sim.benefit_to_executive ? sim.premium : 0);
  const gu = sim.company_pays_tax ? solveGrossUp(sim, incomeBeforeBorne) : { borne: 0, rounds: 0 };
  const gross = buildRow('gross', 'บริษัทออกภาษีให้ทุกทอด', sim, {
    premiumAsIncome: sim.benefit_to_executive,
    welfare: sim.deductible ? sim.premium : 0,
    taxBorne: gu.borne,
    borneIsDeductible: true,
  });

  const years = sim.years;
  const premiumTotal = r2(sim.premium * years);

  const notes: string[] = [];
  if (!sim.deductible) {
    notes.push('เบี้ยประกันหักเป็นค่าใช้จ่ายของบริษัทไม่ได้ (จ่ายเฉพาะผู้ถือหุ้น/รายเดียว → 65 ตรี (3)) — ภาษีนิติบุคคลจึงไม่ลดลง');
  }
  if (!sim.benefit_to_executive) {
    notes.push('ไม่ได้นับเบี้ยเป็นเงินได้ของกรรมการ — ใช้ได้เฉพาะกรณีไม่ใช่กรรมการ/บุคคลสำคัญที่ได้รับประโยชน์ (ตามแนววินิจฉัยต้องตรวจข้อเท็จจริง)');
  }
  if (!sim.company_pays_tax) {
    notes.push('ปิดการคำนวณ "บริษัทออกภาษีให้" — คอลัมน์ที่ 3 จะเท่ากับคอลัมน์ที่ 2');
  }
  if (sim.company_pays_tax && gu.rounds > 0) {
    notes.push(`ภาษีที่บริษัทออกให้บรรจบใน ${gu.rounds} ทอด (ป. 96/2543 ข้อ 1(7),(8)) — ตาราง Excel เดิมคิดเพียงทอดแรก ตัวเลขจึงต่ำกว่าความเป็นจริง`);
  }
  if (gross.cit === 0 && gross.profit_before_tax === 0) {
    notes.push('ค่าใช้จ่ายของบริษัทสูงกว่าหรือเท่ารายได้ — ยังไม่มีกำไรที่จะเสียภาษีนิติบุคคลในแบบจำลองนี้');
  }

  return {
    program: 'โปรแกรมเปรียบเทียบผลประกอบการ · ประกันคีย์แมน',
    version: BUSINESS_SIM_VERSION,
    year: BUSINESS_SIM_YEAR,
    input: sim,
    rows: [before, plan, gross],
    before,
    plan,
    gross,
    tax_saved_plan: r2(before.total_tax - plan.total_tax),
    tax_saved_gross: r2(before.total_tax - gross.total_tax),
    net_cost_plan: r2(plan.company_outlay - (before.cit - plan.cit)),
    net_cost_gross: r2(gross.company_outlay - (before.cit - gross.cit)),
    multi_year: {
      years,
      premium_total: premiumTotal,
      tax_before_total: r2(before.total_tax * years),
      tax_plan_total: r2(plan.total_tax * years),
      tax_gross_total: r2(gross.total_tax * years),
      saved_plan_total: r2((before.total_tax - plan.total_tax) * years),
      saved_gross_total: r2((before.total_tax - gross.total_tax) * years),
    },
    gross_rounds: gu.rounds,
    notes,
    sources: [
      'คำสั่งกรมสรรพากรที่ ป. 96/2543 ข้อ 1(7),(8) — ภาษีที่นายจ้างออกแทนให้ต้องนำไปรวมคำนวณจนไม่มีภาษีต้องออกอีก',
      'ประมวลรัษฎากร มาตรา 39 — เงินค่าภาษีอากรที่ผู้อื่นออกแทนให้เป็นเงินได้พึงประเมิน',
      'กค 0811/408 — ภาษีที่บริษัทออกให้หักเป็นรายจ่ายได้ (ไม่ต้องห้าม 65 ตรี (6))',
      'กค 0706/5249 · 0702/9358 — จ่ายเบี้ยให้กรรมการทุกคนเป็นการทั่วไป หักได้ และเบี้ยเป็นเงินได้ 40(1)',
      'อัตราภาษี/ค่าลดหย่อน: เอนจิน thaiPit.ts (ภ.ง.ด.90/91) และ thaiCit.ts (ภ.ง.ด.50) ของระบบนี้',
    ],
    disclaimer:
      'ผลคำนวณเพื่อการวางแผนเบื้องต้น ไม่ใช่ความเห็นทางภาษี — ต้องตรวจข้อเท็จจริง (ระเบียบสวัสดิการ ผู้รับประโยชน์ เงื่อนไข 65 ตรี) กับสำนักงานบัญชี/สรรพากรก่อนดำเนินการ',
  };
}
