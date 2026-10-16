// ─────────────────────────────────────────────────────────────────────────────
// /api/admin/line-oa — สถานะ + ตั้งค่าทั้งชุดของ LINE OA Studio
//   GET  → สถานะ OA, โควตา, webhook, ริชเมนู, ตั้งค่า, ผู้ติดตาม, บันทึกข้อความ
//   PUT  → บันทึกตั้งค่า (ข้อความต้อนรับ/เมนู/ตอบกลับสำรอง/นอกเวลา)
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireLineAdmin, fail } from '@/lib/lineOaAdmin';
import {
  lineEnvStatus, lineFetch, loadConfig, saveConfig, getQuota, webhookInfo, webhookUrl,
  richMenuList, getDefaultRichMenuId, RICHMENU_SIZES, previewText,
} from '@/lib/lineOa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const a = await requireLineAdmin(req);
  if (!a.ok) return a.res;
  try {
    const env = lineEnvStatus();
    const cfg: any = await loadConfig();

    let oa: any = null;
    let quota: any = null;
    let hook: any = { endpoint: null, active: false, status: 0 };
    let menus: any[] = [];
    let defaultMenuId: string | null = null;
    let lineError: string | null = null;

    if (env.tokenConfigured) {
      const [info, q, h, m, d] = await Promise.all([
        lineFetch('/v2/bot/info'), getQuota(), webhookInfo(), richMenuList(), getDefaultRichMenuId(),
      ]);
      oa = info.ok ? info.data : null;
      if (!info.ok) lineError = `LINE ${info.status}: ${info.text.slice(0, 200)}`;
      quota = q; hook = h; menus = m; defaultMenuId = d;
    }

    const [rules, followers, unfollowed, logs, inbound, outbound, matched] = await Promise.all([
      (prisma as any).lineReplyRule.findMany({ orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] }),
      (prisma as any).lineFollower.count({ where: { followed: true } }),
      (prisma as any).lineFollower.count({ where: { followed: false } }),
      (prisma as any).lineMessageLog.findMany({ orderBy: { createdAt: 'desc' }, take: 40 }),
      (prisma as any).lineMessageLog.count(),
      (prisma as any).lineMessageLog.count({ where: { direction: 'OUT' } }),
      (prisma as any).lineMessageLog.count({ where: { matchKind: 'rule' } }),
    ]);

    return NextResponse.json({
      ok: true,
      env,
      expectedWebhookUrl: webhookUrl(),
      oa,
      quota,
      webhook: hook,
      richMenus: menus,
      defaultRichMenuId: defaultMenuId || cfg.defaultRichMenuId || null,
      sizes: RICHMENU_SIZES,
      config: cfg,
      rules,
      stats: {
        followers, unfollowed, logs: inbound, replies: outbound, matchedRules: matched,
        welcomePreview: previewText(cfg.welcomeMessages),
      },
      logs,
      lineError,
    });
  } catch (e: any) {
    return fail(e, 'โหลดสถานะ LINE OA ไม่สำเร็จ');
  }
}

export async function PUT(req: NextRequest) {
  const a = await requireLineAdmin(req);
  if (!a.ok) return a.res;
  try {
    const body = await req.json().catch(() => ({}));
    const saved: any = await saveConfig(body || {}, a.via === 'session' ? a.userId : null);
    return NextResponse.json({ ok: true, config: saved });
  } catch (e: any) {
    return fail(e, 'บันทึกตั้งค่าไม่สำเร็จ');
  }
}
