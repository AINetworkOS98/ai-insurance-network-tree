import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeLeadApi } from '@/lib/leadApiAuth';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/video-intel/stats?window=1h|24h|7d&limit=30
//
// ข้อมูลสำหรับ Dashboard แบบเรียลไทม์ + วัตถุดิบของรายงานรายชั่วโมง/รายวัน (n8n)
// ทุกตัวเลขคำนวณจาก event จริงในตาราง visitor_events — ไม่มีการคาดเดา
// ไม่มีข้อมูลส่วนบุคคลในคำตอบ (ใช้ Visitor #XXXX จาก uuid เท่านั้น)
//
// สิทธิ์: session ผู้ดูแล (หน้า /admin/video-intelligence) หรือ Bearer CRON_SECRET (n8n)
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MARKS = [10, 25, 50, 75, 90, 100];
const TZ = 'Asia/Bangkok';

function windowToMs(w: string): { ms: number; key: string } {
  if (w === '7d') return { ms: 7 * 24 * 3600 * 1000, key: '7d' };
  if (w === '24h') return { ms: 24 * 3600 * 1000, key: '24h' };
  return { ms: 3600 * 1000, key: '1h' };
}
function hourLabel(d: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
  return `${parts.slice(0, 2)}:00`;
}
function timeLabel(d: Date): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(d);
}
function shortLabel(uuid?: string | null): string {
  const s = String(uuid || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return `Visitor #${(s.slice(0, 4) || 'XXXX')}`;
}
function levelOfScore(score: number): string {
  if (score >= 75) return 'VERY_HOT';
  if (score >= 50) return 'HOT';
  if (score >= 25) return 'WARM';
  return 'COLD';
}

export async function GET(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  if (!auth.ok) return auth.res;

  try {
    const url = new URL(req.url);
    const { ms, key } = windowToMs(String(url.searchParams.get('window') || '24h').toLowerCase());
    const limit = Math.max(5, Math.min(100, Number(url.searchParams.get('limit') || 30)));
    const since = new Date(Date.now() - ms);
    const db = prisma as any;

    const rows: any[] = await db.visitorEvent.findMany({
      where: { at: { gte: since } },
      orderBy: { at: 'desc' },
      take: 5000,
      select: {
        eventId: true, type: true, sessionId: true, pagePath: true, videoCode: true,
        watchPct: true, watchSeconds: true, meta: true, at: true,
        visitor: { select: { visitorId: true, engagementScore: true, interestLevel: true, totalVisits: true, device: true, browser: true } },
      },
    }).catch(() => []);

    const visitorRows: any[] = await db.visitor.findMany({
      where: { lastVisit: { gte: since } },
      orderBy: { engagementScore: 'desc' },
      take: 200,
      select: {
        visitorId: true, engagementScore: true, interestLevel: true, totalVisits: true,
        totalVideoViews: true, totalWatchSeconds: true, averageWatchPercent: true,
        lastVisit: true, firstVisit: true, device: true, browser: true,
      },
    }).catch(() => []);

    // ── นับต่อ session (ค่าสูงสุดในแต่ละ session = ค่าจริงของการรับชมรอบนั้น) ──
    type Sess = { maxPct: number; maxWatch: number; plays: number; events: number; lastAt: number; visitorId: string | null };
    const sessions = new Map<string, Sess>();
    const visitorsInWindow = new Set<string>();
    const eventsByHour = new Map<string, { visitors: Set<string>; views: number; pct: number[] }>();
    const marksByVisitor = new Map<string, number>();

    let totalEvents = 0;
    let totalVideoViews = 0;
    let videoCompletes = 0;
    const fiveMinAgo = Date.now() - 5 * 60 * 1000;
    const tenMinAgo = Date.now() - 10 * 60 * 1000;
    let currentVisitors = 0;
    let activeVideoSessions = 0;
    const activeVisitorsSet = new Set<string>();
    const activeSessionsSet = new Set<string>();

    for (const r of rows) {
      totalEvents += 1;
      const ts = new Date(r.at).getTime();
      const vid = r.visitor?.visitorId || null;
      if (vid) visitorsInWindow.add(vid);
      const sid = r.sessionId || `nosession-${vid || 'unknown'}`;
      const isVideo = String(r.type || '').startsWith('video_');

      if (ts >= fiveMinAgo && vid) activeVisitorsSet.add(vid);
      if (ts >= tenMinAgo && isVideo) activeSessionsSet.add(sid);

      const s = sessions.get(sid) || { maxPct: 0, maxWatch: 0, plays: 0, events: 0, lastAt: 0, visitorId: vid };
      s.events += 1;
      s.maxPct = Math.max(s.maxPct, Number(r.watchPct || 0));
      s.maxWatch = Math.max(s.maxWatch, Number(r.watchSeconds || 0));
      if (r.type === 'video_play') { s.plays += 1; totalVideoViews += 1; }
      if (r.type === 'video_ended' || Number(r.watchPct || 0) >= 100) videoCompletes += 1;
      s.lastAt = Math.max(s.lastAt, ts);
      sessions.set(sid, s);

      if (vid) marksByVisitor.set(vid, Math.max(marksByVisitor.get(vid) || 0, Number(r.watchPct || 0)));

      const hl = hourLabel(new Date(ts));
      const h = eventsByHour.get(hl) || { visitors: new Set<string>(), views: 0, pct: [] as number[] };
      if (vid) h.visitors.add(vid);
      if (r.type === 'video_play') h.views += 1;
      if (r.watchPct != null) h.pct.push(Number(r.watchPct));
      eventsByHour.set(hl, h);
    }

    currentVisitors = activeVisitorsSet.size;
    activeVideoSessions = activeSessionsSet.size;

    const sessionList = [...sessions.values()];
    const nSessions = Math.max(1, sessionList.length);
    const avgWatchSeconds = Math.round(sessionList.reduce((a, s) => a + s.maxWatch, 0) / nSessions);
    const avgWatchPercent = Number((sessionList.reduce((a, s) => a + s.maxPct, 0) / nSessions).toFixed(1));
    const completedSessions = sessionList.filter(s => s.maxPct >= 100).length;
    const completionRate = Math.round((completedSessions / nSessions) * 100);

    // ── เพดานขั้นบันไดการรับชม (นับผู้ชม ไม่นับ event) ──
    const watchProgress = MARKS.map(mark => ({
      mark,
      count: [...marksByVisitor.values()].filter(pct => pct >= mark).length,
    }));

    // ── การกระจายระดับความสนใจ (จากค่าสรุปของ AI บนตัวผู้ชม) ──
    const engagement = { cold: 0, warm: 0, hot: 0, veryHot: 0 };
    for (const v of visitorRows) {
      const lvl = v.interestLevel && v.interestLevel !== 'COLD'
        ? String(v.interestLevel).toUpperCase()
        : levelOfScore(Number(v.engagementScore || 0));
      if (lvl === 'VERY_HOT') engagement.veryHot += 1;
      else if (lvl === 'HOT') engagement.hot += 1;
      else if (lvl === 'WARM') engagement.warm += 1;
      else engagement.cold += 1;
    }

    const hotVisitors = visitorRows
      .filter(v => Number(v.engagementScore || 0) >= 50 || ['HOT', 'VERY_HOT'].includes(String(v.interestLevel || '').toUpperCase()))
      .slice(0, 12)
      .map(v => ({
        visitorId: v.visitorId,
        label: shortLabel(v.visitorId),
        score: Number(v.engagementScore || 0),
        level: String(v.interestLevel || '').toUpperCase() || levelOfScore(Number(v.engagementScore || 0)),
        watchPercent: Math.round(Number(v.averageWatchPercent || 0)),
        watchSeconds: Number(v.totalWatchSeconds || 0),
        views: Number(v.totalVideoViews || 0),
        sessions: Number(v.totalVisits || 0),
        device: v.device || null,
        browser: v.browser || null,
        lastSeen: v.lastVisit,
      }));

    const recentEvents = rows.slice(0, limit).map(r => ({
      at: timeLabel(new Date(r.at)),
      isoAt: r.at,
      visitorLabel: shortLabel(r.visitor?.visitorId),
      event: r.type,
      progressPercent: r.watchPct != null ? Math.round(Number(r.watchPct)) : null,
      videoId: r.videoCode || null,
      page: r.pagePath || null,
    }));

    const hourly = [...eventsByHour.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([hour, h]) => ({
        hour,
        visitors: h.visitors.size,
        views: h.views,
        avgWatchPercent: h.pct.length ? Number((h.pct.reduce((a, b) => a + b, 0) / h.pct.length).toFixed(1)) : 0,
      }));

    const peakEntry = [...eventsByHour.entries()].sort((a, b) => b[1].views - a[1].views)[0];
    const peakHour = peakEntry && peakEntry[1].views > 0 ? peakEntry[0] : null;

    const returningVisitors = visitorRows.filter(v => Number(v.totalVisits || 0) > 1).length;

    // ── บทสรุป AI ล่าสุดในหน้าต่างนี้ (ถ้ามี) ──
    const latestAnalysis: any = await db.videoAiAnalysis.findFirst({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);

    return NextResponse.json({
      ok: true,
      window: key,
      since: since.toISOString(),
      generatedAt: new Date().toISOString(),
      timezone: TZ,
      currentVisitors,
      activeVideoSessions,
      totalVisitors: visitorsInWindow.size,
      totalSessions: sessions.size,
      totalEvents,
      totalVideoViews,
      videoCompletes,
      avgWatchSeconds,
      avgWatchPercent,
      completionRate,
      returningVisitors,
      peakHour,
      watchProgress,
      engagement,
      hotVisitors,
      recentEvents,
      hourly,
      aiInsight: latestAnalysis
        ? {
            analysisId: latestAnalysis.analysisId,
            visitorId: latestAnalysis.visitorId,
            label: shortLabel(latestAnalysis.visitorId),
            engagementScore: latestAnalysis.engagementScore,
            interestLevel: latestAnalysis.interestLevel,
            summary: latestAnalysis.aiSummary,
            recommendedAction: latestAnalysis.recommendedAction,
            reason: latestAnalysis.reason,
            model: latestAnalysis.model,
            alertSent: latestAnalysis.alertSent,
            generatedAt: latestAnalysis.createdAt,
          }
        : null,
    });
  } catch (e: any) {
    console.error('[video-intel/stats] error:', e?.message);
    return NextResponse.json({ ok: false, error: 'อ่านสถิติไม่สำเร็จ' }, { status: 500 });
  }
}
