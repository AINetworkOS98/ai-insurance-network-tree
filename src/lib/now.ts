// now.ts — แหล่งความจริงเดียวของ "เวลาปัจจุบัน" ที่แสดงบนหน้าเว็บ
// ⚠ เซิร์ฟเวอร์ Vercel รันเป็น UTC → ต้องแปลงเป็นเวลาไทย (UTC+7) ก่อนอ่านวัน/เดือน/ปีเสมอ
//    ไม่งั้นช่วง 00:00–07:00 น. ของไทย หน้าจะแสดงวันก่อนหน้า (ไม่เป็นปัจจุบัน)
export const TH_MONTHS_FULL = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม',
];
export const TH_MONTHS_SHORT = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
const TH_DAYS = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

/** เวลาปัจจุบันในเขตไทย (UTC+7) */
export function nowBkk(d: Date = new Date()): Date {
  return new Date(d.getTime() + 7 * 3600 * 1000);
}
export function pad2(n: number) { return String(n).padStart(2, '0'); }
/** ปีพุทธศักราชของเวลาปัจจุบัน */
export function beYear(d: Date = new Date()): number { return nowBkk(d).getUTCFullYear() + 543; }
/** 12 ตุลาคม 2569 */
export function thaiDateFull(d: Date = new Date()): string {
  const t = nowBkk(d);
  return `${t.getUTCDate()} ${TH_MONTHS_FULL[t.getUTCMonth()]} ${t.getUTCFullYear() + 543}`;
}
/** 12 ต.ค. 2569 */
export function thaiDateShort(d: Date = new Date()): string {
  const t = nowBkk(d);
  return `${t.getUTCDate()} ${TH_MONTHS_SHORT[t.getUTCMonth()]} ${t.getUTCFullYear() + 543}`;
}
/** 08:55 */
export function thaiTime(d: Date = new Date()): string {
  const t = nowBkk(d);
  return `${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}`;
}
/** 12 ตุลาคม 2569 เวลา 08:55 น. */
export function thaiDateTimeFull(d: Date = new Date()): string {
  return `${thaiDateFull(d)} เวลา ${thaiTime(d)} น.`;
}
/** 08:55:30 (มีวินาที — ใช้กับนาฬิกาที่เดินจริง) */
export function thaiTimeSec(d: Date = new Date()): string {
  const t = nowBkk(d);
  return `${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}:${pad2(t.getUTCSeconds())}`;
}
/** 12 ตุลาคม 2569 (วันจันทร์) เวลา 08:55:30 น. */
export function thaiDateTimeLong(d: Date = new Date()): string {
  return `${thaiDateFull(d)} (วัน${thaiDayName(d)}) เวลา ${thaiTimeSec(d)} น.`;
}
/** วันในสัปดาห์ เช่น จันทร์ */
export function thaiDayName(d: Date = new Date()): string { return TH_DAYS[nowBkk(d).getUTCDay()]; }
/** เดือนปัจจุบันแบบ YYYY-MM (ค.ศ.) สำหรับงวดผลงาน */
export function currentPeriodCe(d: Date = new Date()): string {
  const t = nowBkk(d);
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}`;
}
/** รายชื่อไตรมาสของปีพุทธศักราชที่ระบุ (ใช้แทนค่าที่เคยฝังตายตัว) */
export function quartersOfYear(be: number = beYear()) {
  return [
    { q: `ไตรมาส 1/${be}`, m: `ม.ค. – มี.ค. ${be}` },
    { q: `ไตรมาส 2/${be}`, m: `เม.ย. – มิ.ย. ${be}` },
    { q: `ไตรมาส 3/${be}`, m: `ก.ค. – ก.ย. ${be}` },
    { q: `ไตรมาส 4/${be}`, m: `ต.ค. – ธ.ค. ${be}` },
  ];
}
