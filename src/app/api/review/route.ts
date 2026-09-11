import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

// POST /api/review { reason } + GET ดูของตัวเอง, PUT อนุมัติ/ปฏิเสธ (ต้องมีสิทธิ)
export async function GET(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if(!token) return NextResponse.json({ error:'กรุณาเข้าสู่ระบบ'},{status:401});
    let p:any; try{ p=verifyToken(token);}catch{ return NextResponse.json({error:'โทเค็นไม่ถูกต้อง'},{status:401});}
    const uid = p.sub||p.id;
    const list: any = await prisma.reviewRequest.findMany({ where: p.roles?.includes('admin') ? {} : { userId: uid }, orderBy:{ createdAt:'desc' }, take:50 });
    const history: any = await prisma.membershipStatusHistory.findMany({ where:{ userId: uid }, orderBy:{ createdAt:'desc' }, take:20 });
    return NextResponse.json({ ok:true, reviews: list, history });
  }catch(e:any){ return NextResponse.json({error:e?.message||'error'},{status:500});}
}
export async function POST(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if(!token) return NextResponse.json({ error:'กรุณาเข้าสู่ระบบ'},{status:401});
    let p:any; try{ p=verifyToken(token);}catch{ return NextResponse.json({error:'โทเค็นไม่ถูกต้อง'},{status:401});}
    const body = await req.json();
    const { reason } = body;
    if(!reason || String(reason).length < 10) return NextResponse.json({ error:'กรุณาระบุเหตุผลอย่างน้อย 10 ตัวอักษร'},{status:400});
    const uid = p.sub||p.id;
    const rr: any = await prisma.reviewRequest.create({ data:{ userId: uid, reason: String(reason), status:'pending' } as any });
    return NextResponse.json({ ok:true, review: rr });
  }catch(e:any){ return NextResponse.json({error:e?.message||'error'},{status:500});}
}
export async function PUT(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if(!token) return NextResponse.json({ error:'กรุณาเข้าสู่ระบบ'},{status:401});
    let p:any; try{ p=verifyToken(token);}catch{ return NextResponse.json({error:'โทเค็นไม่ถูกต้อง'},{status:401});}
    if(!p.roles?.includes('admin')) return NextResponse.json({error:'ต้องเป็นผู้ดูแล'},{status:403});
    const body = await req.json();
    const { reviewId, status } = body;
    if(!reviewId || !['approved','rejected'].includes(status)) return NextResponse.json({error:'ต้องระบุ reviewId และ status'},{status:400});
    const r: any = await prisma.reviewRequest.findUnique({ where:{ id: reviewId } });
    if(!r) return NextResponse.json({error:'ไม่พบคำขอ'},{status:404});
    const upd: any = await prisma.reviewRequest.update({ where:{ id: reviewId }, data:{ status, decidedBy: p.sub||p.id, decidedAt: new Date() } as any });
    if(status==='approved'){
      // คืนสถานะ: ACTIVE + isActive true + ลบผล removed/suspended รอบนั้น
      await prisma.user.update({ where:{ id: r.userId }, data:{ status:'ACTIVE' } as any }).catch(()=>{});
      await prisma.treeNode.update({ where:{ userId: r.userId }, data:{ isActive:true } as any }).catch(()=>{});
      await prisma.membershipStatusHistory.create({ data:{ userId: r.userId, fromStatus:'SUSPENDED', toStatus:'ACTIVE', reason:'คืนสถานะตามผลทบทวน', changedBy: p.sub||p.id } as any });
      await prisma.maintenanceResult.updateMany({ where:{ userId: r.userId, status:{ in:['removed','suspended'] } }, data:{ status:'pending_review', reason:'รอคำนวณใหม่หลังคืนสถานะ' } as any });
    }
    return NextResponse.json({ ok:true, review: upd });
  }catch(e:any){ return NextResponse.json({error:e?.message||'error'},{status:500});}
}
