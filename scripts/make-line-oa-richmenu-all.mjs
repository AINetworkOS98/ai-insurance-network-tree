#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// make-line-oa-richmenu-all.mjs — ริชเมนู LINE OA "เมนูตามเว็บจริง" (3 คอลัมน์ × 2 แถว)
//   ใช้เมนูจริงของระบบ (src/lib/navCatalog.ts + หน้าสาธารณะ) → 6 ช่อง กดแล้วเข้าเว็บหรือสั่ง AI
//   วิธีใช้:  node scripts/make-line-oa-richmenu-all.mjs
//   ได้: public/line-oa-richmenu-all.png (2500×1686) + .json (areas สำหรับอัปโหลด)
// ─────────────────────────────────────────────────────────────────────────────
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

const SITE = process.env.SITE_BASE || 'https://ai-insurance-network-tree.vercel.app';
const ROOT = 'C:/Users/User/ai-insurance-network-tree';
const OUT = path.join(ROOT, 'public');
mkdirSync(OUT, { recursive: true });

const W = 2500, H = 1686, COLS = 3, ROWS = 2;
const NAVY = '#0b2b5b', GREEN = '#06C755';

// 6 ช่อง — 4 ช่องแรกพาเข้าเว็บจริง · 2 ช่องท้ายคุยกับ AI/ขอเมนูรวม
const tiles = [
  { icon: '🏠', title: 'หน้าแรก', sub: 'เข้าระบบ · ภาพรวม', action: { type: 'uri', uri: `${SITE}/` } },
  { icon: '🤝', title: 'สมัครเป็นตัวแทน', sub: 'กรอกใบสมัครออนไลน์', action: { type: 'uri', uri: `${SITE}/recruit` } },
  { icon: '🌟', title: 'อิสรภาพทางการเงิน', sub: 'แผนและเป้าหมาย', action: { type: 'uri', uri: `${SITE}/financial-freedom` } },
  { icon: '📣', title: 'ช่องขยายทีมงาน', sub: 'ลิงก์แนะนำ · QR', action: { type: 'uri', uri: `${SITE}/expand-team` } },
  { icon: '💰', title: 'สอบถามรายได้', sub: 'ค่าคอม · รายได้', action: { type: 'message', text: 'สอบถามรายได้และค่าคอมมิชชั่น' } },
  { icon: '☰', title: 'เมนูทั้งหมด', sub: 'ทุกระบบในแอป', action: { type: 'message', text: 'เมนูทั้งหมด' } },
];

const FONT = `'Leelawadee UI','Sarabun','Tahoma',sans-serif`;
const cellW = Math.round(W / COLS), cellH = Math.round(H / ROWS);
const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:${W}px;height:${H}px;font-family:${FONT};background:${NAVY};color:#fff;padding:54px 54px 46px;display:flex;flex-direction:column}
  .head{display:flex;align-items:center;justify-content:space-between;margin-bottom:40px}
  .brand{font-size:56px;font-weight:700}.brand small{display:block;font-size:30px;font-weight:400;opacity:.85;margin-top:8px}
  .oa{font-size:34px;background:${GREEN};padding:14px 28px;border-radius:999px;font-weight:700}
  .grid{flex:1;display:grid;grid-template-columns:repeat(${COLS},1fr);grid-template-rows:repeat(${ROWS},1fr);gap:26px}
  .cell{background:#fff;color:#0b1f12;border-radius:34px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px}
  .icon{font-size:${Math.round(cellH * 0.3)}px;line-height:1}
  .t{font-size:${Math.round(cellW * 0.115)}px;font-weight:700;margin-top:18px;line-height:1.15}
  .s{font-size:${Math.round(cellW * 0.066)}px;color:#41506b;margin-top:10px}
  .go{margin-top:14px;font-size:${Math.round(cellW * 0.07)}px;font-weight:700;color:${GREEN}}
  .foot{margin-top:26px;font-size:30px;text-align:center;opacity:.9}
  .foot b{color:${GREEN}}
</style></head><body>
  <div class="head">
    <div class="brand">AI INSURANCE NETWORK TREE<small>ทุกเมนูของระบบ อยู่ใน LINE OA เดียว</small></div>
    <div class="oa">@923jrlgz</div>
  </div>
  <div class="grid">
    ${tiles.map((t) => `<div class="cell"><div class="icon">${t.icon}</div><div class="t">${t.title}</div><div class="s">${t.sub}</div><div class="go">${t.action.type === 'uri' ? 'เปิดหน้าเว็บ ›' : 'แตะเพื่อถาม ›'}</div></div>`).join('')}
  </div>
  <div class="foot">แตะช่องไหนก็ได้ — หรือ<b>พิมพ์คำถามเองได้เลย</b> ผู้ช่วย AI ของทีมตอบให้ทันที</div>
</body></html>`;

const htmlPath = path.join(OUT, 'line-oa-richmenu-all.html');
writeFileSync(htmlPath, html, 'utf8');

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const png = path.join(OUT, 'line-oa-richmenu-all.png');
// โปรไฟล์ชั่วคราวของ Chrome ต้องอยู่นอก public/ ไม่งั้นไฟล์ชั่วคราวจะถูก commit + ถูกอัปขึ้น production
const SHOT_PROFILE = path.join(os.tmpdir(), 'line-oa-richmenu-shot');
execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--user-data-dir=' + SHOT_PROFILE.replace(/\\/g, '/'),
  '--force-device-scale-factor=1', `--window-size=${W},${H}`,
  `--screenshot=${png.replace(/\\/g, '/')}`, 'file:///' + htmlPath.replace(/\\/g, '/')],
  { stdio: 'ignore', timeout: 120000 });

// areas: แบ่งเท่า ๆ กันเป็น COLS×ROWS
const areas = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    const x = Math.round((W / COLS) * c), y = Math.round((H / ROWS) * r);
    areas.push({
      bounds: { x, y, width: Math.round((W / COLS) * (c + 1)) - x, height: Math.round((H / ROWS) * (r + 1)) - y },
      action: tiles[r * COLS + c].action,
      label_th: tiles[r * COLS + c].title,
    });
  }
}

const json = {
  size: { width: W, height: H }, selected: true,
  name: 'เมนูหลัก — ทุกเมนูของระบบ',
  chatBarText: 'เมนูระบบ',
  areas,
};
writeFileSync(path.join(OUT, 'line-oa-richmenu-all.json'), JSON.stringify(json, null, 2), 'utf8');

console.log('✓', png, (statSync(png).size / 1024).toFixed(0) + ' KB');
console.log('✓ areas', areas.length, 'ช่อง:', tiles.map((t) => t.title).join(' · '));
