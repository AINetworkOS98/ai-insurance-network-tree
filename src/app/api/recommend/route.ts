import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeLeadApi } from '@/lib/leadApiAuth';
import {
  str, num, isUuid, resolveProspectId, dayKeyBkk, startOfDayBkk, fmtProspectName, FREQ_CAP,
} from '@/lib/leadNurture';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/recommend — บันทึกคำแนะนำคลิปให้ lead (จาก n8n WF04)
// GET  /api/recommend — candidates: ผู้สนใจที่ยัง active + คลังคลิป (สำหรับ WF04)
//   (WF04 เรียกด้วย URL /api/recommend/candidates → มีไฟล์ alias ที่
//    src/app/api/recommend/candidates/route.ts re-export GET ไปที่ไฟล์นี้)
//
// POST จาก WF04: { prospectId, videoId, reason, confidence, channel, status:'QUEUED',
//                  message, caps, sentToday, sentThisWeek, source }
// → ตอบ { ok:true, recommendationId, dedupeKey, created }
//
// GET ต้องตอบรูปร่างที่ WF04 อ่าน: { ok, leads:[{prospectId,name,channel,interests,
//   sentToday,sentThisWeek,lastSentVideoIds,consentMarketing,unsubscribed}],
//   videos:[{videoId(UUID),title,topic,url,cta,status:'ACTIVE',keywords}], caps }
//
// ⚠️ ต้องเพิ่ม '/api/recommend' ใน PUBLIC_API ของ src/middleware.ts (ดู /src/lib/leadApiAuth.ts)
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS_MAP: Record<string, string> = {
  QUEUED: 'pending', PENDING: 'pending', SENT: 'sent', VIEWED: 'viewed',
  DISMISSED: 'dismissed', EXPIRED: 'expired',
};

function mapStatus(raw: unknown): string {
  const s = String(raw || 'pending').toUpperCase();
  return STATUS_MAP[s] || 'pending';
}

async function resolveVideo(db: any, raw: unknown) {
  const key = str(raw, 64);
  if (!key) return null;
  if (isUuid(key)) {
    const byId = await db.video.findUnique({ where: { id: key } }).catch(() => null);
    if (byId) return byId;
  }
  const byCode = await db.video.findUnique({ where: { videoId: key } }).catch(() => null);
  return byCode || null;
}

