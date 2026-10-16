// ─────────────────────────────────────────────────────────────────────────────
// /api/admin/line-oa/simulate — กล่องทดลอง: พิมพ์ข้อความ แล้วดูว่า "ระบบจะตอบอะไร"
//   ใช้เครื่องยนต์ตัวเดียวกับ webhook จริง (decideReply) แต่ไม่ส่งออก LINE จริง
//   POST { text }                → ตรวจเส้นทางตอบกลับอัตโนมัติ
//   POST { preview: 'welcome' }  → ดูข้อความต้อนรับ (หรือ greet/menu/fallback/offline)
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireLineAdmin, fail } from '@/lib/lineOaAdmin';
import {
  loadConfig, decideReply, normalizeMessages, isOfflineNow, ruleMatches, previewText,
  type LineRuleLike,
} from '@/lib/lineOa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const a = await requireLineAdmin(req);
  if (!a.ok) return a.res;
  try {
    const body = await req.json().catch(() => ({}));
    const cfg: any = await loadConfig();

    const preview = String(body.preview || '');
    if (preview) {
      const map: Record<string, any> = {
        welcome: cfg.welcomeMessages, greet: cfg.greetMessages, menu: cfg.menuMessages,
        fallback: cfg.fallbackMessages, offline: cfg.offlineMessages,
      };
      if (!(preview in map)) return NextResponse.json({ ok: false, error: 'preview ต้องเป็น welcome|greet|menu|fallback|offline' }, { status: 400 });
      const messages = normalizeMessages(map[preview]);
      return NextResponse.json({ ok: true, preview, messages, text: previewText(messages) });
    }

    const text = String(body.text || '');
    const rules = (await (prisma as any).lineReplyRule.findMany({ orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] })) as LineRuleLike[];
    const decision = decideReply(text, rules, cfg);
    const nearMisses = rules
      .filter((r) => r.enabled && !ruleMatches(text, r))
      .slice(0, 0); // สงวนไว้ขยาย: แสดงกฎที่ใกล้เคียง
    return NextResponse.json({
      ok: true,
      input: text,
      kind: decision.kind,
      rule: decision.rule ? { id: decision.rule.id, name: decision.rule.name, priority: decision.rule.priority } : null,
      note: decision.note || null,
      offlineNow: isOfflineNow(cfg),
      autoReplyEnabled: cfg.autoReplyEnabled,
      menuKeywords: cfg.menuKeywords,
      messages: decision.messages,
      text: previewText(decision.messages),
      textPlain: decision.messages.filter((m: any) => m.type === 'text').map((m: any) => m.text).join('\n\n'),
      nearMisses,
    });
  } catch (e: any) { return fail(e, 'ทดลองไม่สำเร็จ'); }
}
