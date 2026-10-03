import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/videos/interest — บันทึกผล "AI ตรวจจับความสนใจผู้ชม" (ช่องดูวีดีโอ TikTok)
//
// หลักการ:
//   • เก็บระดับคลิปเสมอ (video_views) — ไม่มีข้อมูลส่วนบุคคล
//   • เก็บระดับบุคคล (visitor_events) **เฉพาะเมื่อผู้ชมยินยอมแล้ว** (Visitor.consentStatus = 'granted')
//     ตรงตามกติกา PDPA เดียวกับ /api/track — ไม่ยินยอม = เก็บแค่สถิติระดับคลิป
//   • eventKey จากฝั่งเว็บใช้เป็น event_id → ยิงซ้ำไม่สร้างซ้ำ (idempotent)
//
// body: { vid?: visitorId(uuid) | sid?: string | videoCode: string | score: number
//         | signals?: object | action?: 'handoff'|'unmute' | seconds?: number
//         | durationSec?: number | eventKey?: string | consent?: boolean }
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      spec: 'POST { videoCode, score, vid?, sid?, signals?, action?, seconds?, durationSec? } → บันทึกความสนใจที่ AI ตรวจพบ',
      note: 'เก็บ visitor_events เฉพาะเมื่อผู้ชมให้ความยินยอม (consentStatus=granted)',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const videoCode = String(body.videoCode || body.videoId || '').trim().slice(0, 120);
    const sid = String(body.sid || 'anon').slice(0, 64);
    const score = Math.max(0, Math.min(100, Math.round(Number(body.score || 0))));
    const seconds = Math.max(0, Math.min(3600, Math.round(Number(body.seconds || 0))));
    const durationSec = Math.max(0, Math.min(3600, Math.round(Number(body.durationSec || 0))));
    const action = String(body.action || 'detected').slice(0, 40);
    const signals = body.signals && typeof body.signals === 'object' ? body.signals : null;
    const vidRaw = String(body.vid || '').trim();
    const eventKey = String(body.eventKey || '').trim().slice(0, 120) || randomUUID();

    const video = videoCode
      ? await prisma.video
          .findFirst({
            where: { OR: [{ videoId: videoCode }, { tiktokId: videoCode }, { url: { contains: videoCode } }] },
            select: { id: true, videoId: true, topic: true, durationSec: true },
          })
          .catch(() => null)
      : null;

    const dur = video?.durationSec && video.durationSec > 0 ? video.durationSec : durationSec;
    const pct = dur > 0 ? Math.min(100, Math.round((seconds / dur) * 100)) : 0;
    const logged: string[] = [];

    // 1) ระดับคลิป — อัปเดตแถวล่าสุดของ session นี้ (ถ้ามี) ไม่งั้นสร้างใหม่
    if (video?.id) {
      const last = await prisma.videoView
        .findFirst({ where: { videoId: video.id, sessionId: sid }, select: { id: true }, orderBy: { startedAt: 'desc' } })
        .catch(() => null);
      if (last?.id) {
        await prisma.videoView
          .update({
            where: { id: last.id },
            data: { secondsWatched: seconds, completionPct: pct, completed: pct >= 90, endedAt: new Date() },
          })
          .catch(() => null);
        logged.push('video_view_updated');
      } else {
        await prisma.videoView
          .create({
            data: {
              videoId: video.id,
              sessionId: sid,
              source: 'ai-interest',
              secondsWatched: seconds,
              completionPct: pct,
              completed: pct >= 90,
              startedAt: new Date(),
              endedAt: new Date(),
            },
          })
          .catch(() => null);
        logged.push('video_view_created');
      }
      await prisma.video.update({ where: { id: video.id }, data: { viewCount: { increment: 1 } } }).catch(() => null);
    }

    // 2) ระดับบุคคล — เฉพาะเมื่อมี Visitor ของ session/เครื่องนี้ "ที่ยินยอมแล้ว"
    if (UUID_RE.test(vidRaw)) {
      const visitor = await (prisma as any).visitor
        .findFirst({ where: { visitorId: vidRaw }, select: { id: true, consentStatus: true } })
        .catch(() => null);
      if (visitor?.id && visitor.consentStatus === 'granted') {
        await (prisma as any).visitorEvent
          .create({
            data: {
              eventId: eventKey,
              visitorId: visitor.id,
              sessionId: sid,
              type: 'video_interest',
              pagePath: '/financial-freedom',
              videoCode: video?.videoId || videoCode || null,
              videoId: video?.id || null,
              watchPct: pct,
              watchSeconds: seconds,
              scoreDelta: 15,
              meta: { score, signals, action, by: 'ai-channel' },
            },
          })
          .then(() => logged.push('visitor_event'))
          .catch(() => null);
      }
    }

    return NextResponse.json({ ok: true, score, completionPct: pct, logged }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ ok: false, error: msg }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
}
