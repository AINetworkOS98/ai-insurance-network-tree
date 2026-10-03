import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeLeadApi } from '@/lib/leadApiAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/activity/radar?minutes=30
//   เรดาร์กิจกรรมสมาชิก/ผู้สนใจ สำหรับ workflow n8n "Member Interest Radar"
//
// หลักการ (ตามสเปกหมวด 5, 6, 13, 14, 27):
//   • คะแนนคิดจาก "พฤติกรรมจริงที่บันทึกไว้" เท่านั้น — ไม่คาดเดาจากข้อมูลส่วนตัว
//   • กันการนับซ้ำผิดปกติ: ทุกสัญญาณมีเพดานต่อ 1 รอบ (refresh รัว ๆ ไม่ทำให้คะแนนพุ่ง)
//   • ไม่ส่งอีเมล/ชื่อเต็มออกไป — ชื่อถูกปิด (mask) และอีเมลไม่ถูกส่งออกจากเส้นทางนี้เลย
//   • อ่านอย่างเดียว ไม่มีการเขียนข้อมูล
//   • สิทธิ์: session ของสมาชิก หรือ Authorization: Bearer CRON_SECRET (n8n)
// ─────────────────────────────────────────────────────────────────────────────

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));

// ชื่อที่แสดง: เก็บอักษรแรกไว้เท่านั้น (PDPA)
function maskName(raw?: string | null) {
  const t = String(raw || '').trim();
  if (!t) return 'สมาชิก/ผู้สนใจ';
  const first = t[0];
  return `${first}***`;
}

function levelOf(score: number) {
  if (score >= 80) return { code: 'VERY_HIGH', th: 'สนใจสูงมาก', en: 'Very High Interest' };
  if (score >= 60) return { code: 'HIGH', th: 'สนใจสูง', en: 'High Interest' };
  if (score >= 40) return { code: 'MODERATE', th: 'สนใจปานกลาง', en: 'Moderate Interest' };
  if (score >= 20) return { code: 'LOW', th: 'สนใจน้อย', en: 'Low Interest' };
  return { code: 'VERY_LOW', th: 'สนใจน้อยมาก', en: 'Very Low Interest' };
}

function fmtDuration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = s % 60;
  if (h) return `${h} ชม. ${m} นาที`;
  if (m) return `${m} นาที ${r} วินาที`;
  return `${r} วินาที`;
}

const PAGE_TH: Record<string, string> = {
  '/network/1x5-autopilot': '1×5 Autopilot',
  '/network-simulator': 'โครงข่าย 1 แตก 5',
  '/financial-freedom': 'อิสรภาพทางการเงิน',
  '/prospects': 'ลีด/ผู้สนใจ',
};

