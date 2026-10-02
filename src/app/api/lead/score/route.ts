import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeLeadApi } from '@/lib/leadApiAuth';
import { str, num, isLevel, levelOf, normalizeWeight, resolveProspectId } from '@/lib/leadNurture';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/lead/score — บันทึกคะแนนความสนใจ + ความสนใจรายหัวข้อ (จาก n8n WF03)
// GET  /api/lead/score — สเปกย่อ
//
// n8n WF03 ส่ง: { prospectId, score, scoreMode:'set', level, breakdown, topics:[{topic,weight}],
//                aiOk, aiSummary, aiSuggestedAction, source:'n8n-03-behavior-analyzer' }
//
// scoreMode:
//   • 'set'  (ค่าเริ่มต้น) — ตั้งคะแนนเป็นค่าที่ส่งมา (idempotent: รันซ้ำได้ ไม่บวกซ้ำ)
//                            เพราะ /api/track บวกคะแนนสะสมให้แล้วตอนเก็บ event
//   • 'bump' — บวกเพิ่มจากคะแนนเดิม (score = delta) สำหรับผู้เรียกที่ต้องการบวกอย่างเดียว
//
// ⚠️ ต้องเพิ่ม '/api/lead/score' ใน PUBLIC_API ของ src/middleware.ts (ดู /src/lib/leadApiAuth.ts)
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function mergeBreakdown(prev: any, incoming: any, mode: 'set' | 'bump'): Record<string, number> {
  const out: Record<string, number> = {};
  if (prev && typeof prev === 'object') for (const [k, v] of Object.entries(prev)) out[k] = Number(v) || 0;
  if (incoming && typeof incoming === 'object') {
    for (const [k, v] of Object.entries(incoming)) {
      const n = Number(v) || 0;
      out[k] = mode === 'bump' ? (out[k] || 0) + n : n;
    }
  }
  return out;
}

export async function POST(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  if (!auth.ok) return auth.res;

  try {
    const db = prisma as any;
    const body: any = await req.json().catch(() => ({}));

    const prospectId = await resolveProspectId(db, body?.prospectId ?? body?.prospect_id);
    if (!prospectId) {
      return NextResponse.json(
        { ok: false, error: 'ไม่พบผู้สนใจ (prospectId ต้องเป็น Prospect.id, รหัส P-XXXXXX หรือ visitorId ที่ผูกไว้)' },
        { status: 404 },
      );
    }

    const mode: 'set' | 'bump' = String(body?.scoreMode ?? body?.mode ?? 'set').toLowerCase() === 'bump' ? 'bump' : 'set';
    const current = await db.engagementScore.findUnique({ where: { prospectId } }).catch(() => null);
    const now = new Date();

    let nextScore: number;
    let nextBreakdown: Record<string, number>;
    if (mode === 'bump') {
      const delta = num(body?.score ?? body?.delta, -100000, 100000) ?? 0;
      nextScore = Math.max(0, Math.round((current?.score || 0) + delta));
      nextBreakdown = mergeBreakdown(current?.breakdown, body?.breakdown, 'bump');
    } else {
      const s = num(body?.score, 0, 100000) ?? current?.score ?? 0;
      nextScore = Math.max(0, Math.round(s));
      nextBreakdown = mergeBreakdown(current?.breakdown, body?.breakdown, 'set');
    }

    const level = isLevel(body?.level) ? body.level : levelOf(nextScore);

    const saved = await db.engagementScore.upsert({
      where: { prospectId },
      create: {
        prospectId, score: nextScore, level, breakdown: nextBreakdown,
        eventCount: 1, lastEventAt: now, computedAt: now,
      },
      update: {
        score: nextScore, level, breakdown: nextBreakdown,
        eventCount: mode === 'bump' ? { increment: 1 } : undefined,
        lastEventAt: now, computedAt: now,
      },
    });

    // ── ซิงก์คะแนนไปที่ Prospect.leadScore (CRM เดิม) ─────────────────────────
    await db.prospect.update({ where: { id: prospectId }, data: { leadScore: nextScore } })
      .catch((e: any) => console.error('[lead/score] prospect.leadScore', e?.message));

    // ── ความสนใจรายหัวข้อ (WF03: topics = [{topic, weight 0-100}]) ──────────
    const rawTopics: any[] = Array.isArray(body?.topics) ? body.topics.slice(0, 10) : [];
    const updatedTopics: { topic: string; weight: number }[] = [];
    for (const t of rawTopics) {
      const topic = str(t?.topic ?? t?.name ?? t, 80);
      if (!topic) continue;
      const weight = normalizeWeight(t?.weight);
      updatedTopics.push({ topic, weight });
      await db.leadInterest.upsert({
        where: { prospectId_topic: { prospectId, topic } },
        create: {
          prospectId, topic, weight, hits: 1, source: 'ai',
          evidence: { at: now.toISOString(), source: str(body?.source, 80), aiSummary: str(body?.aiSummary, 400) },
        },
        update: {
          weight, hits: { increment: 1 }, lastSeenAt: now, source: 'ai',
          evidence: { at: now.toISOString(), source: str(body?.source, 80), aiSummary: str(body?.aiSummary, 400) },
        },
      }).catch((e: any) => console.error('[lead/score] leadInterest', e?.message));
    }

    return NextResponse.json({
      ok: true,
      prospectId,
      score: saved?.score ?? nextScore,
      level: saved?.level ?? level,
      mode,
      breakdown: nextBreakdown,
      updatedTopics,
      aiOk: body?.aiOk === true,
      aiSummary: str(body?.aiSummary, 400) || null,
      aiSuggestedAction: str(body?.aiSuggestedAction, 200) || null,
      via: auth.via,
    });
  } catch (e: any) {
    console.error('[lead/score] error', e?.message);
    return NextResponse.json({ ok: false, error: 'บันทึกคะแนนไม่สำเร็จ' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/lead/score',
    methods: ['POST'],
    body: {
      prospectId: 'Prospect.id | P-XXXXXX | visitorId',
      score: 'number', scoreMode: 'set (default) | bump',
      level: 'LOW | WARM | INTERESTED | HIGH_INTENT (ไม่ส่งก็ได้ ระบบคำนวณให้)',
      breakdown: 'object เช่น { page_view: 8, video_view: 12 }',
      topics: '[{ topic, weight(0-100) }]',
    },
    note: 'ต้องเพิ่ม /api/lead/score ใน PUBLIC_API ของ src/middleware.ts ไม่งั้นจะโดน 401',
  });
}
