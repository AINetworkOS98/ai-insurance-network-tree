import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { open } from '@/lib/secretBox';

// GET /api/insurance-cases/[caseNo] — รายละเอียดเคส (ถอดรหัสให้เฉพาะเจ้าของเคส หรือหัวหน้าหน่วยขึ้นไป) + audit log
export async function GET(req: NextRequest, ctx: { params: Promise<{ caseNo: string }> }) {
  const token = req.cookies.get('token')?.value || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  let payload: any = null;
  try { payload = token ? verifyToken(token) : null; } catch { payload = null; }
  if (!payload) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });

  const { caseNo } = await ctx.params;
  const row = await prisma.insuranceCase.findUnique({ where: { caseNo } });
  if (!row) return NextResponse.json({ ok: false, error: 'ไม่พบเคสนี้' }, { status: 404 });

  const me = payload.sub ? await prisma.user.findUnique({ where: { id: payload.sub }, select: { rankLevel: true } }).catch(() => null) : null;
  const rank = me?.rankLevel ?? payload.rankLevel ?? 0;
  const isOwner = row.agentUserId && row.agentUserId === payload.sub;
  if (rank < 2 && !isOwner) return NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์เปิดเคสนี้' }, { status: 403 });

  await prisma.auditLog.create({
    data: { userId: payload.sub || null, action: 'insurance_case.view', entity: 'InsuranceCase', entityId: row.id },
  }).catch(() => null);

  const applicant = open(row.sealed);
  return NextResponse.json({
    ok: true,
    case: {
      caseNo: row.caseNo, agentCode: row.agentCode, productCode: row.productCode, productName: row.productName,
      productCat: row.productCat, riders: row.riders || [], gender: row.gender, age: row.age, cover: row.cover,
      payYears: row.payYears, status: row.status, note: row.note, createdAt: row.createdAt, expiresAt: row.expiresAt,
    },
    applicant: applicant || null,
  });
}

// PATCH /api/insurance-cases/[caseNo]  { status } — เปลี่ยนสถานะเคส (เจ้าของหรือหัวหน้าหน่วย)
const STATUSES = ['DRAFT', 'SENT', 'ISSUED', 'CANCELLED'];
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ caseNo: string }> }) {
  const token = req.cookies.get('token')?.value || '';
  let payload: any = null;
  try { payload = token ? verifyToken(token) : null; } catch { payload = null; }
  if (!payload) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });

  const { caseNo } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  if (!STATUSES.includes(body.status)) return NextResponse.json({ ok: false, error: 'สถานะไม่ถูกต้อง' }, { status: 400 });

  const row = await prisma.insuranceCase.findUnique({ where: { caseNo } });
  if (!row) return NextResponse.json({ ok: false, error: 'ไม่พบเคสนี้' }, { status: 404 });
  const me = payload.sub ? await prisma.user.findUnique({ where: { id: payload.sub }, select: { rankLevel: true } }).catch(() => null) : null;
  const rank = me?.rankLevel ?? payload.rankLevel ?? 0;
  if (rank < 2 && row.agentUserId !== payload.sub) return NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์แก้เคสนี้' }, { status: 403 });

  const updated = await prisma.insuranceCase.update({ where: { caseNo }, data: { status: body.status } });
  await prisma.auditLog.create({
    data: { userId: payload.sub || null, action: 'insurance_case.status', entity: 'InsuranceCase', entityId: row.id, oldValue: { status: row.status }, newValue: { status: updated.status } },
  }).catch(() => null);
  return NextResponse.json({ ok: true, status: updated.status });
}
