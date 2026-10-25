#!/usr/bin/env node
// build_html.mjs — ฝังฟอนต์ไทย + ภาพ 3 ขั้นตอน (PNG) เป็น base64 → out/scene2.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

const HERE = dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const TPL = resolve(HERE, 'scene2.template.html');
const OUT = resolve(HERE, 'out/scene2.html');
mkdirSync(resolve(HERE, 'out'), { recursive: true });

const FONT_REG = process.env.FONT_REG || 'C:/Windows/Fonts/NotoSansThai-Regular.ttf';
const FONT_BOLD = process.env.FONT_BOLD || 'C:/Windows/Fonts/NotoSansThai-Bold.ttf';
const IMG = process.env.STEPS_IMG || 'C:/Users/User/ai-insurance-network-tree/public/steps/3-steps-th.png';

let html = readFileSync(TPL, 'utf8')
  .replace('{{FONT_REG}}', readFileSync(FONT_REG).toString('base64'))
  .replace('{{FONT_BOLD}}', readFileSync(FONT_BOLD).toString('base64'))
  .replace(/\{\{IMG_STEPS\}\}/g, readFileSync(IMG).toString('base64'));

writeFileSync(OUT, html, 'utf8');
console.log('built', OUT, (html.length / 1024 / 1024).toFixed(2) + ' MB');
