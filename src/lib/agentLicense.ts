// ─────────────────────────────────────────────────────────────────────────────
// agentLicense.ts — กติกาคุณสมบัติ + เอกสาร ตาม "คำขอรับใบอนุญาตเป็นตัวแทนประกันชีวิต"
//   (แบบ ตช.1 ของสำนักงาน คปภ. + หลักเกณฑ์รับสมัครตัวแทนของไทยประกันชีวิต)
//
// ใช้ร่วมกันทั้ง client (หน้า /recruit) และ server (/api/recruit/apply) — ห้าม import prisma
// เป้าหมาย: ระบบต้อง "ตรวจคุณสมบัติก่อนออกโค้ดตัวแทน" ไม่ใช่บันทึกแล้วออกเลขให้ทุกคน
//   มีสิทธิ์ยื่นคำขอ → ออกโค้ดตัวแทนในเครือข่าย + เข้าคิว TL SMART
//   ยังไม่มีสิทธิ์    → ไม่บันทึกเป็นใบสมัคร/ไม่ออกโค้ด แต่บอกว่าติดอะไรและต้องทำอะไรต่อ
// ─────────────────────────────────────────────────────────────────────────────

/** จุดประสงค์การขอรับใบอนุญาต (ข้อ 1 ของแบบ ตช.1) */
export const LICENSE_PURPOSES = [
  { v: 'first', label: 'ขอรับใบอนุญาตครั้งแรก' },
  { v: 'renew', label: 'ขาดต่อ / ขอรับใบอนุญาตใหม่ (ใบเดิมหมดอายุ)' },
  { v: 'multi_company', label: 'ขอรับมากกว่า 1 บริษัท' },
  { v: 'transfer', label: 'ย้ายบริษัท' },
  { v: 'replace', label: 'ขอใบแทนใบอนุญาต' },
] as const;

/** ประเภทใบอนุญาตที่ขอ (ข้อ 5) */
export const LICENSE_KINDS = [
  { v: 'life_agent', label: 'ตัวแทนประกันชีวิต' },
  { v: 'micro_agent', label: 'ตัวแทนประกันชีวิตสำหรับการประกันภัยรายย่อย' },
] as const;

/** ระดับการศึกษา 3 ระดับตามแบบ ตช.1 (ข้อ 7) */
export const EDUCATION_OIC = [
  { v: 'below_bachelor', label: 'ต่ำกว่าปริญญาตรี', rank: 1 },
  { v: 'bachelor', label: 'ปริญญาตรี', rank: 2 },
  { v: 'above_bachelor', label: 'สูงกว่าปริญญาตรี', rank: 3 },
] as const;

/** วุฒิโดยละเอียด — ใช้ตรวจคุณสมบัติขั้นต่ำของสายงาน (ม.6 / ปวช. ขึ้นไป) */
export const EDUCATION_DETAIL = [
  { v: 'primary', label: 'ประถมศึกษา', rank: 0, oic: 'below_bachelor' },
  { v: 'm3', label: 'มัธยมศึกษาตอนต้น (ม.3)', rank: 1, oic: 'below_bachelor' },
  { v: 'm6', label: 'มัธยมปลาย / ปวช.', rank: 2, oic: 'below_bachelor' },
  { v: 'diploma', label: 'อนุปริญญา / ปวส.', rank: 3, oic: 'below_bachelor' },
  { v: 'bachelor', label: 'ปริญญาตรี', rank: 4, oic: 'bachelor' },
  { v: 'master', label: 'ปริญญาโท', rank: 5, oic: 'above_bachelor' },
  { v: 'doctorate', label: 'ปริญญาเอก', rank: 6, oic: 'above_bachelor' },
] as const;

/** คุณสมบัติขั้นต่ำของวุฒิการศึกษา (ม.6 / ปวช.) */
export const MIN_EDUCATION_RANK = 2;
/** อายุขั้นต่ำ (บรรลุนิติภาวะ) ตามข้อ 8.1(1) */
export const MIN_AGE = 20;

