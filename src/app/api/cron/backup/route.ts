import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCronAuth } from '@/lib/cronAuth';

// Vercel Cron — สำรองข้อมูลสมาชิกทุกชั่วโมง + เติมช่องว่างอัตโนมัติเมื่อฐานกลับมา
export const runtime = 'nodejs';
export const maxDuration = 120;
export async function GET(req: NextRequest){
  const denied = requireCronAuth(req);
  if (denied) return denied;
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
    
    // ตรวจสอบและเลื่อนตำแหน่งอัตโนมัติสำหรับสมาชิกที่คุณสมบัติครบ
    let autoPromote: any = null;
    try{
      const eligibleUsers = await prisma.user.findMany({
        where: { rankLevel: { gte: 0, lt: 4 }, status: 'ACTIVE' },
        select: { id: true, rankLevel: true }
      });
      for(const u of eligibleUsers){
        try{
          const { evaluateRank, applyRankPromotion } = await import('@/lib/rankEngine');
          const ev: any = await evaluateRank(u.id);
          if(ev.ok && ev.result === 'qualified_auto'){
            const res: any = await applyRankPromotion(u.id, 'system');
            if(res.result === 'promoted'){
              const { emitNotification, notifyAdmins } = await import('@/lib/notify');
              const { RANK_CATALOG } = await import('@/lib/rankCatalog');
              const nm = RANK_CATALOG.find(r=> r.level === res.targetRank)?.nameTh || `ระดับ ${res.targetRank}`;
              await emitNotification({ userId: u.id, type:'rank_promoted', title:`เลื่อนตำแหน่งเป็น${nm}`, body:'ยินดีด้วย — ดูเส้นทางต่อได้ที่เมนูขึ้นตำแหน่ง', referenceId:'/career' }).catch(()=>null);
              await notifyAdmins({ type:'rank_promoted', title:'สมาชิกเลื่อนตำแหน่งอัตโนมัติ', body:`เลื่อนจาก ${res.currentRankNameTh} เป็น ${nm}`, referenceId:'/admin/members' });
            }
          }
        }catch{}
      }
      autoPromote = { ok: true };
    }catch(e:any){ autoPromote = { ok:false, error: e?.message }; }
    
    return NextResponse.json({ ok:true, cron:'backup', backup, autofill, health: after, autoPromote });
  }catch(e:any){
    return NextResponse.json({ ok:false, error: e?.message || 'backup cron failed' }, { status:500 });
  }
}
