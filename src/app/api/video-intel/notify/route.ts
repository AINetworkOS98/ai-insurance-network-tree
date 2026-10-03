import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeLeadApi } from '@/lib/leadApiAuth';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/video-intel/notify — ส่งอีเมลแจ้งเตือน/รายงานของระบบ Video Intelligence
//
// ใช้เมื่อ: n8n ตรวจพบ engagement_score >= 80 (แจ้งทันที), รายงานรายชั่วโมง, รายงานรายวัน
//   body: { subject, html, to?, kind?: 'alert'|'hourly'|'daily', analysis_id?, text? }
//   → ส่งผ่าน SMTP/Resend ที่ระบบใช้อยู่ (src/lib/mailer.ts) แล้วบันทึก NotificationLog
//
// เหตุผลที่ให้แอปส่งเมลแทน n8n: n8n บนเครื่องนี้ไม่มี credential SMTP และผู้รับ/หัวข้อ
// ต้องถูกควบคุมจากฝั่งแอป (กัน n8n ยิงอีเมลไปที่อื่นโดยไม่ตั้งใจ)
//
// สิทธิ์: session ผู้ดูแล หรือ Authorization: Bearer CRON_SECRET
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const KINDS = new Set(['alert', 'hourly', 'daily', 'weekly', 'test', 'info']);
const ALLOWED_RECIPIENT = process.env.ALERT_EMAIL || 'akarapol.pro798@gmail.com';

function str(v: any, max = 300): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/video-intel/notify',
    methods: ['POST'],
    auth: 'session | Bearer CRON_SECRET',
    recipient: ALLOWED_RECIPIENT,
    kinds: [...KINDS],
    body: { subject: 'string', html: 'string', kind: 'alert|hourly|daily|test|info', analysis_id: 'optional' },
    note: 'ผู้รับถูกจำกัดที่ ALERT_EMAIL เท่านั้น',
  });
}

export async function POST(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  if (!auth.ok) return auth.res;

  try {
    const body: any = await req.json().catch(() => ({}));
    const db = prisma as any;

    const subject = str(body?.subject, 300) || '🔔 AI Video Intelligence';
    const html = typeof body?.html === 'string' ? body.html.slice(0, 400000) : '';
    const kindRaw = String(body?.kind || 'info').toLowerCase();
    const kind = KINDS.has(kindRaw) ? kindRaw : 'info';
    // ผู้รับ: จำกัดที่ ALERT_EMAIL เท่านั้น (ถ้าส่ง to อื่นจะถูกปฏิเสธ)
    const to = str(body?.to, 200) || ALLOWED_RECIPIENT;
    const analysisId = str(body?.analysis_id, 80);

    if (!html || html.length < 20) {
      return NextResponse.json({ ok: false, error: 'ต้องมี html ของอีเมล' }, { status: 400 });
    }
    if (to.toLowerCase() !== ALLOWED_RECIPIENT.toLowerCase()) {
      return NextResponse.json(
        { ok: false, error: `ส่งได้เฉพาะ ${ALLOWED_RECIPIENT} เท่านั้น` },
        { status: 403 },
      );
    }

    let emailResult = 'failed';
    let provider = 'none';
    try {
      const { sendMail, activeProvider } = await import('@/lib/mailer');
      provider = activeProvider();
      const r: any = await sendMail({ to, subject, html });
      emailResult = r?.ok ? `sent(${r?.provider})` : `failed(${r?.error || 'unknown'})`;
      provider = r?.provider || provider;
    } catch (e: any) {
      emailResult = `failed(${e?.message || 'exception'})`;
    }

    const ok = emailResult.startsWith('sent');

    // บันทึก log (ใช้ NotificationLog เหมือน /api/agent-log — ไม่ต้องเพิ่มตาราง log)
    await db.notificationLog.create({
      data: {
        type: `video.intel.${kind}`,
        channel: 'email',
        target: to,
        status: ok ? 'SENT' : 'FAILED',
        error: ok ? null : emailResult,
        payload: {
          subject, kind, analysisId,
          provider,
          sentBy: auth.via,
          bytes: html.length,
        },
        sentAt: new Date(),
      },
    }).catch((e: any) => console.warn('[video-intel/notify] log failed:', e?.message));

    // มาร์กว่าอีเมลแจ้งเตือนของผลวิเคราะห์นี้ถูกส่งแล้ว (กันส่งซ้ำ)
    if (ok && analysisId) {
      await db.videoAiAnalysis.updateMany({
        where: { analysisId },
        data: { alertSent: true },
      }).catch(() => null);
    }

    return NextResponse.json({
      ok,
      email: emailResult,
      provider,
      to,
      kind,
      analysisId,
      at: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[video-intel/notify] error:', e?.message);
    return NextResponse.json({ ok: false, error: 'ส่งอีเมลไม่สำเร็จ' }, { status: 500 });
  }
}
