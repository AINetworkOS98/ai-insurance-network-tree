/**
 * keyman.ts — ประกันคีย์แมน (Keyman Insurance): วงเงินคุ้มครองที่ธุรกิจควรมี + ผลทางภาษี v1.0.0
 * ---------------------------------------------------------------------------------------
 * ที่มา: หนังสือตอบข้อหารือกรมสรรพากร (rd.go.th)
 *   • กค 0706/5249 (21 มิ.ย. 2549) — บริษัทจ่ายเบี้ยประกันชีวิตแทนกรรมการ (บริษัทเป็นผู้รับผลประโยชน์)
 *     → หักเป็นรายจ่ายได้ ถ้าจ่ายให้กรรมการทุกคนเป็นการทั่วไป ไม่ต้องห้ามมาตรา 65 ตรี (3),(13)
 *     → เบี้ยที่จ่ายแทนกรรมการถือเป็นประโยชน์เพิ่ม เป็นเงินได้พึงประเมินตามมาตรา 40(1)
 *     → ผลประโยชน์จากกรมธรรม์ที่บริษัทได้รับ ถือเป็นเงินได้ของบริษัทตามมาตรา 65
 *   • กค 0706/8707 (17 ต.ค. 2549) — กรณีทำเพื่อ "ซื้อหุ้นคืน" จากทายาท
 *     → เบี้ยที่จ่ายแทน "กรรมการ" หักได้ (จ่ายทุกคนเป็นการทั่วไป) แต่จ่ายแทน "ผู้ถือหุ้น" = รายจ่ายส่วนตัว
 *        หรือให้โดยเสน่หา หักไม่ได้ ตามมาตรา 65 ตรี (3) · ผู้ถือหุ้นมีเงินได้พึงประเมินตามมาตรา 39
 *     → เงินค่าสินไหมที่บริษัทได้รับ = รายได้ของบริษัท (มาตรา 65)
 *     → เงินที่นำไปซื้อหุ้นคืนจากทายาท = รายจ่ายลงทุน หักไม่ได้ ตามมาตรา 65 ตรี (5)
 *   • กค 0702/9358 (12 พ.ย. 2552) — เบี้ยที่จ่ายแทนกรรมการเพื่อประโยชน์ของบริษัท หักได้ตามมาตรา 65 ตรี (3),(13)
 *     · เบี้ยเป็นเงินได้ 40(1)/(2) ของกรรมการ · สินไหมที่ครอบครัว/ทายาทรับ ยกเว้นตามมาตรา 42(13)
 *   • กค 0811/408 (21 ม.ค. 2543) — เบี้ย + ภาษีที่บริษัทออกให้ เป็นเงินได้ 40(1) ของพนักงาน ·
 *     เงินค่าภาษีอากรที่ออกให้ หักเป็นรายจ่ายได้ (ไม่ต้องห้าม 65 ตรี (6)) · สินไหมเพื่อละเมิด/เงินได้จากการประกันภัย
 *     ได้รับยกเว้นตามมาตรา 42(13)
 *   • กค 0702/10407 (21 ธ.ค. 2552) · กค 0706/397 (17 ม.ค. 2549) — กรณีลูกจ้าง/พนักงานทุกคนตามระเบียบสวัสดิการ
 *     → หักเป็นรายจ่ายได้ · พนักงานมีเงินได้ 40(1) · ผลประโยชน์ที่พนักงาน/ทายาทได้รับยกเว้นตามมาตรา 42(13)
 *
 * ⚠️ แก้กติกา/สูตรที่ไฟล์นี้ = ต้องแก้ python/keyman_insurance.py ให้ตรงกัน
 *    (ชุดทดสอบร่วม: python/testcases_keyman.json · GET /api/tax/keyman?selftest=1)
 */
import { computeCit } from './thaiCit';
import { computePit } from './thaiPit';

export const KEYMAN_VERSION = '1.0.0';
export const KEYMAN_YEAR = 2568;

