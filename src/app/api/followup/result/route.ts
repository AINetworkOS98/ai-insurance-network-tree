import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeLeadApi } from '@/lib/leadApiAuth';
import { str, isUuid, resolveProspectId } from '@/lib/leadNurture';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/followup/result — บันทึกผลการส่งข้อความติดตาม (จาก n8n WF05)
//
// WF05 ส่ง: { followUpId, prospectId, channel, status:'SENT'|'FAILED', providerRef,
//             error, messagePreview, source:'n8n-05-followup' }
//
// อัปเดต FollowUp: status (sent/failed/skipped/cancelled) · sentAt · attempts+1 · error
// + บันทึก ProspectActivity (มี providerRef/preview ให้ตรวจย้อนหลังได้ — FollowUp ไม่มีคอลัมน์ payload)
// + ถ้าส่งสำเร็จ: อัปเดต Prospect.lastContactAt (ใช้คำนวณ frequency cap รอบถัดไป)
//
// ⚠️ ต้องเพิ่ม '/api/followup/result' ใน PUBLIC_API ของ src/middleware.ts (ดู /src/lib/leadApiAuth.ts)
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function mapStatus(raw: unknown): string {
  const s = String(raw || '').toUpperCase();
  if (s === 'SENT' || s === 'SUCCESS' || s === 'OK') return 'sent';
  if (s === 'FAILED' || s === 'ERROR') return 'failed';
  if (s === 'SKIPPED') return 'skipped';
  if (s === 'CANCELLED' || s === 'CANCELED') return 'cancelled';
  return 'sent';
}

export async function POST(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  if (!auth.ok) return auth.res;

  try {
    const db = prisma as any;
    const body: any = await req.json().catch(() => ({}));

    const followUpId = str(body?.followUpId ?? body?.id, 64);
    let followUp: any = null;
    if (followUpId && isUuid(followUpId)) {
      followUp = await db.followUp.findUnique({ where: { id: followUpId } }).catch(() => null);
    }
    // ไม่เจอด้วย id → หาแถวล่าสุดที่ยัง scheduled ของ lead+ช่องทางนี้
    if (!followUp) {
      const prospectId = await resolveProspectId(db, body?.prospectId);
      const channel = str(body?.channel, 20);
      if (prospectId) {
        followUp = await db.followUp.findFirst({
          where: {
            prospectId,
            status: 'scheduled',
            ...(channel ? { channel: channel.toLowerCase() } : {}),
          },
          orderBy: { scheduledAt: 'desc' },
        }).catch(() => null);
      }
    }
    if (!followUp) {
      return NextResponse.json({ ok: false, error: 'ไม่พบรายการติดตาม (followUpId/prospectId ไม่ถูกต้อง)' }, { status: 404 });
    }

    const now = new Date();
    const status = mapStatus(body?.status);
    const err = str(body?.error, 1000) || null;
    const providerRef = str(body?.providerRef ?? body?.messageId, 200) || null;
    const preview = str(body?.messagePreview, 200) || null;
    const source = str(body?.source, 80) || (auth.via === 'cron' ? 'n8n' : 'agent');

    const updated = await db.followUp.update({
      where: { id: followUp.id },
      data: {
        status,
        attempts: { increment: 1 },
        sentAt: status === 'sent' ? now : followUp.sentAt,
        error: status === 'failed' ? (err || 'ส่งไม่สำเร็จ') : null,
        result: str(body?.result, 40) || followUp.result || null,
        skipReason: status === 'skipped' ? (str(body?.skipReason ?? body?.error, 200) || followUp.skipReason || null) : followUp.skipReason,
      },
    });

    if (status === 'sent') {
      await db.prospect.update({
        where: { id: followUp.prospectId },
        data: { lastContactAt: now, nextFollowUpAt: null },
      }).catch((e: any) => console.error('[followup/result] prospect.lastContactAt', e?.message));
    }

    const summary = [
      `[follow-up ${updated.stepKey || `d${updated.dayOffset}`}] ${status.toUpperCase()} ทาง ${updated.channel}`,
      preview ? `ข้อความ: ${preview}` : null,
      providerRef ? `ref: ${providerRef}` : null,
      status === 'failed' && err ? `error: ${err}` : null,
      `(${source})`,
    ].filter(Boolean).join(' · ');

    await db.prospectActivity.create({
      data: { prospectId: followUp.prospectId, type: 'note', content: summary.slice(0, 1000) },
    }).catch((e: any) => console.error('[followup/result] activity', e?.message));

    return NextResponse.json({
      ok: true,
      followUpId: updated.id,
      prospectId: followUp.prospectId,
      status,
      channel: updated.channel,
      sentAt: status === 'sent' ? now.toISOString() : null,
      attempts: updated.attempts,
      providerRef,
      via: auth.via,
    });
  } catch (e: any) {
    console.error('[followup/result] error', e?.message);
    return NextResponse.json({ ok: false, error: 'บันทึกผลการส่งไม่สำเร็จ' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/followup/result',
    methods: ['POST'],
    body: {
      followUpId: 'uuid ของ FollowUp (หรือส่ง prospectId + channel แทนได้)',
      status: 'SENT | FAILED | SKIPPED | CANCELLED',
      providerRef: 'string', error: 'string', messagePreview: 'string',
    },
    note: 'ต้องเพิ่ม /api/followup/result ใน PUBLIC_API ของ src/middleware.ts ไม่งั้นจะโดน 401',
  });
}
