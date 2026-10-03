const PORT = 9223;
const VER = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
const bws = new WebSocket(VER.webSocketDebuggerUrl);
await new Promise((res, rej) => { bws.onopen = res; bws.onerror = rej; });
let id = 0; const pending = new Map(); const reqs = new Map(); const keep = [];
bws.onmessage = (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
  if (m.method === 'Network.responseReceived') {
    const { requestId, response } = m.params;
    reqs.set(requestId, response.url);
    if (/env|variable|hapi/i.test(response.url)) keep.push({ requestId, url: response.url, status: response.status });
  }
};
const send = (method, params = {}, sessionId) => new Promise((res) => { const mid = ++id; pending.set(mid, res); bws.send(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) })); });
const t = await send('Target.createTarget', { url: 'about:blank' });
const sid = (await send('Target.attachToTarget', { targetId: t.result.targetId, flatten: true })).result.sessionId;
await send('Runtime.enable', {}, sid);
await send('Network.enable', {}, sid);
const url = process.argv[2] || 'https://hpanel.hostinger.com/websites/darkslateblue-nightingale-938495.hostingersite.com/node/env-vars';
await send('Page.navigate', { url }, sid);
await new Promise((r) => setTimeout(r, 20000));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid);
  if (r.result?.exceptionDetails) return 'EXC ' + JSON.stringify(r.result.exceptionDetails.exception?.description || '').slice(0, 200);
  return r.result?.result?.value;
};
console.log('URL:', await ev('location.href'));
console.log('title:', await ev('document.title'));
console.log('DOM:', String(await ev(`(document.body?document.body.innerText:'').replace(/\\s+/g,' ').slice(0,800)`)));
console.log('--- api calls ---');
for (const k of keep) {
  let body = '';
  try { const rb = await send('Network.getResponseBody', { requestId: k.requestId }, sid); body = String(rb.result?.body || '').slice(0, 3000); } catch {}
  console.log(k.status, k.url.slice(0, 160));
  if (/env|variable/i.test(k.url)) console.log('   BODY:', body.slice(0, 2500));
}
bws.close(); process.exit(0);
