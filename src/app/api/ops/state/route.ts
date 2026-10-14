import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { authorizeLeadApi } from '@/lib/leadApiAuth';

// ─────────────────────────────────────────────────────────────────────────────
// /api/ops/state — สถานะทุกระบบที่ "ศูนย์ควบคุม AI" (ตัวรันในเครื่อง) ส่งขึ้นมา
//
// POST : ตัวรันในเครื่อง (Bearer CRON_SECRET) ส่ง snapshot → เก็บใน NotificationLog
//        type='ops.snapshot' (ใช้โมเดลเดิม ไม่แก้สคีมา) · เก็บย้อนหลัง 2 วัน
// GET  : หน้าเว็บผู้ดูแลอ่าน snapshot ล่าสุด + คำสั่งล่าสุด
//
// ⚠️ ต้องเพิ่ม '/api/ops' ใน PUBLIC_API ของ src/middleware.ts (route ตรวจสิทธิ์เอง)
//    และ snapshot ที่เก็บ "ไม่มี" ความลับ (route กรองฟิลด์อีกชั้นก่อนบันทึก)
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SNAP = 'ops.snapshot';
const CMD = 'ops.command';
const KEEP_DAYS = 2;

function s(v: unknown, max = 200): string | null {
  const t = typeof v === 'string' ? v.trim() : '';
  return t ? t.slice(0, max) : null;
}
function n(v: unknown): number | null {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

type SysIn = Record<string, unknown>;

function sanitize(body: any) {
  const systems = (Array.isArray(body?.systems) ? body.systems : []).slice(0, 80).map((x: SysIn) => ({
    id: s(x?.id, 40) || 'unknown',
    name: s(x?.name, 160) || '',
    group: s(x?.group, 40) || '',
    status: ['up', 'down', 'warn'].includes(String(x?.status)) ? String(x?.status) : 'down',
    critical: !!x?.critical,
    fix: s(x?.fix, 40),
    latencyMs: n(x?.latencyMs),
    detail: s(x?.detail, 300) || '',
    checkedAt: s(x?.checkedAt, 40),
  }));
  const sm = body?.summary || {};
  return {
    generatedAt: s(body?.generatedAt, 40) || new Date().toISOString(),
    host: s(body?.host, 80) || 'unknown',
    summary: { total: n(sm?.total) ?? systems.length, up: n(sm?.up) ?? 0, down: n(sm?.down) ?? 0, warn: n(sm?.warn) ?? 0 },
    systems,
    actions: (Array.isArray(body?.actions) ? body.actions : []).slice(0, 60).map((a: SysIn) => ({
      id: s(a?.id, 40), label: s(a?.label, 120), system: s(a?.system, 40), group: s(a?.group, 40), danger: !!a?.danger,
    })),
    logs: (Array.isArray(body?.logs) ? body.logs : []).slice(-25).map((l: unknown) => String(l).slice(0, 260)),
  };
}

export async function POST(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  if (!auth.ok) return auth.res;
  try {
    const body: any = await req.json().catch(() => ({}));
    const snap = sanitize(body);
    const row: any = await (prisma as any).notificationLog.create({
      data: { type: SNAP, channel: 'ai-control-tower', target: snap.host, status: 'SENT', payload: snap },
    });

    // เก็บกวาดของเก่า (ไม่ให้ตารางบวม) — ลบ snapshot ที่เกิน 2 วัน
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86400_000);
    (prisma as any).notificationLog
      .deleteMany({ where: { type: SNAP, createdAt: { lt: cutoff } } })
      .catch(() => { });

    return NextResponse.json({ ok: true, id: row.id, at: row.createdAt, systems: snap.systems.length });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  if (!auth.ok) return auth.res;
  try {
    const url = new URL(req.url);
    const withCommands = url.searchParams.get('commands') !== '0';
    const db: any = prisma as any;

    const [latest, cmds, count] = await Promise.all([
      db.notificationLog.findFirst({ where: { type: SNAP }, orderBy: { createdAt: 'desc' } }),
      withCommands
        ? db.notificationLog.findMany({ where: { type: CMD }, orderBy: { createdAt: 'desc' }, take: 12 })
        : Promise.resolve([]),
      db.notificationLog.count({ where: { type: SNAP } }),
    ]);

    if (!latest) {
      return NextResponse.json({ ok: true, ready: false, note: 'ยังไม่ได้รับสถานะจากศูนย์ควบคุมในเครื่อง', commands: [] });
    }

    const ageSeconds = Math.max(0, Math.round((Date.now() - new Date(latest.createdAt).getTime()) / 1000));
    const snap: any = latest.payload || {};

    return NextResponse.json({
      ok: true,
      ready: true,
      receivedAt: latest.createdAt,
      ageSeconds,
      fresh: ageSeconds <= 300, // ตัวรันในเครื่องส่งทุก 1 นาที → เกิน 5 นาที = ขาดการติดต่อ
      host: snap.host,
      generatedAt: snap.generatedAt,
      summary: snap.summary,
      systems: snap.systems || [],
      actions: snap.actions || [],
      logs: snap.logs || [],
      snapshotCount: count,
      commands: (cmds as any[]).map((c) => ({
        id: c.id,
        at: c.createdAt,
        status: c.status,
        action: c.payload?.action || null,
        text: c.payload?.text || null,
        by: c.payload?.requestedBy || null,
        result: c.payload?.result || null,
        ms: c.payload?.ms ?? null,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}
