// ─────────────────────────────────────────────────────────────────────────────
// สร้าง "ชิ้นงานพิมพ์" ที่มี QR ฝังอยู่ (การ์ด A6 + โปสเตอร์/ใบสเปก A4) ที่ 300 dpi
// แล้วเรนเดอร์เป็น PNG ด้วย Chrome headless (คมจริงตามขนาดมิลลิเมตร)
//
//   node scripts/make-qr-artwork.mjs [slug]
//
// แนวปฏิบัติที่ใช้: ระยะห่างรอบโค้ด ≥4 โมดูล (ในไฟล์มีขอบมาแล้ว), CTA ชัดเจนเหนือ/ใต้โค้ด,
// พิมพ์ URL ที่คนอ่านออกใต้โค้ด (คนที่สแกนไม่ได้ต้องพิมพ์ตามได้), ไม่มีอะไรทับ quiet zone
// ─────────────────────────────────────────────────────────────────────────────
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const SLUG = process.argv[2] || process.env.QR_SLUG || 'contact';
const SITE = process.env.QR_SITE || 'https://ai-insurance-network-tree.vercel.app';
const DESKTOP = execFileSync('powershell', ['-NoProfile', '-Command',
  "[Environment]::GetFolderPath('Desktop')"], { encoding: 'utf8' }).trim();
const OUT = process.env.QR_OUT_DIR || path.join(DESKTOP, 'QR-AITREE');
mkdirSync(OUT, { recursive: true });

const spec = JSON.parse(readFileSync(path.join(OUT, 'spec.json'), 'utf8'));
const qrB64 = readFileSync(path.join(OUT, spec.big_png)).toString('base64');
const SHORT_READABLE = spec.payload.replace('https://', '').replace('http://', '');
const CTA = spec.cta;
const TODAY = new Date().toISOString().slice(0, 10);

const chrome = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FONT = `'Leelawadee UI','Sarabun','Tahoma',sans-serif`;

