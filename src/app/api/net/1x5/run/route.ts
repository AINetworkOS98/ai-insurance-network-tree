import { NextResponse } from 'next/server';
import { runCycle, loadRules, requireNetAccess, netDenied, netAdminRequired, maskIfNotAdmin } from '@/lib/net1x5';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * POST /api/net/1x5/run
 * รันวงจรอัตโนมัติเต็มรูปแบบตามสเปก:
 *   ตรวจสอบเงื่อนไข → ระบุสมาชิกที่ไม่ผ่าน → นำออกจากตำแหน่ง → ค้นหาผู้มีคุณสมบัติครบ
 *   → เลื่อนขึ้นแทน → ปรับสายงาน 1 แตก 5 → อัปเดตโครงสร้างทุกระดับ → แจ้งเตือน → เก็บ Log
 *
 * body: { mode: 'preview'|'apply', period?: 'YYYY-MM', idempotencyKey?: string, n8n?: boolean }
 *  - mode = preview : ตรวจแล้วรายงานผล ไม่เขียนข้อมูลจริง (ใครก็ที่ล็อกอินเรียกได้)
 *  - mode = apply   : เขียนข้อมูลจริง (คัดออก/เลื่อนตำแหน่ง) → ผู้ดูแลระบบ หรือ Bearer CRON_SECRET เท่านั้น
 *  - idempotencyKey : กันรันซ้ำจาก n8n (คีย์เดิม = ไม่ทำซ้ำ)
 */
export async function POST(req: Request) {
  const access = await requireNetAccess(req);
  if (!access.ok) return netDenied(access);

  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const mode: 'preview' | 'apply' = body.mode === 'apply' || body.apply === true ? 'apply' : 'preview';
    const rules = await loadRules();
    const period = /^\d{4}-\d{2}$/.test(String(body.period || '')) ? String(body.period) : rules.period;

    if (mode === 'apply' && !access.isAdmin) return netAdminRequired();

    // idempotency: คีย์เดิมเคยรันแล้ว → ไม่ทำซ้ำ (สำหรับ n8n ที่ยิงซ้ำ)
    const idempotencyKey = body.idempotencyKey ? String(body.idempotencyKey).slice(0, 120) : `net1x5-${period}-${mode}-${new Date().toISOString().slice(0, 13)}`;
    if (mode === 'apply') {
      const existed: any = await (await import('@/lib/prisma')).prisma.placementRun
        .findUnique({ where: { idempotencyKey } }).catch(() => null);
      if (existed) {
        return NextResponse.json({ ok: true, idempotent: true, runId: existed.id, mode, period, message: 'รอบนี้ดำเนินการไปแล้ว (idempotency key ซ้ำ)' });
      }
    }

    const result = await runCycle({ mode, actorId: access.userId, period, idempotencyKey });

    const isAdmin = access.isAdmin;
    return NextResponse.json({
      ok: true,
      via: access.via,
      canAdmin: isAdmin,
      mode: result.mode,
      runId: result.runId,
      period: result.period,
      deadline: result.deadline,
      summary: result.summary,
      steps: result.steps.map((s) => ({
        ...s,
        items: s.items ? maskIfNotAdmin(s.items.map((i: any) => ({ code: i.code || '', name: i.name || i.parentName || '', ...i })), isAdmin) : undefined,
      })),
      failed: maskIfNotAdmin(result.failed, isAdmin),
      cut: maskIfNotAdmin(result.cut as any, isAdmin),
      promotions: maskIfNotAdmin(result.promotions as any, isAdmin),
      vacancies: result.vacancies.map((v) => ({ ...v, parentName: isAdmin ? v.parentName : 'สมาชิก (ปกปิดชื่อ)' })),
      candidates: maskIfNotAdmin(result.candidates, isAdmin).slice(0, 100),
      warnings: result.warnings,
      rules: result.rules,
      disclaimer: result.mode === 'apply'
        ? 'รันจริงแล้ว — ทุกการคัดออก/เลื่อนตำแหน่งถูกบันทึกใน Audit Log + PlacementHistory + PlacementRun (ตรวจสอบย้อนหลังได้)'
        : 'โหมดตรวจสอบ (preview) — ยังไม่มีการแก้ข้อมูลจริง',
    });
  } catch (e: any) {
    console.error('[POST /api/net/1x5/run]', e?.message);
    return NextResponse.json({ ok: false, error: 'run_failed', message: e?.message || 'รันวงจรไม่สำเร็จ' }, { status: 500 });
  }
}
