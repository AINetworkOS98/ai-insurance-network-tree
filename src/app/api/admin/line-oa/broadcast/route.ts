// ─────────────────────────────────────────────────────────────────────────────
// /api/admin/line-oa/broadcast — ส่งข้อความหาผู้ติดตาม (push) + ทดสอบส่งหาตัวเอง
//   ⚠️ push นับโควตารายเดือน (แพ็กฟรี 300) — ต้องยืนยัน confirm:true ทุกครั้ง
//   POST { action:'quota' }                        → เช็คโควตาคงเหลือ
//   POST { action:'test', to?, text|messages }     → ส่งหาตัวเอง/ผู้ติดตาม 1 คน
//   POST { action:'broadcast', text|messages, tag?, confirm:true }
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireLineAdmin, fail } from '@/lib/lineOaAdmin';
import { getQuota, pushToLine, normalizeMessages, previewText, logLine } from '@/lib/lineOa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const a = await requireLineAdmin(req);
  if (!a.ok) return a.res;
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    if (action === 'quota') {
      const q = await getQuota();
      return NextResponse.json({ ok: true, quota: q, remaining: q.limit === null ? null : Math.max(0, q.limit - q.used) });
    }

    const messages = normalizeMessages(body.messages || (body.text ? [{ type: 'text', text: String(body.text) }] : []));
    if (!messages.length) return NextResponse.json({ ok: false, error: 'ต้องมีข้อความที่จะส่ง' }, { status: 400 });

    if (action === 'test') {
      const to = String(body.to || process.env.LINE_TARGET_ID || '');
      if (!to) return NextResponse.json({ ok: false, error: 'ไม่พบปลายทาง (ยังไม่ได้ตั้ง LINE_TARGET_ID)' }, { status: 400 });
      const r = await pushToLine(to, messages);
      await logLine({ direction: 'OUT', lineUserId: to, text: previewText(messages), matchKind: 'test', ok: r.ok, error: r.error || null });
      const q = await getQuota();
      return NextResponse.json({ ok: r.ok, error: r.error, to: to.slice(0, 6) + '••••', quota: q }, { status: r.ok ? 200 : 502 });
    }

    if (action === 'broadcast') {
      if (body.confirm !== true) {
        return NextResponse.json({ ok: false, error: 'ต้องยืนยัน confirm:true (การส่งจะนับโควตาข้อความรายเดือน)' }, { status: 400 });
      }
      const where: any = { followed: true };
      if (body.tag) where.tag = String(body.tag);
      const targets = await (prisma as any).lineFollower.findMany({ where, select: { lineUserId: true }, take: 500 });
      const q0 = await getQuota();
      const remaining = q0.limit === null ? Infinity : Math.max(0, q0.limit - q0.used);
      if (targets.length > remaining) {
        return NextResponse.json({ ok: false, error: `โควตาคงเหลือไม่พอ (ต้องส่ง ${targets.length} แต่เหลือ ${remaining})` , quota: q0 }, { status: 400 });
      }
      let sent = 0, failed = 0;
      for (const t of targets) {
        const r = await pushToLine(t.lineUserId, messages);
        if (r.ok) sent++; else failed++;
        await logLine({ direction: 'OUT', lineUserId: t.lineUserId, text: previewText(messages), matchKind: 'broadcast', ok: r.ok, error: r.error || null });
        await new Promise((res) => setTimeout(res, 120)); // กัน rate limit
      }
      const q = await getQuota();
      return NextResponse.json({ ok: true, targeted: targets.length, sent, failed, quota: q });
    }

    return NextResponse.json({ ok: false, error: 'action ต้องเป็น quota | test | broadcast' }, { status: 400 });
  } catch (e: any) { return fail(e, 'ส่งข้อความไม่สำเร็จ'); }
}
