/**
 * thaiPitSelftest.ts — ตรวจความถูกต้องของเครื่องคำนวณภาษี (ฝั่งเว็บ)
 * ใช้ชุดทดสอบชุดเดียวกับโปรแกรม Python: python/testcases_thai_pit.json
 * ตัวเลข 'expect' คำนวณด้วยมือตามหลักเกณฑ์กรมสรรพากร ปีภาษี 2568
 *
 * เรียกผ่าน GET /api/tax/thai-pit?selftest=1
 */
import casesFile from '../../../python/testcases_thai_pit.json';
import { computePit, type PitPerson, type PitResult } from './thaiPit';

type CaseFile = {
  meta: { purpose: string; year: number };
  cases: Array<{ name: string; persons: PitPerson[]; year?: number; expect: Record<string, unknown> }>;
};

const CASES = casesFile as unknown as CaseFile;

export type SelftestCaseResult = {
  name: string;
  passed: boolean;
  errors: string[];
  got: Record<string, unknown>;
};

export type SelftestResult = {
  ok: boolean;
  passed: number;
  total: number;
  cases: SelftestCaseResult[];
  source_of_truth: string;
};

export function runPitSelftest(): SelftestResult {
  const results: SelftestCaseResult[] = [];

  for (const c of CASES.cases) {
    let computed: PitResult | null = null;
    let crash = '';
    try {
      computed = computePit(c.persons, c.year ?? CASES.meta.year);
    } catch (e) {
      crash = e instanceof Error ? e.message : String(e);
    }
    const errors: string[] = [];
    const got: Record<string, unknown> = {};
    if (crash) {
      errors.push(`คำนวณไม่สำเร็จ: ${crash}`);
    } else if (computed) {
      for (const [key, expected] of Object.entries(c.expect)) {
        const actual = (computed as unknown as Record<string, unknown>)[key];
        got[key] = actual;
        if (typeof expected === 'number' && typeof actual === 'number') {
          if (Math.abs(actual - expected) > 0.01) {
            errors.push(`${key}: ได้ ${actual.toLocaleString('en-US')} · ควรเป็น ${expected.toLocaleString('en-US')}`);
          }
        } else if (actual !== expected) {
          errors.push(`${key}: ได้ ${String(actual)} · ควรเป็น ${String(expected)}`);
        }
      }
    }
    results.push({ name: c.name, passed: errors.length === 0, errors, got });
  }

  const passed = results.filter((r) => r.passed).length;
  return {
    ok: passed === results.length,
    passed,
    total: results.length,
    cases: results,
    source_of_truth: 'python/testcases_thai_pit.json (ชุดเดียวกับ python/thai_tax_calculator.py --selftest)',
  };
}

export const PIT_TEST_CASE_COUNT = CASES.cases.length;
