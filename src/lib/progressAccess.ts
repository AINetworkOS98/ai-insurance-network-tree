// progressAccess.ts — กติกากั้นหน้า /progress (แหล่งความจริงเดียว)
// ต้อง import ได้ทั้ง server และ client → ห้าม import prisma ที่นี่
//
// เหตุผล: หน้า /progress มีโมเดลธุรกิจ/แผนสร้างทีม/ตัวเลขระดับบริหาร
// จึงเปิดให้เฉพาะ "หัวหน้าหน่วย (level 2)" ขึ้นไป — ตัวแทนและสมาชิกทั่วไปไม่เห็น

import { rankName, type RankLevel } from './rankCatalog';

/** ระดับตำแหน่งขั้นต่ำที่เห็นหน้า /progress — 2 = หัวหน้าหน่วย (ผู้บริหารหน่วย) */
export const MIN_PROGRESS_RANK = 2;

/**
 * ผ่าน = เป็น Admin (ผู้ดูแลระบบ) หรือ rank ตั้งแต่ MIN_PROGRESS_RANK ขึ้นไป
 * Admin ต้องผ่านเสมอ ไม่งั้นเจ้าของระบบล็อกตัวเองออกจากหน้าที่ตัวเองดูแล
 */
export function canViewProgress(rankLevel: number, isAdmin = false): boolean {
  if (isAdmin) return true;
  return Number.isFinite(rankLevel) && rankLevel >= MIN_PROGRESS_RANK;
}

/** ชื่อระดับจากตัวเลขใด ๆ (กันค่าเพี้ยนจาก DB/token) — คืนชื่อระดับที่ปลอดภัยเสมอ */
export function rankNameSafe(level: number): string {
  if (!Number.isFinite(level)) return 'ไม่ทราบระดับ';
  return rankName(Math.max(0, Math.min(4, Math.trunc(level))) as RankLevel);
}

/** ป้ายชื่อระดับที่ต้องการ — ใช้ในข้อความแจ้งผู้ใช้ */
export function minProgressRankName(): string {
  return rankName(MIN_PROGRESS_RANK);
}

/** ข้อความสาเหตุที่ยังเข้าไม่ได้ (ใช้ทั้งหน้าเว็บและ API ในอนาคต) */
export function progressDenyReason(rankLevel: number): string {
  return `หน้านี้เปิดให้ดูตั้งแต่ระดับ "${rankName(MIN_PROGRESS_RANK)}" ขึ้นไป — ระดับปัจจุบันของคุณคือ "${rankNameSafe(rankLevel)}"`;
}
