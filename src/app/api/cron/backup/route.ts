import { NextRequest, NextResponse } from 'next/server';

// Vercel Cron — สำรองข้อมูลสมาชิกทุกชั่วโมง + เติมช่องว่างอัตโนมัติเมื่อฐานกลับมา
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function GET(req: NextRequest){
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if(cronSecret && auth !== `Bearer ${cronSecret}` && !req.headers.get('x-vercel-cron')){
    return NextResponse.json({ ok:false, error:'forbidden' }, { status:403 });
  }
  try{
    const { runBackup, restoreMissing, systemHealth } = await import('@/lib/backup');
    const before = await systemHealth();
    const backup = await runBackup();
    // ถ้าฐานหลักเคยล่มแล้วกลับมา — เติมแถวที่หายไปทันที
    let autofill: any = null;
    if(before.db === 'up' && backup.ok){
      try{ autofill = await restoreMissing(); }catch(e:any){ autofill = { ok:false, error: e?.message }; }
    }
    const after = await systemHealth();
    return NextResponse.json({ ok:true, cron:'backup', backup, autofill, health: after });
  }catch(e:any){
    return NextResponse.json({ ok:false, error: e?.message || 'backup cron failed' }, { status:500 });
  }
}
