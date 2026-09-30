import {
  PositionId, 
  MemberMetrics, 
  CompensationPlanVersion, 
  Position, 
  CompensationRule,
  IncomeBreakdown,
  IncomeSummary
} from './types';
import { DEFAULT_POSITIONS } from './compensationRules'; // ใช้ตรวจระดับตำแหน่งก่อนจ่ายแต่ละหมวด
import { percentageOf, tierPercentageOf, tierFixedAmount, perUnitAmount, perCenterTieredAmount, roundBaht } from './ruleEngine'; // ตัวเลขทุกตัวมาจากไฟล์เกณฑ์ที่ประกาศไว้

export const INCOME_CATEGORIES = [
  'personal_commission',
  'unit_management', 
  'unit_separation',
  'center_type1',
  'center_type2',
  'center_type3',
  'center_separation',
  'center_bonus',
  'region_type1',
  'region_type2',
  'region_bonus',
  'annual_bonus',
  'special_bonus'
] as const;

export type IncomeCategory = typeof INCOME_CATEGORIES[number];

export interface CalculationInput extends MemberMetrics {
  memberId: string;
  positionId: PositionId;
  period: string;
  planVersion: CompensationPlanVersion;
}

export interface IncomeResult {
  memberId: string;
  positionId: PositionId;
  totalIncome: number;
  breakdown: IncomeBreakdown;
  summary: IncomeSummary;
  metricsUsed: MemberMetrics;
}

// Re-export types for convenience
export type { PositionId, MemberMetrics, CompensationPlanVersion, Position, CompensationRule, IncomeBreakdown, IncomeSummary } from './types';
export { DEFAULT_POSITIONS, INITIAL_PLAN_VERSION } from './compensationRules';

/**
 * ค่าบำเหน็จส่วนตัว (Category 1)
 * เกณฑ์ที่ประกาศ (rule_personal_com): rate 1.0 บนฐาน personal_com
 * — ยอด "COM" ใน ledger คือค่าบำเหน็จที่เกิดขึ้นจริง ผลงานส่วนตัวจึงรับเต็มจำนวนตามเกณฑ์
 * (เดิมโค้ดคูณ 0.25 ซึ่งเป็นอัตราของฐาน "เบี้ยปีแรก" คนละฐานกัน ทำให้รายงานต่ำกว่าที่ประกาศไว้ 4 เท่า)
 */
export function calculatePersonalCommission(metrics: Omit<MemberMetrics, 'memberId' | 'positionId'>): number {
  return percentageOf('personal_commission', Number(metrics.personalCOM || 0));
}

/**
 * ค่าจัดงานหน่วย (Category 2) — ขั้นบันไดตามเกณฑ์ที่ประกาศ (rule_unit_management)
 * 5,000=25% / 10,000=30% / 20,000=35% / 35,000+=40%
 */
export function calculateUnitCommission(teamCOM: number): number {
  return tierPercentageOf('unit_management', teamCOM);
}

/**
 * ค่าแยกหน่วย (Category 3) — เกณฑ์ที่ประกาศ (rule_unit_separation): 2,000 บาท/หน่วย ไม่จำกัดจำนวน
 */
export function calculateUnitSeparation(separatedUnitsCount: number): number {
  return perUnitAmount('unit_separation', separatedUnitsCount);
}

/**
 * ค่าจัดงานศูนย์ประเภท 1 (Category 4) — rule_center_type1
 * 15,000=15% / 30,000=20% / 60,000=25% / 120,000+=30%
 */
export function calculateCenterType1(teamCOM: number): number {
  return tierPercentageOf('center_type1', teamCOM);
}

/**
 * ค่าจัดงานศูนย์ประเภท 2 (Category 5) — rule_center_type2: 0.8% ของเบี้ยต่ออายุ
 */
export function calculateCenterType2(renewalPremium: number): number {
  return percentageOf('center_type2', renewalPremium);
}

/**
 * ค่าจัดงานศูนย์ประเภท 3 (Category 6) — rule_center_type3 (tier_fixed)
 * 15,000=5,000 / 30,000=8,000 / 60,000=11,000 / 120,000+=15,000
 */
export function calculateCenterType3(teamCOM: number): number {
  return tierFixedAmount('center_type3', teamCOM);
}

