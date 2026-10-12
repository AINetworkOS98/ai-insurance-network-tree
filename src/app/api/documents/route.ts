import { NextRequest, NextResponse } from 'next/server';
import { db, storage, STORAGE_BUCKET } from '@/lib/firebase-admin';
import { checkPositionEligibility, type PositionCode } from '@/lib/positions';
import { randomUUID } from 'crypto';
import { emitNotification } from '@/lib/notify';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { isAdminFromPayload } from '@/lib/admin';

export const runtime = 'nodejs';
export const maxDuration = 60;

// fingerprint ป้องกัน duplicate: amount + date + referenceNumber
function fingerprint(amount: number, date: string | null, reference: string | null): string {
  return `${amount}|${date || ''}|${reference || ''}`.trim();
}

// ── GET: คลังใบเสร็จที่สแกนแล้ว (ของสมาชิกคนนี้) + สรุปยอดเข้าเครือข่าย 1 แตก 5 ────
//  สมาชิกเห็นเฉพาะใบเสร็จของตัวเอง (จับคู่จาก userId / memberCode / email ที่ล็อกอิน)
//  ผู้ดูแลระบบเห็นทั้งหมด · ไม่มีข้อมูลส่วนบุคคลในคำตอบ (PDPA)
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const memberIdParam = searchParams.get('memberId');

    // ระบุตัวตนผู้ใช้จากโทเค็น (ถ้ามี) เพื่อจำกัดขอบเขตข้อมูล
    const tokenHeader = request.headers.get('authorization') || '';
    const token = request.cookies.get('token')?.value
      || request.cookies.get('auth_token')?.value
      || tokenHeader.replace(/^Bearer\s+/i, '').trim();

    let payload: any = null;
    try { payload = token ? verifyToken(token) : null; } catch { payload = null; }

    const userId = String(payload?.sub || '');
    let isAdmin = false;
    let mine = new Set<string>();
    let memberName = '';
    if (userId) {
      isAdmin = await isAdminFromPayload(payload).catch(() => false);
      const me = await prisma.user.findUnique({ where: { id: userId }, select: { memberCode: true, email: true, displayName: true } }).catch(() => null);
      memberName = me?.displayName || me?.email || '';
      mine = new Set([userId, me?.memberCode, me?.email, memberIdParam].filter(Boolean).map(String));
    }

    const snapshot = await db().collection('receipts').limit(500).get();
    let receipts: any[] = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (!isAdmin) {
      const wanted = mine.size ? mine : new Set([memberIdParam || 'demo-member']);
      receipts = receipts.filter((r: any) => wanted.has(String(r.memberId)));
    }
    receipts.sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    // สรุปยอดสำหรับแสดงบนหน้าคลังใบเสร็จ
    const counted = receipts.filter((r: any) => r.countsToward1x5 === true);
    const summary = {
      total: receipts.length,
      countedCount: counted.length,
      countedAmount: counted.reduce((n: number, r: any) => n + Number(r.verifiedAmount ?? r.amount ?? 0), 0),
      pendingReview: receipts.filter((r: any) => r.needsManualReview !== false).length,
      lastScanAt: receipts[0]?.createdAt || null,
      scope: isAdmin ? 'all' : 'mine',
      memberName,
      piiPolicy: 'masked_only',
    };

    return NextResponse.json({ ok: true, receipts, summary });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || 'โหลดรายการใบเสร็จไม่สำเร็จ' }, { status: 500 });
  }
}

