#!/usr/bin/env node
/**
 * flow-tiktok-autopilot.mjs
 * ท่ออัตโนมัติ: ChatGPT (prompt ล่าสุด) → Google Flow (สร้างวิดีโอ) → ดาวน์โหลด → TikTok (@aka989._) + คำอธิบายเดิม
 *
 * ใช้ Chrome ที่เปิด debug port ไว้ (ค่าเริ่มต้น 9333) โปรไฟล์ C:\Users\User\cdp-flow ที่ล็อกอินค้างไว้
 *   เริ่ม Chrome:  chrome.exe --user-data-dir=C:/Users/User/cdp-flow --profile-directory=Default \
 *                 --remote-debugging-port=9333 --remote-allow-origins=* --disable-features=DeviceBoundSessionCredentials,DeviceBoundSessions
 *
 * ตัวอย่าง:
 *   node scripts/flow-tiktok-autopilot.mjs --conversation 6aca4737-38dc-83ec-a8f4-804d8115de25 \
 *        --project 5d5bdf40-93fb-4ff0-9d18-37839f7beb2b --aspect 9:16 --caption-file cfg/tiktok-caption.txt --post
 *
 * ผลลัพธ์: JSON บรรทัดสุดท้ายของ stdout { ok, step, promptLen, videoFile, tiktok, error }
 * หมายเหตุ: ไม่มี flag --post = ทำทุกอย่างยกเว้นกดโพสต์ (ปลอดภัยสำหรับทดสอบ)
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';

const CDP_PORT = process.env.CDP_PORT || '9333';
const CDP = `http://127.0.0.1:${CDP_PORT}`;
const HOME = os.homedir();
const DOWNLOADS = path.join(HOME, 'Downloads');

function arg(name, def = null) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}
const CONV = arg('conversation', '6aca4737-38dc-83ec-a8f4-804d8115de25');
const PROJECT = arg('project', '5d5bdf40-93fb-4ff0-9d18-37839f7beb2b');
const ASPECT = arg('aspect', '9:16');
const MODEL_MODE = arg('mode', 'video');
const CAPTION_FILE = arg('caption-file', path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\//, '')), '..', 'n8n', 'flow-tiktok-autopilot', 'caption.txt'));
const DO_POST = !!arg('post', false);
const SKIP_GENERATE = !!arg('skip-generate', false);
const TIMEOUT_GEN_MS = Number(arg('gen-timeout-ms', 300000));

const result = { ok: false, step: 'start', promptLen: 0, videoFile: null, tiktok: null, posted: false, error: null };
const log = (...a) => console.error('[autopilot]', ...a);
function finish(code = 0) { console.log(JSON.stringify(result)); process.exit(code); }

/* ── CDP helpers (ไม่ต้องใช้ dependency) ───────────────────────────────── */
async function listPages() {
  const r = await fetch(CDP + '/json/list');
  return (await r.json()).filter(t => t.type === 'page');
}
async function newPage(url) {
  const r = await fetch(CDP + '/json/new?' + encodeURIComponent(url), { method: 'PUT' });
  return r.json();
}
async function attach(filter) {
  const pages = await listPages();
  const p = pages.find(t => (t.url || '').includes(filter));
  if (!p) throw new Error(`no tab matched: ${filter} | open: ${pages.map(x => x.url).join(', ')}`);
  const ws = new WebSocket(p.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const waiters = new Map();
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && waiters.has(m.id)) { const w = waiters.get(m.id); waiters.delete(m.id); m.error ? w.rej(new Error(JSON.stringify(m.error))) : w.res(m.result); }
  };
  const send = (method, params = {}) => new Promise((res, rej) => {
    const i = ++id; waiters.set(i, { res, rej });
    ws.send(JSON.stringify({ id: i, method, params }));
    setTimeout(() => { if (waiters.has(i)) { waiters.delete(i); rej(new Error('cdp timeout: ' + method)); } }, 60000);
  });
  const evaluate = async (expr, awaitPromise = true) => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise, returnByValue: true });
    if (r.exceptionDetails) throw new Error('eval error: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };
  const close = () => ws.close();
  return { send, evaluate, close, url: p.url };
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function gotoAndWait(filter, url, waitMs = 12000) {
  const pages = await listPages();
  let target = pages.find(t => (t.url || '').includes(filter));
  if (!target) target = await newPage(url);
  const c = await attach(filter);
  await c.send('Page.enable');
  await c.send('Page.navigate', { url });
  await sleep(waitMs);
  c.close();
}

async function ensureChrome() {
  // ถ้า Chrome สำหรับงานอัตโนมัติ (cdp-flow :9333) ปิดอยู่ ให้เปิดให้เอง แล้วรอพอร์ต
  const probe = async () => {
    try { const r = await fetch(CDP + '/json/version'); return r.ok; } catch { return false; }
  };
  if (await probe()) return true;
  log('CDP ไม่ตอบ — เปิด Chrome โปรไฟล์ cdp-flow ให้เอง');
  const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const args = [
    '--user-data-dir=C:/Users/User/cdp-flow', '--profile-directory=Default',
    `--remote-debugging-port=${CDP_PORT}`, '--remote-allow-origins=*', '--no-first-run',
    '--no-default-browser-check', '--window-size=1400,950',
    '--disable-features=DeviceBoundSessionCredentials,DeviceBoundSessions',
  ];
  try {
    const { spawn } = await import('node:child_process');
    spawn(chrome, args, { detached: true, stdio: 'ignore', windowsHide: false }).unref();
  } catch (e) { log('เปิด Chrome ไม่สำเร็จ: ' + e.message); }
  for (let i = 1; i <= 20; i++) { await sleep(2000); if (await probe()) { log(`CDP พร้อมหลัง ${i * 2} วิ`); return true; } }
  return false;
}

/* ── 1) ChatGPT: prompt ล่าสุด ─────────────────────────────────────────── */
async function latestPromptFromChatGPT() {
  result.step = 'chatgpt';
  const url = `https://chatgpt.com/c/${CONV}`;
  await newPage(url);
  await sleep(9000);
  const c = await attach('chatgpt.com');
  const expr = `(async () => {
    const s = await (await fetch('/api/auth/session')).json();
    if (!s || !s.accessToken) return JSON.stringify({ ok:false, reason:'not logged in to ChatGPT' });
    const r = await fetch('/backend-api/conversation/${CONV}', { headers: { Authorization: 'Bearer ' + s.accessToken } });
    const j = await r.json();
    const nodes = Object.values(j.mapping || {}).filter(n => n && n.message);
    nodes.sort((a,b) => (a.message.create_time||0) - (b.message.create_time||0));
    const msgs = nodes.map(n => ({ role: n.message.author?.role, text: ((n.message.content && n.message.content.parts)||[]).filter(p=>typeof p==='string').join('\\n') })).filter(m => m.text && m.text.trim());
    const asst = msgs.filter(m => m.role === 'assistant');
    return JSON.stringify({ ok: true, title: j.title, lastAssistant: asst.length ? asst[asst.length-1].text : '' });
  })()`;
  const raw = await c.evaluate(expr);
  c.close();
  const d = JSON.parse(raw);
  if (!d.ok) throw new Error('ChatGPT: ' + d.reason);
  let p = (d.lastAssistant || '').replace(/<\/?WritingBlock[^>]*>/g, '').trim();
  const cut = p.indexOf('Recommended production settings');
  if (cut > 500) p = p.slice(0, cut).trim();
  if (p.length < 50) throw new Error('prompt ว่าง/สั้นเกินไปจาก ChatGPT');
  result.promptLen = p.length;
  result.promptHead = p.slice(0, 100);
  fs.writeFileSync(path.join(os.tmpdir(), 'flow-prompt-last.txt'), p, 'utf8');
  return p;
}

/* ── 2) Google Flow: ส่งพรอมต์ → สร้าง → ดาวน์โหลด ─────────────────────── */
async function rectOf(c, js) {
  const raw = await c.evaluate(js);
  const d = JSON.parse(raw);
  if (!d.ok) throw new Error('rect not found: ' + JSON.stringify(d));
  return d;
}
async function clickAt(c, x, y) {
  await c.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await c.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await c.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
}

async function generateInFlow(prompt) {
  result.step = 'flow';
  const url = `https://flow.google.com/project/${PROJECT}`;
  await gotoAndWait('flow.google.com/project', url, 14000);
  const c = await attach('flow.google.com/project');

  // open composer settings (chip at bottom right of the composer)
  const chip = await rectOf(c, `(() => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 8 && r.height > 8; };
    const e = [...document.querySelectorAll('button')].filter(vis).find(b => /settings-summary|Nano Banana|Veo|วิดีโอ|รูปภาพ/.test((b.innerText||'') + (b.className||'')));
    if (!e) return JSON.stringify({ ok:false, why:'no settings chip' });
    const r = e.getBoundingClientRect();
    return JSON.stringify({ ok:true, x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) });
  })()`);
  await clickAt(c, chip.x, chip.y);
  await sleep(2500);

  // switch to video mode
  const modeBtn = await rectOf(c, `(() => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 8 && r.height > 8; };
    const e = [...document.querySelectorAll('.settings-content [class*="toggle"]')].filter(vis).find(x => /วิดีโอ|Video/.test(x.innerText||''));
    if (!e) return JSON.stringify({ ok:false, why:'no video toggle' });
    const r = e.getBoundingClientRect();
    return JSON.stringify({ ok:true, x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) });
  })()`);
  await clickAt(c, modeBtn.x, modeBtn.y);
  await sleep(2500);

  // aspect ratio
  const aspLabel = ASPECT === '9:16' ? '9:16' : '16:9';
  const asp = await rectOf(c, `(() => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 8 && r.height > 8; };
    const e = [...document.querySelectorAll('.settings-content [class*="toggle"]')].filter(vis).find(x => (x.innerText||'').includes('${aspLabel}'));
    if (!e) return JSON.stringify({ ok:false, why:'no aspect toggle' });
    const r = e.getBoundingClientRect();
    return JSON.stringify({ ok:true, x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) });
  })()`);
  await clickAt(c, asp.x, asp.y);
  await sleep(1500);

  // count x1
  const x1 = await rectOf(c, `(() => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 8 && r.height > 8; };
    const e = [...document.querySelectorAll('.settings-content [class*="toggle"]')].filter(vis).find(x => (x.innerText||'').trim().startsWith('x1'));
    if (!e) return JSON.stringify({ ok:false, why:'no x1 toggle' });
    const r = e.getBoundingClientRect();
    return JSON.stringify({ ok:true, x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) });
  })()`).catch(() => null);
  if (x1) { await clickAt(c, x1.x, x1.y); await sleep(1200); }
  await c.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await c.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(1200);

  // focus prompt box and type (CDP Input.insertText keeps Thai/emoji + newlines safe)
  const focus = await rectOf(c, `(() => {
    const e = [...document.querySelectorAll('div.ProseMirror, [contenteditable="true"]')].filter(x => { const r = x.getBoundingClientRect(); return r.width > 100 && r.height > 10; })[0];
    if (!e) return JSON.stringify({ ok:false, why:'no prompt box' });
    e.focus();
    const sel = window.getSelection(); const r = document.createRange();
    r.selectNodeContents(e); sel.removeAllRanges(); sel.addRange(r);
    return JSON.stringify({ ok:true });
  })()`);
  if (!focus.ok) throw new Error('หา prompt box ไม่เจอ');
  await c.send('Input.insertText', { text: prompt });
  await sleep(2000);

  // verify send enabled then click it
  const send = await rectOf(c, `(() => {
    const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label')||'') === 'เริ่มสร้าง');
    if (!b) return JSON.stringify({ ok:false, why:'no send button' });
    if (b.disabled) return JSON.stringify({ ok:false, why:'send disabled (prompt ว่าง?)' });
    const r = b.getBoundingClientRect();
    return JSON.stringify({ ok:true, x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) });
  })()`);
  if (SKIP_GENERATE) { log('skip-generate: ไม่กดสร้าง'); c.close(); return null; }
  await clickAt(c, send.x, send.y);
  log('ส่งพรอมต์เข้า Flow แล้ว (' + prompt.length + ' ตัวอักษร) กำลังรอสร้าง...');

  // poll until no % progress remains, then find the newest asset uuid
  const t0 = Date.now();
  let assetId = null;
  while (Date.now() - t0 < TIMEOUT_GEN_MS) {
    await sleep(12000);
    const st = JSON.parse(await c.evaluate(`(() => {
      const bt = document.body.innerText.replace(/\\s+/g,' ');
      const pcts = [...bt.matchAll(/(\\d{1,3})%/g)].map(m => m[1]);
      const uu = [...document.body.innerHTML.matchAll(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g)].map(m => m[0]);
      return JSON.stringify({ pcts: pcts.slice(0,4), uuids: [...new Set(uu)] });
    })()`));
    log('progress', st.pcts.join(','), '| assets seen:', st.uuids.length);
    const others = st.uuids.filter(u => u !== PROJECT);
    if (!st.pcts.length && others.length) { assetId = others[others.length - 1]; break; }
  }
  c.close();
  if (!assetId) throw new Error('วิดีโอไม่เสร็จภายในเวลาที่รอ');
  result.flowAssetId = assetId;

  // download the asset at original 720p
  const before = new Set(fs.readdirSync(DOWNLOADS));
  const editUrl = `https://flow.google.com/project/${PROJECT}/edit/${assetId}`;
  await gotoAndWait('flow.google.com/project', editUrl, 12000);
  const c2 = await attach('flow.google.com/project');
  await c2.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: DOWNLOADS }).catch(() => {});
  const dl = await rectOf(c2, `(() => {
    const e = [...document.querySelectorAll('button')].find(b => /ดาวน์โหลด/.test(b.getAttribute('aria-label')||''));
    if (!e) return JSON.stringify({ ok:false, why:'no download button' });
    const r = e.getBoundingClientRect();
    return JSON.stringify({ ok:true, x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) });
  })()`);
  await clickAt(c2, dl.x, dl.y);
  await sleep(3000);
  const item = await rectOf(c2, `(() => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 8 && r.height > 8; };
    const e = [...document.querySelectorAll('button,[role="menuitem"],li')].filter(vis).filter(x => /720p/.test(x.innerText||'') && /ขนาดดั้งเดิม/.test(x.innerText||'')).pop();
    if (!e) return JSON.stringify({ ok:false, why:'no 720p menu item' });
    const r = e.getBoundingClientRect();
    return JSON.stringify({ ok:true, x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) });
  })()`);
  await clickAt(c2, item.x, item.y);
  c2.close();

  let file = null;
  for (let i = 0; i < 30; i++) {
    await sleep(3000);
    const now = fs.readdirSync(DOWNLOADS).filter(f => !before.has(f) && /\.mp4$/i.test(f));
    if (now.length) { file = path.join(DOWNLOADS, now[0]); break; }
  }
  if (!file) throw new Error('ไม่พบไฟล์วิดีโอใหม่ในโฟลเดอร์ Downloads');
  result.videoFile = file;
  result.videoBytes = fs.statSync(file).size;
  return file;
}

