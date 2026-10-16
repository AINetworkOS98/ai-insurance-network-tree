
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
class CDP { constructor(ws){this.ws=ws;this.id=0;this.pending=new Map();this.sessionId=null;
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data); if(m.id&&this.pending.has(m.id)){const{res,rej}=this.pending.get(m.id);this.pending.delete(m.id);m.error?rej(new Error(JSON.stringify(m.error))):res(m.result);}});}
  send(method,params={},sessionId=this.sessionId){const id=++this.id;return new Promise((res,rej)=>{this.pending.set(id,{res,rej});
    this.ws.send(JSON.stringify(sessionId?{id,method,params,sessionId}:{id,method,params}));
    setTimeout(()=>{if(this.pending.has(id)){this.pending.delete(id);rej(new Error('timeout '+method));}},25000);});}}
const ver = await (await fetch('http://127.0.0.1:9333/json/version')).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
const cdp = new CDP(ws);
const list = await (await fetch('http://127.0.0.1:9333/json/list')).json();
const tab = list.find(t => t.type === 'page' && /tiktokstudio\/content/.test(t.url)) || list.find(t => t.type === 'page' && /tiktok/.test(t.url));
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: tab.id, flatten: true });
cdp.sessionId = sessionId; await cdp.send('Runtime.enable');
const ev = async (e) => { const r = await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true });
  return r.exceptionDetails ? '(err)' : r.result?.value; };
console.log(JSON.stringify(await ev(`(() => {
  const links = [...document.querySelectorAll('a[href]')].map(a => a.getAttribute('href')).filter(h => /video|photo/.test(h));
  return { url: location.href, links: links.slice(0, 6),
    firstRowText: (document.querySelectorAll('div,tr').length ? (document.body.innerText.split('\\n').slice(0,26).join(' | ')) : '') };
})()`), null, 1));
ws.close();
