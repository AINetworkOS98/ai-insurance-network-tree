import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

// GET /api/emails — ดูคิวส่งของตัวเอง (admin ดูทั้งหมด)
export async function GET(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if(!token) return NextResponse.json({ error:'กรุณาเข้าสู่ระบบ'},{status:401});
    let p:any; try{ p=verifyToken(token);}catch{ return NextResponse.json({error:'โทเค็นไม่ถูกต้อง'},{status:401});}
    const uid = p.sub||p.id;
    const isAdmin = p.roles?.includes('admin');
    const sp = new URL(req.url).searchParams;
    const status = sp.get('status');
    const where: any = isAdmin ? {} : { toUserId: uid };
    if(status) where.status = status;
    const list: any = await prisma.emailMessage.findMany({ where, orderBy:{ queuedAt:'desc' }, take:100 });
    const summary: any = {};
    for(const s of ['QUEUED','SENT','FAILED','PROCESSING'] as const) summary[s] = await prisma.emailMessage.count({ where: { ...where, status: s as any } }).catch(()=>0);
    const connected = !!process.env.EMAIL_API_KEY && !!process.env.EMAIL_FROM_ADDRESS;
    return NextResponse.json({ ok:true, emails: list, summary, connected });
  }catch(e:any){ return NextResponse.json({error:e?.message||'error'},{status:500});}
}
export async function POST(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if(!token) return NextResponse.json({ error:'กรุณาเข้าสู่ระบบ'},{status:401});
    let p:any; try{ p=verifyToken(token);}catch{ return NextResponse.json({error:'โทเค็นไม่ถูกต้อง'},{status:401});}
    const body = await req.json().catch(()=> ({} as any));
    const { action, messageId } = body;
    if(action==='retry' && messageId){
      // ป้องกันส่งซ้ำด้วย idempotencyKey
      const msg: any = await prisma.emailMessage.findUnique({ where:{ id: messageId } });
      if(!msg) return NextResponse.json({error:'ไม่พบข้อความ'},{status:404});
      if(msg.status==='SENT') return NextResponse.json({ ok:true, message:'ส่งแล้ว — ไม่ส่งซ้ำ' });
      await prisma.emailMessage.update({ where:{ id: messageId }, data:{ status:'QUEUED' as any, attempts:{ increment:1 } as any } });
      return NextResponse.json({ ok:true });
    }
    return NextResponse.json({ error:'ต้องระบุ action=retry และ messageId'},{status:400});
  }catch(e:any){ return NextResponse.json({error:e?.message||'error'},{status:500});}
}
