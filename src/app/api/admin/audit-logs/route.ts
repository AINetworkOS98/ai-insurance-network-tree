import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { isAdminOrDb } from '@/lib/support';

// GET /api/admin/audit-logs — บันทึกการใช้งานจริงจากฐานข้อมูล (ผู้ดูแลระบบเท่านั้น)
// เดิมไฟล์นี้เป็น stub คืน { logs: [] } โดยไม่มี gate สิทธิ์ ทำให้หน้า /admin แท็บ "Log บันทึก"
// ต้องแสดงข้อความตัวอย่างที่ hardcode ไว้ (ผิดหลัก "ห้ามสร้างข้อมูลปลอม")
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest){
  try{
    const token =
      req.cookies.get('token')?.value ||
      req.cookies.get('auth_token')?.value ||
      (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if(!token) return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบ' }, { status:401 });

    let payload: any;
    try{ payload = verifyToken(token); }catch{ return NextResponse.json({ ok:false, error:'โทเค็นไม่ถูกต้อง' }, { status:401 }); }
    if(!(await isAdminOrDb(payload))) return NextResponse.json({ ok:false, error:'ไม่มีสิทธิ์เข้าถึง' }, { status:403 });

    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 50)));
    const action = url.searchParams.get('action') || '';
    const entity = url.searchParams.get('entity') || '';

    const where: any = {};
    if(action) where.action = { contains: action };
    if(entity) where.entity = entity;

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy:{ createdAt:'desc' },
      take: limit,
      select:{
        id:true, action:true, entity:true, entityId:true, reason:true,
        createdAt:true, userId:true, newValue:true,
        user:{ select:{ displayName:true, email:true, memberCode:true } },
      },
    }).catch(()=> []);

    return NextResponse.json({
      ok:true,
      count: logs.length,
      total: await prisma.auditLog.count().catch(()=> 0),
      logs,
    }, { headers:{ 'Cache-Control':'no-store' } });
  }catch{
    return NextResponse.json({ ok:false, error:'อ่านบันทึกไม่สำเร็จ' }, { status:500 });
  }
}
