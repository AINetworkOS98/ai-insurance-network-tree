import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { runMaintenanceForPeriod } from '@/lib/maintenanceEngine';

// POST /api/maintenance/run { planId, period } — รันรักษายอดรอบนั้น, idempotent ต่อ user
export async function POST(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if(!token) return NextResponse.json({ error:'กรุณาเข้าสู่ระบบ'},{status:401});
    let p:any; try{ p=verifyToken(token);}catch{ return NextResponse.json({error:'โทเค็นไม่ถูกต้อง'},{status:401});}
    const body = await req.json().catch(()=> ({} as any));
    const { planId, period } = body;
    if(!planId || !period) return NextResponse.json({ error:'ต้องระบุ planId และ period (YYYY-MM)'},{status:400});
    const res: any = await runMaintenanceForPeriod(planId, period, p.sub||p.id);
    return NextResponse.json({ ok:true, ...res, period });
  }catch(e:any){ return NextResponse.json({ error:e?.message||'error'},{status:500});}
}
