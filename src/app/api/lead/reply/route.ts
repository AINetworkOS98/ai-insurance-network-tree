import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeLeadApi } from '@/lib/leadApiAuth';
import { str, isUuid } from '@/lib/leadNurture';
import { sendMail } from '@/lib/mailer';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/lead/reply — ส่งอีเมลตอบกลับอัตโนมัติ (ข้อความสุภาพภาษาไทย) ให้ลีด
// GET  /api/lead/reply — สเปกย่อ (ไม่แตะ DB)
//
// กติกา PDPA ที่บังคับในไฟล์นี้:
//   ① ส่งได้เฉพาะเมื่อ "มีความยินยอมเป็นลายลักษณ์อักษร" (ProspectConsent: PDPA/CONTACT/MARKETING
//      ที่ granted=true) หรือ Prospect.consentStatus === 'granted' — ไม่มี = ไม่ส่ง (no_consent)
//   ② เคารพ EmailSuppression — อีเมลที่ขอหยุดรับ ไม่ส่งเด็ดขาด
//   ③ ส่งซ้ำไม่ได้: กันด้วย NotificationLog type='lead.auto_reply' + target=<prospectId>
//   ④ dryRun=true → ตรวจเส้นทางได้โดยไม่ส่งและไม่เขียนแถวใด ๆ
//
// ⚠️ middleware: '/api/lead' อยู่ใน PUBLIC_API แล้ว (prefix) จึงเรียกด้วย Bearer CRON_SECRET ได้
//    และ route นี้ตรวจสิทธิ์เองด้วย authorizeLeadApi อีกชั้น
// ใช้ (prisma as any) เพราะบางโมเดลใหม่ยังไม่ถูก generate
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const APP_URL = 'https://ai-insurance-network-tree.vercel.app/';
const DEFAULT_SUBJECT = 'ข้อมูลเพิ่มเติมจาก AI Insurance Network';
const CONSENT_TYPES = ['MARKETING', 'CONTACT', 'PDPA'];
const LOG_TYPE = 'lead.auto_reply';

