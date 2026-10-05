// recruitPipeline.ts — แหล่งความจริงเดียวของ "ขั้นตอนรับสมัครตัวแทน (ผู้มุ่งหวัง)"
// ใช้ได้ทั้ง client / server (ห้าม import prisma ที่นี่)
//
// ลำดับขั้นตามที่เจ้าของระบบกำหนด (8 ขั้น):
//   1 รอดำเนินการและตรวจสอบ → 2 อนุมัติสมัครตัวแทน → 3 สมัครสอบใต้สังกัด → 4 ใบอนุญาตใต้สังกัด
//   → 5 อนุมัติค้ำประกัน → 6 อนุมัติแต่งตั้ง → 7 สมัครสอบใบอนุญาตตัวแทน → 8 ต่ออายุใบอนุญาต
//
// ข้อมูลแต่ละขั้นถูกเก็บเป็น JSON (ProspectActivity type = "recruit_stage:<KEY>")
// และบันทึกการเปลี่ยนขั้นใน ProspectStatusHistory (append-only) — ไม่ต้องแก้โครง DB

export type StageFieldType = 'text' | 'date' | 'number' | 'select' | 'textarea';

export interface StageField {
  key: string;
  label: string;
  type?: StageFieldType;
  options?: string[];
  required?: boolean;
  hint?: string;
}

export interface RecruitStage {
  key: string;
  no: number;
  label: string;
  sub: string;
  icon: string;
  owner: 'สมาชิก' | 'เจ้าหน้าที่' | 'บริษัท';
  /** ค่า ProspectStatus ที่จะถูกตั้งเมื่อจบขั้นนี้ (enum เดิมของระบบ) */
  mapsTo: 'NEW' | 'CONTACTED' | 'INTERESTED' | 'APPOINTMENT' | 'FOLLOW_UP' | 'PREPARING_DOCUMENTS' | 'APPLIED' | 'CONVERTED';
  fields: StageField[];
}

