import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { RANK_CATALOG } from '@/lib/rankCatalog';
import { mirrorToFirestore } from '@/lib/firestoreMirror';

// GET /api/rank-plans — ดูรายการแผน (ต้องล็อกอิน)
export async function GET(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if(!token) return NextResponse.json({ error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    const plans: any = await prisma.rankPlan.findMany({ include:{ rules:true, histories:{ take:5, orderBy:{ createdAt:'desc' } } }, orderBy:[{ status:'asc' },{ createdAt:'desc' }] });
    return NextResponse.json({ ok:true, plans });
  }catch(e:any){ return NextResponse.json({ error:e?.message || 'error' }, { status:500 }); }
}

// POST /api/rank-plans — สร้างแผน (ต้อง rank.manage)
export async function POST(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if(!token) return NextResponse.json({ error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    let payload: any; try{ payload = verifyToken(token); }catch{ return NextResponse.json({ error:'โทเค็นไม่ถูกต้อง' }, { status:401 }); }
    const userId = payload.sub || payload.id;
    // เปลี่ยนเกณฑ์ระบบได้เฉพาะผู้บริหารระบบ / Admin Akarapol เท่านั้น
    const { isSystemAdmin } = await import('@/lib/admin');
    const adm = await isSystemAdmin(userId);
    if(!adm.ok){
      // อนุญาตสร้าง Draft ได้ถ้ายังไม่มีแผนเลย (bootstrap)
      const cnt = await prisma.rankPlan.count();
      if(cnt > 0) return NextResponse.json({ error:'เปลี่ยนเกณฑ์ได้เฉพาะผู้บริหารระบบ / Admin Akarapol' }, { status:403 });
    }
    const body = await req.json();
    const { name, version, validFrom, validTo, sourceRef, isLegacyRef, rules } = body;
    if(!name || !version) return NextResponse.json({ error:'ต้องระบุ name และ version' }, { status:400 });
    const exists = await prisma.rankPlan.findUnique({ where:{ version } });
    if(exists) return NextResponse.json({ error:'เวอร์ชันนี้มีอยู่แล้ว' }, { status:409 });

    // สร้างแผน Draft เสมอ — ห้าม Active ทันทีถ้าไม่มี rules ครบ
    const plan: any = await prisma.rankPlan.create({
      data:{
        name, version, status:'Draft', validFrom: validFrom ? new Date(validFrom) : null, validTo: validTo ? new Date(validTo) : null,
        sourceRef: sourceRef || null, isLegacyRef: !!isLegacyRef, createdBy: userId,
        rules: rules?.length ? { create: rules.map((r:any)=> ({
          targetRank: Number(r.targetRank), metric: String(r.metric),
          personalMin: r.personalMin != null ? String(r.personalMin) : null,
          teamMin: r.teamMin != null ? String(r.teamMin) : null,
          qualifiedUnits: r.qualifiedUnits ?? null, qualifiedCenters: r.qualifiedCenters ?? null,
          durationMinMonths: r.durationMinMonths ?? null, durationMaxMonths: r.durationMaxMonths ?? null,
          licenseRequired: !!r.licenseRequired, evalType: r.evalType || 'auto', description: r.description || null
        })) } : undefined
      }, include:{ rules:true }
    });

    // ถ้าเป็น Draft อ้างอิงเก่า 15 Jan 64 ให้ seed กฎอ้างอิง (ห้าม Active)
    if(isLegacyRef && !rules?.length){
      // ตัวแทน: ขอ code + สอบใบอนุญาต
      // ผู้บริหารหน่วย: 20,000 บาท 1-6 เดือน
      // ผู้บริหารศูนย์: 75,000 บาท 3-6 เดือน แยกหน่วย 2
      // ผู้บริหารภาค: 1,200,000 บาท 12-24 เดือน แยกศูนย์ 4
      const seed = [
        { targetRank:1, metric:'fyc', personalMin:null as any, teamMin:null as any, qualifiedUnits:null as any, qualifiedCenters:null as any, durationMinMonths:null as any, durationMaxMonths:null as any, licenseRequired:true, evalType:'approval', description:'ขอ code และสอบใบอนุญาตตัวแทนประกันชีวิต — ต้องตรวจสถานะจริงก่อนอนุมัติ (Draft อ้างอิงเก่า 15 Jan 64)' },
        { targetRank:2, metric:'commission', personalMin:'20000', teamMin:null, qualifiedUnits:null, qualifiedCenters:null, durationMinMonths:1, durationMaxMonths:6, licenseRequired:false, evalType:'auto', description:'บำเหน็จ 20,000 บาท เวลา 1–6 เดือน — รอยืนยันความหมายช่วงสะสม/ฐานผลงาน (Draft ไม่คำนวณจริง)' },
        { targetRank:3, metric:'commission', personalMin:'75000', teamMin:null, qualifiedUnits:2, qualifiedCenters:null, durationMinMonths:3, durationMaxMonths:6, licenseRequired:false, evalType:'approval', description:'บำเหน็จ 75,000 บาท เวลา 3–6 เดือน แยกหน่วย 2 — รอยืนยันนิยามหน่วยที่ผ่านคุณสมบัติ (Draft)' },
        { targetRank:4, metric:'commission', personalMin:'1200000', teamMin:null, qualifiedUnits:null, qualifiedCenters:4, durationMinMonths:12, durationMaxMonths:24, licenseRequired:false, evalType:'approval', description:'บำเหน็จ 1,200,000 บาท เวลา 12–24 เดือน แยกศูนย์ 4 — รอยืนยันนิยามศูนย์ที่ผ่านคุณสมบัติ (Draft)' },
      ];
      for(const s of seed) await prisma.rankRule.create({ data:{ planId: plan.id, ...s } as any });
    }

    const full = await prisma.rankPlan.findUnique({ where:{ id: plan.id }, include:{ rules:true } });
    await mirrorToFirestore('rankPlans', String(plan.id), full);
    return NextResponse.json({ ok:true, plan: full });
  }catch(e:any){ return NextResponse.json({ error:e?.message || 'error' }, { status:500 }); }
}

// PUT /api/rank-plans — เปลี่ยนสถานะ Draft/Active/Archived (ต้อง rank.manage, Active ได้ 1 แผน)
export async function PUT(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if(!token) return NextResponse.json({ error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    let payload: any; try{ payload = verifyToken(token); }catch{ return NextResponse.json({ error:'โทเค็นไม่ถูกต้อง' }, { status:401 }); }
    const userId = payload.sub || payload.id;
    const body = await req.json();
    const { planId, status, validFrom, validTo } = body;
    if(!planId || !['Draft','Active','Archived'].includes(status)) return NextResponse.json({ error:'ต้องระบุ planId และ status (Draft/Active/Archived)' }, { status:400 });
    // เปลี่ยนสถานะเกณฑ์ได้เฉพาะผู้บริหารระบบ / Admin Akarapol เท่านั้น
    const { isSystemAdmin } = await import('@/lib/admin');
    if(!(await isSystemAdmin(userId)).ok) return NextResponse.json({ error:'เปลี่ยนเกณฑ์ได้เฉพาะผู้บริหารระบบ / Admin Akarapol' }, { status:403 });
    const plan: any = await prisma.rankPlan.findUnique({ where:{ id: planId }, include:{ rules:true } });
    if(!plan) return NextResponse.json({ error:'ไม่พบแผน' }, { status:404 });
    if(status==='Active'){
      if(!plan.rules?.length) return NextResponse.json({ error:'แผนนี้ไม่มีกฎ — ยังตั้งค่าเกณฑ์ไม่ครบ ห้าม Active' }, { status:400 });
      if(plan.isLegacyRef) return NextResponse.json({ error:'แผนอ้างอิงเก่า 15 Jan 64 ห้าม Active — กรุณาสร้างแผนใหม่จากแหล่งที่ยืนยันแล้ว' }, { status:400 });
      // มี Active ได้ครั้งละ 1
      await prisma.rankPlan.updateMany({ where:{ status:'Active' }, data:{ status:'Archived' } });
    }
    const updated = await prisma.rankPlan.update({ where:{ id: planId }, data:{ status, validFrom: validFrom ? new Date(validFrom) : undefined, validTo: validTo ? new Date(validTo) : undefined } as any, include:{ rules:true } });
    await prisma.auditLog.create({ data:{ userId, action:'rank_plan.status', entity:'RankPlan', entityId: planId, oldValue:{ status: plan.status } as any, newValue:{ status } as any } });
    return NextResponse.json({ ok:true, plan: updated });
  }catch(e:any){ return NextResponse.json({ error:e?.message || 'error' }, { status:500 }); }
}
