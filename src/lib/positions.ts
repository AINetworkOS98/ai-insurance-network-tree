// positions.ts — อ้างอิง rankCatalog เป็นแหล่งจริง (สเปคหมวด 2+6)
// ห้ามเดาตัวเลข — ค่าในนี้เป็นข้อมูลอ้างอิง Draft เท่านั้น ห้ามเปิดใช้คำนวณจริงจนมีแผน Active
import { RANK_CATALOG, rankName } from './rankCatalog';

export type PositionCode = 'general' | 'agent' | 'unit_manager' | 'center_manager' | 'regional_manager';

export interface PositionInfo { code: PositionCode; nameTh: string; level: number; nameRef: string; }

// ส่งออก POSITIONS ให้โค้ดเดิมใช้ต่อได้ — แต่ตอนนี้ 5 ขั้นตามสเปค (รวม general)
export const POSITIONS: PositionInfo[] = RANK_CATALOG.map(r => ({
  code: r.code as PositionCode, nameTh: r.nameTh, level: r.level, nameRef: r.nameRef
}));

interface Qualification {
  target: PositionCode; targetNameTh: string;
  reqFyc: number; reqUnits: number; reqCenters: number; period: string;
  note: string; // ระบุว่าเป็น Draft อ้างอิง
}

export function nextQualification(current: PositionCode): Qualification | null {
  switch (current) {
    case 'general':
      return { target: 'agent', targetNameTh: rankName('agent'), reqFyc: 0, reqUnits: 0, reqCenters: 0, period: 'ต้องตรวจสถานะคุณสมบัติจริงก่อนอนุมัติ', note: 'Draft: ต้องผ่านการตรวจข้อมูล/รหัสตัวแทน/ใบอนุญาต' };
    case 'agent':
      return { target: 'unit_manager', targetNameTh: rankName('unit_manager'), reqFyc: 20000, reqUnits: 0, reqCenters: 0, period: '1–6 เดือน', note: 'Draft อ้างอิง 15 Jan 64 — รอยืนยันความหมายช่วงสะสมและฐานผลงาน' };
    case 'unit_manager':
      return { target: 'center_manager', targetNameTh: rankName('center_manager'), reqFyc: 75000, reqUnits: 2, reqCenters: 0, period: '3–6 เดือน แยก 2 หน่วย', note: 'Draft: รอยืนยันนิยามหน่วยที่ผ่านคุณสมบัติ' };
    case 'center_manager':
      return { target: 'regional_manager', targetNameTh: rankName('regional_manager'), reqFyc: 1200000, reqUnits: 0, reqCenters: 4, period: '12–24 เดือน แยก 4 ศูนย์', note: 'Draft: รอยืนยันนิยามศูนย์ที่ผ่านคุณสมบัติ' };
    default: return null;
  }
}

export function positionName(code: PositionCode | string): string {
  return POSITIONS.find(p => p.code === code)?.nameTh || rankName(code) || code;
}

export interface PositionCheckResult {
  current: PositionCode; currentNameTh: string;
  qualified: boolean; target?: Qualification;
  fycProgressPct: number; unitsProgressPct: number; centersProgressPct: number;
  gapFyc: number; gapUnits: number; gapCenters: number;
  summary: string; isDraft: boolean;
}

export function checkPositionEligibility(current: PositionCode, accumulatedFyc: number, separatedUnits: number, separatedCenters: number): PositionCheckResult {
  const q = nextQualification(current);
  if (!q) return { current, currentNameTh: positionName(current), qualified: false, fycProgressPct: 100, unitsProgressPct: 100, centersProgressPct: 100, gapFyc: 0, gapUnits: 0, gapCenters: 0, summary: 'ดำรงตำแหน่งสูงสุดแล้ว', isDraft: true };
  const fycPct = q.reqFyc > 0 ? Math.min(100, (accumulatedFyc / q.reqFyc) * 100) : 100;
  const unitsPct = q.reqUnits > 0 ? Math.min(100, (separatedUnits / q.reqUnits) * 100) : 100;
  const centersPct = q.reqCenters > 0 ? Math.min(100, (separatedCenters / q.reqCenters) * 100) : 100;
  const gapFyc = Math.max(0, q.reqFyc - accumulatedFyc);
  const gapUnits = Math.max(0, q.reqUnits - separatedUnits);
  const gapCenters = Math.max(0, q.reqCenters - separatedCenters);
  const qualified = gapFyc === 0 && gapUnits === 0 && gapCenters === 0;
  return {
    current, currentNameTh: positionName(current), qualified, target: q,
    fycProgressPct: fycPct, unitsProgressPct: unitsPct, centersProgressPct: centersPct,
    gapFyc, gapUnits, gapCenters,
    summary: qualified ? `คุณสมบัติครบ (Draft) พร้อมรับการพิจารณาเป็น '${q.targetNameTh}' — ${q.note}` : `ยังขาด ${gapFyc>0?`FYC ฿${gapFyc.toLocaleString()}`:''}${gapUnits>0?` หน่วย ${gapUnits}`:''}${gapCenters>0?` ศูนย์ ${gapCenters}`:''} — ${q.note}`,
    isDraft: true,
  };
}
