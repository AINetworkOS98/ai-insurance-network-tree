// receipt-scan-selftest.mjs — ชุดทดสอบระบบสแกนใบเสร็จ (ตัวตรวจกติกา)
// วิธีรัน:
//   1) npx tsc src/lib/receipts/thaiLifeReceipt.ts --outDir <โฟลเดอร์>/lib --target es2022 --module esnext --skipLibCheck --moduleResolution bundler
//   2) node scripts/receipt-scan-selftest.mjs <ไฟล์ข้อความที่สกัดจากเอกสาร.txt>
//      (ข้อความจาก PDF ที่มี text layer ไทย ให้ใช้ตัวสกัดของ Hermes/OCR เพราะ pdftotext ตัดฟอนต์ไทยทิ้ง)
// ครอบคลุม: เอกสารจริงไทยประกันชีวิต · ตรวจ PDPA (ห้ามมีชื่อ/เลขภาษี/ที่อยู่) · ตรวจไขว้ยอดเงิน · สลิปธนาคาร · คำอ่านจำนวนเงินไทย

import { readFileSync } from 'node:fs';
const { parseReceipt, summarizeParsed } = await import('../scratch-lib/thaiLifeReceipt.js');
const real = readFileSync(process.argv[2], 'utf8');
let fail = 0;
const check = (name, cond, extra='') => { console.log(`${cond ? 'PASS' : 'FAIL'} · ${name}${extra ? ' — ' + extra : ''}`); if(!cond) fail++; };

// ── เคส 1: เอกสารจริง (หนังสือรับรองการชำระเบี้ย ไทยประกันชีวิต) ──
const p1 = parseReceipt(real);
console.log('\n=== สรุปจากเอกสารจริง ===\n' + summarizeParsed(p1) + '\n');
check('อ่านบริษัทถูก', p1.company === 'บริษัท ไทยประกันชีวิต จำกัด (มหาชน)');
check('อยู่ในทะเบียนประกัน', p1.isKnownInsurer === true);
check('เลขที่ใบเสร็จ = C8009159', p1.receiptNo === 'C8009159', String(p1.receiptNo));
check('เลขกรมธรรม์ = 87466125', p1.policyNo === '87466125', String(p1.policyNo));
check('วันที่ชำระ = 2026-08-09 (พ.ศ. 2569 → ค.ศ.)', p1.paidAt === '2026-08-09', String(p1.paidAt));
check('ยอดรวม = 66604', p1.amountTotal === 66604, String(p1.amountTotal));
check('คำอ่านจำนวนเงิน → 66604 (ตรงกับตัวเลข)', p1.amountFromWords === 66604, String(p1.amountFromWords));
check('งวด 01/01 · รายปี', p1.installmentLabel === '01/01' && p1.paymentMethod === 'รายปี', `${p1.installmentLabel}/${p1.paymentMethod}`);
check('แบบประกัน + ระยะเวลา 35 ปี', !!p1.planName && p1.policyTermYears === 35, `${p1.planName}/${p1.policyTermYears}`);
check('นับยอดเข้าเครือข่าย 1 แตก 5', p1.network.countsToward1x5 === true && p1.network.verifiedAmount === 66604);
check('ไม่ต้องตรวจด้วยตา', p1.needsManualReview === false, `conf=${(p1.confidence*100).toFixed(0)}%`);
check('ไม่มี error', p1.issues.filter(i=>i.level==='error').length === 0, JSON.stringify(p1.issues));

