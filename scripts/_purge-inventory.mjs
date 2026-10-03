// ชั่วคราว — สำรวจทุกตารางที่อ้างถึง users (ก่อนลบ) read-only
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.vercel.pull', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const prisma = new PrismaClient({ datasources: { db: { url: env.POSTGRES_URL_NON_POOLING } } });

const ADMIN = 'akarapol.pro798@gmail.com';
const admin = await prisma.user.findFirst({ where: { email: ADMIN }, select: { id:true, memberCode:true, displayName:true, rankLevel:true } });
console.log('ADMIN:', JSON.stringify(admin));
if (!admin) { console.log('ไม่พบแอดมิน — หยุด'); await prisma.$disconnect(); process.exit(1); }

const others = await prisma.user.findMany({ where: { id: { not: admin.id } }, select: { id:true, email:true, memberCode:true, status:true, rankLevel:true } });
console.log(`\nผู้ใช้ที่จะลบ: ${others.length} คน (ทั้งหมดไม่ใช่แอดมิน)`);
const ids = others.map((u) => u.id);

// หาทุกตาราง/คอลัมน์ที่อ้าง user
const cols = await prisma.$queryRawUnsafe(`
  SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema='public' AND (column_name='user_id' OR column_name='userId')
  ORDER BY table_name`);
console.log(`\nตารางที่มีคอลัมน์อ้างถึง user: ${cols.length}`);
const inList = ids.map((i) => `'${i}'`).join(',');
console.log('\n=== จำนวนแถวที่จะถูกลบ (หรือถูกตั้ง NULL) ต่อตาราง ===');
for (const c of cols) {
  const t = c.table_name;
  try {
    const r = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "${t}" WHERE "${c.column_name}" IN (${inList})`);
    const n = r[0]?.n ?? 0;
    if (n > 0) console.log(`  ${t}.${c.column_name}: ${n}`);
  } catch (e) { console.log(`  ${t}.${c.column_name}: err ${String(e.message).slice(0,70)}`); }
}
// FK ที่อ้าง users (เพื่อรู้ว่าลบตรงๆ ได้ไหม)
const fks = await prisma.$queryRawUnsafe(`
  SELECT tc.table_name, kcu.column_name, rc.delete_rule
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu ON tc.constraint_name=kcu.constraint_name
  JOIN information_schema.referential_constraints rc ON tc.constraint_name=rc.constraint_name
  JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name=ccu.constraint_name
  WHERE tc.constraint_type='FOREIGN KEY' AND ccu.table_name='users'`);
console.log('\n=== FK ที่ชี้ไปตาราง users ===');
for (const f of fks) console.log(`  ${f.table_name}.${f.column_name} ON DELETE ${f.delete_rule}`);
await prisma.$disconnect();
