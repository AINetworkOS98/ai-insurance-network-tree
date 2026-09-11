import { prisma } from '@/lib/prisma';
import { mirrorToFirestore } from '@/lib/firestoreMirror';

// หมวด 9: รักษายอด — แยก monthly vs quarterly, ไม่หาร 3, ไม่เดาตัวเลข
// ถ้าแผน Draft/ไม่มีกฎ -> ประเมินไม่ได้ ไม่คัดออก

export async function evaluateMaintenance(planId: string, period: string, userId: string){
  const plan: any = await prisma.maintenancePlan.findUnique({ where:{ id: planId }, include:{ rules:true } });
  if(!plan) return { ok:false as const, error:'ไม่พบแผน' };
  if(plan.status!=='Active') return { ok:true as const, status:'pending_review', reason:'แผนยังไม่ Active — ประเมินไม่ได้ ไม่คัดออก' };
  if(!plan.rules?.length) return { ok:true as const, status:'pending_review', reason:'แผนยังไม่มีกฎ — ประเมินไม่ได้ ไม่คัดออก' };

  const user: any = await prisma.user.findUnique({ where:{ id: userId } });
  if(!user) return { ok:false as const, error:'ไม่พบผู้ใช้' };
  if((user.rankLevel ?? 0)===0) return { ok:true as const, status:'passed', reason:'ผู้สนใจทั่วไป — ไม่นำมาคัด' };
  // ระยะผ่อนผันสมาชิกใหม่
  if(plan.graceMonths){
    const created = new Date(user.createdAt);
    const months = (new Date().getFullYear()-created.getFullYear())*12 + (new Date().getMonth()-created.getMonth());
    if(months < plan.graceMonths) return { ok:true as const, status:'passed', reason:`อยู่ในระยะผ่อนผัน ${plan.graceMonths} เดือน` };
  }

  const rule: any = plan.rules.find((r:any)=> r.targetRank===(user.rankLevel ?? 0));
  if(!rule) return { ok:true as const, status:'passed', reason:'ไม่มีกฎสำหรับระดับนี้' };

  // ถ้ามี receipt ที่รอตรวจในช่วงที่แผนอนุญาต -> PendingReview จนตรวจครบ
  const pendingCnt: any = await prisma.receiptFile.count({ where:{ userId, status:{ in:['Uploaded','Extracted','PendingVerification'] } } });
  if(pendingCnt>0){
    // ถ้าแผนยังอนุญาตให้รอ -> pending_review
    return { ok:true as const, status:'pending_review', reason:`มี ${pendingCnt} ใบเสร็จรอตรวจ — ห้ามคัดเพราะ OCR/ผู้ตรวจล่าช้า`, pending: pendingCnt };
  }

  // ยอดรับรองที่เข้าช่วง period — จาก MonthlySnapshot หรือ PerformanceLedger
  let verified = 0;
  if(plan.cycle==='monthly'){
    const ledgers: any[] = await prisma.performanceLedger.findMany({ where:{ userId, period, status:'active', type: plan.metric } });
    verified = ledgers.reduce((s:any,r:any)=> s + Number(r.amount), 0);
  } else {
    // quarterly: รวม 3 เดือนของไตรมาสนั้น
    const [y,m] = period.split('-').map(Number);
    const q = Math.floor((m-1)/3);
    const months = [q*3+1, q*3+2, q*3+3].map(v=> `${y}-${String(v).padStart(2,'0')}`);
    const ledgers: any[] = await prisma.performanceLedger.findMany({ where:{ userId, period:{ in: months }, status:'active', type: plan.metric } });
    verified = ledgers.reduce((s:any,r:any)=> s + Number(r.amount), 0);
  }

  const required = Number(rule.minAmount);
  const remaining = Math.max(0, required - verified);
  if(verified >= required) return { ok:true as const, status:'passed', required, verified, remaining:0, rule };

  // นับรอบไม่ผ่านต่อเนื่อง
  const fails: any = await prisma.maintenanceResult.count({ where:{ planId, userId, status:{ in:['warning','suspended'] } } });
  if(fails < (plan.allowedFailCycles-1)) return { ok:true as const, status:'warning', required, verified, remaining, reason: rule.label || 'Warning รอบแรก' };
  if((rule.resultType||'warning')==='warning') return { ok:true as const, status:'warning', required, verified, remaining };
  return { ok:true as const, status: rule.resultType as any, required, verified, remaining, reason: rule.label || '' };
}

