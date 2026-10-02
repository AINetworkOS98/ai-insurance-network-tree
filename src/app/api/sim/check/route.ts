import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { evaluatePromotion, requireSimAccess, simDenied, DISCLAIMER } from '@/lib/sim';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sim/check?code=<memberCode>&id=<simId>
 * ตรวจโครงสร้าง 1 แตก N ของสมาชิกหนึ่งคน (ปลายทางของ n8n: /webhook/check-1-to-5)
 * อ่านกฎจาก promotion_rules เพื่อบอกว่าเข้าเงื่อนไข LEVEL_COMPLETED หรือยัง
 */
export async function GET(req: Request) {
  try {
    const access = await requireSimAccess(req);
    if (!access.ok) return simDenied(access);
    const url = new URL(req.url);
    const code = url.searchParams.get('code') || '';
    const simId = url.searchParams.get('id') || '';
    if (!code) return NextResponse.json({ ok: false, error: 'code_required' }, { status: 400 });

    const sim = simId
      ? await prisma.networkSim.findUnique({ where: { id: simId } })
      : await prisma.networkSim.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!sim) return NextResponse.json({ ok: false, error: 'no_simulation' }, { status: 200 });

    const member = await prisma.simMember.findFirst({ where: { simId: sim.id, memberCode: code } });
    if (!member) return NextResponse.json({ ok: false, error: 'member_not_found', code }, { status: 200 });

    const children = await prisma.simMember.findMany({ where: { simId: sim.id, parentCode: code }, select: { memberCode: true, level: true, qualified: true, paymentVerified: true, promotionStatus: true }, orderBy: { position: 'asc' } });

    const rules = await prisma.promotionRule.findMany({ where: { active: true } });
    const rule = rules.find((r) => r.minLevels === member.level) || rules[0] || null;
    const threshold = rule ? rule.minMembers : 5;
    const outcome = await evaluatePromotion(sim.id, code);

    return NextResponse.json(
      {
        ok: true,
        simId: sim.id,
        member: {
          member_id: member.memberCode,
          level: member.level,
          children_count: children.length,
          capacity: sim.branchFactor,
          qualified: member.qualified,
          promotion_status: member.promotionStatus,
          payment_verified: member.paymentVerified,
          receipt_id: member.receiptId,
        },
        children: children.map((c) => c.memberCode),
        threshold,
        event: children.length >= threshold ? 'LEVEL_COMPLETED' : 'IN_PROGRESS',
        eligible: outcome.eligible,
        reasons: outcome.reasons,
        rule: outcome.rule,
        simulation: true,
        disclaimer: DISCLAIMER,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
