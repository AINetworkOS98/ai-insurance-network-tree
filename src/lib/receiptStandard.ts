// lib/receiptStandard.ts — "มาตรฐานใบเสร็จ" ที่ระบบยึดถือตอนสมาชิกสแกนเข้าร่วมโครงการ
//
// อ้างอิงจริง: ใบเสร็จ/สลิป "จ่ายบิลสำเร็จ" ของช่องทางรับชำระเบี้ย บมจ.ไทยประกันชีวิต
//   ตัวอย่างจริง: แอป ธ.ก.ส. (Essence of Agriculture) — 09 ส.ค. 2569 16:00:41, ยอด 66,604.00 บาท
//   ฟิลด์ที่ต้องมี: ผู้ออก/ผู้รับเงิน (ไทยประกันชีวิต) · เลขใบเสร็จ · เลขอ้างอิงรายการ · ยอดเงิน · วันที่ · รหัสตัวแทน
//   *ไฟล์ตัวอย่างห้ามเก็บข้อมูลส่วนบุคคล (ชื่อ/เลขบัญชีผู้ชำระ) ตาม PDPA — เก็บเฉพาะ "โครงสร้าง" เท่านั้น
//
// ใช้ร่วมกันทุกเส้นทาง (สแกน/อัปโหลด/ตรวจรับรอง) ให้ทั้งระบบตัดสินด้วยมาตรฐานเดียวกัน

export const RECEIPT_STANDARD = {
  version: 'thailife-premium-receipt-v1',
  title: 'ใบเสร็จ/สลิปชำระเบี้ยประกันชีวิต (บมจ.ไทยประกันชีวิต)',
  acceptedChannels: [
    'ธ.ก.ส. (BAAC) — จ่ายบิลสำเร็จ / Essence of Agriculture',
    'แอป/เว็บธนาคาร — จ่ายบิล บมจ.ไทยประกันชีวิต',
    'เคาน์เตอร์รับชำระ / ตัวแทนรับเงิน (ใบรับเงินชั่วคราว)',
  ],
  // ผู้ออก/ผู้รับเงินต้องตรงกับบริษัทที่โครงการรับ (ตรวจแบบไม่สนตัวพิมพ์/ช่องว่าง)
  issuerMustMatch: ['ไทยประกันชีวิต', 'ไทยประกัน', 'thai life', 'thailife', 'thai-life'],
  // ฟิลด์บังคับ — ถ้าขาดข้อใด ใบเสร็จนั้นใช้ยืนยันการเข้าร่วม/ขึ้นตำแหน่งไม่ได้
  required: [
    { key: 'amount', label: 'ยอดเงินที่ชำระ (บาท)' },
    { key: 'paidAt', label: 'วันที่ชำระ' },
    { key: 'receiptRef', label: 'เลขใบเสร็จ หรือ เลขอ้างอิงรายการ' },
    { key: 'issuer', label: 'ผู้ออก/ผู้รับเงิน (บมจ.ไทยประกันชีวิต)' },
  ],
  // ฟิลด์ที่ควรมี (ถ้าขาด = เตือน ไม่บล็อก) — รหัสตัวแทนใช้ผูกผลงานเข้ากับตัวแทนเจ้าของใบ
  recommended: [
    { key: 'agentCode', label: 'รหัสตัวแทน/เลขที่กร.' },
    { key: 'policyNo', label: 'เลขกรมธรรม์' },
  ],
  // ยอดขั้นต่ำที่ถือว่าเป็นหลักฐานการเข้าร่วมจริง (ต่ำกว่านี้ = ต้องตรวจด้วยคน)
  minAmount: 100,
  // กติกาความมั่นใจ OCR: ต่ำกว่านี้ต้องให้คนตรวจทานก่อนใช้เป็นหลักฐาน
  minConfidenceForAuto: 0.8,
} as const;