/**
 * ค่าแยกศูนย์ (Category 7) — rule_center_separation (per_center_tiered)
 * ฐาน 4,000/ศูนย์ + ขั้น COM 15,000=1,500 / 30,000=2,000 / 60,000=2,500 / 120,000+=3,000 ต่อศูนย์
 */
export function calculateCenterSeparation(separatedCentersCount: number, teamCOM: number): number {
  return perCenterTieredAmount('center_separation', separatedCentersCount, teamCOM);
}

/**
 * โบนัสศูนย์รายปี (Category 8) — rule_center_bonus: 150,000=4% / 300,000=5% / 600,000+=6% ของ COM ทั้งปี
 */
export function calculateCenterBonus(annualCOM: number): number {
  return tierPercentageOf('center_bonus', annualCOM);
}

/**
 * ค่าจัดงานภาคประเภท 1 (Category 9) — rule_region_type1
 * 60,000=10% / 120,000=12% / 180,000=14% / 240,000=16% / 300,000+=18%
 */
export function calculateRegionType1(teamFYC: number): number {
  return tierPercentageOf('region_type1', teamFYC);
}

/**
 * ค่าจัดงานภาคประเภท 2 (Category 10) — rule_region_type2 (tier_fixed ต่อศูนย์)
 * 15,000=1,000 / 30,000=1,500 / 60,000=2,000 / 120,000+=2,500 ต่อศูนย์
 */
export function calculateRegionType2(separatedCentersCount: number, teamFYC: number): number {
  if (separatedCentersCount <= 0) return 0;
  return roundBaht(tierFixedAmount('region_type2', teamFYC) * separatedCentersCount);
}

/**
 * ค่าแยกภาค (Category 11) — rule_region_separation: 4,000 บาท/ภาค
 * (เกณฑ์ระบุ 3 แบบ; ที่ใช้คือแบบจ่ายตามจำนวนภาค 4,000 บาท — แบบ "8,000 ครั้งเดียว" และ "40% ของ T1" ยังไม่เปิดให้เลือก)
 */
export function calculateRegionSeparation(separatedRegionsCount: number): number {
  return perUnitAmount('region_separation', separatedRegionsCount);
}

/**
 * ค่าบริหารเป้าหมาย (Category 12) — rule_target_management (tier_fixed บน FYC ต่อปี)
 * 1.5M=10,000 / 2M=15,000 / 3M=20,000 / 4M=25,000 / 5M+=30,000 ต่อเดือน
 */
export function calculateTargetManagement(annualFYC: number): number {
  return tierFixedAmount('target_management', annualFYC);
}

/**
 * โบนัสภาครายปี (Category 13) — rule_region_bonus: 500k=1.5% / 1M=2.0% / 2M+=2.5% ของ FYC ทั้งปี
 */
export function calculateRegionBonus(annualFYC: number): number {
  return tierPercentageOf('region_bonus', annualFYC);
}

/**
 * โบนัสรายปีสะสม (เดิม engine มีสูตรของตัวเองแต่ **ไม่มีเกณฑ์ประกาศในระบบ**)
 * — ปรับเป็น 0 และแจ้งในหมายเหตุ แทนการจ่ายด้วยเลขที่ไม่มีที่มา
 */
export function calculateAnnualBonus(_annualFYC: number): number {
  return 0;
}

/** โบนัสพิเศษ (แคมเปญ) — ยังไม่มีแคมเปญในระบบ จึงคงเป็น 0 */
export function calculateSpecialBonus(_metrics: Omit<MemberMetrics, 'memberId' | 'positionId'>): number {
  return 0;
}

/**
 * Main calculation function - aggregates all income categories
 */
