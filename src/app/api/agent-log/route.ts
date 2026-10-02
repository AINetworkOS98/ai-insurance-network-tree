import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeLeadApi } from '@/lib/leadApiAuth';
import { str } from '@/lib/leadNurture';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/agent-log — รับ log การทำงานของ agent จาก n8n (WF01-WF06)
// GET  /api/agent-log — สเปกย่อ + จำนวน log ล่าสุด (ไม่แตะข้อมูลสำคัญ)
//
// n8n ส่ง: { source:'n8n', workflow, ok, stage, detail, at, ...extra }
// เก็บลง NotificationLog (มี payload Json + status + error อยู่แล้ว — โมเดลที่เหมาะ
// ที่สุดในสคีมาปัจจุบัน เพราะไม่มีโมเดล AgentLog และห้ามแก้สคีมาเดิม)
//   type='agent.log' · channel=source · target=workflow · status=SENT|FAILED · payload=body
//
// ⚠️ ต้องเพิ่ม '/api/agent-log' ใน PUBLIC_API ของ src/middleware.ts (ดู /src/lib/leadApiAuth.ts)
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_SOURCE = new Set(['n8n', 'cron', 'app', 'agent', 'manual', 'system']);

export async function POST(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  if (!auth.ok) return auth.res;

  try {
    const body: any = await req.json().catch(() => ({}));

    const rawSource = (str(body?.source, 40) || 'n8n').toLowerCase();
    const source = ALLOWED_SOURCE.has(rawSource) ? rawSource : 'n8n';
    const workflow = str(body?.workflow, 80) || str(body?.task, 80) || 'unknown';
    const stage = str(body?.stage, 80) || null;
    const ok = body?.ok !== false;
    const detail = str(body?.detail ?? body?.message, 1000) || null;
    const atRaw = body?.at ? new Date(body.at) : new Date();
    const at = Number.isNaN(atRaw.getTime()) ? new Date() : atRaw;

    const log = await (prisma as any).notificationLog.create({
      data: {
        type: 'agent.log',
        channel: source,
        target: workflow,
        status: ok ? 'SENT' : 'FAILED',
        error: ok ? null : (detail || 'agent error'),
        payload: { ...body, source, workflow, stage, ok, loggedVia: auth.via },
        sentAt: at,
      },
    });

    // ── แจ้งเตือนทางอีเมล (ใช้แทน LINE ที่ยังไม่มีโทเคน) ──
    // ส่งเฉพาะเรื่องที่ควรรู้ — ไม่สแปมทุก page_view
    let emailResult = 'skipped';
    const important = !ok
      || /lead|ลีด|high|escalat|follow|ติดต่อ|agent|error|fail|form_submit|callback|สมัคร|ลงทะเบียน/i.test(
           `${workflow} ${stage} ${detail} ${JSON.stringify(body).slice(0, 600)}`);
    if (important) {
      try {
        const { sendMail } = await import('@/lib/mailer');
        const head = !ok ? '⚠️ ระบบแจ้งความผิดพลาด' : '🔔 แจ้งเตือนจากระบบ';
        const html = `<div style="font-family:sans-serif;line-height:1.6">
          <h3 style="margin:0 0 8px">${head}: ${workflow}</h3>
          <p style="margin:0 0 6px"><b>ขั้นตอน:</b> ${stage || '-'}</p>
          <p style="margin:0 0 6px"><b>รายละเอียด:</b> ${detail || '-'}</p>
          <p style="margin:12px 0 0;color:#666;font-size:12px">${at.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} · source=${source}</p>
        </div>`;
        const r: any = await sendMail({ to: 'akarapol.pro798@gmail.com', subject: `${head} ${workflow}`, html });
        emailResult = r?.ok ? `sent(${r?.provider})` : `failed(${r?.error || 'unknown'})`;
        console.log(`[agent-log] email ${emailResult} workflow=${workflow}`);
      } catch (err: any) {
        emailResult = `failed(${String(err?.message || err).slice(0, 120)})`;
      }
    }

    return NextResponse.json({
      ok: true,
      logged: true,
      id: log.id,
      type: 'agent.log',
      status: log.status,
      workflow,
      stage,
      via: auth.via,
      email: emailResult,
    });
  } catch (e: any) {
    console.error('[agent-log] error', e?.message);
    return NextResponse.json({ ok: false, error: 'บันทึก log ไม่สำเร็จ' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  if (!auth.ok) return auth.res;
  try {
    const db = prisma as any;
    const [count, latest] = await Promise.all([
      db.notificationLog.count({ where: { type: 'agent.log' } }).catch(() => 0),
      db.notificationLog.findMany({
        where: { type: 'agent.log' },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: { id: true, channel: true, target: true, status: true, error: true, createdAt: true },
      }).catch(() => []),
    ]);
    return NextResponse.json({
      ok: true,
      endpoint: '/api/agent-log',
      methods: ['POST'],
      body: { source: 'n8n', workflow: 'string', ok: 'boolean', stage: 'string', detail: 'string', at: 'ISO date' },
      note: 'ต้องเพิ่ม /api/agent-log ใน PUBLIC_API ของ src/middleware.ts ไม่งั้นจะโดน 401',
      total: count,
      latest,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}
