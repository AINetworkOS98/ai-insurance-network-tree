// thaiLifeReceipt.ts — แกนกลาง "ระบบสแกนใบเสร็จที่แข็งแรง" สำหรับระบบ 1 แตก 5
//
// ⛔ กฎ PDPA เด็ดขาด (เจ้าของระบบสั่ง): ห้ามเก็บข้อมูลส่วนบุคคลของลูกค้าเข้าระบบ
//    ไฟล์นี้จึงไม่คืนชื่อ-นามสกุลเต็ม / เลขประจำตัวผู้เสียภาษีเต็ม / เลขบัตร / ที่อยู่ เลยแม้แต่ช่องเดียว
//    คืนได้เฉพาะข้อมูลธุรกรรม (เลขที่ใบเสร็จ กรมธรรม์ วันที่ ยอดเงิน) + ตัวบ่งชี้แบบปิดบัง (น.ส.อ**** · ••••0104)
//    และผู้เรียกต้องไม่บันทึกข้อความดิบ (rawText) ลงฐานข้อมูล
//
// หลักคิดสำคัญ: โมเดลภาพ (vision) ทำหน้าที่ "ถอดข้อความ" (transcription) เท่านั้น
// การสกัด "ตัวเลข/วันที่/เลขที่ใบเสร็จ" ทำด้วยตัวสกัดแบบกำหนดกติกา (deterministic) ในไฟล์นี้
// แล้ว "ตรวจไขว้" กันเอง (ยอดตัวเลข vs คำอ่านจำนวนเงิน, วันที่ vs งวดเบี้ย, เลขที่ใบเสร็จ vs รูปแบบ)
// จึงไม่ผิดพลาดแบบเดาสุ่ม และทุกช่องมี confidence + เหตุผลกำกับ (ตรวจสอบย้อนหลังได้)
//
// รองรับเทมเพลตจริง: หนังสือรับรองการชำระเบี้ยประกันภัย บริษัท ไทยประกันชีวิต จำกัด (มหาชน)
//   ตัวอย่างจริง: "01/01 รายปี C8009159 09/08/2569 66,604.-0.-0.-66,604.-"
//                  "รวมเบี้ยประกันชีวิตสำหรับอ้างอิงใช้สิทธิ์ลดหย่อนภาษีจำนวน 66,604.- บาท (หกหมื่นหกพันหกร้อยสี่บาทถ้วน)"
// ไฟล์นี้เป็น pure TypeScript (ไม่ import อะไร) → ทดสอบ/รันได้ทั้งฝั่ง server และสคริปต์ภายนอก

export type DocType = 'thai_life_premium_certificate' | 'insurance_receipt' | 'bank_slip' | 'tax_document' | 'unknown';

export interface ParseIssue {
  code: string;
  level: 'error' | 'warn' | 'info';
  message: string;
  field?: string;
}

export interface FieldMeta { confidence: number; note?: string }

export interface NetworkImpact {
  countsToward1x5: boolean;
  verifiedAmount: number;      // ยอดที่จะนับเข้าผลงาน (0 ถ้ายังนับไม่ได้)
  reason: string;
}

export interface ParsedReceipt {
  docType: DocType;
  company: string | null;
  isKnownInsurer: boolean;
  formCode: string | null;
  // PDPA: เก็บได้แค่แบบปิดบัง + 4 ตัวท้าย (ห้ามเก็บเลขภาษีเต็ม)
  taxIdMasked: string | null;
  taxIdLast4: string | null;
  branch: string | null;
  receiptNo: string | null;
  transactionRef: string | null;
  policyNo: string | null;
  planName: string | null;
  policyTermYears: number | null;
  installmentLabel: string | null;   // "01/01"
  paymentMethod: string | null;      // "รายปี" / "ราย 6 เดือน" ...
  paidAt: string | null;             // YYYY-MM-DD (ค.ศ.)
  issuedAt: string | null;           // YYYY-MM-DD (ค.ศ.)
  amountTotal: number | null;        // เบี้ยประกันภัยรวม
  amountLife: number | null;
  amountHealth: number | null;
  amountRider: number | null;
  amountInWords: string | null;
  amountFromWords: number | null;    // ยอดที่ถอดจากคำอ่านจำนวนเงิน (ใช้ตรวจไขว้)
  // PDPA: ชื่อบุคคลเก็บแบบปิดบังเท่านั้น
  payerNameMasked: string | null;
  insuredNameMasked: string | null;
  agentCode: string | null;
  bank: string | null;
  fields: Record<string, FieldMeta>;
  issues: ParseIssue[];
  confidence: number;                // 0..1
  needsManualReview: boolean;
  dedupKey: string | null;           // ใช้กันการนับยอดซ้ำ (ไม่ใช่ข้อมูลส่วนบุคคล)
  network: NetworkImpact;
  piiPolicy: 'masked_only';          // สัญญาว่าผลลัพธ์มีแต่ค่าที่ปิดบังแล้ว
}

