import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { ensurePeriod, getBangkokPeriod } from '@/lib/periodEngine';

// GET /api/periods — ดูรอบทั้งหมด + snapshot ของตัวเอง
export async function GET(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if(!token) return NextResponse.json({ error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    let payload: any; try{ payload = verifyToken(token); }catch{ return NextResponse.json({ error:'โทเค็นไม่ถูกต้อง' }, { status:401 }); }
    const userId = payload.sub || payload.id;
    const periods: any = await prisma.calendarPeriod.findMany({ orderBy:{ period:'desc' }, take:24 });
    const snaps: any = await prisma.monthlySnapshot.findMany({ where:{ userId }, orderBy:{ period:'desc' }, take:12 });
    const cur = getBangkokPeriod();
    await ensurePeriod(cur);
    return NextResponse.json({ ok:true, currentPeriod: cur, periods, snapshots: snaps });
  }catch(e:any){ return NextResponse.json({ error:e?.message || 'error' }, { status:500 }); }
}

// POST /api/periods — สร้างรอบ + กฎ cutoff (ต้อง period.close)
export async function POST(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if(!token) return NextResponse.json({ error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    let payload: any; try{ payload = verifyToken(token); }catch{ return NextResponse.json({ error:'โทเค็นไม่ถูกต้อง' }, { status:401 }); }
    const body = await req.json();
    const { period, cutoffAt, kind, note } = body;
    // สร้าง CalendarPeriod ถ้าระบุ period
    if(period){
      const exist: any = await prisma.calendarPeriod.findUnique({ where:{ period } });
      if(exist) return NextResponse.json({ ok:true, period: exist });
      const { monthBounds } = await import('@/lib/periodEngine');
      const { startAt, endAt } = monthBounds(period);
      const cal: any = await prisma.calendarPeriod.create({ data:{ period, startAt, endAt, cutoffAt: cutoffAt ? new Date(cutoffAt) : null, status:'Open' } as any });
      if(kind && cutoffAt) await prisma.periodRule.create({ data:{ kind, period, cutoffAt: new Date(cutoffAt), note: note || null } as any }).catch(()=>{});
      return NextResponse.json({ ok:true, period: cal });
    }
    if(kind && cutoffAt){
      const pr: any = await prisma.periodRule.create({ data:{ kind, period: period || null, cutoffAt: new Date(cutoffAt), note: note || null } as any });
      return NextResponse.json({ ok:true, rule: pr });
    }
    return NextResponse.json({ error:'ต้องระบุ period หรือ kind+cutoffAt' }, { status:400 });
  }catch(e:any){ return NextResponse.json({ error:e?.message || 'error' }, { status:500 }); }
}
