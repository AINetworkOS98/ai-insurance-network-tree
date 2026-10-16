#!/usr/bin/env node
/**
 * build_html.mjs — ฝังฟอนต์ + ภาพหน้าจอจริงลงในไฟล์ฉาก แล้วได้ out/scene.html เดียวที่เรนเดอร์ซ้ำได้ (ไม่ต้องมีเน็ต)
 * ใช้: node video/promo-1x5-9x16/build_html.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const OUT = join(HERE, 'out');
mkdirSync(OUT, { recursive: true });

const FONTS = join(REPO, 'video', 'financial-freedom', 'fonts');
const P = {
  THAI: join(FONTS, 'thai.ttf'),
  INTER: join(FONTS, 'inter.ttf'),
  IMG_NETEX: join(OUT, 'real', 'network-example.png'),
  IMG_LANDING: join(OUT, 'real', 'landing.png'),
  IMG_AI: join(OUT, 'real', 'search-landing.png'),
  IMG_LOGO: join(REPO, 'public', 'logo.png'),
};
const MIME = { ttf: 'font/ttf', png: 'image/png', jpg: 'image/jpeg' };
let html = readFileSync(join(HERE, 'scene.template.html'), 'utf-8');
for (const [key, file] of Object.entries(P)) {
  if (!existsSync(file) || statSync(file).size < 400) throw new Error(`ไม่พบไฟล์ ${key}: ${file}`);
  const ext = file.split('.').pop().toLowerCase();
  const b64 = readFileSync(file).toString('base64');
  html = html.replaceAll(`__${key}__`, `data:${MIME[ext] || 'application/octet-stream'};base64,${b64}`);
  console.log(`  ✓ ${key.padEnd(12)} ${(statSync(file).size / 1024).toFixed(0)} KB → data-URI (${(b64.length / 1024).toFixed(0)} KB)`);
}
if (/__[A-Z_]+__/.test(html)) throw new Error('ยังมี placeholder ที่ยังไม่ถูกแทน: ' + html.match(/__[A-Z_]+__/g).join(', '));
const dest = join(OUT, 'scene.html');
writeFileSync(dest, html, 'utf-8');
console.log(`✅ ${dest} (${(statSync(dest).size / 1024).toFixed(0)} KB)`);
