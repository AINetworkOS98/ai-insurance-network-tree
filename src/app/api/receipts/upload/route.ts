import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import crypto from 'crypto';

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
    await prisma.receiptExtraction.create({
      data:{
        receiptId: receipt.id,
        receiptNo: receiptNoHint || null,
        transactionRef: transactionRefHint || null,
        confidence: { overall: 0, note:'รอ OCR' },
        rawOcr: { hint:'pending' },
      }
    });

    await prisma.auditLog.create({ data:{ userId, action:'receipt.upload', entity:'ReceiptFile', entityId: receipt.id, newValue:{ fileHash, originalName: file.name } } });

    return NextResponse.json({
      ok:true,
      receipt: { id: receipt.id, status: receipt.status, fileHash },
      message:'อัปโหลดสำเร็จ — กำลังอ่านข้อมูล (OCR)',
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
    const roles = (payload as any).roles || [];
    const canViewAll = rankLevel >= 3 || roles.includes('admin');

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
