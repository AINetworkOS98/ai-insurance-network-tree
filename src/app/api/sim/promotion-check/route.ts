import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { evaluateOutcome, logEvent, pickRule, requireSimAccess, simDenied, DISCLAIMER } from '@/lib/sim';

export const dynamic = 'force-dynamic';

/**
 * POST /api/sim/promotion-check — Promotion Rule Engine
 * body: { simId?, code? (ตรวจเฉพาะคน) | all?: true, approve?: true }
 * อ่านกฎจากตาราง promotion_rules เท่านั้น (ไม่ฝังสูตรในโค้ด/frontend)
 * ทุกผลลัพธ์เป็นการจำลอง — ไม่ใช่รายได้หรือค่าคอมมิชชั่นจริง
 */
export async function POST(req: Request) {
  try {
    const access = await requireSimAccess(req);
    if (!access.ok) return simDenied(access);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const simId = String(body.simId || '');
    const sim = simId
      ? await prisma.networkSim.findUnique({ where: { id: simId } })
      : await prisma.networkSim.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!sim) return NextResponse.json({ ok: false, error: 'no_simulation' }, { status: 200 });

    const rules = await prisma.promotionRule.findMany({ where: { active: true }, orderBy: { createdAt: 'asc' } });
    if (!rules.length) return NextResponse.json({ ok: false, error: 'no_active_rule' }, { status: 200 });

    const approve = body.approve === true;
    const targets = body.code
      ? await prisma.simMember.findMany({ where: { simId: sim.id, memberCode: String(body.code) } })
      : await prisma.simMember.findMany({ where: { simId: sim.id, childrenCount: { gte: Math.min(...rules.map((r) => r.minMembers)) } }, take: 500 });

    const results: Array<Record<string, unknown>> = [];
    for (const m of targets) {
      if (approve) {
        await prisma.simMember.update({ where: { id: m.id }, data: { promotionStatus: 'approved', qualified: true } });
        await logEvent({
          eventType: 'PROMOTION_APPROVED',
          simId: sim.id,
          memberCode: m.memberCode,
          source: 'dashboard',
          payload: { level: m.level, simulation: true, note: 'อนุมัติในโหมดจำลอง — ไม่มีการจ่ายเงินจริง' },
        });
        await logEvent({
          eventType: 'COMMISSION_CREATED',
          simId: sim.id,
          memberCode: m.memberCode,
          source: 'dashboard',
          payload: {
            simulation: true,
            amount: Number(sim.commission),
            currency: 'THB',
            note: `${Number(sim.commission).toLocaleString('th-TH')} บาทเป็นค่าคอมมิชชั่นตามกติกาที่ตั้งไว้ในระบบ ไม่ใช่การรับประกันรายได้ และไม่มีการจ่ายเงินจริง`,
          },
        });
        results.push({ code: m.memberCode, status: 'approved' });
        continue;
      }

      const outcome = evaluateOutcome(m, pickRule(rules, m.level));
      const next = outcome.eligible ? 'eligible' : 'none';
      if (m.promotionStatus !== next || m.qualified !== outcome.eligible) {
        await prisma.simMember.update({ where: { id: m.id }, data: { promotionStatus: next, qualified: outcome.eligible } });
      }
      if (outcome.eligible && m.promotionStatus !== 'eligible') {
        await logEvent({ eventType: 'QUALIFICATION_COMPLETED', simId: sim.id, memberCode: m.memberCode, source: 'dashboard', payload: { rule: outcome.rule, childrenCount: m.childrenCount, simulation: true } });
        await logEvent({ eventType: 'PROMOTION_ELIGIBLE', simId: sim.id, memberCode: m.memberCode, source: 'dashboard', payload: { rule: outcome.rule, simulation: true, note: 'เป็นการประเมินในระบบจำลอง ไม่ใช่รายได้จริง' } });
      }
      results.push({ code: m.memberCode, eligible: outcome.eligible, reasons: outcome.reasons, rule: outcome.rule });
    }

    await logEvent({
      eventType: approve ? 'PROMOTION_APPROVED' : 'PROMOTION_ELIGIBLE',
      simId: sim.id,
      source: 'dashboard',
      payload: { checked: results.length, approve, simulation: true, note: approve ? 'อนุมัติจำลอง' : 'ประเมินเงื่อนไขจำลอง' },
    });

    return NextResponse.json({
      ok: true,
      simId: sim.id,
      checked: results.length,
      approved: results.filter((r) => r.status === 'approved').length,
      eligible: results.filter((r) => r.eligible === true).length,
      results: results.slice(0, 100),
      rules: rules.map((r) => ({ name: r.name, minMembers: r.minMembers, minLevels: r.minLevels, requiredPayment: r.requiredPayment, requiredReceipt: r.requiredReceipt, commissionAmount: Number(r.commissionAmount) })),
      disclaimer: DISCLAIMER,
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
