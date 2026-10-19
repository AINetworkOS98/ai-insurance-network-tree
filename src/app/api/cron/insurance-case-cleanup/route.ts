import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cronAuth';
import { prisma } from '@/lib/prisma';

// Vercel Cron — ลบเคสทำประกันที่หมดอายุ (PDPA: เก็บ 180 วัน)
// เรียก: GET /api/cron/insurance-case-cleanup            → ลบเคสที่ expiresAt < now
//        GET /api/cron/insurance-case-cleanup?dry=1      → นับอย่างเดียว ไม่ลบ
// ความปลอดภัย: ต้องมี Authorization: Bearer <CRON_SECRET> (route บังคับเอง)
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  const dry = ['1', 'true', 'yes'].includes(String(new URL(req.url).searchParams.get('dry') || '').toLowerCase());
  const now = new Date();

  try {
    const expired = await prisma.insuranceCase.findMany({
      where: { expiresAt: { lt: now } },
      select: { id: true, caseNo: true, expiresAt: true },
      take: 1000,
    });

    if (dry || expired.length === 0) {
      return NextResponse.json({ ok: true, dry, ranAt: now.toISOString(), wouldDelete: expired.length, caseNos: expired.slice(0, 20).map(r => r.caseNo) });
    }

    const del = await prisma.insuranceCase.deleteMany({ where: { expiresAt: { lt: now } } });

    await prisma.auditLog.create({
      data: {
        userId: null,
        action: 'insurance_case.purge',
        entity: 'InsuranceCase',
        entityId: 'expired',
        newValue: { deleted: del.count, caseNos: expired.slice(0, 50).map(r => r.caseNo) },
      },
    }).catch(() => null);

    return NextResponse.json({ ok: true, dry, ranAt: now.toISOString(), deleted: del.count, caseNos: expired.slice(0, 20).map(r => r.caseNo) });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}
