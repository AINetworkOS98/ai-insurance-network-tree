import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { isAdminFromPayload } from '@/lib/admin';
import { maskName, scrubPii } from '@/lib/pii';
import { checkReceiptStandard } from '@/lib/receiptStandard';
import crypto from 'crypto';
import { mirrorToFirestore } from '@/lib/firestoreMirror';

// ให้เวลา OCR ฝั่งเซิร์ฟเวอร์พอ (อ่านภาพด้วย vision)
export const maxDuration = 60;

// POST /api/receipts/upload — อัปโหลด JPG/PNG/PDF หลายหน้า (สเปคหมวด 7)
// ตรวจชนิด/ขนาด + hash ตรวจไฟล์ซ้ำ + สร้าง ReceiptFile (Uploaded)
export async function POST(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.headers.get('authorization')?.replace('Bearer ','') || '';
    const payload = token ? verifyToken(token) : null;
    if(!payload) return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    const userId = (payload as any).sub;

    const form = await req.formData();
    const file = form.get('file') as File | null;
    if(!file) return NextResponse.json({ ok:false, error:'กรุณาเลือกไฟล์' }, { status:400 });

    const allowed = ['image/jpeg','image/png','image/webp','application/pdf'];
    if(!allowed.includes(file.type)) return NextResponse.json({ ok:false, error:'ชนิดไฟล์ไม่รองรับ — ใช้ JPG/PNG/PDF เท่านั้น' }, { status:400 });
    if(file.size > 10 * 1024 * 1024) return NextResponse.json({ ok:false, error:'ไฟล์ใหญ่เกิน 10MB' }, { status:400 });

    const buf = Buffer.from(await file.arrayBuffer());
    const fileHash = crypto.createHash('sha256').update(buf).digest('hex');

    // ตรวจไฟล์ซ้ำ (hash)
    const dup = await prisma.receiptFile.findUnique({ where:{ fileHash } }).catch(()=>null);
    if(dup){
      return NextResponse.json({ ok:false, error:'ไฟล์นี้ถูกอัปโหลดแล้ว', duplicate:true, existingId: dup.id }, { status:409 });
    }

    // ตรวจซ้ำตามธุรกรรม: ถ้ามี reference ที่ส่งมาพร้อม ให้ตรวจซ้ำด้วย (จะตรวจละเอียดหลัง OCR)
    const receiptNoHint = String(form.get('receiptNo') || '').trim();
    const transactionRefHint = String(form.get('transactionRef') || '').trim();
    if(transactionRefHint){
      const dupTx = await prisma.receiptExtraction.findFirst({ where:{ transactionRef: transactionRefHint } });
      if(dupTx){
        return NextResponse.json({ ok:false, error:'เลขธุรกรรมนี้มีในระบบแล้ว', duplicate:true }, { status:409 });
      }
    }

    const receipt = await prisma.receiptFile.create({
      data:{
        userId,
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        fileHash,
        status:'Uploaded',
        submissionAt: new Date(),
      }
    });

    // สร้าง extraction ว่างรอ OCR
    const extRow = await prisma.receiptExtraction.create({
      data:{
        receiptId: receipt.id,
        receiptNo: receiptNoHint || null,
        transactionRef: transactionRefHint || null,
        confidence: { overall: 0, note:'รอ OCR' },
        rawOcr: { hint:'pending' },
      }
    });

    // ── สแกนแล้วอ่านข้อมูลทันทีที่เซิร์ฟเวอร์ ─────────────────────────────
    // เดิมต้องรอเบราว์เซอร์เรียก /api/ocr เอง ถ้าขั้นนั้นไม่สำเร็จ ใบเสร็จจะค้างสถานะ Uploaded
    // ไม่มีข้อมูล → ตรวจไม่ได้ → ไม่ขึ้นตำแหน่ง ทำที่นี่ให้ทุกใบที่สแกนเข้ามามีข้อมูลครบ
    // (ข้อมูลส่วนบุคคลถูกปิดทันทีตาม PDPA: ชื่อผู้ชำระถูก mask, เลขบัญชี/บัตรไม่ถูกเก็บ)
    let ocrOk = false;
    let ocrNote = '';
    let std: any = null;   // ผลตรวจกับ "มาตรฐานใบเสร็จ" ที่ยึดถือตอนสมาชิกสแกนเข้าร่วม
    if(file.type !== 'application/pdf'){
      try{
        const { extractReceiptData } = await import('@/lib/ocr');
        const ocr: any = await extractReceiptData(buf.toString('base64'), file.type);
        if(ocr){
          if(ocr.transactionRef){
            const dupTx = await prisma.receiptExtraction.findFirst({ where:{ transactionRef: String(ocr.transactionRef).trim(), receiptId:{ not: receipt.id } } }).catch(()=>null);
            if(dupTx){
              await prisma.receiptFile.update({ where:{ id: receipt.id }, data:{ status:'Duplicate' } });
              await prisma.receiptVerification.create({ data:{ receiptId: receipt.id, result:'Duplicate', reason:`เลขธุรกรรมซ้ำกับใบเสร็จ ${dupTx.receiptId}` } }).catch(()=>null);
              return NextResponse.json({ ok:false, duplicate:true, error:'เลขธุรกรรมซ้ำ — ไม่นับยอดซ้ำ', receipt:{ id: receipt.id } }, { status:409 });
            }
          }
          await prisma.receiptExtraction.update({
            where:{ id: extRow.id },
            data:{
              issuerName: ocr.companyName || null,
              receiptNo: ocr.receiptNumber || receiptNoHint || null,
              transactionRef: ocr.referenceNumber || transactionRefHint || null,
              policyNo: ocr.policyNo || null,
              payerName: maskName(ocr.payerName),
              paidAt: ocr.date ? new Date(ocr.time ? `${ocr.date}T${ocr.time}` : ocr.date) : null,
              amount: ocr.amount != null ? String(ocr.amount) : null,
              type: 'premium',
              agentCode: ocr.agentCode || null,
              confidence: { overall: ocr.confidence ?? 0, provider: ocr.provider, needsReview: ocr.confidence < 0.8 },
              rawOcr: scrubPii(ocr),
            } as any
          });
          await prisma.receiptFile.update({ where:{ id: receipt.id }, data:{ status:'Extracted', paymentAt: ocr.date ? new Date(ocr.date) : null } });
          // ตรวจกับมาตรฐานใบเสร็จที่ยึดถือ (ทุกช่องทางใช้กติกาเดียวกัน — ไม่เก็บข้อมูลส่วนบุคคล)
          std = checkReceiptStandard({
            issuerName: ocr.companyName, receiverName: ocr.receiverName, amount: ocr.amount, paidAt: ocr.date,
            receiptNo: ocr.receiptNumber, transactionRef: ocr.referenceNumber, agentCode: ocr.agentCode,
            policyNo: ocr.policyNo, confidence: { overall: ocr.confidence ?? 0 },
          });
          ocrOk = true;
        }
      }catch(e:any){
        ocrNote = String(e?.thaiMessage || e?.message || e).slice(0, 160);
      }
    } else {
      ocrNote = 'PDF — กรุณากรอกค่าจากเอกสารเอง (ระบบอ่านภาพ PDF อัตโนมัติยังไม่เปิด)';
    }

    await prisma.auditLog.create({ data:{ userId, action:'receipt.upload', entity:'ReceiptFile', entityId: receipt.id, newValue:{ fileHash, originalName: file.name } } });
    // แจ้งเตือนอัปโหลดสำเร็จ — ให้ไปหน้า preview OCR
    try{
      const { emitNotification } = await import('@/lib/notify');
      await emitNotification({ userId, type:'receipt_uploaded', title:'อัปโหลดใบเสร็จสำเร็จ', body:'กำลังประมวลผล OCR — กรุณาตรวจทานข้อมูลก่อนส่งตรวจสอบ', referenceId:'/receipts' }).catch(()=>null);
    }catch{}
    return NextResponse.json({
      ok:true,
      receipt: { id: receipt.id, status: ocrOk ? 'Extracted' : receipt.status, fileHash },
      ocr: ocrOk ? 'read' : 'needs_manual',
      standard: std || checkReceiptStandard(null),
      message: ocrOk
        ? ('อัปโหลด + อ่านข้อมูลจากภาพสำเร็จ — กรุณาตรวจทานก่อนส่งตรวจสอบ (ระบบไม่เก็บชื่อผู้ชำระเต็มตาม PDPA)'
           + (std && !std.ok ? ` • ยังไม่ตรงมาตรฐานใบเสร็จ: ขาด ${std.missing.join(', ')}` : ' • ตรงมาตรฐานใบเสร็จของโครงการ'))
        : ('อัปโหลดสำเร็จ แต่ยังอ่านอัตโนมัติไม่ได้' + (ocrNote ? ` (${ocrNote})` : '') + ' — กรุณากรอกค่าจากเอกสารเอง'),
      nextStep: `/api/receipts/ocr?receiptId=${receipt.id}`
    });
  }catch(e:any){
    console.error('receipt upload', e);
    return NextResponse.json({ ok:false, error:'อัปโหลดไม่สำเร็จ' }, { status:500 });
  }
}

