#!/usr/bin/env node
/**
 * crawl-pages-i18n.mjs — เก็บข้อความไทยที่ "เรนเดอร์จริง" จากทุกหน้าเว็บ แล้วแปลเป็นอังกฤษ
 *
 * ทำไมต้องเก็บจาก DOM ที่เรนเดอร์แล้ว (ไม่ใช่จากซอร์สโค้ด):
 *   โค้ดมีคอมเมนต์ภาษาไทยจำนวนมาก และข้อความ JSX หลายแบบ — เก็บจาก DOM ได้เฉพาะ
 *   ข้อความที่ผู้ใช้เห็นจริง (text node + placeholder/title/aria-label/alt)
 *
 * ใช้: node scripts/crawl-pages-i18n.mjs [baseUrl] [port]
 * ผลลัพธ์: public/i18n/th-en.json (พจนานุกรม ไทย→อังกฤษ ใช้กับคอมโพเนนต์ AutoTranslate)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const OUT_DIR = join(REPO, 'public', 'i18n');
const OUT_FILE = join(OUT_DIR, 'th-en.json');
const BASE = process.argv[2] || 'https://ai-insurance-network-tree.vercel.app';
const PORT = Number(process.argv[3] || 9455);
const THAI = /[\u0E00-\u0E7F]/;

/* ── 1) รวมรายการหน้า: อ่านเส้นทางจากไฟล์ page.tsx ใต้ src/app (แหล่งจริงของเว็บ) ── */
function routes() {
  const root = join(REPO, 'src', 'app');
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        if (/^(\[|\(|api$|_)/.test(name)) continue; // ข้าม dynamic/route group/api
        walk(p);
      } else if (name === 'page.tsx') {
        const rel = p.slice(root.length).replace(/\\/g, '/').replace(/\/page\.tsx$/, '');
        out.push(rel === '' ? '/' : rel);
      }
    }
  };
  walk(root);
  return [...new Set(out)].sort();
}

