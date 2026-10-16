// ─────────────────────────────────────────────────────────────────────────────
// สร้างไฟล์ QR ของ LINE OA (แอดเพื่อน) — ใช้ทั้งบนเว็บและงานพิมพ์
//
//   node scripts/make-line-oa-kit.mjs
//
// ทำให้:
//   1) public/line-oa-qr.png         → รูปที่การ์ดบนเว็บ /contact ใช้ (คนเปิดจากคอมสแกนด้วยมือถือ)
//   2) ~/OneDrive/Desktop/QR-AITREE/LINE-OA/
//        line-oa-qr-master.svg       → เวกเตอร์ให้โรงพิมพ์ (ขอบขาว 4 โมดูลฝังมาแล้ว, ECC Q)
//        line-oa-qr-*.png            → PNG ขนาดจริง 300/600 dpi (นามบัตร/ใบปลิว/ป้าย)
//        line-oa-standee-a5-300dpi.png → ป้าย A5 สำเร็จรูป (หัวเขียว LINE + QR 45 มม. + 3 ขั้นตอน)
//
// มาตรฐานที่ยึด (เหมือนชุด QR อื่นในระบบ): ECC Q · quiet zone 4 โมดูล · ดำบนขาว ·
// คิดขนาดจาก "โมดูล × 0.4 มม." · พิมพ์ URL/ID ที่คนอ่านออกไว้ใต้โค้ด
// ─────────────────────────────────────────────────────────────────────────────
import QR from 'qrcode';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const OA_ID = process.env.LINE_OA_ID || '@923jrlgz';
const PAYLOAD = `https://line.me/R/ti/p/${OA_ID}`;
const ECC = 'Q';
const MARGIN = 4;
const DARK = '#0b1f12';           // เขียวเข้มเกือบดำ — คอนทราสต์สูงพอสำหรับตัวสแกนจริง
const LINE_GREEN = '#06C755';

const REPO = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const DESKTOP = execFileSync('powershell', ['-NoProfile', '-Command',
  "[Environment]::GetFolderPath('Desktop')"], { encoding: 'utf8' }).trim();
const OUT = path.join(DESKTOP, 'QR-AITREE', 'LINE-OA');
mkdirSync(OUT, { recursive: true });

// 1) รูปสำหรับเว็บ
const webPng = path.join(REPO, 'public', 'line-oa-qr.png');
await QR.toFile(webPng, PAYLOAD, { errorCorrectionLevel: ECC, margin: MARGIN, width: 640, color: { dark: DARK, light: '#ffffff' } });

// 2) เวกเตอร์ + PNG ขนาดจริง
const probe = QR.create(PAYLOAD, { errorCorrectionLevel: ECC });
const modules = probe.modules.size, box = modules + MARGIN * 2;
writeFileSync(path.join(OUT, 'line-oa-qr-master.svg'), await QR.toString(PAYLOAD, {
  type: 'svg', errorCorrectionLevel: ECC, margin: MARGIN, color: { dark: DARK, light: '#ffffff' },
}));
writeFileSync(path.join(OUT, 'line-oa-qr-master-black.svg'), await QR.toString(PAYLOAD, {
  type: 'svg', errorCorrectionLevel: ECC, margin: MARGIN, color: { dark: '#000000', light: '#ffffff' },
}));

const sizes = [
  { name: 'card-600dpi', mm: 18, dpi: 600 },
  { name: 'flyer-300dpi', mm: 30, dpi: 300 },
  { name: 'standee-300dpi', mm: 45, dpi: 300 },
];
const files = [];
for (const s of sizes) {
  const want = Math.round((s.mm / 25.4) * s.dpi);
  const k = Math.max(1, Math.round(want / box));
  const px = box * k;
  const f = path.join(OUT, `line-oa-qr-${s.name}.png`);
  await QR.toFile(f, PAYLOAD, { errorCorrectionLevel: ECC, margin: MARGIN, width: px, color: { dark: DARK, light: '#ffffff' } });
  files.push({ file: path.basename(f), px, module_px: k, actual_mm: +((px / s.dpi) * 25.4).toFixed(1), dpi: s.dpi });
}
const bigPng = path.join(OUT, 'line-oa-qr-1024.png');
await QR.toFile(bigPng, PAYLOAD, { errorCorrectionLevel: ECC, margin: MARGIN, width: 1024, color: { dark: DARK, light: '#ffffff' } });

