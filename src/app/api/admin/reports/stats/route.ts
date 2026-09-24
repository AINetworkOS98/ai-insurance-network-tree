import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { isSystemAdmin } from '@/lib/admin';

// GET /api/admin/reports/stats — Dashboard รายงานการติดต่อสมาชิก
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if (!token) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    let payload: any;
    try { payload = verifyToken(token); } catch { return NextResponse.json({ ok: false, error: 'โทเค็นไม่ถูกต้อง' }, { status: 401 }); }
    const userId = payload.sub || payload.id;
    const adm = await isSystemAdmin(userId);
    if (!adm.ok) return NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });

    const sp = new URL(req.url).searchParams;
    const from = sp.get('from'); // ISO date (YYYY-MM-DD)
    const to = sp.get('to');

    // ขอบเขตเวลา (Asia/Bangkok) — ใช้เกณฑ์ day boundary แบบประมาณด้วย UTC+7
    const range: any = {};
    if (from) {
      const d = new Date(`${from}T00:00:00+07:00`);
      if (!isNaN(d.getTime())) range.gte = d;
    }
    if (to) {
      const d = new Date(`${to}T23:59:59+07:00`);
      if (!isNaN(d.getTime())) range.lte = d;
    }
    const hasRange = range.gte || range.lte;
    const whereRange = hasRange ? { createdAt: range } : {};

    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    todayStart.setHours(todayStart.getHours() - 7); // เทียบ Asia/Bangkok แบบง่าย

    const [total, pending, replied, today, distinctMembers, rangeCount, avgReplySeconds, logs] = await Promise.all([
      prisma.memberMessage.count(),
      prisma.memberMessage.count({ where: { status: 'PENDING' } }),
      prisma.memberMessage.count({ where: { status: 'REPLIED' } }),
      prisma.memberMessage.count({ where: { createdAt: { gte: todayStart } } }),
      prisma.memberMessage.groupBy({ by: ['memberId'], _count: { memberId: true } }).then((r: any[]) => r.length),
      prisma.memberMessage.count({ where: whereRange }),
      // สถิติการตอบกลับ: เวลาเฉลี่ยจากถาม → ตอบ (นาที)
      prisma.$queryRawUnsafe(
        `SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (r."createdAt" - m."createdAt"))), 0) AS avg_sec
         FROM "MessageReply" r JOIN "MemberMessage" m ON m."id" = r."messageId"`
      ).then((rows: any) => Number(rows?.[0]?.avg_sec ?? 0) || 0),
      prisma.notificationLog.count().catch(() => 0),
    ]);

    return NextResponse.json({
      ok: true,
      stats: {
        total,
        pending,
        replied,
        today,
        distinctMembers,
        rangeCount: hasRange ? rangeCount : null,
        avgReplyMinutes: Math.round(avgReplySeconds / 60),
        notificationLogCount: logs,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}
