/**
 * GET /api/tax/keyman            — สรุปหลักเกณฑ์ภาษีของประกันคีย์แมน + แหล่งอ้างอิง
 * GET /api/tax/keyman?selftest=1 — ตรวจความถูกต้องกับชุดทดสอบมาตรฐาน (ตรงกับโปรแกรม Python)
 * POST /api/tax/keyman           — คำนวณวงเงินคุ้มครอง + ผลทางภาษี { input: {...} }
 *
 * เป็น API สาธารณะ (คำนวณล้วน ไม่แตะฐานข้อมูล) — ประกาศไว้ใน middleware
 */
import { NextResponse } from 'next/server';
import { computeKeyman, KEYMAN_VERSION, KEYMAN_YEAR } from '@/lib/tax/keyman';
import { runKeymanSelftest } from '@/lib/tax/keymanSelftest';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get('selftest') === '1') {
    const summary = runKeymanSelftest();
    return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
  }
  return NextResponse.json({
    year: KEYMAN_YEAR, version: KEYMAN_VERSION,
    topic: 'ประกันคีย์แมน (Keyman Insurance) — วงเงินคุ้มครองธุรกิจ + ผลทางภาษี',
    key_rulings: [
      { ref: 'กค 0706/5249', gist: 'จ่ายเบี้ยแทนกรรมการ → หักได้ถ้าจ่ายกรรมการทุกคนเป็นการทั่วไป · เบี้ยเป็นเงินได้ 40(1)' },
      { ref: 'กค 0706/8707', gist: 'จ่ายแทนกรรมการหักได้ · จ่ายแทนผู้ถือหุ้นหักไม่ได้ (มาตรา 65 ตรี (3)) · ซื้อหุ้นคืนจากทายาทหักไม่ได้ (65 ตรี (5))' },
      { ref: 'กค 0702/9358', gist: 'หักได้ตาม 65 ตรี (3),(13) · สินไหมที่ครอบครัว/ทายาทรับยกเว้นตามมาตรา 42(13)' },
      { ref: 'กค 0811/408', gist: 'เบี้ย + ภาษีที่ออกให้ = เงินได้ 40(1) · เงินค่าภาษีอากรที่ออกให้หักได้ (65 ตรี (6))' },
      { ref: 'กค 0702/10407, กค 0706/397', gist: 'สวัสดิการพนักงานทุกคน จ่ายเบี้ยแทนได้ หักได้ · ผลประโยชน์ที่พนักงาน/ทายาทรับยกเว้น 42(13)' },
    ],
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { input?: unknown };
    const input = (body?.input ?? body) as Parameters<typeof computeKeyman>[0];
    return NextResponse.json(computeKeyman(input));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'คำนวณไม่สำเร็จ' }, { status: 400 });
  }
}
