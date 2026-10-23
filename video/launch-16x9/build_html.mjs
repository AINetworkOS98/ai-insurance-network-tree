#!/usr/bin/env node
// build_html.mjs — ฝังฟอนต์ไทย (Regular + Bold) เป็น base64 → out/scene.html ไฟล์เดียวจบ ไม่พึ่งเน็ต
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const HERE = dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const TPL = resolve(HERE, 'scene.template.html');
const OUT = resolve(HERE, 'out/scene.html');
mkdirSync(resolve(HERE, 'out'), { recursive: true });

const regPath = process.env.FONT_REG || 'C:/Windows/Fonts/NotoSansThai-Regular.ttf';
const boldPath = process.env.FONT_BOLD || 'C:/Windows/Fonts/NotoSansThai-Bold.ttf';
const reg = readFileSync(regPath).toString('base64');
const bold = readFileSync(boldPath).toString('base64');

let html = readFileSync(TPL, 'utf8')
  .replace('{{FONT_THAI_REG}}', reg)
  .replace('{{FONT_THAI_BOLD}}', bold);

writeFileSync(OUT, html, 'utf8');
console.log('built', OUT, (html.length / 1024).toFixed(0) + 'KB');
