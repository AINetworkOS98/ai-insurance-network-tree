/**
 * thaiCit.ts — เครื่องคำนวณภาษีเงินได้นิติบุคคล (Corporate Income Tax) v1.0.0
 * ---------------------------------------------------------------------------
 * อ้างอิงกรมสรรพากร:
 *   • อัตราภาษี 20% ของกำไรสุทธิ (มาตรา 67)
 *   • อัตรา SME (มาตรา 67 วรรคสอง + rd.go.th/841): ทุนจดทะเบียนที่ชำระแล้วในวันสุดท้ายของ
 *     รอบระยะเวลาบัญชีไม่เกิน 5 ล้านบาท และรายได้จากการขายสินค้า/ให้บริการไม่เกิน 30 ล้านบาท
 *     → กำไรสุทธิไม่เกิน 300,000 ยกเว้น · 300,001–3,000,000 ร้อยละ 15 · เกิน 3,000,000 ร้อยละ 20
 *   • เงินบริจาคหักได้ไม่เกินร้อยละ 2 ของกำไรสุทธิ (มาตรา 65 ตรี (3))
 *   • ขาดทุนยกไปหักได้ 5 รอบระยะเวลาบัญชี (มาตรา 65 ตรี (12))
 *   • ภ.ง.ด.51 (ครึ่งปี: ประมาณการกำไรทั้งปี จ่ายร้อยละ 50 ของภาษีประมาณการ ภายใน 2 เดือน
 *     นับแต่วันสุดท้ายของ 6 เดือนแรก) · ภ.ง.ด.50 (ภายใน 150 วันนับแต่วันสุดท้ายของรอบบัญชี)
 *   • ภาษีหัก ณ ที่จ่ายที่ถูกหักไว้ (1% ค่าขนส่ง · 2% ค่าโฆษณา · 3% ค่าบริการ · 5% ค่าเช่า)
 *     นำมาเป็นเครดิตหักจากภาษีที่ต้องชำระได้
 *
 * ⚠️ แก้กติกาที่ไฟล์นี้ = ต้องแก้ python/thai_cit_calculator.py ให้ตรงกัน
 *    (ชุดทดสอบร่วม: python/testcases_thai_cit.json · GET /api/tax/thai-cit?selftest=1)
 */

export const CIT_CALC_VERSION = '1.0.0';
export const CIT_YEAR = 2569;

export const CIT_STANDARD_RATE = 0.20;

/** อัตรา SME: (เพดานกำไรสุทธิของขั้น, อัตรา) */
export const CIT_SME_BRACKETS: Array<[number, number]> = [
  [300_000, 0.0], [3_000_000, 0.15], [Number.POSITIVE_INFINITY, 0.20],
];

export const CIT_LIMITS = {
  sme_capital: 5_000_000,        // ทุนจดทะเบียนที่ชำระแล้ว ≤ 5 ล้านบาท
  sme_revenue: 30_000_000,       // รายได้จากการขายสินค้า/ให้บริการ ≤ 30 ล้านบาท
  sme_exempt_profit: 300_000,    // กำไรสุทธิ 300,000 แรกยกเว้น (กรณี SME)
  donation_rate: 0.02,           // เงินบริจาคหักได้ไม่เกิน 2% ของกำไรสุทธิ
  loss_carry_years: 5,           // ขาดทุนยกไปได้ 5 รอบระยะเวลาบัญชี
  half_year_rate: 0.50,          // ภ.ง.ด.51 จ่ายร้อยละ 50 ของภาษีประมาณการทั้งปี
};

export type CitInput = {
  revenue?: number;              // รายได้จากการขายสินค้า/ให้บริการทั้งปี
  other_income?: number;         // รายได้อื่น (ดอกเบี้ย ฯลฯ)
  expenses?: number;             // ค่าใช้จ่ายที่หักได้ (รวมค่าเสื่อมราคา)
  loss_carry_forward?: number;   // ขาดทุนสะสมยกมา (≤ 5 รอบบัญชี)
  donations?: number;            // เงินบริจาคที่จ่ายในรอบบัญชี
  capital_paid_up?: number;      // ทุนจดทะเบียนที่ชำระแล้ว (วันสุดท้ายของรอบบัญชี)
  withholding?: number;          // ภาษีหัก ณ ที่จ่ายที่ถูกหักไว้ (เครดิต)
  pnd51_paid?: number;           // ภาษีที่ชำระตาม ภ.ง.ด.51 ไปแล้ว
  boi_promoted?: boolean;        // ได้รับส่งเสริมการลงทุน (ยกเว้นตามบัตรส่งเสริม) — แสดงหมายเหตุ
};

export type CitBracketStep = { range: string; rate: number; amount: number; tax: number };