// ── DELETE: ลบใบเสร็จออกจากระบบ (คลัง Firestore + ไฟล์ใน Storage) ──────────
// สิทธิ์: ผู้ดูแลระบบเท่านั้น (เจ้าของใบเสร็จลบเองไม่ได้)
export async function DELETE(request: NextRequest) {
  try {
    const token = request.cookies.get('token')?.value
      || request.cookies.get('auth_token')?.value
      || (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });

    let payload: any;
    try { payload = verifyToken(token); } catch { return NextResponse.json({ ok: false, error: 'โทเค็นไม่ถูกต้อง' }, { status: 401 }); }
    const userId = String(payload?.sub || '');

    // ── สิทธิการลบ: ผู้ดูแลระบบเท่านั้น (นโยบายเจ้าของระบบ) ──
    //    ตรวจสิทธิ์ก่อนแตะฐานข้อมูลเสมอ → ผู้ใช้ทั่วไปถูกปฏิเสธทันที ไม่มีการอ่าน/ลบข้อมูลใด ๆ
    const isAdmin = await isAdminFromPayload(payload).catch(() => false);
    if (!isAdmin) {
      return NextResponse.json(
        { ok: false, error: 'ลบได้เฉพาะผู้ดูแลระบบ — กรุณาติดต่อผู้ดูแลระบบให้ลบเอกสารให้', adminOnly: true },
        { status: 403 },
      );
    }

    const url = new URL(request.url);
    const body = await request.json().catch(() => ({} as any));
    const receiptId: string = (url.searchParams.get('receiptId') || body?.receiptId || '').toString();
    if (!receiptId) return NextResponse.json({ ok: false, error: 'ไม่ระบุใบเสร็จที่ต้องการลบ' }, { status: 400 });

    const docRef = db().collection('receipts').doc(receiptId);
    const snap = await docRef.get();
    if (!snap.exists) return NextResponse.json({ ok: false, error: 'ไม่พบใบเสร็จนี้ในระบบ' }, { status: 404 });
    const data: any = snap.data() || {};

    // ลบไฟล์ต้นฉบับใน Storage ก่อน (ถ้ามี) — ไม่ให้เหลือไฟล์กำพร้า
    if (data.storagePath) {
      await storage().bucket(STORAGE_BUCKET).file(String(data.storagePath)).delete().catch(() => null);
    }
    await docRef.delete();

    await prisma.auditLog.create({
      data: {
        userId,
        action: 'receipt.deleted',
        entity: 'FirestoreReceipt',
        entityId: receiptId,
        oldValue: { memberId: data.memberId ?? null, filename: data.filename ?? null, amount: data.amount ?? null, storagePath: data.storagePath ?? null },
        reason: 'ผู้ดูแลระบบลบใบเสร็จ',
      },
    }).catch(() => null);

    return NextResponse.json({ ok: true, deleted: receiptId, message: 'ลบใบเสร็จออกจากระบบแล้ว' });
  } catch (e: any) {
    console.error('[documents DELETE]', e?.message);
    return NextResponse.json({ ok: false, error: e.message || 'ลบใบเสร็จไม่สำเร็จ' }, { status: 500 });
  }
}

