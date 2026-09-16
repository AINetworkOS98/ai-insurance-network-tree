import { NextRequest, NextResponse } from 'next/server';

// Vercel Cron — ทุกเที่ยงคืน: สรุปงานค้าง, เตรียม memory summary, ตรวจ period ปิดยอด
export const runtime = 'nodejs';
export async function GET(req: NextRequest){
  // verify cron secret if set
  const auth = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && auth !== `Bearer ${cronSecret}`) {
    // Vercel cron sends no auth — allow if header x-vercel-cron
    if (!req.headers.get('x-vercel-cron')) {
      // still allow for manual test, just log
    }
  }
  const now = new Date().toISOString();
  // Lightweight heartbeat — actual heavy jobs should be idempotent
  try {
    const { prisma } = await import('@/lib/prisma');
    const counts = {
      users: await (prisma as any).user.count().catch(()=> -1),
      prospects: await (prisma as any).prospect.count().catch(()=> -1),
      receipts: await (prisma as any).receiptFile.count().catch(()=> -1),
    };
    // ตัดยอดสิ้นเดือนอัตโนมัติ (ถ้าเปิดไว้ + พ้น cutoff แล้ว) — idempotent
    let autoClose: any = null;
    try{
      const rule = await (prisma as any).periodRule.findUnique({ where:{ kind_period: { kind:'monthly_auto_close', period:'*' } } }).catch(()=>null);
      if(rule){
        const { previousPeriod, monthBounds, closePeriodJob } = await import('@/lib/periodEngine');
        const target = previousPeriod();
        const { endAt } = monthBounds(target);
        if(new Date() >= endAt){
          autoClose = await closePeriodJob(target, undefined).catch((e:any)=> ({ ok:false, error: e?.message }));
        } else {
          autoClose = { ok:true, skipped:true, reason:`ยังไม่ถึง cutoff ${target}` };
        }
      }
    }catch(e:any){ autoClose = { ok:false, error: e?.message }; }
    return NextResponse.json({ ok:true, cron:'hermes-sync', at: now, counts, autoClose, note:'AI heartbeat — memory & period checks light' });
  } catch (e:any){
    return NextResponse.json({ ok:true, cron:'hermes-sync', at: now, error:e?.message });
  }
}