// ── PDPA helpers (คัดลอกไว้ในไฟล์ เพื่อให้ไฟล์นี้ไม่พึ่ง dependency ใด ๆ) ──────────
const TITLE_RE = /^(นาย|นาง|นางสาว|น\.ส\.|ด\.ช\.|ด\.ญ\.|mr|mrs|ms|miss)\.?$/i;

/** ปิดชื่อบุคคล: คงคำนำหน้า + อักษรแรก ที่เหลือเป็น * → ระบุตัวตนไม่ได้ */
export function maskPersonName(v: string | null | undefined): string | null {
  const s = String(v ?? '').trim();
  if (!s) return null;
  return s.split(/\s+/).map((p) => {
    if (TITLE_RE.test(p)) return p;
    if (p.length <= 2) return p[0] + '*';
    return p[0] + '*'.repeat(Math.min(8, p.length - 1));
  }).join(' ');
}

/** ปิดเลขภาษี/เลขบัตร: เหลือ 4 ตัวท้าย */
export function maskDigits(v: string | null | undefined): { masked: string | null; last4: string | null } {
  const s = String(v ?? '').replace(/\D/g, '');
  if (!s) return { masked: null, last4: null };
  const last4 = s.slice(-4);
  return { masked: '•••••••' + last4, last4 };
}

// ── บริษัทประกันที่ระบบยอมรับ (สแกนแล้วนับเข้าเครือข่ายได้) ────────────────────
const KNOWN_INSURERS: { re: RegExp; name: string }[] = [
  { re: /ไทยประกันชีวิต/, name: 'บริษัท ไทยประกันชีวิต จำกัด (มหาชน)' },
  { re: /ไทยประกันภัย/, name: 'บริษัท ไทยประกันภัย จำกัด (มหาชน)' },
  { re: /\bAIA\b|เอไอเอ/i, name: 'AIA' },
  { re: /เมืองไทยประกันชีวิต/, name: 'บริษัท เมืองไทยประกันชีวิต จำกัด (มหาชน)' },
  { re: /เมืองไทยประกันภัย/, name: 'บริษัท เมืองไทยประกันภัย จำกัด (มหาชน)' },
  { re: /กรุงเทพประกันชีวิต/, name: 'บริษัท กรุงเทพประกันชีวิต จำกัด (มหาชน)' },
  { re: /กรุงไทย-แอกซ่า|แอกซ่า/, name: 'กรุงไทย-แอกซ่า ประกันชีวิต' },
  { re: /อลิอันซ์|Allianz/i, name: 'อลิอันซ์ อยุธยา ประกันชีวิต' },
  { re: /ฟิลิป|Phillip/i, name: 'ฟิลิปประกันชีวิต' },
  { re: /ทิพย|Dhipaya/i, name: 'ทิพยประกันภัย' },
  { re: /วิริยะ|Viriyah/i, name: 'วิริยะประกันภัย' },
  { re: /สินทรัพย์.*ประกัน|Ocean Life|โอเชี่ยน/i, name: 'โอเชี่ยน ไลฟ์' },
  { re: /เจเนอรัลลี่|Generali/i, name: 'เจนเนอรัลลี่ ประกันชีวิต' },
  { re: /โตเกียว.*มารีน|Tokio Marine/i, name: 'โตเกียว มารีน' },
  { re: /ไทยสมุทร|Thai Samut/i, name: 'ไทยสมุทรประกันชีวิต' },
  { re: /เอฟดับบลิวดี|FWD/i, name: 'FWD ประกันชีวิต' },
];

