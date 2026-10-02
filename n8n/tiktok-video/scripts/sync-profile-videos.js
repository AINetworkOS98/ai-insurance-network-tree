// ดึงรายการลิงก์วิดีโอจากโปรไฟล์ TikTok ที่เปิดใน Chrome (CDP 9222)
// ใช้: node cdp_tiktok.js
const http = require('http');

function getJSON(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: 9222, path }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

(async () => {
  const list = await getJSON('/json/list');
  const page = list.find((t) => t.type === 'page' && /tiktok\.com\/@aka989/.test(t.url));
  if (!page) {
    console.log('ไม่พบแท็บ TikTok — แท็บที่มี:', list.filter((t) => t.type === 'page').map((t) => t.url).join(' , '));
    process.exit(1);
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const myId = ++id;
      pending.set(myId, resolve);
      ws.send(JSON.stringify({ id: myId, method, params }));
    });

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });

  const evalIn = async (expr, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : null;
  };

  await new Promise((r) => ws.addEventListener('open', r));

  const title = await evalIn('document.title');
  console.log('แท็บ:', String(title).slice(0, 60));

  // เลื่อนหน้าเพื่อให้รายการวิดีโอโหลดครบ (สูงสุด 25 ครั้ง หยุดเมื่อจำนวนไม่เพิ่ม)
  const scroll = `
    (async () => {
      const seen = () => new Set([...document.querySelectorAll('a[href*="/video/"]')].map(a => a.href.split('?')[0])).size;
      let last = -1, same = 0;
      for (let i = 0; i < 25; i++) {
        window.scrollBy(0, 1400);
        await new Promise(r => setTimeout(r, 1200));
        const n = seen();
        if (n === last) { same++; if (same >= 4) break; } else { same = 0; }
        last = n;
      }
      window.scrollTo(0, 0);
      return seen();
    })()`;
  const total = await evalIn(scroll, true);

  const links = await evalIn(`
    JSON.stringify([...new Set([...document.querySelectorAll('a[href*="/video/"]')]
      .map(a => a.href.split('?')[0])
      .filter(u => /\\/video\\/\\d{15,}/.test(u)))])`);

  const arr = JSON.parse(links || '[]');
  console.log('นับจากหน้าจอ:', total, '| ลิงก์ไม่ซ้ำ:', arr.length);
  arr.forEach((u) => console.log(u));
  process.exit(0);
})();
