// ─────────────────────────────────────────────────────────────────────────────
// /api/admin/line-oa/rules — กฎตอบกลับอัตโนมัติ (CRUD)
//   POST = สร้างใหม่ · PUT = แก้ไข (ต้องมี id) · DELETE ?id= = ลบ · PATCH ?id= = เปิด/ปิด
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireLineAdmin, fail } from '@/lib/lineOaAdmin';
import { normalizeMessages } from '@/lib/lineOa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MATCH_TYPES = ['EXACT', 'CONTAINS', 'STARTS_WITH', 'REGEX'];

function sanitize(body: any) {
  const out: any = {};
  if (typeof body.name === 'string' && body.name.trim()) out.name = body.name.trim().slice(0, 120);
  if (typeof body.enabled === 'boolean') out.enabled = body.enabled;
  if (body.priority !== undefined) out.priority = Math.max(0, Math.min(9999, Number(body.priority) || 100));
  if (typeof body.matchType === 'string' && MATCH_TYPES.includes(body.matchType)) out.matchType = body.matchType;
  if (Array.isArray(body.keywords)) out.keywords = body.keywords.map((k: any) => String(k).trim()).filter(Boolean).slice(0, 30);
  if (body.messages !== undefined) out.messages = normalizeMessages(body.messages) as any;
  if (typeof body.richMenuId === 'string' || body.richMenuId === null) out.richMenuId = body.richMenuId || null;
  if (typeof body.tag === 'string' || body.tag === null) out.tag = body.tag ? body.tag.trim().slice(0, 40) : null;
  return out;
}

export async function GET(req: NextRequest) {
  const a = await requireLineAdmin(req);
  if (!a.ok) return a.res;
  try {
    const rules = await (prisma as any).lineReplyRule.findMany({ orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] });
    return NextResponse.json({ ok: true, rules });
  } catch (e: any) { return fail(e); }
}

export async function POST(req: NextRequest) {
  const a = await requireLineAdmin(req);
  if (!a.ok) return a.res;
  try {
    const body = await req.json().catch(() => ({}));
    const data = sanitize(body);
    if (!data.name) return NextResponse.json({ ok: false, error: 'ต้องมีชื่อกฎ' }, { status: 400 });
    if (!data.keywords?.length) return NextResponse.json({ ok: false, error: 'ต้องมีคำค้นอย่างน้อย 1 คำ' }, { status: 400 });
    if (!data.messages?.length) return NextResponse.json({ ok: false, error: 'ต้องมีข้อความตอบกลับอย่างน้อย 1 ข้อความ' }, { status: 400 });
    const rule = await (prisma as any).lineReplyRule.create({ data });
    return NextResponse.json({ ok: true, rule });
  } catch (e: any) { return fail(e, 'สร้างกฎไม่สำเร็จ'); }
}

export async function PUT(req: NextRequest) {
  const a = await requireLineAdmin(req);
  if (!a.ok) return a.res;
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || '');
    if (!id) return NextResponse.json({ ok: false, error: 'ต้องระบุ id ของกฎ' }, { status: 400 });
    const data = sanitize(body);
    const rule = await (prisma as any).lineReplyRule.update({ where: { id }, data });
    return NextResponse.json({ ok: true, rule });
  } catch (e: any) { return fail(e, 'แก้ไขกฎไม่สำเร็จ'); }
}

export async function PATCH(req: NextRequest) {
  const a = await requireLineAdmin(req);
  if (!a.ok) return a.res;
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || '');
    if (!id) return NextResponse.json({ ok: false, error: 'ต้องระบุ id ของกฎ' }, { status: 400 });
    const rule = await (prisma as any).lineReplyRule.update({ where: { id }, data: { enabled: !!body.enabled } });
    return NextResponse.json({ ok: true, rule });
  } catch (e: any) { return fail(e); }
}

export async function DELETE(req: NextRequest) {
  const a = await requireLineAdmin(req);
  if (!a.ok) return a.res;
  try {
    const id = new URL(req.url).searchParams.get('id') || '';
    if (!id) return NextResponse.json({ ok: false, error: 'ต้องระบุ id' }, { status: 400 });
    await (prisma as any).lineReplyRule.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) { return fail(e, 'ลบกฎไม่สำเร็จ'); }
}
