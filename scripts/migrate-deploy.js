// scripts/migrate-deploy.js — รัน prisma migrate deploy เฉพาะเมื่อมี DIRECT_URL
// และไม่ใช่ localhost (กันรันผิด DB ตอน dev; บน Vercel Production มีค่าครบเลยรันให้เอง)
const { execSync } = require('child_process');

const directUrl = process.env.DIRECT_URL || '';
const dbUrl = process.env.DATABASE_URL || '';

if (!directUrl) {
  console.log('[migrate] SKIP — no DIRECT_URL (dev/local build)');
  process.exit(0);
}
if (dbUrl.includes('localhost') || dbUrl.includes('127.0.0.1')) {
  console.log('[migrate] SKIP — localhost database');
  process.exit(0);
}

console.log('[migrate] deploying pending migrations...');
try {
  // ล้างสถานะ failed ของ migration ที่รู้ว่าไม่เคย apply สำเร็จ (syntax error ตั้งแต่ statement แรก)
  // ถ้า resolve ไม่สำเร็จหรือไม่จำเป็น ให้ deploy ตัดสิน (ignore error ตรงนี้เสมอ)
  execSync('npx prisma migrate resolve --rolled-back "3_seed_thailife_2569"', { stdio: 'ignore' });
  console.log('[migrate] resolved rolled-back 3_seed_thailife_2569');
} catch {}
execSync('npx prisma migrate deploy', { stdio: 'inherit' });
console.log('[migrate] done');