const baseCss = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html,body { background:#fff; color:#0b2b5b; font-family:${FONT}; -webkit-print-color-adjust:exact; }
  .qrwrap { background:#fff; display:flex; align-items:center; justify-content:center; }
  .qrwrap img { display:block; width:100%; height:100%; }
  .cta { font-weight:700; }
  .url { font-family:'Consolas','Courier New',monospace; color:#41506b; }
`;

function cardHtml(qrMm) {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>${baseCss}
  body { width:105mm; height:148mm; padding:9mm 8mm; display:flex; flex-direction:column; align-items:center; }
  .brand { font-size:3.6mm; letter-spacing:.08em; text-transform:uppercase; font-weight:700; color:#2b6cb0; }
  .rule { width:100%; height:.6mm; background:#0b2b5b; margin:4mm 0 6mm; }
  h1 { font-size:9mm; line-height:1.15; text-align:center; }
  .sub { font-size:4mm; text-align:center; color:#41506b; margin-top:2.5mm; line-height:1.5; }
  .qrwrap { width:${qrMm}mm; height:${qrMm}mm; margin:7mm 0 5mm; }
  .cta { font-size:5.2mm; text-align:center; }
  .url { font-size:3.2mm; text-align:center; margin-top:4mm; }
  .foot { margin-top:auto; font-size:3mm; color:#41506b; text-align:center; line-height:1.5; }
  </style></head><body>
    <div class="brand">AI Insurance Network Tree</div>
    <div class="rule"></div>
    <h1>ติดต่อทีมงาน<br>สอบถามรายได้ &amp; สมัครเป็นตัวแทน</h1>
    <div class="sub">ส่งคำถามผ่านฟอร์ม แล้วทีมงานตอบกลับพร้อม AI ผู้ช่วยอัตโนมัติ</div>
    <div class="qrwrap"><img src="data:image/png;base64,${qrB64}"></div>
    <div class="cta">${CTA}</div>
    <div class="url">${SHORT_READABLE}</div>
    <div class="foot">เปิดกล้องมือถือ → เล็งที่โค้ด → แตะลิงก์ที่ขึ้น<br>ไม่ต้องติดตั้งแอปเพิ่ม</div>
  </body></html>`;
}

function posterHtml(qrMm) {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>${baseCss}
  body { width:210mm; height:297mm; padding:18mm; display:flex; flex-direction:column; }
  .head { display:flex; align-items:baseline; justify-content:space-between; }
  .brand { font-size:5mm; letter-spacing:.08em; text-transform:uppercase; font-weight:700; color:#2b6cb0; }
  .date { font-size:3.4mm; color:#41506b; }
  h1 { font-size:17mm; line-height:1.1; margin-top:6mm; }
  .sub { font-size:5.6mm; color:#41506b; margin-top:4mm; line-height:1.5; max-width:150mm; }
  .mid { display:flex; align-items:center; gap:12mm; margin-top:10mm; }
  .qrwrap { width:${qrMm}mm; height:${qrMm}mm; flex:0 0 ${qrMm}mm; }
  .side .cta { font-size:9mm; line-height:1.25; }
  .side .url { font-size:4.4mm; margin-top:5mm; }
  .side .hint { font-size:4mm; color:#41506b; margin-top:4mm; line-height:1.5; }
  table { width:100%; border-collapse:collapse; margin-top:auto; font-size:3.4mm; }
  th,td { border:.25mm solid #c9d2e3; padding:1.8mm 2.4mm; text-align:left; vertical-align:top; }
  th { background:#f3f6fc; width:52mm; font-weight:700; }
  .mono { font-family:'Consolas','Courier New',monospace; }
  .note { font-size:3.2mm; color:#41506b; margin-top:3mm; line-height:1.55; }
  </style></head><body>
    <div class="head"><div class="brand">AI Insurance Network Tree</div><div class="date">พิมพ์เมื่อ ${TODAY}</div></div>
    <h1>สแกนเพื่อติดต่อทีมงาน</h1>
    <div class="sub">สอบถามรายได้ · สมัครเป็นตัวแทน · แจ้งปัญหาการใช้งานระบบ</div>
    <div class="mid">
      <div class="qrwrap"><img src="data:image/png;base64,${qrB64}"></div>
      <div class="side">
        <div class="cta">${CTA}</div>
        <div class="url">${SHORT_READABLE}</div>
        <div class="hint">วางป้ายนี้ในระยะที่คนยืนห่างไม่เกิน ${spec.read_distance_cm} ซม. จากโค้ด<br>ห้ามพิมพ์ทับขอบขาวรอบโค้ด และห้ามตัดขอบขาวออก</div>
      </div>
    </div>
    <table>
      <tr><th>ลาย QR เก็บอะไร</th><td class="mono">${spec.payload}</td></tr>
      <tr><th>ปลายทางจริง (มี UTM)</th><td class="mono">${SITE}/contact?utm_source=qr-${SLUG}&amp;utm_medium=offline&amp;utm_campaign=aitree-offline-2026&amp;utm_content=…</td></tr>
      <tr><th>เวอร์ชัน / โมดูล</th><td>เวอร์ชัน ${spec.modules_per_side >= 41 ? 6 : spec.modules_per_side >= 37 ? 5 : 4} · ${spec.modules_per_side}×${spec.modules_per_side} โมดูล (รวมขอบขาว = ${spec.box_modules}×${spec.box_modules})</td></tr>
      <tr><th>ระดับแก้ไขข้อผิดพลาด (ECC)</th><td>ระดับ ${spec.ecc} — กู้คืนได้ ~25% (งานพิมพ์ใช้ ${spec.ecc} ไม่ใช้ L/H)</td></tr>
      <tr><th>Quiet zone</th><td>${spec.quiet_zone_modules} โมดูล ทุกด้าน — ฝังมาในไฟล์แล้ว ห้ามตัด/ห้ามพิมพ์ทับ</td></tr>
      <tr><th>ขนาดเล็กสุดที่ยอมรับ</th><td>ตัวโค้ด ${spec.min_symbol_mm} มม. · รวมขอบขาว ${spec.min_box_mm} มม. (1 โมดูล ≈ 0.4 มม.)</td></tr>
      <tr><th>ระยะอ่านที่แนะนำ</th><td>≈ ${spec.read_distance_cm} ซม. (ระยะอ่าน ≈ 10 เท่าของความกว้างโค้ด)</td></tr>
      <tr><th>สี</th><td>เข้มบนขาวเท่านั้น (${'#0b2b5b'} บน #ffffff) — ห้ามกลับสี ห้ามใช้พื้นโปร่งแสง/มันวาว</td></tr>
      <tr><th>ไฟล์ให้โรงพิมพ์</th><td class="mono">qr-${SLUG}-master.svg (เวกเตอร์) · qr-${SLUG}-master-black.svg · PNG 300/600 dpi</td></tr>
      <tr><th>จำนวนโมดูลที่ใช้ตัดสินขนาด</th><td>คิดจาก "โมดูล × 0.4 มม." ไม่ใช่กฎ "พิมพ์ 2 ซม."</td></tr>
    </table>
    <div class="note">หมายเหตุ: ลาย QR นี้เป็นแบบ <b>ไดนามิก</b> — เก็บลิงก์สั้นของเราเอง (${spec.payload}) แล้ว 302 ไปปลายทางพร้อม UTM จึงเปลี่ยนปลายทางได้โดยไม่ต้องพิมพ์ใหม่ และวัดผลสแกนได้จากระบบเก็บที่มา (utm_source=qr-${SLUG})</div>
  </body></html>`;
}

function cardNameHtml(qrMm) {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><style>${baseCss}
  body { width:85mm; height:55mm; padding:6mm 7mm; display:flex; gap:6mm; align-items:center; }
  .left { flex:1 1 auto; }
  .brand { font-size:3.2mm; letter-spacing:.08em; text-transform:uppercase; font-weight:700; color:#2b6cb0; }
  h1 { font-size:5.6mm; margin-top:2mm; line-height:1.25; }
  .sub { font-size:3.2mm; color:#41506b; margin-top:2mm; line-height:1.5; }
  .qrwrap { width:${qrMm}mm; height:${qrMm}mm; flex:0 0 ${qrMm}mm; }
  .cta { font-size:2.9mm; text-align:center; margin-top:1.6mm; font-weight:700; }
  .url { font-size:2.6mm; text-align:center; margin-top:.8mm; }
  </style></head><body>
    <div class="left">
      <div class="brand">AI Insurance Network Tree</div>
      <h1>ติดต่อทีมงาน / สมัครเป็นตัวแทน</h1>
      <div class="sub">สแกนแล้วส่งคำถามได้ทันที ทีมงานตอบกลับพร้อม AI ผู้ช่วยอัตโนมัติ</div>
    </div>
    <div>
      <div class="qrwrap"><img src="data:image/png;base64,${qrB64}"></div>
      <div class="cta">${CTA}</div>
      <div class="url">${SHORT_READABLE}</div>
    </div>
  </body></html>`;
}

const jobs = [
  { name: `qr-${SLUG}-card-a6-300dpi.png`, html: cardHtml(30), wmm: 105, hmm: 148 },
  { name: `qr-${SLUG}-poster-a4-300dpi.png`, html: posterHtml(50), wmm: 210, hmm: 297 },
  { name: `qr-${SLUG}-businesscard-300dpi.png`, html: cardNameHtml(Number(process.env.QR_CARD_QR_MM || 20)), wmm: 85, hmm: 55 },
];

const NODE_DPI = 300, CSS_DPI = 96;
for (const j of jobs) {
  const htmlPath = path.join(OUT, `${j.name.replace('.png', '.html')}`);
  writeFileSync(htmlPath, j.html, 'utf8');
  const w = Math.ceil((j.wmm / 25.4) * CSS_DPI);
  const h = Math.ceil((j.hmm / 25.4) * CSS_DPI);
  const scale = NODE_DPI / CSS_DPI; // 3.125
  const png = path.join(OUT, j.name);
  execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
    '--user-data-dir=' + path.join(OUT, '.chrome-shot').replace(/\\/g, '/'),
    `--force-device-scale-factor=${scale}`,
    `--window-size=${w},${h}`,
    `--screenshot=${png.replace(/\\/g, '/')}`,
    'file:///' + htmlPath.replace(/\\/g, '/'),
  ], { stdio: 'ignore', timeout: 120000 });
  console.log(`${j.name}  ${w}x${h} css @${scale}x → ${w * scale}x${h * scale} px (${j.wmm}×${j.hmm} mm) `);
}
