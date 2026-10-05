import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyTokenEdge } from '@/lib/auth-edge';
import { RECRUIT_STAGES, STAGE_PREFIX, stageByKey, missingRequired } from '@/lib/recruitPipeline';

// ─────────────────────────────────────────────────────────────────────────────
// /api/recruit/stage — ไปป์ไลน์รับสมัครตัวแทน (ผู้มุ่งหวัง) 8 ขั้น
//   GET  ?prospectId=<uuid>  → รายละเอียดผู้มุ่งหวัง + ขั้นปัจจุบัน + ข้อมูลที่กรอกแล้วทุกขั้น
//   GET                      → รายการผู้มุ่งหวังล่าสุด + ขั้นปัจจุบัน (สำหรับหน้าติดตาม)
//   POST { prospectId, stage, data } → เก็บข้อมูลของขั้นนั้น + เลื่อนขั้น (append-only history)
//
// ต้องล็อกอิน (middleware กัน /api/* ที่ไม่อยู่ใน PUBLIC_API อยู่แล้ว)
// การอนุมัติ/เลื่อนขั้น: ผู้ใช้ rankLevel ≥ 2 หรืออีเมลผู้ดูแลระบบ
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'akarapol.pro798@gmail.com';

function token(req: NextRequest): string {
  return (
    req.cookies.get('token')?.value ||
    req.cookies.get('auth_token')?.value ||
    (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') ||
    ''
  );
}

async function currentUser(req: NextRequest) {
  const t = token(req);
  if (!t) return null;
  return verifyTokenEdge(t);
}

function canAdvance(me: { email?: string; rankLevel?: number } | null): boolean {
  if (!me) return false;
  if (String(me.email || '').toLowerCase() === ADMIN_EMAIL) return true;
  return Number(me.rankLevel ?? 0) >= 2;
}

function parseStage(content: string | null): { stage?: string; data?: any } {
  if (!content) return {};
  try {
    const j = JSON.parse(content);
    return { stage: j?.stage, data: j?.data };
  } catch {
    return {};
  }
}

async function latestStage(prospectId: string): Promise<string | null> {
  const h = await prisma.prospectStatusHistory
    .findFirst({ where: { prospectId }, orderBy: { createdAt: 'desc' }, select: { toStatus: true } })
    .catch(() => null);
  return h?.toStatus ?? null;
}

export async function GET(req: NextRequest) {
  const me = await currentUser(req);
  if (!me) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });

  const url = new URL(req.url);
  const id = url.searchParams.get('prospectId');

  // ── รายละเอียดผู้มุ่งหวังรายคน ─────────────────────────────────────────────
  if (id) {
    const p = await prisma.prospect
      .findFirst({
        where: { OR: [{ id }, { prospectId: id }] },
        select: { id: true, prospectId: true, firstName: true, lastName: true, nickname: true, phone: true, email: true, province: true, occupation: true, referralCode: true, interest: true, status: true, leadScore: true, consentStatus: true, createdAt: true },
      })
      .catch(() => null);
    if (!p) return NextResponse.json({ ok: false, error: 'ไม่พบผู้มุ่งหวังรายนี้' }, { status: 404 });

    const [acts, hist] = await Promise.all([
      prisma.prospectActivity.findMany({ where: { prospectId: p.id }, orderBy: { createdAt: 'asc' }, select: { type: true, content: true, createdAt: true } }).catch(() => []),
      prisma.prospectStatusHistory.findMany({ where: { prospectId: p.id }, orderBy: { createdAt: 'asc' }, select: { fromStatus: true, toStatus: true, createdAt: true } }).catch(() => []),
    ]);

    const steps: Record<string, any> = {};
    let application: any = null;
    for (const a of acts) {
      if (a.type === 'recruit_application') { try { application = JSON.parse(a.content || '{}'); } catch {} continue; }
      if (a.type?.startsWith(STAGE_PREFIX)) {
        const key = a.type.slice(STAGE_PREFIX.length);
        const { data } = parseStage(a.content);
        steps[key] = { data: data || {}, at: a.createdAt };
      }
    }
    const current = hist.length ? hist[hist.length - 1].toStatus : null;
    const currentKey = current && stageByKey(current) ? current : null;

    return NextResponse.json({
      ok: true,
      prospect: p,
      application,
      currentStage: currentKey,
      progress: currentKey ? (RECRUIT_STAGES.findIndex((s) => s.key === currentKey) + 1) / RECRUIT_STAGES.length : 0,
      steps,
      history: hist,
      stages: RECRUIT_STAGES,
    });
  }

  // ── รายการผู้มุ่งหวังล่าสุด + ขั้นปัจจุบัน ────────────────────────────────
  const rows = await prisma.prospect
    .findMany({
      orderBy: { createdAt: 'desc' }, take: 60,
      select: { id: true, prospectId: true, firstName: true, lastName: true, phone: true, status: true, createdAt: true, referralCode: true },
    })
    .catch(() => []);

  const ids = rows.map((r) => r.id);
  const hist = ids.length
    ? await prisma.prospectStatusHistory
        .findMany({ where: { prospectId: { in: ids } }, orderBy: { createdAt: 'asc' }, select: { prospectId: true, toStatus: true, createdAt: true } })
        .catch(() => [])
    : [];

  const stageOf = new Map<string, { stage: string; at: Date }>();
  for (const h of hist) stageOf.set(h.prospectId, { stage: h.toStatus, at: h.createdAt });

  const list = rows.map((r) => {
    const s = stageOf.get(r.id);
    const isKnown = s && stageByKey(s.stage);
    return {
      id: r.id,
      prospectId: r.prospectId,
      name: `${r.firstName} ${r.lastName}`.trim(),
      phone: r.phone || '',
      referralCode: r.referralCode || '',
      status: r.status,
      stage: isKnown ? s!.stage : null,
      stageLabel: isKnown ? stageByKey(s!.stage)!.label : 'ยังไม่เริ่มไปป์ไลน์',
      stageAt: s?.at ?? null,
      createdAt: r.createdAt,
    };
  });

  return NextResponse.json({ ok: true, prospects: list, stages: RECRUIT_STAGES, canAdvance: canAdvance(me) });
}