/** ข้อ 8.1 — คุณสมบัติที่ต้องรับรองว่ามีครบ */
export const QUALIFICATION_ACKS = [
  { key: 'isAdult', label: 'บรรลุนิติภาวะ (อายุ 20 ปีบริบูรณ์ขึ้นไป)' },
  { key: 'hasThaiResidence', label: 'มีภูมิลำเนาในประเทศไทย' },
  { key: 'insuranceEducationReady', label: 'ได้รับการศึกษาวิชาประกันชีวิตตามที่ คปภ. กำหนด หรือสอบความรู้ผ่านแล้ว' },
] as const;

/** ข้อ 8.2 — ลักษณะต้องห้าม (ตอบ "ใช่" ข้อใดข้อหนึ่ง = ยื่นคำขอไม่ได้) */
export const DISQUALIFICATIONS = [
  { key: 'dqMental', label: 'เป็นคนวิกลจริตหรือจิตฟั่นเฟือนไม่สมประกอบ คนไร้ความสามารถ หรือคนเสมือนไร้ความสามารถ' },
  { key: 'dqPropertyCrime', label: 'เคยต้องคำพิพากษาถึงที่สุดว่ากระทำความผิดเกี่ยวกับทรัพย์โดยทุจริต และยังไม่พ้นโทษ 5 ปี' },
  { key: 'dqBankrupt', label: 'เป็นบุคคลล้มละลาย หรือเคยเป็นบุคคลล้มละลายทุจริต' },
  { key: 'dqBroker', label: 'เป็นนายหน้าประกันชีวิต (ขอรับเป็นตัวแทนไม่ได้)' },
  { key: 'dqSuspended', label: 'อยู่ระหว่างถูกสั่งพักใช้ใบอนุญาตตัวแทน/นายหน้าประกันภัย' },
  { key: 'dqRevoked', label: 'เคยถูกเพิกถอนใบอนุญาต และยังไม่พ้นกำหนด 5 ปี' },
  { key: 'dqBadRecord', label: 'มีประวัติเสียหาย/ขาดความรับผิดชอบตามข้อ 8.2(7) หรือถูกไล่ออก/ปลดออกเพราะทุจริตต่อหน้าที่' },
] as const;

/** ประเภทใบอนุญาตที่มีอยู่เดิม (ข้อ 6) */
export const EXISTING_LICENSES = [
  { v: 'none', label: 'ยังไม่มีใบอนุญาต' },
  { v: 'life_agent', label: 'ตัวแทนประกันชีวิต' },
  { v: 'nonlife_agent', label: 'ตัวแทนประกันวินาศภัย' },
  { v: 'life_broker', label: 'นายหน้าประกันชีวิต' },
  { v: 'nonlife_broker', label: 'นายหน้าประกันวินาศภัย' },
] as const;

/** สถานะการอบรม/สอบ (ตัวตัดสินว่า "พร้อมยื่นคำขอ" หรือยัง) */
export const TRAINING_STATUS = [
  { v: 'none', label: 'ยังไม่ได้อบรม/สอบ' },
  { v: 'training', label: 'กำลังอบรมหลักสูตรตัวแทนประกันชีวิต' },
  { v: 'exam_registered', label: 'สมัครสอบแล้ว รอวันสอบ' },
  { v: 'exam_passed', label: 'สอบผ่านแล้ว รอใบอนุญาต' },
  { v: 'exempt', label: 'ใช้ผลการศึกษาแทนการสอบ (ป.ตรี/ประกาศนียบัตรที่ คปภ. ให้ความเห็นชอบ)' },
  { v: 'licensed', label: 'มีใบอนุญาตแล้ว' },
] as const;

export type DocItem = { key: string; label: string; hint?: string; always?: boolean };

