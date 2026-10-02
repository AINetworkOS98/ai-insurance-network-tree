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
    // จำนวนหน่วย/ศูนย์/ภาคที่ผ่านคุณสมบัติ — นับจากผังจริง และใช้ "นิยามเดียวกันทั้งระบบ":
    // 1 ช่องตรง (slot) ใต้สมาชิก = 1 หน่วย เมื่อในสายนั้นมีสมาชิก ACTIVE ที่มียศ >= 2 (หัวหน้าหน่วย)
    // ศูนย์ = มี >= 3 (ผู้จัดการศูนย์), ภาค = มี >= 4 (ผู้จัดการภาค)
    // (เดิมนับ "หน่วย" เพียงมีสมาชิก ACTIVE คนใดก็ได้ ⇒ นับเกินจริง ไม่ตรงกับที่ /api/income/summary ใช้)
    if(rule.qualifiedUnits != null || rule.qualifiedCenters != null || (rule as any).qualifiedRegions != null){
      const myNode: any = await prisma.treeNode.findUnique({ where:{ userId } }).catch(()=>null);
      let units = 0, centers = 0, regions = 0;
      if(myNode){
        const placements: any[] = await prisma.treePlacement.findMany({ where:{ parentId: myNode.id }, select:{ childId:true } });
        const allNodes: any[] = await prisma.treeNode.findMany({ select:{ id:true, userId:true } });
        const allP: any[] = await prisma.treePlacement.findMany({ select:{ parentId:true, childId:true } });
        const id2user = new Map<string,string>();
        for(const n of allNodes) id2user.set(n.id, n.userId);
        const kids = new Map<string,string[]>();
        for(const p of allP){
          const pu = id2user.get(p.parentId);
          if(!pu) continue;
          const l = kids.get(pu) || []; l.push(p.childId); kids.set(pu, l);
        }
        const descendantsOf = (childUserId: string) => {
          const out: string[] = [];
          const q = [childUserId]; const seen = new Set<string>([childUserId]);
          while(q.length){
            const cur = q.shift()!;
            for(const c of (kids.get(cur) || [])){ if(!seen.has(c)){ seen.add(c); out.push(c); q.push(c); } }
          }
          return out;
        };
        for(const p of placements){
          const sub = descendantsOf(p.childId);
          const ids = [p.childId, ...sub];
          const members: any[] = await prisma.user.findMany({ where:{ id:{ in: ids }, status:'ACTIVE' }, select:{ rankLevel:true } });
          if(!members.length) continue;
          const topRank = Math.max(...members.map((m:any)=> Number(m.rankLevel ?? 0)));
          if(topRank >= 2) units++;
          if(topRank >= 3) centers++;
          if(topRank >= 4) regions++;
        }
      }
      if(rule.qualifiedUnits != null && units < Number(rule.qualifiedUnits)){ missing.push(`หน่วยที่ผ่านคุณสมบัติ ${units} / ${Number(rule.qualifiedUnits)}`); allPass=false; }
      if(rule.qualifiedCenters != null && centers < Number(rule.qualifiedCenters)){ missing.push(`ศูนย์ที่ผ่านคุณสมบัติ ${centers} / ${Number(rule.qualifiedCenters)}`); allPass=false; }
      if((rule as any).qualifiedRegions != null && regions < Number((rule as any).qualifiedRegions)){ missing.push(`ภาคที่ผ่านคุณสมบัติ ${regions} / ${Number((rule as any).qualifiedRegions)}`); allPass=false; }
    }
    // ระยะเวลาอยู่ในตำแหน่ง (นับจากเลื่อนขั้นครั้งล่าสุด): ต้องไม่น้อยกว่าเกณฑ์ขั้นต่ำ
    // นับด้วยเวลา Asia/Bangkok (เดิมใช้วันที่ local ของเซิร์ฟเวอร์ ⇒ คลาดได้ 1 เดือนช่วงต้น/ปลายเดือน)
    if(rule.durationMinMonths != null){
      const base = (user as any).rankUpdatedAt || (user as any).createdAt || new Date();
      const bkk = (d: Date) => { const t = new Date(new Date(d).getTime() + 7 * 3600 * 1000); return { y: t.getUTCFullYear(), m: t.getUTCMonth() }; };
      const a = bkk(base); const b = bkk(new Date());
      const tenure = (b.y - a.y) * 12 + (b.m - a.m);
      if(tenure < Number(rule.durationMinMonths)){ missing.push(`ระยะเวลาในตำแหน่ง ${tenure} / ${Number(rule.durationMinMonths)} เดือน`); allPass=false; }
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
  await prisma.auditLog.create({ data:{ userId: approvedById || userId, action:'rank.promoted', entity:'User', entityId:userId, oldValue:{ rankLevel: ev.currentRank } as any, newValue:{ rankLevel: ev.targetRank } as any, reason: plan?.version || '' } });
  // แจ้งเตือนขึ้นตำแหน่ง: ตัวเอง + ผู้บริหารระบบ
  try{
    const { emitNotification, notifyAdmins } = await import('@/lib/notify');
    const nm = RANK_CATALOG.find(r=> r.level===ev.targetRank)?.nameTh || `ระดับ ${ev.targetRank}`;
    await emitNotification({ userId, type:'rank_promoted', title:`เลื่อนตำแหน่งเป็น${nm}`, body:'ยินดีด้วย — ดูเส้นทางต่อได้ที่เมนูขึ้นตำแหน่ง', referenceId:'/career' }).catch(()=>null);
    await notifyAdmins({ type:'rank_promoted', title:'สมาชิกเลื่อนตำแหน่ง', body:`${(user as any)?.displayName || userId} → ${nm}`, referenceId:'/admin/members' });
  }catch{}
  return { ok:true as const, result:'promoted', message:`เลื่อนตำแหน่ง ${RANK_CATALOG.find(r=> r.level===ev.targetRank)?.nameTh} สำเร็จ`, currentRank: ev.targetRank };
}
