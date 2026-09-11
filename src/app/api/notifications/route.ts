import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

// GET /api/notifications — ศูนย์แจ้งเตือน: ค้นหา, อ่านแล้ว/ยังไม่อ่าน, ลิงก์ตามสิทธิ
export async function GET(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if(!token) return NextResponse.json({ error:'กรุณาเข้าสู่ระบบ'},{status:401});
    let p:any; try{ p=verifyToken(token);}catch{ return NextResponse.json({error:'โทเค็นไม่ถูกต้อง'},{status:401});}
    const uid = p.sub||p.id;
    const sp = new URL(req.url).searchParams;
    const q = sp.get('q')?.trim() || '';
    const unreadOnly = sp.get('unread')==='1';
    const where: any = { userId: uid };
    if(unreadOnly) where.isRead = false;
    if(q) where.OR = [{ title:{ contains: q, mode:'insensitive' } }, { body:{ contains: q, mode:'insensitive' } }, { type:{ contains: q } }];
    const list: any = await prisma.notification.findMany({ where, orderBy:{ createdAt:'desc' }, take:100 });
    const unread = await prisma.notification.count({ where:{ userId: uid, isRead:false } });
    // alias เวลาส่งจริง
    const emailStatus: any = await prisma.emailMessage.count({ where:{ toUserId: uid } }).then(c=> ({ queued: c })).catch(()=> ({}));
    return NextResponse.json({ ok:true, notifications: list, unread, emailStatus });
  }catch(e:any){ return NextResponse.json({error:e?.message||'error'},{status:500});}
}
export async function POST(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if(!token) return NextResponse.json({ error:'กรุณาเข้าสู่ระบบ'},{status:401});
    let p:any; try{ p=verifyToken(token);}catch{ return NextResponse.json({error:'โทเค็นไม่ถูกต้อง'},{status:401});}
    const uid = p.sub||p.id;
    const body = await req.json().catch(()=> ({} as any));
    const { notificationId, action } = body;
    if(action==='readAll'){
      await prisma.notification.updateMany({ where:{ userId: uid, isRead:false }, data:{ isRead:true } as any });
      return NextResponse.json({ ok:true });
    }
    if(notificationId){
      await prisma.notification.update({ where:{ id: notificationId }, data:{ isRead:true } as any }).catch(()=>{});
      return NextResponse.json({ ok:true });
    }
    return NextResponse.json({ error:'ต้องระบุ notificationId หรือ action=readAll'},{status:400});
  }catch(e:any){ return NextResponse.json({error:e?.message||'error'},{status:500});}
}
