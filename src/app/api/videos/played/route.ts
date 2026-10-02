import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/videos/played
 * body: { videoId?: "V-XXXXXX" | uuid, sid?: string, seconds?: number, completed?: boolean, reason?: string }
 *
 * ปิดรอบการดู: อัปเดต video_views แถวล่าสุดของ session นี้ + คำนวณ completion %
 * ใช้โดยหน้าเว็บ (player) และโดย n8n workflow "TikTok Video 04 · Analytics"
 */
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const sid = String(body.sid || 'anon').slice(0, 64);
    const seconds = Math.max(0, Math.min(60 * 60, Number(body.seconds || 0)));
    const completed = body.completed === true;
    const bodyDur = Math.max(0, Math.min(3600, Math.round(Number(body.durationSec || 0))));
    const key = String(body.videoId || body.id || '').trim();

    const video = key
      ? await prisma.video
          .findFirst({ where: { OR: [{ videoId: key }, { tiktokId: key }, { url: { contains: key } }] }, select: { id: true, videoId: true, durationSec: true } })
          .catch(() => null)
      : await prisma.videoView
          .findFirst({ where: { sessionId: sid }, select: { videoId: true }, orderBy: { startedAt: 'desc' } })
          .then((r) => (r ? { id: r.videoId, videoId: '', durationSec: null } : null))
          .catch(() => null);

    if (!video?.id) return NextResponse.json({ ok: false, error: 'video_not_found' }, { status: 200 });

    const dur = video.durationSec && video.durationSec > 0 ? video.durationSec : bodyDur;
    const pct = dur > 0 ? Math.min(100, Math.round((seconds / dur) * 100)) : completed ? 100 : 0;

    // เรียนความยาวคลิปจริงจากเครื่องเล่น (ครั้งต่อไปจะรู้ทันที ไม่ต้องรอ)
    if (bodyDur > 0 && (!video.durationSec || Math.abs(video.durationSec - bodyDur) > 1)) {
      await prisma.video.update({ where: { id: video.id }, data: { durationSec: bodyDur } }).catch(() => null);
    }

    const last = await prisma.videoView
      .findFirst({ where: { videoId: video.id, sessionId: sid }, select: { id: true }, orderBy: { startedAt: 'desc' } })
      .catch(() => null);

    if (last?.id) {
      await prisma.videoView
        .update({ where: { id: last.id }, data: { secondsWatched: Math.round(seconds), completionPct: pct, completed, endedAt: new Date() } })
        .catch(() => null);
    } else {
      await prisma.videoView
        .create({
          data: { videoId: video.id, sessionId: sid, source: 'channel', secondsWatched: Math.round(seconds), completionPct: pct, completed, endedAt: new Date() },
        })
        .catch(() => null);
    }

    return NextResponse.json({ ok: true, videoId: video.videoId || key, seconds: Math.round(seconds), completionPct: pct, completed }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
