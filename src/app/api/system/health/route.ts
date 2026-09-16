import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';

function authed(req: NextRequest){
  const token = req.cookies.get('token')?.value || req.headers.get('authorization')?.replace(/^Bearer\s+/i,'') || '';
  if(!token) return null;
  try{ return verifyToken(token) as any; }catch{ return null; }
}

// GET /api/system/health — สถานะฐานหลัก/สำรอง/สำรองล่าสุด + สิทธิ admin
export async function GET(req: NextRequest){
  try{
    const payload = authed(req);
    if(!payload) return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    const { systemHealth } = await import('@/lib/backup');
    const { isSystemAdmin } = await import('@/lib/admin');
    const health = await systemHealth();
    const canRestore = (await isSystemAdmin(payload.sub).catch(()=> ({ ok:false }))).ok;
    return NextResponse.json({ ok:true, ...health, canRestore });
  }catch(e:any){ return NextResponse.json({ ok:false, error:e?.message || 'error' }, { status:500 }); }
}

// POST /api/system/health {action:'backup'|'restore', stamp?} — สำรองทันที / กู้คืน (admin เท่านั้น)
export async function POST(req: NextRequest){
  try{
    const payload = authed(req);
    if(!payload) return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    const { isSystemAdmin } = await import('@/lib/admin');
    if(!(await isSystemAdmin(payload.sub)).ok) return NextResponse.json({ ok:false, error:'เฉพาะผู้บริหารระบบ / Admin Akarapol' }, { status:403 });
    const body = await req.json().catch(()=> ({}));
    const { runBackup, restoreMissing } = await import('@/lib/backup');
    if(body.action === 'backup'){
      const r = await runBackup();
      return NextResponse.json(r);
    }
    if(body.action === 'restore'){
      const r = await restoreMissing(body.stamp);
      return NextResponse.json(r);
    }
    return NextResponse.json({ ok:false, error:'action ไม่ถูกต้อง' }, { status:400 });
  }catch(e:any){ return NextResponse.json({ ok:false, error:e?.message || 'error' }, { status:500 }); }
}
