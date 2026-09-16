import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { monthEndSchedule, currentPeriod, toBuddhistLabel } from '@/lib/periodEngine';

// GET /api/periods/schedule — ตารางตัดยอดสิ้นเดือน 12 เดือน + สถานะ auto-close
// สมาชิกทุกคนดูได้ (ใช้ตรวจสอบ) — ตั้งค่า auto-close ต้องมี period.close
export async function GET(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if(!token) return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    try{ verifyToken(token); }catch{ return NextResponse.json({ ok:false, error:'โทเค็นไม่ถูกต้อง' }, { status:401 }); }
    const rule: any = await prisma.periodRule.findUnique({ where:{ kind_period: { kind:'monthly_auto_close', period:'*' } } }).catch(()=>null);
    return NextResponse.json({
      ok:true,
      currentPeriod: currentPeriod(),
      currentLabel: toBuddhistLabel(currentPeriod()),
      autoClose: !!rule,
      autoCloseNote: rule?.note || null,
      schedule: monthEndSchedule(12),
    });
  }catch(e:any){ return NextResponse.json({ ok:false, error:e?.message || 'error' }, { status:500 }); }
}

// PUT /api/periods/schedule { autoClose: boolean } — เปิด/ปิดตัดยอดสิ้นเดือนอัตโนมัติ (ต้อง period.close)
export async function PUT(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if(!token) return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    let payload:any; try{ payload = verifyToken(token); }catch{ return NextResponse.json({ ok:false, error:'โทเค็นไม่ถูกต้อง' }, { status:401 }); }
    // เปิด/ปิดตัดยอดอัตโนมัติได้เฉพาะผู้บริหารระบบ / Admin Akarapol เท่านั้น
    const { isSystemAdmin } = await import('@/lib/admin');
    if(!(await isSystemAdmin(payload.sub)).ok) return NextResponse.json({ ok:false, error:'เปลี่ยนได้เฉพาะผู้บริหารระบบ / Admin Akarapol' }, { status:403 });
    const body = await req.json().catch(()=> ({}));
    if(body.autoClose){
      await prisma.periodRule.upsert({
        where:{ kind_period: { kind:'monthly_auto_close', period:'*' } },
        create:{ kind:'monthly_auto_close', period:'*', cutoffAt: new Date(), note:'ตัดยอดอัตโนมัติทุกวันสิ้นเดือน 24:00 น. (ปีพุทธศักราช)' },
        update:{ cutoffAt: new Date(), note:'ตัดยอดอัตโนมัติทุกวันสิ้นเดือน 24:00 น. (ปีพุทธศักราช)' },
      } as any);
      await prisma.auditLog.create({ data:{ userId: payload.sub, action:'period.auto_close_enable', entity:'PeriodRule', entityId:'monthly_auto_close' } }).catch(()=>null);
      return NextResponse.json({ ok:true, autoClose:true });
    }
    await prisma.periodRule.delete({ where:{ kind_period: { kind:'monthly_auto_close', period:'*' } } }).catch(()=>null);
    await prisma.auditLog.create({ data:{ userId: payload.sub, action:'period.auto_close_disable', entity:'PeriodRule', entityId:'monthly_auto_close' } }).catch(()=>null);
    return NextResponse.json({ ok:true, autoClose:false });
  }catch(e:any){ return NextResponse.json({ ok:false, error:e?.message || 'error' }, { status:500 }); }
}
