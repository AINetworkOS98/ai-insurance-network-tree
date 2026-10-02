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