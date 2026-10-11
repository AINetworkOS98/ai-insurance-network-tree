import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cronAuth';

// Vercel Cron — ทุกเที่ยงคืน: สรุปงานค้าง, เตรียม memory summary, ตรวจ period ปิดยอด
export const runtime = 'nodejs';
export async function GET(req: NextRequest){
  const denied = requireCronAuth(req);
  if (denied) return denied;
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

    // รักษายอด/ดีดออกอัตโนมัติ — หลังปิดยอดแล้ว ประเมินแผน Active ทุกแผน (idempotent)
    let autoMaintenance: any = null;
    try{
      const { previousPeriod } = await import('@/lib/periodEngine');
      const target = previousPeriod();
      const plans: any[] = await (prisma as any).maintenancePlan.findMany({ where:{ status:'Active' }, select:{ id:true } }).catch(()=>[]);
      if(plans.length){
        const { runMaintenanceForPeriod } = await import('@/lib/maintenanceEngine');
        const results: any[] = [];
        for(const plan of plans){
          const r: any = await runMaintenanceForPeriod(plan.id, target, 'cron').catch((e:any)=> ({ ok:false, error: e?.message }));
          results.push({ planId: plan.id, ...r });
        }
        autoMaintenance = { ok:true, period: target, plans: results };
      } else {
        autoMaintenance = { ok:true, skipped:true, reason:'ไม่มีแผนรักษายอด Active' };
      }
    }catch(e:any){ autoMaintenance = { ok:false, error: e?.message }; }

    // ── Heartbeat ให้ /api/ai/status ตรวจ "ความสดของ sync" ได้ (ไม่แก้สคีมา: ใช้ NotificationLog เดิม) ──
    let heartbeatId: string | null = null;
    let heartbeatError: string | null = null;
    try{
      const hb: any = await (prisma as any).notificationLog.create({
        data: {
          type: 'agent.log', channel: 'cron', target: 'hermes-sync', status: 'SENT',
          payload: { at: now, ok: true, counts },
          sentAt: new Date(),
        },
        select: { id: true },
      });
      heartbeatId = hb?.id ?? null;
    }catch(e:any){ heartbeatError = e?.message ?? 'heartbeat failed'; }

    return NextResponse.json({ ok:true, cron:'hermes-sync', at: now, syncedAt: now, heartbeatId, heartbeatError, counts, autoClose, autoMaintenance, note:'AI heartbeat — memory & period checks light' });
  } catch (e:any){
    return NextResponse.json({ ok:true, cron:'hermes-sync', at: now, error:e?.message });
  }
}
