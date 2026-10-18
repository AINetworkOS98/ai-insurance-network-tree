import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { prisma } from '@/lib/prisma';
import { requireCronAuth } from '@/lib/cronAuth';
import { verifyToken } from '@/lib/auth';
import { isAdminOrDb } from '@/lib/support';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/admin/watch — ตัวตรวจ "มีความเปลี่ยนแปลงในระบบหรือไม่" สำหรับหน้า /admin
//
//   ใช้ 2 ทาง:
//   1) หน้าเว็บ /admin เรียกทุก 1 วินาที (?sig=<ค่าเดิม>) → ถ้า sig เปลี่ยน = มีข้อมูลใหม่
//      แล้วหน้าเว็บรีเฟรชข้อมูลจริงทันที (ไม่ต้องรอผู้ใช้กดรีเฟรช)
//   2) n8n เรียกแบบ long-poll (?sig=...&since=<ISO>&wait=9) → คำขอจะถูก "ถือไว้"
//      แล้ววนอ่านทุก 1 วินาทีฝั่งเซิร์ฟเวอร์ คืนผลทันทีที่มีการเปลี่ยนแปลง
//      (ตรวจทุกวินาทีจริง โดยไม่ต้องยิง HTTP ถี่จากเครื่องผู้ใช้)
//
//   สิทธิ์: Bearer CRON_SECRET (ระบบอัตโนมัติ) หรือคุกกี้ผู้ดูแลระบบ
//   ไม่คืนข้อมูลส่วนบุคคล — คืนเฉพาะ "จำนวน" + "เวลาที่แก้ล่าสุด" + เหตุการณ์จาก AuditLog
//   (ชื่อผู้กระทำไม่ถูกส่งออกไป ไม่แตะ PDPA)
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const NOTIFY_TYPE = 'admin.watch.notify';

const TH_ENTITY: Record<string, string> = {
  User: 'สมาชิก',
  Prospect: 'ผู้สนใจ',
  ReceiptFile: 'ใบเสร็จ',
  ReceiptSpec: 'ใบเสร็จ',
  receipt: 'ใบเสร็จ',
  ReceiptSettings: 'ตั้งค่าใบเสร็จ',
  MemberMessage: 'ข้อความสมาชิก',
  IncomeTransaction: 'รายได้',
  Position: 'ตำแหน่ง',
  PositionRule: 'กติกาตำแหน่ง',
  TreeNode: 'ผังเครือข่าย',
  PlacementRun: 'การจัดวางผัง',
  SystemConfig: 'ตั้งค่าระบบ',
  Notification: 'แจ้งเตือน',
  Sponsorship: 'ผู้แนะนำ',
  Appointment: 'นัดหมาย',
  ConsentRecord: 'ความยินยอม',
  CommissionTable: 'ตารางค่าคอมมิชชั่น',
  PayoutBatch: 'รอบจ่ายเงิน',
  Payout: 'รายการจ่ายเงิน',
  MemberQualification: 'คุณสมบัติเลื่อนตำแหน่ง',
  EmailMessage: 'อีเมล',
  ScheduledReport: 'รายงานตามเวลา',
};

