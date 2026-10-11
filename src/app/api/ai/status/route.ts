import { NextRequest, NextResponse } from 'next/server';
import { getHermesProvider, providerChain } from '@/lib/ai/hermesProvider';

// GET /api/ai/status — ตรวจสอบสถานะ Hermes เบื้องหลัง (admin only ถ้ามี token)
// แต่ถ้าไม่มี token ก็ตอบแบบ public ว่า configured หรือไม่ — ไม่ expose ชื่อ provider จริง
export async function GET(req: NextRequest){
  const p = getHermesProvider();
  const info = p.getInfo();
  const userRank = req.headers.get('x-user-rank');
  const isAdmin = userRank && Number(userRank) >= 3;

  // ── ความสดของ sync ล่าสุด (heartbeat ที่ /api/cron/hermes-sync เขียนไว้ → NotificationLog) ──
  // fail-safe: DB ล่มก็ยังตอบ status ได้ (syncedAt = null) ไม่ให้หน้าเว็บพัง
  let syncedAt: string | null = null;
  let syncAgeSeconds: number | null = null;
  try{
    const { prisma } = await import('@/lib/prisma');
    const row: any = await (prisma as any).notificationLog.findFirst({
      where: { type: 'agent.log', status: 'SENT', target: 'hermes-sync' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    if (row?.createdAt){
      const t = new Date(row.createdAt).getTime();
      syncedAt = new Date(t).toISOString();
      syncAgeSeconds = Math.max(0, Math.round((Date.now() - t) / 1000));
    }
  }catch{ /* ignore — คืน null */ }

  return NextResponse.json({
    ok: true,
    displayName: 'ระบบค้นหาด้วย AI อัจฉริยะ',
    configured: info.configured,
    streaming: true,
    syncedAt,
    syncAgeSeconds,
    syncFresh: syncAgeSeconds === null ? null : syncAgeSeconds <= 300,
    // รายละเอียด provider จริงแสดงเฉพาะ admin
    ...(isAdmin ? { provider: info.provider, model: info.model, failover: providerChain().map(c => c.provider) } : {}),
    gateway: 'active',
    modes: ['เร็ว','อัจฉริยะ','วิเคราะห์เชิงลึก'],
  });
}
