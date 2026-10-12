const fs = require('fs'); const path = require('path'); const jwt = require('jsonwebtoken');
const ROOT = 'C:/Users/User/ai-insurance-network-tree'; const PORT = '9334';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function secret(){ const t=fs.readFileSync(path.join(ROOT,'.env.local'),'utf8'); const m=t.match(/^AUTH_SECRET=(.*)$/m)||[]; return m[1].trim().replace(/^"|"$/g,''); }
function connect(wsUrl){return new Promise((resolve,reject)=>{const ws=new WebSocket(wsUrl);let id=0;const pending=new Map();
 ws.onopen=()=>resolve({send(method,params={},timeoutMs=60000){const mid=++id;ws.send(JSON.stringify({id:mid,method,params}));return new Promise((res,rej)=>{const t=setTimeout(()=>{pending.delete(mid);rej(new Error('timeout '+method));},timeoutMs);pending.set(mid,(m)=>{clearTimeout(t);m.error?rej(new Error(method+': '+JSON.stringify(m.error))):res(m.result);});});},close:()=>ws.close()});
 ws.onerror=()=>reject(new Error('ws err'));
 ws.onmessage=(e)=>{const m=JSON.parse(e.data); if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};});}
const ev=(cdp,expr)=>cdp.send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true}).then(r=>r.result.value);
(async()=>{
  const token=jwt.sign({sub:'diag',email:'akarapol.pro798@gmail.com',rankLevel:4,status:'ACTIVE'},secret(),{expiresIn:'15m'});
  const tabs=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  let tab=tabs.find(t=>t.type==='page'&&(t.url||'').startsWith('http://localhost:4321'));
  if(!tab){const c=await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`,{method:'PUT'});tab=await c.json();}
  const cdp=await connect(tab.webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
  await cdp.send('Network.setCookie',{name:'token',value:token,domain:'localhost',path:'/',httpOnly:true});
  await cdp.send('Page.bringToFront');
  await cdp.send('Page.navigate',{url:'http://localhost:4321/dashboard'});
  await sleep(22000);
  console.log('--- body text (2000) ---');
  console.log((await ev(cdp,'document.body.innerText')).slice(0,2000));
  console.log('--- เรียก API จากในหน้า ---');
  console.log('admin/members :', await ev(cdp,`fetch('/api/admin/members',{credentials:'include'}).then(async r=>r.status+' :: '+(await r.text()).slice(0,220))`));
  console.log('members       :', await ev(cdp,`fetch('/api/members?take=5',{credentials:'include'}).then(async r=>r.status+' :: '+(await r.text()).slice(0,220))`));
  cdp.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
