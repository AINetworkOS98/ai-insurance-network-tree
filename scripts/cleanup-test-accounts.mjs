// เครื่องมือผู้ดูแลระบบ: ลบบัญชีทดสอบ (@ai-insurance-test.local เท่านั้น) ผ่าน Prisma client
// ทางเลือกของ /api/admin/test-accounts สำหรับตอนที่ล็อกอินหลังบ้านไม่ได้
// ปลอดภัยโดยการออกแบบ: จำกัดโดเมนอีเมลทดสอบเท่านั้น จึงลบสมาชิกจริงไม่ได้
// วิธีรัน: DATABASE_URL="<production>" node scripts/cleanup-test-accounts.mjs [list|delete]   (ค่าเริ่มต้น list)
import { PrismaClient } from '@prisma/client';

const DOMAIN = '@ai-insurance-test.local';
const mode = (process.argv[2] || 'list').toLowerCase();
const prisma = new PrismaClient();

const users = await prisma.user.findMany({
  where: { email: { endsWith: DOMAIN } },
  select: { id: true, email: true, username: true, memberCode: true, status: true, createdAt: true },
  orderBy: { createdAt: 'desc' },
});

console.log(`โดเมนทดสอบ ${DOMAIN} — พบ ${users.length} บัญชี`);
for (const u of users) {
  console.log(`  - ${u.email} | username=${u.username} | code=${u.memberCode} | status=${u.status} | ${u.createdAt?.toISOString?.()}`);
}

if (mode === 'delete') {
  if (!users.length) { console.log('ไม่มีอะไรต้องลบ'); await prisma.$disconnect(); process.exit(0); }
  const ids = users.map((u) => u.id);

  // ลบตามลำดับ FK (เหมือน /api/admin/test-accounts) — กันตารางที่อ้าง User แบบ restrict
  const steps = [
    ['eventOutbox', () => prisma.eventOutbox.deleteMany({ where: { eventId: { in: ids.map((i) => `registration:${i}`) } } })],
    ['placementRunEntry', () => prisma.placementRunEntry.deleteMany({ where: { userId: { in: ids } } })],
    ['consentRecord', () => prisma.consentRecord.deleteMany({ where: { userId: { in: ids } } })],
    ['auditLog', () => prisma.auditLog.deleteMany({ where: { userId: { in: ids } } })],
  ];
  for (const [name, fn] of steps) {
    try { const r = await fn(); console.log(`  เคลียร์ ${name}: ${r.count}`); }
    catch (e) { console.log(`  ข้าม ${name}: ${e.message.split('\n')[0]}`); }
  }

  const res = await prisma.user.deleteMany({ where: { id: { in: ids } } });
  console.log(`\nลบแล้ว ${res.count} บัญชี`);

  const left = await prisma.user.count({ where: { email: { endsWith: DOMAIN } } });
  console.log(`เหลือบัญชีทดสอบ: ${left}`);
  console.log(`สมาชิกทั้งหมดคงเหลือ: ${await prisma.user.count()}`);
}

await prisma.$disconnect();
