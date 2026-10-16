// recruitSystemData.ts — ดึง "ข้อมูลที่มีอยู่จริงในระบบ" (ใบสมัครออนไลน์ + TL SMART) มาใช้กับไปป์ไลน์รับสมัคร
// ใช้ได้ทั้ง client / server (ห้าม import prisma ที่นี่)
//
// หลักการสำคัญ: ที่นี่ "ไม่ผลิตข้อมูลใหม่" — คืนเฉพาะค่าที่มีบันทึกจริงอยู่แล้วในระบบ
// (ใบสมัคร 4 ขั้น + เหตุการณ์ TL SMART) และติดป้ายที่มา (source) ทุกค่า
// เลขคิวภายใน (tl_smart_agent_code) ไม่ใช่รหัสตัวแทนจริง จึงไม่ถูกใช้เป็น "รหัสตัวแทน" ให้ฟอร์มขั้น 2/6

export type SystemAct = { type: string; content: string | null; createdAt: Date | string };

export type TlSmartInfo = {
  /** เลขคิวภายในที่ระบบออกให้ตอนรับสมัคร (ไม่ใช่รหัสตัวแทนจริง) */
  queueAgentCode: string | null;
  /** รหัสตัวแทนจริงที่ส่งกลับมาจาก TL SMART (ProspectActivity type=tl_smart_agent_code_from_system) */
  agentCodeFromSystem: string | null;
  agentCodeStatus: string | null;
  agentCodeNote: string | null;
  /** วันที่ส่งข้อมูลเข้า TL SMART */
  submittedAt: string | null;
  /** เลขอ้างอิงใบสมัครฝั่งเรา (P-XXXXXX) */
  applicationRef: string | null;
  hasTlSmartApplication: boolean;
};

export type SystemRow = { label: string; value: string; source: string };

function j(s: string | null | undefined): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function s(v: any): string {
  if (v === undefined || v === null) return '';
  return String(v).trim();
}

export function readTlSmart(acts: SystemAct[]): TlSmartInfo {
  const info: TlSmartInfo = {
    queueAgentCode: null,
    agentCodeFromSystem: null,
    agentCodeStatus: null,
    agentCodeNote: null,
    submittedAt: null,
    applicationRef: null,
    hasTlSmartApplication: false,
  };
  for (const a of acts) {
    if (a.type === 'tl_smart_agent_code') {
      info.queueAgentCode = s(a.content) || info.queueAgentCode;
      continue;
    }
    if (a.type === 'tl_smart_application') {
      const p = j(a.content);
      info.hasTlSmartApplication = true;
      info.submittedAt = s(p?.receivedAt) || s(info.submittedAt);
      info.applicationRef = s(p?.sourceRef) || info.applicationRef;
      if (!info.queueAgentCode) info.queueAgentCode = s(p?.agentCodeIssued) || null;
      continue;
    }
    if (a.type === 'tl_smart_agent_code_from_system') {
      const p = j(a.content);
      info.agentCodeFromSystem = s(p?.agentCode) || info.agentCodeFromSystem;
      info.agentCodeStatus = s(p?.status) || info.agentCodeStatus;
      info.agentCodeNote = s(p?.note) || info.agentCodeNote;
      continue;
    }
  }
  return info;
}

/** รหัสตัวแทนที่ยืนยันจาก TL SMART เท่านั้น (เลขคิวภายในไม่นับ) */
export function realAgentCode(tl: TlSmartInfo): string | null {
  return tl.agentCodeFromSystem || null;
}

