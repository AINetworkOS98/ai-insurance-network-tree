import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { DISCLAIMER, isAuthorized } from '@/lib/sim';

export const dynamic = 'force-dynamic';

/**
 * GET /api/sim/rules — อ่านกฎการเลื่อนตำแหน่ง (ใช้แสดงในหน้า Dashboard และให้ n8n อ่าน)
 * POST /api/sim/rules — สร้าง/แก้กฎ (ต้องมี Bearer CRON_SECRET) เพราะกฎนี้คุมตรรกะของระบบ
 * หลักการ: สูตร/เงื่อนไขทั้งหมดอยู่ในฐานข้อมูล ไม่ฝังในโค้ดหรือ frontend
 */
export async function GET() {
  try {
    const rules = await prisma.promotionRule.findMany({ orderBy: [{ active: 'desc' }, { createdAt: 'asc' }] });
    return NextResponse.json(
      {
        ok: true,
        rules: rules.map((r) => ({
          id: r.id,
          name: r.name,
          minMembers: r.minMembers,
          minLevels: r.minLevels,
          requiredPayment: r.requiredPayment,
          requiredReceipt: r.requiredReceipt,
          commissionAmount: Number(r.commissionAmount),
          conditions: r.conditions,
          active: r.active,
        })),
        note: 'ค่าคอมมิชชั่นในกฎเป็นค่าตามกติกาที่ตั้งไว้ในระบบ ไม่ใช่การรับประกันรายได้',
        disclaimer: DISCLAIMER,
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const name = String(body.name || '').trim();
    if (!name) return NextResponse.json({ ok: false, error: 'name_required' }, { status: 400 });
    const data = {
      minMembers: Math.max(1, Math.min(5000, Number(body.minMembers ?? 5))),
      minLevels: Math.max(0, Math.min(50, Number(body.minLevels ?? 1))),
      requiredPayment: String(body.requiredPayment || 'simulated'),
      requiredReceipt: body.requiredReceipt !== false,
      commissionAmount: Math.max(0, Math.min(10_000_000, Number(body.commissionAmount ?? 20000))),
      conditions: (body.conditions ?? { note: 'ค่าตามกติกาที่ตั้งไว้ในระบบ ไม่ใช่การรับประกันรายได้' }) as object,
      active: body.active !== false,
    };
    const rule = await prisma.promotionRule.upsert({ where: { name }, update: data, create: { name, ...data } });
    return NextResponse.json({ ok: true, rule: { id: rule.id, name: rule.name, ...data } });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
