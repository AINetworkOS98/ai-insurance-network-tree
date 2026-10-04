import { NextRequest, NextResponse } from 'next/server';
import { HermesProvider, resolveConfig, getHermesProvider } from '@/lib/ai/hermesProvider';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/ai/selftest — ตรวจว่า AI ตอบจริงไหม (ผู้ดูแลระบบเท่านั้น)
 *  - ต้องมีสิทธิ์: header x-user-rank >= 3 หรือ Authorization: Bearer $CRON_SECRET
 *  - ตรวจได้ทุกค่ายที่มี key ในระบบ โดยไม่สลับ provider ที่ใช้งานอยู่
 *  - ไม่คืนค่า key ออกไปเลย (คืนแค่ ชื่อค่าย/รุ่น/เวลา/สถานะ)
 * query: ?provider=deepseek&model=deepseek-chat
 */
export async function GET(req: NextRequest) {
  const rank = Number(req.headers.get('x-user-rank') || 0);
  const auth = req.headers.get('authorization') || '';
  const cron = process.env.CRON_SECRET;
  const authorized = rank >= 3 || (!!cron && auth === `Bearer ${cron}`);
  if (!authorized) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const wantProvider = url.searchParams.get('provider') || undefined;
  const wantModel = url.searchParams.get('model') || undefined;

  const active = getHermesProvider().getInfo();
  const cfg = resolveConfig();

  // ทดสอบค่ายที่ขอ (หรือค่ายที่ใช้งานอยู่) + ค่ายที่มี key อื่นๆ ในระบบ เผื่อต้องสลับ
  const targets: { provider?: string; model?: string }[] = [];
  if (wantProvider) targets.push({ provider: wantProvider, model: wantModel });
  else {
    targets.push({});
    for (const p of ['deepseek', 'gemini', 'openrouter', 'openai']) {
      if (p !== active.provider) targets.push({ provider: p });
    }
  }

  const results = [] as any[];
  for (const t of targets) {
    const p = new HermesProvider(t);
    const info = p.getInfo();
    if (!info.configured) { results.push({ provider: info.provider, model: info.model, configured: false }); continue; }
    const r = await p.probe({ provider: t.provider, model: t.model, timeoutMs: 25000 });
    results.push({ configured: true, ...r });
  }

  return NextResponse.json({
    ok: results.some(r => r.ok),
    active: { provider: active.provider, model: active.model, configured: active.configured },
    envProvider: cfg.provider,
    results,
    checkedAt: new Date().toISOString(),
  });
}
