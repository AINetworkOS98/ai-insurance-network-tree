// lib/pii.ts — จุดเดียวที่จัดการข้อมูลส่วนบุคคล (PDPA)
// หลักการ: ระบบเก็บ "ผลการตรวจสอบ" ได้ แต่ไม่เก็บข้อมูลส่วนบุคคลเต็มรูปแบบ
//   - ชื่อผู้ชำระเงิน → เก็บแบบปิดบางส่วน เช่น "นางสาว อ**** ภ**"
//   - เลขบัญชี / เลขบัตรประชาชน / เลขประจำตัว → ไม่เก็บเลย (ตัดทิ้ง)
// ใช้ร่วมกันทุกเส้นทาง (สแกน/อัปโหลด/แก้ไขเอง) เพื่อความสม่ำเสมอทั้งระบบ

const TITLE = /^(นาย|นาง|นางสาว|น\.ส\.|ด\.ช\.|ด\.ญ\.|mr|mrs|ms|miss)\.?$/i;

/** ปิดชื่อบุคคลแบบอ่านออกว่าเป็นใครประเภทใด แต่ระบุตัวตนไม่ได้ */
export function maskName(v: any): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  return s.split(/\s+/).map((p) => {
    if (TITLE.test(p)) return p;                       // คงคำนำหน้า (นาย/นาง/นางสาว)
    if (p.length <= 2) return p[0] + '*';
    return p[0] + '*'.repeat(Math.min(8, p.length - 1));
  }).join(' ');
}

/** ปิดเลขบัญชี/เลขบัตรแบบเหลือ 4 ตัวท้าย (ถ้าจำเป็นต้องอ้างอิง) */
export function maskAccount(v: any): string | null {
  const s = String(v ?? '').replace(/\D/g, '');
  if (!s) return null;
  if (s.length <= 4) return '*'.repeat(s.length);
  return '*'.repeat(Math.min(8, s.length - 4)) + s.slice(-4);
}

/** ลบข้อมูลส่วนบุคคลออกจากก้อนข้อมูลใด ๆ ก่อนบันทึก (ใช้กับ raw OCR) */
export function scrubPii(obj: any): any {
  if (!obj || typeof obj !== 'object') return obj;
  const out: any = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (/payer|payerName|account|acct|citizen|idcard|passport|บัตร|บัญชี|ผู้ชำระ/i.test(k)) { out[k] = 'REDACTED'; continue; }
    out[k] = v && typeof v === 'object' ? scrubPii(v) : v;
  }
  return out;
}
