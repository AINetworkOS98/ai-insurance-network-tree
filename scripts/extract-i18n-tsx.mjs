#!/usr/bin/env node
/**
 * extract-i18n-tsx.mjs — ดึงข้อความไทยที่ "จะเรนเดอร์จริง" จากซอร์ส JSX ด้วย TypeScript parser
 *
 * ทำไมต้องใช้ parser (ไม่ใช่ regex): regex ไปโดนคอมเมนต์ไทยและโค้ดข้ามบรรทัดปนมาเยอะ
 * ส่วน parser แยกได้จริงว่าเป็น JsxText / string ของ attribute / template literal
 * → ครอบคลุมหน้าที่ต้องล็อกอินด้วย (เก็บจาก DOM ไม่ได้ถ้าไม่ได้ล็อกอิน)
 *
 * ใช้: node scripts/extract-i18n-tsx.mjs
 * ผลลัพธ์: public/i18n/th-en.json (merge เพิ่มเฉพาะคีย์ที่ยังไม่มี) + แปลด้วย DeepSeek
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const OUT_DIR = join(REPO, 'public', 'i18n');
const OUT_FILE = join(OUT_DIR, 'th-en.json');
const THAI = /[\u0E00-\u0E7F]/;
const SKIP_FILE = /thaiAddressData|thaiPit|keyman|thaiLifeReceipt|receiptStandard|demo-data|thaiProvinces|\.test\./i;
const ATTRS = new Set(['placeholder', 'title', 'aria-label', 'alt', 'label']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (/node_modules|[\\/]\.next/.test(p)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !SKIP_FILE.test(p)) out.push(p);
  }
  return out;
}

const norm = (s) => s.replace(/\s+/g, ' ').trim();
const strings = new Set();

for (const file of walk(join(REPO, 'src'))) {
  const src = readFileSync(file, 'utf-8');
  if (!THAI.test(src)) continue;
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const visit = (node) => {
    // ข้อความใน JSX: <h2>ข้อความไทย</h2>
    if (ts.isJsxText(node)) {
      const t = norm(node.getText(sf));
      if (t && THAI.test(t) && t.length <= 300) strings.add(t);
    }
    // attribute: placeholder="ไทย" / title={'ไทย'} / aria-label={`ไทย`}
    if (ts.isJsxAttribute(node) && node.name && ATTRS.has(node.name.getText(sf))) {
      const init = node.initializer;
      if (init) {
        const raw = ts.isJsxExpression(init) && init.expression ? init.expression.getText(sf) : init.getText(sf);
        const t = norm(raw.replace(/^[{'"`]|['"`}]$/g, ''));
        if (t && THAI.test(t) && t.length <= 300 && !/[{}()=>;]/.test(t)) strings.add(t);
      }
    }
    // ข้อความในตัวแปร/ออบเจ็กต์: { title: 'ข้อความไทย' }
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const t = norm(node.text);
      if (t && THAI.test(t) && t.length <= 300) strings.add(t);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}

const list = [...strings];
console.log('ข้อความไทยจากซอร์ส (JSX/attribute/ตัวแปร):', list.length);

mkdirSync(OUT_DIR, { recursive: true });
const dict = existsSync(OUT_FILE) ? JSON.parse(readFileSync(OUT_FILE, 'utf-8')) : {};
const todo = list.filter((s) => !dict[s]);
console.log('มีอยู่ในพจนานุกรมแล้ว:', Object.keys(dict).length, '· ต้องแปลใหม่:', todo.length);

if (!todo.length) {
  console.log('✅ ไม่มีอะไรต้องแปลเพิ่ม');
  process.exit(0);
}

const key = (() => {
  const m = readFileSync('C:/Users/User/AppData/Local/hermes/.env', 'utf-8').match(/^DEEPSEEK_API_KEY=(.*)$/m);
  if (!m) throw new Error('ไม่พบ DEEPSEEK_API_KEY');
  return m[1].trim().replace(/^["']|["']$/g, '');
})();

const SYS = `You translate Thai UI text of a life-insurance agent-network platform into concise, professional English UI copy.
Rules:
- Reply with ONE JSON object only: keys = the given keys (k0, k1, ...), values = English translation.
- Keep emoji, numbers, %, arrows (→) and placeholders ({x}) exactly.
- Short UI labels stay short. No explanations, no markdown.
Glossary: ตัวแทน=agent, ผู้มุ่งหวัง=prospective agent, ใบเสร็จ=receipt, เบี้ย=premium, ค่าคอมมิชชั่น=commission,
ตำแหน่ง=rank, เครือข่าย=network, สมาชิก=member, ผู้แนะนำ=sponsor, ทีม=team, ลีด=lead, 1 แตก 5=1-to-5,
ขึ้นตำแหน่ง=promotion, ปิดยอดรายเดือน=monthly close, เกณฑ์มาตรฐาน=standards, สแกนใบเสร็จ=scan receipt, ผังทีม=team tree.`;

async function batch(items) {
  const payload = Object.fromEntries(items.map((s, i) => [`k${i}`, s]));
  for (let a = 1; a <= 3; a++) {
    try {
      const r = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'system', content: SYS }, { role: 'user', content: JSON.stringify(payload) }, { role: 'assistant', content: '{' }],
          temperature: 0.2, max_tokens: 8000,
        }),
      });
      if (!r.ok) { await new Promise((s) => setTimeout(s, 1200 * a)); continue; }
      const j = await r.json();
      let txt = (j.choices?.[0]?.message?.content || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      if (!txt.startsWith('{')) txt = '{' + txt;
      const obj = JSON.parse(txt);
      const out = {};
      items.forEach((s, i) => { const v = obj[`k${i}`]; if (typeof v === 'string' && v.trim()) out[s] = v.trim(); });
      if (Object.keys(out).length) return out;
    } catch { await new Promise((s) => setTimeout(s, 1200 * a)); }
  }
  return {};
}

let cursor = 0, done = 0;
async function worker() {
  while (cursor < todo.length) {
    const items = todo.slice(cursor, cursor += 25);
    if (!items.length) break;
    Object.assign(dict, await batch(items));
    done += items.length;
    if (done % 100 < 25) {
      writeFileSync(OUT_FILE, JSON.stringify(dict, null, 0), 'utf-8');
      console.log(`… แปลแล้ว ${Object.keys(dict).length}/${list.length + 900}`);
    }
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
writeFileSync(OUT_FILE, JSON.stringify(dict, null, 0), 'utf-8');
console.log('✅ พจนานุกรมรวม', Object.keys(dict).length, 'รายการ · ยังขาด', list.filter((s) => !dict[s]).length);
