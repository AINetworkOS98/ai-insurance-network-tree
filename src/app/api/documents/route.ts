import { NextResponse } from 'next/server';
import { db, storage, STORAGE_BUCKET } from '@/lib/firebase-admin';
import { checkPositionEligibility, type PositionCode } from '@/lib/positions';
import { randomUUID } from 'crypto';

export const runtime = 'nodejs';
export const maxDuration = 60;

// fingerprint ป้องกัน duplicate: amount + date + referenceNumber
function fingerprint(amount: number, date: string | null, reference: string | null): string {
  return `${amount}|${date || ''}|${reference || ''}`.trim();
}

// ── GET: รายการใบเสร็จ (จาก Firestore จริง) ─────────────────────────
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const memberId = searchParams.get('memberId');

    const snapshot = await db().collection('receipts').limit(200).get();
    let receipts = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (memberId) {
      receipts = receipts.filter((r: any) => r.memberId === memberId);
    }
    receipts.sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    return NextResponse.json({ ok: true, receipts });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message || 'โหลดรายการใบเสร็จไม่สำเร็จ' }, { status: 500 });
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

    if (!file) {
      return NextResponse.json({ ok: false, error: 'ไม่พบไฟล์ที่อัปโหลด' }, { status: 400 });
    }

    const amount = Number(amountRaw);
    if (!amount || isNaN(amount) || amount <= 0) {
      return NextResponse.json({ ok: false, error: 'ไม่สามารถอ่านยอดเงินจากเอกสารได้' }, { status: 400 });
    }

    // 1) ป้องกัน duplicate
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
        payerName,
        receiverName,
        bank,
        fingerprint: fp,
        position: current,
        createdAt: new Date().toISOString(),
      });
    });

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
