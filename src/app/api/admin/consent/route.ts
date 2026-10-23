import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

// GET /api/admin/consent — ตรวจสอบบันทึกความยินยอม (PDPA/การตลาด) ย้อนหลังได้
// เฉพาะผู้ดูแลระบบเท่านั้น (role super_admin/admin, permission system.manage หรืออีเมลใน allowlist)
// Query: ?email=<อีเมลหรือชื่อผู้ใช้>  ?type=PDPA|MARKETING  ?take=50

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value
      || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    const payload: any = token ? verifyToken(token) : null;
    if(!payload?.sub) return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบ' }, { status:401 });

    const { isSystemAdmin } = await import('@/lib/admin');
    const gate = await isSystemAdmin(String(payload.sub)).catch(()=> ({ ok:false }));
    if(!gate?.ok) return NextResponse.json({ ok:false, error:'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status:403 });

    const url = new URL(req.url);
    const q = String(url.searchParams.get('email') || '').trim().toLowerCase();
    const type = String(url.searchParams.get('type') || '').trim().toUpperCase();
    const take = Math.min(Math.max(parseInt(url.searchParams.get('take') || '50', 10) || 50, 1), 200);

    const where: any = {};
    if(type === 'PDPA' || type === 'MARKETING') where.type = type;
    if(q){
      where.user = { OR:[ { email: q }, { username: q }, { memberCode: q.toUpperCase() } ] };
    }

    const records: any[] = await (prisma as any).consentRecord.findMany({
      where,
      orderBy: { consentedAt: 'desc' },
      take,
      include: { user: { select: { id:true, email:true, username:true, displayName:true, firstName:true, lastName:true, memberCode:true, status:true } } },
    }).catch(()=>[]);

    const total = await (prisma as any).consentRecord.count({ where }).catch(()=>0);
    const grantedCount = await (prisma as any).consentRecord.count({ where: { ...where, granted: true } }).catch(()=>0);

    return NextResponse.json({
      ok: true,
      total,
      grantedCount,
      declinedCount: Math.max(total - grantedCount, 0),
      count: records.length,
      records: records.map((r)=>({
        id: r.id,
        type: r.type,
        version: r.version,
        granted: r.granted !== false,
        source: r.source || null,
        consentedAt: r.consentedAt,
        ip: r.ip || null,
        user: r.user ? {
          id: r.user.id,
          email: r.user.email,
          username: r.user.username || null,
          displayName: r.user.displayName || `${r.user.firstName || ''} ${r.user.lastName || ''}`.trim(),
          memberCode: r.user.memberCode || null,
          status: r.user.status || null,
        } : null,
      })),
      at: new Date().toISOString(),
    });
  }catch(e:any){
    console.error('admin consent error', e?.message);
    return NextResponse.json({ ok:false, error:'อ่านบันทึกความยินยอมไม่สำเร็จ' }, { status:500 });
  }
}

// DELETE /api/admin/consent — ลบบันทึกความยินยอมทีละรายการหรือหลายรายการ
// Body: { id: string } หรือ { ids: string[] }  (สูงสุด 200 ต่อครั้ง)
// ทุกครั้งที่ลบจะเขียน AuditLog เก็บข้อมูลเดิมไว้ (action DELETE_CONSENT) เพื่อตรวจสอบย้อนหลัง
export async function DELETE(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value
      || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    const payload: any = token ? verifyToken(token) : null;
    if(!payload?.sub) return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบ' }, { status:401 });

    const { isSystemAdmin } = await import('@/lib/admin');
    const gate = await isSystemAdmin(String(payload.sub)).catch(()=> ({ ok:false }));
    if(!gate?.ok) return NextResponse.json({ ok:false, error:'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status:403 });

    let body: any = {};
    try { body = await req.json(); } catch { body = {}; }
    const one = String(body?.id || '').trim();
    const many: string[] = Array.isArray(body?.ids) ? body.ids.map((x:any)=> String(x || '').trim()).filter(Boolean) : [];
    let ids = one ? [one] : many;
    ids = Array.from(new Set(ids)).slice(0, 200);
    if(!ids.length) return NextResponse.json({ ok:false, error:'ไม่ได้ระบุรายการที่จะลบ' }, { status:400 });
    // กัน id ที่ไม่ใช่ uuid
    ids = ids.filter((v)=> /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v));
    if(!ids.length) return NextResponse.json({ ok:false, error:'รหัสรายการไม่ถูกต้อง' }, { status:400 });

    const found: any[] = await (prisma as any).consentRecord.findMany({
      where: { id: { in: ids } },
      select: { id:true, userId:true, type:true, version:true, granted:true, source:true, consentedAt:true, ip:true },
    }).catch(()=>[]);
    if(!found.length) return NextResponse.json({ ok:false, error:'ไม่พบรายการที่ต้องการลบ (อาจถูกลบไปแล้ว)' }, { status:404 });

    const reason = String(body?.reason || '').slice(0, 300) || null;
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;

    // เก็บร่องรอยก่อนลบ
    await Promise.all(found.map((r)=> (prisma as any).auditLog.create({
      data: {
        userId: String(payload.sub),
        action: 'DELETE_CONSENT',
        entity: 'ConsentRecord',
        entityId: r.id,
        oldValue: { ...r, consentedAt: r.consentedAt instanceof Date ? r.consentedAt.toISOString() : r.consentedAt } as any,
        reason,
        ip,
      },
    }).catch(()=>null)));

    const res = await (prisma as any).consentRecord.deleteMany({ where: { id: { in: found.map((r)=> r.id) } } });
    return NextResponse.json({ ok:true, deleted: res.count, requested: ids.length, ids: found.map((r)=> r.id) });
  }catch(e:any){
    console.error('admin consent delete error', e?.message);
    return NextResponse.json({ ok:false, error:'ลบบันทึกความยินยอมไม่สำเร็จ' }, { status:500 });
  }
}