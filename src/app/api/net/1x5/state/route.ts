import { NextResponse } from 'next/server';
import { getState, loadRules, requireNetAccess, netDenied, maskIfNotAdmin } from '@/lib/net1x5';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * GET /api/net/1x5/state
 * สถานะจริงของระบบบริหารเครือข่าย 1 แตก 5 (ใช้ข้อมูลจริงในตารางจริง ไม่ใช่ข้อมูลจำลอง)
 * - ผู้ใช้ที่ล็อกอิน: เห็นโครงสร้าง/ช่องว่าง/ผลตรวจเงื่อนไข (ชื่อสมาชิกถูกปกปิดสำหรับผู้ที่ไม่ใช่ผู้ดูแล)
 * - n8n: Authorization: Bearer <CRON_SECRET>
 * query: ?period=YYYY-MM (ไม่ใส่ = รอบปัจจุบัน)
 */
export async function GET(req: Request) {
  const access = await requireNetAccess(req);
  if (!access.ok) return netDenied(access);
  try {
    const url = new URL(req.url);
    const period = url.searchParams.get('period') || '';
    const state = await getState();
    if (period && /^\d{4}-\d{2}$/.test(period)) state.period = period;
    const isAdmin = access.isAdmin;
    return NextResponse.json({
      ok: true,
      via: access.via,
      canAdmin: isAdmin,
      rules: state.rules,
      period: state.period,
      now: state.now,
      deadline: state.deadline,
      // ผลการทำงาน ณ ปัจจุบัน (ประเมินสดจากฐานข้อมูล) — ชื่อสมาชิกถูกปกปิดสำหรับผู้ที่ไม่ใช่ผู้ดูแล
      steps: state.steps.map((s) => ({
        ...s,
        items: s.items ? maskIfNotAdmin(s.items.map((i: any) => ({ code: i.code || '', name: i.name || i.parentName || '', ...i })), isAdmin) : undefined,
      })),
      summary: state.summary,
      tree: state.tree,
      members: maskIfNotAdmin(state.members.map((m) => ({ ...m, name: m.name })), isAdmin).slice(0, 600),
      checks: maskIfNotAdmin(state.checks, isAdmin).slice(0, 600),
      failed: maskIfNotAdmin(state.failed, isAdmin),
      vacancies: state.vacancies.slice(0, 200).map((v) => ({ ...v, parentName: isAdmin ? v.parentName : 'สมาชิก (ปกปิดชื่อ)' })),
      candidates: maskIfNotAdmin(state.candidates, isAdmin).slice(0, 200),
      lastRun: state.lastRun,
      logs: state.logs,
      testAccounts: state.testAccounts,
      disclaimer: 'ข้อมูลชุดนี้เป็นข้อมูลจริงในฐานข้อมูลของระบบ (ไม่ใช่ข้อมูลจำลอง) — ทุกการเปลี่ยนแปลงถูกบันทึกใน Audit Log ตรวจสอบย้อนหลังได้',
    });
  } catch (e: any) {
    console.error('[GET /api/net/1x5/state]', e?.message);
    return NextResponse.json({ ok: false, error: 'state_failed', message: e?.message || 'อ่านสถานะไม่สำเร็จ' }, { status: 500 });
  }
}
