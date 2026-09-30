import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createHash, randomUUID } from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/track — รับ event จากเว็บ (consent-gated) → เก็บ Visitor + VisitorEvent
//                  → คิด EngagementScore → ส่งต่อ n8n WF01 (webhook /track)
// GET  /api/track — health check (ไม่แตะ DB, ไม่เผย secret)
//
// สเปก: docs/lead-nurturing-plan.md หมวด 2 (API /api/track) + หมวด 4 (คะแนน) + หมวด 5 (PDPA)
//
// ⚠️ ต้องเพิ่ม '/api/track' ใน PUBLIC_API ของ src/middleware.ts ก่อน ไม่งั้น middleware
//    จะตอบ 401 "กรุณาเข้าสู่ระบบ" ทุกครั้ง (middleware บล็อก /api/* ที่ไม่อยู่ในลิสต์)
//
// หลักความเป็นส่วนตัวที่บังคับในไฟล์นี้:
//   • ไม่เขียน DB เลยถ้าไม่มีความยินยอม (analytics) — ตอบ 200 + stored:0 (สคริปต์ไม่ error)
//   • ไม่เซ็ต cookie ก่อนได้รับความยินยอม
//   • ไม่เก็บ ip ดิบ — เก็บ ipHash = sha256(ip + AUTH_SECRET) เท่านั้น
//   • มี Unsubscribe ของ lead นี้ = หยุดเก็บทันที (แผนหมวด 5)
//
// ใช้ (prisma as any) เพราะโมเดลใหม่ 11 ตัวยังไม่ถูก generate จนกว่าจะต่อ schema + prisma generate
// (รูปแบบเดียวกับ /api/consent และ /api/cron/registration-sync ที่ใช้ (prisma as any) อยู่แล้ว)
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONSENT_VERSION_DEFAULT = '1.0';
const MAX_EVENTS_PER_REQUEST = 25;
const EVENT_TYPES = new Set([
  // ชื่อมาตรฐานที่เก็บใน DB
  'page_view', 'return_visit', 'video_view', 'video_progress', 'video_complete',
  'form_open', 'form_submit', 'topic_select', 'callback_request', 'cta_click',
  // เพิ่มตามสคริปต์จริง public/track.js (session_start ต้องรับ ไม่งั้น request แรกของ session จะ 400)
  'session_start',
]);
// event ที่ควรเข้า EventOutbox (ให้ n8n/AI ทำงานต่อ) — page_view/session_start ไม่ต้อง เขียนเยอะเกินจำเป็น
const QUEUE_TYPES = new Set(['video_complete', 'form_submit', 'topic_select', 'callback_request', 'cta_click']);

// public/track.js ส่งชื่อ event คนละชุดกับสเปก (video_25/50/75, button_click, video_start)
// → แปลงเป็นชื่อมาตรฐานก่อนเก็บ เพื่อให้คะแนนและ WF ของ n8n ใช้กติกาเดียวกัน
const TYPE_ALIASES: Record<string, string> = {
  session_start: 'session_start',
  video_start: 'video_view',
  video_25: 'video_progress',
  video_50: 'video_progress',
  video_75: 'video_progress',
  button_click: 'cta_click',
};
function canonicalType(raw: string): { type: string; impliedPct: number } | null {
  const alias = TYPE_ALIASES[raw];
  if (alias) {
    const mark = /^video_(\d+)$/.exec(raw);
    return { type: alias, impliedPct: mark ? Number(mark[1]) : 0 };
  }
  return EVENT_TYPES.has(raw) ? { type: raw, impliedPct: 0 } : null;
}
// channel ของ EventOutbox ที่ worker จะหยิบไปส่ง n8n
const OUTBOX_CHANNEL = 'lead_track';

