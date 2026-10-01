import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cronAuth';

// Vercel Cron — ตรวจรอบ "ต่ออายุอัตโนมัติ" ของสมาชิก (วันครบรอบปี)
// เรียก: GET /api/cron/renewal            → ต่ออายุจริงเฉพาะคนที่ถึงรอบ
//        GET /api/cron/renewal?dry=1      → ตรวจเท่านั้น ไม่เขียนข้อมูล
// ความปลอดภัย: ต้องมี Authorization: Bearer $CRON_SECRET (route บังคับเอง)
// รันซ้ำได้ไม่ซ้ำซ้อน — รอบที่ต่อแล้วจะเลื่อนวันถัดไปเก็บไว้ ไม่ต่อซ้ำ
export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;
  try {
    const url = new URL(req.url);
    const dry = ['1', 'true', 'yes'].includes(String(url.searchParams.get('dry') || '').toLowerCase());
    const { runRenewalCycle } = await import('@/lib/renewalEngine');
    const result = await runRenewalCycle({ dry, actorEmail: 'cron@system' });
    return NextResponse.json({
      ok: result.ok,
      dry: result.dry,
      ranAt: result.ranAt,
      checked: result.checked,
      renewed: result.renewed,
      wouldRenew: result.wouldRenew,
      skipped: result.skipped,
      errors: result.errors,
      autoRenewGlobal: result.autoRenewGlobal,
      rows: result.rows.slice(0, 50),
      error: result.error,
    }, { status: result.ok ? 200 : 500 });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'รันรอบต่ออายุไม่สำเร็จ' }, { status: 500 });
  }
}

export const POST = GET;