/* ── 3) TikTok: อัปโหลด + คำอธิบาย + โพสต์ ───────────────────────────── */
async function postToTikTok(videoFile, caption) {
  result.step = 'tiktok';
  await newPage('https://www.tiktok.com/tiktokstudio/upload');
  await sleep(14000);
  const c = await attach('tiktokstudio/upload');

  // attach file through DOM.setFileInputFiles
  const { root } = await c.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await c.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
  await c.send('DOM.setFileInputFiles', { nodeId, files: [videoFile] });
  log('แนบไฟล์แล้ว รอ editor...');
  for (let i = 0; i < 24; i++) {
    await sleep(5000);
    const t = await c.evaluate('document.body.innerText');
    if (/Uploaded|อัปโหลดแล้ว/i.test(t)) break;
  }

  // caption
  await c.evaluate(`(() => {
    const el = [...document.querySelectorAll('div[contenteditable="true"]')].sort((a,b) => (b.innerText||'').length - (a.innerText||'').length)[0];
    if (!el) return 'none';
    el.focus();
    const sel = window.getSelection(); const r = document.createRange();
    r.selectNodeContents(el); sel.removeAllRanges(); sel.addRange(r);
    return 'focused';
  })()`);
  await c.send('Input.insertText', { text: caption });
  await sleep(3000);
  const capLen = JSON.parse(await c.evaluate(`(() => {
    const e = [...document.querySelectorAll('[contenteditable=true]')].sort((a,b)=>(b.innerText||'').length-(a.innerText||'').length)[0];
    return JSON.stringify({ len: e ? (e.innerText||'').length : 0, tail: e ? (e.innerText||'').slice(-60) : '' });
  })()`));
  result.captionLen = capLen.len;
  log('แคปชัน', capLen.len, 'ตัวอักษร');

  if (!DO_POST) { result.posted = false; result.tiktok = 'prepared (ไม่ได้กดโพสต์ — ไม่ได้ใส่ --post)'; c.close(); return; }

  // click the page Post button, then the "Post now" confirm if it appears
  const post = await rectOf(c, `(() => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 20 && r.height > 20; };
    const e = [...document.querySelectorAll('button')].filter(vis).find(b => /^Post$|^โพสต์$/.test((b.innerText||'').trim()));
    if (!e) return JSON.stringify({ ok:false, why:'no Post button' });
    const r = e.getBoundingClientRect();
    return JSON.stringify({ ok:true, x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) });
  })()`);
  await clickAt(c, post.x, post.y);
  await sleep(5000);
  const now = await rectOf(c, `(() => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 10 && r.height > 10; };
    const e = [...document.querySelectorAll('button')].filter(vis).find(b => /Post now|โพสต์เลย/.test(b.innerText||''));
    if (!e) return JSON.stringify({ ok:false });
    const r = e.getBoundingClientRect();
    return JSON.stringify({ ok:true, x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) });
  })()`).catch(() => ({ ok: false }));
  if (now.ok) { await clickAt(c, now.x, now.y); log('กด Post now'); }
  await sleep(8000);

  // verify in the studio content manager
  await gotoAndWait('tiktokstudio/content', 'https://www.tiktok.com/tiktokstudio/content', 12000);
  const c2 = await attach('tiktokstudio/content');
  const chk = JSON.parse(await c2.evaluate(`(() => {
    const t = document.body.innerText.replace(/\\s+/g,' ');
    const m = t.match(/Posts\\s+(\\d+)/) || t.match(/โพสต์\\s+(\\d+)/);
    return JSON.stringify({ count: m ? Number(m[1]) : null, hasCaption: t.includes('กลายเป็น 5') });
  })()`));
  c2.close();
  result.posted = !!chk.hasCaption;
  result.tiktok = { posts: chk.count, captionVisible: chk.hasCaption, profile: 'https://www.tiktok.com/@aka989._' };
  return;
}

