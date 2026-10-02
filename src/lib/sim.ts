import { prisma } from '@/lib/prisma';

/**
 * ตัวช่วยกลางของระบบจำลองเครือข่าย "1 แตก 5" (Network Simulator)
 *
 * หลักการที่ยึด (ตามสเปก):
 *  - ข้อมูลทั้งหมดในตาราง sim_* เป็นข้อมูลจำลอง (simulation = true) — ห้ามปนกับข้อมูลจริง
 *  - สูตร/เงื่อนไขการเลื่อนตำแหน่งต้องอ่านจากตาราง promotion_rules เท่านั้น (ห้ามฝังในโค้ด)
 *  - ใบเสร็จที่ออกในโหมดสาธิตต้องมี watermark "SIMULATION / DEMO" เสมอ
 */

export const SIM_WATERMARK = 'SIMULATION / DEMO – ไม่ใช่หลักฐานการชำระเงินจริง';
export const DISCLAIMER =
  'ตัวเลขทั้งหมดในระบบนี้เป็นการจำลอง/สมมติเพื่อวางแผนเท่านั้น ไม่ใช่การรับประกันรายได้ ผลตอบแทน หรือผลลัพธ์จริง';

/** เพดานจำนวนโหนดที่สร้างได้ต่อครั้ง (กันประสิทธิภาพพังเมื่อจำนวนโหนดสูงมาก) */
export const MAX_NODES_PER_RUN = 6000;
export const MAX_NODES_TOTAL = 20000;

export type SimConfig = {
  initMembers: number;
  branchFactor: number;
  layers: number;
  growthRate: number;
  months: number;
  incomePlan: string | null;
  commission: number;
};

export function normalizeConfig(input: Record<string, unknown>): SimConfig {
  const num = (v: unknown, def: number, min: number, max: number) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.max(min, Math.min(max, Math.round(n)));
  };
  const dec = (v: unknown, def: number, min: number, max: number) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return def;
    return Math.max(min, Math.min(max, n));
  };
  return {
    initMembers: num(input.initMembers, 1, 1, 50),
    branchFactor: num(input.branchFactor, 5, 1, 12),
    layers: num(input.layers, 5, 1, 12),
    growthRate: dec(input.growthRate, 1, 0.1, 1),
    months: num(input.months, 12, 1, 120),
    incomePlan: input.incomePlan ? String(input.incomePlan).slice(0, 120) : null,
    commission: dec(input.commission, 20000, 0, 10_000_000),
  };
}

/** จำนวนสมาชิกตามชั้น (ชั้น 1 = initMembers แล้วคูณ branch × growthRate ต่อชั้น) */
export function planLayers(cfg: SimConfig): number[] {
  const out: number[] = [];
  let count = cfg.initMembers;
  let total = 0;
  for (let l = 1; l <= cfg.layers; l++) {
    const n = Math.max(1, Math.round(count));
    if (total + n > MAX_NODES_PER_RUN) {
      out.push(Math.max(0, MAX_NODES_PER_RUN - total));
      for (let rest = l + 1; rest <= cfg.layers; rest++) out.push(0);
      return out;
    }
    out.push(n);
    total += n;
    count = count * cfg.branchFactor * cfg.growthRate;
  }
  return out;
}

/** ตำแหน่งในอวกาศแบบ deterministic: ชั้น = รัศมี, ลำดับ = มุมแบบทอง (golden angle) */
export function positionFor(level: number, index: number) {
  const radius = 6 + (level - 1) * 5.5;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const angle = index * golden;
  const y = ((index % 5) - 2) * (1.2 + level * 0.35);
  return { x: Math.cos(angle) * radius, y, z: Math.sin(angle) * radius };
}

