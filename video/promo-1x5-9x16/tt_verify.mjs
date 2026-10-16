
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const sleep = ms => new Promise(r => setTimeout(r, ms));
class CDP { constructor(ws){this.ws=ws;this.id=0;this.pending=new Map();this.sessionId=null;
  ws.addEventListener('message',ev=>{const m=JSON.parse(ev.data); if(m.id&&this.pending.has(m.id)){const{res,rej}=this.pending.get(m.id);this.pending.delete(m.id);m.error?rej(new Error(JSON.stringify(m.error))):res(m.result);}});}
  send(method,params={},sessionId=this.sessionId){const id=++this.id;return new Promise((res,rej)=>{this.pending.set(id,{res,rej});
    this.ws.send(JSON.stringify(sessionId?{id,method,params,sessionId}:{id,method,params}));
    setTimeout(()=>{if(this.pending.has(id)){this.pending.delete(id);rej(new Error('timeout '+method));}},30000);});}}
const ver = await (await fetch('http://127.0.0.1:9333/json/version')).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((res,rej)=>{ws.addEventListener('open',res);ws.addEventListener('error',rej);});
const cdp = new CDP(ws);
const { targetId } = await cdp.send('Target.createTarget', { url: 'https://www.tiktok.com/tiktokstudio/content?lang=th-TH' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
cdp.sessionId = sessionId;
await cdp.send('Page.enable'); await cdp.send('Runtime.enable');
const ev = async (e) => { const r = await cdp.send('Runtime.evaluate', { expression: e, returnByValue: true });
  return r.exceptionDetails ? '(eval error)' : r.result?.value; };
let txt = '';
for (let i = 0; i < 9; i++) {
  await sleep(10000);
  txt = String(await ev('document.body.innerText'));
  console.log('poll', i, 'len', txt.length, '|', txt.slice(0, 140).replace(/\s+/g, ' '));
  if (/Posts|\u0e42\u0e1e\u0e2a\u0e15\u0e4c/.test(txt) && txt.length > 700) break;
}
console.log('=== ข้อความหน้า content (1200 ตัวแรก) ===');
console.log(txt.slice(0, 1200));
console.log('=== ท่อนที่มีคำว่า Posts/โพสต์ ===');
const m = txt.match(/.{0,120}(Posts|\u0e42\u0e1e\u0e2a\u0e15\u0e4c).{0,200}/g);
console.log(m ? m.slice(0, 4).join('\n---\n') : '(ไม่พบ)');
const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 80, fromSurface: true });
writeFileSync(join(HERE, 'out', 'tt_content.jpg'), Buffer.from(shot.data, 'base64'));
console.log('screenshot: out/tt_content.jpg');
ws.close();