const DOC_ID: DocItem = { key: 'idCard', label: 'สำเนาบัตรประจำตัวประชาชน', always: true };
const DOC_HOUSE: DocItem = { key: 'houseReg', label: 'สำเนาทะเบียนบ้าน', always: true };
const DOC_PHOTO: DocItem = { key: 'photos', label: 'รูปถ่าย 2.5 × 3 ซม. จำนวน 2 รูป (ถ่ายไม่เกิน 6 เดือน)', always: true };
const DOC_DCH5: DocItem = { key: 'dch5', label: 'หนังสือแสดงความต้องการของบริษัทให้เป็นตัวแทน (แบบ ตช.5)', hint: 'บริษัท/ศูนย์ออกให้', always: true };
const DOC_EDU: DocItem = { key: 'eduCert', label: 'หนังสือรับรองการศึกษา/ประกาศนียบัตร (กรณีใช้ผลการศึกษาแทนการสอบ)' };
const DOC_LICENSE: DocItem = { key: 'oldLicense', label: 'ใบอนุญาตฉบับเดิม' };
const DOC_DCH6: DocItem = { key: 'dch6', label: 'หนังสือยินยอมของบริษัทเดิมให้เป็นตัวแทนบริษัทอื่น (แบบ ตช.6)' };
const DOC_RELEASE: DocItem = { key: 'releaseLetter', label: 'หลักฐานแสดงการสิ้นสุดความเป็นตัวแทนของบริษัทเดิม (พร้อมไปรษณีย์ตอบรับ)' };
const DOC_LOST: DocItem = { key: 'policeRecord', label: 'บันทึกประจำวัน (กรณีใบอนุญาตสูญหาย)' };

/** เอกสารประกอบที่ต้องใช้ ตามจุดประสงค์การขอ (ข้อกำหนดท้ายแบบ ตช.1) */
export function requiredDocuments(purpose: string, trainingStatus?: string): DocItem[] {
  const out: DocItem[] = [DOC_ID, DOC_HOUSE, DOC_PHOTO, DOC_DCH5];
  if (purpose === 'renew') out.push(DOC_LICENSE);
  if (purpose === 'multi_company') out.push(DOC_LICENSE, DOC_DCH6);
  if (purpose === 'transfer') out.push(DOC_LICENSE, DOC_RELEASE);
  if (purpose === 'replace') out.push(DOC_LOST);
  if (trainingStatus === 'exempt') out.push(DOC_EDU);
  return out;
}

/** ตรวจเลขประจำตัวประชาชน 13 หลัก (checksum mod 11 ตามที่กรมการปกครองใช้) */
export function thaiIdValid(id: string): boolean {
  const d = String(id || '').replace(/\D/g, '');
  if (d.length !== 13) return false;
  if (/^0+$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(d[i]) * (13 - i);
  return (11 - (sum % 11)) % 10 === Number(d[12]);
}

/** อายุเต็มปี ณ วันที่กำหนด */
export function ageAt(birthDate: string, at: Date = new Date()): number | null {
  if (!birthDate) return null;
  const b = new Date(birthDate);
  if (Number.isNaN(b.getTime())) return null;
  let age = at.getFullYear() - b.getFullYear();
  const m = at.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && at.getDate() < b.getDate())) age -= 1;
  return age >= 0 && age < 120 ? age : null;
}

export type Track = 'ineligible' | 'training_required' | 'exam_pending' | 'code_ready' | 'licensed_transfer';

export type Eligibility = {
  eligible: boolean;
  readyForAgentCode: boolean;
  track: Track;
  trackLabel: string;
  blockers: string[];
  warnings: string[];
  age: number | null;
  educationRank: number;
  requiredDocuments: DocItem[];
  nextSteps: string[];
};

const TRACK_LABEL: Record<Track, string> = {
  ineligible: 'ยังไม่ผ่านคุณสมบัติ — ยื่นคำขอใบอนุญาตไม่ได้',
  training_required: 'ต้องอบรม/สอบหลักสูตรตัวแทนก่อนยื่นคำขอ',
  exam_pending: 'รอผลสอบ/รอใบอนุญาตจาก คปภ.',
  code_ready: 'พร้อมออกโค้ดตัวแทน + ยื่นคำขอใบอนุญาต',
  licensed_transfer: 'มีใบอนุญาตอยู่แล้ว — ต้องโอน/ย้ายสังกัดก่อนออกโค้ด',
};

