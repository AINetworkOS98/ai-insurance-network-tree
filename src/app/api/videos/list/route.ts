import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/videos/list?status=active&limit=200   (ต้องมี Authorization: Bearer <CRON_SECRET>)
 * ใช้โดย n8n workflow "TikTok Video 01 · Video Sync" เป็นแหล่งรายการวิดีโอสำหรับทำ queue/สุ่ม
 * และใช้ตรวจสถานะคลังวิดีโอบนหน้าเว็บ
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET || '';
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!secret || got !== secret) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status') || 'active';
    const limit = Math.max(1, Math.min(500, Number(url.searchParams.get('limit') || 200)));

    const videos = await prisma.video.findMany({
      where: status === 'all' ? {} : { status },
      select: { videoId: true, title: true, url: true, tiktokId: true, status: true, priority: true, durationSec: true, topic: true, viewCount: true, updatedAt: true },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: limit,
    });

    const views = await prisma.videoView
      .findMany({ select: { sessionId: true, videoId: true, startedAt: true, completed: true, secondsWatched: true }, orderBy: { startedAt: 'desc' }, take: 50 })
      .catch(() => []);

    const withEmbed = videos.map((v) => ({
      ...v,
      embedUrl: v.tiktokId ? `https://www.tiktok.com/player/v1/${v.tiktokId}` : null,
    }));

    return NextResponse.json(
      {
        ok: true,
        count: withEmbed.length,
        total: await prisma.video.count().catch(() => 0),
        videos: withEmbed,
        recentPlays: views.length,
        at: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
