import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isAuthorized, logEvent, requireSimAccess, simDenied, DISCLAIMER, SIM_WATERMARK } from '@/lib/sim';

export const dynamic = 'force-dynamic';

/**
 * POST /api/sim/payment — Payment Verification Workflow (ปลายทาง n8n: /webhook/payment-verified)
 * body: { simId?, memberCode, paymentRef, amount?, mode?: 'demo' | 'live' }
 *
 * กติกาความปลอดภัย (ตามสเปก):
 *  - โหมด demo (ค่าเริ่มต้น): ออกใบเสร็จ DEMO + watermark เสมอ และ "ไม่" ตั้ง payment_verified = true
 *    (ผู้ใช้กดปุ่มใน Simulation Mode เพื่อสร้างใบเสร็จยืนยันการจ่ายเงินจริงไม่ได้)
 *  - โหมด live: ต้องมี Bearer CRON_SECRET และต้องยืนยันกับผู้ให้บริการชำระเงินจริง
 *    ตอนนี้ยังไม่ต่อผู้ให้บริการ → บันทึกเป็น pending และไม่ยืนยันให้เอง
 */
export async function POST(req: Request) {
  try {
    const access = await requireSimAccess(req);
    if (!access.ok) return simDenied(access);
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const mode = String(body.mode || 'demo') === 'live' ? 'live' : 'demo';
    const paymentRef = String(body.paymentRef || body.paymentId || `PAY-${Date.now().toString(36)}`).slice(0, 64);
    const memberCode = body.memberCode ? String(body.memberCode) : null;
    const amount = Math.max(0, Math.min(10_000_000, Number(body.amount || 0)));

    const simId = String(body.simId || '');
    const sim = simId
      ? await prisma.networkSim.findUnique({ where: { id: simId } })
      : await prisma.networkSim.findFirst({ orderBy: { createdAt: 'desc' } });
    if (!sim) return NextResponse.json({ ok: false, error: 'no_simulation' }, { status: 200 });

    const member = memberCode ? await prisma.simMember.findFirst({ where: { simId: sim.id, memberCode } }) : null;

    if (mode === 'live' && !isAuthorized(req)) {
      return NextResponse.json({ ok: false, error: 'unauthorized', hint: 'โหมด live ต้องมี Authorization: Bearer <CRON_SECRET>' }, { status: 401 });
    }

    const receiptId = mode === 'demo' ? `DEMO-${paymentRef}` : `RCPT-${paymentRef}`;
    const status = mode === 'demo' ? 'demo' : 'pending';

    const record = await prisma.simPayment.create({
      data: {
        simId: sim.id,
        paymentRef,
        memberCode,
        amount,
        status,
        mode,
        provider: mode === 'demo' ? 'simulation' : String(body.provider || 'unset'),
        receiptId,
        watermark: SIM_WATERMARK,
        verifiedAt: null,
      },
    });

    await logEvent({
      eventType: 'PAYMENT_SUBMITTED',
      simId: sim.id,
      memberCode,
      source: mode === 'demo' ? 'dashboard' : 'n8n',
      payload: { paymentRef, amount, mode, simulation: true },
    });

    if (mode === 'demo') {
      if (member) {
        await prisma.simMember.update({ where: { id: member.id }, data: { receiptId } });
      }
      await logEvent({
        eventType: 'PAYMENT_VERIFIED',
        simId: sim.id,
        memberCode,
        source: 'dashboard',
        payload: { paymentRef, receiptId, demo: true, simulation: true, note: 'การยืนยันจำลอง (DEMO RECEIPT) — ไม่ใช่หลักฐานการชำระเงินจริง' },
      });
      return NextResponse.json({
        ok: true,
        mode: 'demo',
        paymentId: record.id,
        paymentRef,
        receiptId,
        status: 'demo',
        watermark: SIM_WATERMARK,
        paymentVerified: false,
        memberCode,
        note: 'ออกใบเสร็จ DEMO แล้ว — ระบบไม่ตั้งสถานะ "ชำระเงินจริง" ให้ เพราะยังไม่มีการตรวจสอบกับผู้ให้บริการชำระเงิน',
        disclaimer: DISCLAIMER,
      });
    }

    // โหมด live: รอตรวจสอบกับผู้ให้บริการ (ยังไม่ตั้ง verified)
    await logEvent({
      eventType: 'PAYMENT_SUBMITTED',
      simId: sim.id,
      memberCode,
      source: 'n8n',
      payload: { paymentRef, provider: String(body.provider || 'unset'), pendingReview: true, simulation: false },
    });
    return NextResponse.json({
      ok: true,
      mode: 'live',
      paymentId: record.id,
      paymentRef,
      receiptId,
      status: 'pending',
      paymentVerified: false,
      note: 'รอตรวจสอบกับผู้ให้บริการชำระเงินจริง (ต้องยืนยันจากระบบหลังบ้าน/ผู้ให้บริการก่อน จึงจะตั้ง verified ได้)',
      disclaimer: DISCLAIMER,
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

/** GET /api/sim/payment — รายการใบเสร็จจำลองล่าสุด (ไม่ส่งข้อมูลลูกค้าจริง) */
export async function GET(req: Request) {
  try {
    const access = await requireSimAccess(req);
    if (!access.ok) return simDenied(access);
    const rows = await prisma.simPayment.findMany({ orderBy: { createdAt: 'desc' }, take: 30 });
    return NextResponse.json(
      { ok: true, payments: rows.map((r) => ({ paymentRef: r.paymentRef, memberCode: r.memberCode, amount: Number(r.amount), status: r.status, mode: r.mode, receiptId: r.receiptId, watermark: r.watermark, createdAt: r.createdAt })), disclaimer: DISCLAIMER },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
