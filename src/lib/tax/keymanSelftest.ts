/**
 * keymanSelftest.ts — ตรวจความถูกต้องโปรแกรมประกันคีย์แมน (ฝั่งเว็บ)
 * ใช้ชุดทดสอบชุดเดียวกับโปรแกรม Python: python/testcases_keyman.json
 * เรียกผ่าน GET /api/tax/keyman?selftest=1
 */
import casesFile from '../../../python/testcases_keyman.json';
import { computeKeyman, type KeymanInput } from './keyman';

type CaseFile = {
  meta: { purpose: string; year: number };
  cases: Array<{ name: string; input: KeymanInput; expect: Record<string, unknown> }>;
};

const CASES = casesFile as unknown as CaseFile;

export type KeymanSelftestCaseResult = { name: string; passed: boolean; mismatches: string[] };
export type KeymanSelftestSummary = {
  ok: boolean; total: number; passed: number; version: string; year: number; cases: KeymanSelftestCaseResult[];
};

export function runKeymanSelftest(): KeymanSelftestSummary {
  const results: KeymanSelftestCaseResult[] = CASES.cases.map((c) => {
    const got = computeKeyman(c.input) as unknown as Record<string, unknown>;
    const mismatches: string[] = [];
    for (const [key, want] of Object.entries(c.expect)) {
      const have = got[key];
      if (typeof want === 'boolean') {
        if (Boolean(have) !== want) mismatches.push(`${key}: ได้ ${String(have)} · ควรเป็น ${String(want)}`);
      } else if (typeof want === 'number' && typeof have === 'number') {
        if (Math.abs(have - want) > 0.51) mismatches.push(`${key}: ได้ ${have.toLocaleString('en-US')} · ควรเป็น ${want.toLocaleString('en-US')}`);
      } else if (have !== want) {
        mismatches.push(`${key}: ได้ ${String(have)} · ควรเป็น ${String(want)}`);
      }
    }
    return { name: c.name, passed: mismatches.length === 0, mismatches };
  });
  const passed = results.filter((r) => r.passed).length;
  return { ok: passed === results.length, total: results.length, passed, version: '1.0.0', year: CASES.meta.year, cases: results };
}
