// premiumEstimate.ts — ประมาณการ "เบี้ยประกันชีวิต" สำหรับหน้า /apply (client-safe, pure)
//
// ⚠️ ความซื่อสัตย์ของตัวเลข (สำคัญ): ไฟล์นี้ "ประมาณการ" เบี้ยจากตารางอัตราอ้างอิงที่ระบบกำหนดไว้
//    ไม่ใช่ใบเสนอขายและไม่ใช่ราคาที่บริษัทเรียกเก็บจริง — เบี้ยจริงต้องคำนวณใน TL PRO PLUS /
//    ใบเสนอขายของไทยประกันชีวิต (ขึ้นกับสุขภาพ ประวัติการเจ็บป่วย อาชีพ และเงื่อนไข ณ วันรับประกัน)
//    ทุกผลลัพธ์จึงพา `basis` และ `disclaimer` กลับไปโชว์บนหน้าจอเสมอ
//
// ปรับอัตราได้ที่ตารางเดียวนี้ (BASE_PER_THOUSAND / CAT_FACTOR / GENDER_FACTOR) เมื่อมีอัตราจริงจากบริษัท

export const PREMIUM_RATE_VERSION = 'estimate-v1';

/** อัตราอ้างอิงต่อทุนประกัน 1,000 บาท ต่อปี (ตามช่วงอายุ) — ใช้เพื่อประมาณการเท่านั้น */
const BASE_PER_THOUSAND: { maxAge: number; rate: number }[] = [
  { maxAge: 25, rate: 26 },
  { maxAge: 30, rate: 29 },
  { maxAge: 35, rate: 33 },
  { maxAge: 40, rate: 38 },
  { maxAge: 45, rate: 45 },
  { maxAge: 50, rate: 54 },
  { maxAge: 55, rate: 65 },
  { maxAge: 60, rate: 79 },
  { maxAge: 70, rate: 98 },
  { maxAge: 200, rate: 130 },
];

/** ตัวคูณตามหมวดแบบประกัน (สะสมทรัพย์/บำนาญมีส่วนออมสูง => เบี้ยต่อทุนสูงกว่า) */
const CAT_FACTOR: { match: RegExp; factor: number }[] = [
  { match: /สะสมทรัพย์|ออม|ทวี/, factor: 1.35 },
  { match: /บำนาญ|เกษียณ/, factor: 1.25 },
  { match: /ชั่วระยะ|คุ้มครองชั่ว/, factor: 0.62 },
  { match: /ตลอดชีพ/, factor: 1.0 },
];

/** หญิงเบี้ยถูกกว่าชายในทุนเดียวกัน (อัตรามาตรฐานอุตสาหกรรม) */
const GENDER_FACTOR = { male: 1, female: 0.88 } as const;

/** ตัวคูณเบี้ย "อนุสัญญา/สัญญาเพิ่มเติม" ต่อทุน 1,000 บาท (ต่ำกว่าสัญญาหลัก เพราะไม่มีความคุ้มครองชีวิตเต็มจำนวน) */
export const RIDER_FACTOR = 0.35;

/** เพดานลดหย่อนเบี้ยประกันชีวิต (กรมสรรพากร): ที่จ่ายจริงไม่เกิน 100,000 บาท/ปี */
export const LIFE_PREMIUM_TAX_CAP = 100_000;

export type RiderInput = { name?: string | null; cat?: string | null; cover?: number | string | null };

export type PremiumInput = {
  planName?: string | null;
  planCat?: string | null;
  /** อนุสัญญา/สัญญาเพิ่มเติมที่เลือกไว้ (ไม่บังคับ) */
  riders?: RiderInput[] | null;
  gender?: 'male' | 'female' | string | null;
  age?: number | string | null;
  cover?: number | string | null;
  payYears?: number | string | null;
};