// ── คะแนนตามแผนหมวด 4 (page_view +1 · return_visit +5 · video_view +3 · >50% +5
//    complete +8 · ดูคลิปเดิมซ้ำ +5 · form_open +5 · form_submit +20 · เลือกหัวข้อ +10
//    ขอให้ติดต่อกลับ +30) ────────────────────────────────────────────────────
const EVENT_POINTS: Record<string, number> = {
  session_start: 0, // เริ่ม session — ไม่มีคะแนน (รับไว้เพื่อไม่ให้ request แรกของ session ล้ม)
  page_view: 1,
  return_visit: 5,
  video_view: 3,
  video_progress: 0, // +5 เมื่อดูเกิน 50% (คิดด้านล่าง)
  video_complete: 8,
  form_open: 5,
  form_submit: 20,
  topic_select: 10,
  callback_request: 30,
  cta_click: 2,
};
const HALFWAY_BONUS = 5;   // ดูเกิน 50%
const REPEAT_VIDEO_BONUS = 5; // ดูคลิปเดิมซ้ำ
const RETURN_GAP_MS = 30 * 60 * 1000; // ห่างเกิน 30 นาที = กลับมาเยี่ยมใหม่ (return_visit)

function scoreForEvent(type: string, watchPct: number, isRepeat: boolean): number {
  let delta = EVENT_POINTS[type] ?? 0;
  if (type === 'video_progress' && watchPct > 50) delta += HALFWAY_BONUS;
  if ((type === 'video_view' || type === 'video_complete') && isRepeat) delta += REPEAT_VIDEO_BONUS;
  return delta;
}

// ระดับคะแนน: 0-19 LOW · 20-39 WARM · 40-69 INTERESTED · 70+ HIGH_INTENT
function levelOf(score: number): 'LOW' | 'WARM' | 'INTERESTED' | 'HIGH_INTENT' {
  if (score >= 70) return 'HIGH_INTENT';
  if (score >= 40) return 'INTERESTED';
  if (score >= 20) return 'WARM';
  return 'LOW';
}

// ── กันสแปม/ยิงรัว: 600 event / 10 นาที ต่อ IP (คนจริงอ่านหลายหน้าได้สบาย) ──
const RL = new Map<string, number[]>();
function allow(ipKey: string, max = 600, windowMs = 10 * 60 * 1000): boolean {
  const now = Date.now();
  const arr = (RL.get(ipKey) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { RL.set(ipKey, arr); return false; }
  arr.push(now);
  RL.set(ipKey, arr);
  if (RL.size > 5000) RL.clear();
  return true;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BOT_RE = /bot|crawl|spider|slurp|bingpreview|headless|python-requests|curl|wget|facebookexternalhit|whatsapp|preview|monitor/i;

function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}
function str(v: unknown, max = 500): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}
function num(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}
function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || req.headers.get('x-real-ip') || 'unknown';
}
// ไม่เก็บ ip ดิบ — เก็บเฉพาะ hash ที่ผูกกับ secret ของระบบ (ตรวจย้อนหลังได้ แต่ย้อนกลับไม่ได้)
function hashIp(ip: string): string | null {
  if (!ip || ip === 'unknown') return null;
  const salt = process.env.AUTH_SECRET || process.env.CRON_SECRET || 'lead-tracking';
  return createHash('sha256').update(`${ip}|${salt}`).digest('hex').slice(0, 40);
}
function parseUa(ua: string): { device: string | null; browser: string | null; os: string | null } {
  const u = ua.toLowerCase();
  const device = /iphone|android.*mobile|mobile/.test(u) ? 'mobile'
    : /ipad|tablet/.test(u) ? 'tablet'
    : ua ? 'desktop' : null;
  const browser = /edg\//.test(u) ? 'Edge'
    : /opr\/|opera/.test(u) ? 'Opera'
    : /chrome\//.test(u) ? 'Chrome'
    : /safari\//.test(u) ? 'Safari'
    : /firefox\//.test(u) ? 'Firefox'
    : /line\//.test(u) ? 'LINE'
    : null;
  const os = /windows/.test(u) ? 'Windows'
    : /android/.test(u) ? 'Android'
    : /iphone|ipad|ios/.test(u) ? 'iOS'
    : /mac os x/.test(u) ? 'macOS'
    : /linux/.test(u) ? 'Linux'
    : null;
  return { device, browser, os };
}

