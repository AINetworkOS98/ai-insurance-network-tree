import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cronAuth';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/tl-smart/status   (Authorization: Bearer $CRON_SECRET)
// ดูสถานะสะพาน TL SMART: ตั้งค่า endpoint แล้วหรือยัง · คิวค้าง · ส่งล่าสุด · เลขตัวแทนถัดไป
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  try {
    const { prisma } = await import('@/lib/prisma');
    const { tlSmartConfig, TL_SMART_CHANNEL, TL_SMART_SPONSOR_CODE, nextAgentCode, AGENT_CODE_ACTIVITY } = await import('@/lib/tlSmart');
    const cfg = tlSmartConfig();

    const [pending, sent, failed, recent, lastCodeActivity, lastApplications] = await Promise.all([
      (prisma as any).eventOutbox.count({ where: { channel: TL_SMART_CHANNEL, status: 'pending' } }).catch(() => 0),
      (prisma as any).eventOutbox.count({ where: { channel: TL_SMART_CHANNEL, status: 'sent' } }).catch(() => 0),
      (prisma as any).eventOutbox.count({ where: { channel: TL_SMART_CHANNEL, status: 'failed' } }).catch(() => 0),
      (prisma as any).eventOutbox
        .findMany({ where: { channel: TL_SMART_CHANNEL }, orderBy: { createdAt: 'desc' }, take: 10, select: { eventId: true, status: true, attempts: true, createdAt: true } })
        .catch(() => []),
      (prisma as any).prospectActivity.findFirst({ where: { type: AGENT_CODE_ACTIVITY }, orderBy: { createdAt: 'desc' }, select: { content: true, createdAt: true } }).catch(() => null),
      (prisma as any).prospectActivity
        .findMany({ where: { type: 'tl_smart_application' }, orderBy: { createdAt: 'desc' }, take: 5, select: { content: true, createdAt: true } })
        .catch(() => []),
    ]);

    return NextResponse.json({
      ok: true,
      endpoint: { webhook: Boolean(cfg.webhook), api: Boolean(cfg.api && cfg.key), configured: cfg.configured, mode: cfg.webhook ? 'webhook' : cfg.api ? 'api' : null },
      sponsorCode: TL_SMART_SPONSOR_CODE,
      queue: { pending, sent, failed },
      nextAgentCode: await nextAgentCode(prisma).catch(() => null),
      lastIssuedAgentCode: lastCodeActivity?.content || null,
      lastIssuedAt: lastCodeActivity?.createdAt || null,
      recent,
      lastApplications: lastApplications.map((a: any) => ({ at: a.createdAt, ref: (() => { try { return JSON.parse(a.content || '{}').sourceRef || null; } catch { return null; } })() })),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 300) }, { status: 500 });
  }
}
