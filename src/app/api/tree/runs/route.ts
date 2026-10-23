import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

// GET /api/tree/runs — ประวัติการรัน (ผู้เริ่มรัน เวลา จำนวนสำเร็จ/ไม่สำเร็จ/เหตุผล)
export async function GET(req: NextRequest){
  try{
    const { searchParams } = new URL(req.url);
    const take = Math.min(50, parseInt(searchParams.get('take') || '20'));
    const runs = await prisma.placementRun.findMany({
      orderBy:{ startedAt:'desc' },
      take,
      include:{ entries:{ take:50, orderBy:{ createdAt:'desc' } } }
    });
    // แสดงข้อมูลแบบจำกัดตามสิทธิ (ไม่แสดงข้อมูลอ่อนไหว)
    return NextResponse.json({ ok:true, runs });
  }catch(e:any){
    console.error('tree/runs', e);
    return NextResponse.json({ ok:false, error:'เกิดข้อผิดพลาด' }, { status:500 });
  }
}

// DELETE /api/tree/runs — ลบประวัติการรัน (ผู้ดูแลระบบเท่านั้น)
// Body: { jobId } | { jobIds: [] } | { all: true }
// entries ถูกลบตาม run (cascade) · เขียน AuditLog ก่อนลบทุกครั้ง
export async function DELETE(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value
      || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    const payload: any = token ? verifyToken(token) : null;
    if(!payload?.sub) return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบ' }, { status:401 });

    const { isSystemAdmin } = await import('@/lib/admin');
    const gate = await isSystemAdmin(String(payload.sub)).catch(()=> ({ ok:false }));
    if(!gate?.ok) return NextResponse.json({ ok:false, error:'เฉพาะผู้ดูแลระบบเท่านั้น' }, { status:403 });

    const body = await req.json().catch(()=> ({} as any));
    const one = String(body?.jobId || body?.id || '').trim();
    let jobIds: string[] = one ? [one]
      : Array.isArray(body?.jobIds) ? body.jobIds.map((x:any)=> String(x||'').trim()).filter(Boolean)
      : [];
    jobIds = Array.from(new Set(jobIds)).slice(0, 200);
    const delAll = body?.all === true;
    if(!delAll && !jobIds.length) return NextResponse.json({ ok:false, error:'ไม่ได้ระบุรายการที่จะลบ' }, { status:400 });

    const where: any = delAll ? {} : { jobId: { in: jobIds } };
    const found: any[] = await prisma.placementRun.findMany({
      where,
      select: { id:true, jobId:true, status:true, startedAt:true, totalSuccess:true, totalSkipped:true, totalFailed:true, startedBy:true },
    }).catch(()=>[]);
    if(!found.length) return NextResponse.json({ ok:false, error:'ไม่พบประวัติการรันที่ต้องการลบ' }, { status:404 });

    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || null;
    await Promise.all(found.map((r)=> (prisma as any).auditLog.create({
      data: {
        userId: String(payload.sub),
        action: 'DELETE_PLACEMENT_RUN',
        entity: 'PlacementRun',
        entityId: r.id,
        oldValue: { ...r, startedAt: r.startedAt instanceof Date ? r.startedAt.toISOString() : r.startedAt } as any,
        reason: typeof body?.reason === 'string' ? body.reason.slice(0, 300) : null,
        ip,
      },
    }).catch(()=>null)));

    await (prisma as any).placementRunEntry.deleteMany({ where: { runId: { in: found.map(r=> r.id) } } }).catch(()=>null);
    const res = await (prisma as any).placementRun.deleteMany({ where: { id: { in: found.map(r=> r.id) } } });
    return NextResponse.json({ ok:true, deleted: res.count, jobIds: found.map(r=> r.jobId) });
  }catch(e:any){
    console.error('tree/runs delete', e?.message);
    return NextResponse.json({ ok:false, error:'ลบประวัติการรันไม่สำเร็จ' }, { status:500 });
  }
}
