export type IncomeRule = { type:string; rate:number; base:string; scope?:string };
export type IncomeRuleVersionData = { version:string; effectiveFrom:string; rules:IncomeRule[] };

// Versioned engine — Admin แก้ไขได้ ไม่ hard-code
export function calculateIncome(
  performanceAmount: number,
  rules: IncomeRule[],
  context: { type:string; scope?:string }
): number {
  const rule = rules.find(r=> r.type === context.type);
  if(!rule) return 0;
  return +(performanceAmount * rule.rate).toFixed(2);
}

export const DEFAULT_RULES: IncomeRule[] = [
  { type:"personal_commission", rate:0.25, base:"first_year_premium" },
  { type:"renewal_commission", rate:0.05, base:"renewal_premium" },
  { type:"unit_management", rate:0.03, base:"team_premium", scope:"unit" },
  { type:"center_management", rate:0.02, base:"team_premium", scope:"center" },
  { type:"region_management", rate:0.01, base:"team_premium", scope:"region" },
];

export const INCOME_DISCLAIMER = "รายได้และผลประโยชน์ขึ้นอยู่กับผลงานจริง คุณสมบัติ เงื่อนไข การอนุมัติ และหลักเกณฑ์ที่ใช้ในแต่ละช่วงเวลา ตัวเลขประมาณการไม่ใช่การรับประกันรายได้ กรุณาตรวจสอบกับหน่วยงานหรือบริษัทที่เกี่ยวข้องก่อนนำไปใช้อ้างอิง";