// ── สร้างรายการ lead ที่ยัง active (มี EngagementScore) สำหรับ WF04 ───────────
async function loadCandidateLeads(db: any, limit: number) {
  const scores: any[] = await db.engagementScore.findMany({
    orderBy: [{ score: 'desc' }, { computedAt: 'desc' }],
    take: limit,
  }).catch(() => []);
  const ids: string[] = scores.map((s) => s.prospectId).filter(Boolean);
  if (!ids.length) return [];

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const todayStart = startOfDayBkk(now);

  const [prospects, prefs, interests, unsubs, sentFollowUps, recs] = await Promise.all([
    db.prospect.findMany({ where: { id: { in: ids } }, include: { consents: { orderBy: { createdAt: 'desc' }, take: 6 } } }).catch(() => []),
    db.channelPreference.findMany({ where: { prospectId: { in: ids } } }).catch(() => []),
    db.leadInterest.findMany({ where: { prospectId: { in: ids } }, orderBy: { weight: 'desc' } }).catch(() => []),
    db.unsubscribe.findMany({ where: { prospectId: { in: ids } }, select: { prospectId: true } }).catch(() => []),
    db.followUp.findMany({ where: { prospectId: { in: ids }, status: 'sent', sentAt: { gte: weekAgo } }, select: { prospectId: true, sentAt: true } }).catch(() => []),
    db.recommendation.findMany({ where: { prospectId: { in: ids } }, select: { prospectId: true, videoId: true } }).catch(() => []),
  ]);

  const prospectMap = new Map<string, any>(prospects.map((p: any) => [p.id, p]));
  const prefMap = new Map<string, any>(prefs.map((p: any) => [p.prospectId, p]));
  const unsubSet = new Set<string>(unsubs.map((u: any) => u.prospectId).filter(Boolean));
  const interestMap = new Map<string, string[]>();
  for (const it of interests) {
    const arr = interestMap.get(it.prospectId) || [];
    arr.push(it.topic);
    interestMap.set(it.prospectId, arr);
  }
  const lastSentMap = new Map<string, string[]>();
  for (const r of recs) {
    const arr = lastSentMap.get(r.prospectId) || [];
    if (r.videoId) arr.push(r.videoId);
    lastSentMap.set(r.prospectId, arr);
  }
  const sentTodayMap = new Map<string, number>();
  const sentWeekMap = new Map<string, number>();
  for (const s of sentFollowUps) {
    const at = new Date(s.sentAt).getTime();
    if (at >= todayStart.getTime()) sentTodayMap.set(s.prospectId, (sentTodayMap.get(s.prospectId) || 0) + 1);
    if (at >= weekAgo.getTime()) sentWeekMap.set(s.prospectId, (sentWeekMap.get(s.prospectId) || 0) + 1);
  }

  return scores
    .map((sc) => {
      const p = prospectMap.get(sc.prospectId);
      if (!p) return null;
      const pref = prefMap.get(sc.prospectId) || null;
      const consentMarketing = (p.consents || []).some((c: any) => String(c.type).toUpperCase() === 'MARKETING' && c.granted === true);
      const topics = interestMap.get(sc.prospectId) || (p.interest ? String(p.interest).split(/[,|]/).map((t) => t.trim()).filter(Boolean) : []);
      return {
        prospectId: p.id,
        id: p.id,
        prospectCode: p.prospectId,
        name: fmtProspectName(p),
        score: sc.score,
        engagementScore: sc.score,
        level: sc.level,
        channel: pref?.preferred || null,
        interests: topics,
        topics,
        phone: pref?.phone || p.phone || null,
        email: pref?.emailAddress || p.email || null,
        lineUserId: pref?.lineUserId || null,
        consentMarketing: Boolean(consentMarketing),
        unsubscribed: unsubSet.has(sc.prospectId),
        optOut: unsubSet.has(sc.prospectId),
        sentToday: sentTodayMap.get(sc.prospectId) || 0,
        sentThisWeek: sentWeekMap.get(sc.prospectId) || 0,
        lastSentVideoIds: lastSentMap.get(sc.prospectId) || [],
        sentVideoIds: lastSentMap.get(sc.prospectId) || [],
      };
    })
    .filter(Boolean);
}

