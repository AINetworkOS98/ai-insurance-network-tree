#!/usr/bin/env node
/**
 * scripts/thai-cit-selftest.mjs — ตรวจเครื่องคำนวณภาษีเงินได้นิติบุคคลบนเว็บจริง
 * เทียบกับชุดทดสอบมาตรฐาน python/testcases_thai_cit.json (ชุดเดียวกับโปรแกรม Python)
 * ใช้: node scripts/thai-cit-selftest.mjs [baseUrl]        (ค่าเริ่มต้น http://localhost:3456)
 *      node scripts/thai-cit-selftest.mjs https://ai-insurance-network-tree.vercel.app
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const base = (process.argv[2] || 'http://localhost:3456').replace(/\/$/, '');
const here = dirname(fileURLToPath(import.meta.url));
const cases = JSON.parse(readFileSync(join(here, '..', 'python', 'testcases_thai_cit.json'), 'utf8')).cases;

const line = (s = '─') => console.log(s.repeat(96));
const fmt = (v) => (typeof v === 'number' ? v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : String(v));

line('=');
console.log(` ตรวจภาษีเงินได้นิติบุคคลบนเว็บจริง · ${cases.length} กรณี · ${base}`);
line('=');

// 1) ตรวจ selftest ฝั่งเซิร์ฟเวอร์
const stRes = await fetch(`${base}/api/tax/thai-cit?selftest=1`, { cache: 'no-store' });
const st = await stRes.json();
const serverOK = st?.ok === true;
console.log(` 1) /api/tax/thai-cit?selftest=1 → ${serverOK ? '✓' : '✗'} ผ่าน ${st?.passed}/${st?.total} กรณี (HTTP ${stRes.status})`);
if (!serverOK) {
  for (const c of st?.cases || []) if (!c.passed) console.log(`     ✗ ${c.name}\n        ${(c.mismatches || []).join('\n        ')}`);
}

// 2) ยิง POST ทีละกรณีจากไฟล์ทดสอบ แล้วเทียบผล
let ok = 0;
const bad = [];
for (const c of cases) {
  const res = await fetch(`${base}/api/tax/thai-cit`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: c.input }), cache: 'no-store',
  });
  const got = await res.json();
  const wrong = [];
  for (const [k, want] of Object.entries(c.expect)) {
    const have = got[k];
    if (typeof want === 'boolean') { if (Boolean(have) !== want) wrong.push(`${k}: ได้ ${have} · ควรเป็น ${want}`); }
    else if (typeof want === 'number' && typeof have === 'number') { if (Math.abs(have - want) > 0.51) wrong.push(`${k}: ได้ ${fmt(have)} · ควรเป็น ${fmt(want)}`); }
    else if (have !== want) wrong.push(`${k}: ได้ ${have} · ควรเป็น ${want}`);
  }
  if (wrong.length) { bad.push(`✗ ${c.name}\n     ${wrong.join('\n     ')}`); console.log(`✗ ${c.name}`); wrong.forEach((w) => console.log(`     ${w}`)); }
  else { ok += 1; console.log(`✓ ${c.name} — ภาษีทั้งปี ${fmt(got.tax_payable)} · ภ.ง.ด.50 ต้องชำระ ${fmt(got.net_payable)} บาท`); }
}

// 3) ตรวจค่าเริ่มต้นของหน้าเว็บ (SME กำไร 1.5 ล้าน) ว่าให้ 180,000 ตามเกณฑ์
const defRes = await fetch(`${base}/api/tax/thai-cit`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ input: { revenue: 8000000, expenses: 6500000, capital_paid_up: 3000000 } }), cache: 'no-store',
});
const def = await defRes.json();
const defOK = Math.abs((def.tax_payable || 0) - 180000) < 0.51 && def.is_sme === true;

line('─');
console.log(` 2) POST ตรวจทีละกรณี: ผ่าน ${ok}/${cases.length} กรณี`);
console.log(` 3) ค่าเริ่มต้น SME (กำไร 1.5 ล้าน) = ${fmt(def.tax_payable)} บาท → ${defOK ? '✓ ตรงตามเกณฑ์ (180,000)' : '✗ ไม่ตรง'}`);
line('=');
const allOK = serverOK && ok === cases.length && defOK;
console.log(allOK ? ' ✓ ผ่านทั้งหมด — เว็บคำนวณภาษีนิติบุคคลตรงกับชุดทดสอบมาตรฐาน (ตรงกับโปรแกรม Python)' : ' ✗ ยังมีข้อที่ไม่ผ่าน — ดูรายละเอียดด้านบน');
process.exit(allOK ? 0 : 1);
