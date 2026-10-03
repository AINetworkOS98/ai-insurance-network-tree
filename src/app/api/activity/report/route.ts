import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeLeadApi } from '@/lib/leadApiAuth';
import { sendMail } from '@/lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/activity/report — สร้าง "รายงานกิจกรรมสมาชิก" + ส่งอีเมล (ตามสเปกหมวด 7–10, 20, 21, 23)
//
// รับจาก workflow n8n (หรือผู้ดูแล) → เก็บรายงานลง NotificationLog (type='activity.report')
// แล้วส่งอีเมล **เฉพาะเมื่อ** มีอีเมลที่ยืนยันแล้ว + ให้ความยินยอม (granted) เท่านั้น
//
// กติกาที่บังคับในโค้ดนี้:
//   • idempotent: รายงานเดียวกัน (target เดิม) ภายใน 24 ชม. → ไม่สร้างซ้ำ ไม่ส่งอีเมลซ้ำ
//   • ส่งอีเมลล้มเหลว "ไม่ทำให้" การบันทึกรายงานล้ม — บันทึก status=FAILED + error ไว้ตรวจย้อนหลัง
//   • payload ที่เก็บไม่มีความลับ: ไม่มีอีเมลเต็ม (ปิดเป็น a***@dom), ไม่มี token, ไม่มีเบอร์โทร
// ─────────────────────────────────────────────────────────────────────────────

const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const str = (v: any, max = 400) => (v == null ? '' : String(v).slice(0, max));
const maskEmail = (e?: string | null) => {
  const t = String(e || '').trim();
  if (!t.includes('@')) return t ? '***' : '';
  const [u, d] = t.split('@');
  return `${u.slice(0, 1)}***@${d}`;
};