// consent ที่รองรับหลายรูปแบบจากสคริปต์หน้าเว็บ (เข้มไว้ก่อน: ต้องยินยอมชัดเจนจึงเก็บ)
type ConsentInfo = { analytics: boolean; marketing: boolean; version: string | null };
function readConsent(body: any): ConsentInfo {
  const c = body?.consent;
  if (c === true) return { analytics: true, marketing: false, version: CONSENT_VERSION_DEFAULT };
  if (typeof c === 'string') {
    return { analytics: c.toLowerCase() === 'granted', marketing: false, version: CONSENT_VERSION_DEFAULT };
  }
  if (c && typeof c === 'object') {
    return {
      analytics: c.analytics === true || c.tracking === true || c.analyticsConsent === true || c.status === 'granted',
      marketing: c.marketing === true,
      version: str(c.version, 20) || CONSENT_VERSION_DEFAULT,
    };
  }
  return { analytics: body?.analyticsConsent === true, marketing: false, version: CONSENT_VERSION_DEFAULT };
}

// event เดียวที่รับได้ (รองรับทั้งยิงทีละ event และยิงเป็นชุดด้วย events: [])
type TrackEvent = {
  eventId: string;
  type: string;
  at: Date;
  pageUrl: string | null;
  pagePath: string | null;
  pageTitle: string | null;
  referrer: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  videoCode: string | null;
  videoId: string | null;
  watchPct: number;
  watchSeconds: number | null;
  meta: any;
};

function normalizeEvent(raw: any, fallback: any): TrackEvent | null {
  const src = (raw && typeof raw === 'object') ? raw : {};
  const rawType = String(src.type || src.event || '').toLowerCase().trim();
  const mapped = canonicalType(rawType);
  if (!mapped) return null;
  const type = mapped.type;
  const atRaw = src.at || src.timestamp || src.ts;
  const at = atRaw ? new Date(atRaw) : new Date();
  const videoCode = str(src.videoCode || src.video_id || src.video, 64);
  const videoIdRaw = str(src.videoUuid, 64);
  return {
    eventId: str(src.eventId, 64) || randomUUID(),
    type,
    at: Number.isNaN(at.getTime()) ? new Date() : at,
    pageUrl: str(src.pageUrl || src.url || fallback?.pageUrl, 2000),
    pagePath: str(src.pagePath || src.path || fallback?.pagePath, 500),
    pageTitle: str(src.pageTitle || src.title || fallback?.pageTitle, 300),
    referrer: str(src.referrer || fallback?.referrer, 2000),
    utmSource: str(src.utmSource || src.utm_source || fallback?.utmSource, 200),
    utmMedium: str(src.utmMedium || src.utm_medium || fallback?.utmMedium, 200),
    utmCampaign: str(src.utmCampaign || src.utm_campaign || fallback?.utmCampaign, 200),
    utmTerm: str(src.utmTerm || src.utm_term || fallback?.utmTerm, 200),
    utmContent: str(src.utmContent || src.utm_content || fallback?.utmContent, 200),
    videoCode,
    videoId: isUuid(videoIdRaw) ? videoIdRaw : null,
    watchPct: num(src.watchPct ?? src.watch_pct ?? src.meta?.watch_pct, 0, 100) ?? mapped.impliedPct,
    watchSeconds: num(src.watchSeconds ?? src.watch_seconds, 0, 24 * 3600),
    meta: (src.meta && typeof src.meta === 'object') ? src.meta : undefined,
  };
}

