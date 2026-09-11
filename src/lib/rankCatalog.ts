// rankCatalog.ts — สเปคหมวด 2 : ตำแหน่งสายงาน 5 ขั้น (แยกจาก MemberStatus และ RBAC)
// แยก 3 เรื่อง: rank (สายงาน) / memberStatus (สถานะสมาชิก) / permissions (สิทธิผู้ดูแล)
// ห้ามให้เลื่อนตำแหน่งสร้าง Super Admin อัตโนมัติ

export type RankLevel = 0 | 1 | 2 | 3 | 4;

export interface RankDef {
  level: RankLevel;
  code: string;           // ใช้ใน DB / API
  nameTh: string;         // ชื่อแสดงผล (เจ้าของระบบแก้ได้)
  nameRef: string;        // ชื่อเทียบภาพอ้างอิง (ห้ามลบ)
  isCareerTop: boolean;   // level 4 = สูงสุดสายงาน
  description: string;
}

// ตารางสเปคหมวด 2 — ห้ามสร้างตำแหน่งย่อยเพิ่มแล้วอ้างว่าเป็นโครงสร้างทางการ
export const RANK_CATALOG: RankDef[] = [
  { level: 0, code: 'general',          nameTh: 'ผู้สนใจทั่วไป / สมาชิกทั่วไป', nameRef: 'ระดับเริ่มต้นที่เพิ่มใหม่', isCareerTop: false, description: 'เห็นเฉพาะหน้าแรก — สมัครตัวแทน/แก้ข้อมูลพื้นฐาน/ดูสถานะคำขอ/อ่านแจ้งเตือนตนเอง' },
  { level: 1, code: 'agent',            nameTh: 'ตัวแทน',                      nameRef: 'ตัวแทน',                isCareerTop: false, description: 'เข้าระบบงานและดูเส้นทางตำแหน่งถึงผู้จัดการภาค' },
  { level: 2, code: 'unit_manager',     nameTh: 'ผู้จัดการหน่วย',              nameRef: 'ผู้บริหารหน่วย',        isCareerTop: false, description: 'บริหารข้อมูลหน่วยที่ได้รับมอบหมาย' },
  { level: 3, code: 'center_manager',   nameTh: 'ผู้จัดการศูนย์',              nameRef: 'ผู้บริหารศูนย์',        isCareerTop: false, description: 'บริหารข้อมูลศูนย์ที่ได้รับมอบหมาย' },
  { level: 4, code: 'regional_manager', nameTh: 'ผู้จัดการภาค',                nameRef: 'ผู้บริหารภาค',          isCareerTop: true,  description: 'ระดับสูงสุดของสายงาน บริหารภาคที่ได้รับมอบหมาย' },
];

export function rankByLevel(level: RankLevel): RankDef | undefined { return RANK_CATALOG.find(r => r.level === level); }
export function rankByCode(code: string): RankDef | undefined { return RANK_CATALOG.find(r => r.code === code); }
export function rankName(level: RankLevel | string): string {
  const r = typeof level === 'number' ? rankByLevel(level as RankLevel) : rankByCode(level);
  return r?.nameTh ?? String(level);
}
export function isValidRankLevel(v: number): v is RankLevel { return v >= 0 && v <= 4; }

// สำหรับ seed / validation — ห้ามเกิน 5 ขั้น
export const MAX_RANK_LEVEL = 4;
export const RANK_CODES = RANK_CATALOG.map(r => r.code);

// Helper: ตรวจว่าผู้ใช้เห็นเส้นทางถึงผู้จัดการภาคได้ (ตัวแทนขึ้นไป)
export function canViewRankPath(rankLevel: number): boolean { return rankLevel >= 1; }
