#!/usr/bin/env node
/**
 * row-action.mjs — click the N-th icon in a Studio post row's action cell and print whatever menu appears.
 * Usage: CDP_PORT=9333 node row-action.mjs <rowY> [iconIndexFromRight] [tabFilter]
 */
const PORT = process.env.CDP_PORT || '9333';
const [rowY, idxFromRight = '0', filter = 'tiktokstudio/content'] = process.argv.slice(2);

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const pages = list.filter(t => t.type === 'page' && (!filter || (t.url || '').includes(filter)));
if (pages.length !== 1) { console.error(`need 1 tab (found ${pages.length})`); process.exit(1); }
const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const waiters = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && waiters.has(m.id)) { const w = waiters.get(m.id); waiters.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; waiters.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (waiters.has(i)) { waiters.delete(i); rej(new Error('timeout ' + method)); } }, 60000); });
const evaluate = async (e) => { const r = await send('Runtime.evaluate', { expression: e, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const icons = JSON.parse(await evaluate(`(() => {
  const y = ${rowY};
  const els = [...document.querySelectorAll('.Tooltip__root')].filter(e => {
    const r = e.getBoundingClientRect();
    return r.width > 8 && r.height > 8 && r.x > 1200 && Math.abs(r.y + r.height/2 - y) < 30;
  }).map(e => { const r = e.getBoundingClientRect(); return { x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) }; })
    .sort((a,b) => a.x - b.x);
  return JSON.stringify(els);
})()`));
if (!icons.length) { console.error('no action icons found at rowY=' + rowY); process.exit(3); }
const pick = icons[icons.length - 1 - Number(idxFromRight)];
console.error('icons:', JSON.stringify(icons), 'picking:', JSON.stringify(pick));
await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pick.x, y: pick.y });
await sleep(400);
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pick.x, y: pick.y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pick.x, y: pick.y, button: 'left', clickCount: 1 });
await sleep(2500);
const menu = JSON.parse(await evaluate(`(() => {
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
  const items = [...document.querySelectorAll('[role="menuitem"], .TUXMenu__item, li, button')].filter(vis)
    .map(e => { const r = e.getBoundingClientRect(); return { t:(e.innerText||'').trim().slice(0,24), x:Math.round(r.x+r.width/2), y:Math.round(r.y+r.height/2) }; })
    .filter(o => o.t);
  return JSON.stringify({ url: location.href, items: items.slice(0, 25), text: document.body.innerText.slice(0, 600) });
})()`));
console.log(JSON.stringify(menu));
ws.close();
