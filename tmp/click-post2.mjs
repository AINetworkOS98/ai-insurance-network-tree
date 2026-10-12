#!/usr/bin/env node
/**
 * click-post2.mjs — click a button that lives inside an INNER scroll container with CSS smooth scrolling.
 * Fixes: element.getBoundingClientRect() + scrollIntoView is unreliable when the scroller animates
 * (TikTok Studio: Post reported at y=1706 → after scroll the point was covered by a hashtag span and the
 * click did nothing). Here we set the scroll container's scrollTop directly (instant), then re-measure and
 * verify elementFromPoint before dispatching real mouse events; retries until the hit test passes.
 *
 * Usage: CDP_PORT=9333 node click-post2.mjs "<label>" [tabFilter] [waitMs]
 */
const PORT = process.env.CDP_PORT || '9333';
const [label, filter = '', waitMs = '9000'] = process.argv.slice(2);

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const pages = list.filter(t => t.type === 'page' && (!filter || (t.url || '').includes(filter)));
if (pages.length !== 1) { console.error(`need 1 tab (found ${pages.length})`); process.exit(1); }
const ws = new WebSocket(pages[0].webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const waiters = new Map();
ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && waiters.has(m.id)) { const w = waiters.get(m.id); waiters.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); } };
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; waiters.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); setTimeout(() => { if (waiters.has(i)) { waiters.delete(i); rej(new Error('cdp timeout: ' + method)); } }, 60000); });
const evaluate = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const find = `(() => {
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
  const all = [...document.querySelectorAll('button,[role="button"]')].filter(vis);
  const e = all.find(x => (x.innerText||'').trim() === ${JSON.stringify(label)});
  if (!e) return null;
  // instant-scroll every scrollable ancestor so the button is centred
  let p = e.parentElement;
  while (p && p !== document.body) {
    const cs = getComputedStyle(p);
    if (p.scrollHeight > p.clientHeight + 20 && /auto|scroll/.test(cs.overflowY)) {
      p.style.scrollBehavior = 'auto';
      const r = e.getBoundingClientRect(), pr = p.getBoundingClientRect();
      p.scrollTop += (r.top - pr.top) - (p.clientHeight / 2) + (r.height / 2);
    }
    p = p.parentElement;
  }
  return e;
})()`;

let hitPoint = null;
for (let attempt = 1; attempt <= 6; attempt++) {
  const r = JSON.parse(await evaluate(`(() => {
    const e = ${find};
    if (!e) return JSON.stringify({ ok:false, why:'no button' });
    const r = e.getBoundingClientRect();
    const x = Math.round(r.x + r.width/2), y = Math.round(r.y + r.height/2);
    const at = document.elementFromPoint(x, y);
    const hit = !!(at && (at === e || e.contains(at) || at.contains(e)));
    return JSON.stringify({ ok:true, disabled: !!e.disabled, x, y, hit, at: at ? at.tagName + '.' + String(at.className).slice(0,34) : null, vh: window.innerHeight });
  })()`));
  if (!r.ok) { console.error(JSON.stringify(r)); process.exit(3); }
  console.error(`attempt ${attempt}: ${r.x},${r.y} hit=${r.hit} at=${r.at} disabled=${r.disabled} vh=${r.vh}`);
  if (r.hit && !r.disabled) { hitPoint = r; break; }
  await sleep(1200);
}
if (!hitPoint) { console.error('could not get a verified hit point'); process.exit(4); }

await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: hitPoint.x, y: hitPoint.y });
await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hitPoint.x, y: hitPoint.y, button: 'left', clickCount: 1 });
await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hitPoint.x, y: hitPoint.y, button: 'left', clickCount: 1 });
await sleep(Number(waitMs));
const after = JSON.parse(await evaluate(`(() => {
  const vis = e => { const r = e.getBoundingClientRect(); return r.width > 4 && r.height > 4; };
  return JSON.stringify({ url: location.href,
    buttons: [...document.querySelectorAll('button')].filter(vis).map(b => (b.innerText||'').trim()).filter(Boolean),
    text: document.body.innerText.slice(0, 700) });
})()`));
console.log(JSON.stringify({ clicked: hitPoint, ...after }));
ws.close();
