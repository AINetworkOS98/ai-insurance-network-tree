// ลบสมาชิกทั้งหมดที่ไม่ใช่แอดมินออกจากระบบ production (ผู้ใช้สั่งยืนยันแล้ว)
// เก็บเฉพาะ akarapol.pro798@gmail.com
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.vercel.pull', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const prisma = new PrismaClient({ datasources: { db: { url: env.POSTGRES_URL_NON_POOLING } } });

const ADMIN = 'akarapol.pro798@gmail.com';
const admin = await prisma.user.findFirst({ where: { email: ADMIN }, select: { id:true, memberCode:true, displayName:true } });
if (!admin) { console.error('ไม่พบแอดมิน — ยกเลิก'); await prisma.$disconnect(); process.exit(1); }
console.log(`เก็บไว้: ${admin.displayName} (${admin.memberCode})`);

const others = await prisma.user.findMany({ where: { id: { not: admin.id } }, select: { id:true, email:true, memberCode:true } });
const ids = others.map((u) => u.id);
const notAdmin = { id: { not: admin.id } };
console.log(`จะลบ: ${ids.length} สมาชิก\n`);

const steps = [
  ['TreePlacement (childId)',        () => prisma.treePlacement.deleteMany({ where: { childId: { in: ids } } })],
  ['TreeNode',                       () => prisma.treeNode.deleteMany({ where: { userId: { in: ids } } })],
  ['PerformanceLedger',              () => prisma.performanceLedger.deleteMany({ where: { userId: { in: ids } } })],
  ['ReceiptFile',                    () => prisma.receiptFile.deleteMany({ where: { userId: { in: ids } } })],
  ['RankHistory',                    () => prisma.rankHistory.deleteMany({ where: { userId: { in: ids } } })],
  ['MembershipStatusHistory',        () => prisma.membershipStatusHistory.deleteMany({ where: { userId: { in: ids } } })],
  ['PlacementHistory',               () => prisma.placementHistory.deleteMany({ where: { userId: { in: ids } } })],
  ['PlacementRunEntry',              () => prisma.placementRunEntry.deleteMany({ where: { userId: { in: ids } } })],
  ['MaintenanceResult',              () => prisma.maintenanceResult.deleteMany({ where: { userId: { in: ids } } })],
  ['PlacementQueue',                 () => prisma.placementQueue.deleteMany({ where: { userId: { in: ids } } })],
  ['UserSession',                    () => prisma.userSession.deleteMany({ where: { userId: { in: ids } } })],
  ['Notification',                   () => prisma.notification.deleteMany({ where: { userId: { in: ids } } })],
  ['ConsentRecord',                  () => prisma.consentRecord.deleteMany({ where: { userId: { in: ids } } })],
  ['EmailMessage',                   () => prisma.emailMessage.deleteMany({ where: { toUserId: { in: ids } } })],
  ['EmailVerificationToken',         () => prisma.emailVerificationToken.deleteMany({ where: { userId: { in: ids } } })],
  ['AuthIdentity',                   () => prisma.authIdentity.deleteMany({ where: { userId: { in: ids } } })],
  ['ReferralCode',                   () => prisma.referralCode.deleteMany({ where: { userId: { in: ids } } })],
  ['Sponsorship (child)',            () => prisma.sponsorship.deleteMany({ where: { childId: { in: ids } } })],
  ['Sponsorship (sponsor)',          () => prisma.sponsorship.deleteMany({ where: { sponsorId: { in: ids } } })],
  ['AuditLog',                       () => prisma.auditLog.deleteMany({ where: { userId: { in: ids } } })],
  ['EventOutbox (registration)',     () => prisma.eventOutbox.deleteMany({ where: { eventId: { in: ids.map((i) => `registration:${i}`) } } })],
  ['USER',                           () => prisma.user.deleteMany({ where: { id: { in: ids } } })],
];
for (const [name, fn] of steps) {
  try { const r = await fn(); if (r.count) console.log(`  ลบ ${name}: ${r.count}`); }
  catch (e) { console.log(`  ⚠ ${name}: ${String(e.message).split('\n')[0].slice(0,120)}`); }
}

console.log('\n=== ผลหลังลบ ===');
console.log(`  users ทั้งหมด: ${await prisma.user.count()}`);
const left = await prisma.user.findMany({ select: { email:true, memberCode:true, displayName:true, status:true, rankLevel:true } });
for (const u of left) console.log(`   - ${u.email} | ${u.memberCode} | rank=${u.rankLevel} | ${u.status}`);
console.log(`  TreeNode: ${await prisma.treeNode.count()}`);
console.log(`  PlacementRunEntry: ${await prisma.placementRunEntry.count()}`);
console.log(`  ReceiptFile: ${await prisma.receiptFile.count()}`);
console.log(`  PerformanceLedger: ${await prisma.performanceLedger.count()}`);
console.log(`  Prospect: ${await prisma.prospect.count().catch(()=>-1)} | Notification: ${await prisma.notification.count()} | SupportTicket: ${await prisma.supportTicket.count().catch(()=>-1)}`);
console.log(`  AuditLog: ${await prisma.auditLog.count()} | EventOutbox: ${await prisma.eventOutbox.count()}`);
await prisma.$disconnect();
