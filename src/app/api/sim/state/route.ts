import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DISCLAIMER } from '@/lib/sim';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sim/state?id=<simId>&limit=3000
 * สถานะการจำลองสำหรับ Dashboard (โหนด + สรุปชั้น + event ล่าสุด) — อ่านอย่างเดียว
 * ไม่ส่งข้อมูลลูกค้าจริง และทุกโหนดมี simulation = true
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get('id') || '';
    const limit = Math.max(1, Math.min(6000, Number(url.searchParams.get('limit') || 3000)));

    const sim = id
      ? await prisma.networkSim.findUnique({ where: { id } })
      : await prisma.networkSim.findFirst({ orderBy: { createdAt: 'desc' } });

    if (!sim) return NextResponse.json({ ok: true, sim: null, nodes: [], perLayer: [], events: [], disclaimer: DISCLAIMER });

    const [members, total, events] = await Promise.all([
      prisma.simMember.findMany({
        where: { simId: sim.id },
        select: { memberCode: true, parentCode: true, sponsorCode: true, level: true, position: true, status: true, childrenCount: true, qualified: true, promotionStatus: true, paymentVerified: true, receiptId: true, simulation: true, posX: true, posY: true, posZ: true, joinDate: true },
        orderBy: [{ level: 'asc' }, { position: 'asc' }],
        take: limit,
      }),
      prisma.simMember.count({ where: { simId: sim.id } }),
      prisma.simEvent.findMany({ where: { simId: sim.id }, orderBy: { createdAt: 'desc' }, take: 40, select: { eventId: true, eventType: true, memberCode: true, source: true, simulation: true, payload: true, createdAt: true } }),
    ]);

    const layerCounts = new Map<number, number>();
    members.forEach((m) => layerCounts.set(m.level, (layerCounts.get(m.level) || 0) + 1));

    const perLayerAll = await prisma.simMember.groupBy({ by: ['level'], where: { simId: sim.id }, _count: { _all: true } });

    return NextResponse.json(
      {
        ok: true,
        sim: {
          id: sim.id,
          name: sim.name,
          initMembers: sim.initMembers,
          branchFactor: sim.branchFactor,
          layers: sim.layers,
          growthRate: sim.growthRate,
          months: sim.months,
          incomePlan: sim.incomePlan,
          commission: Number(sim.commission),
          status: sim.status,
          simulation: sim.simulation,
          createdAt: sim.createdAt,
        },
        nodes: members.map((m) => ({
          code: m.memberCode,
          parentCode: m.parentCode,
          sponsorCode: m.sponsorCode,
          level: m.level,
          position: m.position,
          status: m.status,
          childrenCount: m.childrenCount,
          qualified: m.qualified,
          promotionStatus: m.promotionStatus,
          paymentVerified: m.paymentVerified,
          receiptId: m.receiptId,
          simulation: m.simulation,
          position3d: m.posX === null ? null : { x: m.posX, y: m.posY, z: m.posZ },
        })),
        perLayer: perLayerAll
          .sort((a, b) => a.level - b.level)
          .map((r) => ({ level: r.level, count: r._count._all })),
        shown: members.length,
        total,
        truncated: members.length < total,
        perLayerOfShown: Array.from(layerCounts.entries()).map(([level, count]) => ({ level, count })),
        events: events.reverse(),
        disclaimer: DISCLAIMER,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