export async function GET(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  if (!auth.ok) return auth.res;

  try {
    const url = new URL(req.url);
    const minutes = clamp(Number(url.searchParams.get('minutes') || 30), 5, 24 * 60);
    const minScore = clamp(Number(url.searchParams.get('minScore') || 40), 0, 100);
    const since = new Date(Date.now() - minutes * 60 * 1000);
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const db = prisma as any;

    const events = await db.visitorEvent
      .findMany({
        where: { at: { gte: since } },
        select: {
          visitorId: true, sessionId: true, type: true, pagePath: true,
          at: true, watchPct: true, prospectId: true,
        },
        orderBy: { at: 'asc' },
      })
      .catch(() => [] as any[]);

    if (!events.length) {
      return NextResponse.json(
        {
          ok: true, at: new Date().toISOString(), since: since.toISOString(), minutes,
          scanned: { visitors: 0, events: 0 }, members: [],
          note: `ไม่พบกิจกรรมในช่วง ${minutes} นาทีที่ผ่านมา`,
        },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    const byVisitor = new Map<string, any[]>();
    for (const e of events) {
      const k = String(e.visitorId);
      if (!byVisitor.has(k)) byVisitor.set(k, []);
      byVisitor.get(k)!.push(e);
    }

    const visitorRows = await db.visitor
      .findMany({
        where: { id: { in: [...byVisitor.keys()] } },
        select: { id: true, visitorId: true, totalVisits: true, consentStatus: true, prospectId: true, device: true },
      })
      .catch(() => [] as any[]);
    const vmap = new Map<string, any>(visitorRows.map((v: any) => [String(v.id), v]));

    // คะแนนความสนใจล่าสุดที่ระบบเคยคำนวณไว้ (ถ้ามี) — ใช้ประกอบ ไม่ใช่แทน
    const prospectIds = visitorRows.map((v: any) => v.prospectId).filter(Boolean) as string[];
    const prospects = prospectIds.length
      ? await prisma.prospect
          .findMany({
            where: { id: { in: prospectIds } },
            select: { id: true, firstName: true, email: true, consentStatus: true, leadScore: true, status: true },
          })
          .catch(() => [] as any[])
      : [];
    const pmap = new Map<string, any>(prospects.map((p: any) => [String(p.id), p]));

    const alreadyReported = await db.notificationLog
      .findMany({
        where: { type: 'activity.report', createdAt: { gte: dayAgo } },
        select: { target: true },
      })
      .catch(() => [] as any[]);
    const reportedSet = new Set(alreadyReported.map((r: any) => String(r.target)));

    const out: any[] = [];

    for (const [visitorKey, evs] of byVisitor.entries()) {
      const v = vmap.get(visitorKey) || null;
      const p = v?.prospectId ? pmap.get(String(v.prospectId)) || null : null;

      const types: Record<string, number> = {};
      for (const e of evs) types[e.type] = (types[e.type] || 0) + 1;

      const first = new Date(evs[0].at).getTime();
      const last = new Date(evs[evs.length - 1].at).getTime();
      const durationSec = Math.max(0, Math.round((last - first) / 1000));
      const sessions = new Set(evs.map((e) => e.sessionId).filter(Boolean));
      const maxWatch = Math.max(0, ...evs.map((e) => Number(e.watchPct || 0)));
      const pages = [...new Set(evs.map((e) => String(e.pagePath || '')).filter(Boolean))];
      const mainPage = pages.includes('/network/1x5-autopilot')
        ? '/network/1x5-autopilot'
        : pages[0] || '';

      // ── คิดคะแนนจากสัญญาณจริง (มีเพดานต่อรอบ กันคะแนนเฟ้อจากการรีเฟรช) ──
      const breakdown: Record<string, number> = {};
      const add = (key: string, points: number) => {
        if (points > 0) breakdown[key] = (breakdown[key] || 0) + points;
      };
      add('page_view', Math.min(types.page_view || 0, 3) * 10);
      if (durationSec >= 240) add('dwell_4min', 25);
      else if (durationSec >= 60) add('dwell_1min', 15);
      add('cta_click', Math.min(types.cta_click || 0, 3) * 20);
      add('form_open', Math.min(types.form_open || 0, 1) * 10);
      add('form_submit', Math.min(types.form_submit || 0, 1) * 30);
      add('callback_request', Math.min(types.callback_request || 0, 1) * 30);
      add('topic_select', Math.min(types.topic_select || 0, 1) * 15);
      if (maxWatch >= 80) add('video_watch_80', 15);
      else if (maxWatch >= 50) add('video_watch_50', 10);
      if (types.video_complete) add('video_complete', 10);
      add('return_visit', Math.min(types.return_visit || 0, 1) * 15);
      if ((v?.totalVisits || 0) >= 3) add('many_sessions', 10);

      const score = clamp(Object.values(breakdown).reduce((a, b) => a + b, 0));
      const level = levelOf(score);

      // ── พฤติกรรมสำคัญ + สรุป (เขียนจากเหตุการณ์จริงเท่านั้น) ──
      const keyBehaviors: string[] = [];
      if (mainPage) keyBehaviors.push(`เปิดหน้า ${PAGE_TH[mainPage] || mainPage}`);
      if (types.page_view) keyBehaviors.push(`เปิดดู ${types.page_view} ครั้งในรอบนี้`);
      if (durationSec >= 60) keyBehaviors.push(`อยู่ใช้งานต่อเนื่อง ${fmtDuration(durationSec)}`);
      if (types.cta_click) keyBehaviors.push(`กดปุ่มชวนทำต่อ (CTA) ${types.cta_click} ครั้ง`);
      if (maxWatch >= 50) keyBehaviors.push(`ดูคลิปต่อเนื่องถึง ${Math.round(maxWatch)}%`);
      if (types.form_open) keyBehaviors.push('เปิดฟอร์มกรอกข้อมูล');
      if (types.form_submit) keyBehaviors.push('ส่งฟอร์มในระบบ');
      if (types.topic_select) keyBehaviors.push('เลือกหัวข้อที่สนใจ');
      if (types.return_visit) keyBehaviors.push('กลับมาเยี่ยมชมซ้ำ');
      if (!keyBehaviors.length) keyBehaviors.push('เพิ่งเริ่มมีกิจกรรมในระบบ');

      const parts: string[] = [];
      parts.push(`มีกิจกรรม ${evs.length} ครั้ง${sessions.size ? ` ใน ${sessions.size} ช่วงการใช้งาน` : ''}`);
      if (durationSec >= 60) parts.push(`รวมเวลาต่อเนื่อง ${fmtDuration(durationSec)}`);
      if (types.cta_click) parts.push(`กด CTA ${types.cta_click} ครั้ง`);
      if (types.return_visit) parts.push('กลับมาใช้งานซ้ำ');
      const aiSummary = `${parts.join(' · ')} — มีพฤติกรรมที่บ่งชี้ถึง Engagement ${level.th} (จากเหตุการณ์จริงที่บันทึกไว้ ไม่ได้คาดเดาความต้องการซื้อ)`;

      const emailEligible = !!(p && p.email && String(p.consentStatus || '').toLowerCase() === 'granted');
      const idKey = String(p?.id || v?.visitorId || visitorKey);

      out.push({
        visitorKey: String(v?.visitorId || visitorKey),
        displayName: p ? maskName(p.firstName) : 'ผู้เข้าชม (ยังไม่ระบุตัวตน)',
        identified: !!p,
        prospectId: p?.id || null,
        consentStatus: v?.consentStatus || 'unknown',
        emailEligible,
        reportedIn24h: reportedSet.has(idKey) || reportedSet.has(String(v?.visitorId || '')),
        pagePath: mainPage,
        sessions: sessions.size,
        events: evs.length,
        durationSec,
        durationText: fmtDuration(durationSec),
        pageViews: types.page_view || 0,
        ctaClicks: types.cta_click || 0,
        maxWatchPct: Math.round(maxWatch),
        returnVisit: !!types.return_visit || (v?.totalVisits || 0) > 1,
        firstAt: new Date(first).toISOString(),
        lastAt: new Date(last).toISOString(),
        interestScore: score,
        interestLevel: level.th,
        interestLevelCode: level.code,
        breakdown,
        keyBehaviors,
        aiSummary,
      });
    }

    const members = out
      .filter((m) => m.interestScore >= minScore)
      .sort((a, b) => b.interestScore - a.interestScore)
      .slice(0, 25);

    return NextResponse.json(
      {
        ok: true,
        at: new Date().toISOString(),
        since: since.toISOString(),
        minutes,
        minScore,
        scanned: { visitors: byVisitor.size, events: events.length },
        candidates: members.length,
        members,
        scale: '0–19 สนใจน้อยมาก · 20–39 น้อย · 40–59 ปานกลาง · 60–79 สูง · 80–100 สูงมาก',
        note: 'คะแนนคิดจากพฤติกรรมจริงที่บันทึกไว้ · ชื่อถูกปิด (mask) · ไม่มีการส่งอีเมลหรือข้อมูลส่วนบุคคลออกจากเส้นทางนี้',
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: 'radar_failed', message: String(e?.message || e).slice(0, 300) },
      { status: 500 },
    );
  }
}