async function authorized(req: NextRequest): Promise<boolean> {
  if (requireCronAuth(req) === null) return true;
  const token =
    req.cookies.get('token')?.value ||
    req.cookies.get('auth_token')?.value ||
    (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return false;
  try {
    const payload = verifyToken(token);
    return await isAdminOrDb(payload);
  } catch {
    return false;
  }
}

type Snapshot = {
  counts: Record<string, number>;
  last: Record<string, string | null>;
  sig: string;
};

// อ่านสถานะแบบคำสั่งเดียว (1 round-trip) — ใช้ทุก 1 วินาทีได้โดยไม่หนักฐานข้อมูล
async function readSnapshot(): Promise<Snapshot> {
  const rows = await prisma.$queryRaw<any[]>`
    SELECT
      (SELECT count(*) FROM "User")::int                        AS users,
      (SELECT count(*) FROM "User" WHERE status = 'PENDING')::int AS members_pending,
      (SELECT max("updatedAt") FROM "User")                     AS users_last,
      (SELECT count(*) FROM "Prospect")::int                    AS prospects,
      (SELECT max("updatedAt") FROM "Prospect")                 AS prospects_last,
      (SELECT count(*) FROM "ReceiptFile")::int                 AS receipts,
      (SELECT max("updatedAt") FROM "ReceiptFile")              AS receipts_last,
      (SELECT count(*) FROM "MemberMessage")::int               AS messages,
      (SELECT count(*) FROM "MemberMessage" WHERE status = 'PENDING')::int AS messages_pending,
      (SELECT count(*) FROM "AuditLog")::int                    AS audit,
      (SELECT max("createdAt") FROM "AuditLog")                 AS audit_last,
      (SELECT count(*) FROM "Notification")::int                AS notifications
  `;
  const r = rows[0] || {};
  const iso = (v: any) => (v ? new Date(v).toISOString() : null);
  const counts = {
    users: Number(r.users || 0),
    membersPending: Number(r.members_pending || 0),
    prospects: Number(r.prospects || 0),
    receipts: Number(r.receipts || 0),
    messages: Number(r.messages || 0),
    messagesPending: Number(r.messages_pending || 0),
    audit: Number(r.audit || 0),
    notifications: Number(r.notifications || 0),
  };
  const last = {
    users: iso(r.users_last),
    prospects: iso(r.prospects_last),
    receipts: iso(r.receipts_last),
    audit: iso(r.audit_last),
  };
  const sig = createHash('sha1').update(JSON.stringify({ counts, last })).digest('hex').slice(0, 16);
  return { counts, last, sig };
}

type ChangeEvent = {
  at: string;
  action: string;
  entity: string;
  entityId: string | null;
  label: string;
};

async function readEvents(sinceAt: string): Promise<ChangeEvent[]> {
  const sinceDate = sinceAt ? new Date(sinceAt) : null;
  const where = sinceDate && !isNaN(sinceDate.getTime()) ? { createdAt: { gt: sinceDate } } : {};
  const rows = await prisma.auditLog.findMany({
    where: where as any,
    orderBy: { createdAt: 'desc' },
    take: 25,
    select: { action: true, entity: true, entityId: true, createdAt: true },
  });
  return rows.map((r) => ({
    at: r.createdAt.toISOString(),
    action: r.action,
    entity: r.entity,
    entityId: r.entityId,
    // ป้ายภาษาไทยสำหรับรายงาน (ไม่ใส่ชื่อผู้กระทำ/ข้อมูลส่วนบุคคล)
    label: `${TH_ENTITY[r.entity] || r.entity} · ${r.action}`,
  }));
}

export async function GET(req: NextRequest) {
  if (!(await authorized(req))) {
    return NextResponse.json(
      { ok: false, error: 'ต้องเป็นผู้ดูแลระบบ หรือใช้ Authorization: Bearer <CRON_SECRET>' },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const sinceSig = (url.searchParams.get('sig') || '').trim();
  const sinceAt = (url.searchParams.get('since') || '').trim();
  const wait = Math.max(0, Math.min(25, Number(url.searchParams.get('wait') || 0) || 0));
  // claim=1 → ให้ "เซิร์ฟเวอร์" ตัดสินว่าจะแจ้งเตือนรอบนี้หรือไม่ (เก็บสถานะใน NotificationLog)
  //   ทำแบบนี้เพราะเครื่องมือภายนอก (n8n) ไม่ควรถือ state เอง — รีสตาร์ท/แก้ workflow แล้วสถานะไม่หาย
  const claim = url.searchParams.get('claim') === '1';
  const minGap = Math.max(0, Math.min(86400, Number(url.searchParams.get('minGap') || 300) || 300));
  const t0 = Date.now();

  let snap = await readSnapshot();
  let polls = 1;

  // long-poll: ถือคำขอไว้ไม่เกิน wait วินาที ตรวจทุก 1 วินาที คืนทันทีเมื่อมีการเปลี่ยนแปลง
  while (sinceSig && snap.sig === sinceSig && Date.now() - t0 < wait * 1000) {
    await new Promise((r) => setTimeout(r, 1000));
    snap = await readSnapshot();
    polls += 1;
  }

  if (claim) {
    const last = await prisma.notificationLog.findFirst({
      where: { type: NOTIFY_TYPE },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true, payload: true },
    });
    const lastPayload: any = last?.payload || {};
    const lastNotifyAt = lastPayload.at || last?.createdAt?.toISOString() || null;
    const lastSig = typeof lastPayload.sig === 'string' ? lastPayload.sig : null;
    const gapMs = last ? Date.now() - last.createdAt.getTime() : Number.MAX_SAFE_INTEGER;
    const changed = lastSig ? lastSig !== snap.sig : true;
    const allowed = changed && gapMs >= minGap * 1000;

    let events: ChangeEvent[] = [];
    if (allowed) {
      events = await readEvents(lastNotifyAt || '');
      // จองรอบนี้ทันที (กันการแจ้งซ้ำเมื่อมีผู้เรียกพร้อมกัน)
      await prisma.notificationLog.create({
        data: {
          type: NOTIFY_TYPE,
          channel: 'line',
          target: 'owner',
          status: 'PENDING',
          payload: { sig: snap.sig, at: new Date().toISOString(), events: events.length } as any,
        },
      });
    }

    return NextResponse.json(
      {
        ok: true,
        at: new Date().toISOString(),
        sig: snap.sig,
        changed,
        allowed,
        reason: !changed ? 'ไม่มีการเปลี่ยนแปลงตั้งแต่รอบล่าสุด' : (gapMs < minGap * 1000 ? `ยังไม่ถึงรอบส่ง (ห่าง ${Math.round(gapMs / 1000)}/${minGap} วิ)` : 'ถึงรอบส่ง'),
        lastNotifyAt,
        minGap,
        counts: snap.counts,
        last: snap.last,
        events,
        waitedMs: Date.now() - t0,
        polls,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } },
    );
  }

  const changed = sinceSig ? snap.sig !== sinceSig : true;
  const events = changed ? await readEvents(sinceAt) : [];

  return NextResponse.json(
    {
      ok: true,
      at: new Date().toISOString(),
      sig: snap.sig,
      changed,
      previousSig: sinceSig || null,
      counts: snap.counts,
      last: snap.last,
      events,
      waitedMs: Date.now() - t0,
      polls,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } },
  );
}
