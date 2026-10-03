import { NextRequest, NextResponse } from 'next/server';
import { after } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createHash, randomUUID } from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/video-intel/event — รับ event การรับชมวิดีโอจากหน้า /financial-freedom
//
// บทบาท: "ประตูเก็บข้อมูล" ของระบบ AI Video Intelligence & Lead Monitoring
//   ① ตรวจความยินยอม (consent) ก่อน — ไม่ยินยอม = ไม่บันทึกอะไรเลย (PDPA)
//   ② ตรวจ schema ของ event (whitelist) + กันบอท + จำกัดอัตราการยิง
//   ③ บันทึก Visitor (anonymous uuid) + VisitorEvent
//   ④ ส่งต่อให้ n8n (best-effort, ไม่หน่วงผู้ชม) → n8n วิเคราะห์ด้วย AI แล้วแจ้งเตือน
//
// หลักความเป็นส่วนตัวที่บังคับในไฟล์นี้:
//   • ห้ามเก็บ IP ดิบ — เก็บเฉพาะ sha256(ip + AUTH_SECRET)
//   • ห้ามเดา/เก็บ ชื่อ อายุ เพศ รายได้ อาชีพ — ระบบนี้ไม่รับฟิลด์เหล่านี้เลย
//   • visitor_id เป็น uuid ที่เบราว์เซอร์สร้างเอง ไม่ผูกกับตัวบุคคล
//   • ไม่มีการจดจำใบหน้า/เสียง/อารมณ์จากภาพ — ไม่มีโค้ดส่วนนี้โดยเจตนา
//
// ความทนทาน: ถ้า n8n ล่มหรือ tunnel ตาย ผู้ชมยังดูวิดีโอได้ปกติ (event ค้างใน DB
// รอ workflow "Video Intel 05" มาดึงไปประมวลผลทุก 1 นาที — ไม่มี event หาย)
//
// ⚠️ ต้องมี '/api/video-intel' ใน PUBLIC_API ของ src/middleware.ts ไม่งั้นโดน 401
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONSENT_VERSION_DEFAULT = '1.0';
const RATE_WINDOW_MS = 5 * 60 * 1000;
const RATE_MAX = 400;                 // 400 event / 5 นาที / ip — เกินนี้ตอบ 429
const WEBHOOK_PATH = '/video-intel-event';

// event ที่ระบบรู้จัก (ผู้ชมยิงชื่ออื่นมา = 400 ไม่บันทึก)
const SESSION_EVENTS = new Set([
  'page_view', 'page_exit',
  'video_loaded', 'video_play', 'video_pause', 'video_resume',
  'video_seek', 'video_ended', 'video_exit',
]);
const PROGRESS_EVENT = 'video_progress';
const INTERACTION_EVENT = 'video_interaction';
const INTERACTIONS = new Set([
  'play', 'pause', 'resume', 'seek_forward', 'seek_backward',
  'fullscreen', 'fullscreen_exit', 'mute', 'unmute', 'volume_change', 'replay',
  'rate_change', 'picture_in_picture',
]);
const KNOWN_EVENTS = new Set<string>([...SESSION_EVENTS, PROGRESS_EVENT, INTERACTION_EVENT]);

// event ที่นับเป็น "การเปิดดูคลิปหนึ่งครั้ง"
const PLAY_EVENTS = new Set(['video_play']);

const BOT_RE = /bot|crawl|spider|slurp|bingpreview|headless|lighthouse|pingdom|monitor|curl|wget|python-requests|axios|node-fetch/i;

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();
function allow(key: string): boolean {
  const now = Date.now();
  const b = rateBuckets.get(key);
  if (!b || b.resetAt < now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    if (rateBuckets.size > 5000) {
      for (const [k, v] of rateBuckets) if (v.resetAt < now) rateBuckets.delete(k);
    }
    return true;
  }
  b.count += 1;
  return b.count <= RATE_MAX;
}

