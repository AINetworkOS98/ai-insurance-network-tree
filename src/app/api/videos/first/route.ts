import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * GET /api/videos/first?topic=เครือข่าย
 *
 * "วีดีโอแรก" ของระบบ 1 แตก 5 สร้างเครือข่าย (หน้า /financial-freedom)
 * - อ่านเท่านั้น (ไม่บันทึกการดู ไม่เพิ่ม view_count) — ตัวนับการดูเป็นหน้าที่ของ /api/videos/next
 * - วีดีโอแรก = คลิปที่ถูก "ตรึง" ด้วย priority สูงสุด (กำหนดผ่าน POST /api/videos/add { action: "pin" })
 * - ถ้ายังไม่มีคลิปที่ตรึงไว้ → ใช้คลิปหมวดเครือข่ายรหัสแรกสุด (ยังไม่ได้ตรึง = ระบบยังสุ่มอยู่)
 * - ตัวเลขทั้งหมดมาจากฐานข้อมูลจริง (ไม่แต่งขึ้น) · ข้อมูลส่วนบุคคลไม่ถูกส่งออก (เฉพาะข้อมูลคลิป)
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const topic = (url.searchParams.get('topic') || 'เครือข่าย').slice(0, 80).trim();
    const isNet = (t: string | null) => !!t && (t.includes(topic) || topic.includes(t));

    const all = await prisma.video
      .findMany({
        where: { status: 'active' },
        select: {
          id: true,
          videoId: true,
          title: true,
          url: true,
          tiktokId: true,
          thumbnailUrl: true,
          durationSec: true,
          topic: true,
          cta: true,
          ctaUrl: true,
          priority: true,
          updatedAt: true,
        },
        orderBy: [{ priority: 'desc' }, { videoId: 'asc' }],
        take: 500,
      })
      .catch(() => [] as Array<Record<string, unknown>>);

    const shape = (v: Record<string, unknown>) => {
      const raw = String(v.tiktokId || '');
      const tiktokId = raw || (String(v.url || '').match(/\/video\/(\d+)/)?.[1] ?? null);
      return {
        id: String(v.videoId),
        internalId: String(v.id),
        title: String(v.title || ''),
        url: String(v.url || ''),
        tiktokId,
        thumbnailUrl: v.thumbnailUrl ? String(v.thumbnailUrl) : null,
        embedUrl: tiktokId ? `https://www.tiktok.com/player/v1/${tiktokId}` : null,
        durationSec: Number(v.durationSec || 0) || null,
        topic: v.topic ? String(v.topic) : null,
        cta: v.cta ? String(v.cta) : null,
        ctaUrl: v.ctaUrl ? String(v.ctaUrl) : null,
        priority: Number(v.priority || 0),
      };
    };

    const network = all.filter((v) => isNet(v.topic as string | null));
    const others = all.filter((v) => !isNet(v.topic as string | null));
    const pinnedList = all.filter((v) => Number(v.priority || 0) > 0);
    const chosen = pinnedList[0] || network[0] || all[0] || null;

    return NextResponse.json(
      {
        ok: true,
        pinned: pinnedList.length > 0,
        first: chosen ? shape(chosen) : null,
        // ลำดับคลิปเครือข่ายในระบบ (สูงสุด 10) — ใช้แสดง "คิวคลิป" บนหน้าเว็บ
        queue: network.slice(0, 10).map((v) => ({ id: String(v.videoId), title: String(v.title || ''), priority: Number(v.priority || 0) })),
        pool: { active: all.length, network: network.length, other: others.length, topic },
        at: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ ok: false, error: msg }, { status: 200, headers: { 'Cache-Control': 'no-store' } });
  }
}
