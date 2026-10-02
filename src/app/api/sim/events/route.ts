import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logEvent } from '@/lib/sim';

export const dynamic = 'force-dynamic';

/** POST /api/sim/events — บันทึก event (ใช้โดย n8n) ; GET — ดู timeline */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const eventType = String(body.eventType || body.event_type || '').trim();
    if (!eventType) return NextResponse.json({ ok: false, error: 'eventType_required' }, { status: 400 });
    const ev = await logEvent({
      eventType,
      simId: body.simId ? String(body.simId) : null,
      memberCode: body.memberCode ? String(body.memberCode) : null,
      source: String(body.source || 'n8n'),
      payload: body.payload ?? { simulation: true },
    });
    return NextResponse.json({ ok: Boolean(ev), eventId: ev?.eventId ?? null, eventType, simulation: true });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const simId = url.searchParams.get('id') || url.searchParams.get('simId') || '';
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 40)));
    const sim = simId
      ? await prisma.networkSim.findUnique({ where: { id: simId } })
      : await prisma.networkSim.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!sim) return NextResponse.json({ ok: true, events: [] }, { headers: { 'Cache-Control': 'no-store' } });
    const events = await prisma.simEvent.findMany({ where: { simId: sim.id }, orderBy: { createdAt: 'desc' }, take: limit });
    return NextResponse.json(
      {
        ok: true,
        simId: sim.id,
        events: events.reverse().map((e) => ({ eventId: e.eventId, eventType: e.eventType, memberCode: e.memberCode, source: e.source, simulation: e.simulation, payload: e.payload, createdAt: e.createdAt })),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