export const RECRUIT_STAGES: RecruitStage[] = [
  {
    key: 'PENDING_REVIEW', no: 1, label: 'รอดำเนินการและตรวจสอบ', icon: '🕵️', owner: 'เจ้าหน้าที่', mapsTo: 'NEW',
    sub: 'ตรวจเอกสารและข้อมูลผู้มุ่งหวังให้ครบถ้วน',
    fields: [
      { key: 'documentsComplete', label: 'ความครบถ้วนของเอกสาร', type: 'select', options: ['ครบถ้วน', 'ไม่ครบ — ต้องขอเพิ่ม'], required: true },
      { key: 'missingDocs', label: 'เอกสารที่ต้องขอเพิ่ม', type: 'text', hint: 'เช่น สำเนาบัตรประชาชน, รูปถ่าย, วุฒิการศึกษา' },
      { key: 'reviewer', label: 'ผู้ตรวจสอบ', type: 'text', required: true },
      { key: 'reviewDate', label: 'วันที่ตรวจสอบ', type: 'date', required: true },
      { key: 'reviewResult', label: 'ผลการตรวจสอบ', type: 'select', options: ['ผ่านการตรวจสอบ', 'ต้องแก้ไขข้อมูล', 'ไม่ผ่าน'], required: true },
      { key: 'reviewNote', label: 'หมายเหตุ', type: 'textarea' },
    ],
  },
  {
    key: 'APPLICATION_APPROVED', no: 2, label: 'อนุมัติสมัครตัวแทน', icon: '✅', owner: 'เจ้าหน้าที่', mapsTo: 'APPLIED',
    sub: 'อนุมัติใบสมัครและออกเลขที่อนุมัติ',
    fields: [
      { key: 'approvalNo', label: 'เลขที่อนุมัติ', type: 'text', required: true },
      { key: 'approvedBy', label: 'ผู้อนุมัติ', type: 'text', required: true },
      { key: 'approvedDate', label: 'วันที่อนุมัติ', type: 'date', required: true },
      { key: 'agentCode', label: 'รหัสตัวแทนที่ออกให้', type: 'text' },
      { key: 'approvalNote', label: 'หมายเหตุ', type: 'textarea' },
    ],
  },
  {
    key: 'EXAM_REGISTERED_AFFILIATION', no: 3, label: 'สมัครสอบใต้สังกัด', icon: '📝', owner: 'เจ้าหน้าที่', mapsTo: 'APPLIED',
    sub: 'ส่งใบสมัครสอบภายใต้สังกัด/บริษัท',
    fields: [
      { key: 'affiliationCompany', label: 'บริษัท/สังกัดที่สมัครสอบ', type: 'text', required: true },
      { key: 'examRegNo', label: 'เลขที่ใบสมัครสอบ', type: 'text', required: true },
      { key: 'examRegisteredDate', label: 'วันที่สมัครสอบ', type: 'date', required: true },
      { key: 'examDate', label: 'วันสอบ', type: 'date' },
      { key: 'examCenter', label: 'สนามสอบ', type: 'text' },
      { key: 'examFee', label: 'ค่าสมัครสอบ (บาท)', type: 'number' },
    ],
  },
  {
    key: 'LICENSE_UNDER_AFFILIATION', no: 4, label: 'ใบอนุญาตใต้สังกัด', icon: '🪪', owner: 'บริษัท', mapsTo: 'APPLIED',
    sub: 'ออก/ขึ้นทะเบียนใบอนุญาตภายใต้สังกัด',
    fields: [
      { key: 'affiliationName', label: 'ชื่อสังกัดบนใบอนุญาต', type: 'text', required: true },
      { key: 'licenseNo', label: 'เลขที่ใบอนุญาต', type: 'text', required: true },
      { key: 'licenseType', label: 'ประเภทใบอนุญาต', type: 'select', options: ['ประกันชีวิต', 'ประกันวินาศภัย', 'ทั้งสองประเภท'] },
      { key: 'licenseIssueDate', label: 'วันที่ออกใบอนุญาต', type: 'date' },
      { key: 'licenseExpiryDate', label: 'วันหมดอายุใบอนุญาต', type: 'date', required: true },
    ],
  },
  {
    key: 'GUARANTEE_APPROVED', no: 5, label: 'อนุมัติค้ำประกัน', icon: '🤝', owner: 'เจ้าหน้าที่', mapsTo: 'APPLIED',
    sub: 'บันทึกผู้ค้ำประกันและวงเงินค้ำประกัน',
    fields: [
      { key: 'guarantorName', label: 'ชื่อผู้ค้ำประกัน', type: 'text', required: true },
      { key: 'guarantorRelation', label: 'ความสัมพันธ์กับผู้สมัคร', type: 'text' },
      { key: 'guarantorPhone', label: 'เบอร์ติดต่อผู้ค้ำประกัน', type: 'text' },
      { key: 'guaranteeAmount', label: 'วงเงินค้ำประกัน (บาท)', type: 'number', required: true },
      { key: 'guaranteeDocNo', label: 'เลขที่เอกสารค้ำประกัน', type: 'text' },
      { key: 'guaranteeApprovedDate', label: 'วันที่อนุมัติค้ำประกัน', type: 'date', required: true },
    ],
  },
  {
    key: 'APPOINTMENT_APPROVED', no: 6, label: 'อนุมัติแต่งตั้ง', icon: '🏅', owner: 'บริษัท', mapsTo: 'CONVERTED',
    sub: 'ออกหนังสือแต่งตั้งเข้าสู่ตำแหน่ง',
    fields: [
      { key: 'appointmentNo', label: 'เลขที่หนังสือแต่งตั้ง', type: 'text', required: true },
      { key: 'appointmentDate', label: 'วันที่แต่งตั้ง', type: 'date', required: true },
      { key: 'appointedPosition', label: 'ตำแหน่งที่แต่งตั้ง', type: 'select', options: ['ตัวแทน (Agent)', 'ตัวแทนอาวุโส', 'หัวหน้าหน่วย (UM)', 'ผู้จัดการศูนย์'], required: true },
      { key: 'appointedAgentCode', label: 'รหัสตัวแทน', type: 'text' },
      { key: 'appointedBy', label: 'ผู้ลงนามแต่งตั้ง', type: 'text', required: true },
    ],
  },
  {
    key: 'AGENT_LICENSE_EXAM_REGISTERED', no: 7, label: 'สมัครสอบใบอนุญาตตัวแทน', icon: '🎓', owner: 'สมาชิก', mapsTo: 'APPLIED',
    sub: 'สมัครสอบใบอนุญาตตัวแทนประกันชีวิต (คปภ.)',
    fields: [
      { key: 'examRound', label: 'รอบสอบ', type: 'text', required: true },
      { key: 'licenseExamRegNo', label: 'เลขที่ใบสมัครสอบใบอนุญาต', type: 'text', required: true },
      { key: 'licenseExamRegisteredDate', label: 'วันที่สมัครสอบ', type: 'date', required: true },
      { key: 'licenseExamDate', label: 'วันสอบ', type: 'date' },
      { key: 'licenseExamResult', label: 'ผลสอบ', type: 'select', options: ['รอผล', 'ผ่าน', 'ไม่ผ่าน'] },
    ],
  },
  {
    key: 'LICENSE_RENEWED', no: 8, label: 'ต่ออายุใบอนุญาต', icon: '♻️', owner: 'สมาชิก', mapsTo: 'CONVERTED',
    sub: 'ต่ออายุใบอนุญาตตัวแทนเมื่อใกล้หมดอายุ',
    fields: [
      { key: 'oldLicenseNo', label: 'เลขที่ใบอนุญาตเดิม', type: 'text' },
      { key: 'oldExpiryDate', label: 'วันหมดอายุเดิม', type: 'date' },
      { key: 'newLicenseNo', label: 'เลขที่ใบอนุญาตใหม่', type: 'text', required: true },
      { key: 'newExpiryDate', label: 'วันหมดอายุใหม่', type: 'date', required: true },
      { key: 'renewedDate', label: 'วันที่ต่ออายุ', type: 'date', required: true },
      { key: 'renewalFee', label: 'ค่าธรรมเนียม (บาท)', type: 'number' },
      { key: 'renewalStatus', label: 'สถานะการชำระ', type: 'select', options: ['ชำระแล้ว', 'รอชำระ'], required: true },
    ],
  },
];

