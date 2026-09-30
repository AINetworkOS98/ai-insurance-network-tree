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
 * Calculate personal commission (Category 1)
 * 25% of personal COM
 */
export function calculatePersonalCommission(metrics: Omit<MemberMetrics, 'memberId' | 'positionId'>): number {
  return Math.round(metrics.personalCOM * 0.25);
}

/**
 * Calculate unit management income (Category 2)
 * Tiered based on team COM:
 * - Team COM < 5,000: 0%
 * - 5,000 - 10,000: 25%
 * - 10,000 - 20,000: 30%
 * - 20,000 - 35,000: 35%
 * - >= 35,000: 40%
 */
export function calculateUnitCommission(teamCOM: number): number {
  if (teamCOM < 5000) return 0;
  if (teamCOM < 10000) return Math.round(teamCOM * 0.25);
  if (teamCOM < 20000) return Math.round(teamCOM * 0.30);
  if (teamCOM < 35000) return Math.round(teamCOM * 0.35);
  return Math.round(teamCOM * 0.40);
}

/**
 * Calculate unit separation income (Category 3)
 * 2,000 THB per separated unit
 */
export function calculateUnitSeparation(separatedUnitsCount: number): number {
  return separatedUnitsCount * 2000;
}

/**
 * Calculate center type 1 income (Category 4)
 * Tiered based on team COM — ขั้นตามเกณฑ์ที่ประกาศ (compensationRules rule_center_type1):
 * 15,000=15% / 30,000=20% / 60,000=25% / 120,000=30%  (เดิมโค้ดตัดขั้นที่ 50,000/100,000 = จ่ายเกินเกณฑ์)
 */
export function calculateCenterType1(teamCOM: number): number {
  if (teamCOM < 15000) return 0;
  if (teamCOM < 30000) return Math.round(teamCOM * 0.15);
  if (teamCOM < 60000) return Math.round(teamCOM * 0.20);
  if (teamCOM < 120000) return Math.round(teamCOM * 0.25);
  return Math.round(teamCOM * 0.30);
}

/**
 * Calculate center type 2 income (Category 5)
 * 0.8% of renewal premium
 */
export function calculateCenterType2(renewalPremium: number): number {
  return Math.round(renewalPremium * 0.008);
}

/**
 * Calculate center type 3 income (Category 6)
 * ตารางคงที่ตามทีม COM — ตามเกณฑ์ที่ประกาศ (rule_center_type3):
 * 15,000=5,000 / 30,000=8,000 / 60,000=11,000 / 120,000=15,000
 * (เดิม 30,000=7,500, 50,000=12,000, 100,000=15,000 → ผิดทั้งจำนวนและจุดตัดขั้น)
 */
export function calculateCenterType3(teamCOM: number): number {
  if (teamCOM < 15000) return 0;
  if (teamCOM < 30000) return 5000;
  if (teamCOM < 60000) return 8000;
  if (teamCOM < 120000) return 11000;
  return 15000;
}

/**
 * Calculate center separation income (Category 7)
 * 4,000 THB per separated center + COM bonus tiers
 */
export function calculateCenterSeparation(separatedCentersCount: number, teamCOM: number): number {
  const base = separatedCentersCount * 4000;
  let comBonus = 0;
  // ขั้น COM ตามเกณฑ์ที่ประกาศ (rule_center_separation): 15,000=1,500 / 30,000=2,000 / 60,000=2,500 / 120,000=3,000
  if (teamCOM >= 15000 && teamCOM < 30000) comBonus = separatedCentersCount * 1500;
  else if (teamCOM >= 30000 && teamCOM < 60000) comBonus = separatedCentersCount * 2000;
  else if (teamCOM >= 60000 && teamCOM < 120000) comBonus = separatedCentersCount * 2500;
  else if (teamCOM >= 120000) comBonus = separatedCentersCount * 3000;
  return base + comBonus;
}

/**
 * Calculate center bonus income (Category 8)
 * Annual: 4-6% of annual COM if >= 150,000
 * ขั้นตามเกณฑ์ที่ประกาศ (rule_center_bonus): 150,000=4% / 300,000=5% / 600,000=6%
 * (เดิมขึ้น 6% ที่ 500,000 → จ่ายเกิน 1% ในช่วง 500,000–599,999)
 */
export function calculateCenterBonus(annualCOM: number): number {
  if (annualCOM < 150000) return 0;
  if (annualCOM < 300000) return Math.round(annualCOM * 0.04);
  if (annualCOM < 600000) return Math.round(annualCOM * 0.05);
  return Math.round(annualCOM * 0.06);
}

/**
 * Calculate region type 1 income (Category 9)
 * Tiered based on team FYC — ขั้นตามเกณฑ์ที่ประกาศ (rule_region_type1):
 * 60,000=10% / 120,000=12% / 180,000=14% / 240,000=16% / 300,000=18%
 * (เดิมใช้ 120,000=13%, 200,000=15% → ขั้น 180k/240k หายไป และจ่ายไม่ตรงช่วง)
 */
export function calculateRegionType1(teamFYC: number): number {
  if (teamFYC < 60000) return 0;
  if (teamFYC < 120000) return Math.round(teamFYC * 0.10);
  if (teamFYC < 180000) return Math.round(teamFYC * 0.12);
  if (teamFYC < 240000) return Math.round(teamFYC * 0.14);
  if (teamFYC < 300000) return Math.round(teamFYC * 0.16);
  return Math.round(teamFYC * 0.18);
}