const THAI_DIGITS: Record<string, string> = { '๐': '0', '๑': '1', '๒': '2', '๓': '3', '๔': '4', '๕': '5', '๖': '6', '๗': '7', '๘': '8', '๙': '9' };
const THAI_MONTHS: Record<string, number> = {
  'มกราคม': 1, 'กุมภาพันธ์': 2, 'มีนาคม': 3, 'เมษายน': 4, 'พฤษภาคม': 5, 'มิถุนายน': 6,
  'กรกฎาคม': 7, 'สิงหาคม': 8, 'กันยายน': 9, 'ตุลาคม': 10, 'พฤศจิกายน': 11, 'ธันวาคม': 12,
  'ม.ค.': 1, 'ก.พ.': 2, 'มี.ค.': 3, 'เม.ย.': 4, 'พ.ค.': 5, 'มิ.ย.': 6,
  'ก.ค.': 7, 'ส.ค.': 8, 'ก.ย.': 9, 'ต.ค.': 10, 'พ.ย.': 11, 'ธ.ค.': 12,
};

// ── ตัวช่วยพื้นฐาน ──────────────────────────────────────────────────────────
export function toArabicDigits(s: string): string {
  return String(s || '').replace(/[๐-๙]/g, (d) => THAI_DIGITS[d] || d);
}

/** พ.ศ. → ค.ศ. (ถ้าปี > 2400 ถือเป็น พ.ศ.) */
export function beToCeYear(y: number): number {
  return y > 2400 ? y - 543 : y;
}

/** "09/08/2569" | "9 ส.ค. 2569" | "10 ตุลาคม 2569" → "2026-08-09" */
export function parseThaiDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = toArabicDigits(String(raw)).replace(/\s+/g, ' ').trim();

  // dd/mm/yyyy หรือ dd-mm-yyyy
  let m = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
  if (m) {
    const d = Number(m[1]), mo = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y += 2000;
    y = beToCeYear(y);
    if (isValidYmd(y, mo, d)) return fmt(y, mo, d);
  }

  // d <เดือนไทย> yyyy
  m = s.match(/(\d{1,2})\s+([ก-๙.]+)\s+(\d{4})/);
  if (m) {
    const d = Number(m[1]);
    const mo = THAI_MONTHS[m[2]];
    const y = beToCeYear(Number(m[3]));
    if (mo && isValidYmd(y, mo, d)) return fmt(y, mo, d);
  }

  // yyyy-mm-dd (ISO อยู่แล้ว)
  m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) {
    const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (isValidYmd(y, mo, d)) return fmt(y, mo, d);
  }
  return null;
}