export async function runMaintenanceForPeriod(planId: string, period: string, runBy?: string){
  const plan: any = await prisma.maintenancePlan.findUnique({ where:{ id: planId }, include:{ rules:true } });
  if(!plan) return { ok:false as const, error:'ไม่พบแผน' };
  const eligibleUsers: any[] = await prisma.user.findMany({ where:{ rankLevel:{ gte:1 }, status:{ notIn:['SUSPENDED','RESIGNED'] } } });
  let created=0;
  for(const u of eligibleUsers){
    const ev: any = await evaluateMaintenance(planId, period, u.id);
    if(!ev.ok) continue;
    // ไม่ประเมินซ้ำถ้ามีแล้ว (idempotent)
    const exists: any = await prisma.maintenanceResult.findUnique({ where:{ planId_period_userId:{ planId, period, userId: u.id } } as any }).catch(()=> null);
    if(exists) continue;
    if(ev.status==='pending_review'){
      await prisma.maintenanceResult.create({ data:{ planId, period, userId: u.id, targetRank: u.rankLevel ?? 0, required: String(ev.required || 0) as any, verified: String(ev.verified || 0) as any, remaining: String(ev.remaining || 0) as any, status:'pending_review', reason: ev.reason } as any });
      await mirrorToFirestore('maintenanceResults', `${planId}_${period}_${u.id}`, { planId, period, userId: u.id, status:'pending_review' });
      created++; continue;
    }
    if(ev.status==='passed'){
      await prisma.maintenanceResult.create({ data:{ planId, period, userId: u.id, targetRank: u.rankLevel ?? 0, required: String(ev.required||0) as any, verified: String(ev.verified||0) as any, remaining: 0 as any, status:'passed' } as any });
      created++; continue;
    }
    // warning / suspended / removed / demoted
    const status = ev.status;
    await prisma.maintenanceResult.create({ data:{ planId, period, userId: u.id, targetRank: u.rankLevel ?? 0, required: String(ev.required) as any, verified: String(ev.verified) as any, remaining: String(ev.remaining) as any, status, reason: ev.reason || '' } as any });
    // เปลี่ยนสถานะ + ประวัติ + ยกเลิก session เมื่อ suspended/removed
    if(status==='suspended' || status==='removed'){
      const from = (u as any).status;
      const to = status==='removed' ? 'RESIGNED' : 'SUSPENDED';
      await prisma.user.update({ where:{ id: u.id }, data:{ status: to as any } });
      await prisma.membershipStatusHistory.create({ data:{ userId: u.id, fromStatus: from, toStatus: to, reason:`รักษายอด ${period} ไม่ผ่าน — ${ev.reason || status}`, changedBy: runBy || null, period } as any });
      // ยกเลิก session ค้าง
      await prisma.userSession.deleteMany({ where:{ userId: u.id } });
      // คงจุดเดิมในผังเป็น isActive=false — อย่าบีบอัด/ย้ายสายงาน, ไม่รับสมาชิกใหม่ใต้ตำแหน่งไม่ใช้งาน
      const node: any = await prisma.treeNode.findUnique({ where:{ userId: u.id } }).catch(()=> null);
      if(node) await prisma.treeNode.update({ where:{ userId: u.id }, data:{ isActive:false } as any }).catch(()=> {});
      await prisma.auditLog.create({ data:{ userId: runBy || null, action:'maintenance.'+status, entity:'User', entityId: u.id, oldValue:{ status: from } as any, newValue:{ status: to } as any, reason: period } as any });
    }
    created++;
  }
  return { ok:true as const, created, eligible: eligibleUsers.length };
}
