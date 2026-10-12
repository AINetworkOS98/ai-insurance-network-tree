#!/usr/bin/env node
/**
 * hover-menu.mjs — hover an element (matched by text) and report the controls/menu items that appear.
 * Usage: CDP_PORT=9333 node hover-menu.mjs "<text>" [tabFilter] [waitMs]
 * Optional 4th arg "click:<label>" clicks the visible element whose text exactly matches <label> after hover.
 */
const PORT = process.env.CDP_PORT || '9333';
const [text, filter = '', waitMs = '1500', action = ''] = process.argv.slice(2);

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const pages = list.filter(t => t.type === 'page' && (!filter || (t.url || '').includes(filter)));
if (pages.length !== 1) { console.error(`need 1 tab (found ${pages.length}) for filter "${filter}"`); process.exit(1); }

const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const waiters = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && waiters.has(m.id)) { const w = waiters.get(m.id); waiters.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; waiters.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (waiters.has(i)) { waiters.delete(i); rej(new Error('cdp timeout: ' + method)); } }, 60000); });
const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const rect = JSON.parse(await evaluate(`(() => {
  const e = [...document.querySelectorAll('*')].filter(x => x.children.length === 0 && (x.innerText||'').includes(${JSON.stringify(text)}))
    .sort((a,b) => (a.innerText||'').length - (b.innerText||'').length)[0];
  if (!e) return JSON.stringify({ ok:false });
  const r = e.getBoundingClientRect();
  return JSON.stringify({ ok:true, x:Math.round(r.x + r.width/2), y:Math.round(r.y + Math.min(r.height/2, 8)) });
})()`));
if (!rect.ok) { console.error('text not found: ' + text); process.exit(3); }

for (const step of [1, 2, 3]) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: rect.x + step * 3, y: rect.y });
  await sleep(300);
}
await sleep(Number(waitMs));
const after = JSON.parse(await evaluate(`(() => {
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
  const items = [...document.querySelectorAll('button,[role="button"],[role="menuitem"],li,a')].filter(vis)
    .map(e => { const r = e.getBoundingClientRect(); return { t:(e.innerText||'').trim().slice(0,20), aria:(e.getAttribute('aria-label')||'').slice(0,22), x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2) }; })
    .filter(o => o.t || o.aria);
  return JSON.stringify(items);
})()`));
console.log(JSON.stringify({ hovered: rect, items: after.slice(0, 40) }));

if (action.startsWith('click:')) {
  const label = action.slice(6);
  const hit = after.find(o => o.t === label || o.aria === label);
  if (!hit) { console.error('label not found after hover: ' + label); process.exit(4); }
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hit.x, y: hit.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
  await sleep(4000);
  const t = await evaluate('document.body.innerText.slice(0, 800)');
  console.log(JSON.stringify({ clicked: label, url: await evaluate('location.href'), text: t }));
}
ws.close();
