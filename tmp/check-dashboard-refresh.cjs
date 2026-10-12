// ตรวจการทำงานจริงของแถบ "อัปเดตข้อมูล" บน /dashboard (dev server ในเครื่อง + คุกกี้ที่เซ็นเอง)
// 1) โหลดหน้า 2) อ่านข้อความ "อัปเดตล่าสุด" 3) กดปุ่ม ↻ อัปเดตเดี๋ยวนี้ → ต้องเห็นสถานะกำลังอัปเดต แล้วกลับเป็นปกติ
// 4) รอ 35 วินาที → ต้องเห็นเวลาอัปเดตล่าสุดขยับเอง (auto refresh)
// ไม่พิมพ์ค่า token/secret ใด ๆ
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const ROOT = 'C:/Users/User/ai-insurance-network-tree';
const PORT = 9334;
const URL_LOCAL = 'http://localhost:4321/dashboard';
const OUT = path.join(process.env.LOCALAPPDATA, 'Temp', 'dash-local3.png');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function secret() {
  const t = fs.readFileSync(path.join(ROOT, '.env.local'), 'utf8');
  const m = t.match(/^AUTH_SECRET=(.*)$/m) || [];
  return m[1].trim().replace(/^"|"$/g, '');
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
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
  const token = jwt.sign({ sub: 'dash-check', email: 'akarapol.pro798@gmail.com', rankLevel: 4, status: 'ACTIVE' }, secret(), { expiresIn: '15m' });
  const tabs = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  let tab = tabs.find((t) => t.type === 'page' && (t.url || '').startsWith('http://localhost:4321'));
  if (!tab) {
    const created = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent('about:blank')}`, { method: 'PUT' });
    tab = await created.json();
  }
  const cdp = await connect(tab.webSocketDebuggerUrl);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
  await cdp.send('Network.setCookie', { name: 'token', value: token, domain: 'localhost', path: '/', httpOnly: true });
  await cdp.send('Page.bringToFront');
  await cdp.send('Page.navigate', { url: URL_LOCAL });
  await sleep(18000);

  const barText = () => ev(cdp, `(() => { const el=[...document.querySelectorAll('div')].find(e=>(e.innerText||'').includes('อัปเดตล่าสุด')); return el? el.innerText.replace(/\\n/g,' | ') : 'NOT-FOUND'; })()`);
  const btnText = () => ev(cdp, `(() => { const b=[...document.querySelectorAll('button')].find(e=>(e.innerText||'').includes('อัปเดต')); return b? b.innerText.trim() : 'NO-BUTTON'; })()`);

  console.log('url =', await ev(cdp, 'location.href'));
  console.log('แถบอัปเดต (ก่อนกด) =', await barText());

  // กดปุ่มอัปเดตเดี๋ยวนี้
  const clicked = await ev(cdp, `(() => { const b=[...document.querySelectorAll('button')].find(e=>(e.innerText||'').includes('อัปเดตเดี๋ยวนี้')); if(!b) return 'NOT-FOUND'; b.click(); return 'clicked'; })()`);
  console.log('กดปุ่ม =', clicked);
  await sleep(150);
  console.log('ปุ่มทันทีหลังกด =', await btnText());
  await sleep(4000);
  console.log('ปุ่มหลัง 4 วิ =', await btnText());
  const before = await barText();
  console.log('แถบหลังกด =', before);

  // รอ auto-refresh (30 วิ) — ต้องเห็นเวลาอัปเดตล่าสุดขยับเองโดยไม่กดอะไร
  console.log('รอ 35 วินาที เพื่อดู auto-refresh ...');
  await sleep(35000);
  const after = await barText();
  console.log('แถบหลังรอ =', after);
  console.log('auto-refresh ทำงาน =', before !== after ? 'YES (เวลาขยับเอง)' : 'NO (ข้อความเท่าเดิม)');

  const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  fs.writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log('saved:', OUT);
  cdp.close();
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
