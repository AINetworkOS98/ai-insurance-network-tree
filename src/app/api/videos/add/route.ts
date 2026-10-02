import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * POST /api/videos/add   (ต้องมี Authorization: Bearer <CRON_SECRET>)
 * body: { url: "https://www.tiktok.com/@aka989._/video/123456", title?, durationSec?, topic?, cta?, ctaUrl? }
 *    หรือ { urls: [ ... ] } เพื่อเพิ่มหลายรายการ
 *
 * ใช้โดย n8n workflow "TikTok Video 01 · Video Sync" (webhook add-video) และหน้าผู้ดูแล
 * - ตรวจรูปแบบ URL ของ TikTok และดึง video id
 * - กันซ้ำด้วย tiktok_id (มีอยู่แล้ว = อัปเดตข้อมูล ไม่สร้างซ้ำ)
 * - ไม่ดึงข้อมูลจาก TikTok เอง (ไม่ scrape) — ใช้เฉพาะลิงก์/ข้อมูลที่ได้รับอนุญาต
 */
function authorize(req: Request) {
  const secret = process.env.CRON_SECRET || '';
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  return secret.length > 0 && got.length > 0 && got === secret;
}

function parseTikTok(raw: string) {
  const url = String(raw || '').trim();
  const m = url.match(/tiktok\.com\/@([A-Za-z0-9._-]+)\/video\/(\d+)/i) || url.match(/tiktok\.com\/.*\/video\/(\d+)/i);
  if (!m) return null;
  const username = m.length === 3 ? `@${m[1]}` : '@aka989._';
  const id = m[m.length - 1];
  return { id, username, canonical: `https://www.tiktok.com/${username}/video/${id}` };
}

export async function POST(req: Request) {
  if (!authorize(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  try {
    const body = await req.json().catch(() => ({}));

    // ── การจัดการคลิปที่มีอยู่แล้ว (สำหรับผู้ดูแล/n8n): pause · activate · delete ──
    const action = String(body.action || '').trim();
    if (action) {
      const key = String(body.id || body.videoId || body.tiktokId || '').trim();
      if (!key) return NextResponse.json({ ok: false, error: 'id_required' }, { status: 400 });
      const found = await prisma.video.findFirst({
        where: { OR: [{ videoId: key }, { tiktokId: key }, { url: { contains: key } }] },
        select: { id: true, videoId: true, tiktokId: true },
      });
      if (!found) return NextResponse.json({ ok: false, error: 'not_found', id: key }, { status: 200 });
      if (action === 'delete') {
        await prisma.videoView.deleteMany({ where: { videoId: found.id } }).catch(() => null);
        await prisma.video.delete({ where: { id: found.id } });
        return NextResponse.json({ ok: true, action, videoId: found.videoId, tiktokId: found.tiktokId }, { headers: { 'Cache-Control': 'no-store' } });
      }
      const status = action === 'pause' ? 'paused' : action === 'activate' ? 'active' : action === 'archive' ? 'archived' : null;
      if (!status) return NextResponse.json({ ok: false, error: 'unknown_action', action }, { status: 400 });
      await prisma.video.update({ where: { id: found.id }, data: { status } });
      return NextResponse.json({ ok: true, action, status, videoId: found.videoId, tiktokId: found.tiktokId }, { headers: { 'Cache-Control': 'no-store' } });
    }
    const inputs: string[] = Array.isArray(body.urls) ? body.urls.map(String) : body.url ? [String(body.url)] : [];
    if (!inputs.length) return NextResponse.json({ ok: false, error: 'url_required' }, { status: 400 });

    const results: Array<Record<string, unknown>> = [];
    for (const raw of inputs.slice(0, 200)) {
      const parsed = parseTikTok(raw);
      if (!parsed) {
        results.push({ url: raw, ok: false, reason: 'invalid_tiktok_url' });
        continue;
      }
      try {
        const existing = await prisma.video.findFirst({ where: { tiktokId: parsed.id }, select: { id: true, videoId: true } });
        if (existing) {
          const upd: Record<string, unknown> = { status: 'active', url: parsed.canonical, updatedAt: new Date() };
          if (body.title) upd.title = String(body.title).slice(0, 200);
          if (body.topic) upd.topic = String(body.topic).slice(0, 80);
          if (body.durationSec) upd.durationSec = Math.max(0, Math.min(3600, Number(body.durationSec) || 0)) || null;
          if (body.cta) upd.cta = String(body.cta).slice(0, 200);
          if (body.ctaUrl) upd.ctaUrl = String(body.ctaUrl).slice(0, 400);
          await prisma.video.update({
            where: { id: existing.id },
            data: upd,
          });
          results.push({ url: parsed.canonical, ok: true, action: 'updated', videoId: existing.videoId, tiktokId: parsed.id });
        } else {
          const seq = (await prisma.video.count()) + 1;
          const code = `V-${String(seq).padStart(6, '0')}`;
          const created = await prisma.video.create({
            data: {
              videoId: code,
              tiktokId: parsed.id,
              url: parsed.canonical,
              title: String(body.title || `TikTok ${parsed.username} · ${parsed.id}`).slice(0, 200),
              durationSec: Number(body.durationSec || 0) || null,
              topic: body.topic ? String(body.topic).slice(0, 80) : null,
              cta: body.cta ? String(body.cta).slice(0, 200) : null,
              ctaUrl: body.ctaUrl ? String(body.ctaUrl).slice(0, 400) : null,
              status: 'active',
            },
            select: { videoId: true },
          });
          results.push({ url: parsed.canonical, ok: true, action: 'created', videoId: created.videoId, tiktokId: parsed.id });
        }
      } catch (e: unknown) {
        results.push({ url: raw, ok: false, reason: e instanceof Error ? e.message : 'db_error' });
      }
    }

    const created = results.filter((r) => r.action === 'created').length;
    const updated = results.filter((r) => r.action === 'updated').length;
    const failed = results.filter((r) => !r.ok).length;
    return NextResponse.json({ ok: true, created, updated, failed, results, total: results.length }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