/* ── main ─────────────────────────────────────────────────────────────── */
try {
  if (!(await ensureChrome())) {
    throw new Error(`Chrome สำหรับงานอัตโนมัติไม่ตอบที่พอร์ต ${CDP_PORT} — ลองเปิด Chrome โปรไฟล์ cdp-flow แล้ว (ดูวิธีในหัวไฟล์สคริปต์)`);
  }
  const prompt = await latestPromptFromChatGPT();
  log('ได้พรอมต์ล่าสุด', prompt.length, 'ตัวอักษร');
  const caption = fs.existsSync(CAPTION_FILE) ? fs.readFileSync(CAPTION_FILE, 'utf8') : '';
  if (!caption) log('คำเตือน: ไม่พบไฟล์คำอธิบาย', CAPTION_FILE);
  else result.captionFile = CAPTION_FILE;

  const video = SKIP_GENERATE ? null : await generateInFlow(prompt);
  if (!SKIP_GENERATE && !video) throw new Error('ดาวน์โหลดวิดีโอไม่สำเร็จ');
  if (video) { log('ได้ไฟล์', video); await postToTikTok(video, caption); }
  result.ok = true;
  result.step = 'done';
  finish(0);
} catch (e) {
  result.ok = false;
  result.error = String(e && e.message ? e.message : e);
  log('ล้มเหลว:', result.error);
  finish(1);
}