function escapeHtml(v: string): string {
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── เนื้ออีเมล (ข้อความสุภาพล้วน ไม่มีข้อมูลส่วนบุคคลเกินที่มีอยู่ในโมเดล) ──────
function buildHtml(name: string): string {
  const who = escapeHtml(name || 'คุณลูกค้า');
  return [
    '<div style="font-family:Sarabun,\'Noto Sans Thai\',sans-serif;line-height:1.7;color:#334155">',
    `<p>สวัสดี ${who}</p>`,
    '<p>ขอบคุณที่สนใจข้อมูลจากเรา</p>',
    `<p>ดูข้อมูลเพิ่มเติมได้ที่ <a href="${APP_URL}">${APP_URL}</a></p>`,
    '<p>หากต้องการสอบถามข้อมูลเพิ่มเติม สามารถตอบกลับอีเมลนี้ได้</p>',
    '<p>ขอบคุณครับ / ทีม AI Insurance Network</p>',
    '</div>',
  ].join('');
}

// ── หาลีด: Prospect.id (uuid) → Prospect.prospectId (P-XXXXXX) → อีเมล (ไม่สนตัวพิมพ์) ──
async function findLead(db: any, body: any): Promise<any | null> {
  const raw = str(body?.prospectId, 64);
  if (raw) {
    if (isUuid(raw)) {
      const byId = await db.prospect.findUnique({ where: { id: raw } }).catch(() => null);
      if (byId) return byId;
    }
    const byCode = await db.prospect.findUnique({ where: { prospectId: raw } }).catch(() => null);
    if (byCode) return byCode;
  }
  const email = (str(body?.email, 200) || '').toLowerCase();
  if (email) {
    const byEmail = await db.prospect.findFirst({
      where: { email: { equals: email, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);
    if (byEmail) return byEmail;
  }
  return null;
}

// ── ความยินยอมสำหรับการติดต่อ: บันทึกล่าสุดต่อประเภท + consentStatus ───────────
async function hasContactConsent(db: any, prospect: any): Promise<boolean> {
  if (String(prospect?.consentStatus || '').toLowerCase() === 'granted') return true;
  const rows: any[] = await db.prospectConsent.findMany({
    where: { prospectId: prospect.id, type: { in: CONSENT_TYPES } },
    orderBy: { createdAt: 'desc' },
  }).catch(() => []);
  const latestByType = new Map<string, boolean>();
  for (const c of rows || []) {
    const t = String(c?.type || '').toUpperCase();
    if (!latestByType.has(t)) latestByType.set(t, c.granted === true);
  }
  return Array.from(latestByType.values()).some(Boolean);
}

export async function POST(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  if (!auth.ok) return auth.res;

  try {
    const db = prisma as any;
    const body: any = await req.json().catch(() => ({}));

    // ① หาลีด
    const prospect = await findLead(db, body);
    if (!prospect) {
      return NextResponse.json({ ok: false, error: 'ไม่พบ lead จากอีเมลนี้' }, { status: 404 });
    }
    const code = String(prospect.prospectId || prospect.id);

    const email = String(prospect.email || '').trim().toLowerCase();
    if (!email) {
      return NextResponse.json({ ok: false, sent: false, reason: 'no_email', prospectId: code });
    }

    const source = str(body?.source, 80) || 'api';
    const subject = str(body?.subject, 200) || DEFAULT_SUBJECT;
    const name = str(body?.name, 60) || str(prospect.firstName, 60) || 'คุณลูกค้า';

    // ② ด่านความยินยอม — ไม่มี = ไม่ส่ง
    const consented = await hasContactConsent(db, prospect);
    if (!consented) {
      return NextResponse.json({ ok: true, sent: false, reason: 'no_consent', prospectId: code, to: email });
    }

    // ③ ด่าน suppression
    const suppressed = await db.emailSuppression.findUnique({ where: { email } }).catch(() => null);
    if (suppressed) {
      return NextResponse.json({ ok: true, sent: false, reason: 'suppressed', prospectId: code, to: email });
    }

    // ④ กันส่งซ้ำ (idempotency) — ต้องเช็คก่อน dryRun เพื่อให้ผลตรงกับของจริง
    const already = await db.notificationLog.findFirst({
      where: { type: LOG_TYPE, target: code },
      select: { id: true, createdAt: true },
    }).catch(() => null);
    if (already) {
      return NextResponse.json({ ok: true, sent: false, reason: 'already_sent', prospectId: code, to: email });
    }

    // ⑤ dryRun — ไม่ส่ง ไม่เขียนแถว
    if (body?.dryRun === true) {
      return NextResponse.json({
        ok: true, sent: false, reason: 'dry_run',
        would: { to: email, subject },
        prospectId: code,
      });
    }

    // ⑥ ส่งจริง
    const html = buildHtml(name);
    const result: any = await sendMail({ to: email, subject, html });
    const sent = result?.ok === true;
    const provider = result?.provider || 'none';
    const errorText = sent ? null : (result?.error || 'send failed');
    const at = new Date();

    // ⑦ บันทึกผล (EmailMessage → EmailDeliveryLog)
    let saved = false;
    try {
      const key = `lead.auto-reply.${code}`;
      const msg = await db.emailMessage.upsert({
        where: { idempotencyKey: key },
        create: {
          toEmail: email,
          subject,
          bodyHtml: html,
          status: sent ? 'SENT' : 'FAILED',
          idempotencyKey: key,
          attempts: 1,
          error: errorText,
          sentAt: sent ? at : null,
        },
        update: {
          status: sent ? 'SENT' : 'FAILED',
          attempts: { increment: 1 },
          error: errorText,
          sentAt: sent ? at : null,
        },
      });
      saved = true;
      await db.emailDeliveryLog.create({
        data: {
          messageId: msg.id,
          status: sent ? 'SENT' : 'FAILED',
          providerResponse: JSON.stringify({ provider, ok: sent, error: errorText }),
        },
      }).catch(() => null);
    } catch (e: any) {
      console.error('[lead/reply] persist email message failed', e?.message);
    }

    // ⑧ บันทึก log สำหรับกันส่งซ้ำ + ตรวจย้อนหลัง (ไม่มีข้อมูลเกินที่มีอยู่แล้วในโมเดล)
    let logged = false;
    try {
      await db.notificationLog.create({
        data: {
          type: LOG_TYPE,
          channel: 'email',
          target: code,
          status: sent ? 'SENT' : 'FAILED',
          error: errorText,
          payload: { provider, to: email, prospectId: code, source },
          sentAt: at,
        },
      });
      logged = true;
    } catch (e: any) {
      console.error('[lead/reply] notification log failed', e?.message);
    }

    return NextResponse.json({
      ok: true,
      sent,
      reason: sent ? undefined : 'send_failed',
      error: sent ? undefined : errorText,
      provider,
      prospectId: code,
      to: email,
      saved,
      logged,
    });
  } catch (e: any) {
    console.error('[lead/reply] error', e?.message);
    return NextResponse.json({ ok: false, error: 'ส่งอีเมลตอบกลับไม่สำเร็จ' }, { status: 500 });
  }
}

export async function GET() {
  // สเปกย่อ — ไม่อ่าน/เขียนฐานข้อมูล
  return NextResponse.json({
    ok: true,
    endpoint: '/api/lead/reply',
    methods: ['POST'],
    auth: 'Authorization: Bearer *** (CRON_SECRET) หรือคุกกี้ผู้ใช้ที่ล็อกอิน',
    body: {
      prospectId: 'string — Prospect.id (uuid) หรือ Prospect.prospectId (P-XXXXXX)',
      email: 'string — ใช้หาลีดเมื่อไม่ส่ง prospectId (ไม่สนตัวพิมพ์เล็ก/ใหญ่)',
      name: 'string (ไม่บังคับ) — ใช้เป็นคำเรียกในอีเมล',
      subject: 'string (ไม่บังคับ)',
      source: 'string (ไม่บังคับ) — ที่มาของคำสั่ง เช่น n8n / manual',
      dryRun: 'boolean — true = ตรวจเส้นทางโดยไม่ส่งและไม่เขียนแถว',
    },
    responses: {
      sent: "{ ok:true, sent:true, provider, prospectId, to }",
      skipped: "{ ok:true, sent:false, reason:'no_consent'|'suppressed'|'already_sent'|'no_email' }",
      notFound: "{ ok:false, error:'ไม่พบ lead จากอีเมลนี้' } (404)",
    },
    note: 'ต้องมีความยินยอมที่บันทึกไว้ (ProspectConsent PDPA/CONTACT/MARKETING granted=true หรือ consentStatus=granted) จึงจะส่ง — ส่งได้ลีดละ 1 ครั้ง กันซ้ำด้วย NotificationLog type=lead.auto_reply',
  });
}
