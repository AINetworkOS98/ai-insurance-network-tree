import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cronAuth';
import { sendLineAlert } from '@/lib/lineAlert';

/* ─────────────────────────────────────────────────────────────
   POST /api/line/notify — ส่ง "ข้อความอิสระ" เข้า LINE OA ของผู้ดูแล
   ใช้จากระบบอัตโนมัติ (n8n / สคริปต์ / Vercel Cron) เท่านั้น
   ต้องแนบ Authorization: Bearer <CRON_SECRET> — ไม่มี = 403 (fail closed)
   body: { text: string, refId?: string, kind?: string }
   ต่างจาก POST /api/line ที่ส่งได้แค่ข้อความทดสอบตายตัว
   ───────────────────────────────────────────────────────────── */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX = 4500; // เพดานข้อความ LINE Messaging API ต่อ 1 ข้อความ = 5,000 ตัวอักษร

export async function POST(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const text = String(body?.text ?? '').trim();
  if (!text) {
    return NextResponse.json({ ok: false, error: 'ต้องส่ง { text }' }, { status: 400 });
  }
  if (text.length > MAX) {
    return NextResponse.json(
      { ok: false, error: `ข้อความยาวเกิน ${MAX} ตัวอักษร (ได้ ${text.length})` },
      { status: 400 },
    );
  }

  const refId = String(body?.refId ?? `auto-${Date.now()}`);
  const kind = String(body?.kind ?? 'autopilot');

  const r = await sendLineAlert({ text, refId, kind });

  return NextResponse.json(
    {
      ok: r.sent,
      configured: r.configured,
      sent: r.sent,
      error: r.error || null,
      kind,
      refId,
      note: r.configured ? undefined : 'ยังไม่ได้ตั้งค่า LINE — เก็บข้อความเข้าคิว EventOutbox(channel=line) ไว้ให้แล้ว',
      at: new Date().toISOString(),
    },
    { status: r.sent ? 200 : 502 },
  );
}
