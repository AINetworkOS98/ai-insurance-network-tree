// gen-bussim-fixture.ts — สร้างชุดทดสอบของแอป Flutter (business-sim) จากเอนจินเว็บตัวจริง
// ใช้: npx --no-install tsx scripts/gen-bussim-fixture.ts > ../business-sim/test/testcases_business_sim.json
import { computeBusinessSim, type SimInput } from '../src/lib/tax/businessSim';

const BASE: SimInput = {
  client_name: '',
  company_revenue: 50_000_000,
  company_expenses: 45_000_000,
  director_income: 4_000_000,
  premium: 300_000,
  years: 10,
  capital_paid_up: 3_000_000,
  spouse_no_income: false,
  children: 0,
  life_insurance: 0,
  health_insurance: 0,
  social_security: 0,
  home_loan_interest: 0,
  other_allowances: 0,
  deductible: true,
  benefit_to_executive: true,
  company_pays_tax: true,
  include_dividend_wht: true,
};

const cases: Array<{ name: string; input: Partial<SimInput> }> = [
  { name: '1) ตัวอย่างชีต จำลองงบ (รายได้ 50 ล้าน · เบี้ย 3 แสน)', input: { ...BASE } },
  {
    name: '2) SME กำไร 5 แสน · ผู้บริหาร 2 ล้าน',
    input: { ...BASE, company_revenue: 12_000_000, company_expenses: 9_500_000, director_income: 2_000_000, premium: 100_000 },
  },
  {
    name: '3) บริษัทเล็ก · ผู้บริหารเงินได้ต่ำ (ไม่ถึงเกณฑ์เสียภาษี)',
    input: { ...BASE, company_revenue: 5_000_000, company_expenses: 4_300_000, director_income: 300_000, premium: 60_000, capital_paid_up: 1_000_000 },
  },
  {
    name: '4) จ่ายเฉพาะผู้ถือหุ้น → หักเบี้ยไม่ได้ (65 ตรี (3))',
    input: { ...BASE, premium: 200_000, deductible: false },
  },
  {
    name: '5) ไม่นับเบี้ยเป็นเงินได้กรรมการ + ไม่รวมภาษีเงินปันผล',
    input: { ...BASE, benefit_to_executive: false, include_dividend_wht: false },
  },
  {
    name: '6) ปิด "บริษัทออกภาษีให้" + มีค่าลดหย่อนครอบครัว',
    input: {
      ...BASE,
      company_pays_tax: false,
      spouse_no_income: true,
      children: 2,
      life_insurance: 100_000,
      health_insurance: 25_000,
      social_security: 9_000,
      home_loan_interest: 100_000,
      other_allowances: 50_000,
    },
  },
];

const flat = (input: SimInput) => {
  const r = computeBusinessSim(input);
  const out: Record<string, number | string | boolean> = {};
  for (const row of [r.before, r.plan, r.gross]) {
    const p = `rows.${row.key}`;
    for (const k of [
      'director_income', 'premium_income', 'tax_borne_income', 'gross_total', 'expense_deduction',
      'personal_allowance', 'other_deductions', 'net_income', 'pit', 'marginal_rate', 'revenue', 'costs',
      'director_cost', 'welfare', 'tax_cost', 'profit_before_tax', 'cit', 'profit_after_tax',
      'dividend_wht', 'cit_with_dividend', 'total_tax', 'director_net', 'company_outlay',
    ] as const) {
      out[`${p}.${k}`] = row[k];
    }
    for (let i = 0; i < 7; i++) out[`${p}.bracket_tax_${i}`] = row.brackets[i]?.tax ?? 0;
    out[`${p}.bracket_count`] = row.brackets.length;
  }
  out['tax_saved_plan'] = r.tax_saved_plan;
  out['tax_saved_gross'] = r.tax_saved_gross;
  out['net_cost_plan'] = r.net_cost_plan;
  out['net_cost_gross'] = r.net_cost_gross;
  out['gross_rounds'] = r.gross_rounds;
  for (const k of ['years', 'premium_total', 'tax_before_total', 'tax_plan_total', 'tax_gross_total', 'saved_plan_total', 'saved_gross_total'] as const) {
    out[`multi_year.${k}`] = r.multi_year[k];
  }
  return out;
};

const payload = {
  meta: {
    purpose: 'ชุดทดสอบมาตรฐานของแอป "ผลประกอบการ (Keyman)" — ตัวเลข expect สร้างจากเอนจินเว็บ src/lib/tax/businessSim.ts ตัวจริง',
    generated_by: 'scripts/gen-bussim-fixture.ts (npx tsx)',
    engine: 'businessSim.ts → computePit (thaiPit.ts) + computeCit (thaiCit.ts)',
    year: 2569,
  },
  cases: cases.map((c) => ({
    name: c.name,
    input: { ...BASE, ...c.input },
    expect: flat({ ...BASE, ...c.input }),
  })),
};

process.stdout.write(JSON.stringify(payload, null, 1) + '\n');
