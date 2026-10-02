import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/videos/next?sid=<session>&limit=1
 * ช่องดูวีดีโอ TikTok แบบสุ่มต่อเนื่อง (สุ่ม → เล่น → จบ → สุ่มใหม่)
 *
 * - เลือกเฉพาะวิดีโอ status = "active"
 * - กันเล่นซ้ำ: ตัดวิดีโอที่อยู่ในประวัติ 10 รายการล่าสุดของ session นี้ (ถ้ายังมีตัวอื่นเหลือ)
 * - บันทึกการเริ่มเล่นลง video_views + เพิ่ม view_count
 * - ทำงานแบบอ่าน/เขียนอย่างเดียว ไม่แตะข้อมูลลูกค้า
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const sid = (url.searchParams.get('sid') || '').slice(0, 64) || 'anon';
    const wanted = Math.max(1, Math.min(20, Number(url.searchParams.get('limit') || 1)));
    // กรองตามหมวด (เช่น topic=เครือข่าย) — ไม่ส่งมา = ใช้ทุกคลิปที่ active
    const topic = (url.searchParams.get('topic') || '').slice(0, 80).trim();

    const vids = await prisma.video.findMany({
      where: { status: 'active', ...(topic ? { topic } : {}) },
      select: { id: true, videoId: true, title: true, url: true, tiktokId: true, durationSec: true, topic: true, cta: true, ctaUrl: true, priority: true },
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
      take: 500,
    });

    if (!vids.length) {
      return NextResponse.json({ ok: true, video: null, reason: 'no_active_videos' }, { headers: { 'Cache-Control': 'no-store' } });
    }

    // ประวัติ 10 รายการล่าสุดของ session นี้
    const recent = await prisma.videoView
      .findMany({ where: { sessionId: sid }, select: { videoId: true }, orderBy: { startedAt: 'desc' }, take: 10 })
      .catch(() => [] as Array<{ videoId: string }>);
    const recentIds = new Set(recent.map((r) => r.videoId));

    let pool = vids.filter((v) => !recentIds.has(v.id));
    if (!pool.length) pool = vids; // คลังมีน้อยกว่าที่กันซ้ำ → อนุญาตให้วนซ้ำได้
    if (wanted > 1) pool = pool.slice(0, wanted);

    const pick = pool.length === 1 ? pool[0] : pool[Math.floor(Math.random() * pool.length)];
    const tiktokId = pick.tiktokId || (pick.url.match(/\/video\/(\d+)/)?.[1] ?? null);

    // บันทึกการเริ่มเล่น (ไม่ให้ล้มทั้งคำขอถ้าบันทึกไม่ได้)
    await prisma.videoView
      .create({ data: { videoId: pick.id, sessionId: sid, source: 'channel', startedAt: new Date() } })
      .catch(() => null);
    await prisma.video.update({ where: { id: pick.id }, data: { viewCount: { increment: 1 } } }).catch(() => null);

    return NextResponse.json(
      {
        ok: true,
        video: {
          id: pick.videoId,
          internalId: pick.id,
          title: pick.title,
          url: pick.url,
          tiktokId,
          embedUrl: tiktokId ? `https://www.tiktok.com/player/v1/${tiktokId}` : null,
          durationSec: pick.durationSec || 30,
          topic: pick.topic || null,
          cta: pick.cta || null,
          ctaUrl: pick.ctaUrl || null,
        },
        pool: { active: vids.length, skippedRecent: vids.length - pool.length },
        queue: 'shuffle',
        topic: topic || null,
        session: sid,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ ok: false, error: msg }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
}
