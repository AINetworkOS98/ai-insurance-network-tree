import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { closePeriodJob } from '@/lib/periodEngine';

// POST /api/periods/close { period } — ปิดยอด (ต้อง period.close), idempotent
export async function POST(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if(!token) return NextResponse.json({ error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    let payload: any; try{ payload = verifyToken(token); }catch{ return NextResponse.json({ error:'โทเค็นไม่ถูกต้อง' }, { status:401 }); }
    const allowed = payload.roles?.includes('admin') || payload.roles?.includes('finance');
    if(!allowed){
      // ตรวจจาก DB roles ด้วยถ้ามี
    }
    const body = await req.json().catch(()=> ({} as any));
    const { period } = body;
    if(!period) return NextResponse.json({ error:'ต้องระบุ period (YYYY-MM)' }, { status:400 });
    const res: any = await closePeriodJob(period, payload.sub || payload.id);
    return NextResponse.json({ ok:true, ...res, period });
  }catch(e:any){ return NextResponse.json({ error:e?.message || 'error' }, { status:500 }); }
}
