import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeLeadApi } from '@/lib/leadApiAuth';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/video-intel/aggregate?visitor_id=<uuid>&session_id=<id>&minutes=60
//
// "อาหารของสมอง AI" — รวมพฤติกรรมการรับชมของผู้ชม 1 คน เป็นชุดข้อมูลเดียว
// ให้ workflow n8n ยิงเข้า LLM วิเคราะห์ Engagement Score / Behavioral Interest Level
//
// หลักการที่บังคับ:
//   • ส่งเฉพาะข้อเท็จจริงจาก event จริง (จำนวน play / pause / seek / % ที่ดู / เวลา)
//   • ไม่มีชื่อ อายุ เพศ รายได้ อาชีพ หรือข้อมูลติดต่อ — ไม่มีอยู่ในคำตอบนี้โดยเจตนา
//   • คำนวณเสร็จฝั่งเซิร์ฟเวอร์ เพื่อให้ AI ไม่ต้องเดาจากตัวเลขที่กำกวม
//
// สิทธิ์: session ผู้ดูแล หรือ Authorization: Bearer CRON_SECRET (n8n)
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MARKS = [10, 25, 50, 75, 90, 100];

type Ev = {
  eventId: string; type: string; sessionId: string | null; pagePath: string | null;
  videoCode: string | null; watchPct: number | null; watchSeconds: number | null;
  meta: any; at: Date;
};
const isPlay = (t: string) => t === 'video_play';
const isPause = (t: string) => t === 'video_pause';
const isResume = (t: string) => t === 'video_resume';
const isSeek = (t: string) => t === 'video_seek' || t.startsWith('video_seek_');
const isProgress = (t: string) => t === 'video_progress' || t.startsWith('video_progress');
const isEnded = (t: string) => t === 'video_ended' || t === 'video_complete';

function summarize(events: Ev[]) {
  const n = (f: (t: string) => boolean) => events.filter(e => f(e.type)).length;
  const maxPct = events.reduce((m, e) => Math.max(m, Number(e.watchPct || 0)), 0);
  // watch_duration ที่สคริปต์ส่งมาเป็น "สะสมใน session นั้น" ⇒ ใช้ค่าสูงสุด ไม่บวกกัน
  const maxWatch = events.reduce((m, e) => Math.max(m, Number(e.watchSeconds || 0)), 0);
  const metaOf = (key: string) => events.map(e => e.meta?.[key]).filter(v => v !== undefined && v !== null);
  const lastMeta = (key: string) => {
    for (let i = events.length - 1; i >= 0; i -= 1) {
      const v = events[i].meta?.[key];
      if (v !== undefined && v !== null) return v;
    }
    return null;
  };
  const durations = metaOf('videoDuration').map(Number).filter(Number.isFinite);
  const marks = MARKS.filter(m => maxPct >= m);
  const interactions = events
    .filter(e => e.type.startsWith('video_') && !['video_play', 'video_pause', 'video_resume'].includes(e.type))
    .map(e => e.meta?.interaction || e.type.replace(/^video_/, ''))
    .filter(Boolean);
  return {
    eventCount: events.length,
    playCount: n(isPlay),
    pauseCount: n(isPause),
    resumeCount: n(isResume),
    seekCount: n(isSeek),
    progressEventCount: n(isProgress),
    endedCount: n(isEnded),
    replayCount: events.filter(e => e.meta?.replay === true || e.type === 'video_replay').length,
    maxProgressPercent: Math.round(maxPct),
    watchSeconds: Math.round(maxWatch),
    videoDuration: durations.length ? Math.round(Math.max(...durations)) : null,
    marksReached: marks,
    completed: maxPct >= 100 || n(isEnded) > 0,
    fullscreen: events.some(e => e.meta?.fullscreen === true || e.type === 'video_fullscreen'),
    muted: lastMeta('muted'),
    volume: lastMeta('volume'),
    interactions: [...new Set(interactions)].slice(0, 12),
  };
}

function levelOf(score: number) {
  if (score >= 75) return 'VERY_HOT';
  if (score >= 50) return 'HOT';
  if (score >= 25) return 'WARM';
  return 'COLD';
}

/** คะแนนฐานจากพฤติกรรมจริง — AI จะทบทวน/ปรับพร้อมเหตุผลอีกชั้น */
function baseScore(v: any, s: any) {
  let score = 0;
  score += Math.min(20, s.maxProgressPercent * 0.2);
  score += Math.min(15, s.playCount * 5);
  score += Math.min(10, s.replayCount * 5);
  score += Math.min(10, (s.pauseCount + s.resumeCount) * 2);
  score += Math.min(5, s.seekCount * 1.5);
  score += s.completed ? 12 : 0;
  score += !v.returning ? 0 : Math.min(15, 5 + v.totalSessions * 3);
  score += Math.min(8, Math.max(0, Number(v.averageWatchPercent || 0)) * 0.08);
  score += Math.min(5, Number(v.totalVideoViews || 0) * 0.5);
  return Math.max(0, Math.min(100, Math.round(score)));
}

