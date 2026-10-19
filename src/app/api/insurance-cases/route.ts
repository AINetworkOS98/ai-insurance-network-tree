import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { seal } from '@/lib/secretBox';
import { maskName, maskAccount } from '@/lib/pii';

// /api/insurance-cases
// GET  — รายการเคส (ของตัวเอง หรือทั้งหมดถ้าเป็นหัวหน้าหน่วยขึ้นไป) แสดงแบบปิดข้อมูล
// POST — บันทึกเคสใหม่ (ข้อมูลผู้เอาประกันเข้ารหัสก่อนเก็บ, อายุเคส 180 วัน)
const CASE_TTL_DAYS = 180;

function authed(req: NextRequest) {
  const token = req.cookies.get('token')?.value || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (!token) return null;
  try { return verifyToken(token) as any; } catch { return null; }
}

async function rankOf(payload: any): Promise<number> {
  const me = payload?.sub ? await prisma.user.findUnique({ where: { id: payload.sub }, select: { rankLevel: true } }).catch(() => null) : null;
  return me?.rankLevel ?? payload?.rankLevel ?? 0;
}

function makeCaseNo() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const ymd = `${String(d.getFullYear() + 543).slice(-2)}${p(d.getMonth() + 1)}${p(d.getDate())}`;
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `IC-${ymd}-${rnd}`;
}

export async function GET(req: NextRequest) {
  const payload = authed(req);
  if (!payload) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  const rank = await rankOf(payload);
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim();
  const status = (searchParams.get('status') || '').trim();

  const where: any = {};
  if (rank < 2) where.agentUserId = payload.sub;          // ตัวแทนเห็นเฉพาะเคสของตัวเอง
  if (status) where.status = status;
  if (q) {
    where.OR = [
      { caseNo: { contains: q, mode: 'insensitive' } },
      { productCode: { contains: q, mode: 'insensitive' } },
      { productName: { contains: q, mode: 'insensitive' } },
      { nameMasked: { contains: q, mode: 'insensitive' } },
      { agentCode: { contains: q } },
    ];
  }

  const rows = await prisma.insuranceCase.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 }).catch((e) => { throw e; });
  return NextResponse.json({
    ok: true, rank,
    count: rows.length,
    cases: rows.map(r => ({
      caseNo: r.caseNo, agentCode: r.agentCode, productCode: r.productCode, productName: r.productName,
      productCat: r.productCat, gender: r.gender, age: r.age, cover: r.cover, payYears: r.payYears, nameMasked: r.nameMasked,
      riders: Array.isArray(r.riders) ? (r.riders as any[]).length : 0, status: r.status,
      createdAt: r.createdAt, expiresAt: r.expiresAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const payload = authed(req);
  if (!payload) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const p = body?.product || {};
  const a = body?.applicant || {};

  if (!p.code || !p.name) return NextResponse.json({ ok: false, error: 'ไม่พบแบบประกัน (สัญญาหลัก)' }, { status: 400 });
  if (!a.first || !a.last) return NextResponse.json({ ok: false, error: 'กรุณากรอกชื่อ–นามสกุลผู้เอาประกัน' }, { status: 400 });
  const phone = String(a.phone || '').replace(/\D/g, '');
  const cid = String(a.citizenId || '').replace(/\D/g, '');
  if (!/^0\d{8,9}$/.test(phone)) return NextResponse.json({ ok: false, error: 'เบอร์มือถือไม่ถูกต้อง' }, { status: 400 });
  if (!/^\d{13}$/.test(cid)) return NextResponse.json({ ok: false, error: 'เลขบัตรประชาชนต้อง 13 หลัก' }, { status: 400 });

  const caseNo = makeCaseNo();
  const sealed = seal({
    title: a.title || '', first: a.first, last: a.last, birth: a.birth || '', occupation: a.occupation || '',
    phone, citizenId: cid, beneficiary: a.beneficiary || '', relation: a.relation || '', note: a.note || '',
  });

  const created = await prisma.insuranceCase.create({
    data: {
      caseNo,
      agentCode: String(body.agent?.code || '01759064'),
      agentUserId: payload.sub || null,
      productCode: String(p.code),
      productName: String(p.name),
      productCat: String(p.cat || ''),
      riders: Array.isArray(body.riders) ? body.riders : [],
      gender: body.gender === 'หญิง' ? 'หญิง' : 'ชาย',
      age: Number(body.age) || 30,
      cover: Math.round(Number(body.cover) || 0),
      payYears: Number(body.payYears) || 10,
      nameMasked: `${maskName(`${a.first} ${a.last}`) || ''} · ${maskAccount(phone)}`,
      sealed,
      status: 'DRAFT',
      note: body.note ? String(body.note).slice(0, 500) : null,
      expiresAt: new Date(Date.now() + CASE_TTL_DAYS * 86400_000),
    },
  });

  await prisma.auditLog.create({
    data: {
      userId: payload.sub || null,
      action: 'insurance_case.create',
      entity: 'InsuranceCase',
      entityId: created.id,
      newValue: { caseNo, productCode: created.productCode, cover: created.cover },
    },
  }).catch(() => null);

  return NextResponse.json({ ok: true, caseNo, id: created.id, url: `/cases/${caseNo}` });
}
