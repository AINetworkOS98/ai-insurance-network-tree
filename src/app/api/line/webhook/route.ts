// ─────────────────────────────────────────────────────────────────────────────
// POST /api/line/webhook — รับ event จาก LINE (Messaging API)
//   • ตรวจลายเซ็น X-Line-Signature ด้วย LINE_CHANNEL_SECRET (ไม่ผ่าน = 403 ทันที)
//   • follow   → บันทึกผู้ติดตาม + ส่ง "ข้อความต้อนรับ"
//   • message  → ตอบกลับอัตโนมัติตามกฎ (ไม่กินโควตา push)
//   • postback → ใช้เส้นทางเดียวกับข้อความ
//   • unfollow → ปิดสถานะผู้ติดตาม
// หมายเหตุ: ต้องอยู่ใน PUBLIC_API ของ middleware (LINE ไม่มี cookie/Bearer ของเรา)
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import {
  verifyLineSignature, lineEnvStatus, loadConfig, decideReply, replyToLine, normalizeMessages,
  getLineProfile, upsertFollower, touchFollowerMessage, logLine, setUserRichMenu, previewText,
  type LineRuleLike,
} from '@/lib/lineOa';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const env = lineEnvStatus();
  return NextResponse.json({ ok: true, service: 'line-oa-webhook', ready: env.ready, missing: env.missing });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  const signature = req.headers.get('x-line-signature');
  if (!verifyLineSignature(raw, signature)) {
    return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 403 });
  }

  let body: any = {};
  try { body = JSON.parse(raw || '{}'); } catch { return NextResponse.json({ ok: true, ignored: true }); }
  const events: any[] = Array.isArray(body.events) ? body.events : [];
  const env = lineEnvStatus();
  const results: any[] = [];

  for (const ev of events) {
    try {
      const userId: string = ev?.source?.userId || '';
      const replyToken: string | undefined = ev?.replyToken;

      if (ev.type === 'follow') {
        const profile = userId ? await getLineProfile(userId) : null;
        await upsertFollower(userId, {
          followed: true, source: 'follow', unfollowedAt: null, followedAt: new Date(),
          displayName: profile?.displayName || null, pictureUrl: profile?.pictureUrl || null,
          statusMessage: profile?.statusMessage || null,
        });
        const cfg = await loadConfig();
        let sent = false;
        if (cfg.welcomeEnabled && replyToken) {
          const cfgAny: any = cfg;
          const msgs = await welcomeMessages(cfgAny);
          if (msgs.length) {
            const r = await replyToLine(replyToken, msgs);
            sent = r.ok;
            await logLine({ direction: 'OUT', lineUserId: userId, text: previewText(msgs), matchKind: 'welcome', ok: r.ok, error: r.error || null });
          }
        }
        results.push({ type: 'follow', userId, welcomed: sent });
        continue;
      }

      if (ev.type === 'unfollow') {
        await upsertFollower(userId, { followed: false, unfollowedAt: new Date() });
        results.push({ type: 'unfollow', userId });
        continue;
      }

      if (ev.type === 'message') {
        const m = ev.message || {};
        const text = m.type === 'text' ? String(m.text || '') : '';
        await logLine({
          direction: 'IN', lineUserId: userId, type: m.type || 'text',
          text: text || `[${m.type || 'unknown'}]`, matchKind: null,
        });
        const profile = userId ? await getLineProfile(userId) : null;
        if (userId) await touchFollowerMessage(userId, profile);

        // ข้อความที่ไม่ใช่ตัวอักษร (รูป/ไฟล์/สติกเกอร์) — แจ้งว่าทีมงานจะติดต่อกลับ และเก็บเข้าระบบ
        const cfg: any = await loadConfig();
        const rules = (await (prisma as any).lineReplyRule.findMany({ where: { enabled: true }, orderBy: { priority: 'asc' } })) as LineRuleLike[];

        let decision = decideReply(text, rules, cfg);
        if (!text && decision.kind === 'none') {
          const notice = cfg.fallbackEnabled ? cfg.fallbackMessages : cfg.welcomeMessages;
          decision = { kind: 'fallback', messages: (notice || []).slice(0, 2), note: 'ข้อความชนิดอื่น' } as any;
        }

        if (decision.messages.length && replyToken) {
          const r = await replyToLine(replyToken, decision.messages);
          await logLine({
            direction: 'OUT', lineUserId: userId, text: previewText(decision.messages),
            matchKind: decision.kind, ruleId: decision.rule?.id || null, ruleName: decision.rule?.name || null,
            ok: r.ok, error: r.error || null,
          });
          if (decision.rule) {
            await (prisma as any).lineReplyRule.update({
              where: { id: decision.rule.id },
              data: { hits: { increment: 1 }, lastHitAt: new Date() },
            }).catch(() => null);
            if (decision.rule.tag && userId) await upsertFollower(userId, { tag: decision.rule.tag });
            if (decision.rule.richMenuId && userId) await setUserRichMenu(userId, decision.rule.richMenuId);
          }
          results.push({ type: 'message', userId, matched: decision.kind, rule: decision.rule?.name || null, replied: r.ok });
        } else {
          results.push({ type: 'message', userId, matched: decision.kind, replied: false, note: 'ไม่มีข้อความตอบกลับ/ไม่มี replyToken' });
        }
        continue;
      }

      if (ev.type === 'postback') {
        const data = String(ev?.postback?.data || '');
        const cfg: any = await loadConfig();
        const rules = (await (prisma as any).lineReplyRule.findMany({ where: { enabled: true }, orderBy: { priority: 'asc' } })) as LineRuleLike[];
        await logLine({ direction: 'IN', lineUserId: userId, text: `[postback] ${data}`, matchKind: null });
        const decision = decideReply(data, rules, cfg);
        if (replyToken && decision.messages.length) {
          const r = await replyToLine(replyToken, decision.messages);
          await logLine({
            direction: 'OUT', lineUserId: userId, text: previewText(decision.messages),
            matchKind: decision.kind, ruleId: decision.rule?.id || null, ruleName: decision.rule?.name || null,
            ok: r.ok, error: r.error || null,
          });
        }
        results.push({ type: 'postback', userId, matched: decision.kind });
        continue;
      }

      results.push({ type: ev.type || 'unknown', skipped: true });
    } catch (e: any) {
      await logLine({ direction: 'OUT', lineUserId: ev?.source?.userId || null, text: '[webhook error]', ok: false, error: e?.message || 'error' });
      results.push({ type: ev?.type || 'unknown', error: e?.message || 'error' });
    }
  }

  return NextResponse.json({ ok: true, ready: env.ready, processed: results.length, results });
}

/** ข้อความต้อนรับของผู้ติดตามใหม่ */
async function welcomeMessages(cfg: any) {
  return normalizeMessages(cfg?.welcomeMessages);
}