function isValidYmd(y: number, mo: number, d: number) {
  return y >= 1990 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
}
function fmt(y: number, mo: number, d: number) {
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** ถอดจำนวนเงินจากข้อความ: "66,604.-" "1,234.50 บาท" "฿ 500" */
export function parseMoney(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const s = toArabicDigits(String(raw)).replace(/,/g, '');
  const m = s.match(/(\d+(?:\.\d{1,2})?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// ── คำอ่านจำนวนเงินไทย → ตัวเลข ("หกหมื่นหกพันหกร้อยสี่บาทถ้วน" = 66604) ─────────
//     สแกนแบบ "คำ" (ไม่ใช่ทีละตัวอักษร) เพราะคำไทยเป็นหลายพยางค์ — "หก"+"หมื่น" = 60000
const THAI_UNIT_WORDS: [string, number][] = [
  ['ล้าน', 1000000], ['แสน', 100000], ['หมื่น', 10000], ['พัน', 1000], ['ร้อย', 100], ['สิบ', 10],
];
const THAI_DIGIT_WORDS: [string, number][] = [
  ['ศูนย์', 0], ['หนึ่ง', 1], ['เอ็ด', 1], ['สอง', 2], ['ยี่', 2], ['สาม', 3], ['สี่', 4],
  ['ห้า', 5], ['หก', 6], ['เจ็ด', 7], ['แปด', 8], ['เก้า', 9],
];

export function thaiWordsToNumber(raw: string | null | undefined): number | null {
  if (!raw) return null;
  // ตัดช่องว่าง/อักขระล่องหน โดยไม่ใช้ regex (กันปัญหาการ escape ข้ามเครื่องมือ)
  const WBAD = ' \t\n\r' + String.fromCharCode(160) + String.fromCharCode(0x200b);
  let s = '';
  for (const c of String(raw)) if (!WBAD.includes(c)) s += c;
  if (!s) return null;
  if (s.includes('ศูนย์บาทถ้วน') && !THAI_UNIT_WORDS.some((u) => s.includes(u[0]))) return 0;

  const bIdx = s.indexOf('บาท');           // เอาเฉพาะส่วนจำนวน ไม่เอา "บาท"
  if (bIdx > -1) s = s.slice(0, bIdx);

  let total = 0, section = 0, last = 0, hasAny = false;
  for (let i = 0; i < s.length; i++) {
    let hit = false;
    for (const [w, v] of THAI_UNIT_WORDS) {
      if (s.startsWith(w, i)) {
        if (w === 'ล้าน') { total = (total + section + last) * 1000000; section = 0; last = 0; }
        else { section += (last || 1) * v; last = 0; }   // "สิบ" เดี่ยว = 10 · "ยี่สิบ" = 20 · "หกหมื่น" = 60000
        i += w.length - 1; hasAny = true; hit = true; break;
      }
    }
    if (hit) continue;
    for (const [w, v] of THAI_DIGIT_WORDS) {
      if (s.startsWith(w, i)) { last = v; i += w.length - 1; hasAny = true; break; }
    }
  }
  const value = total + section + last;    // บวกหลักหน่วยที่ไม่มีหน่วยตามหลัง
  return hasAny && value > 0 ? value : null;
}

// ── ตัวสกัดหลัก ────────────────────────────────────────────────────────────
export function parseReceipt(rawText: string, opts: { now?: Date } = {}): ParsedReceipt {
  const now = opts.now || new Date();
  const text = toArabicDigits(String(rawText || '')).replace(/\u00A0/g, ' ');
  const flat = text.replace(/\s+/g, ' ').trim();
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const issues: ParseIssue[] = [];
  const fields: Record<string, FieldMeta> = {};
  const set = (k: string, conf: number, note?: string) => { fields[k] = { confidence: conf, note }; };

  // 1) บริษัทผู้ออกเอกสาร
  let company: string | null = null;
  for (const k of KNOWN_INSURERS) {
    if (k.re.test(flat)) { company = k.name; break; }
  }
  if (!company) {
    const m = flat.match(/(?:บริษัท|บมจ\.|บจก\.)\s*[ก-๙A-Za-z0-9.\-()\s]{3,60}?(?:จำกัด|มหาชน|ประกัน|การเงิน|bank)/);
    if (m) company = m[0].replace(/\s+/g, ' ').trim();
  }
  const isKnownInsurer = !!company && KNOWN_INSURERS.some((k) => k.name === company);
  if (company) set('company', isKnownInsurer ? 0.97 : 0.6, isKnownInsurer ? 'รู้จักในทะเบียนบริษัทประกัน' : 'อ่านชื่อบริษัทได้ แต่ไม่อยู่ในทะเบียนที่ระบบยอมรับ');

  // 2) ประเภทเอกสาร
  let docType: DocType = 'unknown';
  if (/หนังสือรับรองการชำระเบี้ยประกันภัย|หนังสือรับรองการชำระเบี้ย/.test(flat)) docType = 'thai_life_premium_certificate';
  else if (/ใบเสร็จรับเงิน|ใบรับเงิน|receipt/i.test(flat) && /ประกัน/.test(flat)) docType = 'insurance_receipt';
  else if (/สลิป|โอนเงินสำเร็จ|รายการโอน|slip/i.test(flat) || /ธ\.?\s?(?:ไทยพาณิชย์|กสิกร|กรุงเทพ|กรุงไทย|กรุงศรี|ทหารไทย|ออมสิน|ทีเอ็มบี)/.test(flat)) docType = 'bank_slip';
  else if (/ภ\.ง\.ด\.|ใบกำกับภาษี|ภาษีหัก ณ ที่จ่าย/.test(flat)) docType = 'tax_document';
  set('docType', docType === 'unknown' ? 0.4 : 0.9);
  if (docType === 'unknown') issues.push({ code: 'DOC_TYPE_UNKNOWN', level: 'warn', message: 'ไม่รู้จักรูปแบบเอกสาร — ต้องให้เจ้าหน้าที่ตรวจ' });

  // 3) รหัสแบบฟอร์ม เช่น "(1200)" ของไทยประกันชีวิต
  const formCode = (flat.match(/\((1[0-9]{3})\)/) || [])[1] || null;
  if (formCode) set('formCode', 0.9, 'รหัสแบบฟอร์มบริษัท');

  // 4) เลขประจำตัวผู้เสียภาษี 13 หลัก
  const taxM = flat.match(/เลขประจำตัวผู้เสียภาษี(?:อากร)?\s*:?\s*(\d[\d\-\s]{11,17}\d)/);
  const taxRaw = taxM ? taxM[1].replace(/\D/g, '').slice(0, 13) : null;
  const { masked: taxIdMasked, last4: taxIdLast4 } = maskDigits(taxRaw); // PDPA: ปิดบังทันที
  if (taxIdLast4) set('taxIdLast4', 0.85, 'เก็บเฉพาะ 4 ตัวท้ายตามนโยบาย PDPA');
  else if (taxM) issues.push({ code: 'TAX_ID_LENGTH', level: 'warn', message: 'เลขประจำตัวผู้เสียภาษีไม่ครบ 13 หลัก' });

  // 5) เลขที่กรมธรรม์
  let policyNo: string | null = null;
  let m = flat.match(/กรมธรรม์(?:ประกันภัย)?เลขที่\s*:?\s*([A-Za-z0-9\-\/]{5,20})/);
  if (m) policyNo = m[1].replace(/[^\w\-\/]/g, '').toUpperCase();
  if (!policyNo) {
    m = flat.match(/\เลขที่กรมธรรม์\s*:?\s*([A-Za-z0-9\-\/]{5,20})/);
    if (m) policyNo = m[1].toUpperCase();
  }
  if (policyNo) set('policyNo', 0.95, 'อ่านจากคำว่า "กรมธรรม์...เลขที่"');

  // 6) เลขที่ใบเสร็จ — ไทยประกันชีวิตขึ้นต้น C ตามด้วยเลข (เช่น C8009159)
  let receiptNo: string | null = null;
  m = flat.match(/เลขที่ใบเสร็จ[^\dA-Za-z]{0,12}([A-Za-z]{0,2}\d{5,12})/);
  if (m) receiptNo = m[1].toUpperCase();
  if (!receiptNo) {
    m = flat.match(/\b([A-Z]\d{6,10})\b/); // เทมเพลตไทยประกันชีวิต: C8009159
    if (m) receiptNo = m[1];
  }
  if (receiptNo) set('receiptNo', m && /^[A-Z]\d{6,10}$/.test(receiptNo) ? 0.92 : 0.8);

  // 7) เลขที่อ้างอิง/ธุรกรรม (สลิปธนาคาร)
  m = flat.match(/(?:เลขที่รายการ|เลขที่อ้างอิง|รหัสอ้างอิง|Ref(?:erence)?(?:\s*No\.?)?|Trans(?:action)?\s*(?:ID|No\.?))\s*:?\s*([A-Za-z0-9]{6,30})/i);
  const transactionRef = m ? m[1].toUpperCase() : null;
  if (transactionRef) set('transactionRef', 0.85);

  // 8) งวดที่ / วิธีชำระ / วันที่ชำระ — เทมเพลตไทยประกันชีวิต: "01/01 รายปี C8009159 09/08/2569 66,604.-0.-0.-66,604.-"
  const rowRe = /(\d{2}\/\d{2})\s+(รายปี|ราย\s?6\s?เดือน|ราย\s?3\s?เดือน|รายเดือน|รายไตรมาส|งวดเดียว)[^\d]{0,24}?([A-Za-z]{0,2}\d{5,12})?\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/;
  const row = flat.match(rowRe);
  let installmentLabel: string | null = null;
  let paymentMethod: string | null = null;
  let paidAt: string | null = null;
  if (row) {
    installmentLabel = row[1];
    paymentMethod = row[2].replace(/\s+/g, ' ');
    if (!receiptNo && row[3]) { receiptNo = row[3].toUpperCase(); set('receiptNo', 0.9, 'อ่านจากแถวรายการชำระ (ปีที่/งวดที่)'); }
    paidAt = parseThaiDate(row[4]);
    if (paidAt) set('paidAt', 0.93, 'อ่านจากคอลัมน์วันที่ชำระเงิน');
  }
  if (!paidAt) {
    m = flat.match(/(?:วันที่ชำระเงิน|วันที่ชำระ|ชำระเมื่อ|วันที่ทำรายการ|Date)\s*:?\s*([0-9]{1,2}[\/\-\.][0-9]{1,2}[\/\-\.][0-9]{2,4})/i);
    paidAt = m ? parseThaiDate(m[1]) : null;
    if (paidAt) set('paidAt', 0.85);
  }
  if (installmentLabel) set('installmentLabel', 0.9);
  if (paymentMethod) set('paymentMethod', 0.85);

  // 9) ยอดเงิน — ตัวเลขในแถวรายการ (เบี้ยประกันชีวิต / สุขภาพ / สัญญาเพิ่มเติม / รวม)
  let amountLife: number | null = null, amountHealth: number | null = null, amountRider: number | null = null, amountTotal: number | null = null;
  // รูปแบบไทยประกันชีวิต: "66,604.-0.-0.-66,604.-" (สี่ช่องติดกัน)
  const quad = flat.match(/(\d[\d,]*\.-)\s*(\d[\d,]*\.-)\s*(\d[\d,]*\.-)\s*(\d[\d,]*\.-)/);
  if (quad) {
    amountLife = parseMoney(quad[1]); amountHealth = parseMoney(quad[2]); amountRider = parseMoney(quad[3]); amountTotal = parseMoney(quad[4]);
    set('amountTotal', 0.95, 'อ่านจากคอลัมน์ "เบี้ยประกันภัยรวม"');
    set('amountLife', 0.9); set('amountHealth', 0.9); set('amountRider', 0.9);
  }
  // "รวมเบี้ยประกันภัย จำนวน 66,604.-0.-0.-66,604.-" หรือ "รวมเบี้ยประกันภัย 66,604"
  if (amountTotal === null) {
    m = flat.match(/รวมเบี้ยประกันภัย[^\d]{0,24}([\d,]+(?:\.\d{1,2})?)/);
    if (m) { amountTotal = parseMoney(m[1]); set('amountTotal', 0.88, 'อ่านจากบรรทัด "รวมเบี้ยประกันภัย"'); }
  }
  if (amountTotal === null) {
    m = flat.match(/(?:ยอดชำระ|ยอดโอน|จำนวนเงิน|ยอดรวม|total|amount)\s*:?\s*(?:฿|THB)?\s*([\d,]+(?:\.\d{1,2})?)/i);
    if (m) { amountTotal = parseMoney(m[1]); set('amountTotal', 0.8, 'อ่านจากป้ายยอดเงิน'); }
  }
  if (amountTotal === null) {
    // ท้ายที่สุด: ตัวเลขที่มีทศนิยม/คอมมา มากที่สุดในเอกสาร ( heuristic สำรอง )
    const cands = [...flat.matchAll(/(\d{1,3}(?:,\d{3})+(?:\.\d{2})?)/g)].map((x) => parseMoney(x[1])).filter((n): n is number => !!n);
    if (cands.length) { amountTotal = Math.max(...cands); set('amountTotal', 0.5, 'ไม่พบป้ายยอดเงินชัดเจน — ใช้ค่ามากที่สุดที่พบ (ต้องตรวจเอง)'); }
  }

  // 10) คำอ่านจำนวนเงิน → ตรวจไขว้กับตัวเลข
  let amountInWords: string | null = null;
  let amountFromWords: number | null = null;
  // 10) คำอ่านจำนวนเงิน → ตรวจไขว้กับยอดตัวเลข
  //     ใช้การตัดสตริงแทน regex เพื่อไม่พึ่งการ escape ใด ๆ
  {
    const wi2 = flat.indexOf('บาทถ้วน');
    if (wi2 > -1) {
      const open = flat.lastIndexOf('(', wi2);
      amountInWords = open > -1 && wi2 - open <= 120
        ? flat.slice(open + 1, wi2)
        : flat.slice(Math.max(0, wi2 - 60), wi2);
      amountFromWords = thaiWordsToNumber(amountInWords);
      if (amountFromWords !== null) set('amountInWords', 0.9, 'ใช้ตรวจไขว้กับยอดตัวเลข');
    }
  }

  // ── ตรวจไขว้ (cross-validation) ─────────────────────────────────────────
  if (docType === 'thai_life_premium_certificate') {
    if (amountTotal === null) issues.push({ code: 'NO_AMOUNT', level: 'error', field: 'amountTotal', message: 'อ่านยอดเบี้ยประกันภัยรวมไม่ได้' });
    if (amountTotal !== null && amountFromWords !== null && Math.abs(amountTotal - amountFromWords) > 0.5) {
      issues.push({
        code: 'AMOUNT_WORDS_MISMATCH', level: 'error', field: 'amountTotal',
        message: `ยอดตัวเลข (${amountTotal.toLocaleString('th-TH')}) ไม่ตรงกับคำอ่านจำนวนเงิน (${amountFromWords.toLocaleString('th-TH')}) — ต้องตรวจด้วยตา`,
      });
    }
    if (policyNo && policyNo.length < 6) issues.push({ code: 'POLICY_NO_SHORT', level: 'warn', field: 'policyNo', message: 'เลขที่กรมธรรม์สั้นผิดปกติ' });
    if (!receiptNo) issues.push({ code: 'NO_RECEIPT_NO', level: 'warn', field: 'receiptNo', message: 'ไม่พบเลขที่ใบเสร็จ — กันการนับยอดซ้ำไม่ได้ ต้องกรอกเอง' });
    if (!paidAt) issues.push({ code: 'NO_PAID_AT', level: 'warn', field: 'paidAt', message: 'ไม่พบวันที่ชำระเงิน' });
  }

  if (paidAt) {
    const d = new Date(`${paidAt}T00:00:00Z`);
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const diffDays = Math.round((today.getTime() - d.getTime()) / 86400000);
    if (diffDays < -1) issues.push({ code: 'PAID_AT_FUTURE', level: 'error', field: 'paidAt', message: `วันที่ชำระ (${paidAt}) เป็นอนาคต — เอกสารไม่สมเหตุสมผล` });
    else if (diffDays > 400) issues.push({ code: 'PAID_AT_OLD', level: 'warn', field: 'paidAt', message: `วันที่ชำระ (${paidAt}) เก่ากว่า 400 วัน — ต้องดูเงื่อนไขช่วงเวลานับผลงาน` });
  } else {
    issues.push({ code: 'NO_PAID_AT_ANY', level: 'error', field: 'paidAt', message: 'ไม่พบวันที่ชำระเงินทั้งฉบับ' });
  }

  if (!isKnownInsurer) {
    issues.push({ code: 'UNKNOWN_ISSUER', level: 'error', field: 'company', message: 'ผู้ออกเอกสารไม่ใช่บริษัทประกันในทะเบียนที่ระบบยอมรับ' });
  }
  if (docType === 'bank_slip') {
    issues.push({ code: 'SLIP_NEEDS_POLICY', level: 'warn', message: 'สลิปโอนเงินเพียงอย่างเดียวพิสูจน์กรมธรรม์ไม่ได้ — ต้องแนบหนังสือรับรองการชำระเบี้ยของบริษัท' });
  }

  // 11) ชื่อบุคคล — PDPA: ระบบเก็บแบบปิดบัง (mask) อยู่แล้วที่ชั้น API
  m = flat.match(/เรียน\s+((?:น\.ส\.|นาง|นาย|นางสาว|ด\.ช\.|ด\.ญ\.)?\s*[ก-๙]{2,30}(?:\s+[ก-๙]{2,30}){0,2})/);
  // PDPA: ปิดบังชื่อทันทีในตัวสกัด — ชื่อเต็มไม่เคยถูกคืนออกจากฟังก์ชันนี้
  const insuredNameMasked = m ? maskPersonName(m[1]) : null;
  if (insuredNameMasked) set('insuredNameMasked', 0.85, 'อ่านจากคำขึ้นต้น "เรียน ..." แล้วปิดบังทันที');
  m = flat.match(/(?:ผู้จ่าย|ผู้ชำระ|payer|customer name)\s*:?\s*([ก-๙A-Za-z][ก-๙A-Za-z.\s]{2,40})/i);
  const payerNameMasked = m ? maskPersonName(m[1]) : insuredNameMasked;
  if (payerNameMasked) set('payerNameMasked', m ? 0.85 : 0.6);

  m = flat.match(/(?:รหัสตัวแทน|รหัสผู้แนะนำ|agent\s*code)\s*:?\s*([A-Za-z0-9\-]{3,20})/i);
  const agentCode = m ? m[1] : null;
  if (agentCode) set('agentCode', 0.85);

  const bankM = flat.match(/(ธ\.?\s?ไทยพาณิชย์|ธ\.?\s?กสิกรไทย|ธ\.?\s?กรุงเทพ|ธ\.?\s?กรุงไทย|ธ\.?\s?กรุงศรีอยุธยา|ธ\.?\s?ทหารไทย|ธนาคารออมสิน|ธนาคารอาคารสงเคราะห์|TMB|SCB|KBANK|BBL|KTB|BAY|GSB)/i);
  const bank = bankM ? bankM[1] : null;
  if (bank) set('bank', 0.85);

  // 12) แบบประกัน + ระยะเวลาเอาประกัน
  const planM = flat.match(/แบบ\s+([^()]{2,60}?)\s*(?:\(|ระยะเวลาเอาประกันภัย|$)/);
  const planName = planM ? planM[1].trim() : null;
  if (planName) set('planName', 0.8);
  const termM = flat.match(/ระยะเวลาเอาประกันภัย\s*(\d{1,3})\s*ปี/);
  const policyTermYears = termM ? Number(termM[1]) : null;
  if (policyTermYears) set('policyTermYears', 0.9);

  // 13) วันที่ออกหนังสือ
  const issuedAt = parseThaiDate(lines.find((l) => /^\d{1,2}\s+[ก-๙.]+\s+\d{4}$/.test(l)) || null);
  if (issuedAt) set('issuedAt', 0.85);

  // ── ภาพรวมความมั่นใจ + ผลต่อเครือข่าย 1 แตก 5 ─────────────────────────────
  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');
  const keyFields = ['company', 'receiptNo', 'policyNo', 'paidAt', 'amountTotal'];
  const have = keyFields.filter((k) => fields[k] && fields[k].confidence >= 0.8).length;
  let confidence = have / keyFields.length;
  confidence = Math.max(0, Math.min(1, confidence - errors.length * 0.15 - warns.length * 0.04));
  if (isKnownInsurer && amountTotal !== null) confidence = Math.max(confidence, 0.5);

  const dedupKey = company && receiptNo && policyNo
    ? `${company}|${receiptNo}|${policyNo}|${paidAt || ''}`
    : company && receiptNo ? `${company}|${receiptNo}|${paidAt || ''}` : null;
  if (!dedupKey) issues.push({ code: 'NO_DEDUP_KEY', level: 'warn', message: 'ไม่มีเลขที่ใบเสร็จ+กรมธรรม์ — กันนับซ้ำไม่ได้ (ต้องให้เจ้าหน้าที่ตรวจ)' });

  const countsToward1x5 = errors.length === 0 && amountTotal !== null && amountTotal > 0 && !!paidAt && !!dedupKey;
  const network: NetworkImpact = {
    countsToward1x5,
    verifiedAmount: countsToward1x5 ? (amountTotal as number) : 0,
    reason: countsToward1x5
      ? `นับยอด ฿${(amountTotal as number).toLocaleString('th-TH')} เข้าผลงาน (รอการยืนยันจากระบบตรวจสอบ)`
      : `ยังนับยอดไม่ได้: ${[...errors, ...warns].slice(0, 3).map((i) => i.message).join(' · ') || 'ข้อมูลไม่ครบ'}`,
  };

  return {
    docType, company, isKnownInsurer, formCode, taxIdMasked, taxIdLast4,
    branch: null,
    receiptNo, transactionRef, policyNo, planName, policyTermYears,
    installmentLabel, paymentMethod, paidAt, issuedAt,
    amountTotal, amountLife, amountHealth, amountRider,
    amountInWords, amountFromWords,
    payerNameMasked, insuredNameMasked, agentCode, bank,
    fields, issues, confidence, needsManualReview: confidence < 0.75 || errors.length > 0,
    dedupKey, network, piiPolicy: 'masked_only',
  };
}

/** สรุปสำหรับเจ้าหน้าที่/สมาชิก (ข้อความไทยสั้น อ่านรู้เรื่อง) */
export function summarizeParsed(p: ParsedReceipt): string {
  const f = (n: number | null) => (n === null ? '—' : n.toLocaleString('th-TH'));
  const lines = [
    `ประเภทเอกสาร: ${p.docType}`,
    `บริษัท: ${p.company || '—'}${p.isKnownInsurer ? ' ✓ ในทะเบียน' : ' ⚠ ไม่อยู่ในทะเบียน'}`,
    `เลขที่ใบเสร็จ: ${p.receiptNo || '—'} · กรมธรรม์: ${p.policyNo || '—'} · งวด: ${p.installmentLabel || '—'} (${p.paymentMethod || '—'})`,
    `วันที่ชำระ: ${p.paidAt || '—'} · ยอดรวม: ฿${f(p.amountTotal)}`,
    `ตรวจไขว้กับคำอ่านจำนวนเงิน: ${p.amountFromWords === null ? 'ไม่มีข้อมูล' : p.amountFromWords === p.amountTotal ? 'ตรงกัน ✓' : `ไม่ตรง (อ่านได้ ฿${f(p.amountFromWords)}) ✗`}`,
    `ความมั่นใจรวม: ${(p.confidence * 100).toFixed(0)}%${p.needsManualReview ? ' — ต้องตรวจด้วยตา' : ''}`,
    `ผลต่อเครือข่าย 1 แตก 5: ${p.network.reason}`,
    `PDPA: ${p.insuredNameMasked ? `ผู้เอาประกัน ${p.insuredNameMasked} (ปิดบัง)` : 'ไม่แสดงชื่อบุคคล'}`,
  ];
  if (p.issues.length) lines.push('ข้อสังเกต: ' + p.issues.map((i) => `[${i.level}] ${i.message}`).join(' | '));
  return lines.join('\n');
}