// ── PDPA: ยืนยันว่าไม่มีข้อมูลส่วนบุคคลหลุดออกมา ──
const dump = JSON.stringify(p1);
console.log('\n=== ตรวจ PDPA ===');
check('ไม่มีเลขประจำตัวผู้เสียภาษีเต็ม 13 หลัก', !dump.includes('0107555000104'));
check('ไม่มีชื่อ-นามสกุลเต็ม', !dump.includes('อริสา') && !dump.includes('คูหา'));
check('ไม่มีที่อยู่ (ตำบล/อำเภอ)', !dump.includes('แคราย') && !dump.includes('กระทุ่มแบน'));
check('ชื่อถูกปิดบัง (มี *)', !!p1.insuredNameMasked && p1.insuredNameMasked.includes('*'), String(p1.insuredNameMasked));
check('เลขภาษีเหลือ 4 ตัวท้าย', p1.taxIdLast4 === '0104' && !/\d{13}/.test(dump), String(p1.taxIdMasked));
check('นโยบาย PII ระบุชัด', p1.piiPolicy === 'masked_only');

// ── เคส 2: ยอดตัวเลขไม่ตรงกับคำอ่าน (เอกสารถูกแก้) → ต้องไม่นับยอด ──
const tampered = real.replace('หกหมื่นหกพันหกร้อยสี่บาทถ้วน', 'เก้าหมื่นเก้าพันเก้าร้อยเก้าสิบบาทถ้วน');
const p2 = parseReceipt(tampered);
check('จับได้ว่ายอดตัวเลข ≠ คำอ่าน', p2.issues.some(i => i.code === 'AMOUNT_WORDS_MISMATCH'));
check('แก้ยอดแล้วไม่นับเข้าเครือข่าย', p2.network.countsToward1x5 === false);
check('ส่งเข้าคิวตรวจด้วยตา', p2.needsManualReview === true);

// ── เคส 3: สลิปโอนเงิน (ไม่มีกรมธรรม์) → เตือน + ไม่นับ ──
const slip = `ธ.ไทยพาณิชย์ โอนเงินสำเร็จ\nวันที่ทำรายการ 05/08/2569\nจำนวนเงิน 12,500.00 บาท\nเลขที่รายการ SCB20260805123456\nผู้จ่าย นายสมชาย ใจดี`;
const p3 = parseReceipt(slip);
check('รู้ว่าเป็นสลิปธนาคาร', p3.docType === 'bank_slip', p3.docType);
check('เตือนว่าสลิปอย่างเดียวไม่พอ', p3.issues.some(i => i.code === 'SLIP_NEEDS_POLICY'));
check('สลิปไม่นับยอดเข้าเครือข่าย', p3.network.countsToward1x5 === false);
check('สลิป: PDPA ปิดชื่อผู้จ่าย', !JSON.stringify(p3).includes('สมชาย'), String(p3.payerNameMasked));

// ── เคส 4: dedupKey คงที่ (กันนับยอดซ้ำ) ──
check('dedupKey มาจาก ใบเสร็จ+กรมธรรม์+วัน', p1.dedupKey === 'บริษัท ไทยประกันชีวิต จำกัด (มหาชน)|C8009159|87466125|2026-08-09', String(p1.dedupKey));
check('สแกนซ้ำได้คีย์เดิม', parseReceipt(real).dedupKey === p1.dedupKey);


// ── เคส 5: ตัวอ่านคำอ่านจำนวนเงินไทย (ตรวจตรง ๆ) ──
const { thaiWordsToNumber } = await import('../scratch-lib/thaiLifeReceipt.js');
[['หกหมื่นหกพันหกร้อยสี่', 66604], ['เก้าหมื่นเก้าพันเก้าร้อยเก้าสิบ', 99990], ['หนึ่งล้านสองแสนสามหมื่นสี่พันห้าร้อยหกสิบเจ็ด', 1234567], ['หนึ่งพันเอ็ด', 1001], ['สิบ', 10]].forEach(([w, exp]) => {
  const got = thaiWordsToNumber(w);
  check(`คำอ่าน "${w}" = ${exp}`, got === exp, String(got));
});

console.log(fail === 0 ? '\n✅ ผ่านทุกเคส' : `\n❌ ล้มเหลว ${fail} เคส`);
process.exit(fail === 0 ? 0 : 1);
