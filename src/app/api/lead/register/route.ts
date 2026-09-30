import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createHash, randomUUID } from 'node:crypto';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/lead/register — ลงทะเบียน "ผู้สนใจ" จากกล่อง Lead บนเว็บ (ไม่ต้องล็อกอิน)
// GET  /api/lead/register — health/สเปกสั้น ๆ (ไม่แตะ DB)
//
// สเปก: docs/lead-nurturing-plan.md หมวด 2 (API /api/lead/register) + หมวด 3 (เส้นทาง WF02)
//       + หมวด 5 (PDPA: ต้องยินยอมก่อนเก็บ, ถอนได้ทุกเมื่อ)
//
// ⚠️ ต้องเพิ่ม '/api/lead' ใน PUBLIC_API ของ src/middleware.ts ก่อน ไม่งั้น middleware
//    จะตอบ 401 "กรุณาเข้าสู่ระบบ" ทุกครั้ง (middleware บล็อก /api/* ที่ไม่อยู่ในลิสต์)
//
// สิ่งที่ route นี้ทำ (ตาม WF02 ข้อ "validate → check consent → create lead → profile →
// initial interest → welcome message"):
//   ① validate + rate limit   ② เช็ค consent (PDPA ต้องยินยอม, MARKETING แยก)   ③ เช็ค Unsubscribe
//   ④ สร้าง/อัปเดต Prospect (กันซ้ำด้วยเบอร์/อีเมล)   ⑤ ProspectConsent + ChannelPreference
//   ⑥ LeadInterest เริ่มต้น + EngagementScore   ⑦ ผูก Visitor → Prospect (ดึง event ย้อนหลังมาด้วย)
//   ⑧ EventOutbox + ส่งต่อ n8n WF02 (ข้อความต้อนรับส่งที่ n8n ไม่ใช่ที่นี่)
//
// ใช้ (prisma as any) เพราะโมเดลใหม่ (Visitor/EngagementScore/LeadInterest/ChannelPreference/
// AgentTask/Unsubscribe) ยังไม่ถูก generate จนกว่าจะต่อ schema + prisma generate
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CONSENT_VERSION_DEFAULT = '1.0';
const DEFAULT_LEAD_SOURCE = 'lead_box_web';
const MAX_INTERESTS = 8;
const POINTS_FORM_SUBMIT = 20;   // แผนหมวด 4: form_submit +20
const POINTS_TOPIC = 10;         // แผนหมวด 4: เลือกหัวข้อ +10 ต่อหัวข้อ (นับไม่เกิน 3)
const POINTS_CALLBACK = 30;      // แผนหมวด 4: ขอให้ติดต่อกลับ +30
const MAX_TOPIC_POINTS = 3;

function levelOf(score: number): 'LOW' | 'WARM' | 'INTERESTED' | 'HIGH_INTENT' {
  if (score >= 70) return 'HIGH_INTENT';
  if (score >= 40) return 'INTERESTED';
  if (score >= 20) return 'WARM';
  return 'LOW';
}

// ── กันสแปม: 10 ครั้ง / 10 นาที ต่อ IP ────────────────────────────────────────
const RL = new Map<string, number[]>();
function allow(ipKey: string, max = 10, windowMs = 10 * 60 * 1000): boolean {
  const now = Date.now();
  const arr = (RL.get(ipKey) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) { RL.set(ipKey, arr); return false; }
  arr.push(now);
  RL.set(ipKey, arr);
  if (RL.size > 5000) RL.clear();
  return true;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function str(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}
function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}
function normalizePhone(v: unknown): string | null {
  const s = typeof v === 'string' ? v.replace(/[^0-9]/g, '') : '';
  if (!s) return null;
  return s.slice(0, 15);
}
function normalizeEmail(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  if (!s || !EMAIL_RE.test(s)) return null;
  return s.slice(0, 200);
}
function clientIp(req: NextRequest): string {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
    || req.headers.get('x-real-ip') || 'unknown';
}
function hashIp(ip: string): string | null {
  if (!ip || ip === 'unknown') return null;
  const salt = process.env.AUTH_SECRET || process.env.CRON_SECRET || 'lead-tracking';
  return createHash('sha256').update(`${ip}|${salt}`).digest('hex').slice(0, 40);
}
function newProspectCode(): string {
  return 'P-' + Math.random().toString(36).slice(2, 8).toUpperCase();
}