function clientIp(req: NextRequest): string {
  const fwd = req.headers.get('x-forwarded-for') || '';
  const first = fwd.split(',')[0].trim();
  return first || req.headers.get('x-real-ip') || '';
}
function hashIp(ip: string): string | null {
  if (!ip) return null;
  const secret = process.env.AUTH_SECRET || 'ain-video-intel';
  return createHash('sha256').update(`${ip}${secret}`).digest('hex').slice(0, 64);
}
function str(v: any, max = 200): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  if (!s) return null;
  return s.slice(0, max);
}
function num(v: any, min: number, max: number): number | null {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}
function isUuid(v: any): boolean {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
function readConsent(body: any): { analytics: boolean; version: string } {
  const c = body?.consent;
  if (c === true) return { analytics: true, version: CONSENT_VERSION_DEFAULT };
  if (typeof c === 'string') return { analytics: c.toLowerCase() === 'granted', version: CONSENT_VERSION_DEFAULT };
  if (c && typeof c === 'object') {
    return {
      analytics: c.analytics === true || c.tracking === true || c.analyticsConsent === true || c.status === 'granted',
      version: str(c.version, 20) || CONSENT_VERSION_DEFAULT,
    };
  }
  return { analytics: body?.analyticsConsent === true, version: CONSENT_VERSION_DEFAULT };
}
function parseUa(ua: string): { device: string | null; browser: string | null; os: string | null } {
  if (!ua) return { device: null, browser: null, os: null };
  const device = /iPad|Tablet/i.test(ua) ? 'tablet' : /Mobi|Android|iPhone/i.test(ua) ? 'mobile' : 'desktop';
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /OPR\//.test(ua) ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : null;
  const os = /Windows/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iOS/.test(ua) ? 'iOS'
    : /Mac OS X/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux'
    : null;
  return { device, browser, os };
}

// คะแนนเบื้องต้นต่อ event (ฝั่ง AI จะคิดคะแนนรวมจริงอีกครั้งจาก aggregate)
const EVENT_POINTS: Record<string, number> = {
  page_view: 1,
  video_loaded: 1,
  video_play: 5,
  video_pause: 0,
  video_resume: 2,
  video_seek: 1,
  video_progress: 3,
  video_ended: 10,
  video_exit: 1,
  page_exit: 0,
  video_interaction: 2,
};

// ── ส่งต่อ n8n แบบไม่หน่วงผู้ชม (รันหลังส่งคำตอบกลับแล้ว) ───────────────────
function forwardToN8n(payload: any): 'queued' | 'skipped' {
  const base = process.env.N8N_VIDEO_WEBHOOK_URL || process.env.N8N_WEBHOOK_BASE;
  if (!base) return 'skipped';
  const url = /\/webhook/.test(base)
    ? `${base.replace(/\/$/, '')}${WEBHOOK_PATH}`
    : `${base.replace(/\/$/, '')}/webhook${WEBHOOK_PATH}`;
  const secret = process.env.N8N_WEBHOOK_SECRET || process.env.TRACK_WEBHOOK_SECRET || '';
  try {
    after(async () => {
      try {
        await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(secret ? { 'x-video-intel-secret': secret } : {}),
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(4000),
        });
      } catch {
        /* เงียบไว้ — event ถูกเก็บใน DB แล้ว และ workflow ดึงคิวจะมารับช่วงต่อ */
      }
    });
    return 'queued';
  } catch {
    return 'skipped';
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/video-intel/event',
    methods: ['POST'],
    consentRequired: true,
    anonymousOnly: true,
    events: [...KNOWN_EVENTS],
    interactions: [...INTERACTIONS],
    progressMarks: [10, 25, 50, 75, 90, 100],
    n8nPush: Boolean(process.env.N8N_VIDEO_WEBHOOK_URL || process.env.N8N_WEBHOOK_BASE),
    note: 'ต้องมี /api/video-intel ใน PUBLIC_API ของ src/middleware.ts และไม่เก็บข้อมูลส่วนบุคคลใด ๆ',
  });
}

