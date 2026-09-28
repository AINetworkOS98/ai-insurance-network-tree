import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

// /api/admin/test-accounts — เครื่องมือผู้ดูแลระบบสำหรับบัญชีทดสอบ
// GET    = ดูรายการบัญชีทดสอบ
// DELETE = ลบบัญชีทดสอบทั้งหมด
// ปลอดภัยโดยการออกแบบ: จำกัดเฉพาะอีเมลโดเมน @ai-insurance-test.local เท่านั้น
// จึงลบสมาชิกจริงไม่ได้แม้เรียกผิด — และต้องเป็นผู้ดูแลระบบเท่านั้น

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TEST_DOMAIN = '@ai-insurance-test.local';

async function gate(req: NextRequest){
  const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value
    || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  const payload: any = token ? verifyToken(token) : null;
  if(!payload?.sub) return { error: NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบ' }, { status:401 }) };
  const { isSystemAdmin } = await import('@/lib/admin');
  const adm = await isSystemAdmin(String(payload.sub)).catch(()=> ({ ok:false }));
  if(!adm?.ok) return { error: NextResponse.json({ ok:false, error:'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status:403 }) };
  return { ok: true };
}

export async function GET(req: NextRequest){
  const g = await gate(req);
  if(g.error) return g.error;
  try{
    const users: any[] = await (prisma as any).user.findMany({
      where:{ email: { endsWith: TEST_DOMAIN } },
      select:{ id:true, email:true, username:true, displayName:true, memberCode:true, status:true, createdAt:true },
      orderBy:{ createdAt: 'desc' },
    }).catch(()=>[]);
    return NextResponse.json({ ok:true, count: users.length, domain: TEST_DOMAIN, users });
  }catch(e:any){
    return NextResponse.json({ ok:false, error:'อ่านรายการไม่สำเร็จ' }, { status:500 });
  }
}

export async function DELETE(req: NextRequest){
  const g = await gate(req);
  if(g.error) return g.error;
  try{
    const users: any[] = await (prisma as any).user.findMany({
      where:{ email: { endsWith: TEST_DOMAIN } },
      select:{ id:true, email:true },
    }).catch(()=>[]);
    if(!users.length) return NextResponse.json({ ok:true, deleted:0, message:'ไม่มีบัญชีทดสอบให้ลบ' });

    const ids = users.map((u)=> u.id);
    // ลบตามลำดับ FK — ตารางที่อ้าง User แบบ restrict ต้องเคลียร์ก่อน; ที่เหลือ cascade เอง
    await (prisma as any).eventOutbox.deleteMany({ where:{ eventId: { in: ids.map((i:string)=>`registration:${i}`) } } }).catch(()=>null);
    await (prisma as any).placementRunEntry.deleteMany({ where:{ userId: { in: ids } } }).catch(()=>null);
    await (prisma as any).consentRecord.deleteMany({ where:{ userId: { in: ids } } }).catch(()=>null);
    await (prisma as any).auditLog.deleteMany({ where:{ userId: { in: ids } } }).catch(()=>null);
    const res = await (prisma as any).user.deleteMany({ where:{ id: { in: ids } } });

    return NextResponse.json({ ok:true, deleted: res.count, emails: users.map((u)=>u.email) });
  }catch(e:any){
    console.error('test-accounts delete error', e?.message);
    return NextResponse.json({ ok:false, error:'ลบบัญชีทดสอบไม่สำเร็จ — อาจมีข้อมูลอ้างอิงค้างอยู่' }, { status:500 });
  }
}