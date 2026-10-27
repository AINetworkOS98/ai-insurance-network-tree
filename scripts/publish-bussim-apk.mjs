// publish-bussim-apk.mjs — คัดลอก APK "ผลประกอบการ (Keyman)" เข้า public/apk + สร้าง manifest
// ใช้: node scripts/publish-bussim-apk.mjs
// อ่านไฟล์จาก C:/Users/User/business-sim/build/app/outputs/flutter-apk/
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SRC = 'C:/Users/User/business-sim/build/app/outputs/flutter-apk';
const OUT = path.resolve('public/apk');
const VERSION = '1.0.0';

const pairs = [
  ['app-arm64-v8a-release.apk', 'business-sim.apk', 'primary'],
  ['app-armeabi-v7a-release.apk', 'business-sim-legacy.apk', 'legacy'],
  ['app-release.apk', 'business-sim-universal.apk', 'universal'],
];

const sha256 = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const sizeText = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

fs.mkdirSync(OUT, { recursive: true });
const manifest = {
  app: { name: 'ผลประกอบการ (Keyman) — Business Result Simulator', version: VERSION },
  platform: {
    android: { minOs: 'Android 7.0 (API 24) ขึ้นไป', file: 'APK' },
    ios: { note: 'ใช้วิธี “เพิ่มไปที่หน้าจอโฮม” ใน Safari (ยังไม่มีไฟล์ .ipa ที่เซ็นแล้ว)' },
  },
  source: '/prospects?tab=sim',
  formula: 'สูตรเดียวกับหน้าเว็บ src/lib/tax/businessSim.ts (ชุดทดสอบ 6 กรณีที่สร้างจากเอนจินเว็บ + ภาษีบุคคลธรรมดา 23 กรณี)',
  apk: {},
  releasedAt: new Date().toISOString(),
};

for (const [src, dst, key] of pairs) {
  const from = path.join(SRC, src);
  if (!fs.existsSync(from)) {
    console.log(`SKIP (ยังไม่มีไฟล์): ${from}`);
    continue;
  }
  const to = path.join(OUT, dst);
  fs.copyFileSync(from, to);
  const bytes = fs.statSync(to).size;
  const sha = sha256(to);
  manifest.apk[key] = {
    file: dst,
    url: `/apk/${dst}`,
    downloadUrl: `/apk/${dst}?v=${sha.slice(0, 12)}`,
    bytes,
    sizeText: sizeText(bytes),
    sha256: sha,
    version: VERSION,
  };
  console.log(`✔ ${dst} · ${sizeText(bytes)} · sha256 ${sha.slice(0, 16)}…`);
}

if (!manifest.apk.primary) {
  console.error('✖ ไม่พบ APK หลัก (app-arm64-v8a-release.apk) — ยังไม่เขียน manifest');
  process.exit(1);
}

fs.writeFileSync(path.join(OUT, 'business-sim-release.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('✔ เขียน public/apk/business-sim-release.json แล้ว');
