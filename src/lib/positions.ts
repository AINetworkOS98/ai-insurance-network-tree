// เกณฑ์เลื่อนตำแหน่งจริง (อ้างอิง Thai Life compensation plan)
// ตัวแทน → ผู้บริหารหน่วย: FYC 20,000 (1-6 เดือน)
// ผู้บริหารหน่วย → ผู้บริหารศูนย์: FYC 75,000 + แยกหน่วย 2 หน่วย (3-6 เดือน)
// ผู้บริหารศูนย์ → ผู้บริหารภาค: FYC 1,200,000 + แยกศูนย์ 4 ศูนย์ (12-24 เดือน)

export type PositionCode =
  | 'agent'
  | 'unit_manager'
  | 'center_manager'
  | 'regional_manager'
  | 'executive_regional_director';

export interface PositionInfo {
  code: PositionCode;
  nameTh: string;
}

export const POSITIONS: PositionInfo[] = [
  { code: 'agent', nameTh: 'ตัวแทน' },
  { code: 'unit_manager', nameTh: 'ผู้บริหารหน่วย (UM)' },
  { code: 'center_manager', nameTh: 'ผู้บริหารศูนย์ (CM)' },
  { code: 'regional_manager', nameTh: 'ผู้บริหารภาค (RM)' },
  { code: 'executive_regional_director', nameTh: 'Executive Regional Director' },
];

interface Qualification {
  target: PositionCode;
  targetNameTh: string;
  reqFyc: number;
  reqUnits: number;
  reqCenters: number;
  period: string;
}

export function nextQualification(current: PositionCode): Qualification | null {
  switch (current) {
    case 'agent':
      return {
        target: 'unit_manager',
        targetNameTh: 'ผู้บริหารหน่วย (UM)',
        reqFyc: 20000,
        reqUnits: 0,
        reqCenters: 0,
        period: '1-6 เดือน',
      };
    case 'unit_manager':
      return {
        target: 'center_manager',
        targetNameTh: 'ผู้บริหารศูนย์ (CM)',
        reqFyc: 75000,
        reqUnits: 2,
        reqCenters: 0,
        period: '3-6 เดือน',
      };
    case 'center_manager':
      return {
        target: 'regional_manager',
        targetNameTh: 'ผู้บริหารภาค (RM)',
        reqFyc: 1200000,
        reqUnits: 0,
        reqCenters: 4,
        period: '12-24 เดือน',
      };
    default:
      return null; // สูงสุดแล้ว
  }
}

export function positionName(code: PositionCode): string {
  return POSITIONS.find((p) => p.code === code)?.nameTh || code;
}

export interface PositionCheckResult {
  current: PositionCode;
  currentNameTh: string;
  qualified: boolean;
  target?: Qualification;
  fycProgressPct: number;
  unitsProgressPct: number;
  centersProgressPct: number;
  gapFyc: number;
  gapUnits: number;
  gapCenters: number;
  summary: string;
}

export function checkPositionEligibility(
  current: PositionCode,
  accumulatedFyc: number,
  separatedUnits: number,
  separatedCenters: number
): PositionCheckResult {
  const q = nextQualification(current);

  if (!q) {
    return {
      current,
      currentNameTh: positionName(current),
      qualified: false,
      fycProgressPct: 100,
      unitsProgressPct: 100,
      centersProgressPct: 100,
      gapFyc: 0,
      gapUnits: 0,
      gapCenters: 0,
      summary: 'ดำรงตำแหน่งสูงสุดแล้ว',
    };
  }

  const fycPct = Math.min(100, (accumulatedFyc / q.reqFyc) * 100);
  const unitsPct = q.reqUnits > 0 ? Math.min(100, (separatedUnits / q.reqUnits) * 100) : 100;
  const centersPct = q.reqCenters > 0 ? Math.min(100, (separatedCenters / q.reqCenters) * 100) : 100;

  const gapFyc = Math.max(0, q.reqFyc - accumulatedFyc);
  const gapUnits = Math.max(0, q.reqUnits - separatedUnits);
  const gapCenters = Math.max(0, q.reqCenters - separatedCenters);

  const qualified = gapFyc === 0 && gapUnits === 0 && gapCenters === 0;

  const summary = qualified
    ? `คุณสมบัติครบถ้วนพร้อมรับการแต่งตั้งเป็น '${q.targetNameTh}'`
    : `ยังขาด ${gapFyc > 0 ? `FYC ฿${gapFyc.toLocaleString()}` : ''}${gapUnits > 0 ? `, หน่วย ${gapUnits}` : ''}${gapCenters > 0 ? `, ศูนย์ ${gapCenters}` : ''}`;

  return {
    current,
    currentNameTh: positionName(current),
    qualified,
    target: q,
    fycProgressPct: fycPct,
    unitsProgressPct: unitsPct,
    centersProgressPct: centersPct,
    gapFyc,
    gapUnits,
    gapCenters,
    summary,
  };
}
