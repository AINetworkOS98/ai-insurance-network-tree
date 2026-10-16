#!/usr/bin/env node
/**
 * build-i18n-en.mjs — สร้างพจนานุกรม ไทย→อังกฤษ สำหรับทั้งเว็บ (ฉบับสากล)
 *
 * 1) เดินหาสตริงไทยในหน้าเว็บ/คอมโพเนนต์ (ไม่แตะไฟล์ข้อมูลไทย เช่น thaiAddressData/tax)
 * 2) แปลเป็นอังกฤษด้วย DeepSeek (คีย์จาก ~/AppData/Local/hermes/.env — ไม่พิมพ์คีย์ออกมา)
 * 3) เขียน public/i18n/th-en.json (ทำต่อได้: ข้ามคำที่แปลแล้ว)
 *
 * ใช้: node scripts/build-i18n-en.mjs
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const OUT_DIR = join(REPO, 'public', 'i18n');
const OUT_FILE = join(OUT_DIR, 'th-en.json');

const THAI = /[\u0E00-\u0E7F]/;
const SKIP_DIR = /node_modules|[\\/]\.next|video[\\/]|public[\\/]|[\\/]n8n[\\/]|python[\\/]|tests?[\\/]/;
// ไฟล์ข้อมูลไทย (ไม่ใช่ UI) — ไม่ต้องแปล
const SKIP_FILE = /thaiAddressData|thaiPit|keyman|thaiLifeReceipt|receiptStandard|demo-data|thaiProvinces/i;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (SKIP_DIR.test(p)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (['.ts', '.tsx'].includes(extname(p)) && !SKIP_FILE.test(p)) out.push(p);
  }
  return out;
}

function extract() {
  const files = walk(join(REPO, 'src'));
  const found = new Set();
  const LIT = /(["'])((?:(?!\1)[^\\\n]|\\.)*?)\1/g;
  for (const f of files) {
    const s = readFileSync(f, 'utf-8');
    for (const m of s.matchAll(LIT)) {
      const v = (m[2] || '').trim();
      if (!v || !THAI.test(v)) continue;
      if (v.length > 300) continue;          // ข้อความยาว ๆ (ข้อมูล) ข้าม
      if (/^[\s\d\W]+$/.test(v)) continue;    // ไม่มีตัวอักษรจริง
      found.add(v);
    }
  }
  return [...found].sort();
}

function apiKey() {
  const env = readFileSync('C:/Users/User/AppData/Local/hermes/.env', 'utf-8');
  const m = env.match(/^DEEPSEEK_API_KEY=(.*)$/m);
  if (!m) throw new Error('ไม่พบ DEEPSEEK_API_KEY');
  return m[1].trim().replace(/^["']|["']$/g, '');
}

const SYS = `You translate Thai UI text of a life-insurance agent-network platform into concise, professional English UI copy.
Rules:
- Reply with ONE JSON object only: keys = the exact input Thai strings, values = English translation.
- Keep emoji, numbers, %, arrows (→), and placeholders like {x} exactly where they are.
- Keep it short (UI labels stay short). Do not add explanations, quotes or markdown.
Glossary: ตัวแทน=agent, ผู้มุ่งหวัง=prospective agent, ใบเสร็จ=receipt, เบี้ย=premium, ค่าคอมมิชชั่น=commission,
ตำแหน่ง=rank, เครือข่าย=network, สมาชิก=member, ผู้แนะนำ=sponsor, ทีม=team, ลีด=lead,
1 แตก 5=1-to-5, ขึ้นตำแหน่ง=promotion, ปิดยอดรายเดือน=monthly close, เกณฑ์มาตรฐาน=standards,
สแกนใบเสร็จ=scan receipt, ผังทีม=team tree, ช่องว่าง=open slot, คัดออก=removed, รอบ=period.`;

async function translateBatch(key, items) {
  const body = {
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: SYS },
      { role: 'user', content: JSON.stringify(Object.fromEntries(items.map((s, i) => [`k${i}`, s]))) },
      { role: 'assistant', content: '{' },
    ],
    temperature: 0.2,
    max_tokens: 8000,
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
      });
      if (!r.ok) { await new Promise((s) => setTimeout(s, 1500 * attempt)); continue; }
      const j = await r.json();
      let txt = j.choices?.[0]?.message?.content || '';
      txt = txt.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      if (!txt.startsWith('{')) txt = '{' + txt;
      const obj = JSON.parse(txt);
      const out = {};
      items.forEach((s, i) => {
        const v = obj[`k${i}`];
        if (typeof v === 'string' && v.trim()) out[s] = v.trim();
      });
      if (Object.keys(out).length) return out;
    } catch {
      await new Promise((s) => setTimeout(s, 1500 * attempt));
    }
  }
  return {};
}

const strings = extract();
console.log('สตริงไทยที่ต้องแปล:', strings.length);

mkdirSync(OUT_DIR, { recursive: true });
const dict = existsSync(OUT_FILE) ? JSON.parse(readFileSync(OUT_FILE, 'utf-8')) : {};
const todo = strings.filter((s) => !dict[s]);
console.log('แปลแล้ว:', Object.keys(dict).length, '· เหลือ:', todo.length);

const key = apiKey();
const SIZE = 30;
const CONC = 4;
let cursor = 0;
let batches = 0;

async function worker() {
  while (cursor < todo.length) {
    const start = cursor;
    cursor += SIZE;
    const items = todo.slice(start, start + SIZE);
    if (!items.length) break;
    const got = await translateBatch(key, items);
    Object.assign(dict, got);
    batches++;
    if (batches % 5 === 0) {
      writeFileSync(OUT_FILE, JSON.stringify(dict, null, 0), 'utf-8');
      console.log(`… แปลแล้ว ${Object.keys(dict).length} (batch ${batches})`);
    }
  }
}

await Promise.all(Array.from({ length: CONC }, worker));
writeFileSync(OUT_FILE, JSON.stringify(dict, null, 0), 'utf-8');
const missing = strings.filter((s) => !dict[s]);
console.log('✅ เสร็จ — แปลได้', Object.keys(dict).length, '· ที่ยังขาด', missing.length);
if (missing.length) writeFileSync(join(OUT_DIR, '_missing.json'), JSON.stringify(missing, null, 1), 'utf-8');
