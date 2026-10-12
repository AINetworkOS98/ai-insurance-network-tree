const fs=require('fs');const path=require('path');const jwt=require('jsonwebtoken');
const ROOT='C:/Users/User/ai-insurance-network-tree';const PORT='9334';
const OUT=path.join(process.env.LOCALAPPDATA,'Temp','members-page-all.png');
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));
function secret(){const t=fs.readFileSync(path.join(ROOT,'.env.local'),'utf8');const m=t.match(/^AUTH_SECRET=(.*)$/m)||[];return m[1].trim().replace(/^"|"$/g,'');}
function connect(wsUrl){return new Promise((resolve,reject)=>{const ws=new WebSocket(wsUrl);let id=0;const pending=new Map();
 ws.onopen=()=>resolve({send(method,params={},timeoutMs=60000){const mid=++id;ws.send(JSON.stringify({id:mid,method,params}));return new Promise((res,rej)=>{const t=setTimeout(()=>{pending.delete(mid);rej(new Error('timeout '+method));},timeoutMs);pending.set(mid,(m)=>{clearTimeout(t);m.error?rej(new Error(method)):res(m.result);});});},close:()=>ws.close()});
 ws.onerror=()=>reject(new Error('ws err'));
 ws.onmessage=(e)=>{const m=JSON.parse(e.data);if(m.id&&pending.has(m.id)){pending.get(m.id)(m);pending.delete(m.id);}};});}
const ev=(cdp,x)=>cdp.send('Runtime.evaluate',{expression:x,returnByValue:true,awaitPromise:true}).then(r=>r.result.value);
(async()=>{
  const token=jwt.sign({sub:'diag',email:'akarapol.pro798@gmail.com',rankLevel:4,status:'ACTIVE'},secret(),{expiresIn:'15m'});
  const tabs=await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  let tab=tabs.find(t=>t.type==='page'&&(t.url||'').startsWith('http://localhost:4321'));
  if(!tab){const c=await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`,{method:'PUT'});tab=await c.json();}
  const cdp=await connect(tab.webSocketDebuggerUrl);
  await cdp.send('Page.enable');await cdp.send('Runtime.enable');await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride',{width:1440,height:1150,deviceScaleFactor:1,mobile:false});
  await cdp.send('Network.setCookie',{name:'token',value:token,domain:'localhost',path:'/',httpOnly:true});
  await cdp.send('Page.bringToFront');
  await cdp.send('Page.navigate',{url:'http://localhost:4321/members'});
  await sleep(45000);
  console.log('url =',await ev(cdp,'location.href'));
  console.log('หัวตาราง =',await ev(cdp,`[...document.querySelectorAll('th')].map(e=>e.innerText.trim()).join(' | ')`));
  console.log('การ์ดสรุป =',await ev(cdp,`[...document.querySelectorAll('.card')].slice(0,4).map(e=>e.innerText.replace(/\\n/g,' ')).join(' // ')`));
  console.log('ปุ่ม =',await ev(cdp,`(()=>{const t=[...document.querySelectorAll('button')].map(b=>b.innerText.trim());return JSON.stringify({del:t.filter(x=>x.includes('ลบสมาชิก')).length,restore:t.filter(x=>x.includes('คืนค่า')).length,other:t.filter(x=>x.includes('รีเฟรช'))});})()`));
  console.log('แถวแรก =',await ev(cdp,`(()=>{const tr=document.querySelector('tbody tr');return tr?tr.innerText.replace(/\\n/g,' | '):'NO-ROW';})()`));
  console.log('หมายเหตุท้ายตาราง =',await ev(cdp,`(()=>{const el=[...document.querySelectorAll('div')].find(e=>(e.innerText||'').includes('อัปเดตรายชื่ออัตโนมัติทุก 30 วินาที'));return el?el.innerText.replace(/\\n/g,' '):'NOT-FOUND';})()`));
  // ไปที่ตัวกรอง "ลบแล้ว" เพื่อดูปุ่มคืนค่า
  await ev(cdp,`(()=>{const s=[...document.querySelectorAll('select')][0]; if(!s) return 'no-select'; s.value='all'; s.dispatchEvent(new Event('change',{bubbles:true})); return 'set';})()`);
  await sleep(2500);
  console.log('โหมด ลบแล้ว =',await ev(cdp,`(()=>{const t=[...document.querySelectorAll('button')].map(b=>b.innerText.trim());const rows=[...document.querySelectorAll('tbody tr')].length;return JSON.stringify({rows,restore:t.filter(x=>x.includes('คืนค่า')).length,del:t.filter(x=>x.includes('ลบสมาชิก')).length});})()`));
  await ev(cdp,`(()=>{const el=[...document.querySelectorAll('div')].find(e=>(e.innerText||'').startsWith('Member ID'));return !!el;})()`);
  const shot=await cdp.send('Page.captureScreenshot',{format:'png',fromSurface:true});
  fs.writeFileSync(OUT,Buffer.from(shot.data,'base64'));
  console.log('saved:',OUT);
  cdp.close();
})().catch(e=>{console.error('FAIL',e.message);process.exit(1);});
