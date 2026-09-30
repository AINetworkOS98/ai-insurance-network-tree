import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeLeadApi } from '@/lib/leadApiAuth';
import { str, num, isUuid, resolveProspectId, levelOf } from '@/lib/leadNurture';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/agent-tasks — สร้าง "งานให้ตัวแทนมนุษย์" (ห้าม AI ปิดการขายเอง — แผนหมวด 4)
// GET  /api/agent-tasks — สเปกย่อ + งานที่ยังเปิดอยู่ (สำหรับ dashboard/ตัวแทน)
//
// n8n WF06 ส่ง: { prospectId, type:'high_intent_lead', priority, stage:'HIGH_INTENT',
//                status:'open', assignee:null, note, contact:{phone,email,channel},
//                score, level, dedupeKey:'escalate:<prospectId>', dueAt, source }
// → ตอบ { ok:true, taskId } (WF06 อ่าน taskId)
//
// กันงานซ้ำ (dedupeKey): สคีมา AgentTask ไม่มีคอลัมน์ dedupeKey ⇒ เก็บ dedupeKey ใน
// payload JSON แล้วค้นด้วย JSON path filter · ถ้าไม่ส่ง dedupeKey มา ใช้กติกา
// "มีงาน type เดียวกันที่ยัง open/in_progress ของ lead เดียวกัน = ซ้ำ"
//
// ⚠️ ต้องเพิ่ม '/api/agent-tasks' ใน PUBLIC_API ของ src/middleware.ts (ดู /src/lib/leadApiAuth.ts)
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TASK_TYPES = new Set([
  'high_intent_lead', 'follow_up_call', 'recommendation_review', 'consent_request', 'data_cleanup',
]);
const PRIORITIES = new Set(['low', 'normal', 'high', 'urgent']);
const STATUSES = new Set(['open', 'in_progress', 'done', 'cancelled']);

function pickPriority(raw: unknown, score: number | null, level: string | null): string {
  const p = typeof raw === 'string' ? raw.toLowerCase() : '';
  if (PRIORITIES.has(p)) return p;
  if (level === 'HIGH_INTENT' || (score ?? 0) >= 70) return (score ?? 0) >= 85 ? 'urgent' : 'high';
  return 'normal';
}

function buildTitle(type: string, level: string | null, score: number | null): string {
  const s = score ?? 0;
  switch (type) {
    case 'high_intent_lead': return `Lead คะแนนสูง ${s} (${level || levelOf(s)}) — ควรมีตัวแทนติดต่อ`;
    case 'follow_up_call': return 'ติดตามผู้สนใจทางโทรศัพท์';
    case 'recommendation_review': return 'ตรวจทานคลิปที่ระบบแนะนำ';
    case 'consent_request': return 'ขอความยินยอมติดต่อผู้สนใจ';
    case 'data_cleanup': return 'ตรวจสอบ/ทำความสะอาดข้อมูลผู้สนใจ';
    default: return 'งานติดตามผู้สนใจ';
  }
}

export async function POST(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  if (!auth.ok) return auth.res;

  try {
    const db = prisma as any;
    const body: any = await req.json().catch(() => ({}));

    const typeRaw = (str(body?.type, 60) || 'follow_up_call').toLowerCase();
    const type = TASK_TYPES.has(typeRaw) ? typeRaw : 'follow_up_call';
    const rawProspect = body?.prospectId ?? body?.prospect_id ?? null;
    const prospectId = rawProspect ? await resolveProspectId(db, rawProspect) : null;

    const score = num(body?.score ?? body?.triggerScore, 0, 100000);
    const level = str(body?.level, 20) || (score !== null ? levelOf(score) : null);
    const priority = pickPriority(body?.priority, score, level);
    const statusRaw = (str(body?.status, 20) || 'open').toLowerCase();
    const status = STATUSES.has(statusRaw) ? statusRaw : 'open';
    const note = str(body?.note, 4000) || null;
    const contact = (body?.contact && typeof body.contact === 'object') ? body.contact : {};
    const channel = str(contact?.channel ?? body?.channel, 20) || null;
    const dedupeKey = str(body?.dedupeKey ?? body?.dedupe_key ?? body?.idempotencyKey, 200) || null;
    const source = str(body?.source, 80) || (auth.via === 'cron' ? 'cron' : 'agent');
    const title = str(body?.title, 200) || buildTitle(type, level, score);
    const assignee = str(body?.assignee ?? body?.assigneeId, 64);

    const dueRaw = body?.dueAt ? new Date(body.dueAt) : null;
    const dueAt = dueRaw && !Number.isNaN(dueRaw.getTime()) ? dueRaw : new Date(Date.now() + 24 * 3600 * 1000);

    // ── กันซ้ำ ① dedupeKey (เก็บใน payload) ─────────────────────────────────
    let existing: any = null;
    if (dedupeKey) {
      existing = await db.agentTask.findFirst({
        where: { payload: { path: ['dedupeKey'], equals: dedupeKey } },
      }).catch(() => null);
    }
    // ── กันซ้ำ ② งานเปิดอยู่ type เดียวกันของ lead เดียวกัน ──────────────────
    if (!existing && prospectId) {
      existing = await db.agentTask.findFirst({
        where: { prospectId, type, status: { in: ['open', 'in_progress'] } },
        orderBy: { createdAt: 'desc' },
      }).catch(() => null);
    }

    if (existing) {
      return NextResponse.json({
        ok: true,
        created: false,
        deduped: true,
        taskId: existing.id,
        task: existing,
        message: 'มีงานนี้อยู่แล้ว — ไม่สร้างซ้ำ',
        via: auth.via,
      });
    }

    const created = await db.agentTask.create({
      data: {
        prospectId: prospectId || null,
        assigneeId: assignee && isUuid(assignee) ? assignee : null,
        createdById: auth.userId && isUuid(auth.userId) ? auth.userId : null,
        type,
        title,
        note: note || (contact?.phone || contact?.email ? `ติดต่อ: ${[contact?.phone, contact?.email].filter(Boolean).join(' · ')}` : null),
        priority,
        status,
        channel,
        triggerScore: score,
        sourceEventId: str(body?.sourceEventId, 80) || null,
        payload: {
          dedupeKey,
          stage: str(body?.stage, 40) || null,
          level,
          score,
          contact,
          source,
          requestedBy: auth.via,
          rawProspectId: str(rawProspect, 64),
          at: new Date().toISOString(),
        },
        dueAt,
      },
    });

    return NextResponse.json({
      ok: true,
      created: true,
      deduped: false,
      taskId: created.id,
      task: created,
      via: auth.via,
    });
  } catch (e: any) {
    console.error('[agent-tasks] error', e?.message);
    return NextResponse.json({ ok: false, error: 'สร้างงานให้ตัวแทนไม่สำเร็จ' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  if (!auth.ok) return auth.res;
  try {
    const db = prisma as any;
    const url = new URL(req.url);
    const status = (url.searchParams.get('status') || '').toLowerCase();
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 50) || 50));
    const where: any = STATUSES.has(status) ? { status } : { status: { in: ['open', 'in_progress'] } };
    const tasks = await db.agentTask.findMany({ where, orderBy: [{ priority: 'desc' }, { dueAt: 'asc' }], take: limit }).catch(() => []);
    return NextResponse.json({ ok: true, tasks, total: tasks.length, via: auth.via });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}
