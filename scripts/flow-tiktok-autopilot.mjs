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
const ASSET = arg('asset', null);   // อัปโหลดคลิปที่มีอยู่แล้วใน Flow ตรง ๆ (ไม่ต้องสร้างใหม่)
const PROMPT_FILE = arg('prompt-file', null);   // ใช้พรอมต์จากไฟล์แทนข้อความล่าสุดของ ChatGPT (เช่นเลือกฉากเดียวจาก Story Beat)
const CAPTION_CHECK = arg('caption-check', null); // ข้อความไว้ยืนยันว่าแคปชันขึ้นจริงใน TikTok content manager
const VIDEO_FILE = arg('video-file', null);     // โพสต์คลิปที่ดาวน์โหลดไว้แล้ว (ข้าม ChatGPT/Flow) — ใช้เมื่อสร้างคลิปจาก Chrome คนละโปรไฟล์
const MODEL = arg('model', null);               // ชื่อรุ่นใน Flow เช่น "Veo 3.1 - Fast" (ไม่ระบุ = ใช้รุ่นที่หน้ามีอยู่)
const TIMEOUT_GEN_MS = Number(arg('gen-timeout-ms', 300000));

// ── พอร์ต/โปรไฟล์ Chrome: งาน TikTok+ChatGPT ที่ CDP_PORT, งาน Google Flow ที่ FLOW_PORT ──
// (โปรไฟล์ cdp-flow อาจหลุดล็อกอิน Google ขณะที่ TikTok ยังอยู่ ⇒ แยก Chrome สองตัวได้)
const PROFILE_DIR = 'C:/Users/User/cdp-flow';
const FLOW_PORT = process.env.CDP_FLOW_PORT || String(arg('flow-port', '9344'));
const FLOW_PROFILE = process.env.CDP_FLOW_PROFILE || String(arg('flow-profile', 'C:/Users/User/cdp-live'));

const result = { ok: false, step: 'start', promptLen: 0, videoFile: null, tiktok: null, posted: false, error: null };
const log = (...a) => console.error('[autopilot]', ...a);
function finish(code = 0) { console.log(JSON.stringify(result)); process.exit(code); }

/* ── 0) ตัวกันข้อมูลส่วนตัว ──────────────────────────────────────────────
 * กติกาผู้ใช้: ห้ามนำข้อมูลส่วนตัว (เช่น ข้อมูลของ "papa") ส่งออกไป AI / แอป /
 * โปรแกรมใด ๆ — พรอมต์ที่ส่งเข้า Google Flow และแคปชันที่พิมพ์ลง TikTok คือจุดที่
 * ข้อมูลออกจากเครื่อง จึงต้องผ่านประตูนี้ก่อนเสมอ.
 * รายการคำต้องห้าม: n8n/flow-tiktok-autopilot/privacy-blocklist.txt (บรรทัดละคำ)
 */
const BLOCKLIST_FILE = arg('blocklist', path.join(HOME, 'ai-insurance-network-tree', 'n8n', 'flow-tiktok-autopilot', 'privacy-blocklist.txt'));
function privacyTerms() {
  try {
    return fs.readFileSync(BLOCKLIST_FILE, 'utf8').split(/\r?\n/)
      .map(s => s.trim()).filter(s => s && !s.startsWith('#'));
  } catch { return []; }
}
function privacyCheck(text, where) {
  const s = String(text || '');
  const low = s.toLowerCase();
  const hits = privacyTerms().filter(t => low.includes(t.toLowerCase()));
  const digits = s.replace(/[^0-9]/g, '');
  if (/(?<!\d)\d{13}(?!\d)/.test(s) || /\d-\d{4}-\d{5}-\d{2}-\d/.test(s) || /(?<!\d)\d{13}(?!\d)/.test(digits)) {
    hits.push('เลขบัตรประชาชน/เลข 13 หลัก');
  }
  if (/\b0\d{8,9}\b/.test(s.replace(/[-\s]/g, ''))) hits.push('เบอร์โทรศัพท์');
  if (hits.length) {
    result.privacy = { blocked: true, where, hits };
    throw new Error(`บล็อกข้อมูลส่วนตัวก่อนส่งออก (${where}) → ${hits.join(', ')} | ห้ามส่งข้อมูลส่วนตัวเข้า AI/แอป/โปรแกรมใด ๆ — แก้พรอมต์/แคปชันก่อนรันใหม่`);
  }
  result.privacy = { blocked: false, where };
  return true;
}

