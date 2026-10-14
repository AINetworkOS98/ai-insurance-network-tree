/**
 * GET /api/tax/thai-cit            — กติกา/อัตราภาษีเงินได้นิติบุคคล
 * GET /api/tax/thai-cit?selftest=1 — ตรวจความถูกต้องกับชุดทดสอบมาตรฐาน (ชุดเดียวกับโปรแกรม Python)
 * POST /api/tax/thai-cit           — คำนวณภาษีเงินได้นิติบุคคล { input: {...} }
 *
 * หมายเหตุ: เป็น API สาธารณะ (คำนวณล้วน ไม่แตะฐานข้อมูล) — ประกาศไว้ใน middleware
 */
import { NextResponse } from 'next/server';
import { computeCit, CIT_LIMITS, CIT_SME_BRACKETS, CIT_STANDARD_RATE, CIT_YEAR, CIT_CALC_VERSION } from '@/lib/tax/thaiCit';
import { runCitSelftest } from '@/lib/tax/thaiCitSelftest';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get('selftest') === '1') {
    const summary = runCitSelftest();
    return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
  }
  return NextResponse.json({
    year: CIT_YEAR, version: CIT_CALC_VERSION,
    standardRate: CIT_STANDARD_RATE,
    smeBrackets: CIT_SME_BRACKETS.map(([up, rate]) => ({ upTo: up === Number.POSITIVE_INFINITY ? null : up, rate })),
    limits: CIT_LIMITS,
    forms: [
      { form: 'ภ.ง.ด.50', due: 'ภายใน 150 วันนับแต่วันสุดท้ายของรอบระยะเวลาบัญชี' },
      { form: 'ภ.ง.ด.51', due: 'ภายใน 2 เดือนนับแต่วันสุดท้ายของ 6 เดือนแรกของรอบบัญชี (ร้อยละ 50 ของภาษีประมาณการ)' },
    ],
  });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { input?: unknown };
    const input = (body?.input ?? body) as Parameters<typeof computeCit>[0];
    return NextResponse.json(computeCit(input));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'คำนวณไม่สำเร็จ' }, { status: 400 });
  }
}
