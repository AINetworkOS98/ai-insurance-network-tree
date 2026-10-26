// scripts/gen-release.mjs — สร้าง "ใบรับรองเวอร์ชัน" ของแอป (release manifest)
//
// ทำอะไร:
//   1) อ่าน version จาก package.json + commit ที่กำลัง build (git หรือ env ของ Vercel)
//   2) คำนวณขนาด + sha256 ของไฟล์ APK ทุกไฟล์ใน public/apk
//   3) เขียนไฟล์ผลลัพธ์ 2 ที่:
//        - src/lib/app-release.json  → ถูก bundle เข้า /api/app-release (ใช้บน Vercel ได้แม้ไม่มี git)
//        - public/apk/release.json    → ให้เครื่องมือภายนอก (n8n) อ่านตรงได้
//
// ทำไมต้องมี: หน้า /download ต้องแสดงเวอร์ชัน/ขนาด/เวลาอัปเดต/มีอะไรใหม่ "latest จริง"
//   และลิงก์ดาวน์โหลดต้องเปลี่ยน ?v=<hash> ทุกครั้งที่ไฟล์ APK เปลี่ยน → ผู้ใช้ไม่ติดแคชเก่า
//
// รัน: npm run release:gen (และถูกเรียกอัตโนมัติก่อน next build ผ่าน "prebuild")
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';

const root = process.cwd();
const readJson = (p, fb) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fb; } };

function git(args, fallback = '') {
  try {
    return execSync(`git ${args}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return fallback; }
}

function human(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

function sha256(file) {
  const h = crypto.createHash('sha256');
  h.update(fs.readFileSync(file));
  return h.digest('hex');
}

const pkg = readJson(path.join(root, 'package.json'), { version: '0.0.0' });

// ── commit ที่กำลัง build: Vercel ให้ env มา (ไม่มี .git) → ใช้ก่อน แล้วค่อย fallback ไป git ──
const envSha = process.env.VERCEL_GIT_COMMIT_SHA || '';
const commit = (envSha || git('rev-parse HEAD')).slice(0, 7) || 'local';
const commitMessage = (process.env.VERCEL_GIT_COMMIT_MESSAGE || git('log -1 --pretty=%s') || '').trim();
const commitAuthor = (process.env.VERCEL_GIT_COMMIT_AUTHOR_NAME || git('log -1 --pretty=%an') || '').trim();
const committedAt = git('log -1 --pretty=%cI') || new Date().toISOString();

// ── changelog: 8 commit ล่าสุด (บน Vercel ไม่มี .git จึงเหลือแค่ commit ปัจจุบัน) ──
// ถ้า build บน Vercel: ต่อรายการจากไฟล์ที่ commit ไว้ก่อนหน้า (คงประวัติ 8 รายการล่าสุด)
const prevPath = path.join(root, 'src', 'lib', 'app-release.json');
const prevChangelog = readJson(prevPath, {}).changelog || [];

let changelog = [];
const logRaw = git('log -8 --pretty=%h\u0001%cI\u0001%s');
if (logRaw) {
  changelog = logRaw.split('\n').map((line) => {
    const [hash, date, subject] = line.split('\u0001');
    return { commit: (hash || '').slice(0, 7), date: date || '', subject: subject || '' };
  }).filter((c) => c.commit);
}
if (!changelog.length && commitMessage) {
  const head = [{ commit, date: committedAt, subject: commitMessage }];
  // รวมกับประวัติเดิม: ตัดรายการที่ commit ซ้ำ แล้วเก็บ 8 รายการล่าสุด
  const seen = new Set(head.map((c) => c.subject));
  changelog = head.concat(prevChangelog.filter((c) => c?.subject && !seen.has(c.subject))).slice(0, 8);
}

// ── APK ──
const apkDir = path.join(root, 'public', 'apk');
const apkFiles = fs.existsSync(apkDir) ? fs.readdirSync(apkDir).filter((f) => f.toLowerCase().endsWith('.apk')).sort() : [];

function apkInfo(fileName, fallbackVersion) {
  const abs = path.join(apkDir, fileName);
  if (!fs.existsSync(abs)) return null;
  const bytes = fs.statSync(abs).size;
  const hash = sha256(abs);
  return {
    file: fileName,
    url: `/apk/${fileName}`,
    // ?v=<hash 12 ตัว> → เปลี่ยนทุกครั้งที่ไฟล์เปลี่ยน (กัน CDN/เบราว์เซอร์ค้างไฟล์เก่า)
    downloadUrl: `/apk/${fileName}?v=${hash.slice(0, 12)}`,
    bytes,
    sizeText: human(bytes),
    sha256: hash,
    version: fallbackVersion,
  };
}

const APK_VERSION = (process.env.APK_VERSION || '1.0.0').trim();
const primaryApk = apkInfo('ai-insurance-mobile.apk', APK_VERSION);
const universalApk = apkInfo('ai-insurance-mobile-universal.apk', APK_VERSION);

const manifest = {
  app: {
    name: 'AI Insurance Network OS',
    version: pkg.version || '0.0.0',
  },
  build: {
    commit,
    message: commitMessage,
    author: commitAuthor,
    committedAt,
    generatedAt: new Date().toISOString(),
    env: process.env.VERCEL_ENV || 'local',
  },
  apk: {
    version: APK_VERSION,
    primary: primaryApk,
    universal: universalApk,
  },
  changelog,
  downloadPage: '/download',
};

// fingerprint ของ "ตัวโปรแกรม" (ไม่รวมข้อมูลในฐานข้อมูล) — n8n ใช้เทียบว่าเปลี่ยนหรือยัง
manifest.fingerprint = crypto
  .createHash('sha256')
  .update([manifest.app.version, commit, primaryApk?.sha256 || '-', universalApk?.sha256 || '-'].join('|'))
  .digest('hex')
  .slice(0, 16);

const out1 = path.join(root, 'src', 'lib', 'app-release.json');
const out2 = path.join(apkDir, 'release.json');
fs.mkdirSync(path.dirname(out1), { recursive: true });
fs.mkdirSync(apkDir, { recursive: true });
fs.writeFileSync(out1, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
fs.writeFileSync(out2, JSON.stringify(manifest, null, 2) + '\n', 'utf8');

console.log(
  `[release] v${manifest.app.version} · ${commit} · apk ${primaryApk ? primaryApk.sizeText : 'missing'} · ` +
  `fingerprint ${manifest.fingerprint} → src/lib/app-release.json`
);
