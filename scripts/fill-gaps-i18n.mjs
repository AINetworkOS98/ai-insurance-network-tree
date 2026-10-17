#!/usr/bin/env node
/**
 * fill-gaps-i18n.mjs — เก็บ "ข้อความไทยที่ยังเหลือ" บนหน้าเว็บจริงในโหมด EN แล้วแปลเพิ่มเข้าพจนานุกรม
 * ใช้: CDP_PORT=9455 node fill-gaps-i18n.mjs [baseUrl] [path...]
 */
import { readFileSync, writeFileSync } from 'node:fs';
const BASE = (process.argv[2] || 'https://ai-insurance-network-tree.vercel.app').replace(/\/$/, '');
const PAGES = process.argv.slice(3).length ? process.argv.slice(3) : ['/financial-freedom', '/career'];
const PORT = Number(process.env.CDP_PORT || 9455);
const DICT = 'C:/Users/User/ai-insurance-network-tree/public/i18n/th-en.json';

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const t = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
const send = (method, params = {}) => new Promise((resolve, reject) => { const mid = ++id; pending.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const COLLECT = `(() => {
  const out = new Set();
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let n;
  while ((n = w.nextNode())) {
    if (n.nodeType === 3) { const s = (n.textContent||'').replace(/\\s+/g,' ').trim(); if (s && /[\\u0E00-\\u0E7F]/.test(s) && s.length <= 300) out.add(s); }
    else if (n.nodeType === 1) {
      for (const a of ['placeholder','title','aria-label','alt']) { const v = n.getAttribute && n.getAttribute(a); if (v && /[\\u0E00-\\u0E7F]/.test(v)) out.add(v.replace(/\\s+/g,' ').trim()); }
    }
  }
  return JSON.stringify([...out]);
})()`;

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
const found = new Set();
for (const p of PAGES) {
  await send('Page.navigate', { url: BASE + p });
  await sleep(4200);
  await send('Runtime.evaluate', { expression: `localStorage.setItem('app-lang','en')` });
  await send('Page.reload', {});
  await sleep(6500);
  const r = await send('Runtime.evaluate', { expression: COLLECT, returnByValue: true });
  const arr = JSON.parse(r.result.value || '[]');
  arr.forEach((s) => found.add(s));
  console.log(`${p} → ไทยที่ยังเหลือ ${arr.length}`);
}
const dict = JSON.parse(readFileSync(DICT, 'utf-8'));
const todo = [...found].filter((s) => !dict[s]);
console.log('เหลือทั้งหมด', found.size, '· ยังไม่มีในพจนานุกรม', todo.length);
if (!todo.length) { ws.close(); process.exit(0); }
console.log(todo.slice(0, 40).join('\n'));

const key = readFileSync('C:/Users/User/AppData/Local/hermes/.env', 'utf-8').match(/^DEEPSEEK_API_KEY=(.*)$/m)[1].trim().replace(/^["']|["']$/g, '');
const SYS = `Translate Thai UI text of a life-insurance agent-network platform into concise professional English UI copy.
Reply with ONE JSON object only: keys k0,k1,... → English text. Keep emoji, numbers, %, arrows and placeholders. No markdown.`;
let cursor = 0;
async function worker() {
  while (cursor < todo.length) {
    const items = todo.slice(cursor, cursor += 25);
    const payload = Object.fromEntries(items.map((s, i) => [`k${i}`, s]));
    try {
      const r = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'system', content: SYS }, { role: 'user', content: JSON.stringify(payload) }, { role: 'assistant', content: '{' }], temperature: 0.2, max_tokens: 6000 }),
      });
      const j = await r.json();
      let txt = (j.choices?.[0]?.message?.content || '').trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
      if (!txt.startsWith('{')) txt = '{' + txt;
      const obj = JSON.parse(txt);
      items.forEach((s, i) => { if (typeof obj[`k${i}`] === 'string' && obj[`k${i}`].trim()) dict[s] = obj[`k${i}`].trim(); });
    } catch (e) { console.log('batch error', String(e).slice(0, 80)); }
  }
}
await Promise.all([worker(), worker(), worker()]);
writeFileSync(DICT, JSON.stringify(dict, null, 0), 'utf-8');
console.log('✅ พจนานุกรมรวม', Object.keys(dict).length, '· ยังขาด', todo.filter((s) => !dict[s]).length);
ws.close();
