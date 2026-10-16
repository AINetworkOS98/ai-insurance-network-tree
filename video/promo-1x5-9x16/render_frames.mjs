#!/usr/bin/env node
/**
 * render_frames.mjs — เรนเดอร์เฟรมวิดีโอจาก out/scene.html ผ่าน Chrome headless (CDP)
 *   node render_frames.mjs [--start 0] [--end 1800] [--step 1] [--t 3.5] [--probe]
 *     --start/--end : ช่วงหมายเลขเฟรม (fps 30, 60 วิ = 1800 เฟรม)
 *     --t           : เรนเดอร์เฟรมเดียวที่เวลานั้น ไปที่ out/probe-<t>.jpg (สำหรับตรวจภาพ)
 *     --probe       : เรนเดอร์เฟรมตัวอย่าง (0,3,6,... ) ไป out/probe-*.jpg
 * เฟรมออกที่ out/frames/f%05d.jpg
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, 'out');
const FRAMES = join(OUT, 'frames');
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FPS = 30, DUR = 60;

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i >= 0 ? Number(process.argv[i + 1]) : d; };
const has = k => process.argv.includes('--' + k);

/* ---------- CDP client (zero-dep, WebSocket ในตัว Node) ---------- */
class CDP {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); this.sessionId = null; this.handlers = new Map();
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
      else if (m.method && this.handlers.has(m.method)) this.handlers.get(m.method)(m.params);
    });
  }
  send(method, params = {}, sessionId = this.sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => { this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('CDP timeout: ' + method)); } }, 60000);
    });
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  mkdirSync(FRAMES, { recursive: true });
  const udd = join(process.env.LOCALAPPDATA || 'C:/tmp', 'Temp', 'chrome-promo-' + Date.now());
  rmSync(udd, { recursive: true, force: true });
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', '--hide-scrollbars',
    '--allow-file-access-from-files', '--force-device-scale-factor=1', '--window-size=1080,1920',
    '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    `--user-data-dir=${udd}`, '--remote-debugging-port=0', 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const wsUrl = await new Promise((res, rej) => {
    let buf = '';
    const to = setTimeout(() => rej(new Error('Chrome ไม่ตอบ DevTools endpoint (stderr): ' + buf.slice(-500))), 150000);
    chrome.stderr.on('data', d => { buf += d.toString(); const m = buf.match(/ws:\/\/[^\s]+/); if (m) { clearTimeout(to); res(m[0]); } });
    chrome.on('exit', c => rej(new Error('Chrome ออกก่อนเวลา code=' + c + ' ' + buf.slice(-400))));
  });
  console.log('· Chrome:', wsUrl);

  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
  const cdp = new CDP(ws);
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
  cdp.sessionId = sessionId;
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1080, height: 1920, deviceScaleFactor: 1, mobile: false });

  const loaded = new Promise(res => cdp.handlers.set('Page.loadEventFired', res));
  await cdp.send('Page.navigate', { url: pathToFileURL(join(OUT, 'scene.html')).href });
  await loaded;
  const ready = await cdp.send('Runtime.evaluate', { expression: 'window.__ready()', awaitPromise: true, returnByValue: true });
  console.log('· assets:', JSON.stringify(ready.result?.value));

  const shoot = async (t, file) => {
    const r = await cdp.send('Runtime.evaluate', { expression: `window.renderAt(${t})`, returnByValue: true });
    if (r.exceptionDetails) throw new Error('renderAt(' + t + ') โยน exception: ' + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: 96, fromSurface: true, captureBeyondViewport: false });
    writeFileSync(file, Buffer.from(shot.data, 'base64'));
    return Buffer.from(shot.data, 'base64').length;
  };

  if (has('probe')) {
    const times = [0.5, 4, 9, 12, 17, 22, 27, 32, 37, 42, 47, 51, 56, 59];
    for (const t of times) { const n = await shoot(t, join(OUT, `probe-${String(t).replace('.', '_')}.jpg`)); console.log(`  probe t=${t}s (${(n / 1024).toFixed(0)} KB)`); }
    await finish(ws, chrome, udd); return;
  }
  if (has('look')) {
    const list = String(process.argv[process.argv.indexOf('--look') + 1]).split(',').map(Number);
    for (const t of list) { const file = join(OUT, `look-${String(t).replace('.', '_')}.jpg`); const n = await shoot(t, file); console.log(`  ${file} (${(n / 1024).toFixed(0)} KB)`); }
    await finish(ws, chrome, udd); return;
  }
  if (has('t')) {
    const t = arg('t', 0); const file = join(OUT, `look-${String(t).replace('.', '_')}.jpg`);
    const n = await shoot(t, file); console.log(`  ${file} (${(n / 1024).toFixed(0)} KB)`);
    await finish(ws, chrome, udd); return;
  }

  const start = arg('start', 0), end = arg('end', FPS * DUR), step = arg('step', 1);
  const t0 = Date.now();
  let count = 0;
  for (let f = start; f < end; f += step) {
    const t = f / FPS;
    const file = join(FRAMES, 'f' + String(f).padStart(5, '0') + '.jpg');
    await shoot(t, file);
    count++;
    if (count % 30 === 0 || f === start) {
      const el = (Date.now() - t0) / 1000, rate = count / el, left = (end - f) / step / rate;
      console.log(`  ${f + step}/${end} เฟรม · ${rate.toFixed(1)} fps · เหลือ ~${(left / 60).toFixed(1)} นาที`);
    }
  }
  console.log(`✅ เรนเดอร์ ${count} เฟรม ใน ${((Date.now() - t0) / 1000 / 60).toFixed(1)} นาที → ${FRAMES}`);
  await finish(ws, chrome, udd);
}
async function finish(ws, chrome, udd) { try { ws.close(); } catch { } chrome.kill(); await sleep(500); try { rmSync(udd, { recursive: true, force: true }); } catch { console.log('· (ข้ามการลบโปรไฟล์ชั่วคราว: ' + udd + ')'); } }
main().catch(e => { console.error('❌', e.message); process.exit(1); });
