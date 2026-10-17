#!/usr/bin/env node
// shot-intl.mjs — ถ่ายภาพหน้าเว็บจริงในโหมดภาษาอังกฤษ (หลักฐานว่าเป็นสากล)
import { writeFileSync } from 'node:fs';
const BASE = (process.argv[2] || 'https://ai-insurance-network-tree.vercel.app').replace(/\/$/, '');
const PORT = Number(process.env.CDP_PORT || 9455);
const PAGES = ['/financial-freedom', '/recruit'];
const OUT = 'C:/Users/User/AppData/Local/hermes/cache/scratch/';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const t = list.find((x) => x.type === 'page' && x.webSocketDebuggerUrl);
const ws = new WebSocket(t.webSocketDebuggerUrl);
let id = 0; const pending = new Map();
await new Promise((r) => (ws.onopen = r));
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result); } };
const send = (method, params = {}) => new Promise((resolve, reject) => { const mid = ++id; pending.set(mid, { resolve, reject }); ws.send(JSON.stringify({ id: mid, method, params })); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1400, deviceScaleFactor: 1, mobile: false });
for (const p of PAGES) {
  await send('Page.navigate', { url: BASE + p });
  await sleep(4000);
  await send('Runtime.evaluate', { expression: `localStorage.setItem('app-lang','en')` });
  await send('Page.reload', {});
  await sleep(6500);
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const name = OUT + 'intl' + p.replace(/\//g, '_') + '.png';
  writeFileSync(name, Buffer.from(r.data, 'base64'));
  console.log('saved', name);
}
ws.close();
