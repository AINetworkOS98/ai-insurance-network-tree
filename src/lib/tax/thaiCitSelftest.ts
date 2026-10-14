/**
 * thaiCitSelftest.ts — ตรวจความถูกต้องเครื่องคำนวณภาษีเงินได้นิติบุคคล (ฝั่งเว็บ)
 * ใช้ชุดทดสอบชุดเดียวกับโปรแกรม Python: python/testcases_thai_cit.json
 * เรียกผ่าน GET /api/tax/thai-cit?selftest=1
 */
import casesFile from '../../../python/testcases_thai_cit.json';
import { computeCit, type CitInput } from './thaiCit';

type CaseFile = {
  meta: { purpose: string; year: number };
  cases: Array<{ name: string; input: CitInput; expect: Record<string, unknown> }>;
};

const CASES = casesFile as unknown as CaseFile;

export type CitSelftestCaseResult = { name: string; passed: boolean; mismatches: string[] };
export type CitSelftestSummary = {
  ok: boolean; total: number; passed: number;
  version: string; year: number; cases: CitSelftestCaseResult[];
};

export function runCitSelftest(): CitSelftestSummary {
  const results: CitSelftestCaseResult[] = CASES.cases.map((c) => {
    const got = computeCit(c.input) as unknown as Record<string, unknown>;
    const mismatches: string[] = [];
    for (const [key, want] of Object.entries(c.expect)) {
      const have = got[key];
      if (typeof want === 'boolean') {
        if (Boolean(have) !== want) mismatches.push(`${key}: ได้ ${String(have)} · ควรเป็น ${String(want)}`);
      } else if (typeof want === 'number' && typeof have === 'number') {
        if (Math.abs(have - want) > 0.51) mismatches.push(`${key}: ได้ ${have.toFixed(2)} · ควรเป็น ${want.toFixed(2)}`);
      } else if (have !== want) {
        mismatches.push(`${key}: ได้ ${String(have)} · ควรเป็น ${String(want)}`);
      }
    }
    return { name: c.name, passed: mismatches.length === 0, mismatches };
  });
  const passed = results.filter((r) => r.passed).length;
  return {
    ok: passed === results.length,
    total: results.length, passed,
    version: '1.0.0', year: CASES.meta.year, cases: results,
  };
}