/**
 * ประเมินคุณสมบัติจากข้อมูลในฟอร์ม
 * - blockers = ข้อที่ทำให้ยื่นคำขอไม่ได้ตามกฎหมาย (ต้องกรอกให้ถูกก่อน ระบบจะไม่บันทึก/ไม่ออกโค้ด)
 * - warnings = เรื่องที่ต้องจัดการก่อนถึงจะ "พร้อมออกโค้ด" (อบรม/สอบ/เอกสารย้ายสังกัด)
 */
export function evaluateEligibility(f: Record<string, any>, at: Date = new Date()): Eligibility {
  const blockers: string[] = [];
  const warnings: string[] = [];

  const eduDetail = EDUCATION_DETAIL.find((e) => e.v === f.educationDetail);
  const educationRank = eduDetail?.rank ?? -1;
  const age = ageAt(String(f.birthDate || ''), at);

  // ── ข้อ 8.1 คุณสมบัติ ────────────────────────────────────────────────
  if (age === null) blockers.push('ยังไม่ได้ระบุวันเกิด (ต้องตรวจอายุขั้นต่ำ 20 ปี)');
  else if (age < MIN_AGE) blockers.push(`อายุ ${age} ปี — ต้องมีอายุครบ ${MIN_AGE} ปีบริบูรณ์ (ยังไม่บรรลุนิติภาวะ)`);

  if (educationRank < 0) blockers.push('ยังไม่ได้ระบุวุฒิการศึกษา');
  else if (educationRank < MIN_EDUCATION_RANK) blockers.push('วุฒิการศึกษาต่ำกว่า ม.6 / ปวช. — ไม่ผ่านคุณสมบัติขั้นต่ำของตัวแทนประกันชีวิต');

  if (f.hasThaiResidence === false) blockers.push('ต้องมีภูมิลำเนาในประเทศไทย (ข้อ 8.1(2))');
  if (f.isAdult === false) blockers.push('ยังไม่บรรลุนิติภาวะ (ข้อ 8.1(1))');

  // ── ข้อ 2 เลขประจำตัวประชาชน ─────────────────────────────────────────
  const nid = String(f.nationalId || '').replace(/\D/g, '');
  if (!nid) blockers.push('ยังไม่ได้กรอกเลขประจำตัวประชาชน 13 หลัก');
  else if (!thaiIdValid(nid)) blockers.push('เลขประจำตัวประชาชนไม่ถูกต้อง (checksum 13 หลักไม่ผ่าน)');

  // ── ข้อ 8.2 ลักษณะต้องห้าม ───────────────────────────────────────────
  for (const d of DISQUALIFICATIONS) {
    if (f[d.key] === true) blockers.push(`มีลักษณะต้องห้าม: ${d.label}`);
  }

  // ── ความครบของข้อมูลสำหรับยื่นคำขอ ──────────────────────────────────
  if (!String(f.firstNameEn || '').trim() || !String(f.lastNameEn || '').trim()) {
    blockers.push('ต้องมีชื่อ–นามสกุลภาษาอังกฤษ (ใช้บนคำขอใบอนุญาตและระบบบริษัท)');
  }
  if (!String(f.phone || '').replace(/\D/g, '')) blockers.push('ต้องมีเบอร์โทรศัพท์เคลื่อนที่');
  if (!String(f.houseAddress || '').trim()) blockers.push('ต้องมีที่อยู่ตามทะเบียนบ้าน');
  if (!String(f.purpose || '').trim()) blockers.push('ต้องเลือกจุดประสงค์การขอรับใบอนุญาต');

  // ── ใบอนุญาตเดิม / การย้ายสังกัด ─────────────────────────────────────
  const existing = String(f.existingLicense || 'none');
  const ts = String(f.trainingStatus || 'none');
  const isLicensed = existing !== 'none' || ts === 'licensed';
  const existingCompany = String(f.existingCompany || '').trim();

  if (existing === 'life_agent' || existing === 'nonlife_agent') {
    if (existingCompany && !f.hasReleaseLetter) {
      warnings.push(`มีใบอนุญาตตัวแทนบริษัท ${existingCompany} อยู่ — ต้องได้หนังสือสิ้นสุดความเป็นตัวแทนจากบริษัทเดิมก่อนจึงจะย้ายมาเป็นตัวแทนไทยประกันชีวิต`);
    }
  }
  if (existing === 'life_broker' || existing === 'nonlife_broker') {
    blockers.push('เป็นนายหน้าประกันชีวิต/วินาศภัย — ขอรับเป็นตัวแทนประกันชีวิตไม่ได้ (ข้อ 8.2(4)) จนกว่าจะคืน/สิ้นสุดใบอนุญาตนายหน้า');
  }

  // ── สถานะการอบรม/สอบ → ความพร้อมออกโค้ด ─────────────────────────────
  if (ts === 'none') warnings.push('ยังไม่ได้เข้าอบรมหลักสูตรตัวแทนประกันชีวิต (ต้องอบรม/สอบก่อนยื่นคำขอต่อนายทะเบียน)');
  if (ts === 'training') warnings.push('กำลังอบรม — ต้องจบหลักสูตรและสอบผ่านก่อนยื่นคำขอ');
  if (ts === 'exam_registered') warnings.push('สมัครสอบแล้ว — รอผลสอบก่อนยื่นคำขอ');

  const eligible = blockers.length === 0;
  const trainingOk = ts === 'exam_passed' || ts === 'exempt' || ts === 'licensed';

  let track: Track;
  if (!eligible) track = 'ineligible';
  else if (isLicensed && existingCompany && (existing === 'life_agent' || existing === 'nonlife_agent')) track = 'licensed_transfer';
  else if (trainingOk) track = 'code_ready';
  else if (ts === 'exam_registered') track = 'exam_pending';
  else track = 'training_required';

  const readyForAgentCode = eligible && (trainingOk || track === 'licensed_transfer');

  const docs = requiredDocuments(String(f.purpose || 'first'), ts);

  const nextSteps: string[] = [];
  if (track === 'ineligible') {
    nextSteps.push('แก้ไขข้อมูลตามรายการที่ค้างอยู่ แล้วส่งใบสมัครอีกครั้ง');
  } else {
    if (!trainingOk && track !== 'licensed_transfer') nextSteps.push('เข้าอบรม/สอบหลักสูตรตัวแทนประกันชีวิต แล้วอัปเดตผลสอบในระบบ');
    if (track === 'licensed_transfer') nextSteps.push('แนบหลักฐานสิ้นสุดความเป็นตัวแทนของบริษัทเดิม (และแบบ ตช.6 ถ้าขอมากกว่า 1 บริษัท)');
    nextSteps.push('ระบบออกโค้ดตัวแทนในเครือข่ายให้ทันทีที่คุณสมบัติพร้อม');
    nextSteps.push('ยื่นคำขอใบอนุญาตต่อนายทะเบียน (คปภ.) ด้วยแบบ ตช.1 + แบบ ตช.5 ของบริษัท');
    nextSteps.push('บริษัทออกเลขตัวแทนจริงจาก TL SMART แล้วระบบจะอัปเดตให้อัตโนมัติ');
  }

  return {
    eligible,
    readyForAgentCode,
    track,
    trackLabel: TRACK_LABEL[track],
    blockers,
    warnings,
    age,
    educationRank,
    requiredDocuments: docs,
    nextSteps,
  };
}

/** แปลงวุฒิโดยละเอียด → ระดับ 3 ระดับของแบบ ตช.1 (ข้อ 7) */
export function oicEducationLevel(educationDetail: string): string {
  return EDUCATION_DETAIL.find((e) => e.v === educationDetail)?.oic || 'below_bachelor';
}

export function educationLabel(v: string): string {
  return EDUCATION_DETAIL.find((e) => e.v === v)?.label || '-';
}

export function trainingLabel(v: string): string {
  return TRAINING_STATUS.find((t) => t.v === v)?.label || '-';
}
