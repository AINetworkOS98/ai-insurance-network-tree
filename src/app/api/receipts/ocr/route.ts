import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// POST /api/receipts/ocr { receiptId, ocrResult? } — จำลอง OCR (ใน production เรียก tesseract.js / API จริง)
// สเปค: OCR เป็นการอ่านข้อมูล ไม่ใช่การพิสูจน์ว่าเอกสารแท้, ต้องมี confidence รายช่อง, ให้แก้ไขได้โดยเก็บค่าเดิมและผู้แก้
export async function POST(req: NextRequest){
  try{
    const { receiptId, ocrResult, correctedFields, correctedBy } = await req.json();
    if(!receiptId) return NextResponse.json({ ok:false, error:'กรุณาระบุ receiptId' }, { status:400 });

    const receipt = await prisma.receiptFile.findUnique({ where:{ id: receiptId }, include:{ extractions:true } });
    if(!receipt) return NextResponse.json({ ok:false, error:'ไม่พบใบเสร็จ' }, { status:404 });

    // ถ้ามี correctedFields — ให้แก้ไขช่องที่อ่านไม่ชัดโดยเก็บค่าเดิมและผู้แก้
    if(correctedFields && receipt.extractions[0]){
      const ext = receipt.extractions[0];
      const originalValues: any = ext.originalValues || {};
      const updates: any = {};
      for(const [k,v] of Object.entries(correctedFields)){
        if((ext as any)[k] !== v){
          originalValues[k] = (ext as any)[k];
          updates[k] = v;
        }
      }
      if(Object.keys(updates).length){
        updates.correctedBy = correctedBy || null;
        updates.originalValues = originalValues;
        await prisma.receiptExtraction.update({ where:{ id: ext.id }, data: updates });
      }
      return NextResponse.json({ ok:true, message:'แก้ไขข้อมูล OCR สำเร็จ', corrected: Object.keys(updates) });
    }

    // สร้าง/อัปเดต extraction จาก ocrResult
    if(ocrResult){
      const {
        issuerName, receiptNo, transactionRef, policyNo, payerName, paidAt, amount, type, periodLabel, agentCode, qrBarcode,
        confidence, rawOcr
      } = ocrResult;

      // ตรวจซ้ำตามเลขธุรกรรม + ผู้ออก + เลขใบเสร็จ ร่วมกัน
      if(transactionRef){
        const dup = await prisma.receiptExtraction.findFirst({
          where:{ transactionRef: String(transactionRef).trim(), receiptId:{ not: receiptId } }
        });
        if(dup){
          await prisma.receiptFile.update({ where:{ id: receiptId }, data:{ status:'Duplicate' } });
          await prisma.receiptVerification.create({ data:{ receiptId, result:'Duplicate', reason:`เลขธุรกรรมซ้ำกับใบเสร็จ ${dup.receiptId}` } });
          return NextResponse.json({ ok:false, duplicate:true, error:'เลขธุรกรรมซ้ำ — ไม่นับยอดซ้ำ' }, { status:409 });
        }
      }

      const ext = receipt.extractions[0];
      if(ext){
        await prisma.receiptExtraction.update({
          where:{ id: ext.id },
          data:{
            issuerName: issuerName || null,
            receiptNo: receiptNo || null,
            transactionRef: transactionRef || null,
            policyNo: policyNo || null,
            payerName: payerName || null,
            paidAt: paidAt ? new Date(paidAt) : null,
            amount: amount ? String(amount) : null,
            type: type || null,
            periodLabel: periodLabel || null,
            agentCode: agentCode || null,
            qrBarcode: qrBarcode || null,
            confidence: confidence || { overall: 0.85, note:'OCR สำเร็จ — ให้ผู้ใช้ตรวจทานก่อนส่ง' },
            rawOcr: rawOcr || ocrResult,
          } as any
        });
      } else {
        await prisma.receiptExtraction.create({
          data:{
            receiptId,
            issuerName: issuerName || null,
            receiptNo: receiptNo || null,
            transactionRef: transactionRef || null,
            policyNo: policyNo || null,
            payerName: payerName || null,
            paidAt: paidAt ? new Date(paidAt) : null,
            amount: amount ? String(amount) : null,
            type: type || null,
            periodLabel: periodLabel || null,
            agentCode: agentCode || null,
            qrBarcode: qrBarcode || null,
            confidence: confidence || { overall: 0.85 },
            rawOcr: rawOcr || ocrResult,
          } as any
        });
      }

      // อัปเดต status เป็น Extracted — ให้ผู้ใช้ตรวจทานก่อนส่ง PendingVerification
      await prisma.receiptFile.update({ where:{ id: receiptId }, data:{ status:'Extracted' } });

      return NextResponse.json({
        ok:true,
        message:'อ่านข้อมูลแล้ว — กรุณาตรวจทานก่อนส่งตรวจสอบ',
        status:'Extracted',
        note:'OCR เป็นการอ่านข้อมูล ไม่ใช่การพิสูจน์ว่าเอกสารแท้หรือเงินเข้าจริง — QR Code ไม่เพียงพอต่อการรับรองยอด'
      });
    }

    return NextResponse.json({ ok:true, receipt, extractions: receipt.extractions });
  }catch(e:any){
    console.error('receipt ocr', e);
    return NextResponse.json({ ok:false, error:'เกิดข้อผิดพลาด' }, { status:500 });
  }
}

// GET /api/receipts/ocr?receiptId= — ดูผล OCR
export async function GET(req: NextRequest){
  const { searchParams } = new URL(req.url);
  const receiptId = searchParams.get('receiptId');
  if(!receiptId) return NextResponse.json({ ok:false, error:'กรุณาระบุ receiptId' }, { status:400 });
  const receipt = await prisma.receiptFile.findUnique({ where:{ id: receiptId }, include:{ extractions:{ orderBy:{ createdAt:'desc' } } } });
  if(!receipt) return NextResponse.json({ ok:false, error:'ไม่พบ' }, { status:404 });
  return NextResponse.json({ ok:true, receipt, extractions: receipt.extractions });
}