function thDate(v: any): string {
  const t = s(v);
  if (!t) return '';
  const d = new Date(t);
  if (isNaN(d.getTime())) return t;
  return d.toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

const LICENSE_STATUS_LABEL: Record<string, string> = {
  none: 'ยังไม่มีใบอนุญาต',
  needs_training: 'ยังไม่มี — ต้องอบรมก่อนสอบ',
  has_license: 'มีใบอนุญาตแล้ว',
  expired: 'ใบอนุญาตหมดอายุ',
};

/** แถวข้อมูลจริงสำหรับแสดงในหน้าไปป์ไลน์ (label / value / ที่มา) */
export function systemRows(app: any, tl: TlSmartInfo): SystemRow[] {
  const rows: SystemRow[] = [];
  const fullName = [s(app?.prefix), s(app?.firstName), s(app?.lastName)].filter(Boolean).join(' ');
  if (fullName) rows.push({ label: 'ชื่อ-นามสกุล', value: fullName, source: 'ใบสมัครออนไลน์' });
  if (s(app?.phone)) rows.push({ label: 'เบอร์มือถือ', value: s(app.phone), source: 'ใบสมัครออนไลน์' });
  if (s(app?.email)) rows.push({ label: 'อีเมล', value: s(app.email), source: 'ใบสมัครออนไลน์' });
  if (s(app?.nationalId)) rows.push({ label: 'เลขบัตรประชาชน', value: s(app.nationalId), source: 'ใบสมัครออนไลน์' });
  if (s(app?.birthDate)) rows.push({ label: 'วันเกิด', value: s(app.birthDate), source: 'ใบสมัครออนไลน์' });
  if (s(app?.province)) rows.push({ label: 'จังหวัด', value: s(app.province), source: 'ใบสมัครออนไลน์' });
  if (s(app?.educationLevel)) rows.push({ label: 'การศึกษา', value: s(app.educationLevel), source: 'ใบสมัครออนไลน์' });
  if (s(app?.currentOccupation)) rows.push({ label: 'อาชีพปัจจุบัน', value: s(app.currentOccupation), source: 'ใบสมัครออนไลน์' });
  if (s(app?.sponsorCode)) rows.push({ label: 'รหัสผู้แนะนำ', value: s(app.sponsorCode), source: 'ใบสมัครออนไลน์' });
  if (s(app?.targetPositionPreference)) rows.push({ label: 'ตำแหน่งที่ต้องการ', value: s(app.targetPositionPreference), source: 'ใบสมัครออนไลน์' });
  if (s(app?.expectedStartDate)) rows.push({ label: 'วันที่พร้อมเริ่มงาน', value: s(app.expectedStartDate), source: 'ใบสมัครออนไลน์' });
  if (s(app?.submittedAt)) rows.push({ label: 'วันที่ส่งใบสมัคร', value: thDate(app.submittedAt), source: 'ใบสมัครออนไลน์' });
  if (s(app?.licenseStatus)) rows.push({ label: 'สถานะใบอนุญาตเดิม', value: LICENSE_STATUS_LABEL[s(app.licenseStatus)] || s(app.licenseStatus), source: 'ใบสมัครออนไลน์' });
  if (s(app?.licenseNumber)) rows.push({ label: 'เลขที่ใบอนุญาตเดิม', value: s(app.licenseNumber), source: 'ใบสมัครออนไลน์' });
  if (s(app?.licenseExpiryDate)) rows.push({ label: 'วันหมดอายุใบอนุญาตเดิม', value: s(app.licenseExpiryDate), source: 'ใบสมัครออนไลน์' });

  if (realAgentCode(tl)) {
    rows.push({ label: 'รหัสตัวแทน (TL SMART ยืนยัน)', value: realAgentCode(tl)!, source: 'TL SMART' });
  }
  if (tl.agentCodeStatus) rows.push({ label: 'สถานะการออกเลขตัวแทน', value: tl.agentCodeStatus, source: 'TL SMART' });
  if (tl.queueAgentCode) rows.push({ label: 'เลขคิวภายใน (ยังไม่ใช่เลขตัวแทนจริง)', value: tl.queueAgentCode, source: 'ระบบรับสมัคร' });
  if (tl.submittedAt) rows.push({ label: 'วันที่ส่งเข้า TL SMART', value: thDate(tl.submittedAt), source: 'ระบบรับสมัคร' });
  return rows;
}

/** ค่าที่ "มีจริง" และนำไปเติมในฟอร์มแต่ละขั้นได้ (คีย์ต้องตรงกับ fields ของขั้นนั้น) */
export function systemPrefill(app: any, tl: TlSmartInfo): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  const code = realAgentCode(tl);
  if (code) {
    out.APPLICATION_APPROVED = { agentCode: code };
    out.APPOINTMENT_APPROVED = { appointedAgentCode: code };
  }
  const lic: Record<string, string> = {};
  if (s(app?.licenseNumber)) lic.licenseNo = s(app.licenseNumber);
  if (s(app?.licenseExpiryDate)) lic.licenseExpiryDate = s(app.licenseExpiryDate);
  if (Object.keys(lic).length) out.LICENSE_UNDER_AFFILIATION = lic;

  const exam: Record<string, string> = {};
  if (s(app?.examDate)) exam.licenseExamDate = s(app.examDate);
  if (Object.keys(exam).length) out.AGENT_LICENSE_EXAM_REGISTERED = exam;

  const renew: Record<string, string> = {};
  if (s(app?.licenseNumber)) renew.oldLicenseNo = s(app.licenseNumber);
  if (s(app?.licenseExpiryDate)) renew.oldExpiryDate = s(app.licenseExpiryDate);
  if (Object.keys(renew).length) out.LICENSE_RENEWED = renew;

  return out;
}
