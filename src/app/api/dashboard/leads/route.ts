import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeLeadApi } from '@/lib/leadApiAuth';
import { levelOf, levelKey, fmtProspectName, startOfDayBkk } from '@/lib/leadNurture';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/dashboard/leads — รายชื่อผู้สนใจ + คะแนน/ระดับ + ความสนใจ + คลิปที่แนะนำ
//
// ผู้เรียก:
//   • หน้า /dashboard/leads (คุกกี้ token)                     → ต้องล็อกอิน
//   • n8n WF06 (GET /api/dashboard/leads, Bearer CRON_SECRET) → คัด lead คะแนน ≥ 70
//
// ใช้ (prisma as any) กับโมเดลใหม่ (EngagementScore/LeadInterest/ChannelPreference/
// AgentTask/Unsubscribe/Recommendation/FollowUp) เพราะยังไม่ถูก generate
//
// ⚠️ ต้องเพิ่ม '/api/dashboard/leads' ใน PUBLIC_API ของ src/middleware.ts (ดู /src/lib/leadApiAuth.ts)
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  if (!auth.ok) return auth.res;

  try {
    const db = prisma as any;
    const url = new URL(req.url);
    const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit') || 200) || 200));

    const prospects: any[] = await db.prospect.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { consents: { orderBy: { createdAt: 'desc' }, take: 6 } },
    });

    const ids: string[] = prospects.map((p) => p.id);
    if (!ids.length) {
      return NextResponse.json({ ok: true, leads: [], data: [], items: [], total: 0, stats: { total: 0, high: 0, interested: 0, warm: 0, low: 0, consent: 0 }, via: auth.via });
    }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);

    const [scores, interests, prefs, unsubs, tasks, sentFollowUps, recs, callbackActs] = await Promise.all([
      db.engagementScore.findMany({ where: { prospectId: { in: ids } } }).catch(() => []),
      db.leadInterest.findMany({ where: { prospectId: { in: ids } }, orderBy: { weight: 'desc' } }).catch(() => []),
      db.channelPreference.findMany({ where: { prospectId: { in: ids } } }).catch(() => []),
      db.unsubscribe.findMany({ where: { prospectId: { in: ids } }, select: { prospectId: true } }).catch(() => []),
      db.agentTask.findMany({ where: { prospectId: { in: ids }, status: { in: ['open', 'in_progress'] } }, select: { prospectId: true } }).catch(() => []),
      db.followUp.findMany({ where: { prospectId: { in: ids }, status: 'sent', sentAt: { gte: weekAgo } }, select: { prospectId: true, sentAt: true } }).catch(() => []),
      db.recommendation.findMany({ where: { prospectId: { in: ids }, status: { in: ['sent', 'viewed'] } }, select: { prospectId: true, videoId: true } }).catch(() => []),
      db.prospectActivity.findMany({ where: { prospectId: { in: ids }, content: { contains: 'ติดต่อกลับ' } }, select: { prospectId: true } }).catch(() => []),
    ]);

    const scoreMap = new Map<string, any>(scores.map((s: any) => [s.prospectId, s]));
    const prefMap = new Map<string, any>(prefs.map((p: any) => [p.prospectId, p]));
    const unsubSet = new Set<string>(unsubs.map((u: any) => u.prospectId).filter(Boolean));
    const taskSet = new Set<string>(tasks.map((t: any) => t.prospectId));
    const callbackSet = new Set<string>(callbackActs.map((a: any) => a.prospectId));

    const interestMap = new Map<string, any[]>();
    for (const it of interests) {
      const arr = interestMap.get(it.prospectId) || [];
      arr.push(it);
      interestMap.set(it.prospectId, arr);
    }
    const lastSentMap = new Map<string, string[]>();
    for (const r of recs) {
      const arr = lastSentMap.get(r.prospectId) || [];
      if (r.videoId) arr.push(r.videoId);
      lastSentMap.set(r.prospectId, arr);
    }

    const todayStart = startOfDayBkk(now);
    const sentTodayMap = new Map<string, number>();
    const sentWeekMap = new Map<string, number>();
    for (const s of sentFollowUps) {
      const at = new Date(s.sentAt).getTime();
      if (at >= todayStart.getTime()) sentTodayMap.set(s.prospectId, (sentTodayMap.get(s.prospectId) || 0) + 1);
      if (at >= weekAgo.getTime()) sentWeekMap.set(s.prospectId, (sentWeekMap.get(s.prospectId) || 0) + 1);
    }

    const stats = { total: 0, high: 0, interested: 0, warm: 0, low: 0, consent: 0 };

    const leads = prospects.map((p) => {
      const sc = scoreMap.get(p.id) || null;
      const pref = prefMap.get(p.id) || null;
      const ints = (interestMap.get(p.id) || []).map((i: any) => ({ topic: i.topic, weight: i.weight, source: i.source }));
      const score = Number(sc?.score ?? p.leadScore ?? 0) || 0;
      const level = (sc?.level as string) || levelOf(score);
      const consent = p.consentStatus === 'granted' || (p.consents || []).some((c: any) => String(c.type).toUpperCase() === 'PDPA' && c.granted === true);
      const consentMarketing = (p.consents || []).some((c: any) => String(c.type).toUpperCase() === 'MARKETING' && c.granted === true);
      const preferred = pref?.preferred || null;

      stats.total++;
      const lk = levelKey(level);
      if (lk === 'HIGH') stats.high++;
      else if (lk === 'INTERESTED') stats.interested++;
      else if (lk === 'WARM') stats.warm++;
      else stats.low++;
      if (consent) stats.consent++;

      const sentIds = lastSentMap.get(p.id) || [];
      return {
        // ตัวตน
        id: p.id,
        prospectId: p.id,            // n8n ใช้ค่านี้ส่งกลับเข้า /api/agent-tasks
        prospectCode: p.prospectId,  // P-XXXXXX (รหัสที่คนเห็น)
        // ข้อมูลติดต่อ
        name: fmtProspectName(p),
        firstName: p.firstName,
        lastName: p.lastName,
        nickname: p.nickname || null,
        phone: pref?.phone || p.phone || null,
        email: pref?.emailAddress || p.email || null,
        lineId: pref?.lineUserId || null,
        province: p.province || null,
        occupation: p.occupation || null,
        ageRange: p.ageRange || null,
        interest: p.interest || null,
        // ความสนใจ
        interests: ints,
        topics: ints.map((i) => i.topic),
        // คะแนน / ระดับ
        leadScore: p.leadScore ?? 0,
        score,
        engagementScore: score,
        level,                       // HIGH_INTENT | INTERESTED | WARM | LOW (ค่าจริงในสคีมา)
        levelKey: lk,                // HIGH | INTERESTED | WARM | LOW (แบบที่หน้าเว็บใช้)
        // สถานะ
        status: p.status,
        stage: p.status,
        consent: Boolean(consent),
        consentStatus: p.consentStatus || null,
        consentMarketing: Boolean(consentMarketing),
        // ช่องทาง
        preferredChannel: preferred,
        channel: preferred,
        channelPreference: {
          line: !!pref?.line, email: !!pref?.email, sms: !!pref?.sms,
          web_push: !!pref?.webPush, webPush: !!pref?.webPush,
        },
        // การส่ง / การยกระดับ (n8n ใช้ตัดสินใจ)
        sentToday: sentTodayMap.get(p.id) || 0,
        sentThisWeek: sentWeekMap.get(p.id) || 0,
        lastSentVideoIds: sentIds,
        sentVideoIds: sentIds,
        unsubscribed: unsubSet.has(p.id),
        optOut: unsubSet.has(p.id),
        hasOpenTask: taskSet.has(p.id),
        escalated: taskSet.has(p.id) && score >= 70,
        contactRequested: callbackSet.has(p.id),
        // เวลา
        lastContactAt: p.lastContactAt || null,
        nextFollowUpAt: p.nextFollowUpAt || null,
        lastEventAt: sc?.lastEventAt || null,
        eventCount: sc?.eventCount ?? null,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    });

    return NextResponse.json({
      ok: true,
      leads,
      data: leads,
      items: leads,
      total: leads.length,
      stats,
      caps: null,
      generatedAt: now.toISOString(),
      via: auth.via,
    });
  } catch (e: any) {
    console.error('[dashboard/leads] error', e?.message);
    return NextResponse.json({ ok: false, error: 'โหลดรายชื่อผู้สนใจไม่สำเร็จ' }, { status: 500 });
  }
}
