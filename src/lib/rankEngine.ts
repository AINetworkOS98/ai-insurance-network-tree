import { prisma } from '@/lib/prisma';
import { RANK_CATALOG } from '@/lib/rankCatalog';

// หมวด 6: เลื่อน/ลดตำแหน่ง ตามแผน Active เท่านั้น — Draft ไม่คำนวณจริง ไม่ใช้ผัง 1 แตก 5
export async function evaluateRank(userId: string){
  const user = await prisma.user.findUnique({ where:{ id: userId } });
  if(!user) return { ok:false as const, error:'ไม่พบผู้ใช้' };

  const plan: any = await prisma.rankPlan.findFirst({ where:{ status:'Active' }, include:{ rules:true } });
  if(!plan) return { ok:true as const, result:'evaluated_incomplete', message:'ยังตั้งค่าเกณฑ์ไม่ครบ', missing:['ไม่มีแผน Active — กรุณาตั้งค่าแผนก่อน'], currentRank: user.rankLevel };
  if(!plan.rules?.length) return { ok:true as const, result:'evaluated_incomplete', message:'ยังตั้งค่าเกณฑ์ไม่ครบ', missing:['แผน Active ไม่มีกฎ — กรุณาเพิ่ม RankRule'], currentRank: user.rankLevel };

  const curr = user.rankLevel ?? 0;
  const target = curr + 1;
  if(target > 4) return { ok:true as const, result:'at_top', message:'ถึงระดับสูงสุดแล้ว', currentRank: curr };

  const rules = plan.rules.filter((r:any)=> r.targetRank===target);
  if(!rules.length) return { ok:true as const, result:'evaluated_incomplete', message:'ยังตั้งค่าเกณฑ์ไม่ครบ', missing:[`แผน Active ไม่มีกฎสำหรับระดับ ${target}`], currentRank: curr };

  // ผลงานรับรองจาก PerformanceLedger type ที่ตรง metric (ห้ามใช้เบี้ยแทน COM โดยไม่มีนิยาม)
  const missing: string[] = [];
  let allPass = true;
  for(const rule of rules){
    const ledgerRows: any[] = await prisma.performanceLedger.findMany({ where:{ userId, type: rule.metric, status:'active' } });
    const personalSum = ledgerRows.reduce((s:any,r:any)=> s + Number(r.amount), 0);
    if(rule.personalMin != null && personalSum < Number(rule.personalMin)){
      missing.push(`${rule.metric} ส่วนตัว ${personalSum} < ${Number(rule.personalMin)}`);
      allPass = false;
    }
    if(rule.teamMin != null){
      // ยอดทีม: รวม ledger ของลูกทีมใต้ managerId (โครงสร้างบังคับบัญชา ไม่ใช่ผัง 1 แตก 5)
      const teamMembers: any[] = await prisma.user.findMany({ where:{ managerId: userId }, select:{ id:true } });
      const teamIds = teamMembers.map((m:any)=> m.id);
      const teamRows: any[] = teamIds.length ? await prisma.performanceLedger.findMany({ where:{ userId:{ in: teamIds }, type: rule.metric, status:'active' } }) : [];
      const teamSum = teamRows.reduce((s:any,r:any)=> s + Number(r.amount), 0);
      if(teamSum < Number(rule.teamMin)){ missing.push(`${rule.metric} ทีม ${teamSum} < ${Number(rule.teamMin)}`); allPass=false; }
    }
    if(rule.licenseRequired){
      const profile: any = await prisma.memberProfile.findUnique({ where:{ userId } });
      if(profile?.licenseStatus !== 'approved'){ missing.push('ต้องสอบใบอนุญาตตัวแทนประกันชีวิตและผ่านอนุมัติ'); allPass=false; }
    }
    // qualifiedUnits / qualifiedCenters / duration — ถ้ากำหนดไว้ต้องตรวจ, ไม่เดาค่า
    if(rule.qualifiedUnits != null || rule.qualifiedCenters != null){
      missing.push('นิยามหน่วย/ศูนย์ที่ผ่านคุณสมบัติยังไม่ยืนยัน — กดตรวจสอบรายละเอียด');
      // ถือว่าไม่ครบจนยืนยันนิยาม
      allPass = false;
    }
  }

  if(!allPass) return { ok:true as const, result:'evaluated_incomplete', message:'ยังตั้งค่าเกณฑ์ไม่ครบ / ผลงานไม่ครบ', missing, currentRank: curr };

  if(rules.some((r:any)=> r.evalType==='approval')){
    return { ok:true as const, result:'pending_approval', message:'มีคุณสมบัติครบ — รอผู้มีสิทธิอนุมัติ', missing:[], currentRank: curr, targetRank: target, evalType:'approval' };
  }
  return { ok:true as const, result:'qualified_auto', message:'มีคุณสมบัติครบ — พร้อมเลื่อนอัตโนมัติ', missing:[], currentRank: curr, targetRank: target, evalType:'auto' };
}

export async function applyRankPromotion(userId: string, approvedById?: string){
  const ev: any = await evaluateRank(userId);
  if(ev.result !== 'qualified_auto') return ev;
  const user: any = await prisma.user.findUnique({ where:{ id: userId } });
  const plan: any = await prisma.rankPlan.findFirst({ where:{ status:'Active' } });
  const updated = await prisma.user.update({ where:{ id: userId }, data:{ rankLevel: ev.targetRank, rankUpdatedAt: new Date() } });
  await prisma.rankHistory.create({ data:{ userId, fromRank: ev.currentRank, toRank: ev.targetRank, planId: plan?.id || null, result:'promoted', reason: approvedById ? `อนุมัติโดย ${approvedById}` : 'เลื่อนอัตโนมัติตามแผน Active', snapshot: { evaluatedAt: new Date().toISOString() } as any } });
  await prisma.auditLog.create({ data:{ userId: approvedById || userId, action:'rank.promoted', entity:'User', entityId: userId, oldValue:{ rankLevel: ev.currentRank } as any, newValue:{ rankLevel: ev.targetRank } as any, reason: plan?.version || '' } });
  return { ok:true as const, result:'promoted', message:`เลื่อนตำแหน่ง ${RANK_CATALOG.find(r=> r.level===ev.targetRank)?.nameTh} สำเร็จ`, currentRank: ev.targetRank };
}