/* ── 2) CDP: เปิดทีละหน้า แล้วเก็บข้อความไทย ── */
async function cdpTarget() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`);
  const list = await r.json();
  const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
  if (!page) throw new Error('ไม่พบ page target บนพอร์ต ' + PORT);
  return page.webSocketDebuggerUrl;
}

function connect(url) {
  return new Promise((res, rej) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    ws.onopen = () => res({ send, ws });
    ws.onerror = (e) => rej(e);
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve: r, reject: j } = pending.get(msg.id);
        pending.delete(msg.id);
        msg.error ? j(new Error(JSON.stringify(msg.error))) : r(msg.result);
      }
    };
    function send(method, params = {}) {
      const mid = ++id;
      return new Promise((r, j) => {
        pending.set(mid, { resolve: r, reject: j });
        ws.send(JSON.stringify({ id: mid, method, params }));
      });
    }
  });
}

const COLLECT = `(() => {
  const out = new Set();
  const good = (s) => s && /[\\u0E00-\\u0E7F]/.test(s);
  const walk = (root) => {
    const it = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
    let n;
    while ((n = it.nextNode())) {
      if (n.nodeType === 3) {
        const t = (n.textContent || '').replace(/\\s+/g, ' ').trim();
        if (good(t) && t.length <= 300) out.add(t);
      } else if (n.nodeType === 1) {
        const tag = n.tagName.toLowerCase();
        if (tag === 'script' || tag === 'style' || tag === 'template') continue;
        for (const a of ['placeholder', 'title', 'aria-label', 'alt', 'label']) {
          const v = n.getAttribute && n.getAttribute(a);
          if (good(v) && v.length <= 300) out.add(v.replace(/\\s+/g, ' ').trim());
        }
        if (n.getAttribute && n.getAttribute('content')) {
          const v = n.getAttribute('content');
          if (good(v) && v.length <= 300) out.add(v.replace(/\\s+/g, ' ').trim());
        }
        if (n.shadowRoot) walk(n.shadowRoot);
      }
    }
  };
  walk(document.body);
  return JSON.stringify([...out]);
})()`;

const SYS = `You translate Thai UI text of a life-insurance agent-network platform into concise, professional English UI copy.
Rules:
- Reply with ONE JSON object only: keys = the exact input keys given, values = English translation.
- Keep emoji, numbers, %, arrows (→), line structure and placeholders exactly.
- Short UI labels stay short. No explanations, no markdown.
Glossary: ตัวแทน=agent, ผู้มุ่งหวัง=prospective agent, ใบเสร็จ=receipt, เบี้ย=premium, ค่าคอมมิชชั่น=commission,
ตำแหน่ง=rank, เครือข่าย=network, สมาชิก=member, ผู้แนะนำ=sponsor, ทีม=team, ลีด=lead, 1 แตก 5=1-to-5,
ขึ้นตำแหน่ง=promotion, ปิดยอดรายเดือน=monthly close, เกณฑ์มาตรฐาน=standards, สแกนใบเสร็จ=scan receipt, ผังทีม=team tree.`;

function apiKey() {
  const p = 'C:/Users/User/AppData/Local/hermes/.env';
  const m = readFileSync(p, 'utf-8').match(/^DEEPSEEK_API_KEY=(.*)$/m);
  if (!m) throw new Error('ไม่พบ DEEPSEEK_API_KEY');
  return m[1].trim().replace(/^["']|["']$/g, '');
}

async function translateBatch(key, items) {
  const payload = Object.fromEntries(items.map((s, i) => [`k${i}`, s]));
  for (let a = 1; a <= 3; a++) {
    try {
      const r = await fetch('https://api.deepseek.com/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [
            { role: 'system', content: SYS },
            { role: 'user', content: JSON.stringify(payload) },
            { role: 'assistant', content: '{' },
          ],
          temperature: 0.2,
          max_tokens: 8000,
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

const list = routes();
console.log('หน้าเว็บที่จะเก็บข้อความ:', list.length);

const { send, ws } = await connect(await cdpTarget());
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

const strings = new Set();
const perPage = {};
for (const route of list) {
  const url = BASE.replace(/\/$/, '') + route;
  try {
    await send('Page.navigate', { url });
    await new Promise((r) => setTimeout(r, 3200));
    const res = await send('Runtime.evaluate', { expression: COLLECT, returnByValue: true });
    const arr = JSON.parse(res.result.value || '[]');
    perPage[route] = arr.length;
    arr.forEach((s) => strings.add(s));
    console.log(`  ${route} → ${arr.length} ข้อความ (รวม ${strings.size})`);
  } catch (e) {
    console.log(`  ${route} → ข้าม (${String(e).slice(0, 60)})`);
    perPage[route] = -1;
  }
}
ws.close();

console.log('รวมข้อความไทยที่เรนเดอร์จริง:', strings.size);
mkdirSync(OUT_DIR, { recursive: true });
const dict = existsSync(OUT_FILE) ? JSON.parse(readFileSync(OUT_FILE, 'utf-8')) : {};
const todo = [...strings].filter((s) => !dict[s]);
console.log('แปลแล้ว:', Object.keys(dict).length, '· เหลือ:', todo.length);

const key = apiKey();
const SIZE = 25, CONC = 4;
let cursor = 0, batches = 0;
async function worker() {
  while (cursor < todo.length) {
    const items = todo.slice(cursor, cursor += SIZE);
    if (!items.length) break;
    Object.assign(dict, await translateBatch(key, items));
    if (++batches % 5 === 0) {
      writeFileSync(OUT_FILE, JSON.stringify(dict, null, 0), 'utf-8');
      console.log(`… แปลแล้ว ${Object.keys(dict).length}`);
    }
  }
}
await Promise.all(Array.from({ length: CONC }, worker));
writeFileSync(OUT_FILE, JSON.stringify(dict, null, 0), 'utf-8');
writeFileSync(join(OUT_DIR, '_pages.json'), JSON.stringify(perPage, null, 1), 'utf-8');
console.log('✅ เสร็จ — พจนานุกรม', Object.keys(dict).length, 'รายการ · ยังขาด', [...strings].filter((s) => !dict[s]).length);
