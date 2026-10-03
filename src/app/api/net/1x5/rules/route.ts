import { NextResponse } from 'next/server';
import { loadRules, saveRules, requireNetAccess, netDenied, netAdminRequired } from '@/lib/net1x5';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET  /api/net/1x5/rules  → กติกาปัจจุบัน (ใครที่ล็อกอินอ่านได้)
 * POST /api/net/1x5/rules  → แก้กติกา (ผู้ดูแลระบบ หรือ Bearer CRON_SECRET เท่านั้น)
 * body: Partial<Net1x5Rules> เช่น { enforceCut:true, receiptDeadlineDays:10, priority:'performance', period:'2026-10' }
 * กติกาถูกเก็บใน DB (ReceiptSettings.settings.net1x5) + บันทึก Audit Log ทุกครั้งที่แก้
 */
export async function GET(req: Request) {
  const access = await requireNetAccess(req);
  if (!access.ok) return netDenied(access);
  const rules = await loadRules();
  return NextResponse.json({ ok: true, canAdmin: access.isAdmin, rules });
}

export async function POST(req: Request) {
  const access = await requireNetAccess(req);
  if (!access.ok) return netDenied(access);
  if (!access.isAdmin) return netAdminRequired();

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const patch: any = {};
    const bools = ['requireReceipt', 'enforceCut', 'autoPromote', 'fillVacancy', 'notify'];
    for (const k of bools) if (typeof body[k] === 'boolean') patch[k] = body[k];
    const nums = ['receiptDeadlineDays', 'deadlineDayOfMonth', 'deadlineHour', 'minVerifiedAmount', 'graceDays'];
    for (const k of nums) if (body[k] !== undefined && Number.isFinite(Number(body[k]))) patch[k] = Number(body[k]);
    if (typeof body.priority === 'string') patch.priority = body.priority;
    if (typeof body.period === 'string' && /^\d{4}-\d{2}$/.test(body.period)) patch.period = body.period;

    if (!Object.keys(patch).length) {
      return NextResponse.json({ ok: false, error: 'no_changes', message: 'ไม่พบค่าที่จะแก้ไข' }, { status: 400 });
    }
    const saved = await saveRules(patch, access.userId);
    return NextResponse.json({
      ok: true,
      rules: saved,
      message: saved.enforceCut
        ? 'บันทึกแล้ว — เปิด "คัดออกอัตโนมัติ" ระบบจะตัดสมาชิกที่ไม่ผ่านเงื่อนไขจริงทันทีในรอบถัดไป'
        : 'บันทึกแล้ว — ระบบจะตรวจและรายงานผล แต่ยังไม่ตัดสมาชิกออก (รอผู้ดูแลยืนยัน)',
    });
  } catch (e: any) {
    console.error('[POST /api/net/1x5/rules]', e?.message);
    return NextResponse.json({ ok: false, error: 'rules_save_failed', message: e?.message }, { status: 500 });
  }
}
