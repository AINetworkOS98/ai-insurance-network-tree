import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { evaluatePromotion, logEvent, requireSimAccess, simDenied, DISCLAIMER } from '@/lib/sim';

export const dynamic = 'force-dynamic';

/**
 * POST /api/sim/member — เพิ่มสมาชิกจำลองใต้สมาชิกที่มีอยู่ (ใช้โดยหน้า Dashboard และ n8n: /webhook/member-created)
 * body: { simId?, parentCode?, count? (1..branchFactor), position? }
 * ทำงานกับข้อมูลจำลองเท่านั้น (simulation = true) — ไม่แตะข้อมูลจริง
 * เมื่อ children_count ถึงเกณฑ์ตามกฎใน promotion_rules จะสร้าง event LEVEL_COMPLETED อัตโนมัติ
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

    const parentCode = String(body.parentCode || 'ROOT');
    const parent = await prisma.simMember.findFirst({ where: { simId: sim.id, memberCode: parentCode } });
    if (!parent) return NextResponse.json({ ok: false, error: 'parent_not_found', parentCode }, { status: 200 });

    const want = Math.max(1, Math.min(Number(body.count || 1), sim.branchFactor));
    const existing = await prisma.simMember.count({ where: { simId: sim.id } });
    const seqStart = existing + 1;

    const created: string[] = [];
    for (let i = 0; i < want; i++) {
      const code = `M${String(seqStart + i).padStart(4, '0')}`;
      const angle = ((parent.position + i) * Math.PI * (3 - Math.sqrt(5))) % (Math.PI * 2);
      const radius = 6 + parent.level * 5.5;
      await prisma.simMember.create({
        data: {
          simId: sim.id,
          memberCode: code,
          parentCode: parent.memberCode,
          sponsorCode: parent.memberCode,
          level: parent.level + 1,
          position: parent.childrenCount + i + 1,
          status: 'simulated',
          simulation: true,
          posX: Math.cos(angle) * radius,
          posY: ((parent.position + i) % 5) - 2,
          posZ: Math.sin(angle) * radius,
        },
      });
      created.push(code);
      await logEvent({ eventType: 'MEMBER_CREATED', simId: sim.id, memberCode: code, source: 'dashboard', payload: { parentCode: parent.memberCode, level: parent.level + 1, simulation: true } });
    }

    const childrenCount = await prisma.simMember.count({ where: { simId: sim.id, parentCode: parent.memberCode } });
    await prisma.simMember.update({ where: { id: parent.id }, data: { childrenCount } });

    // ตรวจเงื่อนไข 1 แตก 5 ด้วยกฎจาก DB (ไม่ฝังตัวเลขในโค้ด)
    const rules = await prisma.promotionRule.findMany({ where: { active: true } });
    const rule = rules.find((r) => r.minLevels === parent.level) || rules[0] || null;
    const threshold = rule ? rule.minMembers : 5;
    let levelCompleted = false;
    if (childrenCount >= threshold) {
      levelCompleted = true;
      await logEvent({
        eventType: 'LEVEL_COMPLETED',
        simId: sim.id,
        memberCode: parent.memberCode,
        source: 'dashboard',
        payload: { member_id: parent.memberCode, level: parent.level, children_count: childrenCount, event: 'LEVEL_COMPLETED', simulation: true, rule: rule?.name || null },
      });
      const outcome = await evaluatePromotion(sim.id, parent.memberCode);
      if (outcome.eligible) {
        await prisma.simMember.update({ where: { id: parent.id }, data: { qualified: true, promotionStatus: 'eligible' } });
        await logEvent({ eventType: 'PROMOTION_ELIGIBLE', simId: sim.id, memberCode: parent.memberCode, source: 'dashboard', payload: { rule: outcome.rule, simulation: true, note: 'เข้าเงื่อนไขตามกติกาในระบบ — เป็นการจำลอง ไม่ใช่รายได้จริง' } });
      }
    }

    return NextResponse.json({
      ok: true,
      simId: sim.id,
      created,
      parentCode: parent.memberCode,
      childrenCount,
      threshold,
      levelCompleted,
      grid: { level: parent.level, held: childrenCount, capacity: sim.branchFactor },
      disclaimer: DISCLAIMER,
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