export interface StandardCheck {
  ok: boolean;                 // ตรงมาตรฐานครบพอใช้เป็นหลักฐานได้
  version: string;
  missing: string[];           // ฟิลด์บังคับที่ขาด
  warnings: string[];          // ข้อควรระวัง (ไม่บล็อก)
  issuerMatched: boolean;
  summary: string;
}

type ExtLike = {
  issuerName?: string | null;
  companyName?: string | null;
  receiverName?: string | null;
  amount?: string | number | null;
  paidAt?: string | Date | null;
  receiptNo?: string | null;
  transactionRef?: string | null;
  agentCode?: string | null;
  policyNo?: string | null;
  confidence?: any;
};

const norm = (v: any) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, '');

/** ตรวจว่า "ผู้ออก/ผู้รับเงิน" ตรงกับบริษัทที่โครงการรับหรือไม่ */
export function issuerMatches(ext: ExtLike): boolean {
  const hay = norm(`${ext.issuerName || ''}${ext.companyName || ''}${ext.receiverName || ''}`);
  if (!hay) return false;
  return RECEIPT_STANDARD.issuerMustMatch.some((k) => hay.includes(norm(k)));
}

/** ตรวจใบเสร็จกับมาตรฐานที่ยึดถือ — ใช้ทั้งตอนสแกนเข้าและตอนรับรองยอด */
export function checkReceiptStandard(ext: ExtLike | null | undefined): StandardCheck {
  const missing: string[] = [];
  const warnings: string[] = [];
  if (!ext) {
    return { ok: false, version: RECEIPT_STANDARD.version, missing: RECEIPT_STANDARD.required.map((r) => r.label), warnings: ['ยังไม่มีข้อมูลที่อ่านได้จากใบเสร็จ'], issuerMatched: false, summary: 'ยังไม่มีข้อมูลใบเสร็จ' };
  }

  const amount = Number(String(ext.amount ?? '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) missing.push(RECEIPT_STANDARD.required[0].label);
  else if (amount < RECEIPT_STANDARD.minAmount) warnings.push(`ยอด ${amount.toLocaleString()} บาท ต่ำกว่าขั้นต่ำที่ถือเป็นหลักฐาน (${RECEIPT_STANDARD.minAmount}) — ต้องตรวจด้วยคน`);

  if (!ext.paidAt) missing.push(RECEIPT_STANDARD.required[1].label);

  const ref = `${ext.receiptNo || ''}${ext.transactionRef || ''}`.trim();
  if (!ref) missing.push(RECEIPT_STANDARD.required[2].label);

  const issuerMatched = issuerMatches(ext);
  if (!issuerMatched) missing.push(RECEIPT_STANDARD.required[3].label);

  if (!ext.agentCode) warnings.push(`ไม่มี${RECEIPT_STANDARD.recommended[0].label} — ต้องระบุผู้รับผลงานเอง`);
  if (!ext.policyNo) warnings.push(`ไม่มี${RECEIPT_STANDARD.recommended[1].label} — ตรวจกับรายงานรับเงินเพิ่ม`);

  const conf = Number(ext.confidence?.overall ?? 0);
  if (conf < RECEIPT_STANDARD.minConfidenceForAuto) warnings.push(`ความมั่นใจ OCR ${(conf * 100).toFixed(0)}% — ต่ำกว่าเกณฑ์รับรองอัตโนมัติ ${RECEIPT_STANDARD.minConfidenceForAuto * 100}%`);

  const ok = missing.length === 0;
  const summary = ok
    ? `ตรงมาตรฐาน ${RECEIPT_STANDARD.version} — ใช้ยืนยันการเข้าร่วม/ขึ้นตำแหน่งได้` + (warnings.length ? ` (มีข้อควรระวัง ${warnings.length} ข้อ)` : '')
    : `ไม่ตรงมาตรฐาน ${RECEIPT_STANDARD.version} — ขาด: ${missing.join(', ')}`;
  return { ok, version: RECEIPT_STANDARD.version, missing, warnings, issuerMatched, summary };
}