export type CitResult = {
  program: string; version: string; year: number;
  revenue: number; other_income: number; total_revenue: number;
  expenses: number;
  profit_before_loss: number;
  loss_carry_forward: number;
  profit_after_loss: number;
  donations_paid: number;
  donations_allowed: number;
  donations_note: string;
  taxable_profit: number;
  is_sme: boolean;
  sme_reason: string;
  sme_steps: CitBracketStep[];
  tax_sme: number;
  tax_standard: number;
  tax_payable: number;
  rate_used: number;
  marginal_rate: number;
  better_option: string;
  saving_vs_standard: number;
  half_year_due: number;
  withholding: number;
  pnd51_paid: number;
  net_payable: number;
  result: string;
  deadlines: Array<{ form: string; due: string; detail: string }>;
  notes: string[];
  sources: string[];
  disclaimer: string;
};

const r2 = (v: number) => Math.round((Number(v) || 0) * 100) / 100;
const n = (v: unknown) => Math.max(0, Number(v) || 0);

export function citSmeTax(taxableProfit: number): { steps: CitBracketStep[]; tax: number } {
  const steps: CitBracketStep[] = [];
  let tax = 0;
  let lower = 0;
  for (const [upper, rate] of CIT_SME_BRACKETS) {
    if (taxableProfit <= lower) break;
    const amount = Math.min(taxableProfit, upper) - lower;
    if (amount <= 0) break;
    const t = amount * rate;
    tax += t;
    steps.push({
      range: upper === Number.POSITIVE_INFINITY
        ? `เกิน ${lower.toLocaleString('en-US')} บาทขึ้นไป`
        : lower === 0
          ? `ไม่เกิน ${upper.toLocaleString('en-US')} บาท`
          : `เกิน ${lower.toLocaleString('en-US')} แต่ไม่เกิน ${upper.toLocaleString('en-US')} บาท`,
      rate, amount: r2(amount), tax: r2(t),
    });
    lower = upper;
  }
  return { steps, tax: r2(tax) };
}

