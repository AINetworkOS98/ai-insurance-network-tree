/**
 * เวลาไทย (Asia/Bangkok) + พุทธศักราช — ใช้ร่วมกับ Timeline ปี
 *
 * หลักการ:
 * - ไทยไม่มี DST ตั้งแต่ พ.ศ. 2484 → ใช้ offset คงที่ UTC+7 ได้ปลอดภัย ไม่ต้องพึ่ง ICU
 * - ทุกฟังก์ชันคำนวณจากเวลาจริง ณ ขณะเรียก (ไม่ hard-code ปีใด ๆ)
 * - UI แสดง พ.ศ. / ภายในเก็บ ค.ศ. (Gregorian) เพื่อคำนวณ
 */

export const BKK_OFFSET_MS = 7 * 60 * 60 * 1000; // UTC+7 คงที่
export const MS_DAY = 86_400_000;
export const BKK_TIMEZONE = 'Asia/Bangkok';

export const THAI_MONTHS = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
] as const;

export const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.',
] as const;

export const THAI_WEEKDAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'] as const;
export const THAI_WEEKDAYS_SHORT = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'] as const;

export type BangkokParts = {
  year: number;   // ค.ศ.
  month: number;  // 1-12
  day: number;    // 1-31
  hour: number;   // 0-23
  minute: number;
  second: number;
  weekday: number; // 0 = อาทิตย์
};

export type YearStatus = 'past' | 'current' | 'future';

export type YearStats = {
  year: number;         // ค.ศ.
  thaiYear: number;     // พ.ศ.
  status: YearStatus;
  leap: boolean;
  totalMs: number;
  totalDays: number;
  startMs: number;
  endMs: number;
  elapsedMs: number;
  remainingMs: number;
  elapsedDays: number;   // วันที่ผ่านไปแล้วแบบเต็มวัน
  remainingDays: number; // วันที่เหลือแบบปัดขึ้น
  percentElapsed: number;   // 0-100
  percentRemaining: number; // 0-100
};

export type DurationParts = { days: number; hours: number; minutes: number; seconds: number };

/** แปลง Date → ชิ้นส่วนเวลาไทย (UTC+7) */
export function bangkokParts(at: Date = new Date()): BangkokParts {
  const bkk = new Date(at.getTime() + BKK_OFFSET_MS);
  return {
    year: bkk.getUTCFullYear(),
    month: bkk.getUTCMonth() + 1,
    day: bkk.getUTCDate(),
    hour: bkk.getUTCHours(),
    minute: bkk.getUTCMinutes(),
    second: bkk.getUTCSeconds(),
    weekday: bkk.getUTCDay(),
  };
}

export function toThaiYear(year: number): number {
  return year + 543;
}

export function fromThaiYear(thaiYear: number): number {
  return thaiYear - 543;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

/** month = 1-12 */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 1 ม.ค. 00:00 เวลาไทย (ms) */
export function yearStartMs(year: number): number {
  return Date.UTC(year, 0, 1) - BKK_OFFSET_MS;
}

/** 1 ม.ค. ของปีถัดไป 00:00 เวลาไทย = สิ้นปี (ms) */
export function yearEndMs(year: number): number {
  return Date.UTC(year + 1, 0, 1) - BKK_OFFSET_MS;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

export function yearStats(year: number, at: Date = new Date()): YearStats {
  const now = at.getTime();
  const startMs = yearStartMs(year);
  const endMs = yearEndMs(year);
  const totalMs = endMs - startMs;
  const rawElapsed = now - startMs;

  const elapsedMs = clamp(rawElapsed, 0, totalMs);
  const remainingMs = clamp(totalMs - rawElapsed, 0, totalMs);
  const currentYear = bangkokParts(at).year;

  return {
    year,
    thaiYear: toThaiYear(year),
    status: year < currentYear ? 'past' : year > currentYear ? 'future' : 'current',
    leap: isLeapYear(year),
    totalMs,
    totalDays: daysInYear(year),
    startMs,
    endMs,
    elapsedMs,
    remainingMs,
    elapsedDays: Math.floor(elapsedMs / MS_DAY),
    remainingDays: Math.ceil(remainingMs / MS_DAY),
    percentElapsed: (elapsedMs / totalMs) * 100,
    percentRemaining: (remainingMs / totalMs) * 100,
  };
}

/** แยก ms → วัน/ชั่วโมง/นาที/วินาที (ปัดลง 모두) */
export function splitDuration(ms: number): DurationParts {
  const safe = Math.max(0, ms);
  const totalSeconds = Math.floor(safe / 1000);
  return {
    days: Math.floor(totalSeconds / 86400),
    hours: Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
  };
}

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** "29 กันยายน 2569" */
export function thaiDateLabel(parts: BangkokParts): string {
  return `${parts.day} ${THAI_MONTHS[parts.month - 1]} ${toThaiYear(parts.year)}`;
}

/** "อังคาร 29 กันยายน 2569" */
export function thaiDateFullLabel(parts: BangkokParts): string {
  return `${THAI_WEEKDAYS[parts.weekday]} ${thaiDateLabel(parts)}`;
}

/** "29/09/2569 14:07:31" */
export function thaiClockLabel(parts: BangkokParts): string {
  return `${pad2(parts.day)}/${pad2(parts.month)}/${toThaiYear(parts.year)} ${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}`;
}

export function formatPercent(value: number, digits = 1): string {
  return `${value.toFixed(digits)}%`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/** รายการปี (ค.ศ.) รอบปีปัจจุบัน — อดีต/ปัจจุบัน/อนาคต */
export function yearWindow(at: Date = new Date(), pastCount = 3, futureCount = 3): number[] {
  const current = bangkokParts(at).year;
  const years: number[] = [];
  for (let y = current + futureCount; y >= current - pastCount; y -= 1) years.push(y);
  return years;
}
