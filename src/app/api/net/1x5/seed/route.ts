import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { TEST_DOMAIN, requireNetAccess, netDenied, netAdminRequired, audit, currentPeriod, loadRules, saveRules } from '@/lib/net1x5';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * POST /api/net/1x5/seed
 * สร้าง/ลบ "เครือข่ายทดสอบ" ใน **ตารางจริง** เพื่อให้เห็นการทำงานของวงจรอัตโนมัติครบทุกขั้น
 *  - บัญชีทดสอบใช้อีเมลโดเมน @ai-insurance-test.local เท่านั้น (ลบได้ด้วยเครื่องมือ Admin เดิม /api/admin/test-accounts)
 *  - รหัสผ่านเป็นค่าสุ่มที่ไม่มีใครรู้ → บัญชีทดสอบล็อกอินไม่ได้โดยเจตนา
 *  - ไม่แตะ/ไม่แก้บัญชีสมาชิกจริงแม้แต่แถวเดียว
 *  - เขียนเป็นชุด (createMany) เพื่อความเร็ว: ~6 คำสั่งต่อการสร้างทั้งเครือข่าย
 * body: { action:'create'|'purge', layers?: 1..4, replace?: boolean }
 */
export async function POST(req: Request) {
  const access = await requireNetAccess(req);
  if (!access.ok) return netDenied(access);
  if (!access.isAdmin) return netAdminRequired();

  try {
    const body = (await req.json().catch(() => ({}))) as any;
    const action = body.action === 'purge' ? 'purge' : 'create';

    const existing: any[] = await (prisma.user as any).findMany({ where: { email: { endsWith: TEST_DOMAIN } }, select: { id: true } });
    const testIds = existing.map((v) => v.id);

    if (action === 'purge') {
      if (testIds.length) await purgeTestNetwork(testIds);
      await audit({ actorId: access.userId, action: 'net1x5.test_network_purged', entity: 'User', newValue: { deleted: testIds.length }, reason: 'ลบเครือข่ายทดสอบ' });
      return NextResponse.json({ ok: true, action: 'purge', deleted: testIds.length, message: `ลบสมาชิกทดสอบ ${testIds.length} คนออกจากโครงสร้างแล้ว (ข้อมูลจริงไม่ถูกแตะ)` });
    }

    // ── สร้างเครือข่ายทดสอบ 1 แตก 5 (เขียนเป็นชุด) ──
    const layers = Math.max(1, Math.min(4, Number(body.layers) || 2));
    let purged = 0;
    if (testIds.length) {
      if (body.replace === false) {
        return NextResponse.json({ ok: false, error: 'already_exists', message: `มีสมาชิกทดสอบอยู่แล้ว ${testIds.length} คน — ส่ง { "replace": true } เพื่อล้างแล้วสร้างใหม่` }, { status: 409 });
      }
      await purgeTestNetwork(testIds);
      purged = testIds.length;
    }

    const bcrypt = (await import('bcryptjs')).default as any;
    const sharedPasswordHash = await bcrypt.hash(crypto.randomUUID(), 10); // 1 ค่า ไม่เปิดเผย — บัญชีทดสอบล็อกอินไม่ได้
    const now = new Date();
    const period = currentPeriod(now);
    const stamp = Date.now().toString(36);

    type Plan = {
      id: string; code: string; nodeId: string; level: number; seq: number;
      status: 'ACTIVE' | 'INACTIVE'; noReceipt: boolean; pendingReceipt: boolean; inactive: boolean;
      parentIndex: number | null; slot: number;
    };
    const plans: Plan[] = [];
    let seq = 0;

    for (let level = 0; level <= layers; level++) {
      const prev: number[] = [];
      if (level > 0) {
        for (let p = 0; p < plans.length; p++) if (plans[p].level === level - 1) prev.push(p);
      }
      const count = level === 0 ? 1 : Math.min(5 * prev.length, Math.pow(5, level));
      for (let i = 0; i < count; i++) {
        seq++;
        const roll = (i * 7 + level * 3 + seq) % 10;
        const noReceipt = level > 0 && roll < 2;        // 20% ไม่มีใบเสร็จ → ไม่ผ่านเงื่อนไข
        const pendingReceipt = level > 0 && roll === 2; // 10% รอตรวจ → ระบบกันการคัดไว้ก่อน
        const inactive = level > 0 && roll === 3;       // 10% ปิดจุดในผัง → เกิดตำแหน่งว่างให้ระบบเติม
        plans.push({
          id: crypto.randomUUID(),
          code: `T${String(seq).padStart(4, '0')}`,
          nodeId: crypto.randomUUID(),
          level,
          seq,
          status: inactive ? 'INACTIVE' : 'ACTIVE',
          noReceipt,
          pendingReceipt,
          inactive,
          parentIndex: level === 0 ? null : prev[Math.floor(i / 5)],
          slot: level === 0 ? 0 : (i % 5) + 1,
        });
      }
    }

    const nodeIdOf = new Map<number, string>();
    plans.forEach((p, i) => nodeIdOf.set(i, p.nodeId));

    // 1) ผู้ใช้ทดสอบทั้งหมด
    await (prisma.user as any).createMany({
      data: plans.map((p) => ({
        id: p.id,
        email: `net1x5-${p.code.toLowerCase()}-${stamp}${TEST_DOMAIN}`,
        emailVerified: true,
        passwordHash: sharedPasswordHash,
        firstName: 'ทดสอบ',
        lastName: p.code,
        displayName: `ทดสอบ ${p.code}`,
        memberCode: `T-${p.code}`,
        status: p.status,
        rankLevel: Math.min(4, p.level),
        approvedAt: now,
        sponsorId: p.parentIndex != null ? plans[p.parentIndex].id : null,
        managerId: p.parentIndex != null ? plans[p.parentIndex].id : null,
        placementParentId: p.parentIndex != null ? plans[p.parentIndex].id : null,
        createdAt: new Date(now.getTime() - (layers - p.level + 1) * 45 * 86400000),
      })),
    });

    // 2) จุดในผัง (TreeNode)
    await (prisma.treeNode as any).createMany({
      data: plans.map((p) => ({ id: p.nodeId, userId: p.id, level: p.level, directCount: 0, isActive: !p.inactive })),
    });

    // 3) สายงาน 1 แตก 5 (TreePlacement) + ประวัติการจัดวาง
    const placements = plans
      .filter((p) => p.parentIndex != null)
      .map((p) => ({
        parentId: nodeIdOf.get(p.parentIndex as number) as string,
        childId: p.id,
        slot: p.slot,
        level: p.level,
        reason: 'test_network_seed',
      }));
    if (placements.length) {
      await (prisma.treePlacement as any).createMany({ data: placements });
      await (prisma.placementHistory as any).createMany({
        data: placements.map((pl) => ({
          userId: pl.childId, parentId: pl.parentId, slot: pl.slot, level: pl.level,
          action: 'placed', reason: 'สร้างเครือข่ายทดสอบ', changedBy: access.userId,
        })),
      });
    }

    // 4) ใบเสร็จ + ยอดรับรอง (บางคนตั้งใจให้ไม่ผ่านเงื่อนไข เพื่อทดสอบการคัดออกจริง)
    const receipts = plans.filter((p) => !p.noReceipt).map((p) => ({
      id: crypto.randomUUID(),
      userId: p.id,
      originalName: `receipt-${p.code}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 102400 + (p.seq % 9) * 1024,
      fileHash: crypto.createHash('sha256').update(`test-${p.id}`).digest('hex'),
      status: p.pendingReceipt ? 'PendingVerification' : 'Verified',
      submissionAt: new Date(now.getTime() - 5 * 86400000),
      verifiedAt: p.pendingReceipt ? null : new Date(now.getTime() - 3 * 86400000),
      creditedPeriod: period,
    }));
    if (receipts.length) await (prisma.receiptFile as any).createMany({ data: receipts });
    const ledgers = receipts
      .filter((r) => r.status === 'Verified')
      .map((r, i) => ({
        userId: r.userId,
        receiptId: r.id,
        type: 'premium',
        amount: 20000 + (i % 5) * 5000,
        period,
        status: 'active',
      }));
    if (ledgers.length) await (prisma.performanceLedger as any).createMany({ data: ledgers });

    const rules = await loadRules();
    if (!rules.period) await saveRules({ period }, access.userId);

    await audit({
      actorId: access.userId, action: 'net1x5.test_network_created', entity: 'User',
      newValue: { count: plans.length, layers, period, purged, placements: placements.length, receipts: receipts.length },
      reason: 'สร้างเครือข่ายทดสอบ 1 แตก 5',
    });

    return NextResponse.json({
      ok: true, action: 'create', created: plans.length, layers, period, purged,
      placements: placements.length, receipts: receipts.length, verifiedLedgers: ledgers.length,
      message: `${purged ? `ล้างชุดเดิม ${purged} คน แล้ว` : ''}สร้างเครือข่ายทดสอบ ${plans.length} คน (${layers + 1} ชั้น · 1 แตก 5) · สายงาน ${placements.length} ตำแหน่ง · ใบเสร็จ ${receipts.length} ใบ (ยืนยันแล้ว ${ledgers.length})`,
    });
  } catch (e: any) {
    console.error('[POST /api/net/1x5/seed]', e?.message);
    return NextResponse.json({ ok: false, error: 'seed_failed', message: e?.message || 'สร้างเครือข่ายทดสอบไม่สำเร็จ' }, { status: 500 });
  }
}

/** ลบเฉพาะข้อมูลของบัญชีทดสอบ (โดเมน @ai-insurance-test.local) — ไม่แตะสมาชิกจริง */
async function purgeTestNetwork(ids: string[]) {
  await (prisma.treePlacement as any).deleteMany({ where: { childId: { in: ids } } }).catch(() => null);
  await (prisma.treeNode as any).deleteMany({ where: { userId: { in: ids } } }).catch(() => null);
  await (prisma.performanceLedger as any).deleteMany({ where: { userId: { in: ids } } }).catch(() => null);
  await (prisma.receiptFile as any).deleteMany({ where: { userId: { in: ids } } }).catch(() => null);
  await (prisma.rankHistory as any).deleteMany({ where: { userId: { in: ids } } }).catch(() => null);
  await (prisma.membershipStatusHistory as any).deleteMany({ where: { userId: { in: ids } } }).catch(() => null);
  await (prisma.placementHistory as any).deleteMany({ where: { userId: { in: ids } } }).catch(() => null);
  await (prisma.placementQueue as any).deleteMany({ where: { userId: { in: ids } } }).catch(() => null);
  await (prisma.userSession as any).deleteMany({ where: { userId: { in: ids } } }).catch(() => null);
  await (prisma.notification as any).deleteMany({ where: { userId: { in: ids } } }).catch(() => null);
  await (prisma.user as any).deleteMany({ where: { id: { in: ids } } });
}
