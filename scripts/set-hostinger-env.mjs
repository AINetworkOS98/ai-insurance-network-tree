#!/usr/bin/env node
/**
 * ตั้ง/อัปเดต env ของ Web App บน Hostinger (merge ของเดิม ไม่ทับคีย์อื่น)
 *
 * วิธีใช้:
 *   1) วางค่าในไฟล์  C:\Users\User\.n8n\hostinger-extra.env   (ไฟล์นี้ไม่เข้า git)
 *        SMTP_HOST=...
 *        SMTP_PORT=465
 *        SMTP_USER=...
 *        SMTP_PASS=...
 *        SMTP_FROM=...
 *        LINE_CHANNEL_ACCESS_TOKEN=...
 *        LINE_TARGET_ID=...
 *   2) รัน:  node scripts/set-hostinger-env.mjs                 (ส่งทุกคีย์ที่พบในไฟล์)
 *      ตัวเลือก:  node scripts/set-hostinger-env.mjs --dry       (ดูว่าจะส่งอะไร ไม่ยิงจริง)
 *                node scripts/set-hostinger-env.mjs SMTP_HOST   (ส่งเฉพาะคีย์ที่ระบุ)
 *
 * ต้องมีแท็บ Chrome ที่ล็อกอิน hPanel อยู่บนพอร์ต debug 9333
 * สคริปต์พิมพ์แค่ชื่อคีย์ + ความยาว (ไม่พิมพ์ค่าจริง)
 */
import { readFileSync, existsSync } from 'node:fs';

const FILE = process.env.HOSTINGER_ENV_FILE || 'C:/Users/User/.n8n/hostinger-extra.env';
const PORT = 9333;
const B = '/api/wh-api/api/hapi/v1/accounts/u720169514/vhosts/darkslateblue-nightingale-938495.hostingersite.com/nodejs';
const ONLY = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const DRY = process.argv.includes('--dry');

if (!existsSync(FILE)) {
  console.error(`✗ ไม่พบไฟล์ ${FILE}`);
  console.error('  สร้างไฟล์แล้ววางบรรทัด KEY=VALUE (ไฟล์นี้ไม่ถูก commit)');
  process.exit(1);
}

const want = {};
for (const line of readFileSync(FILE, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*(?:export\s+|set\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/i);
  if (!m) continue;
  const k = m[1].toUpperCase();
  const v = m[2].replace(/^["']|["']$/g, '');
  if (!v || /^\[.*\]$/.test(v)) continue; // ข้ามค่าว่าง/placeholder เช่น [SENSITIVE]
  want[k] = v;
}
let keys = Object.keys(want);
if (ONLY.length) keys = keys.filter((k) => ONLY.includes(k));
if (!keys.length) { console.error('✗ ไม่พบคีย์ที่จะส่งในไฟล์ (หรือคีย์ที่ระบุไม่อยู่ในไฟล์)'); process.exit(1); }

console.log('จะตั้งบน Hostinger:', keys.map((k) => `${k}(ยาว ${want[k].length})`).join(', '));
if (DRY) { console.log('(--dry) ไม่ได้ยิง hPanel'); process.exit(0); }

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && t.url.includes('hpanel.hostinger.com'));
if (!page) { console.error('✗ ไม่พบแท็บ hPanel บนพอร์ต ' + PORT + ' (เปิด hpanel.hostinger.com ใน Chrome debug profile ก่อน)'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
await send('Runtime.enable');
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.result?.value;

let ok = 0;
for (const k of keys) {
  const body = JSON.stringify({ key: k, value: want[k] });
  const r = await ev(`(async () => {
    const r1 = await fetch('${B}/env-vars', { credentials:'include', headers:{'content-type':'application/json'}, method:'POST', body: ${JSON.stringify(body)} });
    let t = await r1.text(); if (!t) t = '{}';
    let total = null;
    try { const r2 = await fetch('${B}/env-vars', { credentials:'include' }); const j2 = await r2.json(); total = Array.isArray(j2.data) ? j2.data.length : (j2.data?.total ?? null); } catch (e) {}
    return JSON.stringify({ st: r1.status, total });
  })()`);
  console.log(`  ${k}: ${r}`);
  try { if (JSON.parse(r || '{}').st < 400) ok++; } catch {}
}
console.log(`\nสำเร็จ ${ok}/${keys.length} คีย์ — ขั้นต่อไป: อัปโหลด build ใหม่ (node hp-upload-deploy.mjs <zip>) ให้ค่าใหม่มีผล`);
ws.close();
process.exit(0);
