import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { isAdminFromPayload } from '@/lib/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// DELETE /api/receipts/:id — ลบใบเสร็จออกจากระบบ (คลังใบเสร็จฝั่ง Postgres)
// สิทธิ์: เจ้าของลบได้เฉพาะใบเสร็จของตัวเอง · ผู้ดูแลระบบลบได้ทุกใบ
// ลบครบทุกตารางที่อ้างถึงก่อนลบตัวไฟล์ แล้วบันทึก AuditLog (ตรวจสอบย้อนหลังได้)
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ ok: false, error: 'ไม่ระบุใบเสร็จที่ต้องการลบ' }, { status: 400 });

    const token = req.cookies.get('token')?.value
      || req.cookies.get('auth_token')?.value
      || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
    if (!token) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });

    let payload: any;
    try { payload = verifyToken(token); } catch { return NextResponse.json({ ok: false, error: 'โทเค็นไม่ถูกต้อง' }, { status: 401 }); }
    const userId = String(payload?.sub || '');
    if (!userId) return NextResponse.json({ ok: false, error: 'โทเค็นไม่ถูกต้อง' }, { status: 401 });

    const receipt = await (prisma as any).receiptFile.findUnique({
      where: { id },
      include: { extractions: { select: { id: true } }, verifications: { select: { id: true } } },
    }).catch(() => null);
    if (!receipt) return NextResponse.json({ ok: false, error: 'ไม่พบใบเสร็จนี้ในระบบ' }, { status: 404 });

    const isAdmin = await isAdminFromPayload(payload).catch(() => false);
    if (!isAdmin && receipt.userId !== userId) {
      return NextResponse.json({ ok: false, error: 'ลบได้เฉพาะใบเสร็จของตัวเอง' }, { status: 403 });
    }

    const extIds = (receipt.extractions || []).map((e: any) => e.id);

    // ลบลูกก่อน (extraction/verification/ledger) แล้วค่อยลบไฟล์
    await (prisma as any).receiptExtraction.deleteMany({ where: { receiptId: id } }).catch(() => null);
    await (prisma as any).receiptVerification.deleteMany({ where: { receiptId: id } }).catch(() => null);
    await (prisma as any).performanceLedger.deleteMany({ where: { receiptId: id } }).catch(() => null);
    if (extIds.length) await (prisma as any).receiptCorrection?.deleteMany?.({ where: { extractionId: { in: extIds } } }).catch(() => null);

    const deleted = await (prisma as any).receiptFile.delete({ where: { id } }).catch(() => null);
    if (!deleted) return NextResponse.json({ ok: false, error: 'ลบใบเสร็จไม่สำเร็จ' }, { status: 500 });

    // Audit — ห้ามลบเงียบ ต้องตรวจย้อนหลังได้ว่าใครลบอะไร
    await (prisma as any).auditLog.create({
      data: {
        userId,
        action: 'receipt.deleted',
        entity: 'ReceiptFile',
        entityId: id,
        oldValue: {
          ownerId: receipt.userId, originalName: receipt.originalName, status: receipt.status,
          fileHash: receipt.fileHash, creditedPeriod: receipt.creditedPeriod ?? null,
        },
        reason: isAdmin && receipt.userId !== userId ? 'ผู้ดูแลระบบลบใบเสร็จของสมาชิก' : 'เจ้าของลบใบเสร็จของตัวเอง',
      },
    }).catch(() => null);

    return NextResponse.json({ ok: true, deleted: id, message: 'ลบใบเสร็จออกจากระบบแล้ว' });
  } catch (e: any) {
    console.error('[receipts/[id] DELETE]', e?.message);
    return NextResponse.json({ ok: false, error: 'ลบใบเสร็จไม่สำเร็จ' }, { status: 500 });
  }
}
