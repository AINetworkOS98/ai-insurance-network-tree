import { NextRequest, NextResponse } from 'next/server';
import { verifyTokenEdge } from '@/lib/auth-edge';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/admin/run-autopilot — สั่งท่อ "AI Content Autopilot" จากหน้า /admin
//
// ทำไมต้องมี route นี้ (ไม่ให้ browser ยิง n8n ตรง ๆ):
//   • n8n รันอยู่ในเครื่องผู้ใช้ → เปิดเข้าได้ผ่าน tunnel เท่านั้น
//   • CRON_SECRET และที่อยู่ tunnel ต้องอยู่ฝั่ง server เท่านั้น (ไม่ bake ลง JS ของเบราว์เซอร์)
//   • จำกัดสิทธิ์: ผู้ดูแลระบบ (อีเมล ADMIN) หรือ rankLevel ≥ 2
//
// body: { post?: boolean, skipGenerate?: boolean, conversation?, project?, aspect? }
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'akarapol.pro798@gmail.com';
const WEBHOOK_PATH = 'ai-content-autopilot';

function token(req: NextRequest): string {
  return (
    req.cookies.get('token')?.value ||
    req.cookies.get('auth_token')?.value ||
    (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '') ||
    ''
  );
}

export async function GET(req: NextRequest) {
  const t = token(req);
  const me: any = t ? await verifyTokenEdge(t) : null;
  const isAdmin = !!me && (String(me.email || '').toLowerCase() === ADMIN_EMAIL || Number(me.rankLevel ?? 0) >= 2);
  if (!isAdmin) return NextResponse.json({ ok: false, error: 'unauthorized — ต้องเป็นผู้ดูแลระบบ' }, { status: 401 });

  const url = new URL(req.url);
  if (url.searchParams.get('status') === '1') {
    // สถานะการรันล่าสุด (n8n เขียน log ผ่าน /api/agent-log เมื่อท่อจบ)
    const { prisma } = await import('@/lib/prisma');
    const rows: any[] = await (prisma as any).notificationLog
      .findMany({
        where: { type: 'agent.log', target: 'AI Content Autopilot' },
        orderBy: { sentAt: 'desc' },
        take: 8,
        select: { id: true, status: true, error: true, sentAt: true, payload: true },
      })
      .catch(() => []);
    return NextResponse.json({
      ok: true,
      configured: Boolean(process.env.N8N_WEBHOOK_BASE),
      runs: rows.map((r) => ({
        id: r.id,
        status: r.status,
        at: r.sentAt,
        stage: (r.payload && r.payload.stage) || '',
        detail: (r.payload && r.payload.detail) || r.error || '',
        ok: r.status === 'SENT',
      })),
    });
  }

  const base = (process.env.N8N_WEBHOOK_BASE || '').replace(/\/+$/, '');
  return NextResponse.json({
    ok: true,
    spec: 'POST { post?, skipGenerate?, conversation?, project?, aspect? } — ผู้ดูแลระบบเท่านั้น · GET ?status=1 = ผลการรันล่าสุด',
    configured: Boolean(base),
    // ไม่เปิดเผยที่อยู่ tunnel ให้ผู้ที่ยังไม่ล็อกอิน
    ...(me ? { tunnelHost: base ? new URL(base).host : null } : {}),
  });
}

export async function POST(req: NextRequest) {
  const t = token(req);
  const me: any = t ? await verifyTokenEdge(t) : null;
  if (!me) return NextResponse.json({ ok: false, error: 'unauthorized — ต้องล็อกอินก่อน' }, { status: 401 });
  const isAdmin = String(me.email || '').toLowerCase() === ADMIN_EMAIL || Number(me.rankLevel ?? 0) >= 2;
  if (!isAdmin) return NextResponse.json({ ok: false, error: 'forbidden — เฉพาะผู้ดูแลระบบ' }, { status: 403 });

  const base = (process.env.N8N_WEBHOOK_BASE || '').replace(/\/+$/, '');
  const secret = process.env.CRON_SECRET || '';
  if (!base) {
    return NextResponse.json({ ok: false, error: 'N8N_WEBHOOK_BASE ยังไม่ได้ตั้งค่า (ต้องเป็น URL ของ tunnel ที่ชี้ไป n8n ในเครื่อง)' }, { status: 500 });
  }

  const body: any = await req.json().catch(() => ({}));
  const payload = {
    post: !!body.post,
    skipGenerate: !!body.skipGenerate,
    conversation: body.conversation || undefined,
    project: body.project || undefined,
    aspect: body.aspect || '9:16',
  };

  try {
    // n8n ตั้ง webhook เป็น onReceived แล้ว → ตอบ "Workflow was started" ทันที
    // ส่วนการสร้าง/โพสต์จริงทำเบื้องหลัง แล้ว page จะ poll สถานะจาก GET ?status=1
    const r = await fetch(`${base}/${WEBHOOK_PATH}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(25000),
    });
    const text = await r.text();
    if (!r.ok) {
      return NextResponse.json({ ok: false, started: false, error: `n8n ตอบ ${r.status}: ${text.slice(0, 200)}` }, { status: 502 });
    }
    return NextResponse.json({ ok: true, started: true, n8n: text.slice(0, 160), at: new Date().toISOString() });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, started: false, error: 'เรียก n8n ไม่สำเร็จ: ' + String(e?.message || e) + ' (ตรวจว่า tunnel และ n8n ในเครื่องทำงานอยู่)' },
      { status: 502 },
    );
  }
}
