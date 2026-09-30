#!/usr/bin/env node
/**
 * ตั้งค่า LINE สำหรับ Backend (Vercel) — ค่าไม่ถูกพิมพ์ออกจอ/ไม่เข้า git
 *
 * วิธีใช้:
 *   1) คัดลอก scripts/line-env.example → .env.line (ไฟล์ .env* ถูก gitignore อยู่แล้ว)
 *   2) วางค่า 2 บรรทัด:
 *        LINE_CHANNEL_ACCESS_TOKEN=...
 *        LINE_TARGET_ID=...
 *   3) รัน:  node scripts/set-line-env.mjs            (ตั้งบน production + preview + development)
 *      ตัวเลือก:  node scripts/set-line-env.mjs --dry  (ตรวจไฟล์เฉย ๆ ไม่ยิง Vercel)
 *                node scripts/set-line-env.mjs --env production
 *
 * สคริปต์จะพิมพ์เฉพาะค่าที่ปิดบังแล้ว (เช่น U1234••••abcd) เพื่อยืนยันว่าตั้งถูกตัว
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = 'C:/Users/User/ai-insurance-network-tree';
const SCOPE = 'team_t41HGRNCDiFbVMyeBXlD0xXK';
const FILE = process.env.LINE_ENV_FILE || path.join(ROOT, '.env.line');
const KEYS = ['LINE_CHANNEL_ACCESS_TOKEN', 'LINE_TARGET_ID'];

const args = process.argv.slice(2);
const DRY = args.includes('--dry');
const envArgIdx = args.indexOf('--env');
const TARGETS = envArgIdx >= 0 && args[envArgIdx + 1] ? [args[envArgIdx + 1]] : ['production', 'preview', 'development'];

const mask = (v) => (v.length <= 8 ? '••••' : v.slice(0, 4) + '••••' + v.slice(-4) + ` (ยาว ${v.length})`);

if (!existsSync(FILE)) {
  console.error(`✗ ไม่พบไฟล์ ${FILE}`);
  console.error('  สร้างจาก template:  copy scripts/line-env.example .env.line   แล้ววางค่า 2 บรรทัด');
  process.exit(1);
}

const raw = readFileSync(FILE, 'utf8');
const vals = {};
for (const line of raw.split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (!m) continue;
  let v = m[2].trim().replace(/^["']|["']$/g, '');
  if (m[1] === 'LINE_CHANNEL_ACCESS_TOKEN') v = v.replace(/^Bearer\s+/i, '');
  vals[m[1]] = v;
}

const missing = KEYS.filter((k) => !vals[k]);
if (missing.length) {
  console.error(`✗ ยังขาดค่า: ${missing.join(', ')} (ในไฟล์ ${FILE})`);
  process.exit(1);
}

// ตรวจรูปแบบคร่าว ๆ ให้ทันก่อนยิง Vercel
if (!/^[A-Za-z0-9+/=_-]{50,}$/.test(vals.LINE_CHANNEL_ACCESS_TOKEN)) {
  console.warn('! LINE_CHANNEL_ACCESS_TOKEN ดูสั้น/มีอักขระแปลก — ปกติจะยาว ~170 ตัวอักษร (channel access token แบบ long-lived)');
}
if (!/^[CU][0-9a-f]{32}$/i.test(vals.LINE_TARGET_ID)) {
  console.warn('! LINE_TARGET_ID ปกติขึ้นต้นด้วย U (ผู้ใช้) หรือ C (กลุ่ม) และตามด้วย hex 32 ตัว — ตรวจอีกครั้ง');
}

console.log('ที่จะตั้งบน Vercel scope', SCOPE);
for (const k of KEYS) console.log(`  ${k} = ${mask(vals[k])}`);
console.log('environments:', TARGETS.join(', '));

if (DRY) { console.log('(--dry) ไม่ได้ยิง Vercel'); process.exit(0); }

let done = 0;
for (const env of TARGETS) {
  for (const k of KEYS) {
    try {
      // ส่งค่าผ่าน stdin เท่านั้น — ไม่ปรากฏใน command line / log
      execFileSync('npx', ['vercel', 'env', 'add', k, env, '--force', '--scope', SCOPE], {
        cwd: ROOT,
        input: vals[k] + '\n',
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      });
      console.log(`✓ ${k} → ${env}`);
      done++;
    } catch (e) {
      const msg = String(e.stderr || e.message || '').split('\n').filter(Boolean).slice(-1)[0] || 'unknown error';
      console.error(`✗ ${k} → ${env}: ${msg}`);
    }
  }
}
console.log(`\nตั้งสำเร็จ ${done}/${TARGETS.length * KEYS.length} รายการ`);
console.log('ขั้นต่อไป: deploy ใหม่ (npx vercel deploy --prod --yes --scope ' + SCOPE + ') แล้วกด “ส่งข้อความทดสอบ LINE” ที่หน้า /admin/reports');
