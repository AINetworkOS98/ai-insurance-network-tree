import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/firebase-admin';
import { randomUUID } from 'crypto';
import { verifyToken } from '@/lib/auth';
import { RECEIPT_STANDARD, checkReceiptStandard } from '@/lib/receiptStandard';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/documents/create-manual — "สร้างใบเสร็จ" ด้วยรหัสตัวแทนของตัวเอง
//   ใช้เมื่อตัวแทนออกใบเสร็จ/สลิปจาก app TL ProPlus บน iPad แล้วต้องการบันทึกเข้าเครือข่าย
//   ต่างจาก POST /api/documents (สแกน/อัปโหลดไฟล์): เส้นนี้ไม่ต้องมีไฟล์ แต่ต้องกรอก
//   ฟิลด์บังคับตามมาตรฐานใบเสร็จ (src/lib/receiptStandard.ts):
//     ยอดเงิน · วันที่ชำระ · เลขใบเสร็จหรือเลขอ้างอิงรายการ · ผู้ออก = บมจ.ไทยประกันชีวิต
//   และผูก "รหัสตัวแทน" (agentCode) เข้ากับใบเสร็จเป็นเจ้าของผลงาน
//
// ★ ความซื่อสัตย์ของตัวเลข: ใบเสร็จที่สร้างเองไม่ถูกนับเข้า FYC/ตำแหน่งทันที
//   (countsToward1x5 = false, needsManualReview = true) จนกว่าจะมีหลักฐาน/ตรวจทาน
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const maxDuration = 30;

const COMPANY = 'บมจ.ไทยประกันชีวิต';

function bearer(req: NextRequest): string {
  const h = req.headers.get('authorization') || '';
  return req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value || h.replace(/^Bearer\s+/i, '').trim();
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/documents/create-manual',
    methods: ['POST'],
    standard: {
      version: RECEIPT_STANDARD.version,
      required: RECEIPT_STANDARD.required.map((r) => r.label),
      recommended: RECEIPT_STANDARD.recommended.map((r) => r.label),
      minAmount: RECEIPT_STANDARD.minAmount,
    },
    body: {
      memberId: 'รหัสสมาชิกในระบบ (เช่น M001)',
      agentCode: 'รหัสตัวแทนของตัวเอง (จาก TL ProPlus)',
      receiptNumber: 'เลขใบเสร็จ',
      referenceNumber: 'เลขอ้างอิงรายการ',
      amount: 'ยอดเงินที่ชำระ (บาท)',
      paidAt: 'วันที่ชำระ (YYYY-MM-DD)',
      policyNo: 'เลขกรมธรรม์ (ถ้ามี)',
      planName: 'ชื่อแบบประกัน (ถ้ามี)',
    },
  });
}

