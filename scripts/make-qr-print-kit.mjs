// ─────────────────────────────────────────────────────────────────────────────
// สร้างชุดไฟล์ QR สำหรับงานพิมพ์ ตามแนวปฏิบัติสากล (ISO/IEC 18004 + แนวปฏิบัติงานพิมพ์)
//
//   node scripts/make-qr-print-kit.mjs [slug]
//
// หลักการที่บังคับในสคริปต์นี้:
//   • ลาย QR เก็บ "ลิงก์สั้นของเราเอง" (/q/<slug>) ไม่เก็บ UTM → โมดูลใหญ่ขึ้น สแกนง่ายขึ้น
//   • Quiet zone 4 โมดูล ฝังอยู่ในไฟล์ (ไม่ใช่คำแนะนำที่คนพิมพ์ลืม) — เอกสาร SVG มี viewBox ครอบมาให้
//   • ECC ระดับ Q (25%) สำหรับงานพิมพ์ — ไม่ใช่ L (แก้ไม่พอ) และไม่ใช่ H (โมดูลเล็กลงโดยไม่จำเป็น)
//   • คำนวณขนาดจาก "จำนวนโมดูล × 0.4 มม." (โมดูลละ ≥0.4 มม. กล้องมือถือระยะแขนอ่านได้)
//     แทนกฎ "พิมพ์ 2 ซม." ที่ผิดกับข้อมูลยาว
//   • ดำบนขาวเท่านั้น (ไม่ invert) เพราะตัวสแกนราคาถูกอ่านโหมดกลับสีไม่ได้
//
// ผลลัพธ์: ~/OneDrive/Desktop/QR-AITREE/
// ─────────────────────────────────────────────────────────────────────────────
import QR from 'qrcode';
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const SLUG = process.argv[2] || process.env.QR_SLUG || 'contact';
const SITE = process.env.QR_SITE || 'https://ai-insurance-network-tree.vercel.app';
const PAYLOAD = `${SITE}/q/${SLUG}`;
const CTA = { contact: 'สแกนเพื่อติดต่อทีมงาน', recruit: 'สแกนเพื่อสมัครเป็นตัวแทน' };
const ctaText = CTA[SLUG.split('-')[0]] || CTA.contact;

const DESKTOP = execFileSync('powershell', ['-NoProfile', '-Command',
  "[Environment]::GetFolderPath('Desktop')"], { encoding: 'utf8' }).trim();
const OUT = path.join(DESKTOP, 'QR-AITREE');
mkdirSync(OUT, { recursive: true });

const DARK = '#0b2b5b';
const LIGHT = '#ffffff';
const MARGIN = 4;      // quiet zone = 4 โมดูล (มาตรฐานบังคับขั้นต่ำ)
const ECC = 'Q';       // 25% — เหมาะกับงานพิมพ์

// ── 1) SVG มาสเตอร์ (เวกเตอร์ สำหรับโรงพิมพ์) ────────────────────────────────
const svg = await QR.toString(PAYLOAD, {
  type: 'svg', errorCorrectionLevel: ECC, margin: MARGIN,
  color: { dark: DARK, light: LIGHT },
});
writeFileSync(path.join(OUT, `qr-${SLUG}-master.svg`), svg);

// ── 1b) SVG มาสเตอร์ ดำสนิทบนขาว (เผื่อโรงพิมพ์ที่ต้องการคอนทราสต์สูงสุด) ────
const svgBlack = await QR.toString(PAYLOAD, {
  type: 'svg', errorCorrectionLevel: ECC, margin: MARGIN,
  color: { dark: '#000000', light: '#ffffff' },
});
writeFileSync(path.join(OUT, `qr-${SLUG}-master-black.svg`), svgBlack);

// ── 2) ข้อมูลเชิงเทคนิคของลายนี้ ─────────────────────────────────────────────
const probe = QR.create(PAYLOAD, { errorCorrectionLevel: ECC });
const modules = probe.modules.size;            // จำนวนโมดูลต่อด้าน (ยังไม่รวม quiet zone)
const boxModules = modules + MARGIN * 2;       // รวม quiet zone
// ขั้นต่ำตามมาตรฐาน: 1 โมดูล ≈ 0.4 มม. (กล้องมือถือ ~10 เท่าของความกว้าง)
const minSymbolMm = +(modules * 0.4).toFixed(1);
const minBoxMm = +(boxModules * 0.4).toFixed(1);

// ── 3) PNG แบบพิกเซลคม (1 โมดูล = จำนวนเต็มพิกเซล) ─────────────────────────
const targets = [
  { name: 'card', mm: 20, dpi: 600 },
  { name: 'flyer', mm: 30, dpi: 300 },
  { name: 'flyer-hi', mm: 30, dpi: 600 },
  { name: 'poster', mm: 50, dpi: 300 },
];
const files = [];
for (const t of targets) {
  const wantPx = Math.round((t.mm / 25.4) * t.dpi);
  const k = Math.max(1, Math.round(wantPx / boxModules)); // โมดูลละ k พิกเซล (จำนวนเต็ม)
  const px = boxModules * k;
  const actualMm = +((px / t.dpi) * 25.4).toFixed(1);
  const f = path.join(OUT, `qr-${SLUG}-${t.name}-${t.dpi}dpi.png`);
  await QR.toFile(f, PAYLOAD, {
    errorCorrectionLevel: ECC, margin: MARGIN, width: px,
    color: { dark: DARK, light: LIGHT },
  });
  files.push({ file: path.basename(f), px, module_px: k, actual_mm: actualMm, dpi: t.dpi });
}

// ── 4) QR ขนาดสูงสำหรับใช้ในหน้า HTML/artwork ───────────────────────────────
const big = path.join(OUT, `qr-${SLUG}-1024.png`);
await QR.toFile(big, PAYLOAD, { errorCorrectionLevel: ECC, margin: MARGIN, width: 1024, color: { dark: DARK, light: LIGHT } });

const summary = {
  payload: PAYLOAD, payload_len: PAYLOAD.length, slug: SLUG, cta: ctaText,
  ecc: ECC, quiet_zone_modules: MARGIN, modules_per_side: modules, box_modules: boxModules,
  min_symbol_mm: minSymbolMm, min_box_mm: minBoxMm, // อ่านได้จากระยะ ~10 เท่าของความกว้าง: 18 มม. → ~18 ซม.
  read_distance_cm: +minBoxMm.toFixed(0),
  out_dir: OUT, files, big_png: path.basename(big),
};
writeFileSync(path.join(OUT, 'spec.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