export async function logEvent(params: {
  eventType: string;
  simId?: string | null;
  memberCode?: string | null;
  source?: string;
  payload?: unknown;
}) {
  const eventId = `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  try {
    return await prisma.simEvent.create({
      data: {
        eventId,
        simId: params.simId || null,
        eventType: params.eventType,
        memberCode: params.memberCode || null,
        source: params.source || 'dashboard',
        simulation: true,
        payload: (params.payload ?? {}) as object,
      },
    });
  } catch (e) {
    console.error('[sim.logEvent] ล้มเหลว:', (e as Error).message);
    return null;
  }
}

export type PromotionOutcome = {
  code: string;
  eligible: boolean;
  reasons: string[];
  rule: { name: string; minMembers: number; minLevels: number; requiredPayment: string; requiredReceipt: boolean; commissionAmount: number } | null;
};

export type RuleLike = {
  name: string;
  minMembers: number;
  minLevels: number;
  requiredPayment: string;
  requiredReceipt: boolean;
  commissionAmount: unknown;
};

export type MemberLike = {
  memberCode: string;
  level: number;
  childrenCount: number;
  receiptId: string | null;
  paymentVerified: boolean;
};

/** เลือกกฎที่ตรงกับระดับของสมาชิกก่อน (ถ้าไม่มีใช้กฎแรก) */
export function pickRule(rules: RuleLike[], level: number): RuleLike | null {
  return rules.find((r) => r.minLevels === level) || rules[0] || null;
}

/** ประเมินเงื่อนไขแบบ pure function — ใช้ทั้งการตรวจรายคนและการตรวจทั้งเครือข่าย (ไม่ยิง DB ซ้ำ) */
export function evaluateOutcome(member: MemberLike, rule: RuleLike | null): PromotionOutcome {
  const base: PromotionOutcome = { code: member.memberCode, eligible: false, reasons: [], rule: null };
  if (!rule) return { ...base, reasons: ['no_active_rule'] };
  const ruleInfo = {
    name: rule.name,
    minMembers: rule.minMembers,
    minLevels: rule.minLevels,
    requiredPayment: rule.requiredPayment,
    requiredReceipt: rule.requiredReceipt,
    commissionAmount: Number(rule.commissionAmount),
  };
  const reasons: string[] = [];
  if (member.childrenCount < rule.minMembers) reasons.push(`children ${member.childrenCount}/${rule.minMembers}`);
  if (member.level < rule.minLevels) reasons.push(`level ${member.level}/${rule.minLevels}`);
  if (rule.requiredReceipt && !member.receiptId) reasons.push('missing_receipt');
  const paymentOk =
    rule.requiredPayment === 'any' ||
    (rule.requiredPayment === 'simulated' && Boolean(member.receiptId)) ||
    (rule.requiredPayment === 'verified' && member.paymentVerified);
  if (!paymentOk) reasons.push(`payment_${rule.requiredPayment}_not_met`);
  return { code: member.memberCode, eligible: reasons.length === 0, reasons, rule: ruleInfo };
}

/**
 * ประเมินเงื่อนไขการเลื่อนตำแหน่งโดยอ่านกฎจาก DB (ไม่ฝังสูตรในโค้ด)
 * โหมดจำลอง: ใช้กฎที่ requiredPayment = 'simulated' — การยืนยันเป็นการจำลอง ไม่ใช่การชำระเงินจริง
 */
export async function evaluatePromotion(simId: string, memberCode: string): Promise<PromotionOutcome> {
  const member = await prisma.simMember.findFirst({
    where: { simId, memberCode },
    select: { memberCode: true, level: true, childrenCount: true, receiptId: true, paymentVerified: true },
  });
  if (!member) return { code: memberCode, eligible: false, reasons: ['member_not_found'], rule: null };

  const rules = await prisma.promotionRule.findMany({ where: { active: true }, orderBy: { createdAt: 'asc' } });
  return evaluateOutcome(member, pickRule(rules, member.level));
}

/** ตรวจสิทธิ์เขียนข้อมูลแบบ "จริง" (โหมด live) — ต้องมี Bearer CRON_SECRET เท่านั้น */
export function isAuthorized(req: Request) {
  const secret = process.env.CRON_SECRET || '';
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return secret.length > 0 && got.length > 0 && got === secret;
}