export async function GET(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  if (!auth.ok) return auth.res;

  try {
    const db = prisma as any;
    const url = new URL(req.url);
    const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') || 50) || 50));

    const [leads, videos] = await Promise.all([
      loadCandidateLeads(db, limit),
      db.video.findMany({
        where: { status: 'active' },
        orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
        take: 200,
      }).catch(() => []),
    ]);

    const library = videos.map((v: any) => ({
      // videoId = UUID ของ Video.id เพื่อให้ POST /api/recommend เอาไปตั้ง FK ได้ตรง
      videoId: v.id,
      videoCode: v.videoId,          // V-XXXXXX (รหัสที่คนเห็น)
      title: v.title,
      url: v.url,
      thumbnailUrl: v.thumbnailUrl || null,
      topic: v.topic || null,
      subTopic: v.subTopic || null,
      targetInterest: v.targetInterest || null,
      keywords: Array.isArray(v.keywords) ? v.keywords : [],
      cta: v.cta || null,
      ctaUrl: v.ctaUrl || null,
      durationSec: v.durationSec || null,
      priority: v.priority ?? 0,
      status: 'ACTIVE',
    }));

    return NextResponse.json({
      ok: true,
      leads,
      candidates: leads,
      videos: library,
      library,
      caps: FREQ_CAP,
      counts: { leads: leads.length, videos: library.length },
      at: new Date().toISOString(),
      via: auth.via,
    });
  } catch (e: any) {
    console.error('[recommend:GET] error', e?.message);
    return NextResponse.json({ ok: false, error: 'โหลดรายการที่ต้องแนะนำไม่สำเร็จ' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  if (!auth.ok) return auth.res;

  try {
    const db = prisma as any;
    const body: any = await req.json().catch(() => ({}));

    const prospectId = await resolveProspectId(db, body?.prospectId ?? body?.prospect_id);
    if (!prospectId) {
      return NextResponse.json({ ok: false, error: 'ไม่พบผู้สนใจ (prospectId ไม่ถูกต้อง)' }, { status: 404 });
    }

    const video = await resolveVideo(db, body?.videoId ?? body?.video_id ?? body?.videoCode);
    if (!video) {
      return NextResponse.json({ ok: false, error: 'ไม่พบคลิป (videoId ต้องเป็น Video.id, V-XXXXXX หรือ UUID)' }, { status: 404 });
    }

    const now = new Date();
    const status = mapStatus(body?.status);
    const channel = (str(body?.channel, 20) || 'email').toLowerCase();
    const confidenceRaw = num(body?.confidence, 0, 100) ?? 0;
    const confidence = confidenceRaw > 1 ? confidenceRaw / 100 : confidenceRaw; // รับได้ทั้ง 0-1 และ 0-100
    const matchScore = num(body?.matchScore ?? body?.match_score, 0, 1000) ?? 0;
    const topic = str(body?.topic, 80) || video.topic || null;
    const reason = str(body?.reason ?? body?.message, 2000) || null;
    const createdBy = str(body?.createdBy, 80) || (auth.via === 'cron' ? 'ai' : (auth.userId || 'agent'));
    const dedupeKey = str(body?.dedupeKey, 200) || `${prospectId}:${video.id}:${dayKeyBkk(now)}`;

    const existing = await db.recommendation.findUnique({ where: { dedupeKey } }).catch(() => null);

    // ด่านความถี่ (WF04 ตรวจมาแล้ว; ตรวจซ้ำที่นี่กันผู้เรียกอื่นข้ามด่าน) — เฉพาะตอนสร้างใหม่
    if (!existing) {
      const caps = {
        perDay: num(body?.caps?.perDay, 1, 50) ?? FREQ_CAP.perDay,
        perWeek: num(body?.caps?.perWeek, 1, 200) ?? FREQ_CAP.perWeek,
      };
      const sentToday = num(body?.sentToday, 0, 1000) ?? 0;
      const sentThisWeek = num(body?.sentThisWeek, 0, 1000) ?? 0;
      if (sentToday >= caps.perDay || sentThisWeek >= caps.perWeek) {
        return NextResponse.json({
          ok: true, created: false, skipped: true, reason: 'frequency_cap',
          detail: `โควต้าครบ (วันนี้ ${sentToday}/${caps.perDay}, สัปดาห์นี้ ${sentThisWeek}/${caps.perWeek})`,
          prospectId, videoId: video.id, via: auth.via,
        });
      }
    }

    const data = {
      prospectId,
      videoId: video.id,
      topic,
      reason,
      confidence,
      matchScore,
      status,
      channel,
      dedupeKey,
      createdBy,
      sentAt: status === 'sent' ? now : null,
    };

    const saved = await db.recommendation.upsert({
      where: { dedupeKey },
      create: data,
      update: { topic, reason, confidence, matchScore, status, channel },
    });

    // นับ "ส่งแล้วกี่ครั้ง" เฉพาะเมื่อสถานะเป็น sent
    if (status === 'sent' && !existing) {
      await db.video.update({ where: { id: video.id }, data: { sentCount: { increment: 1 } } }).catch(() => null);
    }

    return NextResponse.json({
      ok: true,
      created: !existing,
      deduped: Boolean(existing),
      recommendationId: saved.id,
      prospectId,
      videoId: video.id,
      videoCode: video.videoId,
      status: saved.status,
      dedupeKey,
      via: auth.via,
    });
  } catch (e: any) {
    console.error('[recommend] error', e?.message);
    return NextResponse.json({ ok: false, error: 'บันทึกคำแนะนำไม่สำเร็จ' }, { status: 500 });
  }
}
