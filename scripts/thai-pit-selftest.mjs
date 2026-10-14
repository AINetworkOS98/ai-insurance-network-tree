#!/usr/bin/env node
/**
 * scripts/thai-pit-selftest.mjs
 * ---------------------------------------------------------------------------
 * ตรวจความถูกต้องของเครื่องคำนวณภาษี "บนเว็บจริง" เทียบกับชุดทดสอบมาตรฐาน
 * ใช้ชุดทดสอบเดียวกับโปรแกรม Python: python/testcases_thai_pit.json
 *
 * วิธีใช้
 *   node scripts/thai-pit-selftest.mjs                                        # ยิงเว็บ production
 *   node scripts/thai-pit-selftest.mjs http://localhost:3456                  # ยิงเครื่องตัวเอง
 *
 * ผลลัพธ์: เทียบทีละกรณี (ยอดเงินได้/ค่าใช้จ่าย/ลดหย่อน/เงินได้สุทธิ/ภาษี/ต้องจ่ายเพิ่ม)
 * ออกด้วยรหัส 1 ถ้ามีกรณีไหนไม่ตรง เพื่อใช้เป็นด่านตรวจก่อน/หลัง deploy
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const BASE = (process.argv[2] || 'https://ai-insurance-network-tree.vercel.app').replace(/\/$/, '');
const cases = JSON.parse(readFileSync(join(here, '..', 'python', 'testcases_thai_pit.json'), 'utf8'));

const fmt = (v) => (typeof v === 'number' ? v.toLocaleString('en-US') : String(v));
let passed = 0;
const failures = [];

console.log(`ตรวจเครื่องคำนวณภาษีกับเว็บจริง: ${BASE}`);
console.log(`ชุดทดสอบ: python/testcases_thai_pit.json (${cases.cases.length} กรณี)\n`);

for (const c of cases.cases) {
  let res;
  let body;
  try {
    res = await fetch(`${BASE}/api/tax/thai-pit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ persons: c.persons, year: c.year ?? cases.meta.year }),
    });
    body = await res.json();
  } catch (e) {
    failures.push(`${c.name} — เชื่อมต่อไม่สำเร็จ: ${e.message}`);
    console.log(`✗ ${c.name} — เชื่อมต่อไม่สำเร็จ`);
    continue;
  }

  if (!res.ok || !body?.ok) {
    failures.push(`${c.name} — HTTP ${res.status}: ${body?.error || 'ไม่ทราบสาเหตุ'}`);
    console.log(`✗ ${c.name} — HTTP ${res.status} ${body?.error || ''}`);
    continue;
  }

  const errors = [];
  for (const [key, expected] of Object.entries(c.expect)) {
    const actual = body.result[key];
    const same = typeof expected === 'number' && typeof actual === 'number'
      ? Math.abs(actual - expected) <= 0.01
      : actual === expected;
    if (!same) errors.push(`${key}: เว็บได้ ${fmt(actual)} · ควรเป็น ${fmt(expected)}`);
  }

  if (errors.length) {
    failures.push(`${c.name}\n    ${errors.join('\n    ')}`);
    console.log(`✗ ${c.name}`);
    errors.forEach((e) => console.log(`    ${e}`));
  } else {
    passed += 1;
    console.log(`✓ ${c.name} — ต้องชำระ/ขอคืน ${fmt(body.result.net_payable)} บาท`);
  }
}

console.log('\n' + '─'.repeat(72));
console.log(`ผ่าน ${passed}/${cases.cases.length} กรณี — ${BASE}`);
if (failures.length) {
  console.log('\nกรณีที่ไม่ผ่าน:');
  failures.forEach((f) => console.log(' - ' + f));
  process.exit(1);
}
console.log('เครื่องคำนวณบนเว็บให้ผลตรงกับชุดทดสอบมาตรฐานทุกกรณี (ตรงกับโปรแกรม Python)');
