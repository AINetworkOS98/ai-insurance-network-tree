import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cronAuth';

// ─────────────────────────────────────────────────────────────────────────────
// POST/GET /api/cron/tl-smart-sync
// Worker ส่งใบสมัครตัวแทน (จาก /recruit) ไป app TL SMART ของไทยประกันชีวิต
//   • ประมวลผล EventOutbox channel = 'tl_smart' ที่ยัง pending
//   • เรียกได้จาก Vercel Cron หรือ n8n (Authorization: Bearer $CRON_SECRET)
//   • Idempotent: eventId ไม่ซ้ำต่อผู้สมัคร 1 ราย (tl_smart:<prospectId>)
//   • ยังไม่ตั้ง TLSMART_WEBHOOK_URL/TLSMART_API_URL → คงสถานะ pending ไว้ ไม่ drop
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BATCH = 25;

async function run(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  try {
    const { prisma } = await import('@/lib/prisma');
    const { sendToTlSmart, tlSmartConfig, TL_SMART_CHANNEL } = await import('@/lib/tlSmart');
    const cfg = tlSmartConfig();

    const pending: any[] = await (prisma as any).eventOutbox
      .findMany({ where: { channel: TL_SMART_CHANNEL, status: 'pending' }, orderBy: { createdAt: 'asc' }, take: BATCH })
      .catch(() => []);

    if (!cfg.configured) {
      return NextResponse.json({
        ok: true,
        configured: false,
        pending: pending.length,
        sent: 0,
        message: 'ยังไม่ได้ตั้งค่า TLSMART_WEBHOOK_URL หรือ TLSMART_API_URL — เก็บคิวไว้ครบ ไม่มีการสูญหาย',
      });
    }

    let sent = 0;
    let failed = 0;
    for (const ev of pending) {
      const result = await sendToTlSmart(ev.payload);
      await (prisma as any).eventOutbox
        .update({
          where: { id: ev.id },
          data: {
            status: result.ok ? 'sent' : 'failed',
            attempts: { increment: 1 },
            sentAt: new Date(),
          },
        })
        .catch(() => null);
      if (result.ok) sent++;
      else {
        failed++;
        // ล้มเหลวชั่วคราว → คืนเป็น pending ให้รอบถัดไปลองใหม่ (สูงสุด 20 ครั้ง)
        if ((ev.attempts || 0) < 20) {
          await (prisma as any).eventOutbox.update({ where: { id: ev.id }, data: { status: 'pending' } }).catch(() => null);
        }
      }
    }

    return NextResponse.json({ ok: true, configured: true, mode: cfg.webhook ? 'webhook' : 'api', scanned: pending.length, sent, failed });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 300) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  return run(req);
}
export async function POST(req: NextRequest) {
  return run(req);
}
