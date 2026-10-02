import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { isSystemAdmin } from '@/lib/admin';
import { getLineConfig, sendLineMessage } from '@/lib/line';
import { prisma } from '@/lib/prisma';
import { requireCronAuth } from '@/lib/cronAuth';

/* ─────────────────────────────────────────────────────────────
   ตัวจัดการ LINE แชร์ให้ 2 เส้นทาง
   - /api/admin/line  → ใช้จากหน้าเว็บผู้ดูแล (มี cookie session)
   - /api/line        → ใช้จากระบบอัตโนมัติ (n8n / Vercel Cron) ด้วย CRON_SECRET
   อนุญาต: (1) ผู้ดูแลที่ล็อกอินแล้ว  (2) คำขอที่มี Authorization: Bearer <CRON_SECRET>
   ───────────────────────────────────────────────────────────── */

export async function authorizeLineRequest(
  req: NextRequest,
): Promise<{ ok: true; via: 'session' | 'cron' } | { ok: false; res: NextResponse }> {
  const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
  if (token) {
    try {
      const payload: any = verifyToken(token);
      const adm = await isSystemAdmin(payload.sub || payload.id);
      if (adm.ok) return { ok: true, via: 'session' };
      return { ok: false, res: NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 }) };
    } catch {
      return { ok: false, res: NextResponse.json({ ok: false, error: 'โทเค็นไม่ถูกต้อง' }, { status: 401 }) };
    }
  }
  // requireCronAuth คืน null เมื่อผ่าน, คืน NextResponse เมื่อไม่ผ่าน (fail closed)
  const cronDenied = requireCronAuth(req);
  if (!cronDenied) return { ok: true, via: 'cron' };
  return { ok: false, res: NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 }) };
}

export function maskTarget(t: string) {
  if (t.length <= 4) return '••••';
  return t.slice(0, 3) + '••••' + t.slice(-3);
}

/** สถานะการตั้งค่า LINE / Email — ไม่เปิดเผย token */
export async function lineStatusResponse(req: NextRequest): Promise<NextResponse> {
  try {
    const a = await authorizeLineRequest(req);
    if (!a.ok) return a.res;

    const cfg = getLineConfig();
    const emailConfigured = !!(process.env.EMAIL_API_KEY && process.env.EMAIL_FROM_ADDRESS);
    return NextResponse.json({
      ok: true,
      line: {
        connected: cfg.configured,
        channelTokenConfigured: !!cfg.channelAccessToken,
        targetIdConfigured: !!cfg.targetId,
        targetIdMasked: cfg.targetId ? maskTarget(cfg.targetId) : null,
      },
      email: { connected: emailConfigured },
      hint: cfg.configured
        ? 'ตั้งค่าครบแล้ว — กดส่งข้อความทดสอบได้เลย'
        : 'ยังขาด: ' + [
            !cfg.channelAccessToken ? 'LINE_CHANNEL_ACCESS_TOKEN' : null,
            !cfg.targetId ? 'LINE_TARGET_ID' : null,
          ].filter(Boolean).join(' + '),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}

/** ส่งข้อความทดสอบ LINE */
export async function lineTestResponse(req: NextRequest): Promise<NextResponse> {
  try {
    const a = await authorizeLineRequest(req);
    if (!a.ok) return a.res;

    const cfg = getLineConfig();
    if (!cfg.configured) {
      return NextResponse.json({
        ok: false,
        error: 'LINE ยังไม่ได้ตั้งค่า — ตั้ง LINE_CHANNEL_ACCESS_TOKEN และ LINE_TARGET_ID ใน Environment Variables (Vercel) แล้ว deploy ใหม่',
        missing: [
          !cfg.channelAccessToken ? 'LINE_CHANNEL_ACCESS_TOKEN' : null,
          !cfg.targetId ? 'LINE_TARGET_ID' : null,
        ].filter(Boolean),
      }, { status: 400 });
    }

    const result = await sendLineMessage(
      `🧪 ทดสอบการเชื่อมต่อ LINE\n\nส่งจากระบบ Admin AI Insurance Network Tree\nเวลา: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
    );

    await (prisma as any).notificationLog.create({
      data: {
        type: 'line.test', channel: 'line', target: cfg.targetId,
        status: result.ok ? 'SENT' : 'FAILED', error: result.error || null,
        sentAt: result.ok ? new Date() : null,
      },
    }).catch(() => {});

    if (!result.ok) return NextResponse.json({ ok: false, error: result.error, target: maskTarget(cfg.targetId) }, { status: 502 });
    return NextResponse.json({ ok: true, target: maskTarget(cfg.targetId), via: a.via });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}
