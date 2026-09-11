import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

// GET /api/maintenance — รายการแผน, POST สร้างแผน, PUT สลับ Draft/Active/Archived
export async function GET(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if(!token) return NextResponse.json({ error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    const plans: any = await prisma.maintenancePlan.findMany({ include:{ rules:true }, orderBy:{ createdAt:'desc' } });
    return NextResponse.json({ ok:true, plans });
  }catch(e:any){ return NextResponse.json({ error:e?.message||'error'},{status:500});}
}
export async function POST(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if(!token) return NextResponse.json({ error:'กรุณาเข้าสู่ระบบ'},{status:401});
    let p:any; try{ p=verifyToken(token);}catch{ return NextResponse.json({error:'โทเค็นไม่ถูกต้อง'},{status:401});}
    const body = await req.json();
    const { name, kind, metric, cycle, graceMonths, allowedFailCycles, rules, isLegacyRef } = body;
    if(!name || !metric) return NextResponse.json({ error:'ต้องระบุ name และ metric'},{status:400});
    const plan: any = await prisma.maintenancePlan.create({
      data:{
        name, kind: kind|| (cycle==='quarterly' ? 'quarterly':'monthly'), metric, cycle: cycle|| (kind==='quarterly'?'quarterly':'monthly'),
        status:'Draft', graceMonths: graceMonths ?? 0, allowedFailCycles: allowedFailCycles ?? 1, isLegacyRef: !!isLegacyRef, createdBy: p.sub||p.id,
        rules: rules?.length ? { create: rules.map((r:any)=>({ targetRank:Number(r.targetRank), minAmount:String(r.minAmount), resultType:r.resultType||'warning', label:r.label||null })) } : undefined
      } as any, include:{ rules:true }
    });
    // seed ไตรมาส 2569 ถ้า isLegacyRef และไม่มี rules
    if(isLegacyRef && !rules?.length){
      const seed = [
        { targetRank:1, minAmount:'3000', resultType:'warning', label:'ป้องกันสตาร์/แก้สตาร์ 3,000' },
        { targetRank:2, minAmount:'7500', resultType:'warning', label:'ป้องกันสตาร์ 7,500 / แก้สตาร์ 10,000 — ต้องแยก 2 เกณฑ์' },
        { targetRank:3, minAmount:'30000', resultType:'warning', label:'ป้องกัน/แก้ 30,000 — บุคลากร 3 หน่วย' },
      ];
      for(const s of seed) await prisma.maintenanceRule.create({ data:{ planId: plan.id, ...s } as any });
    }
    const full = await prisma.maintenancePlan.findUnique({ where:{ id: plan.id }, include:{ rules:true } });
    return NextResponse.json({ ok:true, plan: full });
  }catch(e:any){ return NextResponse.json({error:e?.message||'error'},{status:500});}
}
export async function PUT(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if(!token) return NextResponse.json({ error:'กรุณาเข้าสู่ระบบ'},{status:401});
    let p:any; try{ p=verifyToken(token);}catch{ return NextResponse.json({error:'โทเค็นไม่ถูกต้อง'},{status:401});}
    const body = await req.json();
    const { planId, status } = body;
    if(!planId || !['Draft','Active','Archived'].includes(status)) return NextResponse.json({error:'ต้องระบุ planId และ status'},{status:400});
    const plan: any = await prisma.maintenancePlan.findUnique({ where:{ id: planId }, include:{ rules:true }});
    if(!plan) return NextResponse.json({error:'ไม่พบแผน'},{status:404});
    if(status==='Active'){
      if(!plan.rules?.length) return NextResponse.json({error:'แผนไม่มีกฎ — ห้าม Active'},{status:400});
      if(plan.isLegacyRef) return NextResponse.json({error:'แผนอ้างอิงไตรมาส 2569 ห้าม Active — สร้างแผนรายเดือนจริงแยก ไม่หาร 3'},{status:400});
      // Active ได้เฉพาะ kind เดียวละ 1 (monthly 1, quarterly 1)
      await prisma.maintenancePlan.updateMany({ where:{ kind: plan.kind, status:'Active' }, data:{ status:'Archived' } as any });
    }
    const upd = await prisma.maintenancePlan.update({ where:{ id: planId }, data:{ status } as any, include:{ rules:true } });
    await prisma.auditLog.create({ data:{ userId: p.sub||p.id, action:'maintenance_plan.status', entity:'MaintenancePlan', entityId: planId, oldValue:{ status: plan.status } as any, newValue:{ status } as any } as any });
    return NextResponse.json({ ok:true, plan: upd });
  }catch(e:any){ return NextResponse.json({error:e?.message||'error'},{status:500});}
}