export async function GET(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  if (!auth.ok) return auth.res;

  try {
    const url = new URL(req.url);
    const visitorKey = String(url.searchParams.get('visitor_id') || url.searchParams.get('visitorId') || '').trim();
    const sessionId = String(url.searchParams.get('session_id') || url.searchParams.get('sessionId') || '').trim();
    const minutes = Math.max(1, Math.min(60 * 24 * 30, Number(url.searchParams.get('minutes') || 120)));

    if (!visitorKey) {
      return NextResponse.json({ ok: false, error: 'ต้องระบุ visitor_id' }, { status: 400 });
    }

    const db = prisma as any;
    const v = await db.visitor.findUnique({ where: { visitorId: visitorKey } }).catch(() => null);
    if (!v) {
      return NextResponse.json({ ok: false, error: 'ไม่พบผู้ชมรายนี้ (visitor_id ใหม่/ยังไม่มีข้อมูล)', visitorId: visitorKey }, { status: 404 });
    }

    const since = new Date(Date.now() - minutes * 60 * 1000);
    const allEvents: Ev[] = await db.visitorEvent.findMany({
      where: { visitorId: v.id, at: { gte: since } },
      orderBy: { at: 'asc' },
      take: 800,
      select: { eventId: true, type: true, sessionId: true, pagePath: true, videoCode: true, watchPct: true, watchSeconds: true, meta: true, at: true },
    }).catch(() => []);

    const sessionEvents = sessionId ? allEvents.filter((e: Ev) => e.sessionId === sessionId) : allEvents;
    const priorSessions = new Set<string>();
    for (const e of allEvents) if (e.sessionId && e.sessionId !== sessionId) priorSessions.add(e.sessionId);

    const sessionsOfVisitor: string[] = await db.visitorEvent.findMany({
      where: { visitorId: v.id },
      distinct: ['sessionId'],
      select: { sessionId: true },
      take: 200,
    }).catch(() => []);
    const totalSessions = Math.max(1, sessionsOfVisitor.filter((r: any) => r.sessionId).length);
    const returning = totalSessions > 1 || priorSessions.size > 0 || Number(v.totalVisits || 0) > 1;

    const sessionSummary = summarize(sessionEvents as Ev[]);
    const overallSummary = summarize(allEvents as Ev[]);

    const firstPlay = sessionEvents.find((e: Ev) => isPlay(e.type) || isEnded(e.type));
    const lastActivity = allEvents.length ? allEvents[allEvents.length - 1] : null;
    const sessionDurationSeconds = firstPlay && lastActivity
      ? Math.max(0, Math.round((new Date(lastActivity.at).getTime() - new Date(firstPlay.at).getTime()) / 1000))
      : null;

    const visitorProfile = {
      visitorId: v.visitorId,
      firstSeen: v.firstVisit,
      lastSeen: v.lastVisit,
      totalSessions,
      totalVideoViews: Math.max(Number(v.totalVideoViews || 0), overallSummary.playCount),
      totalWatchSeconds: overallSummary.watchSeconds,
      averageWatchPercent: overallSummary.maxProgressPercent,
      engagementScoreCached: Number(v.engagementScore || 0),
      interestLevelCached: v.interestLevel || 'COLD',
      returning,
      consentStatus: v.consentStatus,
      device: v.device,
      browser: v.browser,
      language: (lastActivity?.meta?.language) || null,
    };

    const sessionProfile = {
      sessionId: sessionId || null,
      page: sessionEvents[0]?.pagePath || lastActivity?.pagePath || '/financial-freedom',
      videoId: sessionEvents.find((e: Ev) => e.videoCode)?.videoCode || 'financial-freedom-video',
      firstPlayAt: firstPlay ? new Date(firstPlay.at).toISOString() : null,
      lastActivityAt: lastActivity ? new Date(lastActivity.at).toISOString() : null,
      sessionDurationSeconds,
      ...sessionSummary,
    };

    const base = baseScore(visitorProfile, sessionSummary);

    // อัปเดตค่าสรุปบน Visitor จากข้อมูลจริง (แคชเพื่อ dashboard/รายงาน)
    await db.visitor.update({
      where: { visitorId: v.visitorId },
      data: {
        totalWatchSeconds: overallSummary.watchSeconds,
        averageWatchPercent: overallSummary.maxProgressPercent,
        totalVideoViews: visitorProfile.totalVideoViews,
      },
    }).catch(() => null);

    return NextResponse.json({
      ok: true,
      generatedAt: new Date().toISOString(),
      windowMinutes: minutes,
      visitorProfile,
      sessionProfile,
      summary: sessionSummary,
      overall: overallSummary,
      baseEngagementScore: base,
      baseInterestLevel: levelOf(base),
      marksCatalog: MARKS,
      recentEvents: (allEvents as Ev[]).slice(-25).map((e: Ev) => ({
        at: new Date(e.at).toISOString(),
        event: e.type,
        progressPercent: e.watchPct ?? null,
        watchSeconds: e.watchSeconds ?? null,
        interaction: e.meta?.interaction || null,
      })),
      rules: {
        levels: { COLD: '0-24', WARM: '25-49', HOT: '50-74', VERY_HOT: '75-100' },
        alertThreshold: 80,
        privacy: 'ข้อมูลนี้เป็น Anonymous Visitor ID — ห้ามอนุมานชื่อ/อายุ/เพศ/รายได้/อาชีพ',
      },
    });
  } catch (e: any) {
    console.error('[video-intel/aggregate] error:', e?.message);
    return NextResponse.json({ ok: false, error: 'รวมข้อมูลพฤติกรรมไม่สำเร็จ' }, { status: 500 });
  }
}
