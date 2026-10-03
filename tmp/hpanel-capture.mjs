// เปิดแท็บใหม่ใน Chrome (โปรไฟล์ที่ล็อกอิน hPanel) ไปหน้า env ของ Node app แล้วดักทุก fetch
const PORT = 9223;
const VER = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
const browserWs = VER.webSocketDebuggerUrl;
const bws = new WebSocket(browserWs);
await new Promise((res, rej) => { bws.onopen = res; bws.onerror = rej; });
let id = 0; const pending = new Map();
bws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}, sessionId) => new Promise((res) => { const mid = ++id; pending.set(mid, res); bws.send(JSON.stringify({ id: mid, method, params, ...(sessionId ? { sessionId } : {}) })); });

const t = await send('Target.createTarget', { url: 'about:blank' });
const targetId = t.result.targetId;
const at = await send('Target.attachToTarget', { targetId, flatten: true });
const sid = at.result.sessionId;
await send('Page.enable', {}, sid);
await send('Runtime.enable', {}, sid);
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: `window.__L=[];const of=window.fetch;window.fetch=async(...a)=>{const u=(typeof a[0]==='string')?a[0]:(a[0]&&a[0].url);let body=null,st=null;try{const r=await of(...a);st=r.status;const c=r.clone();body=(await c.text()).slice(0,60000);return new Response(body,{status:r.status,statusText:r.statusText,headers:r.headers});}catch(e){body='ERR '+e;throw e;}finally{window.__L.push({u:String(u).slice(0,200),st,body});}};const ox=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){this.__u=u;return ox.apply(this,arguments);};const os=XMLHttpRequest.prototype.send;XMLHttpRequest.prototype.send=function(){this.addEventListener('load',()=>{try{window.__L.push({u:String(this.__u).slice(0,200),st:this.status,body:String(this.responseText).slice(0,60000),xhr:1});}catch(e){}});return os.apply(this,arguments);};`
}, sid);
const url = process.argv[2] || 'https://hpanel.hostinger.com/websites/darkslateblue-nightingale-938495.hostingersite.com/node/env-vars';
await send('Page.navigate', { url }, sid);
await new Promise((r) => setTimeout(r, 9000));
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sid);
  if (r.result?.exceptionDetails) return 'EXC ' + JSON.stringify(r.result.exceptionDetails.exception?.description || '').slice(0, 200);
  return r.result?.result?.value;
};
const loc = await ev('location.href');
console.log('URL:', loc);
const logs = await ev('JSON.stringify((window.__L||[]).map(x=>({u:x.u,st:x.st,len:(x.body||"").length})))');
console.log('fetch/xhr seen:', logs);
const hits = await ev(`JSON.stringify((window.__L||[]).filter(x=>/env|variable/i.test(x.u)).map(x=>({u:x.u,st:x.st,body:(x.body||'').slice(0,4000)})))`);
console.log('ENV CALLS:', hits);
const domTxt = await ev(`(document.body.innerText||'').replace(/\\s+/g,' ').slice(0,1500)`);
console.log('DOM:', domTxt);
bws.close(); process.exit(0);