export type KeymanInput = {
  // ── ข้อมูลธุรกิจ/บุคคลสำคัญ (ใช้ประเมินวงเงินคุ้มครอง) ──
  profit_per_year?: number;      // กำไรสุทธิของธุรกิจต่อปี
  years_to_replace?: number;     // จำนวนปีที่ต้องการทดแทนกำไรที่หายไป
  successor_cost?: number;       // ค่าใช้จ่ายสรรหา/ฝึกผู้สืบทอด
  revenue_at_risk?: number;      // รายได้ที่คาดว่าจะหายไประหว่างช่วงเปลี่ยนผ่าน
  guaranteed_debt?: number;      // หนี้สินที่ค้ำประกันโดยบุคคลสำคัญ
  share_buyout?: number;         // ภาระซื้อหุ้นคืนจากทายาท

  // ── เงื่อนไขทางภาษี ──
  premium?: number;              // เบี้ยประกันคีย์แมนที่บริษัทจ่ายต่อปี
  deductible?: boolean;          // จ่ายให้กรรมการ/พนักงาน "ทุกคนเป็นการทั่วไปตามระเบียบ" → หักเป็นรายจ่ายได้
  benefit_to_executive?: boolean;// เบี้ยถือเป็นประโยชน์เพิ่ม/เงินได้ของกรรมการ-พนักงาน (ตามข้อหารือ)
  company_pays_exec_tax?: boolean; // บริษัท "ออกภาษีเงินได้บุคคลธรรมดาให้" ด้วย (คำนวณเป็นทอด ๆ ตาม ป.96/2543)

  // ── บริบทของบริษัท/ผู้บริหาร สำหรับคิดภาษี ──
  company_revenue?: number;      // รายได้ของบริษัท (ใช้เกณฑ์ SME)
  company_expenses?: number;     // ค่าใช้จ่ายของบริษัท
  company_capital?: number;      // ทุนจดทะเบียนที่ชำระแล้ว
  executive_income?: number;     // เงินได้ประจำปีของบุคคลสำคัญ (คิดภาษีเงินได้บุคคลธรรมดา 40(1))
};

export type KeymanResult = {
  program: string; version: string; year: number;
  profit_need: number; replacement_need: number; obligation_need: number;
  recommended_cover: number; cover_method: string; cover_per_premium: number;
  premium: number;
  deductible: boolean; benefit_to_executive: boolean;
  cit_before: number; cit_after: number; cit_saving: number;
  pit_before: number; pit_after: number; exec_tax_increase: number;
  net_cost: number; net_cost_per_cover: number; result: string;
  // ── ภาษีที่บริษัท "ออกให้" (คำนวณเป็นทอด ๆ ตามคำสั่งกรมสรรพากรที่ ป. 96/2543) ──
  gu_tax_borne: number; gu_total_outlay: number; gu_cit_saving: number; gu_net_cost: number;
  gu_rounds: number; gu_converged: boolean; gu_marginal_rate: number;
  gu_employee_declared_income: number; gu_employee_gets: number;
  gu_rounds_detail: Array<{ round: number; income_with_tax: number; tax: number; increase: number }>;
  gu_note: string;
  checklist: Array<{ ok: boolean; item: string }>;
  rules: Array<{ situation: string; deduct: string; income: string; claim: string; source: string }>;
  notes: string[];
  sources: string[];
  disclaimer: string;
};

const num = (v: unknown) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0; };
const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

