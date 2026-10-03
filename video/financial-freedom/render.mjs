#!/usr/bin/env node
/**
 * render.mjs — สร้างวิดีโอ “อิสรภาพทางการเงิน 30 วินาที” (1920×1080 · 30fps · TH+EN)
 *
 * วิธีทำงาน: ฉากทั้งหมดอยู่ใน video/financial-freedom/slides.html (ดีไซน์อยู่ที่ HTML/CSS)
 *   1. ดาวน์โหลดฟอนต์ (Inter + Noto Sans Thai) แล้วฝังเป็น data-URI — เรนเดอร์ได้แม้ไม่มีเน็ตในภายหลัง
 *   2. ถ่ายภาพแต่ละฉากด้วย Chrome headless บนพื้นหลังโปร่งใส (PNG alpha)
 *   3. ประกอบเป็นวิดีโอด้วย ffmpeg: พื้นหลังไล่สีเคลื่อนไหว + ซูมช้า ๆ + ครอสเฟด + แถบความคืบหน้า + เสียงบรรยากาศเบา ๆ
 *
 * ใช้:  node video/financial-freedom/render.mjs
 * ผลลัพธ์: public/financial-freedom.mp4 (ทับไฟล์เดิม) + ไฟล์ภาพใน video/financial-freedom/out/
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const OUT = join(HERE, 'out');
const FONTS = join(HERE, 'fonts');
const BUILD_HTML = join(OUT, '_build.html');
const TARGET = join(REPO, 'public', 'financial-freedom.mp4');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

const FONT_SOURCES = {
  inter: [
    'https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz,wght%5D.ttf',
  ],
  thai: [
    'https://raw.githubusercontent.com/google/fonts/main/ofl/notosansthai/NotoSansThai%5Bwdth,wght%5D.ttf',
    'https://raw.githubusercontent.com/google/fonts/main/ofl/notosansthai/static/NotoSansThai-Regular.ttf',
  ],
};

/** ฉาก: หมายเลข + ระยะเวลา (วินาที) — เริ่ม/สิ้นสุดคำนวณจากที่นี่ที่เดียว (รวม 33.6 − เหลื่อม 3.6 = 30.0 วินาที) */
const SCENES = [
  { id: 0, dur: 5.0 },
  { id: 1, dur: 5.0 },
  { id: 2, dur: 5.0 },
  { id: 3, dur: 5.0 },
  { id: 4, dur: 5.0 },
  { id: 5, dur: 4.8 },
  { id: 6, dur: 3.8 },
];
const FPS = 30;
const XFADE = 0.6; // คาบเหลื่อมของครอสเฟด
const TOTAL = SCENES.reduce((a, s) => a + s.dur, 0) - XFADE * (SCENES.length - 1);

function ensureFonts() {
  mkdirSync(FONTS, { recursive: true });
  const out = {};
  for (const [key, urls] of Object.entries(FONT_SOURCES)) {
    const dest = join(FONTS, `${key}.ttf`);
    if (!existsSync(dest) || statSync(dest).size < 20_000) {
      let ok = false;
      for (const url of urls) {
        try {
          execFileSync('curl', ['-sfL', url, '-o', dest], { stdio: 'inherit' });
          if (statSync(dest).size > 20_000) { ok = true; break; }
        } catch { /* ลอง URL ถัดไป */ }
      }
      if (!ok) throw new Error(`โหลดฟอนต์ ${key} ไม่สำเร็จ — ตรวจเน็ตหรือ URL ใน FONT_SOURCES`);
    }
    out[key] = dest;
  }
  return out;
}

function buildHtml(fonts) {
  mkdirSync(OUT, { recursive: true });
  const b64 = (p) => `data:font/ttf;base64,${readFileSync(p).toString('base64')}`;
  const html = readFileSync(join(HERE, 'slides.html'), 'utf-8')
    .replace('__INTER__', b64(fonts.inter))
    .replace('__THAI__', b64(fonts.thai));
  writeFileSync(BUILD_HTML, html, 'utf-8');
}

function shoot(scenes) {
  const page = pathToFileURL(BUILD_HTML).href;
  const files = [];
  scenes.forEach((s, i) => {
    const dest = join(OUT, `scene-${s.id}.png`);
    const r = spawnSync(CHROME, [
      '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
      '--force-device-scale-factor=1', '--window-size=1920,1080',
      '--default-background-color=00000000', '--virtual-time-budget=4000',
      `--screenshot=${dest.replace(/\\/g, '/')}`, `${page}?scene=${s.id}`,
    ], { stdio: 'inherit' });
    if (r.status !== 0 || !existsSync(dest)) throw new Error(`ถ่ายฉาก ${s.id} ไม่สำเร็จ`);
    files.push(dest);
    console.log(`  ✓ scene ${s.id} → ${dest}`);
  });
  return files;
}