// ── POST: บันทึกใบเสร็จที่ยืนยันแล้ว (หลัง OCR + preview) ────────────
export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get('file') as File | null;
    const memberId = (form.get('memberId') as string) || 'demo-member';
    const amountRaw = form.get('amount') as string | null;
    const date = (form.get('date') as string) || null;
    const referenceNumber = (form.get('referenceNumber') as string) || null;
    const payerName = (form.get('payerName') as string) || null;
    const receiverName = (form.get('receiverName') as string) || null;
    const bank = (form.get('bank') as string) || null;
    // ── ฟิลด์ผลตรวจกติกาจากระบบสแกน (ไม่มีข้อมูลส่วนบุคคล) ─────────────────
    const receiptNumber = (form.get('receiptNumber') as string) || null;
    const policyNo = (form.get('policyNo') as string) || null;
    const company = (form.get('company') as string) || null;
    const paidAt = (form.get('paidAt') as string) || null;
    const installmentLabel = (form.get('installmentLabel') as string) || null;
    const paymentMethod = (form.get('paymentMethod') as string) || null;
    const planName = (form.get('planName') as string) || null;
    const policyTermYears = Number(form.get('policyTermYears')) || null;
    const docType = (form.get('docType') as string) || null;
    const dedupKey = (form.get('dedupKey') as string) || null;
    const provider = (form.get('provider') as string) || null;
    const confidence = Number(form.get('confidence')) || null;
    const countsToward1x5 = (form.get('countsToward1x5') as string) === 'true';
    const verifiedAmount = Number(form.get('verifiedAmount')) || 0;
    const needsManualReview = (form.get('needsManualReview') as string) !== 'false';
    let issues: any = [];
    try { issues = JSON.parse((form.get('issues') as string) || '[]'); } catch { issues = []; }

    if (!file) {
      return NextResponse.json({ ok: false, error: 'ไม่พบไฟล์ที่อัปโหลด' }, { status: 400 });
    }

    const amount = Number(amountRaw);
    if (!amount || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ ok: false, error: 'ไม่สามารถอ่านยอดเงินจากเอกสารได้' }, { status: 400 });
    }

    // 1) ป้องกัน duplicate — เลขที่ใบเสร็จ+กรมธรรม์ (dedupKey) ก่อน แล้วค่อยลายนิ้วมือเดิม
    if (dedupKey) {
      const dupKeySnap = await db().collection('receipts').where('dedupKey', '==', dedupKey).limit(1).get();
      if (!dupKeySnap.empty) {
        return NextResponse.json(
          { ok: false, duplicate: true, error: 'ใบเสร็จเลขที่นี้ถูกบันทึกแล้ว (กันนับยอดซ้ำ)' },
          { status: 409 }
        );
      }
    }
    const fp = fingerprint(amount, date, referenceNumber);
    const dupSnapshot = await db().collection('receipts').where('fingerprint', '==', fp).limit(1).get();
    if (!dupSnapshot.empty) {
      return NextResponse.json(
        { ok: false, duplicate: true, error: 'เอกสารนี้อาจถูกบันทึกแล้ว' },
        { status: 409 }
      );
    }

    // 2) อัปโหลดไฟล์ไป Firebase Storage (ถ้า bucket ยังไม่เปิด ให้ข้ามไป — ยังบันทึก Firestore ได้)
    const ext = file.type === 'application/pdf' ? 'pdf' : file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const receiptId = randomUUID();
    const storagePath = `receipts/${memberId}/${receiptId}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    let storageUrl = '';
    let storageWarning: string | null = null;
    try {
      await storage().bucket(STORAGE_BUCKET).file(storagePath).save(buf, {
        metadata: { contentType: file.type },
      });
      storageUrl = `https://storage.googleapis.com/${STORAGE_BUCKET}/${storagePath}`;
    } catch (e: any) {
      // Bucket ยังไม่เปิด / permission — ไม่บล็อกการบันทึก
      storageWarning = e?.message?.slice(0, 200) || 'Storage ยังไม่พร้อม';
      console.warn('[documents] Storage save skipped:', storageWarning);
      storageUrl = ''; // เก็บไฟล์ไม่ได้ แต่ยังบันทึกข้อมูล OCR ได้
    }

    // 3) บันทึกลง Firestore + อัปเดต FYC สะสม (transaction)
    const memberRef = db().collection('members').doc(memberId);
    const receiptRef = db().collection('receipts').doc(receiptId);

    let positionResult;

    await db().runTransaction(async (tx) => {
      const memberDoc = await tx.get(memberRef);
      const current = (memberDoc.data()?.position || 'agent') as PositionCode;
      const prevFyc = Number(memberDoc.data()?.accumulatedFyc || 0);
      const units = Number(memberDoc.data()?.separatedUnits || 0);
      const centers = Number(memberDoc.data()?.separatedCenters || 0);

      const newFyc = prevFyc + amount;
      positionResult = checkPositionEligibility(current, newFyc, units, centers);

      tx.set(
        memberRef,
        {
          memberId,
          position: current,
          accumulatedFyc: newFyc,
          separatedUnits: units,
          separatedCenters: centers,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );

      tx.set(receiptRef, {
        receiptId,
        memberId,
        filename: file.name,
        storageUrl,
        storagePath,
        amount,
        date,
        referenceNumber,
        // PDPA: ไม่เก็บชื่อผู้ชำระ (payerName) ลงคลัง — เก็บเฉพาะข้อมูลธุรกรรมและชื่อบริษัท
        receiverName,
        bank,
        fingerprint: fp,
        position: current,
        createdAt: new Date().toISOString(),
        // ── ผลตรวจกติกาที่บันทึกไว้กับใบเสร็จ (ใช้เป็นหลักฐานย้อนหลังได้) ──
        receiptNumber,
        policyNo,
        company,
        paidAt,
        installmentLabel,
        paymentMethod,
        planName,
        policyTermYears,
        docType,
        dedupKey,
        provider,
        confidence,
        countsToward1x5,
        verifiedAmount: countsToward1x5 ? (verifiedAmount || amount) : 0,
        needsManualReview,
        issues,
        verificationStatus: countsToward1x5
          ? (needsManualReview ? 'รอตรวจสอบ' : 'ผ่านการตรวจกติกา')
          : 'ไม่เข้าเกณฑ์',
        piiPolicy: 'masked_only',
      });
    });

    // แจ้งเตือนอัปโหลดสำเร็จ — ให้ไปหน้า preview OCR
    try{
      await emitNotification({ userId: memberId, type:'receipt_uploaded', title:'อัปโหลดใบเสร็จสำเร็จ', body:'กำลังประมวลผล OCR — กรุณาตรวจทานข้อมูลก่อนส่งตรวจสอบ', referenceId:'/receipts' }).catch(()=>null);
    }catch{}

    return NextResponse.json({
      ok: true,
      receipt: { receiptId, filename: file.name, storageUrl, storagePath, amount, date, referenceNumber },
      position: positionResult,
      ...(storageWarning ? { storageWarning: 'ไฟล์ต้นฉบับยังไม่ได้เก็บ (Storage ยังไม่เปิด) แต่ข้อมูลบันทึกแล้ว' } : {}),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || 'เกิดข้อผิดพลาดในการบันทึก' }, { status: 500 });
  }
}

// เพิ่มคอมมิชชัน 20,000 บาทหลังอัปโหลดเอกสารสำเร็จ
async function addCommissionForUpload(memberId: string, receiptId: string) {
  try {
    const memberRef = db().collection('members').doc(memberId);
    const memberDoc = await memberRef.get();
    if (!memberDoc.exists) return;

    const commissionRef = db().collection('performanceLedger').doc();
    await db().runTransaction(async (tx) => {
      tx.set(db().collection('performanceLedger').doc(), {
        memberId,
        receiptId,
        type: 'commission_upload',
        amount: 20000,
        period: new Date().toISOString().slice(0, 7),
        createdAt: new Date().toISOString(),
      });

      const currentFyc = Number(memberDoc.data()?.accumulatedFyc || 0);
      tx.update(memberRef, { accumulatedFyc: currentFyc + 20000, updatedAt: new Date().toISOString() });
    });
  } catch (e: any) {
    console.warn('[documents] commission upload failed:', e?.message);
  }
}