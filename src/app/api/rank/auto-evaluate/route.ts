import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { evaluateRank, applyRankPromotion } from '@/lib/rankEngine';
import { emitNotification, notifyAdmins } from '@/lib/notify';
import { RANK_CATALOG } from '@/lib/rankCatalog';

// POST /api/rank/auto-evaluate — ประเมินตำแหน่งอัตโนมัติเมื่อมีการอัปเดต performance ledger
// ใช้เป็น webhook หรือ cron job เพื่อตรวจสอบสมาชิกที่คุณสมบัติครบ
export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    if (!token) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
    let payload: any;
    try { payload = verifyToken(token); } catch { return NextResponse.json({ error: 'โทเค็นไม่ถูกต้อง' }, { status: 401 }); }

    const body = await req.json().catch(() => ({} as any));
    const { userId, force } = body;
    const targetId = userId || payload.sub || payload.id;

    // ถ้าประเมินคนอื่น ต้องมี rank.manage
    if (targetId !== (payload.sub || payload.id)) {
      const requester: any = await prisma.user.findUnique({
        where: { id: payload.sub || payload.id },
        include: { roles: { include: { role: true } } } as any
      });
      const perms: string[] = [];
      const allowed = perms.includes('rank.manage') || perms.includes('rank.approve') || (payload.roles && payload.roles.includes('admin'));
      if (!allowed) return NextResponse.json({ error: 'ต้องมีสิทธิ rank.manage' }, { status: 403 });
    }

    const member = await prisma.user.findUnique({
      where: { id: targetId },
      select: { id: true, rankLevel: true, status: true, displayName: true, email: true }
    });
    if (!member) return NextResponse.json({ ok: false, error: 'ไม่พบสมาชิก' }, { status: 404 });

    if (member.status !== 'ACTIVE') {
      return NextResponse.json({ ok: false, error: 'สมาชิกไม่ได้สถานะ ACTIVE' }, { status: 400 });
    }

    const ev: any = await evaluateRank(targetId);
    if (!ev.ok) return NextResponse.json({ ok: false, error: ev.error || 'ประเมินไม่สำเร็จ' });

    let result = { ok: true as const, evaluated: true, promoted: false, message: ev.message };

    // ถ้าคุณสมบัติครบและไม่ได้ force ให้แจ้งเตือนรออนุมัติ (evalType === 'approval')
    if (ev.result === 'qualified_auto') {
      const promotionResult: any = await applyRankPromotion(targetId, 'system');
      if (promotionResult.result === 'promoted') {
        // แจ้งเตือนเลื่อนตำแหน่ง: ตัวเอง + ผู้บริหารระบบ
        try {
          const { emitNotification, notifyAdmins } = await import('@/lib/notify');
          const nm = RANK_CATALOG.find(r => r.level === promotionResult.targetRank)?.nameTh || `ระดับ ${promotionResult.targetRank}`;
          await emitNotification({ userId: targetId, type: 'rank_promoted', title: `เลื่อนตำแหน่งเป็น${promotionResult.currentRankNameTh} → ${nm}`, body: 'ยินดีด้วย — ดูเส้นทางต่อได้ที่เมนูขึ้นตำแหน่ง', referenceId: '/career' }).catch(() => null);
          await notifyAdmins({ type: 'rank_promoted', title: 'สมาชิกเลื่อนตำแหน่งอัตโนมัติ', body: `เลื่อนจาก ${promotionResult.currentRankNameTh} เป็น ${nm}`, referenceId: '/admin/members' });
        } catch {}
        return NextResponse.json({ ok: true, promoted: true, newRank: promotionResult.currentRank, message: 'เลื่อนตำแหน่งอัตโนมัติสำเร็จ' });
      }
    }

    return NextResponse.json({ ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}