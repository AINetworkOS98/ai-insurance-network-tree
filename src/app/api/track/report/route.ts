import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCronAuth } from '@/lib/cronAuth';
import { createHash } from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/track/report — สรุปการเข้าชม "ทุกหน้า/ทุกลิงก์" ให้ n8n เอาไปรายงานเข้า LINE OA
//
//   ?range=today|24h|7d|30d   (ค่าเริ่มต้น = today ตามเวลาไทย)
//   &since=<ISO>              → คืน "รายการน่าสนใจ" ที่เกิดหลังเวลานี้ (ใช้แจ้งเตือนทันที)
//   &includeInternal=1        → นับหน้าภายใน (/admin, /dashboard, /login) ด้วย
//
// หลักการ:
//   • อ่านอย่างเดียว ไม่เขียนอะไร ไม่ส่งข้อมูลส่วนบุคคลออก (ผู้เข้าชมถูกย่อเป็นรหัสสั้น)
//   • ตัวเลขทั้งหมดมาจาก visitor_events จริง — ไม่คาดเดา
//   • สิทธิ์: Authorization: Bearer <CRON_SECRET> (n8n / cron) เท่านั้น
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000;
// หน้าภายในทีม (ไม่นับเป็น "ผู้สนใจเข้าชม") — ตัดออกจากรายงานปกติ
const INTERNAL_PREFIXES = ['/admin', '/dashboard', '/login', '/verify', '/api', '/_next'];
// เหตุการณ์ที่ถือว่า "ใช้งานจริง/สนใจ" → ใช้แจ้งเตือนทันทีและนับในสรุป
const INTERESTING = new Set(['form_submit', 'callback_request', 'topic_select']);
const INTERESTING_LABEL: Record<string, string> = {
  form_submit: 'กรอก/ส่งฟอร์ม',
  callback_request: 'ขอให้ติดต่อกลับ',
  topic_select: 'เลือกหัวข้อที่สนใจ',
  cta_click: 'กดปุ่มชวนทำต่อ',
  video_complete: 'ดูคลิปจนจบ',
  return_visit: 'กลับมาเยี่ยมซ้ำ',
};

function bkkTodayStart() {
  const nowBkk = new Date(Date.now() + BKK_OFFSET_MS);
  const y = nowBkk.getUTCFullYear();
  const m = nowBkk.getUTCMonth();
  const d = nowBkk.getUTCDate();
  return new Date(Date.UTC(y, m, d) - BKK_OFFSET_MS);
}

function resolveRange(key: string): { from: Date; to: Date; key: string; label: string } {
  const to = new Date();
  const k = String(key || 'today').toLowerCase();
  if (k === '24h') return { from: new Date(to.getTime() - 24 * 3600e3), to, key: '24h', label: '24 ชั่วโมงล่าสุด' };
  if (k === '7d') return { from: new Date(to.getTime() - 7 * 86400e3), to, key: '7d', label: '7 วันล่าสุด' };
  if (k === '30d') return { from: new Date(to.getTime() - 30 * 86400e3), to, key: '30d', label: '30 วันล่าสุด' };
  return { from: bkkTodayStart(), to, key: 'today', label: 'วันนี้' };
}

function shortVisitor(publicId: string | null | undefined) {
  if (!publicId) return 'ไม่ทราบ';
  return '#' + createHash('sha1').update(String(publicId)).digest('hex').slice(0, 6);
}

