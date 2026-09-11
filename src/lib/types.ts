export type PositionId = 
  | 'agent'
  | 'unit_manager'
  | 'center_manager'
  | 'region_manager'
  | 'senior_unit_manager'
  | 'senior_center_manager'
  | 'executive_region'
  | 'national_leader'
  | string;

export interface Position {
  id: PositionId;
  name: string;
  nameEn: string;
  level: number;
  color: string;
  badgeBg: string;
  badgeBorder: string;
  isCustom?: boolean;
  qualification: {
    minFyc: number;
    periodMonths: number;
    requiredSeparations?: {
      positionId: PositionId;
      count: number;
    };
    description: string;
  };
}

export type CalculationType = 'ACTUAL' | 'PROJECTED' | 'SIMULATION';

export type UserRole = 
  | 'super_admin'
  | 'admin'
  | 'regional_manager'
  | 'center_manager'
  | 'unit_manager'
  | 'agent'
  | 'viewer';

export interface LocationInfo {
  province: string;
  region: 'Bangkok & Metro' | 'Central' | 'North' | 'Northeast' | 'East' | 'South';
  lat: number;
  lng: number;
}

export interface Member {
  id: string;
  memberCode: string;
  name: string;
  nickname?: string;
  avatarUrl: string;
  positionId: PositionId;
  role: UserRole;
  sponsorId: string | null;
  parentMemberId: string | null;
  unitId: string | null;
  centerId: string | null;
  regionId: string | null;
  joinDate: string;
  status: 'active' | 'inactive' | 'probation';
  phone?: string;
  email?: string;
  location: LocationInfo;
  personalFYC: number;
  personalCOM: number;
  firstYearPremium: number;
  renewalPremium: number;
  separatedUnitsCount?: number;
  separatedCentersCount?: number;
  separatedRegionsCount?: number;
  receiptVerified?: boolean;
  receiptCount?: number;
  firstReceiptVerifiedAt?: string;
  lastReceiptVerifiedAt?: string;
  kpiDeadlineAt?: string;
}

export interface MonthlyPerformanceRecord {
  month: string;
  memberId: string;
  personalFYC: number;
  teamFYC: number;
  personalCOM: number;
  teamCOM: number;
  firstYearPremium: number;
  renewalPremium: number;
  directMembersCount: number;
  activeMembersCount: number;
  calculatedIncome: number;
}

export interface IncomeBreakdownItem {
  id: string;
  incomeType: string;
  title: string;
  category: 'personal' | 'unit' | 'center' | 'region' | 'special';
  amount: number;
  basisName: string;
  basisValue: number;
  rateOrFormula: string;
  ruleVersion: string;
  effectiveDate: string;
  calculationDetails: string;
  isQualified: boolean;
  notes?: string;
}

export interface IncomeCalculationResult {
  memberId?: string;
  positionId: PositionId;
  period: string;
  calculationType: CalculationType;
  planVersionId: string;
  planVersionName: string;
  totalIncome: number;
  breakdown: IncomeBreakdownItem[];
  summary: {
    personalCommission: number;
    unitIncomes: number;
    centerIncomes: number;
    regionIncomes: number;
    bonusIncomes: number;
  };
  metricsUsed: {
    personalFYC: number;
    teamFYC: number;
    personalCOM: number;
    teamCOM: number;
    renewalPremium: number;
    firstYearPremium: number;
    directCount: number;
    activeCount: number;
    separatedUnits: number;
    separatedCenters: number;
    separatedRegions: number;
  };
}

export type RuleType = 
  | 'percentage'
  | 'fixed_amount'
  | 'tier_percentage'
  | 'tier_fixed'
  | 'per_unit_fixed'
  | 'per_center_tiered'
  | 'per_region_fixed'
  | 'annual_bonus_tier'
  | 'target_management_tier'
  | 'custom_formula';

export interface TierStep {
  min: number;
  max?: number;
  rate?: number;
  fixedAmount?: number;
}

export interface CompensationRule {
  id: string;
  planVersionId: string;
  incomeType: string;
  name: string;
  positionId: PositionId;
  ruleType: RuleType;
  basis: 'personal_com' | 'team_com' | 'personal_fyc' | 'team_fyc' | 'renewal_premium' | 'annual_fyc' | 'annual_com' | 'separated_units' | 'separated_centers' | 'separated_regions';
  frequency: 'monthly' | 'quarterly' | 'annual' | 'one_time';
  durationMonths?: number;
  tiers?: TierStep[];
  rate?: number;
  fixedAmount?: number;
  minimumQualification?: {
    minFyc?: number;
    minCom?: number;
    minUnits?: number;
    minCenters?: number;
  };
  effectiveDate: string;
  expirationDate?: string;
  status: 'active' | 'inactive' | 'requires_verification';
  description: string;
}

export interface CompensationPlanVersion {
  id: string;
  name: string;
  code: string;
  effectiveDate: string;
  expirationDate?: string;
  status: 'active' | 'draft' | 'archived';
  description: string;
  rules: CompensationRule[];
  createdAt: string;
  updatedAt: string;
  author: string;
}

export interface CareerProgress {
  currentPosition: Position;
  nextPosition: Position | null;
  currentFYC: number;
  requiredFYC: number;
  fycProgressPercent: number;
  currentUnits: number;
  requiredUnits: number;
  unitsProgressPercent: number;
  currentCenters: number;
  requiredCenters: number;
  centersProgressPercent: number;
  overallProgressPercent: number;
  timeRemainingMonths: number;
  isEligibleForPromotion: boolean;
  mathematicalProjection: {
    monthlyRunRateFYC: number;
    estimatedMonthsToPromotion: number;
    recommendationText: string;
    gapFYC: number;
    gapUnits: number;
    gapCenters: number;
  };
}

export interface DownlineMetrics {
  directCount: number;
  activeDirectCount: number;
  totalDownlineCount: number;
  activeDownlineCount: number;
  teamFYC: number;
  teamCOM: number;
  totalUnits: number;
  totalCenters: number;
  totalRegions: number;
  downlineMembers: Member[];
}

export interface MemberMetrics {
  memberId: string;
  positionId: PositionId;
  personalFYC: number;
  teamFYC: number;
  personalCOM: number;
  teamCOM: number;
  firstYearPremium: number;
  renewalPremium: number;
  directMembersCount: number;
  activeMembersCount: number;
  separatedUnitsCount: number;
  separatedCentersCount: number;
  separatedRegionsCount: number;
  annualFYC: number;
  annualCOM: number;
  status: 'active' | 'inactive' | 'probation';
}

export interface IncomeBreakdown {
  personalCommission: number;
  unitCommission: number;
  unitSeparation: number;
  centerType1: number;
  centerType2: number;
  centerType3: number;
  centerSeparation: number;
  centerBonus: number;
  regionType1: number;
  regionType2: number;
  regionBonus: number;
  annualBonus: number;
  specialBonus: number;
}

export interface IncomeSummary {
  personalCommission: number;
  unitIncomes: number;
  centerIncomes: number;
  regionIncomes: number;
  bonusIncomes: number;
}