// ตรวจข้อมูลค้างว่าอ้างถึงสมาชิกที่ถูกลบหรือไม่ (read-only)
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.vercel.pull', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const prisma = new PrismaClient({ datasources: { db: { url: env.POSTGRES_URL_NON_POOLING } } });
const ADMIN = 'akarapol.pro798@gmail.com';
const admin = await prisma.user.findFirst({ where: { email: ADMIN }, select: { id:true, memberCode:true } });

const dump = (rows, fields) => rows.map((r) => fields.map((f) => {
  const v = r[f]; return v instanceof Date ? v.toISOString().slice(0,19) : (typeof v === 'object' && v ? JSON.stringify(v).slice(0,60) : String(v));
}).join(' | ')).join('\n      ');

console.log('=== ReceiptFile ที่เหลือ ===');
console.log('      ' + dump(await prisma.receiptFile.findMany({ include: { user: { select: { email:true, memberCode:true } } } }), ['id','userId','status','creditedPeriod','memberCode']));
console.log('\n=== PerformanceLedger ที่เหลือ ===');
console.log('      ' + dump(await prisma.performanceLedger.findMany({ include: { user: { select: { email:true, memberCode:true } } } }), ['id','userId','type','amount','period','status']));

console.log('\n=== PlacementRunEntry (61 แถว) — ดูคอลัมน์ ===');
const pre = await prisma.placementRunEntry.findMany({ take: 3 });
console.log('      keys: ' + (pre[0] ? Object.keys(pre[0]).join(', ') : '(ว่าง)'));
console.log('      ' + JSON.stringify(pre[0] ?? {}).slice(0, 500));
const preAll = await prisma.placementRunEntry.count();
const preNull = await prisma.placementRunEntry.count({ where: { userId: null } });
console.log(`      ทั้งหมด ${preAll} | userId เป็น null ${preNull}`);

console.log('\n=== Prospect ===');
const pros = await prisma.prospect.findMany({ take: 5 });
console.log('      keys: ' + (pros[0] ? Object.keys(pros[0]).join(', ') : '(ว่าง)'));
console.log('      ' + dump(pros, ['id','name','status','userId','createdAt']));

console.log('\n=== SupportTicket ===');
const st = await prisma.supportTicket.findMany({ take: 5 });
console.log('      keys: ' + (st[0] ? Object.keys(st[0]).join(', ') : '(ว่าง)'));
console.log('      ' + dump(st, ['id','subject','status','userId','createdAt']));

console.log('\n=== Notification ===');
const nt = await prisma.notification.findMany({ take: 5 });
console.log('      keys: ' + (nt[0] ? Object.keys(nt[0]).join(', ') : '(ว่าง)'));
console.log('      ' + dump(nt, ['id','type','title','userId','createdAt']));
console.log(`      แจ้งเตือนของแอดมิน: ${await prisma.notification.count({ where: { userId: admin.id } })}`);

// ผู้ใช้ที่ถูกลบไปแล้วแต่ยังมี TreeNode/ความสัมพันธ์ค้าง
console.log('\n=== ผู้ใช้ที่ยังอ้างถึงสมาชิกที่ถูกลบ (ควรเป็น 0) ===');
const remainingUserIds = (await prisma.user.findMany({ select: { id:true } })).map((u) => u.id);
console.log(`      users ปัจจุบัน: ${remainingUserIds.length}`);
const allTables = await prisma.$queryRawUnsafe(`
  SELECT table_name, column_name FROM information_schema.columns
  WHERE table_schema='public' AND (column_name='user_id' OR column_name='userId')`);
let orphanTotal = 0;
const inList = remainingUserIds.map((i) => `'${i}'`).join(',') || "''";
for (const c of allTables) {
  try {
    const r = await prisma.$queryRawUnsafe(`SELECT COUNT(*)::int AS n FROM "${c.table_name}" WHERE "${c.column_name}" IS NOT NULL AND "${c.column_name}" NOT IN (${inList})`);
    const n = r[0]?.n ?? 0;
    if (n > 0) { console.log(`      ⚠ ${c.table_name}.${c.column_name}: ${n} แถวอ้างผู้ใช้ที่ไม่มีแล้ว`); orphanTotal += n; }
  } catch {}
}
console.log(`      รวม orphan: ${orphanTotal}`);
await prisma.$disconnect();
