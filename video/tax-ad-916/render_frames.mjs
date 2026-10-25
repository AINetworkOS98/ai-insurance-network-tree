#!/usr/bin/env node
/**
 * render_frames_cdp.mjs — เรนเดอร์เฟรมวิดีโอจากหน้า HTML ที่มีสัญญา window.renderAt(t) / window.__ready()
 * ขับด้วย Chrome headless ตัวเดียวผ่าน CDP (zero-dep: ใช้ WebSocket global ของ Node >= 22)
 *
 * ใช้:
 *   node render_frames_cdp.mjs --html out/scene.html --out out/frames      # เรนเดอร์เต็ม
 *   node render_frames_cdp.mjs --html out/scene.html --look 3,9,17,22.5    # ตรวจภาพบางเวลา → <out>/look-<t>.jpg
 *   node render_frames_cdp.mjs --html out/scene.html --probe               # ตัวอย่างทุก ~4 วิ → <out>/probe-<t>.jpg
 * options: --fps 30 --dur 60 --width 1080 --height 1920 --start 0 --end 1800 --step 1 --quality 96
 *
 * เฟรมออกที่ <out>/f%05d.jpg (ใช้กับ ffmpeg: -framerate 30 -i f%05d.jpg)
 * รันยาว ๆ ให้เป็น background + redirect log: node render_frames_cdp.mjs ... > out/render.log 2>&1 &
 */
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const argv = process.argv.slice(2);
const val = (k, d) => { const i = argv.indexOf('--' + k); return i >= 0 ? argv[i + 1] : d; };
const num = (k, d) => Number(val(k, d));
const has = k => argv.includes('--' + k);

const HTML = resolve(val('html', 'out/scene.html'));
const OUTDIR = resolve(dirname(HTML), val('out', 'frames'));
const FPS = num('fps', 30), DUR = num('dur', 60);
const W = num('width', 1080), H = num('height', 1920), Q = num('quality', 96);
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!existsSync(HTML)) { console.error('❌ ไม่พบ', HTML); process.exit(1); }

class CDP {
  constructor(ws) {
    this.ws = ws; this.id = 0; this.pending = new Map(); this.sessionId = null; this.handlers = new Map();
    ws.addEventListener('message', ev => {
      const m = JSON.parse(ev.data);
      if (m.id && this.pending.has(m.id)) { const { res, rej } = this.pending.get(m.id); this.pending.delete(m.id); m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result); }
      else if (m.method && this.handlers.has(m.method)) this.handlers.get(m.method)(m.params);
    });
  }
  send(method, params = {}, sessionId = this.sessionId) {
    const id = ++this.id;
    return new Promise((res, rej) => {
      this.pending.set(id, { res, rej });
      this.ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
      setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('CDP timeout: ' + method)); } }, 60000);
    });
  }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  mkdirSync(OUTDIR, { recursive: true });
  const udd = join(process.env.LOCALAPPDATA || process.env.TMPDIR || '/tmp', 'Temp', 'chrome-frames-' + Date.now());
  try { rmSync(udd, { recursive: true, force: true }); } catch { }

  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-first-run', '--disable-extensions', '--hide-scrollbars',
    '--allow-file-access-from-files', '--force-device-scale-factor=1', `--window-size=${W},${H}`,
    '--mute-audio', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    `--user-data-dir=${udd}`, '--remote-debugging-port=0', 'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  const wsUrl = await new Promise((res, rej) => {
    let buf = '';
    const to = setTimeout(() => rej(new Error('Chrome ไม่ตอบ DevTools endpoint: ' + buf.slice(-400))), 45000);
    chrome.stderr.on('data', d => { buf += d.toString(); const m = buf.match(/ws:\/\/[^\s]+/); if (m) { clearTimeout(to); res(m[0]); } });
    chrome.on('exit', c => rej(new Error('Chrome ออกก่อนเวลา code=' + c + ' ' + buf.slice(-300))));
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
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false });

  const loaded = new Promise(res => cdp.handlers.set('Page.loadEventFired', res));
  await cdp.send('Page.navigate', { url: pathToFileURL(HTML).href });
  await loaded;
  const ready = await cdp.send('Runtime.evaluate', { expression: 'window.__ready()', awaitPromise: true, returnByValue: true });
  if (ready.exceptionDetails) throw new Error('__ready() ล้ม: ' + JSON.stringify(ready.exceptionDetails.exception?.description || ready.exceptionDetails.text));

  const shoot = async (t, file) => {
    const r = await cdp.send('Runtime.evaluate', { expression: `window.renderAt(${t})`, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`renderAt(${t}) โยน exception: ` + JSON.stringify(r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    const shot = await cdp.send('Page.captureScreenshot', { format: 'jpeg', quality: Q, fromSurface: true, captureBeyondViewport: false });
    const buf = Buffer.from(shot.data, 'base64');
    writeFileSync(file, buf);
    return buf.length;
  };
  const tag = t => String(t).replace('.', '_');

  if (has('probe')) {
    for (let t = 0.5; t < DUR; t += 4) { const n = await shoot(t, join(OUTDIR, `probe-${tag(t)}.jpg`)); console.log(`  probe t=${t}s (${(n / 1024).toFixed(0)} KB)`); }
    return finish(ws, chrome, udd);
  }
  if (has('look')) {
    for (const t of String(val('look', '0')).split(',').map(Number)) { const n = await shoot(t, join(OUTDIR, `look-${tag(t)}.jpg`)); console.log(`  look t=${t}s (${(n / 1024).toFixed(0)} KB)`); }
    return finish(ws, chrome, udd);
  }

  const start = num('start', 0), end = num('end', FPS * DUR), step = num('step', 1);
  const t0 = Date.now(); let count = 0;
  for (let f = start; f < end; f += step) {
    await shoot(f / FPS, join(OUTDIR, 'f' + String(f).padStart(5, '0') + '.jpg'));
    count++;
    if (count % 30 === 0 || f === start) {
      const el = (Date.now() - t0) / 1000, rate = count / el;
      console.log(`  ${f + step}/${end} เฟรม · ${rate.toFixed(1)} fps · เหลือ ~${(((end - f) / step / rate) / 60).toFixed(1)} นาที`);
    }
  }
  console.log(`✅ ${count} เฟรม ใน ${((Date.now() - t0) / 60000).toFixed(1)} นาที → ${OUTDIR}`);
  return finish(ws, chrome, udd);
}

async function finish(ws, chrome, udd) {
  try { ws.close(); } catch { }
  chrome.kill(); await sleep(500);
  try { rmSync(udd, { recursive: true, force: true }); } catch { console.log('· (โปรไฟล์ชั่วคราวยังถูกล็อก — ไม่เป็นไร)'); }
}
main().catch(e => { console.error('❌', e.message); process.exit(1); });
