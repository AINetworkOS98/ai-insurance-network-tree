import { NextResponse } from 'next/server';
import { extractReceiptData, OCRError } from '@/lib/ocr';
import { parseReceipt, summarizeParsed, type ParsedReceipt } from '@/lib/receipts/thaiLifeReceipt';

export const runtime = 'nodejs';
export const maxDuration = 60;

// ระบบสแกนใบเสร็จแบบ "ตรวจกติกา" (strong scan)
//   ขั้น 1: โมเดลภาพถอดข้อความ (transcription) — ไม่ตัดสินตัวเลขเอง
//   ขั้น 2: ตัวตรวจกติกาสกัดตัวเลข/วันที่/เลขที่ใบเสร็จ + ตรวจไขว้ (ยอดตัวเลข vs คำอ่านจำนวนเงิน)
//   ขั้น 3: คืนผลให้หน้าเว็บ + ตัวบ่งชี้ผลต่อเครือข่าย 1 แตก 5
// ⛔ PDPA: ไม่บันทึกและไม่คืนข้อความดิบ/ข้อมูลส่วนบุคคลของลูกค้า (ชื่อเต็ม/เลขภาษี/ที่อยู่)
//    คืนได้เฉพาะข้อมูลธุรกรรม + ชื่อแบบปิดบัง (ตัวสกัดปิดบังให้แล้วในตัว)

const MAX_SIZE = 4 * 1024 * 1024; // 4MB (ข้อจำกัด body ของ Vercel)
const ALLOWED = /^(image\/(jpeg|png|webp)|application\/pdf)$/i;

function pick<T>(primary: T | null | undefined, fallback: T | null | undefined): T | null {
  return (primary === null || primary === undefined || primary === '') ? (fallback ?? null) : primary;
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file') as File | null;

    if (!file) return NextResponse.json({ success: false, error: 'ไม่พบไฟล์ที่อัปโหลด' }, { status: 400 });
    if (!ALLOWED.test(file.type)) {
      return NextResponse.json({ success: false, error: 'รองรับเฉพาะ JPG / PNG / WEBP / PDF' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: 'ไฟล์ใหญ่เกิน 4MB กรุณาลดขนาดไฟล์' }, { status: 413 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const base64 = buf.toString('base64');

    // ขั้น 1: ถอดข้อความ (ยอมให้ยอดเงินอ่านไม่ได้ เพราะตัวตรวจกติกาจะชี้จุดผิดให้แทนการล้มทั้งงาน)
    const ocr = await extractReceiptData(base64, file.type, { allowMissingAmount: true });
    const plain = (ocr.plainText || '').trim();

    // ขั้น 2: ตรวจกติกาแบบกำหนดได้ (deterministic) จากข้อความที่ถอดมา
    let parsed: ParsedReceipt | null = null;
    if (plain) parsed = parseReceipt(plain);

    // ถ้าตัวตรวจกติกาอ่านไม่ได้เลย (ข้อความสั้น/โมเดลไม่ได้คืน plainText) → ใช้ค่าจากโมเดลเป็นสำรอง
    const field = {
      company: pick(parsed?.company, ocr.companyName || ocr.receiverName),
      receiptNo: pick(parsed?.receiptNo, ocr.receiptNumber),
      policyNo: pick(parsed?.policyNo, ocr.policyNo),
      transactionRef: pick(parsed?.transactionRef, ocr.referenceNumber),
      paidAt: pick(parsed?.paidAt, ocr.date),
      amount: pick(parsed?.amountTotal, ocr.amount),
      installmentLabel: parsed?.installmentLabel ?? null,
      paymentMethod: parsed?.paymentMethod ?? null,
      docType: parsed?.docType ?? ocr.documentType ?? 'unknown',
    };

    // สรุปสำหรับผู้ใช้ (มีแต่ค่าที่ปิดบังแล้ว) — ไม่มีชื่อเต็ม/เลขภาษีในผลลัพธ์นี้
    const summary = parsed ? summarizeParsed(parsed) : `อ่านเอกสารได้บางส่วน (${ocr.provider}) — โปรดตรวจด้วยตา`;

    const countsToward1x5 = parsed
      ? parsed.network.countsToward1x5
      : field.amount !== null && field.amount > 0 && !!field.paidAt;

    const confidence = parsed ? parsed.confidence : ocr.confidence;

    return NextResponse.json({
      success: true,
      // ชื่อช่องแบบเดิมที่หน้าเว็บใช้อยู่ (amount/date/receiptNumber/...) เพื่อไม่ให้ของเดิมพัง
      amount: field.amount,
      currency: 'THB',
      date: field.paidAt,
      referenceNumber: field.transactionRef,
      receiptNumber: field.receiptNo,
      policyNo: field.policyNo,
      companyName: field.company,
      receiverName: field.company,
      documentType: field.docType,
      provider: ocr.provider,
      confidence,
      status: confidence >= 0.8 && !(parsed?.needsManualReview ?? true) ? 'อ่านข้อมูลสำเร็จ' : 'ต้องตรวจสอบด้วยตนเอง',
      needsManualReview: parsed ? parsed.needsManualReview : confidence < 0.8,
      companyWarning: field.company && /ประกัน/.test(field.company)
        ? null
        : 'ไม่พบชื่อบริษัทประกันที่ระบบยอมรับ — โปรดตรวจเอกสารว่าเป็นหนังสือรับรองการชำระเบี้ยของบริษัทประกัน',
      // ผลการตรวจกติกา (หัวใจของระบบสแกนที่แข็งแรง)
      verification: {
        piiPolicy: 'masked_only' as const,
        summary,
        issues: parsed?.issues ?? [],
        fields: parsed?.fields ?? {},
        amountCrossCheck: {
          digits: parsed?.amountTotal ?? null,
          words: parsed?.amountFromWords ?? null,
          matched: parsed?.amountTotal !== null && parsed?.amountTotal === parsed?.amountFromWords,
        },
        installmentLabel: field.installmentLabel,
        paymentMethod: field.paymentMethod,
        planName: parsed?.planName ?? null,
        policyTermYears: parsed?.policyTermYears ?? null,
        insuredNameMasked: parsed?.insuredNameMasked ?? null,
        taxIdMasked: parsed?.taxIdMasked ?? null,
        dedupKey: parsed?.dedupKey ?? null,
        network: {
          countsToward1x5,
          verifiedAmount: parsed ? parsed.network.verifiedAmount : (countsToward1x5 ? Number(field.amount) : 0),
          reason: parsed ? parsed.network.reason : 'อ่านเอกสารได้เพียงบางส่วน — ยังไม่นับยอดเข้าเครือข่าย',
        },
      },
      // หมายเหตุ: ไม่คืนข้อความดิบ (plainText/rawText) และไม่บันทึกข้อมูลส่วนบุคคล (PDPA)
      privacy: 'ไม่เก็บข้อความดิบและข้อมูลส่วนบุคคลของลูกค้าในระบบ',
    });
  } catch (e: any) {
    if (e instanceof OCRError) {
      return NextResponse.json({ success: false, error: e.thaiMessage, code: e.code }, { status: e.status });
    }
    console.error('[api/ocr]', e?.message || e);
    return NextResponse.json({ success: false, error: 'เกิดข้อผิดพลาดในการอ่านเอกสาร กรุณาลองใหม่' }, { status: 500 });
  }
}