function hasFilter(name) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-h', `filter=${name}`], { encoding: 'utf-8' });
  return r.status === 0;
}

function compose(files) {
  // ── ช่วงเวลาของแต่ละฉาก (เหลื่อมกัน XFADE) ──
  const spans = [];
  let cursor = 0;
  for (let i = 0; i < SCENES.length; i++) {
    const dur = SCENES[i].dur;
    spans.push({ start: cursor, end: cursor + dur });
    cursor += dur - XFADE;
  }

  const args = [];
  // 0) ฉากหลังไล่สีเคลื่อนไหว (ถ้า ffmpeg นี้ไม่มี filter gradients → ใช้สีนิ่งแทน)
  const useGradients = hasFilter('gradients');
  if (useGradients) {
    args.push('-f', 'lavfi', '-i',
      `gradients=s=1920x1080:r=${FPS}:d=${TOTAL.toFixed(2)}:nb_colors=4:c0=0x04122b:c1=0x0b2450:c2=0x1a1140:c3=0x02101f:x0=180:y0=120:x1=1760:y1=960:speed=0.012`);
  } else {
    args.push('-f', 'lavfi', '-i', `color=c=0x061530:s=1920x1080:r=${FPS}:d=${TOTAL.toFixed(2)}`);
  }
  // 1..N) ภาพแต่ละฉาก (วนซ้ำเป็นวิดีโอ)
  for (const f of files) args.push('-loop', '1', '-framerate', String(FPS), '-i', f);
  // N+1..N+3) เสียงบรรยากาศ — สังเคราะห์สดจาก sine 3 เสียง แล้วผสมภายใน filter_complex (ไม่ใช้ไฟล์ภายนอก)
  const A0 = files.length + 1;
  for (const [f, v] of [[146.83, 0.5], [220, 0.32], [293.66, 0.2]]) {
    args.push('-f', 'lavfi', '-i', `sine=f=${f}:r=44100:d=${TOTAL.toFixed(2)},volume=${v}`);
  }

  const fc = [];
  fc.push(`[0:v]format=rgba,colorchannelmixer=aa=1[bg]`);
  let last = 'bg';
  files.forEach((_, i) => {
    const span = spans[i];
    const fadeOutAt = span.end - 0.75;
    fc.push(
      `[${i + 1}:v]scale=2112:1188,zoompan=z='min(1+0.00055*on,1.09)':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=${FPS},format=rgba,` +
      `fade=t=in:st=${span.start.toFixed(2)}:d=0.65:alpha=1,fade=t=out:st=${fadeOutAt.toFixed(2)}:d=0.75:alpha=1,` +
      `setpts=PTS-STARTPTS[s${i}]`,
    );
    const tag = `o${i}`;
    fc.push(`[${last}][s${i}]overlay=0:0:enable='between(t,${span.start.toFixed(2)},${span.end.toFixed(2)})':eval=frame[${tag}]`);
    last = tag;
  });
  // แถบความคืบหน้า + ขอบมืดแบบภาพยนตร์
  fc.push(`[${last}]vignette=PI/5,drawbox=x=0:y=1072:w='iw*t/${TOTAL.toFixed(2)}':h=8:color=0x7dd3fc@0.85:t=fill[vout]`);
  // เสียงบรรยากาศ: ผสม 3 เสียง + กรองความถี่สูงออก + เฟดเข้า/ออก
  fc.push(
    `[${A0}:a][${A0 + 1}:a][${A0 + 2}:a]amix=inputs=3:duration=longest,lowpass=f=1200,volume=0.14,` +
    `afade=t=in:st=0:d=3,afade=t=out:st=${(TOTAL - 2.6).toFixed(2)}:d=2.5[aout]`,
  );

  args.push(
    '-filter_complex', fc.join(';'),
    '-map', '[vout]', '-map', '[aout]',
    '-r', String(FPS), '-t', TOTAL.toFixed(2),
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '96k',
    '-movflags', '+faststart',
    '-y', TARGET,
  );

  console.log(`\n▶ ffmpeg ประกอบวิดีโอ ${TOTAL.toFixed(2)} วินาที (${useGradients ? 'พื้นหลังไล่สีเคลื่อนไหว' : 'พื้นหลังสีนิ่ง'})…`);
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg ล้มเหลว');
}

console.log('── 1/3 ฟอนต์');
const fonts = ensureFonts();
console.log('── 2/3 ถ่ายภาพฉาก (Chrome headless)');
buildHtml(fonts);
const shots = shoot(SCENES);
console.log('── 3/3 ประกอบวิดีโอ (ffmpeg)');
compose(shots);
rmSync(BUILD_HTML, { force: true });
console.log(`\n✅ เสร็จ: ${TARGET} (${(statSync(TARGET).size / 1024).toFixed(0)} KB)`);
