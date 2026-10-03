// ล้าง orphan ที่อ้างสมาชิกซึ่งถูกลบไปแล้ว + ตรวจข้อมูลที่เหลือ (production)
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.vercel.pull', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const prisma = new PrismaClient({ datasources: { db: { url: env.POSTGRES_URL_NON_POOLING } } });
const ADMIN = 'akarapol.pro798@gmail.com';
const admin = await prisma.user.findFirst({ where: { email: ADMIN }, select: { id:true } });
const live = (await prisma.user.findMany({ select: { id:true } })).map((u) => u.id);

// 1) PlacementRunEntry ที่อ้างผู้ใช้ที่ไม่มีแล้ว (คอลัมน์ userId ไม่มี FK)
const orphanPRE = await prisma.placementRunEntry.deleteMany({ where: { userId: { notIn: live } } });
console.log(`ลบ PlacementRunEntry ที่อ้างสมาชิกที่ถูกลบแล้ว: ${orphanPRE.count}`);
console.log(`PlacementRunEntry เหลือ: ${await prisma.placementRunEntry.count()} (ของแอดมิน ${await prisma.placementRunEntry.count({ where: { userId: admin.id } })})`);

// 2) PlacementHistory / Ranking / TreeNode orphan อื่น ๆ
for (const [name, fn] of [
  ['TreeNode', () => prisma.treeNode.deleteMany({ where: { userId: { notIn: live } } })],
  ['PlacementHistory', () => prisma.placementHistory.deleteMany({ where: { userId: { notIn: live } } })],
  ['MembershipStatusHistory', () => prisma.membershipStatusHistory.deleteMany({ where: { userId: { notIn: live } } })],
  ['RankHistory', () => prisma.rankHistory.deleteMany({ where: { userId: { notIn: live } } })],
  ['MaintenanceResult', () => prisma.maintenanceResult.deleteMany({ where: { userId: { notIn: live } } })],
  ['PlacementQueue', () => prisma.placementQueue.deleteMany({ where: { userId: { notIn: live } } })],
  ['UserSession', () => prisma.userSession.deleteMany({ where: { userId: { notIn: live } } })],
]) {
  try { const r = await fn(); if (r.count) console.log(`ลบ ${name} orphan: ${r.count}`); } catch (e) { console.log(`${name}: ${String(e.message).slice(0,80)}`); }
}

// 3) Prospect — ดูว่าเป็นข้อมูลของใคร (ownerId / assignedTo / sponsorId)
const pros = await prisma.prospect.findMany({
  select: { prospectId: true, firstName: true, lastName: true, email: true, phone: true, status: true, ownerId: true, assignedTo: true, sponsorId: true, leadScore: true, createdAt: true },
  orderBy: { createdAt: 'desc' },
});
const idSet = new Set(live);
console.log(`\n=== Prospect: ${pros.length} ราย ===`);
let prosOrphan = 0;
for (const p of pros) {
  const orphan = [p.ownerId, p.assignedTo, p.sponsorId].some((v) => v && !idSet.has(v));
  if (orphan) prosOrphan++;
  console.log(`  ${p.prospectId} | ${p.firstName} ${p.lastName} | ${p.email || '-'} | ${p.phone || '-'} | ${p.status} | score=${p.leadScore} | ถูกสร้าง ${p.createdAt.toISOString().slice(0,10)}${orphan ? '  <-- อ้างสมาชิกที่ถูกลบ' : ''}`);
}
console.log(`  Prospect ที่อ้างสมาชิกที่ถูกลบ: ${prosOrphan}`);

// 4) สรุปข้อมูลที่เหลือทั้งหมด
console.log('\n=== ข้อมูลคงเหลือในระบบ ===');
for (const [name, fn] of [
  ['users', () => prisma.user.count()],
  ['prospect', () => prisma.prospect.count()],
  ['supportTicket', () => prisma.supportTicket.count()],
  ['notification', () => prisma.notification.count()],
  ['agentTask', () => prisma.agentTask.count()],
  ['appointment', () => prisma.appointment.count()],
  ['receiptFile', () => prisma.receiptFile.count()],
  ['performanceLedger', () => prisma.performanceLedger.count()],
  ['video', () => prisma.video.count()],
  ['auditLog', () => prisma.auditLog.count()],
  ['eventOutbox', () => prisma.eventOutbox.count()],
  ['placementRun', () => prisma.placementRun.count()],
]) { try { console.log(`  ${name}: ${await fn()}`); } catch {} }
await prisma.$disconnect();
