/**
 * incomeBenefits3d.ts — ข้อมูล "ผลประโยชน์รายได้จากงานที่มั่นคง" (4 ระดับสายงาน)
 *
 * แยกข้อมูลออกจาก UI ตามข้อกำหนด: แก้ตัวเลข/รายการผลประโยชน์ได้ที่ไฟล์นี้ไฟล์เดียว
 *
 * ⚠️ สถานะข้อมูล (ห้ามตีความว่าเป็นข้อมูลจริง)
 *   - com / samplePercent / periodLabel ชุดนี้ "อ้างอิงภาพตัวอย่าง" ที่ผู้ใช้ส่งมา
 *     → ใช้เป็น "ข้อมูลตัวอย่าง" (isSample = true) แสดงพร้อมป้ายกำกับบนหน้าจอ
 *   - รายการผลประโยชน์ (benefits) ตรงกับโครงสร้างค่าตอบแทนในระบบ
 *     src/lib/compensationRules.ts (DEFAULT_RULES_2021) — ใช้เป็นรายชื่อสิทธิ์ ไม่ใช่ตัวเลขเงิน
 *   - เมื่อมีข้อมูลจริงจากฐานข้อมูล ให้ส่งผ่าน prop `levels` ของ IncomeBenefits3DSection
 *     แล้วปิด isSample — ห้ามแก้ตัวเลขในไฟล์นี้ให้ดูเหมือนผลงานจริงโดยไม่มีแหล่งข้อมูล
 */

export type IncomeTone = 'sky' | 'teal' | 'violet' | 'gold';

export interface IncomeLevel3D {
  /** ลำดับขั้น 1–4 (ใช้เรียงการ์ด) */
  level: number;
  /** ผูกกับ RANK_CATALOG.level ของระบบ (1=ตัวแทน … 4=ผู้จัดการภาค) */
  rankLevel: number;
  nameTh: string;
  nameEn: string;
  /** คำอธิบายบทบาทสั้น ๆ */
  role: string;
  /** ตัวเลข COM อ้างอิง (null = ภาพตัวอย่างไม่ระบุ) */
  com: number | null;
  /** ระยะเวลาอ้างอิงของระดับนั้น */
  periodLabel: string;
  /** รายการผลประโยชน์/สิทธิ์ที่ได้รับ */
  benefits: string[];
  /** % ความก้าวหน้า (ตัวอย่าง) */
  samplePercent: number;
  tone: IncomeTone;
  /** ความสูงฐานแท่งรายได้บนเดสก์ท็อป (px) — สร้างเอฟเฟกต์ขั้นบันได */
  pedestal: number;
}

export interface IncomeBenefits3DData {
  kicker: string;
  title: string;
  subtitle: string;
  /** true = ตัวเลข/เปอร์เซ็นต์เป็นตัวอย่าง ต้องแสดงป้ายกำกับ */
  isSample: boolean;
  sampleNote: string;
  levels: IncomeLevel3D[];
  disclaimer: string;
  /** ข้อสังเกตเรื่องความขัดแย้งของตัวเลขกับตารางค่าตอบแทนในระบบ (ถ้ามี) */
  conflictNote?: string;
}