function fmtDuration(sec: number) {
  const s = Math.max(0, Math.round(sec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m ? `${m} นาที ${r} วินาที` : `${r} วินาที`;
}

const PAGE_TH: Record<string, string> = {
  '/network/1x5-autopilot': '1×5 Autopilot (ระบบบริหารเครือข่ายอัตโนมัติ)',
  '/network-simulator': 'โครงข่าย 1 แตก 5',
  '/financial-freedom': 'อิสรภาพทางการเงิน',
};

export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      spec:
        'POST { visitorKey, prospectId?, score, level, summary, behaviors[], pagePath, durationSec, visits, ctaClicks } → บันทึกรายงาน + ส่งอีเมลถ้ามีความยินยอม',
      note: 'ส่งอีเมลเฉพาะอีเมลที่ยืนยันแล้วและ consentStatus=granted · รายงานเดิมภายใน 24 ชม. จะไม่สร้างซ้ำ',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export async function POST(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  if (!auth.ok) return auth.res;

  const db = prisma as any;
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }

  const visitorKey = str(body.visitorKey || body.visitorId, 80).trim();
  const prospectId = str(body.prospectId, 80).trim() || null;
  const score = clamp(Math.round(Number(body.score || 0)));
  const level = str(body.level, 40) || 'ไม่ระบุ';
  const summary = str(body.summary, 600);
  const behaviors: string[] = Array.isArray(body.behaviors) ? body.behaviors.slice(0, 10).map((b: any) => str(b, 160)) : [];
  const pagePath = str(body.pagePath, 300);
  const durationSec = Math.max(0, Math.round(Number(body.durationSec || 0)));
  const visits = Math.max(0, Math.round(Number(body.visits || 0)));
  const ctaClicks = Math.max(0, Math.round(Number(body.ctaClicks || 0)));

  if (!visitorKey && !prospectId) {
    return NextResponse.json({ ok: false, error: 'missing_target', message: 'ต้องมี visitorKey หรือ prospectId' }, { status: 400 });
  }

  const target = visitorKey || `prospect:${prospectId}`;
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

  // ── กันรายงานซ้ำ (idempotency ตามสเปกหมวด 21) ──
  const dup = await db.notificationLog
    .findFirst({ where: { type: 'activity.report', target, createdAt: { gte: dayAgo } }, select: { id: true, sentAt: true } })
    .catch(() => null);
  if (dup) {
    return NextResponse.json({
      ok: true, deduped: true, reportId: dup.id, email: 'skipped_already_reported',
      message: 'รายงานของเป้าหมายนี้ถูกสร้างภายใน 24 ชั่วโมงแล้ว — ไม่สร้างซ้ำ ไม่ส่งอีเมลซ้ำ',
    });
  }

  // ── หาที่อยู่อีเมลที่ "ยืนยันแล้ว + ยินยอม" เท่านั้น ──
  let toEmail: string | null = null;
  let recipientName = '';
  let consentStatus = '';
  let prospect: any = null;
  if (prospectId) {
    prospect = await prisma.prospect
      .findUnique({
        where: { id: prospectId },
        select: { id: true, firstName: true, email: true, consentStatus: true, leadScore: true, status: true },
      })
      .catch(() => null);
  }
  if (!prospect && visitorKey) {
    const v = await db.visitor.findUnique({ where: { visitorId: visitorKey }, select: { prospectId: true, consentStatus: true } }).catch(() => null);
    consentStatus = String(v?.consentStatus || '');
    if (v?.prospectId) {
      prospect = await prisma.prospect
        .findUnique({
          where: { id: String(v.prospectId) },
          select: { id: true, firstName: true, email: true, consentStatus: true, leadScore: true, status: true },
        })
        .catch(() => null);
    }
  }
  if (prospect) {
    recipientName = str(prospect.firstName, 60);
    consentStatus = String(prospect.consentStatus || consentStatus || '');
    const consented = consentStatus.toLowerCase() === 'granted';
    if (prospect.email && consented) toEmail = String(prospect.email);
  }

  const base = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://ai-insurance-network-tree.vercel.app';
  const pageUrl = `${base}${pagePath || '/network/1x5-autopilot'}`;
  const pageName = PAGE_TH[pagePath] || pagePath || 'ระบบ AI Insurance Network';
  const thNow = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  let emailStatus: 'sent' | 'skipped_no_email' | 'failed' = 'skipped_no_email';
  let provider = '';
  let errorMsg: string | null = null;

  if (toEmail) {
    const html = `
<div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.7;color:#334155;max-width:620px">
  <h2 style="color:#475569;margin:0 0 4px">รายงานการใช้งานระบบ AI Insurance Network</h2>
  <p>สวัสดี ${recipientName ? recipientName : 'สมาชิก'}</p>
  <p>ระบบได้บันทึกกิจกรรมการใช้งานของคุณบน AI Insurance Network สรุปได้ดังนี้</p>
  <table style="border-collapse:collapse;width:100%;font-size:14px">
    <tr><td style="padding:6px 8px;background:#f8fafc;border:1px solid #e2e8f0">หน้า</td><td style="padding:6px 8px;border:1px solid #e2e8f0">${pageName}</td></tr>
    <tr><td style="padding:6px 8px;background:#f8fafc;border:1px solid #e2e8f0">วันที่บันทึกล่าสุด</td><td style="padding:6px 8px;border:1px solid #e2e8f0">${thNow}</td></tr>
    <tr><td style="padding:6px 8px;background:#f8fafc;border:1px solid #e2e8f0">ระยะเวลาการใช้งาน</td><td style="padding:6px 8px;border:1px solid #e2e8f0">${fmtDuration(durationSec)}</td></tr>
    <tr><td style="padding:6px 8px;background:#f8fafc;border:1px solid #e2e8f0">จำนวนครั้งที่เข้าชม</td><td style="padding:6px 8px;border:1px solid #e2e8f0">${visits || 1} ครั้ง</td></tr>
    <tr><td style="padding:6px 8px;background:#f8fafc;border:1px solid #e2e8f0">กดปุ่มชวนทำต่อ (CTA)</td><td style="padding:6px 8px;border:1px solid #e2e8f0">${ctaClicks} ครั้ง</td></tr>
    <tr><td style="padding:6px 8px;background:#f8fafc;border:1px solid #e2e8f0">ระดับ Engagement</td><td style="padding:6px 8px;border:1px solid #e2e8f0">${level}</td></tr>
    <tr><td style="padding:6px 8px;background:#f8fafc;border:1px solid #e2e8f0">คะแนน Engagement</td><td style="padding:6px 8px;border:1px solid #e2e8f0"><b>${score}/100</b></td></tr>
  </table>
  <h4 style="margin:16px 0 6px;color:#475569">กิจกรรมสำคัญ</h4>
  <ul style="padding-left:20px;margin:0">${behaviors.map((b) => `<li>${b}</li>`).join('') || '<li>มีกิจกรรมในระบบ</li>'}</ul>
  <h4 style="margin:16px 0 6px;color:#475569">สรุปจากระบบ</h4>
  <p style="margin:0">${summary || 'ระบบบันทึกกิจกรรมของคุณเรียบร้อยแล้ว'}</p>
  <p style="margin-top:16px"><a href="${pageUrl}" style="display:inline-block;background:#475569;color:#fff;text-decoration:none;padding:10px 18px;border-radius:999px">กลับเข้าสู่ระบบ</a></p>
  <p style="font-size:12px;color:#94a3b8;margin-top:18px">อีเมลนี้ส่งถึงเฉพาะผู้ที่ยืนยันอีเมลและให้ความยินยอมรับข้อมูลแล้ว · ตัวเลขทั้งหมดมาจากกิจกรรมจริงที่ระบบบันทึกไว้ ไม่ได้คาดเดาความต้องการซื้อ · หากไม่ต้องการรับอีเมลลักษณะนี้อีก สามารถแจ้งผู้ดูแลระบบเพื่อถอนความยินยอมได้ทันที</p>
</div>`.trim();

    try {
      const r = await sendMail({ to: toEmail, subject: 'รายงานการใช้งานระบบ AI Insurance Network', html });
      if (r.ok) {
        emailStatus = 'sent';
        provider = r.provider;
      } else {
        emailStatus = 'failed';
        provider = r.provider;
        errorMsg = str(r.error, 300);
      }
    } catch (e: any) {
      emailStatus = 'failed';
      errorMsg = str(e?.message || e, 300);
    }
  } else {
    errorMsg = prospect ? 'ไม่มีอีเมลที่ยืนยันแล้ว + ความยินยอม (granted)' : 'ยังไม่ระบุตัวตนเป็นสมาชิก/ผู้สนใจที่มีอีเมลยืนยัน';
  }

  // ── บันทึกรายงาน/บันทึกการส่ง (ล้มเหลวก็ยังบันทึกไว้ตรวจย้อนหลังได้) ──
  // หมายเหตุ: NotificationStatus ของระบบมีเฉพาะ PENDING | SENT | FAILED
  //   → "สร้างรายงานแล้วแต่ยังไม่ส่งอีเมล" (ไม่มีความยินยอม/ไม่มีอีเมลยืนยัน) ใช้ PENDING และระบุเหตุผลใน payload
  const logStatus = emailStatus === 'sent' ? 'SENT' : emailStatus === 'failed' ? 'FAILED' : 'PENDING';
  let logError: string | null = null;
  const log = await db.notificationLog
    .create({
      data: {
        type: 'activity.report',
        channel: toEmail ? 'email' : 'web',
        target,
        status: logStatus,
        error: emailStatus === 'sent' ? null : errorMsg,
        payload: {
          score, level, summary, behaviors, pagePath, pageName, durationSec, visits, ctaClicks,
          prospectId: prospect?.id || null, recipient: maskEmail(toEmail), provider,
          emailStatus, consentStatus: consentStatus || 'unknown',
          reportedBy: auth.via, at: new Date().toISOString(),
        },
        sentAt: new Date(),
      },
    })
    .catch((e: any) => {
      logError = str(e?.message || e, 300);
      return null;
    });

  return NextResponse.json(
    {
      ok: true,
      reportId: log?.id || null,
      reportStatus: logStatus,
      email: toEmail ? emailStatus : 'no_verified_email_or_consent',
      provider: provider || null,
      score,
      level,
      recipient: maskEmail(toEmail),
      error: emailStatus === 'failed' ? errorMsg : undefined,
      logError: logError || undefined,
      note: 'บันทึกรายงาน + ผลการส่งลงระบบแล้ว (อีเมลล้มเหลวไม่กระทบการบันทึก)',
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