// 3) ป้าย A5 สำเร็จรูป
const qrB64 = readFileSync(bigPng).toString('base64');
const FONT = `'Leelawadee UI','Sarabun','Tahoma',sans-serif`;
const steps = [
  ['1', 'เปิดกล้องมือถือ สแกนโค้ดนี้', 'หรือเปิดลิงก์ line.me/R/ti/p/' + OA_ID],
  ['2', 'กด “เพิ่มเพื่อน”', 'OA จะเด้งเข้าห้องแชททันที'],
  ['3', 'ทักแชทได้เลย', 'สอบถามรายได้ · สมัครเป็นตัวแทน · แจ้งปัญหาการใช้ระบบ'],
];
const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{width:148mm;height:210mm;font-family:${FONT};color:#0b1f12;background:#fff;display:flex;flex-direction:column}
  .top{background:${LINE_GREEN};color:#fff;padding:10mm 12mm 8mm}
  .brand{font-size:4mm;letter-spacing:.08em;font-weight:700;opacity:.95}
  h1{font-size:12mm;line-height:1.12;margin-top:3mm}
  .sub{font-size:5mm;margin-top:3mm;opacity:.95;line-height:1.45}
  .mid{flex:1;display:flex;gap:10mm;align-items:center;padding:12mm 12mm}
  .qr{width:45mm;height:45mm;border:1mm solid ${LINE_GREEN};border-radius:3mm;padding:2mm;background:#fff}
  .qr img{width:100%;height:100%;display:block}
  .steps{flex:1}
  .step{display:flex;gap:3mm;margin-bottom:5mm}
  .n{flex:0 0 8mm;height:8mm;border-radius:50%;background:${LINE_GREEN};color:#fff;font-size:4.4mm;font-weight:700;display:flex;align-items:center;justify-content:center}
  .t{font-size:4.6mm;font-weight:700}
  .d{font-size:3.4mm;color:#41506b;margin-top:1mm;line-height:1.45}
  .bot{margin-top:auto;padding:8mm 12mm 10mm;border-top:.3mm solid #d7e6dc}
  .id{font-size:4.4mm;font-weight:700}
  .mono{font-family:'Consolas','Courier New',monospace;font-size:3.4mm;color:#41506b}
  .note{font-size:3.2mm;color:#41506b;margin-top:2mm;line-height:1.5}
</style></head><body>
  <div class="top">
    <div class="brand">AI INSURANCE NETWORK TREE</div>
    <h1>แอด LINE OA<br>คุยกับทีมงานผ่านมือถือ</h1>
    <div class="sub">ถามรายได้ · สมัครเป็นตัวแทน · แจ้งปัญหาการใช้ระบบ — ทีมงานตอบกลับพร้อม AI ผู้ช่วยอัตโนมัติ</div>
  </div>
  <div class="mid">
    <div class="qr"><img src="data:image/png;base64,${qrB64}"></div>
    <div class="steps">
      ${steps.map(([n, t, d]) => `<div class="step"><div class="n">${n}</div><div><div class="t">${t}</div><div class="d">${d}</div></div></div>`).join('')}
    </div>
  </div>
  <div class="bot">
    <div class="id">LINE OA: <span class="mono">${OA_ID}</span></div>
    <div class="note">โค้ดในป้ายนี้คือลิงก์แอดเพื่อน <span class="mono">${PAYLOAD}</span> · ระดับแก้ไขข้อผิดพลาด ECC ${ECC} · ขอบขาว ${MARGIN} โมดูลฝังมาในไฟล์แล้ว (ห้ามตัด/ห้ามพิมพ์ทับ) · ขนาดโค้ดเล็กสุด ${(box * 0.4).toFixed(1)} มม.</div>
  </div>
</body></html>`;
const htmlPath = path.join(OUT, 'line-oa-standee-a5.html');
writeFileSync(htmlPath, html, 'utf8');
const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const w = Math.ceil((148 / 25.4) * 96), h = Math.ceil((210 / 25.4) * 96);
const standee = path.join(OUT, 'line-oa-standee-a5-300dpi.png');
execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  '--user-data-dir=' + path.join(OUT, '.chrome-shot').replace(/\\/g, '/'),
  '--force-device-scale-factor=3.125', `--window-size=${w},${h}`,
  `--screenshot=${standee.replace(/\\/g, '/')}`, 'file:///' + htmlPath.replace(/\\/g, '/')],
  { stdio: 'ignore', timeout: 120000 });

console.log(JSON.stringify({
  payload: PAYLOAD, oa_id: OA_ID, modules_per_side: modules, box_modules: box, ecc: ECC,
  min_box_mm: +(box * 0.4).toFixed(1), read_cm: +(box * 0.4).toFixed(0),
  web_png: webPng, out_dir: OUT, pngs: files, standee: path.basename(standee),
}, null, 2));
