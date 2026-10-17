// ─────────────────────────────────────────────────────────────────────────────
// POST /api/contact/ai — ผู้ช่วย AI บนหน้า /contact (สาธารณะ)
//   • ใช้ Hermes + DeepSeek ตัวเดียวกับ LINE OA (คำตอบชุดเดียวกัน ไม่มีสองมาตรฐาน)
//   • ให้ข้อมูลภาพรวมของทีม + เมนูระบบ (จากฐานข้อมูลสด) แต่ "ห้าม" เปิดเผยข้อมูลรายบุคคล
//   • จำกัดจำนวนคำขอต่อ IP เพื่อกันค่าใช้จ่าย (8 ครั้ง / 10 นาที)
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { loadConfig, previewText } from '@/lib/lineOa';
import { generateAiReply, buildLiveFacts } from '@/lib/lineOaAi';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const HITS = new Map<string, { n: number; reset: number }>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_HITS = 8;

function rateLimited(ip: string): boolean {
  const now = Date.now();
  const cur = HITS.get(ip);
  if (!cur || now > cur.reset) { HITS.set(ip, { n: 1, reset: now + WINDOW_MS }); return false; }
  cur.n += 1;
  if (HITS.size > 500) { for (const [k, v] of HITS) if (now > v.reset) HITS.delete(k); }
  return cur.n > MAX_HITS;
}

export async function POST(req: NextRequest) {
  try {
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || req.headers.get('x-real-ip') || 'unknown';
    if (rateLimited(ip)) {
      return NextResponse.json({ ok: false, error: 'สอบถามบ่อยเกินไปครับ กรุณารอสักครู่ หรือทัก LINE OA ของทีม' }, { status: 429 });
    }

    const body = await req.json().catch(() => ({}));
    const message = String(body.message || body.text || '').trim().slice(0, 1000);
    if (!message) return NextResponse.json({ ok: false, error: 'พิมพ์คำถามก่อนครับ' }, { status: 400 });

    const cfg: any = await loadConfig();
    const facts = await buildLiveFacts('public');
    const r = await generateAiReply({
      text: message,
      cfg,
      draft: { enabled: true },       // หน้าเว็บใช้ AI ได้แม้ปิด AI ของ LINE
      skipLimit: true,
      scope: 'public',
      facts,
    });

    if (!r.ok) {
      return NextResponse.json({
        ok: false,
        error: 'ผู้ช่วย AI ตอบไม่ได้ชั่วคราว',
        fallback: previewText(cfg?.aiFailMessage) || 'ทีมงานได้รับข้อความแล้ว จะรีบติดต่อกลับครับ',
        detail: r.error || null,
      }, { status: 200 });
    }
    return NextResponse.json({ ok: true, text: r.text, provider: r.provider, model: r.model, ms: r.ms });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'error' }, { status: 500 });
  }
}