// GET /api/receipts/upload?userId= — รายการของตน (ตามสิทธิ)
export async function GET(req: NextRequest){
  try{
    const { searchParams } = new URL(req.url);
    const token = req.cookies.get('token')?.value || req.headers.get('authorization')?.replace('Bearer ','') || '';
    const payload = token ? verifyToken(token) : null;
    if(!payload) return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    const userId = (payload as any).sub;
    const rankLevel = (payload as any).rankLevel ?? 0;

    // สมาชิกทั่วไปดูได้เฉพาะของตนเอง, ผู้มีสิทธิ document.verify ดูทั้งหมด
    const canViewAll = rankLevel >= 3 || await isAdminFromPayload(payload);

    const where: any = canViewAll && searchParams.get('userId') ? { userId: searchParams.get('userId') } : { userId };
    if(canViewAll && !searchParams.get('userId')) delete where.userId; // admin ดูทั้งหมดถ้าไม่ระบุ userId

    const receipts = await prisma.receiptFile.findMany({
      where: canViewAll && !searchParams.get('userId') ? {} : where,
      include:{ extractions:{ orderBy:{ createdAt:'desc' }, take:1 }, verifications:{ orderBy:{ createdAt:'desc' }, take:1 } },
      orderBy:{ createdAt:'desc' },
      take:50
    });

    return NextResponse.json({ ok:true, receipts });
  }catch(e:any){
    return NextResponse.json({ ok:false, error:'เกิดข้อผิดพลาด' }, { status:500 });
  }
}
