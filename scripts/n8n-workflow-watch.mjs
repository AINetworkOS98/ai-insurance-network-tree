#!/usr/bin/env node
/**
 * n8n-workflow-watch.mjs — "โปรแกรมตรวจจับ workflow n8n"
 *
 * หน้าที่: เฝ้าดูว่าใน n8n (localhost:5679) มีการ "สร้าง/แก้ไข workflow" ใหม่หรือไม่
 *   • อ่านตาราง workflow_entity จากฐานข้อมูล n8n โดยตรง (เปิดแบบ read-only — ไม่แตะข้อมูลของ n8n)
 *   • เทียบกับสถานะครั้งก่อน (ไฟล์ state) → รู้ว่าอะไร "ใหม่"
 *   • ส่งรายการทั้งหมดเข้าแอป AI Insurance Network Tree (POST /api/n8n/watch) ทันทีเมื่อมีการเปลี่ยนแปลง
 *     และส่งซ้ำทุก WATCH_INTERVAL_MS เพื่อให้หน้าเว็บโชว์สถานะสดเสมอ
 *
 * วิธีใช้:
 *   node scripts/n8n-workflow-watch.mjs            # เฝ้าต่อเนื่อง (วนไปเรื่อย ๆ)
 *   node scripts/n8n-workflow-watch.mjs --once     # ตรวจจับรอบเดียวแล้วจบ (ไว้ทดสอบ)
 *
 * ตัวแปรปรับได้ (env): N8N_DB, APP_URL, WATCH_SECRET, WATCH_INTERVAL_MS, WATCH_HOST
 *   — ถ้าไม่ส่ง WATCH_SECRET จะอ่านจากไฟล์ ~/.hermes/n8n-watch-secret.txt
 *     หรือถอดจาก CRON_SECRET ในไฟล์ Startup ของ n8n ให้เอง (ไม่พิมพ์ค่าออกจอ)
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const HOME = homedir();
const N8N_DB = process.env.N8N_DB || join(HOME, '.n8n', 'database.sqlite');
const APP_URL = (process.env.APP_URL || 'https://ai-insurance-network-tree.vercel.app').replace(/\/+$/, '');
const APP_BASE_HOST = (process.env.WATCH_HOST || APP_URL.replace(/^https?:\/\//, '')).slice(0, 60);
const INTERVAL_MS = Number(process.env.WATCH_INTERVAL_MS || 20000);
const ONCE = process.argv.includes('--once');
const STATE_FILE = process.env.WATCH_STATE || join(HOME, '.n8n', 'workflow-watch-state.json');
const LOG_FILE = process.env.WATCH_LOG || join(HOME, 'n8n-workflow-watch.log');
const SECRET_FILE = join(HOME, '.hermes', 'n8n-watch-secret.txt');
const STARTUP_BAT = 'C:/Users/User/AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup/n8n-start.bat';

function log(line) {
  const s = `[${new Date().toISOString()}] ${line}`;
  console.log(s);
  try { appendFileSync(LOG_FILE, s + '\n'); } catch {}
}

function resolveSecret() {
  if (process.env.WATCH_SECRET) return process.env.WATCH_SECRET.trim();
  try {
    if (existsSync(SECRET_FILE)) {
      const v = readFileSync(SECRET_FILE, 'utf8').trim();
      if (v) return v;
    }
  } catch {}
  // ถอดจากไฟล์ Startup ของ n8n (CRON_SECRET=...) แล้วบันทึกไว้ใช้ครั้งต่อไป — ไม่พิมพ์ค่าออกจอ
  try {
    const bat = readFileSync(STARTUP_BAT, 'utf8');
    const m = bat.match(/CRON_SECRET\s*=\s*"?([^"\s&]+)"?/i);
    if (m && m[1]) {
      try { mkdirSync(join(HOME, '.hermes'), { recursive: true }); writeFileSync(SECRET_FILE, m[1] + '\n', { mode: 0o600 }); } catch {}
      return m[1];
    }
  } catch {}
  return '';
}

function readWorkflows() {
  const db = new DatabaseSync(N8N_DB, { readOnly: true });
  try {
    const rows = db.prepare('SELECT id, name, active, nodes, createdAt, updatedAt FROM workflow_entity ORDER BY updatedAt DESC').all();
    return rows.map(r => {
      let nodeCount = 0;
      try { const arr = JSON.parse(String(r.nodes || '[]')); nodeCount = Array.isArray(arr) ? arr.length : 0; } catch {}
      return {
        id: String(r.id),
        name: String(r.name || '(ไม่มีชื่อ)'),
        active: r.active === 1 || r.active === true,
        nodeCount,
        createdAt: r.createdAt ? String(r.createdAt) : null,
        updatedAt: r.updatedAt ? String(r.updatedAt) : null,
      };
    });
  } finally {
    try { db.close(); } catch {}
  }
}

function loadState() {
  try { if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, 'utf8')) || {}; } catch {}
  return {};
}

function saveState(workflows) {
  const map = {};
  for (const w of workflows) map[w.id] = `${w.name}|${w.active ? 1 : 0}|${w.nodeCount}|${w.updatedAt || ''}`;
  try { writeFileSync(STATE_FILE, JSON.stringify({ at: new Date().toISOString(), workflows: map }, null, 1)); } catch {}
}

async function push(workflows, secret) {
  const res = await fetch(`${APP_URL}/api/n8n/watch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ workflows, source: `n8n-local:${APP_BASE_HOST}`, at: new Date().toISOString() }),
    signal: AbortSignal.timeout(15000),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text: text.slice(0, 200) };
}

async function tick(secret, prevState) {
  let workflows;
  try {
    workflows = readWorkflows();
  } catch (e) {
    log(`⚠️ อ่านฐานข้อมูล n8n ไม่ได้: ${e?.message || e}`);
    return { ok: false, added: [], changed: [], state: prevState };
  }

  const cur = {};
  for (const w of workflows) cur[w.id] = `${w.name}|${w.active ? 1 : 0}|${w.nodeCount}|${w.updatedAt || ''}`;
  const added = workflows.filter(w => !(w.id in prevState));
  const changed = workflows.filter(w => (w.id in prevState) && prevState[w.id] !== cur[w.id]);

  if (added.length) for (const w of added) log(`🆕 พบ workflow ใหม่: "${w.name}" (${w.nodeCount} โหนด${w.active ? ' · ใช้งานอยู่' : ''})`);
  if (changed.length) for (const w of changed) log(`✏️ workflow เปลี่ยน: "${w.name}"`);

  let result = { ok: false, status: 0, json: null, text: '' };
  try {
    result = await push(workflows, secret);
  } catch (e) {
    log(`⚠️ ส่งเข้าแอปไม่สำเร็จ: ${e?.message || e}`);
  }

  saveState(workflows);

  if (result.status === 200 && result.json?.ok) {
    const extra = added.length || changed.length ? ` · ใหม่ ${added.length} · แก้ ${changed.length}` : '';
    log(`✅ ส่ง ${workflows.length} workflow เข้าระบบแล้ว (สร้างใหม่ ${result.json.created ?? 0} · อัปเดต ${result.json.updated ?? 0} · ในระบบทั้งหมด ${result.json.total ?? '-'})${extra}`);
  } else if (result.status) {
    log(`⚠️ ระบบตอบ ${result.status}: ${result.json?.error || result.text}`);
  }

  return { ok: result.status === 200, added, changed, state: cur };
}

async function main() {
  const secret = resolveSecret();
  if (!secret) {
    log('❌ ไม่พบ CRON_SECRET/WATCH_SECRET — ตั้ง env WATCH_SECRET หรือวางไฟล์ ~/.hermes/n8n-watch-secret.txt');
    process.exit(2);
  }
  if (!existsSync(N8N_DB)) {
    log(`❌ ไม่พบฐานข้อมูล n8n ที่ ${N8N_DB}`);
    process.exit(2);
  }

  log(`▶️ เริ่มเฝ้าดู workflow n8n · DB=${N8N_DB} · ปลายทาง=${APP_URL} · ทุก ${Math.round(INTERVAL_MS / 1000)} วินาที`);

  let state = (loadState().workflows) || {};

  if (ONCE) {
    const r = await tick(secret, state);
    log(`— จบรอบเดียว: พบใหม่ ${r.added.length} · เปลี่ยน ${r.changed.length}`);
    process.exit(r.ok ? 0 : 1);
  }

  // วนไม่รู้จบ — ถ้าพลาดก็ลองรอบถัดไป (ไม่ล้มทั้งโปรแกรม)
  for (;;) {
    try {
      const r = await tick(secret, state);
      state = r.state;
    } catch (e) {
      log(`⚠️ รอบนี้ผิดพลาด: ${e?.message || e}`);
    }
    await new Promise(res => setTimeout(res, INTERVAL_MS));
  }
}

main().catch(e => { log(`❌ หยุดทำงาน: ${e?.stack || e}`); process.exit(1); });