export function calculateTotalIncome(input: CalculationInput): IncomeResult {
  const { memberId, positionId, period, planVersion, ...metrics } = input;
  
  // Explicitly type metrics as the input without memberId/positionId/period/planVersion
  const calcMetrics = metrics as Omit<MemberMetrics, 'memberId' | 'positionId'>;
  
  const teamCOM = calcMetrics.teamCOM || 0;
  const teamFYC = calcMetrics.teamFYC || 0;
  const annualCOM = calcMetrics.annualCOM || (teamCOM * 12);
  const annualFYC = calcMetrics.annualFYC || (teamFYC * 12);

  // ── เพดานสิทธิ์ตามตำแหน่ง (แก้ปัญหาที่เดิมจ่ายครบทั้ง 13 หมวดให้ทุกคน) ──
  // ระดับตำแหน่งตาม DEFAULT_POSITIONS: agent=1, unit_manager=2, center_manager=3, region_manager=4
  const posLevel = DEFAULT_POSITIONS.find(p => p.id === positionId)?.level ?? 1;
  const canUnit = posLevel >= 2;     // ค่าจัดงานหน่วย/ค่าแยกหน่วย — หัวหน้าหน่วยขึ้นไป
  const canCenter = posLevel >= 3;   // ค่าจัดงานศูนย์ทั้งหมด — ผู้จัดการศูนย์ขึ้นไป
  const canRegion = posLevel >= 4;   // ค่าจัดงานภาคทั้งหมด — ผู้จัดการภาคขึ้นไป

  const gated = (value: number, allowed: boolean) => (allowed ? value : 0);

  const breakdown: IncomeBreakdown = {
    personalCommission: calculatePersonalCommission(calcMetrics),
    unitCommission: gated(calculateUnitCommission(teamCOM), canUnit),
    unitSeparation: gated(calculateUnitSeparation(calcMetrics.separatedUnitsCount || 0), canUnit),
    centerType1: gated(calculateCenterType1(teamCOM), canCenter),
    centerType2: gated(calculateCenterType2(calcMetrics.renewalPremium || 0), canCenter),
    centerType3: gated(calculateCenterType3(teamCOM), canCenter),
    centerSeparation: gated(calculateCenterSeparation(calcMetrics.separatedCentersCount || 0, teamCOM), canCenter),
    centerBonus: gated(calculateCenterBonus(annualCOM), canCenter),
    regionType1: gated(calculateRegionType1(teamFYC), canRegion),
    regionType2: gated(calculateRegionType2(calcMetrics.separatedRegionsCount || 0, teamFYC), canRegion),
    regionSeparation: gated(calculateRegionSeparation(calcMetrics.separatedRegionsCount || 0), canRegion),
    targetManagement: gated(calculateTargetManagement(annualFYC), canRegion),
    regionBonus: gated(calculateRegionBonus(annualFYC), canRegion),
    annualBonus: calculateAnnualBonus(annualFYC),
    specialBonus: calculateSpecialBonus(calcMetrics),
  };
  
  const totalIncome = Object.values(breakdown).reduce((sum: number, val: number) => sum + val, 0);
  
  const summary: IncomeSummary = {
    personalCommission: breakdown.personalCommission,
    unitIncomes: breakdown.unitCommission + breakdown.unitSeparation,
    centerIncomes: breakdown.centerType1 + breakdown.centerType2 + breakdown.centerType3 + breakdown.centerSeparation + breakdown.centerBonus,
  regionIncomes: breakdown.regionType1 + breakdown.regionType2 + breakdown.regionSeparation + breakdown.targetManagement + breakdown.regionBonus,
    bonusIncomes: breakdown.annualBonus + breakdown.specialBonus,
  };
  
  return {
    memberId,
    positionId,
    totalIncome,
    breakdown,
    summary,
    metricsUsed: calcMetrics as MemberMetrics
  };
}

/**
 * Calculate career progress for position qualification
 */
