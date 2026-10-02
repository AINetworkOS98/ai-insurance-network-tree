import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DISCLAIMER } from '@/lib/sim';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sim/stats — สถิติสำหรับ Dashboard
 * แยก REAL DATA กับ SIMULATION DATA อย่างชัดเจน (ห้ามนำตัวเลขจำลองไปรวมกับตัวเลขจริง)
 */
export async function GET() {
  const safe = async <T>(fn: () => Promise<T>): Promise<T | null> => {
    try {
      return await fn();
    } catch {
      return null;
    }
  };

  const [realUsers, realTree, realProspects, sims, simMembers, simEvents, simPayments, eligible, approved, rules] = await Promise.all([
    safe(() => prisma.user.count()),
    safe(() => prisma.treeNode.count()),
    safe(() => prisma.prospect.count()),
    safe(() => prisma.networkSim.count()),
    safe(() => prisma.simMember.count()),
    safe(() => prisma.simEvent.count()),
    safe(() => prisma.simPayment.count()),
    safe(() => prisma.simMember.count({ where: { promotionStatus: 'eligible' } })),
    safe(() => prisma.simMember.count({ where: { promotionStatus: 'approved' } })),
    safe(() => prisma.promotionRule.count({ where: { active: true } })),
  ]);

  const layerRows = await safe(() =>
    prisma.simMember.groupBy({ by: ['level'], _count: { _all: true }, orderBy: { level: 'asc' } }),
  );
  const sim = await safe(() => prisma.networkSim.findFirst({ orderBy: { createdAt: 'desc' } }));

  return NextResponse.json(
    {
      ok: true,
      real: {
        label: 'REAL DATA',
        note: 'ข้อมูลจริงในระบบ (ไม่เกี่ยวกับการจำลอง) — แสดงเฉพาะจำนวน ไม่มีข้อมูลส่วนบุคคล',
        members: realUsers,
        treeNodes: realTree,
        prospects: realProspects,
      },
      simulation: {
        label: 'SIMULATION DATA',
        note: 'ข้อมูลจำลองล้วน (simulation = true) — ห้ามนำไปรวมกับตัวเลขจริงหรือใช้ยืนยันรายได้',
        sims,
        members: simMembers,
        events: simEvents,
        payments: simPayments,
        promotionEligible: eligible,
        promotionApproved: approved,
        activeRules: rules,
        perLayer: (layerRows || []).map((r) => ({ level: r.level, count: r._count._all })),
        lastSim: sim
          ? { id: sim.id, name: sim.name, branchFactor: sim.branchFactor, layers: sim.layers, status: sim.status, commission: Number(sim.commission) }
          : null,
      },
      disclaimer: DISCLAIMER,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
