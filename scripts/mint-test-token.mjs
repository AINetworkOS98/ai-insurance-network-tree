import fs from 'node:fs';
// ออกโทเคนเซสชันชั่วคราวสำหรับทดสอบระบบของผู้ใช้เอง (ไม่พิมพ์โทเคนออกทางหน้าจอ)
const envTxt = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
const env = {};
for (const line of envTxt.split(/\r?\n/)) { const m = line.match(/^([A-Z0-9_]+)=(.*)$/); if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, ''); }
for (const k of ['AUTH_SECRET', 'DATABASE_URL']) if (!process.env[k] && env[k]) process.env[k] = env[k];

const { PrismaClient } = await import('@prisma/client');
const jwt = (await import('jsonwebtoken')).default;
const p = new PrismaClient();

// ผู้บริหารระบบ (rank สูงสุด) — ใช้ทดสอบในนามเจ้าของระบบ
const owner = await p.user.findFirst({ where: { status: 'ACTIVE', rankLevel: { gte: 2 } }, orderBy: { rankLevel: 'desc' }, select: { id: true, rankLevel: true, status: true } });
if (!owner) { console.log('ไม่พบผู้ใช้สำหรับทดสอบ'); process.exit(1); }
const token = jwt.sign({ sub: owner.id, email: '', rankLevel: owner.rankLevel ?? 0, status: owner.status }, process.env.AUTH_SECRET, { expiresIn: '1h' });
fs.writeFileSync(new URL('../tmp-test-token.txt', import.meta.url), token);
console.log('ออกโทเคนทดสอบแล้ว (rank', owner.rankLevel, '| id', String(owner.id).slice(0, 8) + '…', ') — เขียนลงไฟล์ ไม่แสดงในแชท');
await p.$disconnect();