function isInternalPath(p: string | null) {
  if (!p) return false;
  return INTERNAL_PREFIXES.some((x) => p === x || p.startsWith(x + '/') || p.startsWith(x));
}

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  try {
    const url = new URL(req.url);
    const includeInternal = url.searchParams.get('includeInternal') === '1';
    const range = resolveRange(url.searchParams.get('range') || 'today');
    const sinceRaw = url.searchParams.get('since');
    const since = sinceRaw ? new Date(sinceRaw) : null;
    const db = prisma as any;

    const events: any[] = await db.visitorEvent
      .findMany({
        where: { at: { gte: range.from, lte: range.to } },
        select: {
          type: true, pagePath: true, pageTitle: true, referrer: true,
          utmSource: true, utmMedium: true, utmCampaign: true,
          sessionId: true, visitorId: true, at: true, meta: true,
        },
        orderBy: { at: 'asc' },
        take: 20000,
      })
      .catch(() => [] as any[]);

    const kept = includeInternal ? events : events.filter((e: any) => !isInternalPath(e.pagePath));

    // ── รวมยอด ────────────────────────────────────────────────────────────
    const types: Record<string, number> = {};
    type PageAgg = { views: number; visitors: Set<string>; returns: number; title: string | null };
    const pageMap = new Map<string, PageAgg>();
    const sessions = new Set<string>();
    const visitorIds = new Set<string>();
    const deviceOf = new Map<string, string>();
    const sources = new Map<string, number>();
    const hourly: Record<string, number> = {};

    for (const e of kept) {
      types[e.type] = (types[e.type] || 0) + 1;
      if (e.sessionId) sessions.add(String(e.sessionId));
      if (e.visitorId) visitorIds.add(String(e.visitorId));
      if (e.type === 'page_view' || e.type === 'return_visit') {
        const p = String(e.pagePath || '/');
        const cur: PageAgg = pageMap.get(p) || { views: 0, visitors: new Set<string>(), returns: 0, title: null };
        if (e.type === 'page_view') cur.views += 1;
        else cur.returns += 1;
        if (e.visitorId) cur.visitors.add(String(e.visitorId));
        if (!cur.title && e.pageTitle) cur.title = String(e.pageTitle).slice(0, 90);
        pageMap.set(p, cur);
      }
      // ที่มา: utm_source ก่อน แล้วค่อย referrer host
      if (e.utmSource) sources.set(String(e.utmSource).slice(0, 60), (sources.get(String(e.utmSource).slice(0, 60)) || 0) + 1);
      else if (e.referrer) {
        let host = 'direct';
        try { host = new URL(String(e.referrer)).hostname.replace(/^www\./, ''); } catch { host = 'direct'; }
        sources.set(host, (sources.get(host) || 0) + 1);
      }
      const hh = new Date(new Date(e.at).getTime() + BKK_OFFSET_MS).toISOString().slice(11, 13);
      hourly[hh] = (hourly[hh] || 0) + 1;
    }

    // ── อุปกรณ์ของผู้เข้าชม (จากตาราง visitors) ────────────────────────────
    const visitorRows: any[] = visitorIds.size
      ? await db.visitor
          .findMany({
            where: { id: { in: [...visitorIds] } },
            select: { id: true, visitorId: true, device: true, totalVisits: true },
          })
          .catch(() => [] as any[])
      : [];
    const publicIdOf = new Map<string, string>();
    for (const v of visitorRows) {
      publicIdOf.set(String(v.id), String(v.visitorId || ''));
      deviceOf.set(String(v.id), String(v.device || 'unknown'));
    }
    const devices: Record<string, number> = {};
    if (visitorRows.length) {
      for (const v of visitorRows) {
        const d = String(v.device || 'unknown');
        devices[d] = (devices[d] || 0) + 1;
      }
    }

    const pages = [...pageMap.entries()]
      .map(([path, v]) => ({
        path,
        title: v.title,
        views: v.views,
        returns: v.returns,
        visitors: v.visitors.size,
      }))
      .sort((a, b) => b.views - a.views || b.visitors - a.visitors);

    // ── รายการ "ใช้งานน่าสนใจ" (สำหรับแจ้งเตือนทันที) ──────────────────────
    const recentSrc = since
      ? events.filter((e: any) => new Date(e.at) > since && INTERESTING.has(String(e.type)))
      : kept.filter((e: any) => INTERESTING.has(String(e.type)));
    const recent = recentSrc.slice(-20).map((e: any) => ({
      at: new Date(e.at).toISOString(),
      atBkk: new Date(new Date(e.at).getTime() + BKK_OFFSET_MS).toISOString().slice(11, 16),
      type: e.type,
      label: INTERESTING_LABEL[String(e.type)] || String(e.type),
      pagePath: String(e.pagePath || '/'),
      pageTitle: e.pageTitle ? String(e.pageTitle).slice(0, 70) : null,
      visitor: shortVisitor(publicIdOf.get(String(e.visitorId)) || ''),
      detail: e.meta && typeof e.meta === 'object' ? JSON.stringify(e.meta).slice(0, 120) : null,
    }));

    const lastEvent = kept.length ? kept[kept.length - 1].at : null;

    return NextResponse.json(
      {
        ok: true,
        range: { key: range.key, label: range.label, from: range.from.toISOString(), to: range.to.toISOString() },
        scope: includeInternal ? 'รวมหน้าภายใน' : 'เฉพาะหน้าสาธารณะ (ตัด /admin,/dashboard,/login)',
        totals: {
          events: kept.length,
          pageViews: types.page_view || 0,
          visitors: visitorIds.size,
          sessions: sessions.size,
          returnVisits: types.return_visit || 0,
          ctaClicks: types.cta_click || 0,
          formOpens: types.form_open || 0,
          formSubmits: types.form_submit || 0,
          callbackRequests: types.callback_request || 0,
          topicSelects: types.topic_select || 0,
          videoViews: types.video_view || 0,
          videoCompletes: types.video_complete || 0,
        },
        types,
        pages,
        pagesSeen: pages.length,
        devices: Object.entries(devices).map(([device, visitors]) => ({ device, visitors })).sort((a, b) => b.visitors - a.visitors),
        sources: [...sources.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count).slice(0, 10),
        hourly: Object.entries(hourly).map(([hour, events]) => ({ hour, events })).sort((a, b) => a.hour.localeCompare(b.hour)),
        lastEventAt: lastEvent ? new Date(lastEvent).toISOString() : null,
        since: since ? since.toISOString() : null,
        recent,
        generatedAt: new Date().toISOString(),
        note: 'อ่านอย่างเดียว · ไม่มีข้อมูลส่วนบุคคลออกจากเส้นทางนี้ (ผู้เข้าชมแสดงเป็นรหัสสั้น)',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: 'report_failed', message: String(e?.message || e).slice(0, 300) },
      { status: 500 },
    );
  }
}
