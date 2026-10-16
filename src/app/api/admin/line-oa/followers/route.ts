// ─────────────────────────────────────────────────────────────────────────────
// /api/admin/line-oa/followers — ผู้ติดตาม OA (รายชื่อ + ประวัติย่อ) และป้ายกำกับ
//   GET   ?q= &tag= &limit=      → รายชื่อผู้ติดตาม
//   PATCH { id, tag?, note? }    → ติดป้าย/บันทึกช่วยจำ
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireLineAdmin, fail } from '@/lib/lineOaAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const a = await requireLineAdmin(req);
  if (!a.ok) return a.res;
  try {
    const sp = new URL(req.url).searchParams;
    const q = (sp.get('q') || '').trim();
    const tag = (sp.get('tag') || '').trim();
    const limit = Math.min(200, Math.max(1, Number(sp.get('limit') || 50)));
    const where: any = {};
    if (q) where.OR = [{ displayName: { contains: q, mode: 'insensitive' } }, { lineUserId: { contains: q } }, { note: { contains: q, mode: 'insensitive' } }];
    if (tag) where.tag = tag;

    const [rows, total, followed] = await Promise.all([
      (prisma as any).lineFollower.findMany({ where, orderBy: [{ lastMessageAt: 'desc' }, { followedAt: 'desc' }], take: limit }),
      (prisma as any).lineFollower.count({ where }),
      (prisma as any).lineFollower.count({ where: { ...where, followed: true } }),
    ]);
    return NextResponse.json({ ok: true, followers: rows, total, followed });
  } catch (e: any) { return fail(e); }
}

export async function PATCH(req: NextRequest) {
  const a = await requireLineAdmin(req);
  if (!a.ok) return a.res;
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body.id || '');
    if (!id) return NextResponse.json({ ok: false, error: 'ต้องระบุ id' }, { status: 400 });
    const data: any = {};
    if (typeof body.tag === 'string' || body.tag === null) data.tag = body.tag ? String(body.tag).slice(0, 40) : null;
    if (typeof body.note === 'string' || body.note === null) data.note = body.note ? String(body.note).slice(0, 500) : null;
    const row = await (prisma as any).lineFollower.update({ where: { id }, data });
    return NextResponse.json({ ok: true, follower: row });
  } catch (e: any) { return fail(e, 'บันทึกไม่สำเร็จ'); }
}
