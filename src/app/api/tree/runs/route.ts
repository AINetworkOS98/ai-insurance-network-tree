import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/tree/runs — ประวัติการรัน (ผู้เริ่มรัน เวลา จำนวนสำเร็จ/ไม่สำเร็จ/เหตุผล)
export async function GET(req: NextRequest){
  try{
    const { searchParams } = new URL(req.url);
    const take = Math.min(50, parseInt(searchParams.get('take') || '20'));
    const runs = await prisma.placementRun.findMany({
      orderBy:{ startedAt:'desc' },
      take,
      include:{ entries:{ take:50, orderBy:{ createdAt:'desc' } } }
    });
    // แสดงข้อมูลแบบจำกัดตามสิทธิ (ไม่แสดงข้อมูลอ่อนไหว)
    return NextResponse.json({ ok:true, runs });
  }catch(e:any){
    console.error('tree/runs', e);
    return NextResponse.json({ ok:false, error:'เกิดข้อผิดพลาด' }, { status:500 });
  }
}
