import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeLeadApi } from '@/lib/leadApiAuth';
import { verifyToken } from '@/lib/auth';
import { isSystemAdmin } from '@/lib/admin';

// ─────────────────────────────────────────────────────────────────────────────
// /api/ops/command — สั่งงานศูนย์ควบคุม AI จากหน้าเว็บ (คิวคำสั่ง)
//
// POST  : ผู้ดูแลระบบ (คุกกี้ token) เท่านั้น → ฝากคำสั่งลงคิว (status=PENDING)
// GET   : ตัวรันในเครื่อง (Bearer CRON_SECRET) ดึงคำสั่งค้าง ?status=pending
// PATCH : ตัวรันในเครื่องเขียนผลกลับ → status=SENT (สำเร็จ) / FAILED (ไม่สำเร็จ)
//
// เหตุที่ใช้คิวดึง (pull) ไม่ใช่ push: ตัวรันอยู่ในเครื่องหลังเราเตอร์ —
// คลาวด์เรียกเข้าไม่ได้ แต่ตัวรันเรียกออกได้ · ปลอดภัยกว่าเปิดพอร์ตออกอินเทอร์เน็ต
//
// ⚠️ ต้องเพิ่ม '/api/ops' ใน PUBLIC_API ของ src/middleware.ts (route ตรวจสิทธิ์เอง)
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const CMD = 'ops.command';

// คำสั่งที่ยอมให้ฝากเข้าคิวได้ (allowlist เดียวกับตัวรันในเครื่อง)
const ALLOWED = new Set([
  'ensure-all', 'probe-now', 'n8n_start', 'n8n_restart', 'local_runner_start', 'cdp_flow_start',
  'deploy_vercel', 'hostinger_sync', 'hostinger_check', 'run_autopilot', 'register_report',
  'web_selftest', 'pdf_free_temp', 'hermes_report', 'app_vercel_check',
]);

function s(v: unknown, max = 300): string | null {
  const t = typeof v === 'string' ? v.trim() : '';
  return t ? t.slice(0, max) : null;
}

// ── POST: ผู้ดูแลฝากคำสั่ง ───────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
  if (!token) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  let payload: any;
  try { payload = verifyToken(token); } catch { return NextResponse.json({ ok: false, error: 'โทเค็นไม่ถูกต้อง' }, { status: 401 }); }
  const userId = payload?.sub || payload?.id;
  const adm = await isSystemAdmin(userId);
  if (!adm.ok) return NextResponse.json({ ok: false, error: 'สั่งงานระบบได้เฉพาะผู้ดูแลระบบ' }, { status: 403 });

  try {
    const body: any = await req.json().catch(() => ({}));
    const action = s(body?.action, 40);
    const text = s(body?.text, 300);
    if (!action && !text) return NextResponse.json({ ok: false, error: 'ต้องระบุ action หรือ text' }, { status: 400 });
    if (action && !ALLOWED.has(action)) return NextResponse.json({ ok: false, error: `ไม่อนุญาตคำสั่ง "${action}"` }, { status: 400 });

    const params = (body?.params && typeof body.params === 'object') ? body.params : {};

    // กันกดรัว: ถ้ามีคำสั่งเดียวกันค้างอยู่ไม่เกิน 2 นาที → ไม่ต้องเพิ่มซ้ำ
    const dup: any = await (prisma as any).notificationLog.findFirst({
      where: { type: CMD, status: 'PENDING', target: action || text || 'unknown', createdAt: { gte: new Date(Date.now() - 120_000) } },
      orderBy: { createdAt: 'desc' },
    }).catch(() => null);
    if (dup) return NextResponse.json({ ok: true, queued: false, duplicate: true, id: dup.id, note: 'คำสั่งเดียวกันเพิ่งถูกฝากไว้เมื่อครู่นี้ — รอผลลัพธ์อยู่' });

    const row: any = await (prisma as any).notificationLog.create({
      data: {
        type: CMD,
        channel: 'ai-control-tower',
        target: action || text || 'unknown',
        status: 'PENDING',
        payload: { action, text, params, requestedBy: adm.user?.email || userId || null, requestedAt: new Date().toISOString() },
      },
    });
    return NextResponse.json({ ok: true, queued: true, id: row.id, note: 'ฝากคำสั่งแล้ว — ศูนย์ควบคุมในเครื่องจะรับไปทำภายใน 1 นาที' });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}

// ── GET: ตัวรันในเครื่องดึงคิว ───────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  if (!auth.ok) return auth.res;
  try {
    const url = new URL(req.url);
    const status = (url.searchParams.get('status') || 'pending').toLowerCase();
    const st = status === 'pending' ? 'PENDING' : status === 'done' ? 'SENT' : status === 'failed' ? 'FAILED' : null;
    const rows: any[] = await (prisma as any).notificationLog.findMany({
      where: { type: CMD, ...(st ? { status: st } : {}), ...(st === 'PENDING' ? { createdAt: { gte: new Date(Date.now() - 30 * 60_000) } } : {}) },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });
    return NextResponse.json({
      ok: true,
      count: rows.length,
      commands: rows.map((r) => ({
        id: r.id,
        action: r.payload?.action || null,
        text: r.payload?.text || null,
        params: r.payload?.params || {},
        by: r.payload?.requestedBy || null,
        createdAt: r.createdAt,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}

// ── PATCH: ตัวรันในเครื่องเขียนผลกลับ ────────────────────────────────────────
export async function PATCH(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  if (!auth.ok) return auth.res;
  try {
    const body: any = await req.json().catch(() => ({}));
    const id = s(body?.id, 60);
    if (!id) return NextResponse.json({ ok: false, error: 'ต้องระบุ id' }, { status: 400 });
    const status = body?.status === 'SENT' ? 'SENT' : 'FAILED';

    const row: any = await (prisma as any).notificationLog.findUnique({ where: { id } });
    if (!row) return NextResponse.json({ ok: false, error: 'ไม่พบคำสั่งนี้' }, { status: 404 });

    const merged = {
      ...(row.payload || {}),
      action: s(body?.action, 40) || row.payload?.action || null,
      result: s(body?.result, 1500),
      ms: Number(body?.ms) || null,
      finishedAt: new Date().toISOString(),
    };
    await (prisma as any).notificationLog.update({
      where: { id },
      data: { status, error: status === 'FAILED' ? s(body?.result, 500) : null, payload: merged },
    });
    return NextResponse.json({ ok: true, id, status });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}