export const STAGE_PREFIX = 'recruit_stage:';

export function stageByKey(key: string): RecruitStage | undefined {
  return RECRUIT_STAGES.find((s) => s.key === key);
}

/** ขั้นถัดไปหลัง key นี้ (คืน undefined ถ้าเป็นขั้นสุดท้าย) */
export function nextStage(key: string): RecruitStage | undefined {
  const i = RECRUIT_STAGES.findIndex((s) => s.key === key);
  return i >= 0 ? RECRUIT_STAGES[i + 1] : RECRUIT_STAGES[0];
}

/** ฟิลด์บังคับที่ยังไม่ได้กรอก — ใช้ทั้งฝั่งฟอร์มและฝั่ง API */
export function missingRequired(stageKey: string, data: Record<string, any>): string[] {
  const st = stageByKey(stageKey);
  if (!st) return ['ไม่รู้จักขั้นตอนนี้'];
  return st.fields
    .filter((f) => f.required)
    .filter((f) => {
      const v = data?.[f.key];
      return v === undefined || v === null || String(v).trim() === '';
    })
    .map((f) => f.label);
}

/** ความคืบหน้าเป็นเปอร์เซ็นต์จากขั้นปัจจุบัน */
export function progressOf(stageKey?: string | null): number {
  if (!stageKey) return 0;
  const i = RECRUIT_STAGES.findIndex((s) => s.key === stageKey);
  if (i < 0) return 0;
  return Math.round(((i + 1) / RECRUIT_STAGES.length) * 100);
}
