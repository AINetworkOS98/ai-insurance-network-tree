#!/usr/bin/env node
/**
 * สตาร์ทเซิร์ฟเวอร์ production
 * - ถ้ามี .next/standalone/server.js (build แบบ standalone เช่นบน Hostinger) → รันตัวนั้น
 * - ถ้าไม่มี (เช่นเครื่อง dev) → ใช้ `next start`
 */
const { existsSync } = require('node:fs');
const { join } = require('node:path');
const { spawn } = require('node:child_process');

const root = process.cwd();
const standalone = join(root, '.next', 'standalone', 'server.js');
const port = process.env.PORT || '3000';

if (existsSync(standalone)) {
  console.log('[start] ใช้ standalone server ที่', standalone, '| PORT =', port);
  require(standalone);
} else {
  console.log('[start] ไม่พบ standalone — ใช้ next start | PORT =', port);
  const child = spawn('npx', ['next', 'start', '-p', port], { stdio: 'inherit', shell: process.platform === 'win32' });
  child.on('exit', (code) => process.exit(code ?? 0));
}
