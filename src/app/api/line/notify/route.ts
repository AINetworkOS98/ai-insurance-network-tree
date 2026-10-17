import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireCronAuth } from '@/lib/cronAuth';
import { getLineConfig, sendLineMessage } from '@/lib/line';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/line/notify — ส่งข้อความ LINE OA (หาเจ้าของ/กลุ่มปลายทางที่ตั้งไว้)
//   ใช้จาก n8n / cron ภายในระบบเท่านั้น — Authorization: Bearer <CRON_SECRET>
//   body: { text: string, kind?: string, refId?: string }
//
// ทำไมไม่ยิง api.line.me จาก n8n ตรง ๆ: token อยู่ที่ Vercel ที่เดียว (ไม่ต้อง
// กระจาย secret ไปหลายเครื่อง) และทุกข้อความถูกบันทึกลง notification_log เพื่อตรวจย้อนหลังได้
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_LEN = 4900; // เพดานข้อความ LINE = 5000 ตัวอักษร

export async function GET() {
  const cfg = getLineConfig();
  return NextResponse.json({
    ok: true,
    endpoint: '/api/line/notify',
    method: 'POST',
    configured: cfg.configured,
    hint: 'POST { text } พร้อม Authorization: Bearer <CRON_SECRET>',
  });
}

export async function POST(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  try {
    const body = await req.json().catch(() => ({} as any));
    const raw = typeof body?.text === 'string' ? body.text : '';
    const text = raw.trim().slice(0, MAX_LEN);
    if (!text) {
      return NextResponse.json({ ok: false, error: 'ต้องส่ง { text } มาด้วย' }, { status: 400 });
    }

    const cfg = getLineConfig();
    if (!cfg.configured) {
      return NextResponse.json(
        { ok: false, error: 'LINE ยังไม่ได้ตั้งค่า (LINE_CHANNEL_ACCESS_TOKEN / LINE_TARGET_ID)' },
        { status: 400 },
      );
    }

    const res = await sendLineMessage(text);
    const kind = String(body?.kind || 'line.notify').slice(0, 40);

    await (prisma as any).notificationLog
      .create({
        data: {
          type: kind,
          channel: 'line',
          target: cfg.targetId,
          status: res.ok ? 'SENT' : 'FAILED',
          error: res.ok ? null : String(res.error || '').slice(0, 300),
          sentAt: res.ok ? new Date() : null,
        },
      })
      .catch(() => null);

    if (!res.ok) {
      return NextResponse.json({ ok: false, error: res.error || 'LINE send failed' }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      sent: true,
      chars: text.length,
      kind,
      at: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 300) }, { status: 500 });
  }
}
