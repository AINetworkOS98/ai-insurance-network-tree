import { DEFAULT_RULES_2021 } from './compensationRules';
import type { CompensationRule } from './types';

/**
 * ruleEngine — อ่าน "เกณฑ์ที่ประกาศไว้" (DEFAULT_RULES_2021 = โครงสร้างรายได้ ไทยประกันชีวิต 15 Jan 64)
 * มาใช้คำนวณจริง แทนการ hard-code เลขในไฟล์เครื่องยนต์
 *
 * เดิม: ไฟล์เกณฑ์ถูกประกาศเป็น 'active' แต่ไม่มีโค้ดใดอ่าน tiers/rate/fixedAmount เลย
 * (สูตรจริง hard-code ใน calculationEngine) → เวลาเกณฑ์กับโค้ดไม่ตรงกัน ไม่มีใครรู้
 * ตอนนี้: ตัวเลขทุกตัวมาจากที่เดียว (ไฟล์เกณฑ์) แก้เกณฑ์ที่เดียว = สูตรเปลี่ยนตามทั้งระบบ
 *
 * นโยบายการปัดเศษของระบบ: ปัดเป็นจำนวนเต็มบาท (Math.round) ทุกสูตร เพื่อให้ยอดที่แสดงบนสลิป
 * และยอดที่ลง ledger ตรงกัน — ที่อื่นในระบบ (lib/income.ts) ที่ปัด 2 ตำแหน่งเป็นตัวประมาณการคนละฐาน
 */

/** นโยบายปัดเศษศูนย์กลาง — ทุกสูตรต้องเรียกตัวนี้ */
export function roundBaht(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value);
}

/** หา rule ที่ประกาศไว้ตาม incomeType (คืน undefined ถ้าไม่มีในเกณฑ์) */
export function ruleFor(incomeType: string): CompensationRule | undefined {
  return DEFAULT_RULES_2021.find((r) => r.incomeType === incomeType && r.status === 'active');
}

/** มีเกณฑ์ประกาศไว้หรือไม่ (ใช้แยก "คำนวณได้ 0" ออกจาก "ไม่มีเกณฑ์") */
export function hasRule(incomeType: string): boolean {
  return !!ruleFor(incomeType);
}

type Tier = { min: number; max?: number; rate?: number; fixedAmount?: number };

function pickTier(incomeType: string, value: number): Tier | undefined {
  const rule = ruleFor(incomeType) as any;
  const tiers: Tier[] = rule?.tiers || [];
  return tiers.find((t) => value >= t.min && (t.max === undefined || value <= t.max));
}

/** ค่าคงที่ตามขั้นบันได (ruleType: tier_fixed) — คืน 0 ถ้าไม่ถึงขั้นแรก */
export function tierFixedAmount(incomeType: string, value: number): number {
  const t = pickTier(incomeType, value);
  return roundBaht(Number(t?.fixedAmount ?? 0));
}

/** เปอร์เซ็นต์ตามขั้นบันได (ruleType: tier_percentage / annual_bonus_tier) — คูณกับยอดฐาน */
export function tierPercentageOf(incomeType: string, value: number): number {
  const t = pickTier(incomeType, value);
  if (!t || typeof t.rate !== 'number') return 0;
  // ขั้นของ unit_management ไม่มี max บนสุด → ใช้ค่าจากขั้นที่เลือก
  return roundBaht(value * t.rate);
}

/** เปอร์เซ็นต์คงที่ (ruleType: percentage) */
export function percentageOf(incomeType: string, value: number): number {
  const rule = ruleFor(incomeType) as any;
  const rate = Number(rule?.rate ?? 0);
  if (!rate) return 0;
  return roundBaht(value * rate);
}

/** จ่ายต่อหน่วย (ruleType: per_unit_fixed / per_region_fixed) */
export function perUnitAmount(incomeType: string, count: number): number {
  const rule = ruleFor(incomeType) as any;
  if (!rule || count <= 0) return 0;
  return roundBaht(Number(rule.fixedAmount ?? 0) * count);
}

/** ค่าต่อศูนย์ตามขั้น + ค่าคงที่ฐาน (ruleType: per_center_tiered ของ center_separation) */
export function perCenterTieredAmount(incomeType: string, count: number, tierValue: number): number {
  const rule = ruleFor(incomeType) as any;
  if (!rule || count <= 0) return 0;
  const base = Number(rule.fixedAmount ?? 0) * count;
  const t = pickTier(incomeType, tierValue);
  const bonus = Number(t?.fixedAmount ?? 0) * count;
  return roundBaht(base + bonus);
}

/** เกณฑ์คุณสมบัติของตำแหน่ง (minFyc ฯลฯ) อ่านจาก rule ที่ผูกกับตำแหน่งนั้น */
export function qualificationOf(positionId: string): { minFyc: number; requiredSeparations?: { positionId: string; count: number }; description: string } | undefined {
  const rule = DEFAULT_RULES_2021.find((r) => (r as any).positionId === positionId) as any;
  if (!rule) return undefined;
  return rule.qualification;
}

/** รายชื่อ incomeType ที่ประกาศไว้ (ใช้ตรวจว่ามีหมวดที่ประกาศแต่ยังไม่คำนวณหรือไม่) */
export function declaredIncomeTypes(): string[] {
  return DEFAULT_RULES_2021.map((r) => r.incomeType);
}
