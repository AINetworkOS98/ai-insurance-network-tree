// อ่านสถานะจากหน้าเว็บจริงทุก ๆ 2 วิ (ตัวคอมโพเนนต์รายงาน ความยาวคลิปจริง + ระยะเวลาที่ใช้ต่อคลิปใหม่)
const http = require('http');
const fs = require('fs');

const URL_TARGET = 'https://ai-insurance-network-tree.vercel.app/financial-freedom';
const S = 'C:/Users/User/AppData/Local/hermes/cache/scratch/';
const SEC = Number(process.argv[2] || 70);

function getJSON(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port: 9222, path }, (res) => {
      let d = '';
      res.on('data', (c) => (d += c));
      res.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

(async () => {
  const list = await getJSON('/json/list');
  const page = list.find((t) => t.type === 'page');
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0;
  const pending = new Map();
  const send = (method, params = {}) => new Promise((resolve) => {
    const myId = ++id;
    pending.set(myId, resolve);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
  ws.addEventListener('message', (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  });
  const evalIn = async (expr, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
    return r.result && r.result.result ? r.result.result.value : null;
  };

  await new Promise((r) => ws.addEventListener('open', r));
  await send('Page.enable');
  await send('Page.navigate', { url: URL_TARGET });
  await new Promise((r) => setTimeout(r, 13000));
  await evalIn(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /ยินดีให้เก็บข้อมูล/.test(x.textContent||''));
    if (b) b.click();
    document.querySelectorAll('*').forEach(el => { if (el.scrollHeight > el.clientHeight + 300) el.scrollTop = el.scrollHeight; });
    window.scrollTo(0, document.body.scrollHeight);
    return true;
  })()`);

  const snap = `(() => {
    const box = document.body.innerText;
    const cnt = (box.match(/กำลังเล่นคลิปที่ (\\d+) ของรอบนี้/) || [])[1] || '?';
    const title = (box.match(/รอคลิปแรก…|#[-\\s\\S]{0,70}/) || [''])[0].split('\\n')[0].slice(0, 60);
    const dur = (box.match(/ความยาว (\\d+|กำลังวัด[^\\n]*) วิ?/) || [])[1] || '?';
    const gap = (box.match(/ต่อคลิปใหม่ใน ([\\d.]+) วิ/) || [])[1] || null;
    const pool = (box.match(/คลิปหมวดนี้ (\\d+) รายการ/) || [])[1] || '?';
    return JSON.stringify({ cnt, title, dur, gap, pool, clock: new Date().toISOString().slice(11, 19) });
  })()`;

  const rows = [];
  const started = Date.now();
  let lastKey = '';
  while ((Date.now() - started) / 1000 < SEC) {
    const s = await evalIn(snap);
    if (s) {
      const o = JSON.parse(s);
      const key = o.cnt + '|' + o.dur + '|' + o.gap + '|' + o.pool;
      if (key !== lastKey) {
        rows.push(Object.assign({ t: Math.round((Date.now() - started) / 1000) }, o));
        lastKey = key;
      }
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log('=== สถานะบนหน้าจริง (t = วินาทีนับจากเริ่มวัด) ===');
  rows.forEach((r) => console.log(` t=${r.t}s ${r.clock} | คลิปที่ ${r.cnt} | ยาว ${r.dur} วิ | คลัง ${r.pool} | ต่อคลิปใหม่ใน ${r.gap === null ? '-' : r.gap + ' วิ'} | ${r.title}`));
  fs.writeFileSync(S + 'dom_status.json', JSON.stringify(rows, null, 1));
  ws.close();
  await new Promise((r) => setTimeout(r, 400));
})();
