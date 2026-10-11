#!/usr/bin/env node
/**
 * local-runner.mjs — ตัวรันสคริปต์ในเครื่องให้ n8n เรียกผ่าน HTTP
 * เหตุผล: n8n เวอร์ชันนี้ไม่โหลดโหนด Execute Command และ Code node ไม่ให้ใช้ child_process
 *          จึงใช้ตัวช่วยเล็ก ๆ นี้ (ทำงานเฉพาะ loopback) รับคำสั่งจาก n8n แล้วรันสคริปต์ท่อนี้
 *
 * รัน:  node scripts/local-runner.mjs            (ค่าเริ่มต้นพอร์ต 18811)
 * เรียก: POST http://127.0.0.1:18811/run-autopilot
 *        headers: Authorization: Bearer ***
 *        body: { "post": false, "skipGenerate": true, "conversation": "...", "project": "...", "aspect": "9:16" }
 * เรียก: POST http://127.0.0.1:18811/run-register-report
 *        body: { "days": 7, "limit": 200 }   — รายชื่อ/อีเมลผู้สนใจสมัครใหม่จากหน้า /register
 * ตอบ:  JSON ผลลัพธ์ของสคริปต์ (หรือ { ok:false, error })
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PORT = Number(process.env.LOCAL_RUNNER_PORT || 18811);
const SECRET = process.env.CRON_SECRET || '';
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const SCRIPT = path.join(REPO, 'scripts', 'flow-tiktok-autopilot.mjs');
const REGISTER_SCRIPT = path.join(REPO, 'scripts', 'register-report.mjs');
const CAPTION = path.join(REPO, 'n8n', 'flow-tiktok-autopilot', 'caption.txt');
const LOG = path.join(REPO, 'tmp', 'local-runner.log');
const MAX_BODY = 64 * 1024;

function logLine(msg) {
  try { fs.mkdirSync(path.dirname(LOG), { recursive: true }); fs.appendFileSync(LOG, `${new Date().toISOString()} ${msg}\n`); } catch { }
}

function json(res, code, obj) {
  const b = Buffer.from(JSON.stringify(obj), 'utf8');
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': b.length });
  res.end(b);
}

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/healthz') return json(res, 200, { ok: true, runner: true, pid: process.pid, routes: ['/run-autopilot', '/run-register-report'] });
  const isAutopilot = req.url.startsWith('/run-autopilot');
  const isRegister = req.url.startsWith('/run-register-report');
  if (req.method !== 'POST' || (!isAutopilot && !isRegister)) return json(res, 404, { ok: false, error: 'not found' });

  const auth = req.headers['authorization'] || '';
  if (SECRET && auth !== 'Bearer ' + SECRET) { logLine('401 bad token'); return json(res, 401, { ok: false, error: 'unauthorized' }); }

  let body = '';
  req.on('data', (c) => { body += c; if (body.length > MAX_BODY) req.destroy(); });
  req.on('end', () => {
    let b = {};
    try { b = body ? JSON.parse(body) : {}; } catch { }
    let args;
    if (isRegister) {
      args = [REGISTER_SCRIPT,
        '--days', String(Math.min(365, Math.max(1, Number(b.days) || 7))),
        '--limit', String(Math.min(500, Math.max(1, Number(b.limit) || 200)))];
    } else {
      args = [SCRIPT,
        '--conversation', String(b.conversation || '6aca4737-38dc-83ec-a8f4-804d8115de25'),
        '--project', String(b.project || '5d5bdf40-93fb-4ff0-9d18-37839f7beb2b'),
        '--aspect', String(b.aspect || '9:16'),
        '--count', String(Math.min(4, Math.max(1, Number(b.count) || 1))),
        '--caption-file', CAPTION];
      if (b.post) args.push('--post');
      if (b.skipGenerate) args.push('--skip-generate');
    }

    logLine((isRegister ? 'register-report' : 'run') + ' start ' + JSON.stringify(isRegister ? { days: Number(b.days) || 7 } : { post: !!b.post, skipGenerate: !!b.skipGenerate }));
    const child = spawn(process.execPath, args, { cwd: REPO, env: { ...process.env, CDP_PORT: process.env.CDP_PORT || '9333' } });
    let out = '', err = '';
    const t = setTimeout(() => { try { child.kill('SIGKILL'); } catch { } logLine('timeout, killed'); }, 15 * 60 * 1000);
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('close', (code) => {
      clearTimeout(t);
      const last = out.trim().split('\n').filter(Boolean).pop() || '';
      let parsed = null;
      try { parsed = JSON.parse(last); } catch { }
      logLine(`run done code=${code} ok=${parsed ? parsed.ok : '?'}`);
      if (err) logLine('stderr: ' + err.replace(/\s+/g, ' ').slice(-500));
      json(res, 200, parsed || { ok: false, error: 'สคริปต์ไม่คืน JSON', exitCode: code, stdoutTail: out.slice(-600), stderrTail: err.slice(-600) });
    });
  });
});

server.listen(PORT, '127.0.0.1', () => {
  logLine(`listening 127.0.0.1:${PORT}`);
  console.log(`local-runner listening on http://127.0.0.1:${PORT} (script: ${SCRIPT})`);
});
