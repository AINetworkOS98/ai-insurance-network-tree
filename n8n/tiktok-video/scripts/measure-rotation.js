// พิสูจน์ "เล่นจบ → สุ่มต่อทันที": จับเหตุการณ์จบคลิปจากตัวเล่น (onStateChange=0 / onCurrentTime ถึงท้าย)
// เทียบเวลากับตอน iframe เปลี่ยนเป็นคลิปใหม่ แล้วรายงานส่วนต่างเป็นวินาที
const http = require('http');
const fs = require('fs');

const URL_TARGET = 'https://ai-insurance-network-tree.vercel.app/financial-freedom';
const S = 'C:/Users/User/AppData/Local/hermes/cache/scratch/';
const SEC = Number(process.argv[2] || 90);

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
  // ติดตั้งตัวบันทึกก่อนโหลดหน้า
  await send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__log = [];
      window.addEventListener('message', function (e) {
        var d; try { d = typeof e.data === 'string' ? JSON.parse(e.data) : e.data; } catch (err) { return; }
        if (!d || d['x-tiktok-player'] !== true) return;
        var t = Date.now();
        if (d.type === 'onStateChange' && d.value === 0) window.__log.push({ t: t, kind: 'ended' });
        if (d.type === 'onCurrentTime' && d.value && d.value.duration) window.__log.push({ t: t, kind: 'dur', v: d.value.duration });
        if (d.type === 'onStateChange' && d.value === 1) window.__log.push({ t: t, kind: 'playing' });
      });
      // เฝ้าการเปลี่ยนคลิปในกรอบ
      window.__frameIds = [];
      setInterval(function () {
        var f = document.querySelector('iframe[src*="tiktok"]');
        if (!f) return;
        var m = f.src.match(/v1\\/(\\d+)/);
        if (!m) return;
        var last = window.__frameIds[window.__frameIds.length - 1];
        if (!last || last.v !== m[1]) window.__frameIds.push({ t: Date.now(), v: m[1] });
      }, 300);`
  });

  await send('Page.navigate', { url: URL_TARGET });
  await new Promise((r) => setTimeout(r, 13000));
  await evalIn(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => /ยินดีให้เก็บข้อมูล/.test(x.textContent||''));
    if (b) b.click();
    document.querySelectorAll('*').forEach(el => { if (el.scrollHeight > el.clientHeight + 300) el.scrollTop = el.scrollHeight; });
    window.scrollTo(0, document.body.scrollHeight);
    return true;
  })()`);
  await new Promise((r) => setTimeout(r, SEC * 1000));

  const out = await evalIn('JSON.stringify({ frames: window.__frameIds, log: window.__log.slice(-60) })');
  const d = JSON.parse(out || '{}');
  const frames = d.frames || [];
  const log = d.log || [];
  const t0 = frames.length ? frames[0].t : Date.now();

  console.log('=== ลำดับคลิปที่เล่นจริง (วัด ' + SEC + ' วิ) ===');
  frames.forEach((f, i) => console.log(` ${i + 1}. t=${((f.t - t0) / 1000).toFixed(1)}s  id=${f.v}`));

  console.log('\n=== เหตุการณ์จากตัวเล่น: จบ → คลิปใหม่ ===');
  for (let i = 0; i < frames.length - 1; i++) {
    const nextAt = frames[i + 1].t;
    const ended = log.filter((e) => e.kind === 'ended' && e.t <= nextAt + 1500).pop();
    const dur = log.filter((e) => e.kind === 'dur' && e.t <= nextAt).pop();
    if (ended) {
      console.log(` คลิป ${i + 1} → ${i + 2}: เหตุการณ์ "จบ" ถึงคลิปใหม่ห่าง ${((nextAt - ended.t) / 1000).toFixed(2)} วิ (ความยาวคลิป ${dur ? dur.v.toFixed(1) : '?'} วิ)`);
    } else {
      console.log(` คลิป ${i + 1} → ${i + 2}: ไม่พบเหตุการณ์ "จบ" (ความยาวคลิป ${dur ? dur.v.toFixed(1) : '?'} วิ) — เปลี่ยนที่ t=${((nextAt - t0) / 1000).toFixed(1)}s`);
    }
  }
  fs.writeFileSync(S + 'gap_report.json', JSON.stringify(d, null, 1));
  ws.close();
  await new Promise((r) => setTimeout(r, 500));
})();
