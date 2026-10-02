import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeLeadApi } from '@/lib/leadApiAuth';
import {
  parseWindowMs, startOfDayBkk, fmtProspectName, FREQ_CAP, latestConsent,
} from '@/lib/leadNurture';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/followup/due — รายการติดตาม (FollowUp) ที่ถึงกำหนดส่ง สำหรับ n8n WF05
//   query: window (ค่าเริ่มต้น 30m — รับ 30m | 1h | 24h | 2d) · limit (ค่าเริ่มต้น 50)
//
// n8n WF05 อ่าน: res.followUps || res.items || res.data
//   แต่ละรายการต้องมี: followUpId, prospectId, name, dayOffset, channel,
//   lineUserId, phone, email, topic, interests, lastContactAt, sentToday,
//   sentThisWeek, scheduledAt, consentMarketing, unsubscribed/optOut
//   (WF05 ตรวจ ①consent ②opt-out ③frequency cap ④topic ⑤ยังไม่เคยส่งคลิปก่อนส่งจริง)
//
// ⚠️ ต้องเพิ่ม '/api/followup/due' ใน PUBLIC_API ของ src/middleware.ts (ดู /src/lib/leadApiAuth.ts)
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  if (!auth.ok) return auth.res;

  try {
    const db = prisma as any;
    const url = new URL(req.url);
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || 50) || 50));
    const windowMs = parseWindowMs(url.searchParams.get('window'), 30 * 60 * 1000);

    const now = new Date();
    const from = new Date(now.getTime() - windowMs);

    const followUps: any[] = await db.followUp.findMany({
      where: { status: 'scheduled', scheduledAt: { lte: now, gte: from } },
      orderBy: { scheduledAt: 'asc' },
      take: limit,
    }).catch(() => []);

    if (!followUps.length) {
      return NextResponse.json({ ok: true, followUps: [], items: [], data: [], due: 0, window: url.searchParams.get('window') || '30m', at: now.toISOString(), via: auth.via });
    }

    const ids: string[] = Array.from(new Set(followUps.map((f) => f.prospectId).filter(Boolean)));

    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const todayStart = startOfDayBkk(now);

    const [prospects, prefs, interests, consents, unsubs, sentFollowUps] = await Promise.all([
      db.prospect.findMany({ where: { id: { in: ids } } }).catch(() => []),
      db.channelPreference.findMany({ where: { prospectId: { in: ids } } }).catch(() => []),
      db.leadInterest.findMany({ where: { prospectId: { in: ids } }, orderBy: { weight: 'desc' } }).catch(() => []),
      db.prospectConsent.findMany({ where: { prospectId: { in: ids }, type: 'MARKETING' }, orderBy: { createdAt: 'desc' } }).catch(() => []),
      db.unsubscribe.findMany({ where: { prospectId: { in: ids } }, select: { prospectId: true, scope: true } }).catch(() => []),
      db.followUp.findMany({ where: { prospectId: { in: ids }, status: 'sent', sentAt: { gte: weekAgo } }, select: { prospectId: true, sentAt: true } }).catch(() => []),
    ]);

    const prospectMap = new Map<string, any>(prospects.map((p: any) => [p.id, p]));
    const prefMap = new Map<string, any>(prefs.map((p: any) => [p.prospectId, p]));
    const unsubSet = new Set<string>(unsubs.map((u: any) => u.prospectId).filter(Boolean));
    const consentMap = new Map<string, any[]>();
    for (const c of consents) {
      const arr = consentMap.get(c.prospectId) || [];
      arr.push(c);
      consentMap.set(c.prospectId, arr);
    }
    const interestMap = new Map<string, string[]>();
    for (const it of interests) {
      const arr = interestMap.get(it.prospectId) || [];
      arr.push(it.topic);
      interestMap.set(it.prospectId, arr);
    }
    const sentTodayMap = new Map<string, number>();
    const sentWeekMap = new Map<string, number>();
    for (const s of sentFollowUps) {
      const at = new Date(s.sentAt).getTime();
      if (at >= todayStart.getTime()) sentTodayMap.set(s.prospectId, (sentTodayMap.get(s.prospectId) || 0) + 1);
      if (at >= weekAgo.getTime()) sentWeekMap.set(s.prospectId, (sentWeekMap.get(s.prospectId) || 0) + 1);
    }

    const items = followUps.map((f) => {
      const p = prospectMap.get(f.prospectId) || {};
      const pref = prefMap.get(f.prospectId) || {};
      const consentMarketing = latestConsent(consentMap.get(f.prospectId) || [], 'MARKETING');
      const topics = interestMap.get(f.prospectId) || (p.interest ? String(p.interest).split(/[,|]/).map((t) => t.trim()).filter(Boolean) : []);
      const optedOut = unsubSet.has(f.prospectId);
      return {
        followUpId: f.id,
        id: f.id,
        prospectId: f.prospectId,
        name: fmtProspectName(p),
        stepKey: f.stepKey || null,
        dayOffset: f.dayOffset ?? null,
        channel: f.channel || 'email',
        // ช่องทางติดต่อจริง (WF05 เลือกใช้)
        lineUserId: pref.lineUserId || null,
        phone: pref.phone || p.phone || null,
        email: pref.emailAddress || p.email || null,
        preferredChannel: pref.preferred || null,
        topic: f.topic || topics[0] || null,
        interests: topics,
        videoId: f.videoId || null,
        message: f.message || null,
        scheduledAt: f.scheduledAt || null,
        lastContactAt: p.lastContactAt || f.sentAt || null,
        sentToday: sentTodayMap.get(f.prospectId) || 0,
        sentThisWeek: sentWeekMap.get(f.prospectId) || 0,
        caps: FREQ_CAP,
        // ด่าน ①consent ②opt-out (WF05 ตรวจซ้ำก่อนส่งทุกครั้ง)
        consentMarketing: Boolean(consentMarketing),
        consent: Boolean(consentMarketing),
        unsubscribed: optedOut,
        optOut: optedOut,
        doNotContact: optedOut,
        unsubscribeUrl: `https://ai-insurance-network-tree.vercel.app/unsubscribe?p=${f.prospectId}`,
      };
    });

    return NextResponse.json({
      ok: true,
      followUps: items,
      items,
      data: items,
      due: items.length,
      window: url.searchParams.get('window') || '30m',
      from: from.toISOString(),
      at: now.toISOString(),
      via: auth.via,
    });
  } catch (e: any) {
    console.error('[followup/due] error', e?.message);
    return NextResponse.json({ ok: false, error: 'โหลดรายการติดตามไม่สำเร็จ' }, { status: 500 });
  }
}