export function computeCit(input: CitInput): CitResult {
  const revenue = n(input.revenue);
  const otherIncome = n(input.other_income);
  const totalRevenue = revenue + otherIncome;
  const expenses = n(input.expenses);
  const profitBeforeLoss = Math.max(0, totalRevenue - expenses);
  const lossCarry = Math.min(n(input.loss_carry_forward), profitBeforeLoss);
  const profitAfterLoss = Math.max(0, profitBeforeLoss - lossCarry);

  const cap = profitAfterLoss * CIT_LIMITS.donation_rate;
  const donationsPaid = n(input.donations);
  const donationsAllowed = Math.min(donationsPaid, cap);
  const taxableProfit = r2(Math.max(0, profitAfterLoss - donationsAllowed));

  const capital = n(input.capital_paid_up);
  const isSme = capital <= CIT_LIMITS.sme_capital && revenue <= CIT_LIMITS.sme_revenue;
  const smeReason = isSme
    ? `เข้าเกณฑ์ SME: ทุนจดทะเบียนที่ชำระแล้ว ${capital.toLocaleString('en-US')} บาท (≤ ${CIT_LIMITS.sme_capital.toLocaleString('en-US')}) และรายได้จากการขาย/ให้บริการ ${revenue.toLocaleString('en-US')} บาท (≤ ${CIT_LIMITS.sme_revenue.toLocaleString('en-US')})`
    : capital > CIT_LIMITS.sme_capital
      ? `ไม่เข้าเกณฑ์ SME เพราะทุนจดทะเบียนที่ชำระแล้ว ${capital.toLocaleString('en-US')} บาท เกิน ${CIT_LIMITS.sme_capital.toLocaleString('en-US')} บาท`
      : `ไม่เข้าเกณฑ์ SME เพราะรายได้จากการขาย/ให้บริการ ${revenue.toLocaleString('en-US')} บาท เกิน ${CIT_LIMITS.sme_revenue.toLocaleString('en-US')} บาท`;

  const sme = citSmeTax(taxableProfit);
  const taxSme = sme.tax;
  const taxStandard = r2(taxableProfit * CIT_STANDARD_RATE);
  const taxPayable = isSme ? taxSme : taxStandard;
  const rateUsed = taxableProfit > 0 ? taxPayable / taxableProfit : 0;
  const marginal = isSme ? (sme.steps.length ? sme.steps[sme.steps.length - 1].rate : 0) : CIT_STANDARD_RATE;
  const saving = isSme ? r2(taxStandard - taxSme) : 0;

  const halfYearDue = r2(taxPayable * CIT_LIMITS.half_year_rate);
  const withholding = n(input.withholding);
  const pnd51 = n(input.pnd51_paid);
  const netPayable = r2(taxPayable - withholding - pnd51);

  const notes: string[] = [];
  if (donationsPaid > donationsAllowed) {
    notes.push(`เงินบริจาค ${donationsPaid.toLocaleString('en-US')} บาท หักได้เพียง ${r2(donationsAllowed).toLocaleString('en-US')} บาท (ไม่เกินร้อยละ 2 ของกำไรสุทธิ ${r2(profitAfterLoss).toLocaleString('en-US')} บาท) — ส่วนเกินห้ามหัก`);
  }
  if (n(input.loss_carry_forward) > lossCarry) {
    notes.push(`ขาดทุนยกมา ${n(input.loss_carry_forward).toLocaleString('en-US')} บาท หักได้เพียง ${lossCarry.toLocaleString('en-US')} บาท (หักไม่เกินกำไรของรอบนี้) · ขาดทุนยกไปได้ไม่เกิน 5 รอบระยะเวลาบัญชี`);
  }
  if (input.boi_promoted) {
    notes.push('กิจการที่ได้รับส่งเสริมการลงทุน (BOI): รายได้ที่ได้รับยกเว้นตามบัตรส่งเสริมไม่ต้องนำมารวมในกำไรสุทธิทางภาษี — ให้แยกคำนวณเฉพาะรายได้ที่ไม่ได้รับยกเว้น');
  }
  notes.push('ค่าใช้จ่ายที่ห้ามนำมาหัก: เงินสำรองต่าง ๆ (นอกจากที่กฎหมายระบุ) · ค่าปรับ/เงินเพิ่มภาษี · เงินลงทุน · รายจ่ายส่วนตัวที่ไม่เกี่ยวกับกิจการ · ค่าตอบแทนกรรมการที่ไม่ได้หัก ณ ที่จ่าย (มาตรา 65 ตรี)');

  return {
    program: 'thai_cit_calculator.py', version: CIT_CALC_VERSION, year: CIT_YEAR,
    revenue, other_income: otherIncome, total_revenue: r2(totalRevenue), expenses,
    profit_before_loss: r2(profitBeforeLoss), loss_carry_forward: r2(lossCarry),
    profit_after_loss: r2(profitAfterLoss),
    donations_paid: r2(donationsPaid), donations_allowed: r2(donationsAllowed),
    donations_note: `หักได้ไม่เกินร้อยละ 2 ของกำไรสุทธิ = ${r2(cap).toLocaleString('en-US')} บาท`,
    taxable_profit: taxableProfit,
    is_sme: isSme, sme_reason: smeReason, sme_steps: sme.steps,
    tax_sme: taxSme, tax_standard: taxStandard,
    tax_payable: taxPayable, rate_used: rateUsed, marginal_rate: marginal,
    better_option: isSme && taxSme < taxStandard ? 'SME' : 'อัตราคงที่ร้อยละ 20',
    saving_vs_standard: saving,
    half_year_due: halfYearDue,
    withholding, pnd51_paid: pnd51,
    net_payable: netPayable,
    result: netPayable > 0.5 ? 'ต้องชำระภาษีเพิ่ม' : netPayable < -0.5 ? 'ชำระไว้เกิน — ขอคืนภาษีได้' : 'ไม่มีภาษีต้องชำระเพิ่ม/ขอคืน',
    deadlines: [
      { form: 'ภ.ง.ด.50', due: 'ภายใน 150 วันนับแต่วันสุดท้ายของรอบระยะเวลาบัญชี (รอบ ม.ค.–ธ.ค. → 31 พฤษภาคม)', detail: 'แบบแสดงรายการภาษีเงินได้นิติบุคคล ประจำรอบระยะเวลาบัญชี พร้อมงบการเงินที่ตรวจสอบแล้ว (กรณีกำไรสุทธิ)' },
      { form: 'ภ.ง.ด.51', due: 'ภายใน 2 เดือนนับแต่วันสุดท้ายของ 6 เดือนแรกของรอบบัญชี (รอบ ม.ค.–ธ.ค. → 31 สิงหาคม)', detail: 'แบบแสดงรายการภาษีเงินได้นิติบุคคลสำหรับครึ่งรอบระยะเวลาบัญชี จ่ายร้อยละ 50 ของภาษีประมาณการทั้งปี' },
      { form: 'ภ.พ.30 / ภ.ง.ด.53/54', due: 'ภายในวันที่ 7 และ 15 ของเดือนถัดไป', detail: 'ภาษีมูลค่าเพิ่ม (ภ.พ.30) ภายในวันที่ 15 · ภาษีหัก ณ ที่จ่าย (ภ.ง.ด.53 สำหรับนิติบุคคล / 54 สำหรับบุคคลธรรมดา) ภายในวันที่ 7' },
    ],
    notes,
    sources: [
      'อัตราภาษีและการคำนวณภาษีเงินได้นิติบุคคล: https://www.rd.go.th/841.html',
      'คู่มือภาษีเงินได้นิติบุคคลสำหรับผู้ประกอบการ SME: https://www.rd.go.th/fileadmin/user_upload/SMEs/infographic/guidelines_SME_290965.pdf',
      'หน้าดาวน์โหลดแบบ ภ.ง.ด.50 / ภ.ง.ด.51: https://www.rd.go.th/67335.html',
      'อัตราภาษีเงินได้นิติบุคคลร้อยละ 20 (มาตรา 67) · ลดหย่อนบางประเภท (พระราชกฤษฎีกา ฉบับที่ 631 พ.ศ. 2560)',
    ],
    disclaimer: 'ตัวเลขนี้เป็นการประมาณการเพื่อวางแผนภาษีตามหลักเกณฑ์กรมสรรพากร ไม่ใช่การวินิจฉัยภาษีอย่างเป็นทางการ — กรณีมีรายการปรับปรุงทางภาษีเฉพาะราย โปรดปรึกษาสำนักงานสรรพากร (โทร. 1161) หรือผู้สอบบัญชี',
  };
}