export async function POST(req: NextRequest) {
  let payload: any = null;
  try { payload = verifyToken(bearer(req)); } catch { payload = null; }
  if (!payload?.sub) {
    return NextResponse.json({ ok: false, error: 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่' }, { status: 401 });
  }

  const b: any = await req.json().catch(() => ({}));
  const memberId = String(b.memberId || payload.memberCode || 'demo-member').trim().slice(0, 40);
  const agentCode = String(b.agentCode || '').replace(/\s+/g, '').slice(0, 20);
  const receiptNumber = String(b.receiptNumber || '').trim().slice(0, 60) || null;
  const referenceNumber = String(b.referenceNumber || '').trim().slice(0, 60) || null;
  const policyNo = String(b.policyNo || '').trim().slice(0, 40) || null;
  const planName = String(b.planName || '').trim().slice(0, 120) || null;
  // ── ตัวเลือกที่ "โปรแกรม/ใบเสร็จกำหนด" (กรอกตามขั้นตอนในหน้า /documents) ──
  const docTypeIn = String(b.docType || 'receipt').slice(0, 40);
  const installmentLabel = String(b.installmentLabel || '').trim().slice(0, 10) || null; // "01/04"
  const paymentMethod = String(b.paymentMethod || '').trim().slice(0, 60) || null;       // รายปี / ราย 6 เดือน ...
  const bank = String(b.bank || '').trim().slice(0, 80) || null;
  const policyTermYears = Number(String(b.policyTermYears ?? '').replace(/\D/g, '')) || null;
  const amount = Number(String(b.amount ?? '').replace(/[^\d.]/g, ''));
  const paidAt = String(b.paidAt || '').trim().slice(0, 20) || null;

  if (!agentCode) {
    return NextResponse.json({ ok: false, error: 'ต้องระบุรหัสตัวแทนของตัวเอง (จาก TL ProPlus)' }, { status: 400 });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ ok: false, error: 'ต้องระบุยอดเงินที่ชำระ (มากกว่า 0 บาท)' }, { status: 400 });
  }
  if (!receiptNumber && !referenceNumber) {
    return NextResponse.json({ ok: false, error: 'ต้องมีเลขใบเสร็จ หรือ เลขอ้างอิงรายการ อย่างน้อย 1 อย่าง' }, { status: 400 });
  }
  if (!paidAt) {
    return NextResponse.json({ ok: false, error: 'ต้องระบุวันที่ชำระ' }, { status: 400 });
  }

  // ตรวจกับมาตรฐานใบเสร็จชุดเดียวกับที่ระบบสแกนใช้
  const check = checkReceiptStandard({
    issuerName: COMPANY,
    companyName: COMPANY,
    amount,
    paidAt,
    receiptNo: receiptNumber,
    transactionRef: referenceNumber,
    agentCode,
    policyNo,
  });
  if (!check.ok) {
    return NextResponse.json({ ok: false, error: `ไม่ตรงมาตรฐานใบเสร็จ — ขาด: ${check.missing.join(', ')}`, check }, { status: 400 });
  }

  const receiptId = randomUUID();
  const dedupKey = `manual:${memberId}:${receiptNumber || referenceNumber}`;
  const fp = `${amount}|${paidAt || ''}|${receiptNumber || referenceNumber || ''}`.trim();

  try {
    const receipts = db().collection('receipts');
    const dupKey = await receipts.where('dedupKey', '==', dedupKey).limit(1).get();
    if (!dupKey.empty) {
      return NextResponse.json({ ok: false, duplicate: true, error: 'ใบเสร็จเลขที่นี้ถูกบันทึกแล้ว (กันนับยอดซ้ำ)' }, { status: 409 });
    }
    const dupFp = await receipts.where('fingerprint', '==', fp).limit(1).get();
    if (!dupFp.empty) {
      return NextResponse.json({ ok: false, duplicate: true, error: 'มีใบเสร็จยอด/วันที่/เลขอ้างอิงเดียวกันอยู่แล้ว' }, { status: 409 });
    }

    const doc = {
      receiptId,
      memberId,
      // ไม่มีไฟล์ต้นฉบับ: ใบเสร็จนี้ "สร้างจากข้อมูลที่ตัวแทนกรอก" ไม่ใช่ภาพสแกน
      filename: `created-${receiptNumber || referenceNumber}.pdf`,
      storageUrl: '',
      storagePath: '',
      source: 'manual_tl_proplus',
      amount,
      date: paidAt,
      referenceNumber,
      receiverName: COMPANY,
      bank,
      fingerprint: fp,
      createdAt: new Date().toISOString(),
      receiptNumber,
      policyNo,
      company: COMPANY,
      paidAt,
      installmentLabel,
      paymentMethod: paymentMethod || 'TL ProPlus (สร้างใบเสร็จ)',
      planName,
      policyTermYears,
      docType: docTypeIn,
      dedupKey,
      provider: 'tl_proplus',
      confidence: null,
      agentCode,
      agentCodeOwner: String(payload.email || payload.sub || '').slice(0, 120),
      countsToward1x5: false,
      verifiedAmount: 0,
      needsManualReview: true,
      issues: [{ code: 'created_manually', message: 'สร้างใบเสร็จจากรหัสตัวแทน (TL ProPlus) — ต้องแนบหลักฐาน/ตรวจทานก่อนนับยอด' }],
      verificationStatus: 'รอตรวจสอบ (สร้างเองจาก TL ProPlus)',
      piiPolicy: 'masked_only',
    };

    await receipts.doc(receiptId).set(doc);

    return NextResponse.json({
      ok: true,
      receiptId,
      receipt: {
        receiptId,
        memberId,
        agentCode,
        receiptNumber,
        referenceNumber,
        amount,
        paidAt,
        policyNo,
        company: COMPANY,
        source: 'manual_tl_proplus',
        verificationStatus: doc.verificationStatus,
        countsToward1x5: false,
      },
      check,
      note: 'บันทึกแล้ว — ระบบยังไม่นับยอดเข้า FYC/ตำแหน่ง จนกว่าจะแนบหลักฐานหรือผู้ดูแลตรวจทาน',
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'บันทึกใบเสร็จไม่สำเร็จ' }, { status: 500 });
  }
}
