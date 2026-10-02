import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

// POST /api/consent — สมาชิกจัดการความยินยอมของตัวเอง (สิทธิของเจ้าของข้อมูลตาม PDPA)
// body: { type: 'MARKETING', granted: boolean }
// ไม่ลบบันทึกเดิม — เพิ่มบันทึกใหม่เพื่อให้ตรวจสอบย้อนหลังได้ครบทุกครั้งที่เปลี่ยนใจ
// ความยินยอมเพื่อการเป็นสมาชิก (PDPA ตามสัญญา) ถอนผ่านหน้านี้ไม่ได้ ต้องติดต่อผู้ดูแลระบบ

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PDPA_VERSION = '1.0';
const WITHDRAWABLE = ['MARKETING'];

export async function POST(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value
      || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    const payload: any = token ? verifyToken(token) : null;
    if(!payload?.sub) return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    const userId = String(payload.sub);

    const body = await req.json().catch(()=> ({} as any));
    const type = String(body?.type || '').toUpperCase();
    const granted = body?.granted === true;

    if(!WITHDRAWABLE.includes(type)){
      return NextResponse.json({
        ok:false,
        error:'ประเภทนี้เปลี่ยนผ่านหน้านี้ไม่ได้ — ความยินยอมเพื่อการเป็นสมาชิกผูกกับสัญญา กรุณาติดต่อผู้ดูแลระบบ',
      }, { status:400 });
    }

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;

    // บันทึกใหม่ (ไม่แก้ของเดิม) — ได้ประวัติครบว่ายินยอม/ถอนเมื่อไร
    await (prisma as any).consentRecord.create({
      data:{ userId, type, version: PDPA_VERSION, granted, source: 'member-settings', ip },
    });
    await (prisma as any).auditLog.create({
      data:{
        userId, action: granted ? 'consent.granted' : 'consent.withdrawn',
        entity:'ConsentRecord', entityId: userId,
        newValue:{ type, granted, version: PDPA_VERSION, source:'member-settings' },
      },
    }).catch(()=>null);

    const consents: any[] = await (prisma as any).consentRecord.findMany({
      where:{ userId },
      orderBy:{ consentedAt: 'desc' },
      select:{ type:true, version:true, granted:true, source:true, consentedAt:true },
    }).catch(()=>[]);

    return NextResponse.json({
      ok: true,
      message: granted ? 'บันทึกความยินยอมการตลาดแล้ว' : 'ถอนความยินยอมการตลาดแล้ว — จะไม่ได้รับข่าวสารการตลาดอีก',
      consents,
    });
  }catch(e:any){
    console.error('consent update error', e?.message);
    return NextResponse.json({ ok:false, error:'บันทึกความยินยอมไม่สำเร็จ' }, { status:500 });
  }
}