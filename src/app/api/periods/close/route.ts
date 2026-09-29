import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { isAdminFromPayload } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import { closePeriodJob, previousPeriod, monthBounds } from '@/lib/periodEngine';

// POST /api/periods/close { period } — ปิดยอด (ต้อง period.close), idempotent
// POST /api/periods/close { auto:true } — ตัดยอดเดือนก่อนอัตโนมัติถ้าพ้นเที่ยงคืนสิ้นเดือนแล้ว
export async function POST(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if(!token) return NextResponse.json({ error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    let payload: any; try{ payload = verifyToken(token); }catch{ return NextResponse.json({ error:'โทเค็นไม่ถูกต้อง' }, { status:401 }); }
    // สิทธิ: admin (จากโทเคน/อีเมล Admin/role ใน DB) หรือ role finance ใน DB
    const isAdminUser = await isAdminFromPayload(payload);
    let allowed = isAdminUser;
    if(!allowed){
      const rows = await prisma.userRole.findMany({ where:{ userId: String((payload as any).sub) }, include:{ role:true } }).catch(()=>[] as any[]);
      allowed = (rows as any[]).some((r:any)=> String(r?.role?.code||'').toLowerCase() === 'finance');
    }
    if(!allowed) return NextResponse.json({ error:'ต้องเป็นผู้ดูแลระบบหรือฝ่ายการเงิน' }, { status:403 });
    const body = await req.json().catch(()=> ({} as any));
    if(body.auto){
      // ตัดยอดเดือนก่อน — เฉพาะเมื่อพ้น cutoff สิ้นเดือนนั้นแล้ว
      const target = previousPeriod();
      const { endAt } = monthBounds(target);
      if(new Date() < endAt) return NextResponse.json({ ok:false, error:`ยังไม่ถึงเวลาตัดยอด ${target} (สิ้นเดือน 24:00 น.)` }, { status:400 });
      const res: any = await closePeriodJob(target, payload.sub || payload.id);
      return NextResponse.json({ ok:true, ...res, period: target, mode:'auto' });
    }
    const { period } = body;
    if(!period) return NextResponse.json({ error:'ต้องระบุ period (YYYY-MM)' }, { status:400 });
    const res: any = await closePeriodJob(period, payload.sub || payload.id);
    return NextResponse.json({ ok:true, ...res, period });
  }catch(e:any){ return NextResponse.json({ error:e?.message || 'error' }, { status:500 }); }
}
