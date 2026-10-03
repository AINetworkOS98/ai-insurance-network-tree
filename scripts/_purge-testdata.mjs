// ล้างข้อมูลทดสอบทั้งหมดใน production ให้เหลือเฉพาะระบบจริง (ผู้ใช้สั่งลบสมาชิกอื่นทั้งหมด + ทำระบบให้เป็นจริง)
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.vercel.pull', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const prisma = new PrismaClient({ datasources: { db: { url: env.POSTGRES_URL_NON_POOLING } } });
const q = (sql) => prisma.$queryRawUnsafe(sql);

console.log('=== ก่อนล้าง ===');
console.log(`  prospect=${await prisma.prospect.count()} agentTask=${await prisma.agentTask.count()} supportTicket=${await prisma.supportTicket.count()} notification=${await prisma.notification.count()}`);

// 1) ล้างทุกตารางที่มีคอลัมน์ prospect_id
const pids = (await prisma.prospect.findMany({ select: { id:true } })).map((p) => p.id);
const pTables = await q(`SELECT table_name FROM information_schema.columns WHERE table_schema='public' AND column_name='prospect_id'`);
const inP = pids.map((i) => `'${i}'`).join(',') || `''`;
for (const t of pTables) {
  try {
    const r = await q(`DELETE FROM "${t.table_name}" WHERE prospect_id IN (${inP})`);
    if (Number(r) > 0 || r?.count) console.log(`  ลบ ${t.table_name} (ตาม prospect): ${r.count ?? r}`);
  } catch (e) { console.log(`  ⚠ ${t.table_name}: ${String(e.message).slice(0,90)}`); }
}

// 2) ตารางอื่นที่อ้าง prospect ด้วยชื่อคอลัมน์อื่น
for (const [name, fn] of [
  ['Unsubscribe', () => prisma.unsubscribe.deleteMany({})],
  ['EngagementScore', () => prisma.engagementScore.deleteMany({})],
  ['Recommendation', () => prisma.recommendation.deleteMany({})],
  ['AgentTask', () => prisma.agentTask.deleteMany({})],
  ['Appointment', () => prisma.appointment.deleteMany({})],
  ['SupportMessage', () => prisma.supportMessage.deleteMany({})],
  ['SupportTicket', () => prisma.supportTicket.deleteMany({})],
  ['Notification', () => prisma.notification.deleteMany({})],
  ['PlacementRun', () => prisma.placementRun.deleteMany({})],
]) {
  try { const r = await fn(); if (r.count) console.log(`  ลบ ${name}: ${r.count}`); } catch (e) { console.log(`  ⚠ ${name}: ${String(e.message).slice(0,90)}`); }
}

// 3) ลบ prospect
const pr = await prisma.prospect.deleteMany({});
console.log(`  ลบ Prospect: ${pr.count}`);

console.log('\n=== หลังล้าง ===');
for (const [name, fn] of [
  ['users', () => prisma.user.count()],
  ['prospect', () => prisma.prospect.count()],
  ['agentTask', () => prisma.agentTask.count()],
  ['supportTicket', () => prisma.supportTicket.count()],
  ['notification', () => prisma.notification.count()],
  ['appointment', () => prisma.appointment.count()],
  ['visitor', () => prisma.visitor.count()],
  ['visitorEvent', () => prisma.visitorEvent.count()],
  ['engagementScore', () => prisma.engagementScore.count()],
  ['placementRun', () => prisma.placementRun.count()],
  ['placementRunEntry', () => prisma.placementRunEntry.count()],
  ['treeNode', () => prisma.treeNode.count()],
  ['receiptFile', () => prisma.receiptFile.count()],
  ['performanceLedger', () => prisma.performanceLedger.count()],
  ['video', () => prisma.video.count()],
  ['auditLog', () => prisma.auditLog.count()],
  ['eventOutbox', () => prisma.eventOutbox.count()],
]) { try { console.log(`  ${name}: ${await fn()}`); } catch {} }
await prisma.$disconnect();
