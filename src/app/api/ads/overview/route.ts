import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken, payloadUserId } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/ads/overview  (ต้องล็อกอิน — อ่านอย่างเดียว ไม่เขียนข้อมูลใด ๆ)
 *
 * ใช้โดย AdsManager (การ์ด "AI Insurance Ads Manager" ท้ายหน้า /expand-team)
 * คืน "ข้อมูลจริง" จากฐานข้อมูลของระบบเท่านั้น:
 *   - tiktok : สถานะการเชื่อมต่อ TikTok Marketing API = ตรวจว่ามีค่า env ฝั่งเซิร์ฟเวอร์หรือไม่
 *              (คืนแค่ มี/ไม่มี ของชื่อคีย์ — ห้ามคืนค่าจริง และห้ามส่ง token ลงเบราว์เซอร์)
 *   - videos : คลังวิดีโอของระบบ (ตาราง Video) สำหรับเลือกใช้เป็นครีเอทีฟ
 *   - leads  : ผู้สนใจ (ตาราง Prospect) นับตามสถานะ + รายการล่าสุด (ย่อชื่อตาม PDPA) + แหล่งที่มา
 *   - team   : ตัวเลขทีมของผู้ใช้ที่ล็อกอิน (สมาชิกโดยตรง / ลูกในผัง 1 แตก 5 / ผู้สนใจในความดูแล)
 *
 * ไม่มีตัวเลขโฆษณา (ค่าใช้จ่าย/impressions/clicks) ในที่นี้ — ข้อมูลนั้นมาจาก TikTok API เท่านั้น
 * เมื่อยังไม่มี credentials ฝั่งเซิร์ฟเวอร์ ไคลเอนต์ต้องแสดง "ไม่มีข้อมูล" (ห้ามสร้างตัวเลขขึ้นมาเอง)
 */

const ENV_KEYS: { key: string; label: string; scope: string }[] = [
  { key: 'TIKTOK_ADS_ACCESS_TOKEN', label: 'Access Token', scope: 'Marketing API · อ่าน/สร้างแคมเปญ' },
  { key: 'TIKTOK_ADS_ADVERTISER_ID', label: 'Advertiser ID', scope: 'บัญชีโฆษณาที่อนุญาต' },
  { key: 'TIKTOK_MARKETING_APP_ID', label: 'App ID', scope: 'แอป Marketing API' },
  { key: 'TIKTOK_MARKETING_APP_SECRET', label: 'App Secret', scope: 'แอป Marketing API (ลับ)' },
  { key: 'TIKTOK_CLIENT_KEY', label: 'Client Key', scope: 'ล็อกอิน TikTok (มีอยู่แล้ว)' },
  { key: 'TIKTOK_CLIENT_SECRET', label: 'Client Secret', scope: 'ล็อกอิน TikTok (มีอยู่แล้ว)' },
];

export async function GET(req: NextRequest) {
  try {
    const token =
      req.cookies.get('token')?.value ||
      req.cookies.get('auth_token')?.value ||
      req.headers.get('authorization')?.replace('Bearer ', '') ||
      '';
    if (!token) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ ok: false, error: 'เซสชันหมดอายุ' }, { status: 401 });
    const userId = payloadUserId(payload);
    if (!userId) return NextResponse.json({ ok: false, error: 'เซสชันไม่ถูกต้อง — กรุณาเข้าสู่ระบบใหม่' }, { status: 401 });

    const env = ENV_KEYS.map((e) => ({ ...e, present: String(process.env[e.key] || '').trim().length > 0 }));
    const hasToken = env.find((e) => e.key === 'TIKTOK_ADS_ACCESS_TOKEN')?.present === true;
    const hasAdvertiser = env.find((e) => e.key === 'TIKTOK_ADS_ADVERTISER_ID')?.present === true;

    const [videos, videoTotal, byStatus, sources, leadSources, recent, directMembers, placementChildren, myProspects, totalProspects, totalMembers] =
      await Promise.all([
        prisma.video
          .findMany({
            where: { status: { in: ['active', 'draft', 'paused'] } },
            select: { videoId: true, title: true, url: true, tiktokId: true, status: true, topic: true, durationSec: true, viewCount: true, updatedAt: true },
            orderBy: [{ updatedAt: 'desc' }],
            take: 30,
          })
          .catch(() => [] as any[]),
        prisma.video.count().catch(() => 0),
        prisma.prospect.groupBy({ by: ['status'], _count: { _all: true } }).catch(() => [] as any[]),
        prisma.prospect.groupBy({ by: ['leadSourceId'], _count: { _all: true } }).catch(() => [] as any[]),
        prisma.leadSource.findMany({ select: { id: true, name: true } }).catch(() => [] as any[]),
        prisma.prospect
          .findMany({
            select: { firstName: true, lastName: true, status: true, createdAt: true, leadSourceId: true, province: true },
            orderBy: { createdAt: 'desc' },
            take: 15,
          })
          .catch(() => [] as any[]),
        prisma.user.count({ where: { sponsorId: userId } }).catch(() => 0),
        prisma.user.count({ where: { placementParentId: userId } }).catch(() => 0),
        prisma.prospect.count({ where: { ownerId: userId } }).catch(() => 0),
        prisma.prospect.count().catch(() => 0),
        prisma.user.count().catch(() => 0),
      ]);

    const srcName = new Map<string, string>((leadSources as any[]).map((s) => [String(s.id), String(s.name)]));
    const statusCount: Record<string, number> = {};
    for (const row of byStatus as any[]) statusCount[String(row.status)] = Number(row?._count?._all || 0);

    return NextResponse.json(
      {
        ok: true,
        at: new Date().toISOString(),
        tiktok: {
          connected: hasToken && hasAdvertiser,
          tokenPresent: hasToken,
          advertiserId: process.env.TIKTOK_ADS_ADVERTISER_ID || null,
          managerUrl: process.env.TIKTOK_ADS_MANAGER_URL || 'https://ads.tiktok.com/i18n/dashboard?aadvid=7251807874932883457&is_from_login=1',
          keys: env,
        },
        videos: (videos as any[]).map((v) => ({
          videoId: v.videoId,
          title: v.title,
          url: v.url,
          tiktokId: v.tiktokId,
          status: v.status,
          topic: v.topic,
          durationSec: v.durationSec,
          viewCount: v.viewCount,
          embedUrl: v.tiktokId ? `https://www.tiktok.com/player/v1/${v.tiktokId}` : null,
          updatedAt: v.updatedAt,
        })),
        videoTotal,
        leads: {
          total: totalProspects,
          byStatus: statusCount,
          sources: (sources as any[])
            .map((s) => ({ name: s.leadSourceId ? srcName.get(String(s.leadSourceId)) || 'ไม่ระบุ' : 'ไม่ระบุ', count: Number(s?._count?._all || 0) }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 8),
          recent: (recent as any[]).map((p) => ({
            name: `${p.firstName || ''} ${p.lastName ? String(p.lastName).slice(0, 1) + '.' : ''}`.trim(),
            status: p.status,
            province: p.province || null,
            source: p.leadSourceId ? srcName.get(String(p.leadSourceId)) || 'ไม่ระบุ' : 'ไม่ระบุ',
            createdAt: p.createdAt,
          })),
        },
        team: { directMembers, placementChildren, myProspects, totalProspects, totalMembers },
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'error';
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
