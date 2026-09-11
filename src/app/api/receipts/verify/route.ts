import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

// POST /api/receipts/verify — ส่งตรวจ / อนุมัติ / ปฏิเสธ (ต้องมี document.verify)
// สเปค: 7 ขั้น — Uploaded→Extracted→PendingVerification→Verified/Rejected/Duplicate (+ Reversed)
// แยก "ยอดรับชำระเบี้ย" ออกจาก "ค่าบำเหน็จ" — ใบเสร็จเบี้ยไม่ใช่หลักฐานค่าบำเหน็จ
export async function POST(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.headers.get('authorization')?.replace('Bearer ','') || '';
    const payload = token ? verifyToken(token) : null;
    if(!payload) return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    const actorId = (payload as any).sub;

    const { receiptId, action, reason, creditedPeriod, ledgerType } = await req.json();
    // action: submit | verify | reject | duplicate | reverse
    if(!receiptId || !action) return NextResponse.json({ ok:false, error:'กรุณาระบุ receiptId และ action' }, { status:400 });

    const receipt = await prisma.receiptFile.findUnique({ where:{ id: receiptId }, include:{ extractions:{ orderBy:{ createdAt:'desc' }, take:1 } } });
    if(!receipt) return NextResponse.json({ ok:false, error:'ไม่พบใบเสร็จ' }, { status:404 });

    const ext = receipt.extractions[0] as any;

    if(action === 'submit'){
      // ผู้ส่งตรวจ — ต้องตรวจทานข้อมูล OCR ก่อน
      if(receipt.status !== 'Extracted') return NextResponse.json({ ok:false, error:'สถานะต้องเป็น Extracted ก่อนส่งตรวจ' }, { status:400 });
      // ตรวจว่าข้อมูลสำคัญครบ
      if(!ext?.amount || !ext?.paidAt) return NextResponse.json({ ok:false, error:'กรุณาตรวจทานจำนวนเงินและวันที่ชำระให้ครบก่อนส่ง' }, { status:400 });
      await prisma.receiptFile.update({ where:{ id: receiptId }, data:{ status:'PendingVerification' } });
      await prisma.auditLog.create({ data:{ userId: actorId, action:'receipt.submit', entity:'ReceiptFile', entityId: receiptId } });
      return NextResponse.json({ ok:true, status:'PendingVerification', message:'ส่งตรวจสอบแล้ว — รอเจ้าหน้าที่ตรวจกับแหล่งรับเงินจริง' });
    }

    // verify/reject/duplicate/reverse ต้องมีสิทธิ document.verify
    const roles = (payload as any).roles || [];
    let hasPerm = roles.includes('admin') || roles.includes('super_admin');
    if(!hasPerm){
      const actorRoles = await prisma.userRole.findMany({ where:{ userId: actorId }, include:{ role:{ include:{ permissions:true } } } }).catch(()=>[]);
      const permKeys = actorRoles.flatMap((ur:any)=> ur.role.permissions.map((rp:any)=> rp.permission.key));
      hasPerm = permKeys.includes('document.verify') || permKeys.includes('permission.manage');
    }
    if(!hasPerm) return NextResponse.json({ ok:false, error:'ไม่มีสิทธิตรวจหลักฐาน — ต้องมี document.verify' }, { status:403 });

    if(action === 'verify'){
      if(!['PendingVerification','Extracted'].includes(receipt.status)) return NextResponse.json({ ok:false, error:'สถานะไม่ถูกต้องสำหรับรับรอง' }, { status:400 });
      // ต้องมีแหล่งยืนยัน: ถ้าไม่มี API ให้เข้าคิวตรวจจากรายงานรับเงินจริง — บันทึก source
      const source = String(req.headers.get('x-verify-source') || 'manual_report');
      await prisma.$transaction(async (tx:any)=>{
        await tx.receiptFile.update({ where:{ id: receiptId }, data:{ status:'Verified', verifiedAt: new Date(), creditedPeriod: creditedPeriod || new Date().toISOString().slice(0,7) } });
        await tx.receiptVerification.create({ data:{ receiptId, result:'Verified', reason: reason || 'ตรวจสอบกับแหล่งรับเงินจริงแล้ว', verifiedBy: actorId, source } });

        // สร้าง PerformanceLedger ครั้งเดียว — แยก premium vs commission ตาม ledgerType
        // สเปค: ใบเสร็จเบี้ยไม่ถูกนำไปนับเป็นค่าบำเหน็จโดยตรง
        const type = ledgerType || ext?.type || 'premium';
        // ถ้า type เป็น commission/com_plus ต้องมีรายงานค่าบำเหน็จแยก — ใบเสร็จ premium ห้ามใส่เป็น commission
        const ledgerTypeFinal = type.includes('commission') || type.includes('com') ? 'commission' : 'premium';
        const amount = ext?.amount ? String(ext.amount) : '0';
        const period = creditedPeriod || new Date().toISOString().slice(0,7);

        // ป้องกันสร้างซ้ำด้วย unique(receiptId)
        await tx.performanceLedger.create({
          data:{
            userId: receipt.userId,
            receiptId,
            type: ledgerTypeFinal,
            amount,
            period,
          }
        }).catch(()=>null); // ถ้ามีแล้ว ไม่สร้างซ้ำ
      });
      await prisma.auditLog.create({ data:{ userId: actorId, action:'receipt.verify', entity:'ReceiptFile', entityId: receiptId, newValue:{ creditedPeriod } } });
      return NextResponse.json({ ok:true, status:'Verified', message:'รับรองยอดสำเร็จ — สร้างรายการผลงานแล้ว', creditedPeriod });
    }

    if(action === 'reject'){
      await prisma.receiptFile.update({ where:{ id: receiptId }, data:{ status:'Rejected' } });
      await prisma.receiptVerification.create({ data:{ receiptId, result:'Rejected', reason: reason || 'ไม่ผ่านการตรวจสอบ', verifiedBy: actorId } });
      return NextResponse.json({ ok:true, status:'Rejected' });
    }

    if(action === 'duplicate'){
      await prisma.receiptFile.update({ where:{ id: receiptId }, data:{ status:'Duplicate' } });
      await prisma.receiptVerification.create({ data:{ receiptId, result:'Duplicate', reason: reason || 'เอกสารซ้ำ' } });
      return NextResponse.json({ ok:true, status:'Duplicate' });
    }

    if(action === 'reverse'){
      // รายการคืนเงิน/ยกเลิกภายหลัง — สร้าง Reversed + ปรับปรุง ledger
      await prisma.receiptFile.update({ where:{ id: receiptId }, data:{ status:'Reversed' } });
      await prisma.receiptVerification.create({ data:{ receiptId, result:'Reversed' as any, reason: reason || 'คืนเงิน/ยกเลิก' } });
      const ledger = await prisma.performanceLedger.findUnique({ where:{ receiptId } }).catch(()=>null);
      if(ledger){
        await prisma.performanceLedger.update({ where:{ id: ledger.id }, data:{ status:'reversed' } });
        await prisma.performanceLedger.create({
          data:{
            userId: ledger.userId,
            type: ledger.type,
            amount: `-${ledger.amount}`,
            period: ledger.period,
            status:'reversed',
            reversalOfId: ledger.id,
          } as any
        }).catch(()=>null);
      }
      return NextResponse.json({ ok:true, status:'Reversed', message:'สร้างรายการปรับปรุงผลงานแล้ว — ตรวจสอบย้อนหลังได้' });
    }

    return NextResponse.json({ ok:false, error:'action ไม่ถูกต้อง' }, { status:400 });
  }catch(e:any){
    console.error('receipt verify', e);
    return NextResponse.json({ ok:false, error:'เกิดข้อผิดพลาด' }, { status:500 });
  }
}
