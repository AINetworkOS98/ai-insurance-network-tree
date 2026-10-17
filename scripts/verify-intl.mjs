#!/usr/bin/env node
/**
 * verify-intl.mjs — ตรวจว่า "หน้าทุกหน้าเป็นสากล" บนเว็บจริง (production)
 * เปิดทีละหน้า 2 รอบ: รอบไทย (ค่าเริ่มต้น) และรอบอังกฤษ (ตั้ง app-lang=en แล้วโหลดใหม่)
 * แล้วนับจำนวนอักขระไทยที่ยังเหลือในหน้า + ดูว่าข้อความอังกฤษเพิ่มขึ้นจริง
 * ใช้: CDP_PORT=9455 node verify-intl.mjs [baseUrl]
 */
const BASE = (process.argv[2] || 'https://ai-insurance-network-tree.vercel.app').replace(/\/$/, '');
const PORT = Number(process.env.CDP_PORT || 9455);
const PAGES = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ['/financial-freedom', '/recruit', '/register', '/career', '/terms', '/network/1x5-rules', '/verify', '/'];

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
if (!target) throw new Error('no page target');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); }
};
const send = (method, params = {}) => new Promise((resolve, reject) => { const mid = ++id; pending.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const evaluate = async (expr) => (await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true })).result?.value;

const COUNT = `(() => {
  const t = document.body ? document.body.innerText : '';
  const thai = (t.match(/[\\u0E00-\\u0E7F]/g) || []).length;
  const latin = (t.match(/[A-Za-z]/g) || []).length;
  const sample = t.split('\\n').map(s => s.trim()).filter(Boolean).slice(0, 6);
  return JSON.stringify({ thai, latin, sample });
})()`;

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

async function visit(url, lang, waitMs = 4200) {
  await send('Page.navigate', { url });
  await sleep(waitMs);
  if (lang) await evaluate(`localStorage.setItem('app-lang', ${JSON.stringify(lang)})`);
  await send('Page.reload', { ignoreCache: false });
  await sleep(waitMs);
  return JSON.parse(await evaluate(COUNT));
}

console.log('หน้า | ไทย (อักขระ) | EN (อักขระ) | เหลือไทยหลังสลับ EN (%)');
const rows = [];
for (const p of PAGES) {
  const th = await visit(BASE + p, 'th');
  const en = await visit(BASE + p, 'en');
  const left = th.thai ? Math.round((en.thai / th.thai) * 100) : 0;
  rows.push({ page: p, th, en, leftPct: left });
  console.log(`${p} | ${th.thai} | ${en.thai} → ${en.latin} | ${left}%`);
}
console.log('\nตัวอย่างข้อความหลังสลับเป็น EN (/financial-freedom):');
console.log(rows[0]?.en.sample?.join(' / '));
// ตรวจไฟล์วิดีโอ + พจนานุกรม
for (const f of ['/financial-freedom-intl.mp4', '/financial-freedom-intl-poster.jpg', '/videos/financial-freedom-intl.en.vtt', '/i18n/th-en.json']) {
  const r = await fetch(BASE + f, { method: 'HEAD' });
  console.log(`${f} → HTTP ${r.status} · ${r.headers.get('content-length') || '?'} bytes`);
}
ws.close();