/* ── CDP helpers (ไม่ต้องใช้ dependency, ระบุพอร์ตได้) ─────────────────── */
const cdpBase = (port) => `http://127.0.0.1:${port}`;
async function listPages(port = CDP_PORT) {
  const r = await fetch(cdpBase(port) + '/json/list');
  return (await r.json()).filter(t => t.type === 'page');
}
async function newPage(url, port = CDP_PORT) {
  const r = await fetch(cdpBase(port) + '/json/new?' + encodeURIComponent(url), { method: 'PUT' });
  return r.json();
}
async function attach(filter, exclude = null, port = CDP_PORT) {
  const pages = await listPages(port);
  const p = pages.find(t => (t.url || '').includes(filter) && (!exclude || !(t.url || '').includes(exclude)));
  if (!p) throw new Error(`no tab matched: ${filter}${exclude ? ' (ยกเว้น ' + exclude + ')' : ''} ที่พอร์ต ${port} | open: ${pages.map(x => x.url).join(', ')}`);
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
  return { send, evaluate, close, url: p.url, port };
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function gotoAndWait(filter, url, waitMs = 12000, exclude = null, port = CDP_PORT) {
  const pages = await listPages(port);
  let target = pages.find(t => (t.url || '').includes(filter) && (!exclude || !(t.url || '').includes(exclude)));
  if (!target) target = await newPage(url, port);
  const c = await attach(filter, exclude, port);
  await c.send('Page.enable');
  await c.send('Page.navigate', { url });
  await sleep(waitMs);
  c.close();
}

async function ensureChrome(port = CDP_PORT, profileDir = PROFILE_DIR) {
  // ถ้า Chrome ของโปรไฟล์นั้นปิดอยู่ ให้เปิดเอง (นอกจอ) แล้วรอพอร์ต
  const probe = async () => {
    try { const r = await fetch(cdpBase(port) + '/json/version'); return r.ok; } catch { return false; }
  };
  if (await probe()) return true;
  log(`CDP ${port} ไม่ตอบ — เปิด Chrome โปรไฟล์ ${profileDir} ให้เอง`);
  const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  const args = [
    `--user-data-dir=${profileDir}`, '--profile-directory=Default',
    `--remote-debugging-port=${port}`, '--remote-allow-origins=*', '--no-first-run',
    '--no-default-browser-check', '--window-size=1400,950',
    // ซ่อนหน้าต่างไม่ให้รบกวนผู้ใช้: Chrome ยอมรับพิกัดลบ (ทดสอบแล้ว: เปิดที่ -26214,-26214
    // ขณะที่ CDP ยังตอบ 200) ⇒ งานอัตโนมัติรันได้ครบโดยไม่มีหน้าต่างโผล่บนจอ
    '--window-position=-32000,-32000',
    '--disable-features=DeviceBoundSessionCredentials,DeviceBoundSessions',
  ];
  try {
    const { spawn } = await import('node:child_process');
    spawn(chrome, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  } catch (e) { log('เปิด Chrome ไม่สำเร็จ: ' + e.message); }
  for (let i = 1; i <= 20; i++) { await sleep(2000); if (await probe()) { log(`CDP ${port} พร้อมหลัง ${i * 2} วิ`); return true; } }
  return false;
}

// เปิดโปรเจกต์ Flow บนพอร์ตที่ล็อกอิน Google จริง (cdp-flow อาจหลุดล็อกอิน ขณะที่อีกโปรไฟล์ยังใช้ได้)
async function openFlowProject(projectUrl) {
  const candidates = [{ port: FLOW_PORT, profile: FLOW_PROFILE }];
  if (String(FLOW_PORT) !== String(CDP_PORT)) candidates.push({ port: CDP_PORT, profile: PROFILE_DIR });
  for (const cand of candidates) {
    if (!(await ensureChrome(cand.port, cand.profile))) continue;
    try {
      await gotoAndWait('flow.google.com/project', projectUrl, 14000, '/edit/', cand.port);
      const t = await attach('flow.google.com/project', '/edit/', cand.port);
      const st = JSON.parse(await t.evaluate(`(() => JSON.stringify({ path: location.pathname, hasComposer: /คุณต้องการสร้างอะไร|What do you want to create/i.test(document.body.innerText) }))()`));
      if (st.path.startsWith('/project')) { log(`Flow พร้อมใช้งานที่พอร์ต ${cand.port} (${cand.profile})`); return { c: t, port: cand.port }; }
      log(`พอร์ต ${cand.port} ยังไม่ล็อกอิน Google (path=${st.path})`);
      t.close();
    } catch (e) { log(`พอร์ต ${cand.port} ใช้ไม่ได้: ${e.message}`); }
  }
  throw new Error(`Flow ใช้ไม่ได้: ทั้งพอร์ต ${FLOW_PORT} (${FLOW_PROFILE}) และ ${CDP_PORT} ไม่ได้ล็อกอิน Google — ล็อกอินในหน้าต่าง Chrome ของโปรไฟล์ใดโปรไฟล์หนึ่งก่อน`);
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

/* ── 1b) พรอมต์จากไฟล์ (เมื่อเลือกฉากจาก Story Beat แทนข้อความล่าสุดทั้งก้อน) ── */
function promptFromFile() {
  result.step = 'prompt-file';
  const p = fs.readFileSync(PROMPT_FILE, 'utf8').trim();
  if (p.length < 50) throw new Error('พรอมต์ในไฟล์สั้นเกินไป: ' + PROMPT_FILE);
  result.promptFile = PROMPT_FILE;
  result.promptLen = p.length;
  result.promptHead = p.slice(0, 100);
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
  const opened = await openFlowProject(url);
  const c = opened.c;
  result.flowPort = opened.port;

  // ── เปิดป๊อปโอเวอร์ตั้งค่า (ชิปมุมขวาล่าง) ───────────────────────────────
  const chip = await rectOf(c, `(() => {
    const vis = e => { const r = e.getBoundingClientRect(); return r.width > 8 && r.height > 8; };
    const e = [...document.querySelectorAll('button')].filter(vis)
      .filter(b => /settings/.test(String(b.className || '')))
      .find(b => /วิดีโอ|Video|Veo|Nano Banana|Omni|รูปภาพ|Image/.test(b.innerText || ''));
    if (!e) return JSON.stringify({ ok:false, why:'no settings chip' });
    const r = e.getBoundingClientRect();
    return JSON.stringify({ ok:true, x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) });
  })()`);
  await clickAt(c, chip.x, chip.y);
  await sleep(2500);

  // ── เลือกปุ่มในป๊อปโอเวอร์ (mat-button-toggle / role=radio) ตามข้อความ ──
  const applyRadio = async (wants, label, optional = false) => {
    const d = JSON.parse(await c.evaluate(`(() => {
      const txt = e => { const t = e.querySelector('.toggle-text'); return String((t && t.innerText) || e.innerText || '').replace(/\\s+/g,' ').trim(); };
      const vis = e => { const r = e.getBoundingClientRect(); return r.width > 8 && r.height > 8; };
      const wants = ${JSON.stringify(wants)};
      const els = [...document.querySelectorAll('button.mat-button-toggle-button, button[role=radio]')].filter(vis);
      const el = els.find(x => wants.some(w => txt(x) === w || txt(x).includes(w)));
      if (!el) return JSON.stringify({ ok:false, seen: els.map(txt) });
      const on = el.getAttribute('aria-pressed') === 'true' || el.getAttribute('aria-checked') === 'true';
      const r = el.getBoundingClientRect();
      return JSON.stringify({ ok:true, on, label: txt(el), x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) });
    })()`));
    if (!d.ok) {
      if (optional) return false;
      throw new Error(`Flow settings: ไม่พบ "${label}" | ปุ่มที่เห็น: ${(d.seen || []).join(' / ')}`);
    }
    if (!d.on) { await clickAt(c, d.x, d.y); await sleep(1300); }
    log('ตั้งค่า:', label, '→', d.label);
    return true;
  };
  const aspLabel = ASPECT === '9:16' ? '9:16' : '16:9';
  const xCount = Math.min(4, Math.max(1, Number(arg('count', 1)) || 1));

  await applyRadio(['วิดีโอ', 'Video'], 'โหมดวิดีโอ');
  await applyRadio(['720p'], 'ความละเอียด 720p', true);
  await applyRadio(['8 วินาที', '8s'], 'ความยาว 8 วินาที', true);
  await applyRadio([aspLabel], 'อัตราส่วน ' + aspLabel);
  await applyRadio(['x' + xCount], 'จำนวน x' + xCount);

  // ── เลือกรุ่นโมเดล (ถ้าระบุ --model) ─────────────────────────────────────
  if (MODEL) {
    const trig = JSON.parse(await c.evaluate(`(() => {
      const e = document.querySelector('.model-select-trigger-content');
      if (!e) return JSON.stringify({ ok:false });
      const r = e.getBoundingClientRect();
      return JSON.stringify({ ok:true, t: String(e.innerText||'').replace(/\\s+/g,' ').trim(), x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) });
    })()`));
    if (!trig.ok) throw new Error('ไม่พบปุ่มเลือกรุ่นโมเดล');
    if (!trig.t.includes(MODEL)) {
      await clickAt(c, trig.x, trig.y);
      await sleep(1600);
      const item = JSON.parse(await c.evaluate(`(() => {
        const vis = e => { const r = e.getBoundingClientRect(); return r.width > 8 && r.height > 8; };
        const els = [...document.querySelectorAll('.cdk-overlay-pane *')].filter(vis).filter(e => e.children.length === 0);
        const e = els.filter(x => String(x.innerText||'').trim() === ${JSON.stringify(MODEL)}).pop();
        if (!e) return JSON.stringify({ ok:false, seen: els.map(x => String(x.innerText||'').trim()).filter(Boolean).slice(0, 20) });
        const r = e.getBoundingClientRect();
        return JSON.stringify({ ok:true, x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) });
      })()`));
      if (!item.ok) throw new Error('ไม่พบรุ่น ' + MODEL + ' | เห็น: ' + (item.seen || []).join(' / '));
      await clickAt(c, item.x, item.y);
      await sleep(1500);
      log('เลือกรุ่น:', MODEL);
    }
  }

  // ── ตรวจว่าตั้งค่าติดจริงก่อนพิมพ์พรอมต์ ────────────────────────────────
  const sum = await c.evaluate(`(() => { const e = document.querySelector('.settings-summary'); return e ? String(e.innerText||'').replace(/\\s+/g,' ') : ''; })()`);
  const cost = await c.evaluate(`(() => { const e = document.querySelector('.settings-credit-cost, .credit-cost-label'); return e ? String(e.innerText||'').replace(/\\s+/g,' ') : ''; })()`);
  result.flowSettings = { summary: sum, cost };
  log('สรุปการตั้งค่า:', sum, '|', cost);
  const aspOk = aspLabel === '9:16' ? /9:16|crop_9_16/.test(sum) : /16:9|crop_16_9/.test(sum);
  if (!aspOk) throw new Error('ตั้งอัตราส่วนไม่ติด: ' + sum);

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
  privacyCheck(prompt, 'Google Flow (พรอมต์วิดีโอ)');
  await c.send('Input.insertText', { text: prompt });
  await sleep(2000);

  if (SKIP_GENERATE) { log('skip-generate: ไม่กดสร้าง'); c.close(); return null; }

  // เครดิต Flow หมด = ปุ่ม "เริ่มสร้าง" ถูกแทนด้วยป้ายเตือน → แจ้งให้ชัด
  const credit = await c.evaluate(`(() => {
    const w = [...document.querySelectorAll('*')].some(x => /เครดิตไม่เพียงพอ/.test((x.getAttribute && x.getAttribute('aria-label')) || ''));
    return JSON.stringify({ warn: w });
  })()`).then(JSON.parse).catch(() => ({ warn: false }));
  if (credit.warn) throw new Error('Flow เครดิตไม่เพียงพอ — ปุ่มสร้างถูกปิด รอเครดิตรีเซ็ต (รายวัน) หรืออัปเกรดแพ็กเกจแล้วรันใหม่');

  // verify send enabled then click it
  const send = await rectOf(c, `(() => {
    const b = [...document.querySelectorAll('button')].find(x => (x.getAttribute('aria-label')||'') === 'เริ่มสร้าง');
    if (!b) return JSON.stringify({ ok:false, why:'no send button' });
    if (b.disabled) return JSON.stringify({ ok:false, why:'send disabled (prompt ว่าง?)' });
    const r = b.getBoundingClientRect();
    return JSON.stringify({ ok:true, x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) });
  })()`);
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
  return await downloadAsset(assetId);
}

/* ── 2b) ดาวน์โหลดคลิปที่มีอยู่แล้วใน Flow (ใช้กับ --asset) ─────────────── */
async function downloadAsset(assetId, project = PROJECT) {
  result.step = 'download';
  result.flowAssetId = assetId;

  // download the asset at original 720p
  const before = new Set(fs.readdirSync(DOWNLOADS));
  const editUrl = `https://flow.google.com/project/${project}/edit/${assetId}`;
  const port = result.flowPort || FLOW_PORT;
  await gotoAndWait('flow.google.com/project', editUrl, 16000, null, port);
  const c2 = await attach('flow.google.com/project', null, port);
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
  // ⚠️ DOM nodeId ใช้ได้ชั่วคราว: ถ้า SPA re-render ระหว่าง getDocument → querySelector → setFileInputFiles
  //    จะได้ error `Could not find node with given id` ⇒ ต้อง getDocument ใหม่แล้วลองซ้ำ
  let attached = false;
  for (let attempt = 1; attempt <= 4 && !attached; attempt++) {
    try {
      const { root } = await c.send('DOM.getDocument', { depth: -1 });
      const { nodeId } = await c.send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
      if (!nodeId) { log('ยังไม่พบ input[type=file] (รอบ ' + attempt + ')'); await sleep(4000); continue; }
      await c.send('DOM.setFileInputFiles', { nodeId, files: [videoFile] });
      attached = true;
    } catch (e) {
      log('แนบไฟล์รอบ ' + attempt + ' ไม่สำเร็จ: ' + e.message);
      await sleep(4000);
    }
  }
  if (!attached) {
    const cur = await c.evaluate('location.href').catch(() => '?');
    throw new Error('แนบไฟล์เข้า TikTok Studio ไม่สำเร็จ (input[type=file] ไม่พร้อม) — หน้าปัจจุบัน: ' + cur);
  }
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
  privacyCheck(caption, 'TikTok (แคปชัน)');
  await c.send('Input.insertText', { text: caption });
  await sleep(3000);
  const capLen = JSON.parse(await c.evaluate(`(() => {
    const e = [...document.querySelectorAll('[contenteditable=true]')].sort((a,b)=>(b.innerText||'').length-(a.innerText||'').length)[0];
    return JSON.stringify({ len: e ? (e.innerText||'').length : 0, tail: e ? (e.innerText||'').slice(-60) : '' });
  })()`));
  result.captionLen = capLen.len;
  log('แคปชัน', capLen.len, 'ตัวอักษร');

  if (!DO_POST) { result.posted = false; result.tiktok = 'prepared (ไม่ได้กดโพสต์ — ไม่ได้ใส่ --post)'; c.close(); return; }

  // ── กดโพสต์ + ยืนยันจากหน้าเว็บเอง (แท็บที่ไม่ใช่แท็บหน้าจะถูก throttle ⇒ bringToFront ก่อน) ──
  await c.send('Page.bringToFront').catch(() => {});
  const editorStillOpen = async () => {
    const raw = await c.evaluate(`(() => {
      const t = document.body.innerText.replace(/\\s+/g,' ');
      return JSON.stringify({ url: location.href, editor: /Save draft|Discard|บันทึกร่าง/i.test(t) });
    })()`).catch(() => '{"editor":true}');
    try { return JSON.parse(raw); } catch { return { editor: true }; }
  };
  let leftEditor = false;
  for (let attempt = 1; attempt <= 2 && !leftEditor; attempt++) {
    const post = await rectOf(c, `(() => {
      const vis = e => { const r = e.getBoundingClientRect(); return r.width > 20 && r.height > 20; };
      const e = [...document.querySelectorAll('button')].filter(vis).find(b => /^(Post|โพสต์)$/.test((b.innerText||'').trim()));
      if (!e) return JSON.stringify({ ok:false, why:'no Post button' });
      const r = e.getBoundingClientRect();
      return JSON.stringify({ ok:true, x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2) });
    })()`);
    await clickAt(c, post.x, post.y);
    log('กด Post (ครั้งที่ ' + attempt + ')');
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
    const st = await editorStillOpen();
    log('สถานะหลังกดโพสต์:', st.url, st.editor ? '(ยังอยู่ใน editor)' : '(ออกจาก editor แล้ว)');
    leftEditor = !st.editor || (st.url || '').includes('tiktokstudio/content');
  }
  const uploadTab = c; // เก็บไว้เผื่อลองซ้ำ
  uploadTab.close();

  // ── ตรวจใน content manager (poll สูงสุด ~60 วิ) ─────────────────────────
  const checkToken = CAPTION_CHECK || 'กลายเป็น 5';
  await gotoAndWait('tiktokstudio/content', 'https://www.tiktok.com/tiktokstudio/content', 12000);
  const c2 = await attach('tiktokstudio/content');
  let chk = { count: null, hasCaption: false, links: [] };
  for (let i = 0; i < 6; i++) {
    chk = JSON.parse(await c2.evaluate(`(() => {
      const t = document.body.innerText.replace(/\\s+/g,' ');
      const m = t.match(/Posts\\s+(\\d+)/) || t.match(/โพสต์\\s+(\\d+)/);
      const links = [...document.querySelectorAll('a[href*="/video/"]')].map(a => a.href).filter(Boolean);
      return JSON.stringify({ count: m ? Number(m[1]) : null, hasCaption: t.includes(${JSON.stringify(checkToken)}), links: [...new Set(links)].slice(0, 5) });
    })()`));
    if (chk.hasCaption) break;
    await sleep(10000);
  }
  c2.close();
  result.posted = !!chk.hasCaption;
  result.tiktok = { posts: chk.count, captionVisible: chk.hasCaption, links: chk.links, postUrl: chk.links[0] || null, leftEditor, profile: 'https://www.tiktok.com/@aka989._' };
  return;
}

/* ── main ─────────────────────────────────────────────────────────────── */
try {
  if (!(await ensureChrome())) {
    throw new Error(`Chrome สำหรับงานอัตโนมัติไม่ตอบที่พอร์ต ${CDP_PORT} — ลองเปิด Chrome โปรไฟล์ cdp-flow แล้ว (ดูวิธีในหัวไฟล์สคริปต์)`);
  }
  const caption = fs.existsSync(CAPTION_FILE) ? fs.readFileSync(CAPTION_FILE, 'utf8') : '';
  if (!caption) log('คำเตือน: ไม่พบไฟล์คำอธิบาย', CAPTION_FILE);
  else result.captionFile = CAPTION_FILE;

  if (VIDEO_FILE) {
    log('โหมด --video-file: โพสต์คลิปที่ดาวน์โหลดไว้แล้ว (ข้าม ChatGPT/Flow)');
    if (!fs.existsSync(VIDEO_FILE)) throw new Error('ไม่พบไฟล์วิดีโอ: ' + VIDEO_FILE);
    result.step = 'tiktok';
    result.videoFile = VIDEO_FILE;
    result.videoBytes = fs.statSync(VIDEO_FILE).size;
    await postToTikTok(VIDEO_FILE, caption);
    result.ok = true; result.step = 'done'; finish(0);
  }

  if (ASSET) {
    log('โหมด --asset: ดาวน์โหลดคลิปที่มีอยู่แล้วใน Flow แล้วโพสต์ (ไม่สร้างใหม่)');
    const videoDirect = await downloadAsset(ASSET);
    log('ได้ไฟล์', videoDirect);
    await postToTikTok(videoDirect, caption);
    result.ok = true; result.step = 'done'; finish(0);
  }

  const prompt = PROMPT_FILE ? promptFromFile() : await latestPromptFromChatGPT();
  log('ได้พรอมต์ล่าสุด', prompt.length, 'ตัวอักษร');

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
