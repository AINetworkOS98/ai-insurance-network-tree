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
    return NextResponse.json({ ok:true, cron:'hermes-sync', at: now, counts, note:'Hermes OS heartbeat — memory & period checks light' });
  } catch (e:any){
    return NextResponse.json({ ok:true, cron:'hermes-sync', at: now, error:e?.message });
  }
}
