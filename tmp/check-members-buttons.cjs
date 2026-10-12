// ตรวจหน้าจอจริง /dashboard (dev server ในเครื่อง): ปุ่ม อนุมัติ / ลบ / คืนค่า ในตาราง "รายชื่อสมาชิกล่าสุด"
// อ่านอย่างเดียว — ไม่กดปุ่มที่เขียนข้อมูลจริง (ฐานข้อมูลที่ .env.local ชี้อยู่คือ Supabase จริง)
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const ROOT = 'C:/Users/User/ai-insurance-network-tree';
const PORT = process.argv[2] || '9334';
const EMAIL = process.argv[3] || 'akarapol.pro798@gmail.com';
const OUT = path.join(process.env.LOCALAPPDATA, 'Temp', process.argv[4] || 'dash-members.png');
const URL_LOCAL = 'http://localhost:4321/dashboard';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function secret() {
  const t = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  const m = t.match(/^AUTH_SECRET=(.*)$/m) || [];
  return m[1].trim().replace(/^"|"$/g, '');
}
function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0; const pending = new Map();
    ws.onopen = () => resolve({
      send(method, params = {}, timeoutMs = 60000) {
        const mid = ++id;
        ws.send(JSON.stringify({ id: mid, method, params }));
        return new Promise((res, rej) => {
          const t = setTimeout(() => { pending.delete(mid); rej(new Error('timeout ' + method)); }, timeoutMs);
          pending.set(mid, (m) => { clearTimeout(t); m.error ? rej(new Error(method + ': ' + JSON.stringify(m.error))) : res(m.result); });
        });
      },
      close: () => ws.close(),
    });
    ws.onerror = () => reject(new Error('CDP websocket error'));
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  });
}
const ev = (cdp, expr) => cdp.send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }).then((r) => r.result.value);

(async () => {
  const token = jwt.sign({ sub: 'dash-check', email: EMAIL, rankLevel: 4, status: 'ACTIVE' }, secret(), { expiresIn: '15m' });
  const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  let tab = tabs.find((t) => t.type === 'page' && (t.url || '').startsWith('http://localhost:4321'));
  if (!tab) {
    const created = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
    tab = await created.json();
  }
  const cdp = await connect(tab.webSocketDebuggerUrl);
  await cdp.send('Page.enable'); await cdp.send('Runtime.enable'); await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Network.setCookie', { name: 'token', value: token, domain: 'localhost', path: '/', httpOnly: true });
  await cdp.send('Page.bringToFront');
  await cdp.send('Page.navigate', { url: URL_LOCAL });
  await sleep(20000);

  console.log('url =', await ev(cdp, 'location.href'));
  console.log('ปุ่มในตารางสมาชิก =', await ev(cdp, `(() => {
    const t = [...document.querySelectorAll('button')].map(b=>b.innerText.trim());
    return JSON.stringify({
      approve: t.filter(x=>x.includes('อนุมัติ')).length,
      del: t.filter(x=>x==='🗑 ลบ').length,
      restore: t.filter(x=>x.includes('คืนค่า')).length,
      filters: t.filter(x=>/^(ทั้งหมด|Active|Pending|ลบแล้ว)/.test(x)),
    });
  })()`));
  console.log('หัวตาราง =', await ev(cdp, `(() => { const th=[...document.querySelectorAll('th')].map(e=>e.innerText.trim()); return th.join(' | '); })()`));
  console.log('แถวแรก =', await ev(cdp, `(() => { const tr=document.querySelector('tbody tr'); return tr? tr.innerText.replace(/\\n/g,' | ') : 'NO-ROW'; })()`));
  console.log('ท้ายตาราง =', await ev(cdp, `(() => { const el=[...document.querySelectorAll('div')].find(e=>(e.innerText||'').includes('อัปเดตอัตโนมัติทุก 30 วินาที') && e.innerText.includes('ทะเบียนจริง')); return el? el.innerText.replace(/\\n/g,' ') : 'NOT-FOUND'; })()`));

  // เลื่อนไปที่ตารางสมาชิกแล้วแคป
  await ev(cdp, `(() => { const el=[...document.querySelectorAll('div')].find(e=>(e.innerText||'').startsWith('รายชื่อสมาชิกล่าสุด')); if(el) el.scrollIntoView({block:'start'}); return !!el; })()`);
  await sleep(1500);
  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('saved:', OUT);
  cdp.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
