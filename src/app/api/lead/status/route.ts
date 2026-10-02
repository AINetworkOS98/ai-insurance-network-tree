import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeLeadApi } from '@/lib/leadApiAuth';
import { str, isUuid } from '@/lib/leadNurture';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/lead/status — เปลี่ยนสถานะลีด (ใช้เมื่อลีดตอบอีเมล หรือ follow-up ยกระดับ)
// GET  /api/lead/status — สเปกย่อ (ไม่แตะ DB)
//
// กติกา:
//   ① ตรวจสิทธิ์ด้วย authorizeLeadApi (Bearer CRON_SECRET หรือคุกกี้ผู้ใช้)
//   ② หาลีดแบบเดียวกับ /api/lead/reply (uuid / P-XXXXXX / อีเมล) — ไม่พบ = 404
//   ③ สถานะต้องอยู่ใน enum ProspectStatus เท่านั้น
//   ④ สถานะเดิมอยู่แล้ว = ไม่เขียนประวัติซ้ำ (changed:false)
//   ⑤ เปลี่ยนจริง → อัปเดต Prospect + ประวัติ + กิจกรรมไทม์ไลน์ + แจ้งเจ้าของลีด
//   ⑥ ไม่แตะสคีมา/ไม่ผูกข้อมูลส่วนบุคคลเพิ่ม — เก็บเฉพาะข้อความ/ที่มา/เวลา
//
// ⚠️ middleware: '/api/lead' อยู่ใน PUBLIC_API แล้ว (prefix) จึงเรียกด้วย Bearer CRON_SECRET ได้
// ใช้ (prisma as any) เพราะบางโมเดลใหม่ยังไม่ถูก generate
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ค่าทั้งหมดของ enum ProspectStatus (prisma/schema.prisma)
const STATUSES = [
  'NEW', 'CONTACTED', 'INTERESTED', 'APPOINTMENT', 'FOLLOW_UP',
  'PREPARING_DOCUMENTS', 'APPLIED', 'CONVERTED', 'NOT_INTERESTED',
  'UNREACHABLE', 'CANCELLED',
] as const;

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