export function calculateCareerProgress(
  currentPositionId: PositionId,
  metrics: MemberMetrics
): { qualified: boolean; progressPercent: number; nextPosition: PositionId | null; gaps: string[] } {
  // บันไดตำแหน่งมาจาก DEFAULT_POSITIONS (แหล่งเดียว) เรียงตาม level — รองรับตำแหน่งอาวุโส/ผู้อำนวยการฝ่ายด้วย
  // เดิมลิสต์เองในฟังก์ชัน + switch มีแค่ 3 case ทำให้ตำแหน่งอาวุโส (level 2.5/3.5/5) ค้าง 0% ตลอด
  const positionOrder: PositionId[] = DEFAULT_POSITIONS
    .slice()
    .sort((a, b) => a.level - b.level)
    .map((p) => p.id as PositionId);

  const currentIndex = positionOrder.indexOf(currentPositionId);
  if (currentIndex === -1 || currentIndex >= positionOrder.length - 1) {
    return { qualified: false, progressPercent: 100, nextPosition: null, gaps: [] };
  }

  const nextPosition = positionOrder[currentIndex + 1];
  const def = DEFAULT_POSITIONS.find((p) => p.id === nextPosition);
  const qual: any = def?.qualification || {};
  const gaps: string[] = [];

  // เกณฑ์จากไฟล์ประกาศ: minFyc (บำเหน็จสะสมส่วนตัว) + requiredSeparations (จำนวนหน่วย/ศูนย์ที่แยก)
  // ตำแหน่งผู้จัดการภาคขึ้นไปใช้ FYC ของทั้งทีมตามที่เกณฑ์ระบุ
  const useTeamFyc = Number(def?.level || 0) >= 4;
  const fycValue = useTeamFyc ? Number(metrics.teamFYC || 0) : Number(metrics.personalFYC || 0);
  const minFyc = Number(qual.minFyc || 0);
  const sep = qual.requiredSeparations as { positionId: string; count: number } | undefined;
  const sepCount = sep
    ? sep.positionId === 'unit_manager'
      ? Number(metrics.separatedUnitsCount || 0)
      : sep.positionId === 'center_manager'
        ? Number(metrics.separatedCentersCount || 0)
        : Number(metrics.separatedRegionsCount || 0)
    : 0;

  let progress = 0;
  if (minFyc > 0 && sep?.count) {
    const fycProgress = Math.min(100, Math.round((fycValue / minFyc) * 50));
    const sepProgress = Math.min(50, Math.round((sepCount / sep.count) * 50));
    progress = fycProgress + sepProgress;
  } else if (minFyc > 0) {
    progress = Math.min(100, Math.round((fycValue / minFyc) * 100));
  } else if (sep?.count) {
    progress = Math.min(100, Math.round((sepCount / sep.count) * 100));
  }
  if (minFyc > 0 && fycValue < minFyc) {
    gaps.push(`${useTeamFyc ? 'Team FYC' : 'FYC'}: ${fycValue.toLocaleString()} / ${minFyc.toLocaleString()}`);
  }
  if (sep?.count && sepCount < sep.count) {
    const label = sep.positionId === 'unit_manager' ? 'Separated Units' : sep.positionId === 'center_manager' ? 'Separated Centers' : 'Separated Regions';
    gaps.push(`${label}: ${sepCount} / ${sep.count}`);
  }
  
  return {
    qualified: progress >= 100,
    progressPercent: Math.min(100, progress),
    nextPosition,
    gaps
  };
}

/**
 * Calculate downline metrics recursively
 */
export function calculateDownlineMetrics(memberId: string, allMembers: (MemberMetrics & { parentMemberId?: string })[]): MemberMetrics {
  const member = allMembers.find(m => m.memberId === memberId);
  if (!member) return {
    memberId,
    positionId: 'agent',
    personalFYC: 0,
    teamFYC: 0,
    personalCOM: 0,
    teamCOM: 0,
    firstYearPremium: 0,
    renewalPremium: 0,
    directMembersCount: 0,
    activeMembersCount: 0,
    separatedUnitsCount: 0,
    separatedCentersCount: 0,
    separatedRegionsCount: 0,
    annualFYC: 0,
    annualCOM: 0,
    status: 'active',
  };
  
  const downline = allMembers.filter(m => m.parentMemberId === memberId);
  const activeDownline = downline.filter(m => m.status === 'active');
  
  return {
    ...member,
    teamFYC: activeDownline.reduce((sum, m) => sum + (m.personalFYC || 0), 0),
    teamCOM: activeDownline.reduce((sum, m) => sum + (m.personalCOM || 0), 0),
    directMembersCount: downline.length,
    activeMembersCount: activeDownline.length,
    separatedUnitsCount: activeDownline.filter(m => m.positionId === 'unit_manager' || m.positionId === 'senior_unit_manager').length,
    separatedCentersCount: activeDownline.filter(m => m.positionId === 'center_manager' || m.positionId === 'senior_center_manager').length,
    separatedRegionsCount: activeDownline.filter(m => m.positionId === 'region_manager' || m.positionId === 'executive_region').length,
    annualFYC: activeDownline.reduce((sum, m) => sum + (m.personalFYC || 0), 0) * 12,
    annualCOM: activeDownline.reduce((sum, m) => sum + (m.personalCOM || 0), 0) * 12,
  };
}