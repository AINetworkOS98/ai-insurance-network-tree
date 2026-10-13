#!/usr/bin/env node
/**
 * set-tiktok-ads-env.mjs — รับค่า TikTok Ads จาก "ไฟล์" แล้วตั้ง env ให้ทั้งเครื่องและ production
 * โดยไม่พิมพ์ค่า secret ลงจอ/ไม่ผ่านแชท
 *
 *   node scripts/set-tiktok-ads-env.mjs <ไฟล์>            # ตั้ง .env.local + Vercel (production)
 *   node scripts/set-tiktok-ads-env.mjs <ไฟล์> --local    # ตั้งเฉพาะ .env.local (ไม่แตะ Vercel)
 *
 * รูปแบบไฟล์ (บรรทัดละหนึ่งค่า · คอมเมนต์ด้วย # ได้):
 *   TIKTOK_ADS_ACCESS_TOKEN=xxxxx
 *   TIKTOK_ADS_ADVERTISER_ID=7251807874932883457
 *   TIKTOK_ADS_LOCATION_IDS=12345
 *   TIKTOK_MARKETING_APP_ID=...          (ไม่บังคับ)
 *   TIKTOK_MARKETING_APP_SECRET=...      (ไม่บังคับ)
 *
 * ความปลอดภัย: สคริปต์พิมพ์แค่ "ชื่อคีย์ + ความยาว" ไม่พิมพ์ค่าจริง · ลบไฟล์ต้นทางให้เมื่อสำเร็จ (ปิดด้วย --keep)
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const KEYS = [
  'TIKTOK_ADS_ACCESS_TOKEN',
  'TIKTOK_ADS_ADVERTISER_ID',
  'TIKTOK_ADS_LOCATION_IDS',
  'TIKTOK_MARKETING_APP_ID',
  'TIKTOK_MARKETING_APP_SECRET',
];
const file = process.argv[2];
const localOnly = process.argv.includes('--local');
const keep = process.argv.includes('--keep');
if (!file) { console.error('usage: node scripts/set-tiktok-ads-env.mjs <ไฟล์ที่มีค่า KEY=VALUE> [--local] [--keep]'); process.exit(2); }
if (!fs.existsSync(file)) { console.error(`✖ ไม่พบไฟล์: ${file}`); process.exit(1); }

const found = {};
for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
  if (m && KEYS.includes(m[1])) found[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const missing = ['TIKTOK_ADS_ACCESS_TOKEN', 'TIKTOK_ADS_ADVERTISER_ID'].filter((k) => !found[k]);
if (missing.length) { console.error(`✖ ไฟล์ขาดคีย์ที่จำเป็น: ${missing.join(', ')}`); process.exit(1); }

console.log('── พบค่าในไฟล์ (แสดงแค่ความยาว) ─────────────────────────');
for (const [k, v] of Object.entries(found)) console.log(`  ${k} = ${v.length} ตัวอักษร`);

// 1) .env.local
const envPath = path.join(process.cwd(), '.env.local');
let envTxt = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : '';
let added = 0;
for (const [k, v] of Object.entries(found)) {
  const re = new RegExp(`^${k}=.*$`, 'm');
  if (re.test(envTxt)) envTxt = envTxt.replace(re, `${k}=${v}`);
  else { envTxt += `${envTxt.endsWith('\n') || !envTxt ? '' : '\n'}${k}=${v}\n`; }
  added++;
}
fs.writeFileSync(envPath, envTxt, 'utf8');
console.log(`\n✓ เขียน ${added} คีย์ลง .env.local แล้ว (ไม่ได้พิมพ์ค่าลงจอ)`);

// 2) Vercel production (ถ้าไม่สั่ง --local)
if (!localOnly) {
  const vc = path.join(process.cwd(), 'node_modules', 'vercel', 'dist', 'vc.js');
  const scope = process.env.VERCEL_SCOPE || 'team_t41HGRNCDiFbVMyeBXlD0xXK';
  for (const [k, v] of Object.entries(found)) {
    try {
      // ลบของเดิม (ถ้ามี) แล้วเพิ่มใหม่แบบ encrypted
      try { execFileSync(process.execPath, [vc, 'env', 'rm', k, 'production', '--yes', '--scope', scope], { stdio: 'ignore' }); } catch { /* ยังไม่มีก็ข้าม */ }
      execFileSync(process.execPath, [vc, 'env', 'add', k, 'production', '--scope', scope], { input: v + '\n', stdio: ['pipe', 'ignore', 'ignore'] });
      console.log(`  ✓ Vercel: ตั้ง ${k} (production)`);
    } catch (e) {
      console.log(`  ! Vercel: ตั้ง ${k} ไม่สำเร็จ — ${e.message?.split('\n')[0] || 'error'}`);
    }
  }
  console.log('\n→ ต้อง redeploy ให้ env มีผล: node node_modules/vercel/dist/vc.js deploy --prod --yes --scope ' + scope);
}

if (!keep) { fs.rmSync(file, { force: true }); console.log('✓ ลบไฟล์ต้นทางแล้ว'); }
console.log('\nถัดไป: node scripts/ads-launch.mjs   (dry run)  →  node scripts/ads-launch.mjs --confirm');
