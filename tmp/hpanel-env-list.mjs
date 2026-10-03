import { writeFileSync } from 'node:fs';
const PORT = 9223;
const B = '/api/wh-api/api/hapi/v1/accounts/u720169514/vhosts/darkslateblue-nightingale-938495.hostingersite.com/nodejs';
const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
const page = list.find((t) => t.type === 'page' && t.url.includes('hpanel.hostinger.com'));
if (!page) { console.error('no hPanel tab'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let id = 0; const pending = new Map();
ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise((res) => { const mid = ++id; pending.set(mid, res); ws.send(JSON.stringify({ id: mid, method, params })); });
await send('Runtime.enable');
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) return 'EXC: ' + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails).slice(0, 300);
  return r.result?.result?.value;
};
const raw = await ev(`(async () => { const r = await fetch('${B}/env-vars', { credentials:'include' }); return (await r.text()).slice(0, 20000); })()`);
writeFileSync('C:/Users/User/ai-insurance-network-tree/tmp/hpanel-envvars.json', String(raw));
let j = null;
try { j = JSON.parse(String(raw)); } catch {}
const arr = Array.isArray(j?.data) ? j.data : (Array.isArray(j) ? j : null);
if (!arr) { console.log('shape:', String(raw).slice(0, 400)); }
else {
  console.log('count:', arr.length);
  for (const it of arr) {
    const k = it.key ?? it.name; const v = it.value ?? '';
    console.log(`${String(k).padEnd(34)} len=${String(v ?? '').length}${['AUTH_SECRET','OAUTH_EXCHANGE_BASE','NEXT_PUBLIC_APP_URL','APP_BASE_URL','GOOGLE_CALLBACK_URL','CRON_SECRET'].includes(String(k)) ? ' <<<' : ''}`);
  }
}
ws.close(); process.exit(0);
