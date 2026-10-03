import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeLeadApi } from '@/lib/leadApiAuth';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/video-intel/analysis — เก็บผลวิเคราะห์ของ AI (สมองกลาง = n8n + LLM)
//
// รับ JSON structured output จาก workflow n8n "Video Intel 01/02/03" เท่านั้น
//   { analysis_id, visitor_id, session_id, page, video_id,
//     engagement_score 0-100, interest_level COLD|WARM|HOT|VERY_HOT,
//     watch_probability, returning_visitor, video_completion 0-1,
//     ai_summary, recommended_action, reason[], model, send_alert }
//
// กติกา:
//   • idempotent ด้วย analysis_id (n8n ยิงซ้ำ = ไม่สร้างแถวใหม่)
//   • อัปเดตค่าสรุปบน visitors (คะแนน + ระดับ) เพื่อให้ dashboard/รายงานเร็ว
//   • AI ห้ามส่งข้อมูลส่วนบุคคล — route นี้ไม่รับฟิลด์ชื่อ/อายุ/เพศ/รายได้/อาชีพ โดยเจตนา
//   • สิทธิ์: session ผู้ดูแล หรือ Authorization: Bearer CRON_SECRET (n8n)
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LEVELS = new Set(['COLD', 'WARM', 'HOT', 'VERY_HOT']);

function str(v: any, max = 300): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}
function num(v: any, min: number, max: number, dflt = 0): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}
function levelFromScore(score: number): string {
  if (score >= 75) return 'VERY_HOT';
  if (score >= 50) return 'HOT';
  if (score >= 25) return 'WARM';
  return 'COLD';
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/video-intel/analysis',
    methods: ['POST'],
    auth: 'session | Bearer CRON_SECRET',
    fields: [
      'analysis_id', 'visitor_id', 'session_id', 'page', 'video_id',
      'engagement_score', 'interest_level', 'watch_probability', 'returning_visitor',
      'video_completion', 'ai_summary', 'recommended_action', 'reason[]', 'model', 'send_alert',
    ],
    levels: ['COLD', 'WARM', 'HOT', 'VERY_HOT'],
    note: 'AI ต้องอ้างเหตุผลจาก event จริงเท่านั้น และห้ามสร้างข้อมูลส่วนบุคคลของผู้ชม',
  });
}

export async function POST(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  if (!auth.ok) return auth.res;

  try {
    const body: any = await req.json().catch(() => ({}));
    const db = prisma as any;

    const visitorId = str(body?.visitor_id || body?.visitorId, 64);
    const sessionId = str(body?.session_id || body?.sessionId, 80);
    const analysisId = str(body?.analysis_id || body?.analysisId, 80)
      || `${visitorId || 'unknown'}-${sessionId || 'nosession'}-${Date.now()}`;
    const score = Math.round(num(body?.engagement_score ?? body?.engagementScore, 0, 100, 0));
    const levelRaw = String(body?.interest_level || body?.interestLevel || '').toUpperCase().replace(/[\s-]+/g, '_');
    const level = LEVELS.has(levelRaw) ? levelRaw : levelFromScore(score);

    const data = {
      analysisId,
      visitorId,
      sessionId,
      page: str(body?.page, 300),
      videoId: str(body?.video_id || body?.videoId, 80),
      engagementScore: score,
      interestLevel: level,
      watchProbability: str(body?.watch_probability, 20),
      returningVisitor: body?.returning_visitor === true || body?.returningVisitor === true,
      videoCompletion: num(body?.video_completion ?? body?.videoCompletion, 0, 1, 0),
      aiSummary: str(body?.ai_summary ?? body?.aiSummary, 4000),
      recommendedAction: str(body?.recommended_action ?? body?.recommendedAction, 2000),
      reason: Array.isArray(body?.reason) ? body.reason.slice(0, 12).map((r: any) => String(r).slice(0, 300)) : [],
      raw: body && typeof body === 'object' ? body : null,
      model: str(body?.model, 80),
      sendAlert: body?.send_alert === true || score >= 80,
    };

    let duplicate = false;
    let row: any = null;
    const existing = await db.videoAiAnalysis.findUnique({ where: { analysisId } }).catch(() => null);
    if (existing) {
      duplicate = true;
      row = existing;
    } else {
      row = await db.videoAiAnalysis.create({ data }).catch(async (e: any) => {
        if (String(e?.code) === 'P2002') { duplicate = true; return db.videoAiAnalysis.findUnique({ where: { analysisId } }); }
        throw e;
      });
    }

    // อัปเดตค่าสรุปบน Visitor (แคชเพื่อความเร็ว — คะแนนยังคำนวณจาก event จริงเสมอ)
    let visitorUpdated = false;
    if (visitorId && !duplicate) {
      const v = await db.visitor.findUnique({ where: { visitorId } }).catch(() => null);
      if (v) {
        await db.visitor.update({
          where: { visitorId },
          data: { engagementScore: score, interestLevel: level, lastAnalyzedAt: new Date() },
        }).catch(() => null);
        visitorUpdated = true;
      }
    }

    // มาร์ก event ที่ผูกกับ session นี้ว่าประมวลผลแล้ว (กันลูปประมวลผลซ้ำ)
    let eventsMarked = 0;
    const eventIds: string[] = Array.isArray(body?.event_ids) ? body.event_ids.slice(0, 200).map((x: any) => String(x)) : [];
    if (eventIds.length) {
      const r = await db.visitorEvent.updateMany({
        where: { eventId: { in: eventIds }, processedAt: null },
        data: { processedAt: new Date() },
      }).catch(() => ({ count: 0 }));
      eventsMarked = Number(r?.count || 0);
    } else if (visitorId && sessionId && !duplicate) {
      const v = await db.visitor.findUnique({ where: { visitorId } }).catch(() => null);
      if (v?.id) {
        const r = await db.visitorEvent.updateMany({
          where: { visitorId: v.id, sessionId, processedAt: null },
          data: { processedAt: new Date() },
        }).catch(() => ({ count: 0 }));
        eventsMarked = Number(r?.count || 0);
      }
    }

    return NextResponse.json({
      ok: true,
      analysisId,
      id: row?.id || null,
      duplicate,
      visitorUpdated,
      eventsMarked,
      engagementScore: score,
      interestLevel: level,
      sendAlert: data.sendAlert,
      alertSent: Boolean(row?.alertSent),
      at: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[video-intel/analysis] error:', e?.message);
    return NextResponse.json({ ok: false, error: 'บันทึกผลวิเคราะห์ไม่สำเร็จ' }, { status: 500 });
  }
}