/**
 * Calculate region type 2 income (Category 10)
 * เกณฑ์ที่ประกาศ (rule_region_type2): basis team_fyc, จ่ายต่อศูนย์
 * 15,000=1,000 / 30,000=1,500 / 60,000=2,000 / 120,000=2,500 ต่อศูนย์
 * (เดิมใช้ per-center FYC 60k/120k/200k/300k → 5,000/8,000/12,000/15,000 ซึ่งไม่ตรงเกณฑ์และฐานผิด)
 */
export function calculateRegionType2(separatedCentersCount: number, teamFYC: number): number {
  if (separatedCentersCount <= 0) return 0;
  if (teamFYC < 15000) return 0;
  if (teamFYC < 30000) return separatedCentersCount * 1000;
  if (teamFYC < 60000) return separatedCentersCount * 1500;
  if (teamFYC < 120000) return separatedCentersCount * 2000;
  return separatedCentersCount * 2500;
}

/**
 * Calculate region bonus (Category 11)
 * เกณฑ์ที่ประกาศ (rule_region_bonus): frequency annual, basis annual_fyc
 * 500,000=1.5% / 1,000,000=2.0% / 2,000,000=2.5%
 * (เดิมใช้ teamFYC รายเดือนกับขั้น 60k/120k/200k → ฐานและเกณฑ์ผิดทั้งชุด)
 */
export function calculateRegionBonus(annualFYC: number): number {
  if (annualFYC < 500000) return 0;
  if (annualFYC < 1000000) return Math.round(annualFYC * 0.015);
  if (annualFYC < 2000000) return Math.round(annualFYC * 0.02);
  return Math.round(annualFYC * 0.025);
}

/**
 * Calculate annual bonus (Category 12)
 * Based on annual FYC
 */
export function calculateAnnualBonus(annualFYC: number): number {
  if (annualFYC < 2000000) return 0;
  if (annualFYC < 5000000) return Math.round(annualFYC * 0.01);
  if (annualFYC < 10000000) return Math.round(annualFYC * 0.015);
  return Math.round(annualFYC * 0.02);
}

/**
 * Calculate special bonus (Category 13)
 * Placeholder for special campaigns
 */
export function calculateSpecialBonus(metrics: Omit<MemberMetrics, 'memberId' | 'positionId'>): number {
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
    regionBonus: gated(calculateRegionBonus(annualFYC), canRegion),
    annualBonus: calculateAnnualBonus(annualFYC),
    specialBonus: calculateSpecialBonus(calcMetrics),
  };
  
  const totalIncome = Object.values(breakdown).reduce((sum: number, val: number) => sum + val, 0);
  
  const summary: IncomeSummary = {
    personalCommission: breakdown.personalCommission,
    unitIncomes: breakdown.unitCommission + breakdown.unitSeparation,
    centerIncomes: breakdown.centerType1 + breakdown.centerType2 + breakdown.centerType3 + breakdown.centerSeparation + breakdown.centerBonus,
    regionIncomes: breakdown.regionType1 + breakdown.regionType2 + breakdown.regionBonus,
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
  const positionOrder: PositionId[] = [
    'agent',
    'unit_manager',
    'center_manager',
    'region_manager',
    'senior_unit_manager',
    'senior_center_manager',
    'executive_region',
    'national_leader'
  ];
  
  const currentIndex = positionOrder.indexOf(currentPositionId);
  if (currentIndex === -1 || currentIndex >= positionOrder.length - 1) {
    return { qualified: false, progressPercent: 100, nextPosition: null, gaps: [] };
  }
  
  const nextPosition = positionOrder[currentIndex + 1];
  const gaps: string[] = [];
  let progress = 0;
  
  switch (nextPosition) {
    case 'unit_manager':
      if (metrics.personalFYC >= 20000) progress = 100;
      else progress = Math.round((metrics.personalFYC / 20000) * 100);
      if (metrics.personalFYC < 20000) gaps.push(`FYC: ${metrics.personalFYC.toLocaleString()} / 20,000`);
      break;
    case 'center_manager':
      if (metrics.personalFYC >= 75000 && (metrics.separatedUnitsCount || 0) >= 2) progress = 100;
      else {
        const fycProgress = Math.min(100, Math.round((metrics.personalFYC / 75000) * 50));
        const unitsProgress = Math.min(50, Math.round(((metrics.separatedUnitsCount || 0) / 2) * 50));
        progress = fycProgress + unitsProgress;
      }
      if (metrics.personalFYC < 75000) gaps.push(`FYC: ${metrics.personalFYC.toLocaleString()} / 75,000`);
      if ((metrics.separatedUnitsCount || 0) < 2) gaps.push(`Separated Units: ${metrics.separatedUnitsCount || 0} / 2`);
      break;
    case 'region_manager':
      if (metrics.teamFYC >= 1200000 && (metrics.separatedCentersCount || 0) >= 4) progress = 100;
      else {
        const fycProgress = Math.min(100, Math.round((metrics.teamFYC / 1200000) * 50));
        const centersProgress = Math.min(50, Math.round(((metrics.separatedCentersCount || 0) / 4) * 50));
        progress = fycProgress + centersProgress;
      }
      if (metrics.teamFYC < 1200000) gaps.push(`Team FYC: ${metrics.teamFYC.toLocaleString()} / 1,200,000`);
      if ((metrics.separatedCentersCount || 0) < 4) gaps.push(`Separated Centers: ${metrics.separatedCentersCount || 0} / 4`);
      break;
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