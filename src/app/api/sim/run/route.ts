import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { logEvent, normalizeConfig, planLayers, positionFor, requireSimAccess, simDenied, DISCLAIMER, MAX_NODES_PER_RUN } from '@/lib/sim';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * POST /api/sim/run — เริ่มการจำลองใหม่ (หรือรีเซ็ตของเดิม)
 * body: { name?, initMembers?, branchFactor?, layers?, growthRate?, months?, incomePlan?, commission?, reset?: boolean, simId? }
 * เขียนเฉพาะตาราง sim_* (ข้อมูลจำลอง) ไม่แตะข้อมูลจริง
 */
export async function POST(req: Request) {
  try {
    const access = await requireSimAccess(req);
    if (!access.ok) return simDenied(access);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    // ── รีเซ็ต (ล้างข้อมูลจำลองของ run นั้น) ──
    if (body.reset === true || String(body.action || '') === 'reset') {
      const simId = String(body.simId || '');
      if (!simId) return NextResponse.json({ ok: false, error: 'simId_required' }, { status: 400 });
      await prisma.simMember.deleteMany({ where: { simId } }).catch(() => null);
      await prisma.networkSim.update({ where: { id: simId }, data: { status: 'reset' } }).catch(() => null);
      await logEvent({ eventType: 'SIMULATION_RESET', simId, source: 'dashboard', payload: { by: 'dashboard' } });
      return NextResponse.json({ ok: true, action: 'reset', simId, disclaimer: DISCLAIMER });
    }

    const cfg = normalizeConfig(body);
    const perLayer = planLayers(cfg);

    const sim = await prisma.networkSim.create({
      data: {
        name: String(body.name || `จำลอง 1 แตก ${cfg.branchFactor} · ${cfg.layers} ชั้น`).slice(0, 120),
        initMembers: cfg.initMembers,
        branchFactor: cfg.branchFactor,
        layers: cfg.layers,
        growthRate: cfg.growthRate,
        months: cfg.months,
        incomePlan: cfg.incomePlan,
        commission: cfg.commission,
        status: 'running',
        simulation: true,
      },
    });

    // ── สร้างสมาชิกจำลองตามโครงสร้าง 1 แตก N ──
    type Row = { simId: string; memberCode: string; parentCode: string | null; sponsorCode: string | null; level: number; position: number; status: string; simulation: boolean; posX: number; posY: number; posZ: number };
    const rows: Row[] = [];
    const byLevel: string[][] = [];
    let seq = 1;

    for (let level = 1; level <= cfg.layers; level++) {
      const count = perLayer[level - 1] || 0;
      const codes: string[] = [];
      for (let i = 0; i < count; i++) {
        const code = `M${String(seq).padStart(4, '0')}`;
        seq++;
        // ชั้น 1 ต้องเป็นลูกของ ROOT เสมอ (เดิมปล่อยเป็น null ทำให้โครง 1 แตก 5 ขาดจากราก)
        const parents = level === 1 ? ['ROOT'] : byLevel[level - 2] || [];
        const parent = parents[Math.floor(i / Math.max(1, cfg.branchFactor))] || parents[0] || null;
        const pos = positionFor(level, i);
        rows.push({ simId: sim.id, memberCode: code, parentCode: parent, sponsorCode: parent, level, position: i + 1, status: 'simulated', simulation: true, posX: pos.x, posY: pos.y, posZ: pos.z });
        codes.push(code);
      }
      byLevel.push(codes);
    }

    rows.push({
      simId: sim.id,
      memberCode: 'ROOT',
      parentCode: null,
      sponsorCode: null,
      level: 0,
      position: 0,
      status: 'simulated',
      simulation: true,
      posX: 0,
      posY: 0,
      posZ: 0,
    });

    // children_count ต่อโหนด (คำนวณจากสาย parent ที่สร้างไป)
    const childCount = new Map<string, number>();
    rows.forEach((r) => {
      if (r.parentCode) childCount.set(r.parentCode, (childCount.get(r.parentCode) || 0) + 1);
    });

    const CHUNK = 800;
    for (let i = 0; i < rows.length; i += CHUNK) {
      await prisma.simMember.createMany({
        data: rows.slice(i, i + CHUNK).map((r) => ({ ...r, childrenCount: childCount.get(r.memberCode) || 0 })),
      });
    }

    await logEvent({
      eventType: 'SIMULATION_STARTED',
      simId: sim.id,
      source: 'dashboard',
      payload: { config: cfg, perLayer, totalMembers: rows.length - 1, cap: MAX_NODES_PER_RUN },
    });
    await logEvent({
      eventType: 'NETWORK_UPDATED',
      simId: sim.id,
      source: 'dashboard',
      payload: { added: rows.length - 1, layers: cfg.layers },
    });

    return NextResponse.json({
      ok: true,
      simId: sim.id,
      config: cfg,
      perLayer,
      totalMembers: rows.length - 1,
      capped: rows.length - 1 >= MAX_NODES_PER_RUN,
      eventTypes: ['SIMULATION_STARTED', 'NETWORK_UPDATED'],
      disclaimer: DISCLAIMER,
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

/** GET /api/sim/run — รายการการจำลองล่าสุด */
export async function GET(req: Request) {
  try {
    const access = await requireSimAccess(req);
    if (!access.ok) return simDenied(access);
    const sims = await prisma.networkSim.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: { id: true, name: true, initMembers: true, branchFactor: true, layers: true, growthRate: true, months: true, commission: true, status: true, createdAt: true, _count: { select: { members: true } } },
    });
    return NextResponse.json({ ok: true, sims, disclaimer: DISCLAIMER }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