export async function POST(req: NextRequest) {
  const ipKey = hashIp(clientIp(req)) || 'unknown';
  const ua = (req.headers.get('user-agent') || '').slice(0, 300);

  try {
    const body: any = await req.json().catch(() => ({}));
    if (!allow(ipKey)) {
      return NextResponse.json({ ok: false, error: 'ยิง event บ่อยเกินไป' }, { status: 429 });
    }
    if (ua && BOT_RE.test(ua)) {
      return NextResponse.json({ ok: true, stored: 0, reason: 'bot' });
    }

    // ── รับ event เดียว หรือเป็นชุด (events: []) ────────────────────────────
    const rawList: any[] = Array.isArray(body?.events) && body.events.length ? body.events : [body];

    const evtName = String(rawList[0]?.event || rawList[0]?.type || '').toLowerCase().trim();
    if (!KNOWN_EVENTS.has(evtName)) {
      return NextResponse.json(
        { ok: false, error: 'ไม่รู้จัก event นี้', allowed: [...KNOWN_EVENTS] },
        { status: 400 },
      );
    }
    const consent = readConsent(body);
    const visitorId = str(body?.visitor_id || body?.visitorId, 64) || randomUUID();
    const sessionId = str(body?.session_id || body?.sessionId, 64);
    const page = str(body?.page || body?.page_path, 300) || '/financial-freedom';
    const videoId = str(body?.video_id || body?.videoId, 80) || 'financial-freedom-video';
    const language = str(body?.language, 12);
    const referrer = str(body?.referrer, 2000);
    const uaParsed = parseUa(ua);

    // ไม่มีความยินยอม = ไม่บันทึก ไม่ส่งต่อ (แต่ตอบ 200 เพื่อให้ผู้ชมดูวิดีโอต่อได้)
    if (!consent.analytics) {
      return NextResponse.json({
        ok: true, stored: 0, reason: 'no_consent',
        message: 'ยังไม่ได้รับความยินยอมให้เก็บข้อมูลการใช้งาน — ระบบไม่บันทึกสิ่งใด',
      });
    }

    const db = prisma as any;
    const now = new Date();
    const origin = req.headers.get('origin') || process.env.APP_BASE_URL || 'https://ai-insurance-network-tree.vercel.app';
    const originClean = /^https?:\/\//.test(origin) ? origin.replace(/\/$/, '') : `https://${origin.replace(/\/$/, '')}`;

    // ── 1) upsert Visitor (anonymous) ───────────────────────────────────────
    const existing = await db.visitor.findUnique({ where: { visitorId } }).catch(() => null);
    let visitor = existing;
    if (!existing) {
      visitor = await db.visitor.create({
        data: {
          visitorId,
          totalVisits: 1,
          device: str(body?.device, 20) || uaParsed.device,
          browser: str(body?.browser, 40) || uaParsed.browser,
          os: uaParsed.os,
          userAgent: ua || null,
          ipHash: ipKey === 'unknown' ? null : ipKey,
          consentStatus: 'granted',
          consentVersion: consent.version,
          consentAt: now,
        },
      }).catch(() => null);
    } else {
      visitor = await db.visitor.update({
        where: { visitorId },
        data: {
          lastVisit: now,
          consentStatus: 'granted',
          consentVersion: consent.version,
          consentAt: existing.consentStatus === 'granted' ? existing.consentAt : now,
        },
      }).catch(() => existing);
    }

    // กลับมาเยี่ยมใหม่ (ห่างจากรอบล่าสุดเกิน 30 นาที) = นับเป็น visit ใหม่
    const RETURN_GAP_MS = 30 * 60 * 1000;
    const isReturning = Boolean(existing) && now.getTime() - new Date(existing.lastVisit).getTime() > RETURN_GAP_MS;
    if (isReturning && rawList[0]) {
      rawList.unshift({ ...rawList[0], event: 'return_visit', _synthetic: true });
    }

    // ── 2) บันทึก event ทีละรายการ (idempotent ด้วย eventId unique) ────────
    let stored = 0;
    let duplicates = 0;
    let errors = 0;
    const storedIds: string[] = [];
    const isFromN8n = String(body?.source || '') === 'n8n-video-intel';

    if (!visitor?.id) {
      return NextResponse.json({ ok: true, stored: 0, reason: 'visitor_unavailable', n8n: 'skipped' });
    }

    for (const raw of rawList.slice(0, 25)) {
      let eventName = String(raw?.event || raw?.type || '').toLowerCase().trim();
      if (raw?._synthetic) eventName = 'return_visit';
      if (eventName !== 'return_visit' && !KNOWN_EVENTS.has(eventName)) continue;

      const atRaw = raw?.timestamp || raw?.at || now;
      const at = atRaw ? new Date(atRaw) : now;
      const watchPct = num(raw?.progress_percent ?? raw?.progressPercent, 0, 100);
      const watchSeconds = num(raw?.watch_duration ?? raw?.watchDuration ?? raw?.current_time, 0, 24 * 3600);
      const currentTime = num(raw?.current_time, 0, 24 * 3600);
      const duration = num(raw?.video_duration ?? raw?.videoDuration, 0, 24 * 3600);
      const interaction = str(raw?.interaction, 40);
      const eventId = str(raw?.event_id || raw?.eventId, 64) || randomUUID();
      const meta = {
        page, videoId, language,
        videoDuration: duration,
        currentTime,
        watchDuration: watchSeconds,
        progressPercent: watchPct,
        interaction: interaction && INTERACTIONS.has(interaction) ? interaction : undefined,
        replay: raw?.replay === true ? true : undefined,
        seekDirection: str(raw?.seek_direction, 12) || undefined,
        fullscreen: typeof raw?.fullscreen === 'boolean' ? raw.fullscreen : undefined,
        muted: typeof raw?.muted === 'boolean' ? raw.muted : undefined,
        volume: num(raw?.volume, 0, 1) ?? undefined,
        sessionDuration: num(raw?.session_duration, 0, 24 * 3600) ?? undefined,
        firstPlayAt: str(raw?.first_play_timestamp, 40) || undefined,
        lastActivityAt: str(raw?.last_activity_timestamp, 40) || undefined,
        source: isFromN8n ? 'n8n-video-intel' : 'web',
        consentVersion: consent.version,
      };

      try {
        await db.visitorEvent.create({
          data: {
            eventId,
            visitorId: visitor.id,
            sessionId,
            type: eventName === 'video_interaction' && interaction ? `video_${interaction}` : eventName,
            pagePath: page,
            pageUrl: page.startsWith('http') ? page : `${originClean}${page}`,
            referrer,
            videoCode: videoId,
            watchPct,
            watchSeconds,
            scoreDelta: EVENT_POINTS[eventName] ?? 0,
            meta,
            userAgent: ua || null,
            ipHash: ipKey === 'unknown' ? null : ipKey,
            at: Number.isNaN(at.getTime()) ? now : at,
          },
        });
        stored += 1;
        storedIds.push(eventId);
      } catch (e: any) {
        if (String(e?.code) === 'P2002') duplicates += 1;   // eventId ซ้ำ = ยิงซ้ำ ไม่นับเป็น error
        else { errors += 1; console.warn('[video-intel] store event failed:', e?.message); }
      }
    }

    // ── 3) นับ view เมื่อเริ่มเล่นรอบใหม่ ────────────────────────────────────
    if (visitor?.id && rawList.some((r: any) => PLAY_EVENTS.has(String(r?.event || '').toLowerCase()))) {
      await db.visitor.update({
        where: { visitorId },
        data: { totalVideoViews: { increment: 1 }, totalEvents: { increment: stored } },
      }).catch(() => null);
    } else if (visitor?.id) {
      await db.visitor.update({
        where: { visitorId },
        data: { totalEvents: { increment: stored } },
      }).catch(() => null);
    }

    // ── 4) จัดคิวรอประมวลผล (processed_at = null) แล้วส่งต่อ n8n ───────────
    const latest = rawList[rawList.length - 1] || rawList[0];
    const n8n = isFromN8n ? 'skipped' : forwardToN8n({
      // ⚠️ source ต้องเป็น 'n8n-video-intel' เมื่อถูกเรียกจาก n8n เอง เพื่อกันลูป
      source: 'web',
      event: String(latest?.event || evtName).toLowerCase(),
      event_id: str(latest?.event_id, 64) || storedIds[storedIds.length - 1] || null,
      visitor_id: visitorId,
      session_id: sessionId,
      page,
      video_id: videoId,
      timestamp: now.toISOString(),
      video_duration: num(latest?.video_duration, 0, 24 * 3600),
      current_time: num(latest?.current_time, 0, 24 * 3600),
      watch_duration: num(latest?.watch_duration, 0, 24 * 3600),
      progress_percent: num(latest?.progress_percent, 0, 100),
      interaction: str(latest?.interaction, 40),
      device: str(body?.device, 20) || uaParsed.device,
      browser: str(body?.browser, 40) || uaParsed.browser,
      referrer,
      language,
      returning: isReturning,
      consent: { analytics: true, version: consent.version },
    });

    return NextResponse.json({
      ok: true,
      stored,
      duplicates,
      errors,
      eventId: str(latest?.event_id, 64) || null,
      visitorId,
      sessionId,
      returning: isReturning,
      queued: stored > 0,
      n8n,
      at: now.toISOString(),
    });
  } catch (e: any) {
    console.error('[video-intel/event] error:', e?.message);
    return NextResponse.json({ ok: false, error: 'ประมวลผล event ไม่สำเร็จ' }, { status: 500 });
  }
}
