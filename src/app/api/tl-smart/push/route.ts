import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cronAuth';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/tl-smart/push   (Authorization: Bearer $CRON_SECRET)
// บันทึกผลจากระบบ TL SMART กลับเข้าระบบเรา: เลขตัวแทนจริงที่ TL SMART ออกให้
//   body: { prospectId | eventId, agentCode, status?, note?, submittedBy? }
//   agentCode = เลขตัวแทนที่ออกโดย TL SMART (8 หลัก) → เก็บเป็นแหล่งความจริง
//   status: 'sent' (ค่าเริ่มต้น) | 'pending' (ส่งไม่สำเร็จ คงคิว) | 'rejected'
// GET  → ดูรายการที่บันทึกผลจาก TL SMART แล้ว 10 รายล่าสุด
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CODE_FROM_SYSTEM = 'tl_smart_agent_code_from_system';

export async function POST(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  try {
    const { prisma } = await import('@/lib/prisma');
    const { TL_SMART_CHANNEL, TL_SMART_ACTIVITY } = await import('@/lib/tlSmart');
    const b: any = await req.json().catch(() => ({}));

    const prospectId = String(b.prospectId || '').trim() || String(b.eventId || '').replace('tl_smart:', '').trim();
    const agentCode = String(b.agentCode || '').replace(/\D/g, '');
    const status = ['sent', 'pending', 'rejected'].includes(String(b.status)) ? String(b.status) : 'sent';

    if (!prospectId) return NextResponse.json({ ok: false, error: 'ต้องส่ง prospectId (หรือ eventId)' }, { status: 400 });
    if (!agentCode) return NextResponse.json({ ok: false, error: 'ต้องส่ง agentCode = เลขตัวแทนที่ TL SMART ออกให้' }, { status: 400 });

    const prospect: any = await prisma.prospect.findFirst({ where: { prospectId }, select: { id: true, prospectId: true, firstName: true, lastName: true } });
    if (!prospect) return NextResponse.json({ ok: false, error: 'ไม่พบผู้มุ่งหวังรหัส ' + prospectId }, { status: 404 });

    const eventId = `tl_smart:${prospect.prospectId}`;

    await prisma.prospectActivity
      .create({
        data: {
          prospectId: prospect.id,
          type: status === 'sent' ? CODE_FROM_SYSTEM : TL_SMART_ACTIVITY,
          content: JSON.stringify({ agentCode, status, note: b.note ?? null, submittedBy: b.submittedBy ?? null, at: new Date().toISOString() }).slice(0, 4000),
        },
      })
      .catch(() => null);

    const outbox = await (prisma as any).eventOutbox
      .update({
        where: { eventId },
        data: { status: status === 'pending' ? 'pending' : status === 'rejected' ? 'failed' : 'sent', attempts: { increment: 1 }, sentAt: new Date() },
      })
      .catch(() => null);

    return NextResponse.json({
      ok: true,
      prospectId: prospect.prospectId,
      name: `${prospect.firstName} ${prospect.lastName}`,
      agentCodeFromTlSmart: agentCode,
      outboxStatus: outbox?.status ?? null,
      message: status === 'sent' ? 'บันทึกเลขตัวแทนจาก TL SMART แล้ว' : 'บันทึกสถานะจาก TL SMART แล้ว',
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 300) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  try {
    const { prisma } = await import('@/lib/prisma');
    const { TL_SMART_CHANNEL } = await import('@/lib/tlSmart');
    const rows: any[] = await (prisma as any).prospectActivity
      .findMany({ where: { type: CODE_FROM_SYSTEM }, orderBy: { createdAt: 'desc' }, take: 10 })
      .catch(() => []);
    const events: any[] = await (prisma as any).eventOutbox
      .findMany({ where: { channel: TL_SMART_CHANNEL }, orderBy: { createdAt: 'desc' }, take: 10, select: { eventId: true, status: true, attempts: true, createdAt: true } })
      .catch(() => []);
    return NextResponse.json({
      ok: true,
      issued: rows.map((r) => { let c: any = {}; try { c = JSON.parse(r.content || '{}'); } catch {} return { at: r.createdAt, ...c }; }),
      events,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 300) }, { status: 500 });
  }
}