// consent ที่รองรับทั้ง { consent: { pdpa, marketing, version } } และฟอร์มแบบแบน
function readConsent(body: any): { pdpa: boolean; marketing: boolean; version: string } {
  const c = (body?.consent && typeof body.consent === 'object') ? body.consent : {};
  return {
    pdpa: c.pdpa === true || c.pdpaConsent === true || body?.pdpaConsent === true || body?.consent === true,
    marketing: c.marketing === true || c.marketingConsent === true || body?.marketingConsent === true,
    version: str(c.version, 20) || str(body?.consentVersion, 20) || CONSENT_VERSION_DEFAULT,
  };
}

async function forwardToN8n(payload: any): Promise<'sent' | 'skipped' | 'failed'> {
  const base = process.env.N8N_WEBHOOK_BASE;
  if (!base) return 'skipped';
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/lead`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.TRACK_WEBHOOK_SECRET ? { 'x-track-secret': process.env.TRACK_WEBHOOK_SECRET } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/lead/register',
    methods: ['POST'],
    requires: { consentPDPA: true, contact: 'phone หรือ email อย่างน้อย 1 อย่าง' },
    body: {
      fullName: 'string (หรือ firstName/lastName)',
      phone: 'string', email: 'string', nickname: 'string', province: 'string',
      occupation: 'string', ageRange: 'string', lineId: 'string',
      interests: ['string'], callbackRequested: 'boolean',
      consent: { pdpa: true, marketing: false, version: '1.0' },
      visitorId: 'uuid จาก /api/track (ถ้ามี)', source: 'string', utm: '{ source, medium, campaign }',
    },
    note: 'ต้องเพิ่ม /api/lead ใน PUBLIC_API ของ src/middleware.ts ไม่งั้นจะโดน 401',
  });
}

export async function POST(req: NextRequest) {
  const ip = clientIp(req);
  const ipKey = hashIp(ip) || 'unknown';

  try {
    const body = await req.json().catch(() => ({} as any));
    if (!allow(ipKey)) {
      return NextResponse.json({ ok: false, error: 'ลงทะเบียนบ่อยเกินไป — กรุณารอสักครู่แล้วลองใหม่' }, { status: 429 });
    }

    // ── ① validate ─────────────────────────────────────────────────────────
    const fullName = str(body?.fullName || body?.name, 120);
    let firstName = str(body?.firstName, 60);
    let lastName = str(body?.lastName, 60);
    if (!firstName && fullName) {
      const parts = fullName.split(/\s+/);
      firstName = parts[0] || null;
      lastName = lastName || (parts.slice(1).join(' ') || null);
    }
    if (!firstName) {
      return NextResponse.json({ ok: false, error: 'กรุณากรอกชื่อ' }, { status: 400 });
    }
    const phone = normalizePhone(body?.phone);
    const email = normalizeEmail(body?.email);
    if (!phone && !email) {
      return NextResponse.json({ ok: false, error: 'กรุณากรอกเบอร์โทรหรืออีเมล อย่างน้อย 1 อย่าง' }, { status: 400 });
    }

    const consent = readConsent(body);
    if (!consent.pdpa) {
      return NextResponse.json({
        ok: false,
        error: 'กรุณายินยอมให้เก็บและใช้ข้อมูลเพื่อติดต่อกลับก่อนจึงจะลงทะเบียนได้',
        code: 'consent_required',
      }, { status: 400 });
    }

    const db = prisma as any;
    const now = new Date();

    // ── ② เช็ค Unsubscribe (หยุดทุกช่องทางทันทีถ้ามี record — แผนหมวด 5) ──────
    const contacts = [phone, email].filter(Boolean) as string[];
    const optOut = contacts.length
      ? await db.unsubscribe.findFirst({ where: { contact: { in: contacts }, scope: { in: ['all', 'marketing'] } } }).catch(() => null)
      : null;
    if (optOut) {
      return NextResponse.json({
        ok: false,
        code: 'contact_unsubscribed',
        error: 'ช่องทางนี้เคยขอหยุดรับข่าวสารไว้ — ระบบจะไม่ติดต่อกลับโดยอัตโนมัติ (ติดต่อเจ้าหน้าที่ได้โดยตรง)',
      }, { status: 409 });
    }

    // ── ③ กัน lead ซ้ำ: หา Prospect เดิมด้วยเบอร์/อีเมล ──────────────────────
    const or: any[] = [];
    if (phone) or.push({ phone });
    if (email) or.push({ email });
    let prospect: any = or.length ? await db.prospect.findFirst({ where: { OR: or }, orderBy: { createdAt: 'desc' } }) : null;
    const isExisting = Boolean(prospect);

    // ── ④ LeadSource ───────────────────────────────────────────────────────
    const sourceName = str(body?.source || body?.leadSource, 80) || DEFAULT_LEAD_SOURCE;
    let leadSource: any = await db.leadSource.findUnique({ where: { name: sourceName } }).catch(() => null);
    if (!leadSource) {
      leadSource = await db.leadSource.create({ data: { name: sourceName } }).catch(() => null);
    }

    // ── ⑤ หัวข้อความสนใจ (ใช้คิดคะแนน + LeadInterest) ───────────────────────
    // รับได้ทั้ง interests[] และฟิลด์เดียว + เป้าหมาย/ความสนใจด้านประกันจากกล่องลงทะเบียน
    const rawInterests: unknown[] = Array.isArray(body?.interests)
      ? body.interests
      : (str(body?.interest, 200) ? String(body.interest).split(/[,|]/) : []);
    for (const extra of [body?.insuranceInterest, body?.insurance_interest, body?.financialGoal, body?.financial_goal]) {
      const t = str(extra, 60);
      if (t) rawInterests.push(t);
    }
    const topics: string[] = Array.from(new Set(
      rawInterests.map((t: unknown) => str(t, 60)).filter(Boolean) as string[]
    )).slice(0, MAX_INTERESTS);

    const callbackRequested = body?.callbackRequested === true || body?.callback === true
      || body?.contact_requested === true || body?.contactRequested === true;
    const topicPoints = Math.min(topics.length, MAX_TOPIC_POINTS) * POINTS_TOPIC;
    const initialScore = POINTS_FORM_SUBMIT + topicPoints + (callbackRequested ? POINTS_CALLBACK : 0);

    const profile = {
      nickname: str(body?.nickname, 60) || undefined,
      province: str(body?.province, 80) || undefined,
      occupation: str(body?.occupation, 120) || undefined,
      ageRange: str(body?.ageRange || body?.age_range, 40) || undefined,
      interest: topics.join(', ') || undefined,
    };

    // ── ⑥ สร้าง / อัปเดต Prospect ───────────────────────────────────────────
    if (!prospect) {
      let created: any = null;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          created = await db.prospect.create({
            data: {
              prospectId: newProspectCode(),
              firstName: firstName!,
              lastName: lastName || '', // สคีมาบังคับ String (ไม่ nullable) — เก็บ '' ถ้าไม่กรอก
              nickname: profile.nickname,
              phone: phone || undefined,
              email: email || undefined,
              province: profile.province,
              occupation: profile.occupation,
              ageRange: profile.ageRange,
              interest: profile.interest,
              leadSourceId: leadSource?.id || undefined,
              referralCode: str(body?.referralCode || body?.ref, 40) || undefined,
              leadScore: initialScore,
              status: 'NEW',
              consentStatus: 'granted',
            },
          });
          break;
        } catch (e: any) {
          if (String(e?.code) === 'P2002' && attempt < 2) continue; // prospectId ชน — สุ่มใหม่
          throw e;
        }
      }
      if (!created) throw new Error('สร้าง Prospect ไม่สำเร็จ');
      prospect = created;
    } else {
      // มีอยู่แล้ว → เติมเฉพาะช่องที่ยังว่าง (ไม่ทับข้อมูลที่ตัวแทนแก้ไว้)
      const patch: any = {};
      if (!prospect.phone && phone) patch.phone = phone;
      if (!prospect.email && email) patch.email = email;
      if (!prospect.nickname && profile.nickname) patch.nickname = profile.nickname;
      if (!prospect.province && profile.province) patch.province = profile.province;
      if (!prospect.occupation && profile.occupation) patch.occupation = profile.occupation;
      if (!prospect.ageRange && profile.ageRange) patch.ageRange = profile.ageRange;
      if (topics.length) patch.interest = [prospect.interest, profile.interest].filter(Boolean).join(', ').slice(0, 400);
      if (!prospect.leadSourceId && leadSource?.id) patch.leadSourceId = leadSource.id;
      if ((prospect.leadScore || 0) < initialScore) patch.leadScore = initialScore;
      // ไม่ทับสถานะ "ถอนความยินยอม" เดิมของ lead (ประวัติจริงอยู่ใน ProspectConsent แบบ append-only)
      if (prospect.consentStatus !== 'withdrawn') patch.consentStatus = 'granted';
      if (Object.keys(patch).length) {
        prospect = await db.prospect.update({ where: { id: prospect.id }, data: patch });
      }
    }

    // ── ⑦ บันทึกความยินยอม (เพิ่มบันทึกใหม่ ไม่แก้ของเดิม — ตรวจย้อนหลังได้) ──
    await db.prospectConsent.create({
      data: { prospectId: prospect.id, type: 'PDPA', version: consent.version, granted: true },
    }).catch(() => null);
    await db.prospectConsent.create({
      data: { prospectId: prospect.id, type: 'MARKETING', version: consent.version, granted: consent.marketing },
    }).catch(() => null);

    // ── ⑧ LeadInterest เริ่มต้น ─────────────────────────────────────────────
    for (const topic of topics) {
      await db.leadInterest.upsert({
        where: { prospectId_topic: { prospectId: prospect.id, topic } },
        create: {
          prospectId: prospect.id, topic, weight: 0.6, hits: 1, source: 'initial',
          evidence: { from: 'lead_register', at: now.toISOString(), source: sourceName },
        },
        update: { hits: { increment: 1 }, weight: 0.6, lastSeenAt: now },
      }).catch(() => null);
    }

    // ── ⑨ ช่องทางที่เลือกให้ติดต่อ ───────────────────────────────────────────
    // รับได้ทั้ง { channels: {email,sms,line,webPush} } และ { channel_preference: {...web_push} }
    const cp = (body?.channel_preference && typeof body.channel_preference === 'object') ? body.channel_preference : {};
    const channels = (body?.channels && typeof body.channels === 'object') ? body.channels : {};
    const chOn = (...keys: string[]) => keys.some((k) => channels[k] === true || cp[k] === true);
    const chOff = (...keys: string[]) => keys.some((k) => channels[k] === false || cp[k] === false);
    const lineId = str(body?.lineId || body?.line_id, 80);
    const wantedChannel = str(body?.preferredChannel || body?.preferred_channel, 20);

    const pref = {
      email: email ? !chOff('email') : false,
      emailAddress: email || undefined,
      line: chOn('line') || Boolean(lineId),
      lineUserId: lineId || undefined,
      sms: Boolean(phone) && !chOff('sms'),
      phone: phone || undefined,
      webPush: chOn('webPush', 'web_push'),
      // ใช้ช่องทางที่ผู้ใช้เลือก เฉพาะเมื่อช่องทางนั้นมีข้อมูลให้ใช้จริง
      // (เช่น เลือก "LINE" แต่ไม่ได้กรอก LINE ID → ถอยไปใช้ email/sms ที่มีอยู่)
      preferred: (wantedChannel && (
        (wantedChannel === 'email' && !!email) ||
        (wantedChannel === 'line' && (chOn('line') || Boolean(lineId))) ||
        (wantedChannel === 'sms' && !!phone) ||
        (wantedChannel === 'web_push' && chOn('webPush', 'web_push'))
      )) ? wantedChannel : (email ? 'email' : (phone ? 'sms' : null)),
    };
    await db.channelPreference.upsert({
      where: { prospectId: prospect.id },
      create: { prospectId: prospect.id, ...pref, chosenAt: now },
      update: { ...pref, chosenAt: now },
    }).catch(() => null);

    // ── ⑩ EngagementScore เริ่มต้น + งานให้คน (ถ้าคะแนนถึง 70) ──────────────
    const breakdown: Record<string, number> = { form_submit: POINTS_FORM_SUBMIT };
    if (topicPoints) breakdown.topic_select = topicPoints;
    if (callbackRequested) breakdown.callback_request = POINTS_CALLBACK;

    const score = await db.engagementScore.upsert({
      where: { prospectId: prospect.id },
      create: {
        prospectId: prospect.id, score: initialScore, level: levelOf(initialScore),
        breakdown, eventCount: 1, lastEventAt: now, computedAt: now,
      },
      update: {
        // ถ้ามีคะแนนจากการท่องเว็บอยู่ก่อนแล้ว ก็บวกเข้าไป (ไม่รีเซ็ต)
        score: { increment: initialScore },
        level: levelOf(initialScore), // จะถูกคำนวณใหม่ด้านล่างด้วยค่าจริง
        breakdown, lastEventAt: now, computedAt: now,
      },
    }).catch(() => null);

    if (score) {
      const realScore = Math.max(score.score, initialScore);
      await db.engagementScore.update({
        where: { prospectId: prospect.id },
        data: { level: levelOf(realScore), score: realScore },
      }).catch(() => null);

      if (realScore >= 70) {
        const openTask = await db.agentTask.findFirst({
          where: { prospectId: prospect.id, type: 'high_intent_lead', status: { in: ['open', 'in_progress'] } },
        }).catch(() => null);
        if (!openTask) {
          await db.agentTask.create({
            data: {
              prospectId: prospect.id,
              type: 'high_intent_lead',
              title: `Lead คะแนนสูง ${realScore} (${levelOf(realScore)}) — ควรมีคนติดต่อกลับ`,
              note: callbackRequested
                ? 'ผู้สนใจขอให้ติดต่อกลับจากกล่องลงทะเบียนบนเว็บ'
                : `ความสนใจ: ${topics.join(', ') || 'ยังไม่ระบุ'}`,
              priority: callbackRequested ? 'urgent' : 'high',
              status: 'open',
              channel: pref.preferred || 'phone',
              triggerScore: realScore,
              dueAt: new Date(now.getTime() + (callbackRequested ? 4 : 24) * 60 * 60 * 1000),
              payload: { source: sourceName, visitorId: str(body?.visitorId, 64), utm: body?.utm ?? null },
            },
          }).catch(() => null);
        }
      }
    }

    // ── ⑪ ประวัติใน CRM เดิม (ProspectActivity / ProspectStatusHistory) ─────
    await db.prospectActivity.create({
      data: {
        prospectId: prospect.id,
        type: 'note',
        content: `ลงทะเบียนผ่านกล่อง Lead บนเว็บ (${sourceName}) · ยินยอม PDPA v${consent.version}` +
          ` · การตลาด: ${consent.marketing ? 'ยินยอม' : 'ไม่ยินยอม'} · หัวข้อ: ${topics.join(', ') || '-'}`,
      },
    }).catch(() => null);
    if (!isExisting) {
      await db.prospectStatusHistory.create({
        data: { prospectId: prospect.id, fromStatus: null, toStatus: 'NEW' },
      }).catch(() => null);
    }

    // ── ⑫ ผูก Visitor → Prospect + ดึง event ย้อนหลังมาไว้กับ lead ─────────
    const visitorId = str(body?.visitorId || body?.visitor_id, 64);
    let linkedEvents = 0;
    if (visitorId) {
      await db.visitor.update({
        where: { visitorId },
        data: {
          prospectId: prospect.id,
          consentStatus: 'granted',
          consentVersion: consent.version,
          consentAt: now,
        },
      }).catch(() => null);
      const upd = await db.visitorEvent.updateMany({
        where: { visitorId, prospectId: null },
        data: { prospectId: prospect.id },
      }).catch(() => null);
      linkedEvents = upd?.count || 0;
      await db.videoView.updateMany({
        where: { visitorId, prospectId: null },
        data: { prospectId: prospect.id },
      }).catch(() => null);
    }

    // ── ⑬ EventOutbox → n8n WF02 (ข้อความต้อนรับ/แจ้งเตือนตัวแทน ส่งที่ n8n) ─
    const outboxEventId = `lead:${prospect.id}:${isExisting ? 'reregistered' : 'registered'}`;
    await db.eventOutbox.create({
      data: {
        eventId: outboxEventId,
        eventType: isExisting ? 'lead.reregistered' : 'lead.registered',
        payload: {
          prospectId: prospect.id,
          prospectCode: prospect.prospectId,
          name: `${prospect.firstName} ${prospect.lastName}`.trim(),
          phone: prospect.phone, email: prospect.email,
          consent: { pdpa: true, marketing: consent.marketing, version: consent.version },
          topics, score: score?.score ?? initialScore,
          channel: pref.preferred, visitorId: visitorId || null,
          source: sourceName, linkedEvents,
        },
        recipientId: null,
        channel: 'lead',
        status: 'pending',
      },
    }).catch((e: any) => {
      if (String(e?.code) !== 'P2002') console.error('[lead/register] outbox failed', e?.message);
    });

    const forward = await forwardToN8n({
      eventId: outboxEventId,
      eventType: isExisting ? 'lead.reregistered' : 'lead.registered',
      prospectId: prospect.id,
      prospectCode: prospect.prospectId,
      name: `${prospect.firstName} ${prospect.lastName}`.trim(),
      phone: prospect.phone,
      email: prospect.email,
      consent: { pdpa: true, marketing: consent.marketing, version: consent.version },
      topics,
      callbackRequested,
      score: score?.score ?? initialScore,
      level: levelOf(score?.score ?? initialScore),
      preferredChannel: pref.preferred,
      visitorId: visitorId || null,
      source: sourceName,
      utm: body?.utm ?? null,
      at: now.toISOString(),
    });

    const finalScore = score?.score ?? initialScore;
    return NextResponse.json({
      ok: true,
      existing: isExisting,
      lead: {
        id: prospect.id,
        prospectId: prospect.prospectId,
        name: `${prospect.firstName} ${prospect.lastName}`.trim(),
        status: prospect.status,
        score: finalScore,
        level: levelOf(finalScore),
      },
      consent: { pdpa: true, marketing: consent.marketing, version: consent.version },
      topics,
      preferredChannel: pref.preferred,
      linkedVisitorEvents: linkedEvents,
      highIntentTask: finalScore >= 70,
      n8n: forward,
      message: isExisting
        ? 'มีข้อมูลนี้อยู่แล้ว — อัปเดตข้อมูลและความยินยอมให้เรียบร้อย'
        : 'ลงทะเบียนสำเร็จ — เจ้าหน้าที่จะติดต่อกลับตามช่องทางที่เลือก',
      privacy: 'ถอนความยินยอม/หยุดติดตามได้ทุกเมื่อผ่านลิงก์ท้ายข้อความ หรือ /api/unsubscribe',
    });
  } catch (e: any) {
    console.error('[lead/register] error', e?.message);
    return NextResponse.json({ ok: false, error: 'ลงทะเบียนไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }, { status: 500 });
  }
}