// ── ส่งต่อ n8n WF01 (webhook /track) — best-effort ไม่ให้ล้มทั้ง request ───────
async function forwardToN8n(payload: any): Promise<'sent' | 'skipped' | 'failed'> {
  const base = process.env.N8N_WEBHOOK_BASE;
  if (!base) return 'skipped';
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/track`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.TRACK_WEBHOOK_SECRET ? { 'x-track-secret': process.env.TRACK_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(4000),
    });
    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/track',
    methods: ['POST'],
    consentRequired: true,
    maxEventsPerRequest: MAX_EVENTS_PER_REQUEST,
    scoreTable: EVENT_POINTS,
    n8nForwarding: Boolean(process.env.N8N_WEBHOOK_BASE && process.env.TRACK_WEBHOOK_SECRET),
    note: 'ต้องเพิ่ม /api/track ใน PUBLIC_API ของ src/middleware.ts ไม่งั้นจะโดน 401',
  });
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const ipKey = hashIp(ip) || 'unknown';

  try {
    const body = await req.json().catch(() => ({} as any));
    if (!allow(ipKey)) {
      return NextResponse.json({ ok: false, error: 'ยิง event บ่อยเกินไป' }, { status: 429 });
    }

    const ua = (req.headers.get('user-agent') || '').slice(0, 300);
    if (ua && BOT_RE.test(ua)) {
      return NextResponse.json({ ok: true, stored: 0, reason: 'bot' });
    }

    const consent = readConsent(body);
    const visitorId = str(body?.visitorId || req.cookies.get('lead_vid')?.value, 64) || randomUUID();
    const sessionId = str(body?.sessionId, 64);
    const prospectIdFromBody = isUuid(body?.prospectId) ? String(body.prospectId) : null;

    // ยังไม่มีความยินยอม → ไม่เก็บอะไรเลย (ไม่แม้แต่ cookie)
    if (!consent.analytics) {
      return NextResponse.json({
        ok: true, stored: 0, visitorId: null,
        reason: 'no_consent',
        message: 'ยังไม่ได้รับความยินยอมให้เก็บข้อมูลการใช้งาน — ระบบไม่บันทึกสิ่งใด',
      });
    }

    // รวม event เป็นชุด (ยิงทีละอันหรือเป็น array ก็ได้)
    const rawList: any[] = Array.isArray(body?.events) && body.events.length
      ? body.events
      : [body];
    const events: TrackEvent[] = [];
    for (const raw of rawList.slice(0, MAX_EVENTS_PER_REQUEST)) {
      const ev = normalizeEvent(raw, body);
      if (ev) events.push(ev);
    }
    if (!events.length) {
      return NextResponse.json({ ok: false, error: 'ไม่พบ event ที่รู้จัก (type ไม่ถูกต้อง)' }, { status: 400 });
    }

    const db = prisma as any;
    const now = new Date();
    // อุปกรณ์/เบราว์เซอร์: ใช้ค่าที่สคริปต์หน้าเว็บส่งมา (แม่นกว่าการเดาจาก UA) แล้วค่อยถอยไปอ่าน UA
    const uaParsed = parseUa(ua);
    const uaInfo = {
      device: str(body?.device, 20) || uaParsed.device,
      browser: str(body?.browser, 40) || uaParsed.browser,
      os: uaParsed.os,
    };

    // ── 1) upsert Visitor ─────────────────────────────────────────────────
    const existing = await db.visitor.findUnique({ where: { visitorId } }).catch(() => null);

    // มี record Unsubscribe ของ lead คนนี้ = หยุดทุกอย่างทันที (แผนหมวด 5)
    const targetProspectId = prospectIdFromBody || existing?.prospectId || null;
    if (targetProspectId) {
      const optOut = await db.unsubscribe.findFirst({
        where: { prospectId: targetProspectId, channel: { in: ['all', 'tracking'] } },
      }).catch(() => null);
      if (optOut) {
        await db.visitor.update({ where: { visitorId }, data: { consentStatus: 'withdrawn' } }).catch(() => null);
        return NextResponse.json({ ok: true, stored: 0, reason: 'opted_out' });
      }
    }

    const gapMs = existing ? now.getTime() - new Date(existing.lastVisit).getTime() : 0;
    const isReturning = Boolean(existing) && gapMs > RETURN_GAP_MS;

    let visitor = existing;
    if (!existing) {
      visitor = await db.visitor.create({
        data: {
          visitorId,
          firstVisit: now,
          lastVisit: now,
          totalVisits: 1,
          totalEvents: 0,
          device: uaInfo.device,
          browser: uaInfo.browser,
          os: uaInfo.os,
          userAgent: ua || null,
          ipHash: ipKey,
          consentStatus: 'granted',
          consentVersion: consent.version,
          consentAt: now,
          prospectId: targetProspectId,
        },
      });
    } else {
      visitor = await db.visitor.update({
        where: { visitorId },
        data: {
          lastVisit: now,
          totalVisits: isReturning ? { increment: 1 } : undefined,
          device: uaInfo.device || undefined,
          browser: uaInfo.browser || undefined,
          os: uaInfo.os || undefined,
          userAgent: ua || undefined,
          ipHash: ipKey,
          consentStatus: 'granted',
          consentVersion: consent.version,
          consentAt: existing.consentAt || now,
          prospectId: targetProspectId || undefined,
        },
      });
    }

    // กลับมาเยี่ยมรอบใหม่ → เพิ่ม event return_visit ให้อัตโนมัติ (แผนหมวด 4: +5)
    const listToStore: TrackEvent[] = [...events];
    if (isReturning && !events.some((e) => e.type === 'return_visit')) {
      listToStore.push({
        ...events[0],
        eventId: randomUUID(),
        type: 'return_visit',
        at: now,
        watchPct: 0,
        watchSeconds: null,
        videoCode: null,
        videoId: null,
      });
    }

    let stored = 0;
    let duplicates = 0;
    let failed = 0;
    let scoreDeltaTotal = 0;
    const breakdown: Record<string, number> = {};
    const queued: string[] = [];

    for (const ev of listToStore) {
      // ── 2) คลิปที่ดู (ถ้ามี) — หา Video จากรหัส V-XXXX หรือ uuid ──────────
      let video: any = null;
      const or: any[] = [];
      if (ev.videoCode) or.push({ videoId: ev.videoCode });
      if (ev.videoId) or.push({ id: ev.videoId });
      if (or.length) {
        video = await db.video.findFirst({ where: { OR: or } }).catch(() => null);
      }

      let isRepeat = false;
      if (video && visitor) {
        const prior = await db.videoView.count({ where: { videoId: video.id, visitorId: visitor.id } }).catch(() => 0);
        isRepeat = prior > 0;
      }

      const delta = scoreForEvent(ev.type, ev.watchPct, isRepeat);

      // ── 3) เขียน event (unique eventId = idempotent) ─────────────────────
      // ⚠️ visitor_events.visitor_id เป็น FK → visitors.id (uuid PK) ไม่ใช่ visitors.visitor_id
      //    (รหัสสาธารณะที่เว็บเก็บใน localStorage) — ใส่ค่าผิดตัวจะได้ P2003 FK violation
      //    แล้วถูก catch กลืน → stored:0 เงียบ ๆ (เคสจริง 2026-10-01)
      if (!visitor?.id) {
        console.error('[track] no visitor row id — skip event', ev.type);
        failed++;
        continue;
      }
      try {
        await db.visitorEvent.create({
          data: {
            eventId: ev.eventId,
            visitorId: visitor.id,
            sessionId: sessionId || undefined,
            prospectId: targetProspectId || undefined,
            type: ev.type,
            pageUrl: ev.pageUrl || undefined,
            pagePath: ev.pagePath || undefined,
            pageTitle: ev.pageTitle || undefined,
            referrer: ev.referrer || undefined,
            utmSource: ev.utmSource || undefined,
            utmMedium: ev.utmMedium || undefined,
            utmCampaign: ev.utmCampaign || undefined,
            utmTerm: ev.utmTerm || undefined,
            utmContent: ev.utmContent || undefined,
            videoCode: ev.videoCode || undefined,
            videoId: video?.id || undefined,
            watchPct: ev.watchPct || undefined,
            watchSeconds: ev.watchSeconds ?? undefined,
            scoreDelta: delta,
            meta: ev.meta ?? undefined,
            userAgent: ua || undefined,
            ipHash: ipKey,
            at: ev.at,
          },
        });
        stored++;
        // นับคะแนนเฉพาะ event ที่บันทึกสำเร็จ — event ซ้ำ (P2002) ต้องไม่เพิ่มคะแนน
        breakdown[ev.type] = (breakdown[ev.type] || 0) + delta;
        scoreDeltaTotal += delta;
      } catch (e: any) {
        if (String(e?.code) === 'P2002') { duplicates++; continue; } // ยิงซ้ำ — ไม่นับคะแนนซ้ำ
        failed++;
        console.error('[track] visitorEvent.create failed', e?.message);
        continue;
      }

      // ── 4) VideoView (รวมการดูต่อเนื่องใน session เดียวกันเป็นแถวเดียว) ──
      if (video) {
        try {
          const since = new Date(now.getTime() - 2 * 60 * 60 * 1000); // session ภายใน 2 ชม.
          const prev = await db.videoView.findFirst({
            where: { videoId: video.id, visitorId: visitor.id, ...(sessionId ? { sessionId } : { startedAt: { gte: since } }) },
            orderBy: { startedAt: 'desc' },
          });
          const completed = ev.type === 'video_complete' || ev.watchPct >= 95;
          if (prev) {
            await db.videoView.update({
              where: { id: prev.id },
              data: {
                endedAt: now,
                secondsWatched: Math.max(prev.secondsWatched, ev.watchSeconds ?? 0),
                completionPct: Math.max(prev.completionPct, ev.watchPct),
                completed: prev.completed || completed,
                isRepeat: prev.isRepeat || isRepeat,
              },
            });
          } else {
            await db.videoView.create({
              data: {
                visitorId: visitor.id,
                prospectId: targetProspectId || undefined,
                videoId: video.id,
                sessionId: sessionId || undefined,
                source: str(body?.videoSource, 40) || 'organic',
                startedAt: ev.at,
                endedAt: now,
                secondsWatched: ev.watchSeconds ?? 0,
                completionPct: ev.watchPct,
                completed,
                isRepeat,
              },
            });
          }
          if (ev.type === 'video_view') {
            await db.video.update({ where: { id: video.id }, data: { viewCount: { increment: 1 } } }).catch(() => null);
          }
          // ปิด recommendation ที่ค้างอยู่ของคลิปนี้ (เสนอไปแล้ว และเขาดูจริง)
          if (targetProspectId) {
            await db.recommendation.updateMany({
              where: { prospectId: targetProspectId, videoId: video.id, status: { in: ['pending', 'sent'] } },
              data: { status: 'viewed', viewedAt: now },
            }).catch(() => null);
          }
        } catch (e: any) {
          console.error('[track] videoView failed', e?.message);
        }
      }

      // ── 5) เข้า EventOutbox (เฉพาะ event ที่ควรให้ n8n/AI ทำงานต่อ) ──────
      if (QUEUE_TYPES.has(ev.type)) {
        try {
          await db.eventOutbox.create({
            data: {
              eventId: `track:${ev.eventId}`,
              eventType: `track.${ev.type}`,
              payload: {
                eventId: ev.eventId, visitorId, sessionId, prospectId: targetProspectId,
                type: ev.type, videoCode: ev.videoCode, videoId: video?.id || null,
                watchPct: ev.watchPct, topic: str(ev.meta?.topic, 100),
                pagePath: ev.pagePath, at: ev.at.toISOString(),
              },
              channel: OUTBOX_CHANNEL,
              status: 'pending',
            },
          });
          queued.push(ev.type);
        } catch (e: any) {
          if (String(e?.code) !== 'P2002') console.error('[track] outbox failed', e?.message);
        }
      }
    }

    // ── 6) อัปเดต EngagementScore ของ lead (ถ้ารู้ว่าเป็น lead คนไหน) ────────
    let score: number | null = null;
    let level: string | null = null;
    if (targetProspectId && scoreDeltaTotal !== 0) {
      try {
        const current = await db.engagementScore.findUnique({ where: { prospectId: targetProspectId } });
        const nextScore = Math.max(0, (current?.score || 0) + scoreDeltaTotal);
        const prevBreakdown = (current?.breakdown && typeof current.breakdown === 'object') ? current.breakdown : {};
        const mergedBreakdown: Record<string, number> = { ...prevBreakdown };
        for (const [k, v] of Object.entries(breakdown)) mergedBreakdown[k] = (mergedBreakdown[k] || 0) + v;

        const saved = await db.engagementScore.upsert({
          where: { prospectId: targetProspectId },
          create: {
            prospectId: targetProspectId,
            score: nextScore,
            level: levelOf(nextScore),
            breakdown: mergedBreakdown,
            eventCount: stored,
            lastEventAt: now,
            computedAt: now,
          },
          update: {
            score: nextScore,
            level: levelOf(nextScore),
            breakdown: mergedBreakdown,
            eventCount: { increment: stored },
            lastEventAt: now,
            computedAt: now,
          },
        });
        score = saved.score;
        level = saved.level;

        // 70+ = HIGH INTENT → สร้างงานให้ตัวแทน (ห้าม AI ปิดการขายเอง — แผนหมวด 4)
        if (nextScore >= 70) {
          const openTask = await db.agentTask.findFirst({
            where: { prospectId: targetProspectId, type: 'high_intent_lead', status: { in: ['open', 'in_progress'] } },
          });
          if (!openTask) {
            await db.agentTask.create({
              data: {
                prospectId: targetProspectId,
                type: 'high_intent_lead',
                title: 'Lead ให้คะแนนสูง (High Intent) — ควรมีคนติดต่อกลับ',
                note: `คะแนนความสนใจ ${nextScore} (${levelOf(nextScore)}) จาก event: ${Object.keys(breakdown).join(', ')}`,
                priority: 'high',
                status: 'open',
                channel: 'phone',
                triggerScore: nextScore,
                sourceEventId: events[0]?.eventId || null,
                dueAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
              },
            }).catch(() => null);
          }
        }
      } catch (e: any) {
        console.error('[track] engagementScore failed', e?.message);
      }
    }

    // ── 7) ส่งต่อ n8n WF01 (ครั้งเดียวต่อ request, ส่งเป็นชุด) ───────────────
    // ⚠️ กันวนลูป: WF01 มี node "บันทึก Visitor + Event (/api/track)" ที่ POST กลับเข้ามาที่นี่
    //    เพื่อบันทึก DB ต่อ — ถ้าเราส่งต่อไป n8n อีก จะเกิดลูปไม่สิ้นสุด (WF01 → /api/track → WF01 → ...)
    //    WF01 ติด marker มาใน body ว่า source: 'n8n-wf01' ⇒ request ที่มาจาก n8n ห้าม forward กลับ
    const isFromN8n = String((body as any)?.source || '') === 'n8n-wf01';
    const forward = isFromN8n ? 'skipped' : await forwardToN8n({
      visitorId,
      sessionId,
      prospectId: targetProspectId,
      consent,
      device: uaInfo.device,
      browser: uaInfo.browser,
      utm: {
        source: events[0].utmSource, medium: events[0].utmMedium,
        campaign: events[0].utmCampaign, content: events[0].utmContent, term: events[0].utmTerm,
      },
      events: listToStore.map((e) => ({
        eventId: e.eventId, type: e.type, at: e.at.toISOString(),
        pageUrl: e.pageUrl, pagePath: e.pagePath, referrer: e.referrer,
        videoCode: e.videoCode, videoId: e.videoId,
        watchPct: e.watchPct, watchSeconds: e.watchSeconds, meta: e.meta,
      })),
    });

    const res = NextResponse.json({
      ok: true,
      visitorId,
      stored,
      duplicates,
      errors: failed,
      events: stored,
      scoreDelta: scoreDeltaTotal,
      score,
      level,
      queued,
      n8n: forward,
      at: now.toISOString(),
    });
    // เซ็ต cookie หลังได้ความยินยอมแล้วเท่านั้น (httpOnly — สคริปต์อ่าน visitorId จาก response)
    res.cookies.set('lead_vid', visitorId, {
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
      sameSite: 'lax',
      httpOnly: true,
    });
    return res;
  } catch (e: any) {
    console.error('[track] error', e?.message);
    return NextResponse.json({ ok: false, error: 'บันทึก event ไม่สำเร็จ' }, { status: 500 });
  }
}
