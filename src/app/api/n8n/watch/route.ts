import { NextRequest, NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/n8n/watch — รับรายการ workflow ที่ "ตัวตรวจจับ" สแกนได้จาก n8n
// GET  /api/n8n/watch — ตรวจสุขภาพของตัวรับ (ต้องมี Bearer เท่านั้น)
//
// ผู้ส่ง: scripts/n8n-workflow-watch.mjs (รันบนเครื่องที่รัน n8n อยู่ ที่ localhost:5679)
//        ตัวส่งอ่านตาราง workflow_entity จากฐานข้อมูล n8n โดยตรง (อ่านอย่างเดียว)
//        แล้ว POST เข้ามาที่นี่ทุก ๆ 20 วินาที (ส่งทันทีเมื่อพบการเปลี่ยนแปลง)
//
// ความปลอดภัย:
//   • ต้องมี Authorization: Bearer <CRON_SECRET หรือ N8N_WATCH_SECRET> — เทียบแบบ timing-safe
//   • ถ้าไม่ได้ตั้ง secret เลย = fail closed (500) ไม่เปิดสาธารณะ
//   • ข้อมูลที่รับเข้าเป็น "ชื่อ/สถานะ/จำนวนโหนด" ของ workflow เท่านั้น ไม่มีข้อมูลส่วนบุคคล
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_ITEMS = 500;
const MAX_NAME = 200;

function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** ยอมรับได้ทั้ง CRON_SECRET (ที่มีอยู่เดิม) และ N8N_WATCH_SECRET (แยกได้ถ้าต้องการ) */
function authed(req: NextRequest) {
  const cron = process.env.CRON_SECRET || '';
  const watch = process.env.N8N_WATCH_SECRET || '';
  if (!cron && !watch) return 'no-secret';
  const auth = req.headers.get('authorization') || '';
  if (cron && safeEqual(auth, `Bearer ${cron}`)) return 'ok';
  if (watch && safeEqual(auth, `Bearer ${watch}`)) return 'ok';
  return 'forbidden';
}

type Incoming = {
  id?: unknown; name?: unknown; active?: unknown; nodeCount?: unknown;
  createdAt?: unknown; updatedAt?: unknown;
};

function parseAt(v: unknown): Date | null {
  if (typeof v !== 'string' || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function POST(req: NextRequest) {
  const verdict = authed(req);
  if (verdict === 'no-secret') {
    return NextResponse.json({ ok: false, error: 'ยังไม่ได้ตั้ง CRON_SECRET — ปิดทางรับข้อมูลไว้ก่อน' }, { status: 500 });
  }
  if (verdict !== 'ok') return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  let body: any = null;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 }); }

  const raw: Incoming[] = Array.isArray(body?.workflows) ? body.workflows.slice(0, MAX_ITEMS) : [];
  const source = typeof body?.source === 'string' && body.source ? body.source.slice(0, 60) : 'n8n-local';
  const items = raw
    .filter(w => typeof w?.id === 'string' && (w.id as string).length > 0)
    .map(w => ({
      id: String(w.id).slice(0, 64),
      name: String(w.name || '(ไม่มีชื่อ)').slice(0, MAX_NAME),
      active: w.active === true || w.active === 1,
      nodeCount: Number.isFinite(Number(w.nodeCount)) ? Math.max(0, Math.min(5000, Number(w.nodeCount))) : 0,
      n8nCreatedAt: parseAt(w.createdAt),
      n8nUpdatedAt: parseAt(w.updatedAt),
    }));

  if (!items.length) return NextResponse.json({ ok: true, seen: 0, created: 0, updated: 0, note: 'ไม่มีรายการส่งมา' });

  const now = new Date();
  let created = 0, updated = 0;
  const failed: string[] = [];

  try {
    const { prisma } = await import('@/lib/prisma');
    const db: any = prisma as any;
    if (!db?.n8nWorkflowWatch) {
      return NextResponse.json({ ok: false, error: 'ยังไม่ได้ generate prisma client สำหรับตาราง n8n_workflow_watch' }, { status: 503 });
    }

    // รู้ว่าอะไร "ใหม่" = id ที่ไม่เคยมีในตารางมาก่อน
    const ids = items.map(i => i.id);
    const existing: any[] = await db.n8nWorkflowWatch.findMany({ where: { id: { in: ids } }, select: { id: true } }).catch(() => []);
    const known = new Set(existing.map(e => e.id));

    for (const it of items) {
      try {
        if (known.has(it.id)) {
          await db.n8nWorkflowWatch.update({
            where: { id: it.id },
            data: {
              name: it.name, active: it.active, nodeCount: it.nodeCount,
              n8nCreatedAt: it.n8nCreatedAt, n8nUpdatedAt: it.n8nUpdatedAt,
              lastSeenAt: now, source,
            },
          });
          updated++;
        } else {
          await db.n8nWorkflowWatch.create({
            data: {
              id: it.id, name: it.name, active: it.active, nodeCount: it.nodeCount,
              n8nCreatedAt: it.n8nCreatedAt, n8nUpdatedAt: it.n8nUpdatedAt,
              firstSeenAt: now, lastSeenAt: now, source,
            },
          });
          created++;
        }
      } catch (e: any) {
        failed.push(`${it.id}:${String(e?.message || e).slice(0, 80)}`);
      }
    }

    const total = await db.n8nWorkflowWatch.count().catch(() => null);
    return NextResponse.json({ ok: true, seen: items.length, created, updated, failed: failed.slice(0, 5), total, at: now.toISOString() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const verdict = authed(req);
  if (verdict === 'no-secret') {
    return NextResponse.json({ ok: false, error: 'ยังไม่ได้ตั้ง CRON_SECRET' }, { status: 500 });
  }
  if (verdict !== 'ok') return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });

  try {
    const { prisma } = await import('@/lib/prisma');
    const db: any = prisma as any;
    const [total, active, newest] = await Promise.all([
      db.n8nWorkflowWatch.count(),
      db.n8nWorkflowWatch.count({ where: { active: true } }),
      db.n8nWorkflowWatch.findFirst({ orderBy: { lastSeenAt: 'desc' }, select: { lastSeenAt: true } }),
    ]);
    return NextResponse.json({ ok: true, total, active, lastSeenAt: newest?.lastSeenAt || null, at: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 200) }, { status: 500 });
  }
}
