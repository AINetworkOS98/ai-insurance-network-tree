#!/usr/bin/env node
/**
 * หลัง `next build` แบบ standalone: คัดลอกไฟล์ static + public เข้า .next/standalone
 * (Next.js ไม่คัดลอกให้เอง) — จำเป็นเมื่อรันบนโฮสต์ที่ใช้ standalone server เช่น Hostinger Web App
 * ไม่ทำอะไรถ้าไม่มีโฟลเดอร์ standalone (เช่น build บน Vercel)
 */
const { existsSync, cpSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const root = process.cwd();
const standalone = join(root, '.next', 'standalone');
if (!existsSync(join(standalone, 'server.js'))) {
  console.log('[postbuild] ไม่มี .next/standalone/server.js — ข้ามขั้นตอนนี้');
  process.exit(0);
}

const pairs = [
  [join(root, '.next', 'static'), join(standalone, '.next', 'static')],
  [join(root, 'public'), join(standalone, 'public')],
];

for (const [from, to] of pairs) {
  if (!existsSync(from)) {
    console.log('[postbuild] ไม่พบ', from, '— ข้าม');
    continue;
  }
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
  console.log('[postbuild] คัดลอก', from, '→', to);
}
console.log('[postbuild] เตรียม standalone สำหรับรันบนโฮสต์เรียบร้อย');
