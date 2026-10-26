// publish-tax-apk.mjs — คัดลอก APK ที่ build แล้วเข้า public/apk + สร้าง manifest ให้หน้าเว็บอ่าน
// ใช้: node scripts/publish-tax-apk.mjs
// อ่านไฟล์จาก C:/Users/<user>/thai-tax-planner/build/app/outputs/flutter-apk/
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SRC = 'C:/Users/User/thai-tax-planner/build/app/outputs/flutter-apk';
const OUT = path.resolve('public/apk');

const pairs = [
  ['app-arm64-v8a-release.apk', 'thai-tax-planner.apk', 'primary'],
  ['app-armeabi-v7a-release.apk', 'thai-tax-planner-legacy.apk', 'legacy'],
  ['app-release.apk', 'thai-tax-planner-universal.apk', 'universal'],
];

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

const sizeText = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

fs.mkdirSync(OUT, { recursive: true });
const manifest = {
  app: { name: 'คำนวณภาษี 2569 (Thai Tax Planner)', version: '1.0.0' },
  platform: {
    android: { minOs: 'Android 7.0 (API 24) ขึ้นไป', file: 'APK' },
    ios: { note: 'ใช้วิธี “เพิ่มไปที่หน้าจอโฮม” ใน Safari (ยังไม่มีไฟล์ .ipa ที่เซ็นแล้ว)' },
  },
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
  const info = {
    file: dst,
    url: `/apk/${dst}`,
    downloadUrl: `/apk/${dst}?v=${sha.slice(0, 12)}`,
    bytes,
    sizeText: sizeText(bytes),
    sha256: sha,
    version: '1.0.0',
  };
  manifest.apk[key] = info;
  console.log(`✔ ${dst} · ${info.sizeText} · sha256 ${sha.slice(0, 16)}…`);
}

fs.writeFileSync(path.join(OUT, 'thai-tax-planner-release.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log('✔ เขียน public/apk/thai-tax-planner-release.json แล้ว');