export function computeKeyman(input: KeymanInput): KeymanResult {
  const profit = num(input.profit_per_year);
  const years = num(input.years_to_replace);
  const successor = num(input.successor_cost);
  const revAtRisk = num(input.revenue_at_risk);
  const debt = num(input.guaranteed_debt);
  const buyout = num(input.share_buyout);

  const profitNeed = r2(profit * years);
  const replacementNeed = r2(successor + revAtRisk);
  const obligationNeed = r2(debt + buyout);
  const recommended = Math.max(profitNeed, replacementNeed, obligationNeed);
  const method = recommended === profitNeed && profitNeed > 0
    ? 'ทดแทนกำไร (กำไรสุทธิ × จำนวนปี)'
    : recommended === obligationNeed && obligationNeed > 0
      ? 'ภาระผูกพัน (หนี้ค้ำประกัน + ซื้อหุ้นคืนจากทายาท)'
      : recommended === replacementNeed && replacementNeed > 0
        ? 'ต้นทุนทดแทน (สรรหาผู้สืบทอด + รายได้ที่หายไป)'
        : 'ยังไม่มีข้อมูลเพียงพอ';

  const premium = num(input.premium);
  const deductible = input.deductible !== false;
  const benefit = input.benefit_to_executive !== false;

  const citBefore = computeCit({
    revenue: num(input.company_revenue), expenses: num(input.company_expenses), capital_paid_up: num(input.company_capital),
  }).tax_payable;
  const citAfter = computeCit({
    revenue: num(input.company_revenue), expenses: num(input.company_expenses) + (deductible ? premium : 0),
    capital_paid_up: num(input.company_capital),
  }).tax_payable;
  const citSaving = r2(citBefore - citAfter);

  const execIncome = num(input.executive_income);
  const pitBefore = computePit([{ salary: execIncome, personal: true }]).item12_total_tax;
  const pitAfter = computePit([{ salary: execIncome + (benefit ? premium : 0), personal: true }]).item12_total_tax;
  const execTaxIncrease = r2(pitAfter - pitBefore);

  const netCost = r2(premium - citSaving + execTaxIncrease);
  const netCostPerCover = premium > 0 ? r2(netCost / premium) : 0;

  // ── ภาษีที่บริษัท "ออกให้" — คำนวณเป็นทอด ๆ ตามคำสั่งกรมสรรพากรที่ ป. 96/2543 ข้อ 1(7),(8) ──
  // "ให้นำเงินค่าภาษีที่นายจ้างออกแทนให้ไปรวมกับเงินเดือนหรือค่าจ้างที่ลูกจ้างได้รับในปีนั้น แล้วคำนวณภาษี
  //  ตามเกณฑ์ในมาตรา 48 (1) ... จนกว่าจะไม่มีเงินค่าภาษีที่นายจ้างต้องออกแทนให้อีก"
  // และประมวลรัษฎากร มาตรา 39 นับ "เงินค่าภาษีอากรที่ผู้จ่ายเงินหรือผู้อื่นออกแทนให้" เป็นเงินได้พึงประเมินด้วย
  const paysTax = input.company_pays_exec_tax !== false; // บริษัทออกภาษีเงินได้บุคคลธรรมดาให้ด้วยหรือไม่
  const grossUpRounds: Array<{ round: number; income_with_tax: number; tax: number; increase: number }> = [];
  let taxBorne = 0;
  let converged = !paysTax;
  let finalMarginal = 0;
  const GU_MAX_ROUNDS = 60;
  for (let i = 1; paysTax && i <= GU_MAX_ROUNDS; i++) {
    const incomeWithTax = r2(execIncome + (benefit ? premium : 0) + taxBorne);
    const pit = computePit([{ salary: incomeWithTax, personal: true }]);
    const tax = r2(pit.item12_total_tax);
    finalMarginal = pit.marginal_rate;
    grossUpRounds.push({ round: i, income_with_tax: incomeWithTax, tax, increase: r2(tax - taxBorne) });
    if (Math.abs(tax - taxBorne) <= 0.01) { taxBorne = tax; converged = true; break; }
    taxBorne = tax;
  }
  const taxBorneDeductible = deductible; // เงินค่าภาษีอากรที่ออกให้: ห้ามหักเฉพาะเมื่อตัวรายการหลักไม่ใช่รายจ่ายเพื่อกิจการ (กค 0811/408 — ไม่ต้องห้าม 65 ตรี (6))
  const totalOutlay = r2(premium + taxBorne);
  const citWithAll = computeCit({
    revenue: num(input.company_revenue),
    expenses: num(input.company_expenses) + (deductible ? premium : 0) + (taxBorneDeductible ? taxBorne : 0),
    capital_paid_up: num(input.company_capital),
  }).tax_payable;
  const grossUpCitSaving = r2(citBefore - citWithAll);
  const grossUpNetCost = r2(totalOutlay - grossUpCitSaving);

  const checklist = [
    { ok: deductible, item: 'จ่ายให้กรรมการ/พนักงาน "ทุกคนเป็นการทั่วไป" ตามระเบียบ/มติที่ประชุมของบริษัท (ไม่ใช่เฉพาะผู้บริหารคนใดคนหนึ่ง)' },
    { ok: deductible, item: 'ระเบียบ/มติที่ประชุม + วัตถุประสงค์เพื่อผลประโยชน์ของบริษัท ไม่ใช่รายจ่ายส่วนตัวหรือให้โดยเสน่หา (มาตรา 65 ตรี (3),(13))' },
    { ok: true, item: 'ใบเสร็จรับเงินระบุว่าเบี้ยประกันนี้ "จ่ายโดยบริษัท" (ตามแนววินิจฉัย กค 0811/408)' },
    { ok: benefit, item: 'รับรู้ว่าเบี้ยที่บริษัทจ่ายแทนกรรมการ/พนักงาน เป็นเงินได้พึงประเมิน 40(1)/(2) ที่ต้องนำไปยื่น ภ.ง.ด.90/91' },
    { ok: true, item: 'ถ้าบริษัทเป็นผู้รับประโยชน์: เงินค่าสินไหมที่ได้รับต้องบันทึกเป็นรายได้ของบริษัท (มาตรา 65)' },
    { ok: true, item: 'เงินค่าสินไหมที่นำไปซื้อหุ้นคืนจากทายาท เป็นรายจ่ายลงทุน — หักเป็นค่าใช้จ่ายไม่ได้ (มาตรา 65 ตรี (5))' },
  ];

  const rules: KeymanResult['rules'] = [
    {
      situation: 'จ่ายเบี้ยให้ "กรรมการ/พนักงานทุกคน" เป็นการทั่วไปตามระเบียบของบริษัท',
      deduct: 'หักเป็นรายจ่ายได้ (ไม่ต้องห้าม มาตรา 65 ตรี (3),(13))',
      income: 'เป็นประโยชน์เพิ่ม/เงินได้พึงประเมิน 40(1) หรือ (2) ของกรรมการ-พนักงาน',
      claim: 'ค่าสินไหมที่บริษัท (ผู้รับประโยชน์) ได้รับ = รายได้ของบริษัท · ถ้าครอบครัว/ทายาทเป็นผู้รับประโยชน์ เงินได้นั้นได้รับยกเว้นตามมาตรา 42(13)',
      source: 'กค 0706/5249 · กค 0702/9358 · กค 0811/408',
    },
    {
      situation: 'จ่ายเบี้ยให้ "ผู้ถือหุ้น/กรรมการเฉพาะราย" ไม่เป็นธรรมเนียมทั่วไป',
      deduct: 'หักไม่ได้ — เป็นรายจ่ายส่วนตัวหรือให้โดยเสน่หา (มาตรา 65 ตรี (3))',
      income: 'ผู้ถือหุ้นมีเงินได้พึงประเมินตามมาตรา 39 ต้องนำไปรวมคำนวณภาษี',
      claim: 'เงินค่าสินไหมที่บริษัทนำไปซื้อหุ้นคืนจากทายาท = รายจ่ายลงทุน หักไม่ได้ (มาตรา 65 ตรี (5))',
      source: 'กค 0706/8707',
    },
    {
      situation: 'บริษัทจ่ายเบี้ยแทนพนักงานทุกคนตามระเบียบสวัสดิการ (กรมธรรม์สะสมทรัพย์ นายจ้างถือกรมธรรม์)',
      deduct: 'หักเป็นรายจ่ายได้ · ผลประโยชน์ที่ส่งมอบให้พนักงานตามระเบียบ (ถือเป็นส่วนหนึ่งของสัญญาจ้าง) หักได้ด้วย',
      income: 'เบี้ยและผลประโยชน์ที่พนักงานได้รับ = เงินได้พึงประเมิน 40(1)',
      claim: 'ผลประโยชน์ที่พนักงานผู้เอาประกันหรือทายาทได้รับตามกรมธรรม์ ได้รับยกเว้นตามมาตรา 42(13)',
      source: 'กค 0702/10407 · กค 0706/397',
    },
  ];

  const notes: string[] = [];
  if (!deductible) notes.push('กรณีนี้บริษัทหักเบี้ยเป็นค่าใช้จ่ายไม่ได้ → ไม่มีผลประหยัดภาษีนิติบุคคล และกรรมการ/ผู้ถือหุ้นยังมีเงินได้ที่ต้องนำไปยื่น → ต้นทุนสุทธิสูงกว่าที่จ่ายจริง');
  if (benefit && execTaxIncrease > citSaving) notes.push('ภาระภาษีบุคคลธรรมดาของบุคคลสำคัญสูงกว่าภาษีนิติบุคคลที่ประหยัดได้ → ต้นทุนสุทธิมากกว่าเบี้ยประกัน · ควรออกแบบเป็นสวัสดิการกลุ่ม/พิจารณาโครงสร้างให้เหมาะสม');
  if (citSaving > 0 && execTaxIncrease === 0) notes.push('บุคคลสำคัญมีเงินได้ไม่ถึงเกณฑ์เสียภาษี → เบี้ยที่จ่ายแทนยังไม่เกิดภาระภาษีบุคคลธรรมดา ทำให้ได้ประโยชน์ทางภาษีเต็มจำนวน');
  if (taxBorne > 0) notes.push(`กรณีบริษัท "ออกภาษีให้" ด้วย: ต้องออกภาษีเงินได้บุคคลธรรมดาให้ทั้งสิ้น ${taxBorne.toLocaleString('en-US')} บาท (คำนวณเป็นทอด ๆ ${grossUpRounds.length} ทอด ตามคำสั่งกรมสรรพากรที่ ป. 96/2543) · บริษัทหักได้ทั้งเบี้ยประกันและภาษีที่ออกให้ → ประหยัดภาษีนิติบุคคลรวม ${grossUpCitSaving.toLocaleString('en-US')} บาท/ปี`);
  notes.push('การหักภาษี ณ ที่จ่ายจาก "ประโยชน์เพิ่ม" ที่ไม่ใช่ตัวเงินเป็นเรื่องเฉพาะราย — ให้ตรวจกับสำนักงานสรรพากร (โทร. 1161) ก่อนนำส่ง');
  notes.push('วงเงินคุ้มครองที่แนะนำคือค่าสูงสุดของ 3 วิธี (ทดแทนกำไร · ต้นทุนทดแทน · ภาระผูกพัน) — บริษัทสามารถเลือกทำหลายกรมธรรม์รวมกันให้ครอบคลุมทุกด้านได้');

  return {
    program: 'keyman_insurance.py', version: KEYMAN_VERSION, year: KEYMAN_YEAR,
    profit_need: profitNeed, replacement_need: replacementNeed, obligation_need: obligationNeed,
    recommended_cover: r2(recommended), cover_method: method,
    cover_per_premium: premium > 0 ? r2(recommended / premium) : 0,
    premium, deductible, benefit_to_executive: benefit,
    cit_before: r2(citBefore), cit_after: r2(citAfter), cit_saving: citSaving,
    pit_before: r2(pitBefore), pit_after: r2(pitAfter), exec_tax_increase: execTaxIncrease,
    net_cost: netCost, net_cost_per_cover: netCostPerCover,
    gu_tax_borne: r2(taxBorne), gu_total_outlay: totalOutlay, gu_cit_saving: grossUpCitSaving,
    gu_net_cost: grossUpNetCost, gu_rounds: grossUpRounds.length, gu_converged: converged,
    gu_marginal_rate: finalMarginal,
    gu_employee_declared_income: r2(execIncome + (benefit ? premium : 0) + taxBorne),
    gu_employee_gets: r2(execIncome + (benefit ? premium : 0)), gu_rounds_detail: grossUpRounds,
    gu_note: 'คำนวณเป็นทอด ๆ ตามคำสั่งกรมสรรพากรที่ ป. 96/2543 ข้อ 1(7),(8): นำภาษีที่บริษัทออกแทนให้ไปรวมเป็นเงินได้ของกรรมการ/พนักงาน แล้วคำนวณภาษีใหม่ ทำซ้ำจนไม่มีภาษีที่ต้องออกแทนอีก · เงินค่าภาษีอากรที่ออกแทนให้เป็นเงินได้พึงประเมินตามมาตรา 39 และเป็นรายจ่ายที่หักได้ของบริษัท (ไม่ต้องห้าม 65 ตรี (6) ตาม กค 0811/408)',
    result: netCost <= 0 ? 'ต้นทุนภาษีสุทธิเป็นศูนย์หรือติดลบ (ได้ประโยชน์ทางภาษีเต็มที่)' : `ต้นทุนภาษีสุทธิ ${netCost.toLocaleString('en-US')} บาท/ปี`,
    checklist, rules, notes,
    sources: [
      'กค 0706/5249 (21 มิ.ย. 2549) บริษัทจ่ายเบี้ยประกันชีวิตแทนกรรมการ: https://www.rd.go.th/31916.html',
      'กค 0706/8707 (17 ต.ค. 2549) จ่ายเบี้ยให้กรรมการ/ผู้ถือหุ้น + ซื้อหุ้นคืน: https://www.rd.go.th/32877.html',
      'กค 0702/9358 (12 พ.ย. 2552) เบี้ยประกันชีวิตให้กรรมการ: https://www.rd.go.th/42088.html',
      'กค 0811/408 (21 ม.ค. 2543) บริษัทจ่ายเบี้ยประกันชีวิตให้กรรมการผู้จัดการ: https://www.rd.go.th/23827.html',
      'กค 0702/10407 (21 ธ.ค. 2552) นายจ้างจ่ายเบี้ยประกันชีวิตให้พนักงาน: https://www.rd.go.th/42159.html',
      'กค 0706/397 (17 ม.ค. 2549) นายจ้างจ่ายเบี้ยประกันชีวิตให้พนักงาน: https://www.rd.go.th/30689.html',
      'อัตราภาษีเงินได้นิติบุคคล (ใช้คำนวณผลประหยัด): https://www.rd.go.th/841.html',
      'คำสั่งกรมสรรพากรที่ ป. 96/2543 (7 ก.พ. 2543) ข้อ 1(7),(8) วิธีคำนวณภาษีที่ "ออกให้" เป็นทอด ๆ: https://www.rd.go.th/3558.html',
      'ประมวลรัษฎากร มาตรา 39 — เงินค่าภาษีอากรที่ผู้จ่ายเงินหรือผู้อื่นออกแทนให้ เป็นเงินได้พึงประเมิน',
      'กค 0702(กม.05)/2394 (1 ธ.ค. 2551) กรณีบริษัทออกภาษีให้ — ภาษีที่ออกให้ถือเป็นเงินได้ประเภทเดียวกับเงินได้ที่ได้รับ (ภาษีทอดแรก): https://www.rd.go.th/39891.html',
    ],
    disclaimer: 'เป็นการประมาณการเพื่อวางแผน ไม่ใช่การวินิจฉัยภาษีอย่างเป็นทางการ — ผลทางภาษีขึ้นอยู่กับข้อเท็จจริง (ระเบียบของบริษัท ผู้รับประโยชน์ วัตถุประสงค์) โปรดตรวจสอบกับสำนักงานสรรพากร (โทร. 1161) หรือผู้สอบบัญชี',
  };
}