/** ตัวเลข/เปอร์เซ็นต์ชุดนี้มาจากภาพตัวอย่าง — ไม่ใช่ผลการดำเนินงานจริง */
export const INCOME_BENEFITS_3D: IncomeBenefits3DData = {
  kicker: 'โครงสร้างรายได้ 4 ระดับ',
  title: 'ผลประโยชน์รายได้จากงานที่มั่นคง',
  subtitle: 'เติบโตจากตัวแทน สู่ผู้บริหารหน่วย ผู้บริหารศูนย์ และผู้จัดการภาค',
  isSample: true,
  sampleNote: 'ตัวเลข COM • ระยะเวลา • % เป็นข้อมูลตัวอย่างจากภาพอ้างอิง — แก้ไขได้จากข้อมูลจริงในระบบ',
  levels: [
    {
      level: 1,
      rankLevel: 1,
      nameTh: 'ตัวแทน',
      nameEn: 'Agent',
      role: 'ขายและดูแลลูกค้า',
      com: 20000,
      periodLabel: '1–6 เดือน',
      benefits: ['คอมมิชชัน', 'ค่าพาหนะ'],
      samplePercent: 40,
      tone: 'sky',
      pedestal: 56,
    },
    {
      level: 2,
      rankLevel: 2,
      nameTh: 'ผู้บริหารหน่วย',
      nameEn: 'Unit Manager',
      role: 'ขาย + เริ่มสร้างหน่วย',
      com: 75000,
      periodLabel: '3–6 เดือน',
      benefits: [
        'คอมมิชชัน',
        'ค่าพาหนะ',
        'โบนัสหน่วยใหม่',
        'ค่าแยกหน่วย',
        'ค่าจัดงานหน่วย',
      ],
      samplePercent: 56,
      tone: 'teal',
      pedestal: 84,
    },
    {
      level: 3,
      rankLevel: 3,
      nameTh: 'ผู้บริหารศูนย์',
      nameEn: 'Center Manager',
      role: 'บริหารหลายหน่วย',
      com: 1200000,
      periodLabel: '12–24 เดือน',
      benefits: [
        'คอมมิชชัน',
        'ค่าพาหนะ',
        'ค่าจัดงานหน่วย',
        'ค่าแยกหน่วย',
        'ค่าจัดงานศูนย์',
        'ค่าเก็บเบี้ยปีต่อ',
        'ค่าแยกศูนย์',
        'โบนัสศูนย์',
        'เงินเดือนไม่ประจำ',
      ],
      samplePercent: 72,
      tone: 'violet',
      pedestal: 112,
    },
    {
      level: 4,
      rankLevel: 4,
      nameTh: 'ผู้จัดการภาค',
      nameEn: 'Region Manager',
      role: 'บริหารศูนย์และภาค',
      com: null,
      periodLabel: '24 เดือนขึ้นไป',
      benefits: [
        'คอมมิชชัน',
        'ค่าพาหนะ',
        'ค่าจัดงานหน่วย',
        'ค่าแยกหน่วย',
        'ค่าจัดงานศูนย์',
        'ค่าเก็บเบี้ยปีต่อ',
        'ค่าแยกศูนย์',
        'โบนัสศูนย์',
        'เงินเดือนไม่ประจำ',
        'ค่าบริหารศูนย์',
        'ค่าจัดงานภาค',
        'ค่าแยกภาค',
        'โบนัสภาค',
        'ค่าบริหารเป้าหมาย',
        'กองทุนสำรองเลี้ยงชีพ',
      ],
      samplePercent: 85,
      tone: 'gold',
      pedestal: 148,
    },
  ],
  disclaimer:
    'ตัวเลขทั้งหมดเป็นข้อมูลตัวอย่างเพื่อสื่อโครงสร้างสายงาน ไม่ใช่การรับประกันรายได้ — รายได้จริงขึ้นอยู่กับผลงานจริง คุณสมบัติ เงื่อนไข และหลักเกณฑ์ของแต่ละช่วงเวลา',
  conflictNote:
    'ตัวเลข COM ระดับผู้บริหารศูนย์ (1,200,000) ในภาพตัวอย่าง ยังไม่ตรงกับตารางค่าตอบแทนในระบบ (compensationRules: ผู้บริหารศูนย์ 75,000 / ผู้จัดการภาค 1,200,000) — ต้องยืนยันก่อนใช้เป็นข้อมูลจริง',
};

export const INCOME_TONE_COLORS: Record<IncomeTone, { from: string; to: string; glow: string }> = {
  sky: { from: '#38bdf8', to: '#0ea5e9', glow: 'rgba(56,189,248,.55)' },
  teal: { from: '#2dd4bf', to: '#0d9488', glow: 'rgba(45,212,191,.5)' },
  violet: { from: '#a78bfa', to: '#7c3aed', glow: 'rgba(167,139,250,.5)' },
  gold: { from: '#fcd34d', to: '#d97706', glow: 'rgba(252,211,77,.55)' },
};
