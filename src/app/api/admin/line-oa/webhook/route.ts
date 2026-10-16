// ─────────────────────────────────────────────────────────────────────────────
// /api/admin/line-oa/webhook — ตั้ง/ตรวจ Webhook URL ของ OA โดยตรงจากระบบ (ไม่ต้องเข้า console)
//   GET  → สถานะ webhook ปัจจุบัน + URL ที่ระบบนี้ต้องใช้
//   POST { action: 'set' | 'test' }  → ตั้ง URL ให้เป็นของระบบนี้ / ยิงคำขอทดสอบจาก LINE
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { requireLineAdmin, fail } from '@/lib/lineOaAdmin';
import { lineEnvStatus, webhookInfo, webhookUrl, setWebhookEndpoint, testWebhookEndpoint } from '@/lib/lineOa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const a = await requireLineAdmin(req);
  if (!a.ok) return a.res;
  try {
    const env = lineEnvStatus();
    const info = env.tokenConfigured ? await webhookInfo() : { endpoint: null, active: false, status: 0 };
    return NextResponse.json({
      ok: true, env, expected: webhookUrl(), current: info,
      match: info.endpoint === webhookUrl(),
    });
  } catch (e: any) { return fail(e); }
}

export async function POST(req: NextRequest) {
  const a = await requireLineAdmin(req);
  if (!a.ok) return a.res;
  try {
    const env = lineEnvStatus();
    if (!env.ready) {
      return NextResponse.json({
        ok: false,
        error: 'ยังตั้งค่าไม่ครบ: ' + env.missing.join(' + ') + ' (ต้องมีทั้ง access token และ channel secret จึงตรวจลายเซ็นได้)',
        env,
      }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));

    if (body.action === 'set') {
      const url = webhookUrl();
      const r = await setWebhookEndpoint(url);
      if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 502 });
      const info = await webhookInfo();
      const t = await testWebhookEndpoint();   // LINE ยิงคำขอทดสอบเข้าปลายทางจริงของเรา
      return NextResponse.json({ ok: true, endpoint: url, active: info.active, test: t });
    }

    if (body.action === 'test') {
      const t = await testWebhookEndpoint();
      const info = await webhookInfo();
      return NextResponse.json({ ok: t.ok, test: t, current: info, expected: webhookUrl() });
    }

    return NextResponse.json({ ok: false, error: 'action ต้องเป็น set หรือ test' }, { status: 400 });
  } catch (e: any) { return fail(e); }
}
