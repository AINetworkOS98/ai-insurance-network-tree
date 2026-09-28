import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getDb } from '@/lib/firebase-admin';
import { randomUUID } from 'node:crypto';

// จับ IP จาก request headers (Vercel / Next.js)
function getClientIP(req: NextRequest): string {
  const xForwardedFor = req.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const ips = xForwardedFor.split(',').map(ip => ip.trim());
    return ips[0] || '';
  }
  const xRealIp = req.headers.get('x-real-ip');
  if (xRealIp) return xRealIp;
  const cfIp = req.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp;
  return '';
}

// GET /api/admin/visitor-activity — ดึงกิจกรรมล่าสุด + อัปเดต session ตัวเอง
export async function GET(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const userAgent = req.headers.get('user-agent') || '';

    // ดึง token ของผู้ขอ (ถ้า login)
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value
      || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    let userId: string | null = null;
    let userRank = 0;
    if (token) {
      try {
        const payload = verifyToken(token);
        if (payload) {
          userId = payload.sub;
          userRank = payload.rankLevel || 0;
        }
      } catch { /* ไม่ใช่ token ที่ถูกต้อง */ }
    }

    // อัปเดต session ของตัวเอง (ถ้า login และมี IP)
    if (userId && ip) {
      try {
        await prisma.userSession.upsert({
          where: { id: `session-${userId}` },
          update: {
            ip,
            userAgent,
            lastActiveAt: new Date(),
          },
          create: {
            id: `session-${userId}`,
            userId,
            tokenHash: randomUUID(),
            ip,
            userAgent,
            lastActiveAt: new Date(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });
        // อัปเดต lastActive ของ user ด้วย
        await prisma.user.update({
          where: { id: userId },
          data: { updatedAt: new Date() },
        }).catch(() => {});
      } catch (e) {
        console.error('session upsert error:', e);
      }
    }

    // ดึงลิสต์ activity ล่าสุด (100 รายการ)
    const sessions = await prisma.userSession.findMany({
      take: 100,
      orderBy: { lastActiveAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            phone: true,
            lineId: true,
            memberCode: true,
            displayName: true,
            status: true,
            firstName: true,
            lastName: true,
          },
        },
      },
    });

    const activity = sessions.map(s => ({
      id: s.id,
      userId: s.userId,
      ip: s.ip || 'unknown',
      userAgent: s.userAgent ? s.userAgent.slice(0, 100) : '-',
      lastActiveAt: s.lastActiveAt.toISOString(),
      user: s.user ? {
        id: s.user.id,
        displayName: s.user.displayName || `${s.user.firstName || ''} ${s.user.lastName || ''}`.trim() || s.user.email,
        email: s.user.email,
        phone: s.user.phone,
        lineId: s.user.lineId,
        memberCode: s.user.memberCode,
        status: s.user.status,
      } : null,
    }));

    return NextResponse.json({ ok: true, activity, loggedIn: !!userId, myIP: userId ? ip : null });
  } catch (error: any) {
    console.error('visitor-activity error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

// POST /api/admin/visitor-activity/log — บังคับล็อก IP (สำหรับระบบอื่นเรียก)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const userId = body.userId || '';
    const ip = body.ip || getClientIP(req) || 'unknown';
    const userAgent = body.userAgent || req.headers.get('user-agent') || '';

    if (!userId) {
      return NextResponse.json({ ok: false, error: 'userId จำเป็น' }, { status: 400 });
    }

    await prisma.userSession.upsert({
      where: { id: `session-${userId}` },
      update: {
        ip,
        userAgent,
        lastActiveAt: new Date(),
      },
      create: {
        id: `session-${userId}`,
        userId,
        tokenHash: randomUUID(),
        ip,
        userAgent,
        lastActiveAt: new Date(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return NextResponse.json({ ok: true, logged: true });
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
