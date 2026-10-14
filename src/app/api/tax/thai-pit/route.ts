import { NextRequest, NextResponse } from 'next/server';
import {
  computePit, DEFAULT_TAX_YEAR, EFFECTIVE_TAX_YEARS, LIM, TAX_BRACKETS,
  TAX_CALC_VERSION, PIT_SOURCES, PIT_DISCLAIMER, type PitPerson,
} from '@/lib/tax/thaiPit';
import { runPitSelftest } from '@/lib/tax/thaiPitSelftest';

// ─────────────────────────────────────────────────────────────────────────────
// /api/tax/thai-pit — เครื่องคำนวณภาษีเงินได้บุคคลธรรมดา (อ้างอิงกรมสรรพากร)
// เอนจินเดียวกับโปรแกรม Python python/thai_tax_calculator.py (เวอร์ชันเดียวกัน)
//   GET  ?selftest=1   → รันชุดทดสอบมาตรฐาน 12 กรณี (ชุดเดียวกับฝั่ง Python)
//   GET                → ข้อมูลกติกา (อัตราขั้นบันได/เพดานลดหย่อน/แหล่งอ้างอิง)
//   POST { persons:[...], year? } → ผลคำนวณภาษีฉบับเต็ม
// เป็นเครื่องคิดเลขล้วน ๆ ไม่แตะฐานข้อมูล/ข้อมูลสมาชิก → เปิดให้ใช้ได้โดยไม่ต้องล็อกอิน
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  if (sp.get('selftest') === '1') {
    const result = runPitSelftest();
    return NextResponse.json({ version: TAX_CALC_VERSION, ...result }, { status: result.ok ? 200 : 500 });
  }

  return NextResponse.json({
    ok: true,
    name: 'เครื่องคำนวณภาษีเงินได้บุคคลธรรมดา (ประเทศไทย)',
    version: TAX_CALC_VERSION,
    python_equivalent: 'python/thai_tax_calculator.py',
    default_year: DEFAULT_TAX_YEAR,
    supported_years: EFFECTIVE_TAX_YEARS,
    tax_brackets: TAX_BRACKETS.map(([upper, rate]) => ({ up_to: Number.isFinite(upper) ? upper : null, rate })),
    limits: LIM,
    sources: PIT_SOURCES,
    disclaimer: PIT_DISCLAIMER,
    howto: {
      selftest: 'GET /api/tax/thai-pit?selftest=1',
      calculate: 'POST /api/tax/thai-pit  { "persons": [{ "salary": 500000, "social_security": 9000 }] }',
      note: 'persons 1 คน = ยื่นคนเดียว · 2 คน = ยื่นรวมกับคู่สมรส (ภ.ง.ด.90)',
    },
  });
}

export async function POST(req: NextRequest) {
  let body: { persons?: PitPerson[]; year?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'ส่งข้อมูลเป็น JSON (Body) ไม่ถูกต้อง' }, { status: 400 });
  }

  const persons = Array.isArray(body?.persons) ? body.persons : [];
  if (persons.length === 0) {
    return NextResponse.json(
      { ok: false, error: 'ต้องส่ง persons อย่างน้อย 1 คน เช่น {"persons":[{"salary":500000}]}' },
      { status: 400 },
    );
  }
  if (persons.length > 2) {
    return NextResponse.json({ ok: false, error: 'รองรับสูงสุด 2 คน (ผู้เสียภาษี + คู่สมรสที่ยื่นรวม)' }, { status: 400 });
  }

  const year = Number(body?.year) || DEFAULT_TAX_YEAR;
  try {
    const result = computePit(persons, year);
    return NextResponse.json({ ok: true, result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'คำนวณไม่สำเร็จ' }, { status: 500 });
  }
}