export async function POST(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  if (!auth.ok) return auth.res;

  try {
    const db = prisma as any;
    const body: any = await req.json().catch(() => ({}));

    // ② หาลีด
    const prospect = await findLead(db, body);
    if (!prospect) {
      return NextResponse.json({ ok: false, error: 'ไม่พบ lead จากอีเมลนี้' }, { status: 404 });
    }
    const code = String(prospect.prospectId || prospect.id);

    // ③ ตรวจสถานะ
    const raw = str(body?.status, 40);
    const status = raw ? raw.toUpperCase() : '';
    if (!status || !(STATUSES as readonly string[]).includes(status)) {
      return NextResponse.json(
        { ok: false, error: 'สถานะไม่ถูกต้อง', allowed: [...STATUSES] },
        { status: 400 },
      );
    }

    const note = str(body?.note, 500);
    const source = str(body?.source, 80);
    const markContact = body?.markContact === true;
    const repliedRaw = str(body?.repliedAt, 40);
    const repliedAt = repliedRaw ? new Date(repliedRaw) : null;
    const at = repliedAt && !Number.isNaN(repliedAt.getTime()) ? repliedAt : new Date();
    const previousStatus = String(prospect.status);

    // ④ สถานะเดิม — ไม่เขียนประวัติซ้ำ
    if (previousStatus === status) {
      const followUpCount = await db.prospectActivity
        .count({ where: { prospectId: prospect.id, type: 'followup' } })
        .catch(() => 0);
      return NextResponse.json({
        ok: true,
        changed: false,
        prospectId: code,
        id: prospect.id,
        previousStatus,
        status,
        followUpCount,
        lastContactAt: prospect.lastContactAt || null,
        note: 'สถานะเดิมอยู่แล้ว — ไม่บันทึกซ้ำ',
      });
    }

    // ⑤ เปลี่ยนสถานะจริง
    const touchesContact = status === 'CONTACTED' || markContact;
    const data: any = { status };
    if (touchesContact) data.lastContactAt = at;
    if (status === 'CONTACTED') data.nextFollowUpAt = null; // ติดต่อแล้ว — ล้างกำหนดติดตามเดิม

    const updated = await db.prospect.update({ where: { id: prospect.id }, data });

    // ประวัติการเปลี่ยนสถานะ (append-only)
    await db.prospectStatusHistory.create({
      data: {
        prospectId: prospect.id,
        fromStatus: previousStatus,
        toStatus: status,
        changedBy: auth.userId || null,
      },
    }).catch((e: any) => console.error('[lead/status] history failed', e?.message));

    // กิจกรรมในไทม์ไลน์ CRM: note · source · เวลา
    const content = [
      note || 'อัปเดตสถานะจาก /api/lead/status',
      source || 'api',
      at.toISOString(),
    ].join(' · ');
    await db.prospectActivity.create({
      data: {
        prospectId: prospect.id,
        userId: auth.userId || null,
        type: 'followup',
        content: content.slice(0, 1000),
      },
    }).catch((e: any) => console.error('[lead/status] activity failed', e?.message));

    // ⑥ นับจำนวน follow-up ทั้งหมดของลีดนี้
    const followUpCount = await db.prospectActivity
      .count({ where: { prospectId: prospect.id, type: 'followup' } })
      .catch(() => 0);

    // ⑦ แจ้งเตือนเจ้าของลีด (ถ้ามี) — ล้มเหลวได้โดยไม่ทำให้คำขอทั้งคำขอล้ม
    let notified = false;
    if (prospect.ownerId) {
      try {
        await db.notification.create({
          data: {
            userId: prospect.ownerId,
            type: 'lead.status',
            title: `[LEAD] ${code} เปลี่ยนสถานะเป็น ${status}`,
            body: note || `จาก ${previousStatus} เป็น ${status}${source ? ` (${source})` : ''}`,
            channel: 'in_app',
            referenceId: prospect.id,
          },
        });
        notified = true;
      } catch (e: any) {
        console.error('[lead/status] notification failed', e?.message);
      }
    }

    return NextResponse.json({
      ok: true,
      changed: true,
      prospectId: code,
      id: prospect.id,
      previousStatus,
      status,
      followUpCount,
      lastContactAt: updated.lastContactAt || null,
      notified,
    });
  } catch (e: any) {
    console.error('[lead/status] error', e?.message);
    return NextResponse.json({ ok: false, error: 'อัปเดตสถานะลีดไม่สำเร็จ' }, { status: 500 });
  }
}

export async function GET() {
  // สเปกย่อ — ไม่อ่าน/เขียนฐานข้อมูล
  return NextResponse.json({
    ok: true,
    endpoint: '/api/lead/status',
    methods: ['POST'],
    auth: 'Authorization: Bearer *** (CRON_SECRET) หรือคุกกี้ผู้ใช้ที่ล็อกอิน',
    body: {
      prospectId: 'string — Prospect.id (uuid) หรือ Prospect.prospectId (P-XXXXXX)',
      email: 'string — ใช้หาลีดเมื่อไม่ส่ง prospectId',
      status: `string — หนึ่งใน ${STATUSES.join(' | ')}`,
      note: 'string (ไม่บังคับ) — ข้อความในไทม์ไลน์',
      repliedAt: 'string ISO (ไม่บังคับ) — เวลาที่ลีดตอบกลับ',
      markContact: 'boolean (ไม่บังคับ) — true = อัปเดต lastContactAt ด้วย',
      source: 'string (ไม่บังคับ) — ที่มา เช่น email_reply / n8n',
    },
    note: 'สถานะเดิมจะไม่ถูกบันทึกซ้ำ · ติดต่อเมื่อไรอัปเดต lastContactAt และล้าง nextFollowUpAt เมื่อเป็น CONTACTED',
  });
}
