import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { isSystemAdmin } from '@/lib/admin';
import { getLineConfig, sendLineMessage } from '@/lib/line';
import { prisma } from '@/lib/prisma';

// GET /api/admin/line/status — สถานะ LINE integration (ไม่เปิดเผย secret)
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if (!token) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    let payload: any;
    try { payload = verifyToken(token); } catch { return NextResponse.json({ ok: false, error: 'โทเค็นไม่ถูกต้อง' }, { status: 401 }); }
    const userId = payload.sub || payload.id;
    const adm = await isSystemAdmin(userId);
    if (!adm.ok) return NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });

    const cfg = getLineConfig();
    const emailConfigured = !!(process.env.EMAIL_API_KEY && process.env.EMAIL_FROM_ADDRESS);
    return NextResponse.json({
      ok: true,
      line: {
        connected: cfg.configured,
        // เปิดเผยแค่ปลายทาง ไม่เปิด token
        targetIdConfigured: !!cfg.targetId,
        targetIdMasked: cfg.targetId ? maskTarget(cfg.targetId) : null,
      },
      email: { connected: emailConfigured },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}

// POST /api/admin/line/test — ส่งข้อความทดสอบ LINE
export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if (!token) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    let payload: any;
    try { payload = verifyToken(token); } catch { return NextResponse.json({ ok: false, error: 'โทเค็นไม่ถูกต้อง' }, { status: 401 }); }
    const userId = payload.sub || payload.id;
    const adm = await isSystemAdmin(userId);
    if (!adm.ok) return NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });

    const cfg = getLineConfig();
    if (!cfg.configured) {
      return NextResponse.json({ ok: false, error: 'LINE ยังไม่ได้ตั้งค่า — ตั้ง LINE_CHANNEL_ACCESS_TOKEN และ LINE_TARGET_ID ใน Environment Variables' }, { status: 400 });
    }

    const result = await sendLineMessage(`🧪 ทดสอบการเชื่อมต่อ LINE\n\nส่งจากระบบ Admin AI Insurance Network Tree\nเวลา: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);

    await (prisma as any).notificationLog.create({
      data: {
        type: 'line.test', channel: 'line', target: cfg.targetId,
        status: result.ok ? 'SENT' : 'FAILED', error: result.error || null,
        sentAt: result.ok ? new Date() : null,
      },
    }).catch(() => {});

    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}

function maskTarget(t: string) {
  if (t.length <= 4) return '••••';
  return t.slice(0, 3) + '••••' + t.slice(-3);
}
