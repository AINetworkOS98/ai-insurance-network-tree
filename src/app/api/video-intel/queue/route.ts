import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeLeadApi } from '@/lib/leadApiAuth';

// ─────────────────────────────────────────────────────────────────────────────
// /api/video-intel/queue — คิว event ที่ n8n ยังไม่ได้ประมวลผล
//
//  GET  ?limit=50            → ดึง event วิดีโอที่ processed_at IS NULL (เก่าสุดก่อน)
//  POST { event_ids: [...] } → มาร์กว่าประมวลผลแล้ว (processed_at = now)
//
// ทำไมต้องมีคิว: การส่งต่อจากแอปไป n8n ต้องพึ่ง tunnel สาธารณะ ซึ่งล่มได้
// ⇒ workflow "Video Intel 05" ตั้งเวลา 1 นาทีมาดึงคิวจึงเป็นหลักประกันว่า
//   ไม่มี event ตกหล่น และระบบยังทำงานแม้ท่อจะตาย
//
// สิทธิ์: session ผู้ดูแล หรือ Authorization: Bearer CRON_SECRET (n8n)
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// event ที่เกี่ยวกับวิดีโอ (ตัด page_view/page_exit ทั่วไปออกให้คิวเบา)
const VIDEO_EVENT_TYPES = [
  'video_loaded', 'video_play', 'video_pause', 'video_resume', 'video_seek',
  'video_ended', 'video_exit', 'video_progress',
  'video_fullscreen', 'video_fullscreen_exit', 'video_mute', 'video_unmute',
  'video_volume_change', 'video_replay', 'video_seek_forward', 'video_seek_backward',
];

function str(v: any, max = 200): string | null {
  const s = v === null || v === undefined ? '' : String(v).trim();
  return s ? s.slice(0, max) : null;
}

export async function GET(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  if (!auth.ok) return auth.res;

  try {
    const url = new URL(req.url);
    const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit') || 40)));
    const minutes = Math.max(5, Math.min(60 * 24 * 7, Number(url.searchParams.get('minutes') || 60 * 24)));
    const since = new Date(Date.now() - minutes * 60 * 1000);
    const db = prisma as any;

    const rows = await db.visitorEvent.findMany({
      where: {
        processedAt: null,
        at: { gte: since },
        type: { in: [...VIDEO_EVENT_TYPES, 'return_visit'] },
      },
      orderBy: { at: 'asc' },
      take: limit,
      include: { visitor: { select: { visitorId: true, totalVisits: true, lastVisit: true, firstVisit: true } } },
    }).catch(() => []);

    const pendingTotal = await db.visitorEvent.count({
      where: { processedAt: null, at: { gte: since }, type: { in: [...VIDEO_EVENT_TYPES, 'return_visit'] } },
    }).catch(() => 0);

    return NextResponse.json({
      ok: true,
      count: rows.length,
      pendingTotal,
      since: since.toISOString(),
      events: rows.map((r: any) => ({
        eventId: r.eventId,
        event: r.type,
        visitorId: r.visitor?.visitorId || null,
        sessionId: r.sessionId || null,
        page: r.pagePath || null,
        videoId: r.videoCode || null,
        at: r.at,
        watchPercent: r.watchPct ?? null,
        watchSeconds: r.watchSeconds ?? null,
        device: r.visitor ? null : null,
        meta: r.meta || null,
      })),
    });
  } catch (e: any) {
    console.error('[video-intel/queue] error:', e?.message);
    return NextResponse.json({ ok: false, error: 'อ่านคิวไม่สำเร็จ' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  if (!auth.ok) return auth.res;

  try {
    const body: any = await req.json().catch(() => ({}));
    const db = prisma as any;
    const ids: string[] = Array.isArray(body?.event_ids)
      ? body.event_ids.map((x: any) => String(x)).filter(Boolean).slice(0, 500)
      : [];

    if (!ids.length) {
      return NextResponse.json({ ok: false, error: 'ต้องส่ง event_ids: []' }, { status: 400 });
    }

    const r = await db.visitorEvent.updateMany({
      where: { eventId: { in: ids }, processedAt: null },
      data: { processedAt: new Date() },
    }).catch(() => ({ count: 0 }));

    return NextResponse.json({
      ok: true,
      requested: ids.length,
      processed: Number(r?.count || 0),
      by: typeof body?.by === 'string' ? str(body.by, 80) : 'n8n',
      at: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[video-intel/queue] POST error:', e?.message);
    return NextResponse.json({ ok: false, error: 'อัปเดตคิวไม่สำเร็จ' }, { status: 500 });
  }
}
