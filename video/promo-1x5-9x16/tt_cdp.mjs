
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const STORE = join(HERE, 'out', 'tt_target.json');
const PORT = process.env.CDP_PORT || 9333;
const sleep = ms => new Promise(r => setTimeout(r, ms));
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.sessionId = null;
    ws.addEventListener('message', ev => { const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); } }); }
  send(method, params = {}, sessionId = this.sessionId) { const id = ++this.id;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('timeout ' + method)); } }, 90000); }); }
}
const store = existsSync(STORE) ? JSON.parse(readFileSync(STORE, 'utf-8')) : {};
const save = () => writeFileSync(STORE, JSON.stringify(store, null, 1));
const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
const cdp = new CDP(ws);
const ev = async (expr) => { const r = await cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) return { error: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
  return r.result?.value; };
const [cmd, a1] = [process.argv[2], process.argv[3]];
if (cmd === 'open') {
  const { targetId } = await cdp.send('Target.createTarget', { url: a1 });
  store.targetId = targetId; save();
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  cdp.sessionId = sessionId; store.sessionId = sessionId; save();
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  console.log('OPENED', targetId, a1);
} else {
  let targetId = (a1 && a1.startsWith('id:')) ? a1.slice(3) : (store.targetId);
  let sessionId;
  const findTarget = async () => {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const hit = list.find(t => t.type === 'page' && /tiktok/i.test(t.url)) || list.find(t => t.type === 'page' && !/^about:|hostinger|auth\./i.test(t.url));
    return hit && hit.id;
  };
  try { ({ sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })); }
  catch (e) {
    console.log('attach ล้ม (' + e.message + ') → หาแท็บใหม่จากรายการ');
    targetId = await findTarget(); store.targetId = targetId; save();
    ({ sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true }));
  }
  cdp.sessionId = sessionId;
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
  if (cmd === 'waitfile') {
    const deadline = Date.now() + 150000;
    let found = false;
    while (Date.now() < deadline) {
      const n = await ev(`document.querySelectorAll('input[type=file]').length`);
      const url = await ev(`location.href`);
      console.log('  poll:', new Date().toISOString().slice(11, 19), 'inputs=', n, 'url=', String(url).slice(0, 80));
      if (typeof n === 'number' && n > 0) { found = true; break; }
      await sleep(9000);
    }
    console.log(found ? 'FILE_INPUT_FOUND' : 'FILE_INPUT_MISSING');
    if (found) {
      const doc = await cdp.send('DOM.getDocument', { depth: -1 });
      const q = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: 'input[type=file]' });
      store.backendNodeId = (await cdp.send('DOM.describeNode', { nodeId: q.nodeId })).node.backendNodeId; save();
      console.log('BACKEND_NODE_ID', store.backendNodeId);
    }
  }
  if (cmd === 'upload') {
    const bid = store.backendNodeId;
    await cdp.send('DOM.setFileInputFiles', { files: [a1], backendNodeId: bid });
    console.log('FILE_SET', a1);
    await sleep(6000);
    console.log('page text tail:', String(await ev(`document.body.innerText.slice(0,400)`)));
  }
  if (cmd === 'state') {
    const s = await ev(`(() => {
      const t = document.body.innerText;
      const ce = document.querySelector('[contenteditable=true]');
      return { url: location.href.slice(0,120), title: document.title,
        hasFile: document.querySelectorAll('input[type=file]').length,
        hasDesc: !!ce, desc: ce ? ce.innerText.slice(0,220) : null,
        pct: (t.match(/(\\d{1,3})%/g) || []).slice(-3), left: (t.match(/\\d+\\s*(seconds|วินาที)\\s*left/gi) || []).slice(0,2),
        uploading: /Uploading|กำลังอัปโหลด|โปรเซส|Posting|กำลังเผยแพร่/i.test(t),
        buttons: [...document.querySelectorAll('button,[role=button]')].map(b => (b.innerText||'').trim()).filter(Boolean).slice(0,25),
        textTail: t.slice(-500) };
    })()`);
    console.log(JSON.stringify(s, null, 1));
  }
  if (cmd === 'caption') {
    const r = await ev(`(() => { const ce = document.querySelector('[contenteditable=true]');
      if (!ce) return 'NO_DESC'; ce.focus();
      const r2 = document.createRange(); r2.selectNodeContents(ce);
      const s = getSelection(); s.removeAllRanges(); s.addRange(r2);
      return 'SELECTED'; })()`);
    console.log('select:', r);
    await cdp.send('Input.insertText', { text: a1 });
    await sleep(800);
    console.log('desc now:', await ev(`(document.querySelector('[contenteditable=true]')||{}).innerText`));
  }
  if (cmd === 'setcaption') {
    const text = a1;
    const r = await ev(`(() => { const ce = document.querySelector('[contenteditable=true]');
      if (!ce) return 'NO_DESC';
      ce.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, ${JSON.stringify(text)});
      return 'SET:' + ce.innerText.length; })()`);
    console.log('setcaption:', r);
    await sleep(900);
    const got = await ev(`(document.querySelector('[contenteditable=true]')||{}).innerText || ''`);
    console.log('equal:', String(got).trim() === String(text).trim(), '| len', String(got).length);
    console.log('desc:', String(got).slice(0, 300));
  }
  if (cmd === 'click') {
    const r = await ev(`(() => { const want = ${JSON.stringify(a1)}.toLowerCase();
      const els = [...document.querySelectorAll('button,[role=button],div[role=button]')];
      const hit = els.find(e => (e.innerText||'').trim().toLowerCase().includes(want) && !e.disabled);
      if (!hit) return 'NOT_FOUND:' + els.map(e => (e.innerText||'').trim()).filter(Boolean).slice(0,20).join(' | ');
      hit.click(); return 'CLICKED:' + (hit.innerText||'').trim(); })()`);
    console.log(r);
  }
}
ws.close();