export type PremiumEstimate = {
  ok: boolean;
  mainPremium: number;
  riderPremium: number;
  ridersUsed: { name: string; premium: number }[];
  perThousand: number;
  catFactor: number;
  genderFactor: number;
  perYear: number;
  perMonth: number;
  payYears: number;
  totalPremium: number;
  taxDeductible: number;
  basis: string;
  disclaimer: string;
  warnings: string[];
};

const num = (v: unknown, d = 0) => {
  const n = Number(String(v ?? '').replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : d;
};

export function estimatePremium(input: PremiumInput): PremiumEstimate {
  const warnings: string[] = [];
  const age = Math.round(num(input.age, 0));
  const cover = Math.round(num(input.cover, 0));
  const payYears = Math.round(num(input.payYears, 0));

  const band = BASE_PER_THOUSAND.find((b) => age <= b.maxAge) || BASE_PER_THOUSAND[BASE_PER_THOUSAND.length - 1];
  const perThousand = band.rate;

  const catText = String(input.planCat || input.planName || '');
  const catFactor = CAT_FACTOR.find((c) => c.match.test(catText))?.factor ?? 1;
  const genderFactor = String(input.gender || 'male') === 'female' ? GENDER_FACTOR.female : GENDER_FACTOR.male;

  const ok = age > 0 && cover > 0;
  if (!ok) warnings.push('กรอกอายุและทุนประกันให้ครบก่อนคำนวณ');
  if (age && age < 20) warnings.push('ผู้เอาประกันต้องมีอายุครบ 20 ปี (เกณฑ์รับประกันของบริษัทอาจสูงกว่า)');
  if (age > 70) warnings.push('อายุเกินช่วงที่ระบบประมาณการได้ — ต้องยืนยันกับบริษัท');
  if (cover && cover < 100_000) warnings.push('ทุนประกันต่ำกว่า 100,000 บาท — บริษัทอาจไม่รับหรือมีเงื่อนไขพิเศษ');

  const mainPremium = ok ? Math.round((cover / 1000) * perThousand * catFactor * genderFactor) : 0;

  // ── อนุสัญญา/สัญญาเพิ่มเติม: คิดจากทุนของอนุสัญญา (ถ้าไม่ระบุ ใช้ทุนเดียวกับสัญญาหลัก) ──
  const ridersUsed: { name: string; premium: number }[] = [];
  if (ok && Array.isArray(input.riders)) {
    for (const rd of input.riders) {
      const rCover = Math.round(num(rd?.cover, cover)) || cover;
      const rPrem = Math.round((rCover / 1000) * perThousand * RIDER_FACTOR * genderFactor);
      if (rPrem > 0) ridersUsed.push({ name: String(rd?.name || rd?.cat || 'อนุสัญญา'), premium: rPrem });
    }
  }
  const riderPremium = ridersUsed.reduce((s, r) => s + r.premium, 0);
  const perYear = mainPremium + riderPremium;
  const perMonth = Math.round(perYear / 12);
  const taxDeductible = Math.min(perYear, LIFE_PREMIUM_TAX_CAP);
  const totalPremium = perYear * (payYears || 0);

  const basis = `สัญญาหลัก: อัตราอ้างอิง ${perThousand.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท/ทุน 1,000 บาท/ปี` +
    ` × ตัวคูณหมวด ${catFactor.toFixed(2)} × ตัวคูณเพศ ${genderFactor.toFixed(2)}` +
    (ridersUsed.length ? ` · อนุสัญญา ${ridersUsed.length} รายการ × ตัวคูณ ${RIDER_FACTOR}` : ' · ไม่มีอนุสัญญา');

  return {
    ok,
    mainPremium,
    riderPremium,
    ridersUsed,
    perThousand,
    catFactor,
    genderFactor,
    perYear,
    perMonth,
    payYears,
    totalPremium,
    taxDeductible,
    basis,
    disclaimer: `ประมาณการจากตารางอัตราอ้างอิง (${PREMIUM_RATE_VERSION}) — ไม่ใช่ใบเสนอขาย เบี้ยจริงยืนยันใน TL PRO PLUS ของไทยประกันชีวิต`,
    warnings,
  };
}
