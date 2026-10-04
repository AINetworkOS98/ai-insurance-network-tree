import { NextRequest, NextResponse } from 'next/server';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/n8n/workflows — รายการ workflow ที่ "ระบบตรวจจับได้" (สำหรับหน้าเว็บ)
//
// ใช้โดย: คอมโพเนนต์ N8nWorkflowMonitor บนหน้า /n8n/workflow-3d
//   • ดึงจากตาราง n8n_workflow_watch (เขียนโดยตัวตรวจจับบนเครื่องที่รัน n8n)
//   • หน้าเว็บเรียกซ้ำทุก 10 วินาที → เห็น workflow ใหม่ "ขึ้นในระบบ" เองโดยไม่ต้องรีเฟรช
//   • สิทธิ์: ต้องล็อกอิน (คุกกี้ token) หรือ Bearer CRON_SECRET (ให้ n8n/สคริปต์เรียกได้)
//   • ข้อมูลที่ส่งออก: ชื่อ workflow/สถานะ/จำนวนโหนด/เวลาที่ตรวจพบ — ไม่มีข้อมูลส่วนบุคคล
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NEW_WINDOW_MS = 24 * 60 * 60 * 1000;      // นับเป็น "ใหม่" ภายใน 24 ชั่วโมง
const STALE_MS = 3 * 60 * 1000;                 // ตัวตรวจจับถือว่า "ไม่ทำงาน" ถ้าไม่ส่งข้อมูลเกิน 3 นาที

function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function allowed(req: NextRequest) {
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const cron = process.env.CRON_SECRET || '';
  if (bearer && cron && safeEqual(bearer, cron)) return true;

  const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value || '';
  if (!token) return false;
  try {
    const { verifyToken } = await import('@/lib/auth');
    return !!verifyToken(token);
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!(await allowed(req))) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });

  const now = Date.now();
  try {
    const { prisma } = await import('@/lib/prisma');
    const db: any = prisma as any;
    if (!db?.n8nWorkflowWatch) {
      return NextResponse.json({ ok: false, error: 'ยังไม่มีตาราง n8n_workflow_watch (รอ deploy migration)' }, { status: 503 });
    }

    const [rows, total, activeCount, newest] = await Promise.all([
      db.n8nWorkflowWatch.findMany({ orderBy: [{ firstSeenAt: 'desc' }], take: 60 }),
      db.n8nWorkflowWatch.count(),
      db.n8nWorkflowWatch.count({ where: { active: true } }),
      db.n8nWorkflowWatch.findFirst({ orderBy: { lastSeenAt: 'desc' }, select: { lastSeenAt: true } }),
    ]);

    const lastSeenAt: string | null = newest?.lastSeenAt ? new Date(newest.lastSeenAt).toISOString() : null;
    const ageMs = lastSeenAt ? now - new Date(lastSeenAt).getTime() : null;
    const newCount = rows.filter((r: any) => now - new Date(r.firstSeenAt).getTime() <= NEW_WINDOW_MS).length;

    return NextResponse.json({
      ok: true,
      count: total,
      active: activeCount,
      newCount,
      lastSeenAt,
      ageSeconds: ageMs === null ? null : Math.round(ageMs / 1000),
      watcherOnline: ageMs !== null && ageMs <= STALE_MS,
      workflows: rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        active: !!r.active,
        nodeCount: r.nodeCount,
        isNew: now - new Date(r.firstSeenAt).getTime() <= NEW_WINDOW_MS,
        firstSeenAt: new Date(r.firstSeenAt).toISOString(),
        n8nUpdatedAt: r.n8nUpdatedAt ? new Date(r.n8nUpdatedAt).toISOString() : null,
      })),
      at: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 200), at: new Date().toISOString() }, { status: 500 });
  }
}
