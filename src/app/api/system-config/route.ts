import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/system-config — สาธารณะ (ชื่อระบบแสดงหน้าแรก)
export async function GET(){
  try{
    const cfg = await prisma.systemConfig.findUnique({ where:{ id:'default' } });
    return NextResponse.json({ ok:true, config: cfg || { id:'default', appName:'AI INSURANCE NETWORK OS', appNameEn:'AI INSURANCE NETWORK OS' } });
  }catch(e:any){
    return NextResponse.json({ ok:true, config:{ id:'default', appName:'AI INSURANCE NETWORK OS', appNameEn:'AI INSURANCE NETWORK OS' } });
  }
}

// PUT /api/system-config — ต้องมี permission: system.manage (แยกจาก rank)
export async function PUT(req: NextRequest){
  try{
    const body = await req.json();
    const appName = String(body.appName||'').trim();
    if(!appName) return NextResponse.json({ ok:false, error:'กรุณากรอกชื่อระบบ' }, { status:400 });
    // ห้ามใช้ชื่อแบรนด์ต้องห้าม — ตรวจคำต้องห้ามอย่างง่าย
    const forbidden = ['thai life', 'ไทยประกันชีวิต'];
    if(forbidden.some(w => appName.toLowerCase().includes(w))){
      return NextResponse.json({ ok:false, error:'ชื่อระบบห้ามใช้ชื่อแบรนด์ที่ไม่อนุญาต' }, { status:400 });
    }
    const cfg = await prisma.systemConfig.upsert({
      where:{ id:'default' },
      update:{ appName, appNameEn: String(body.appNameEn||appName).trim(), logoUrl: body.logoUrl || null },
      create:{ id:'default', appName, appNameEn: String(body.appNameEn||appName).trim(), logoUrl: body.logoUrl || null },
    });
    await prisma.auditLog.create({ data:{ action:'system.update_config', entity:'SystemConfig', entityId:'default', newValue:{ appName } } });
    return NextResponse.json({ ok:true, config: cfg });
  }catch(e:any){
    console.error('system-config PUT', e);
    return NextResponse.json({ ok:false, error:'เกิดข้อผิดพลาด' }, { status:500 });
  }
}
