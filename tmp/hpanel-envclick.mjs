const PORT = 9223;
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && t.url.includes('/node/'));
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map(); const calls = [];
ws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Network.responseReceived' && /hapi|\/env/i.test(m.params.response.url)) calls.push({ rid: m.params.requestId, url: m.params.response.url, status: m.params.response.status });
};
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
await send('Runtime.enable'); await send('Network.enable');
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.result?.exceptionDetails) return 'EXC ' + String(r.result.exceptionDetails.exception?.description || '').slice(0, 300); return r.result?.result?.value; };
// คลิกเมนู 'ตัวแปรสภาพแวดล้อม'
const clicked = await ev(`(()=>{const els=[...document.querySelectorAll('a,button,div,li,span')].filter(e=>(e.innerText||'').trim()==='ตัวแปรสภาพแวดล้อม');if(!els.length)return 'not-found';const e=els[els.length-1];e.click();return 'clicked:'+e.tagName;})()`);
console.log('click:', clicked);
await new Promise((r) => setTimeout(r, 9000));
console.log('URL now:', await ev('location.href'));
console.log('TEXT:', String(await ev(`(document.body.innerText||'').replace(/\\s+/g,' ').slice(400,2200)`)));
for (const c of calls) {
  let body = '';
  try { const rb = await send('Network.getResponseBody', { requestId: c.rid }); body = String(rb.result?.body || '').slice(0, 4000); } catch {}
  console.log('->', c.status, c.url);
  if (/env/i.test(c.url)) console.log('   BODY:', body.slice(0, 3000));
}
ws.close(); process.exit(0);