export async function POST(req: NextRequest) {
  const me = await currentUser(req);
  if (!me) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  if (!canAdvance(me)) {
    return NextResponse.json({ ok: false, error: 'ต้องเป็นหัวหน้าหน่วยขึ้นไปหรือผู้ดูแลระบบจึงจะเลื่อนขั้นได้' }, { status: 403 });
  }

  const b: any = await req.json().catch(() => ({}));
  const stageKey = String(b.stage || '').toUpperCase();
  const st = stageByKey(stageKey);
  if (!st) return NextResponse.json({ ok: false, error: 'ไม่รู้จักขั้นตอนนี้' }, { status: 400 });

  const idOrCode = String(b.prospectId || '').trim();
  if (!idOrCode) return NextResponse.json({ ok: false, error: 'ต้องระบุผู้มุ่งหวัง' }, { status: 400 });

  const p = await prisma.prospect
    .findFirst({ where: { OR: [{ id: idOrCode }, { prospectId: idOrCode }] }, select: { id: true, status: true } })
    .catch(() => null);
  if (!p) return NextResponse.json({ ok: false, error: 'ไม่พบผู้มุ่งหวังรายนี้' }, { status: 404 });

  const data = (b.data && typeof b.data === 'object') ? b.data : {};
  const missing = missingRequired(stageKey, data);
  if (missing.length) {
    return NextResponse.json({ ok: false, error: 'กรอกข้อมูลให้ครบก่อน: ' + missing.join(', '), missing }, { status: 400 });
  }

  const from = (await latestStage(p.id)) || null;
  const payload = { stage: stageKey, data, by: { id: me.sub, email: me.email }, at: new Date().toISOString() };

  // ① ประวัติกิจกรรม = เก็บข้อมูลของขั้นนี้ (append-only, ไม่ทับของเดิม)
  await prisma.prospectActivity
    .create({ data: { prospectId: p.id, userId: me.sub, type: `${STAGE_PREFIX}${stageKey}`, content: JSON.stringify(payload).slice(0, 8000) } })
    .catch(() => null);

  // ② ประวัติการเปลี่ยนขั้น
  await prisma.prospectStatusHistory
    .create({ data: { prospectId: p.id, fromStatus: from, toStatus: stageKey, changedBy: me.sub } })
    .catch(() => null);

  // ③ สถานะ Prospect ตาม enum เดิมของระบบ (ให้แดชบอร์ด/คิวเดิมยังทำงานได้)
  const updated = await prisma.prospect
    .update({ where: { id: p.id }, data: { status: st.mapsTo as any, lastContactAt: new Date() } })
    .catch(() => null);

  const nextIdx = RECRUIT_STAGES.findIndex((x) => x.key === stageKey) + 1;
  return NextResponse.json({
    ok: true,
    stage: stageKey,
    stageLabel: st.label,
    prospectStatus: updated?.status || p.status,
    nextStage: RECRUIT_STAGES[nextIdx] ? { key: RECRUIT_STAGES[nextIdx].key, label: RECRUIT_STAGES[nextIdx].label } : null,
    message: `บันทึกขั้น "${st.label}" เรียบร้อย`,
  });
}
