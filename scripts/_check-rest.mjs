// ตรวจที่มาข้อมูลที่เหลือ (read-only)
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';
const env = Object.fromEntries(
  fs.readFileSync(new URL('../.env.vercel.pull', import.meta.url), 'utf8')
    .split(/\r?\n/).filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, '')]; })
);
const prisma = new PrismaClient({ datasources: { db: { url: env.POSTGRES_URL_NON_POOLING } } });

console.log('=== SupportTicket (13) ===');
for (const t of await prisma.supportTicket.findMany({ select: { subject:true, name:true, status:true, createdAt:true, userId:true }, orderBy:{ createdAt:'desc' } })) {
  console.log(`  "${String(t.subject).slice(0,50)}" | ${t.name} | ${t.status} | ${t.createdAt.toISOString().slice(0,10)}`);
}

console.log('\n=== Notification (12) ===');
for (const n of await prisma.notification.findMany({ select: { type:true, title:true, createdAt:true }, orderBy:{ createdAt:'desc' } })) {
  console.log(`  ${n.type} | ${String(n.title).slice(0,45)} | ${n.createdAt.toISOString().slice(0,10)}`);
}

console.log('\n=== AgentTask (6) ===');
for (const a of await prisma.agentTask.findMany({ select: { type:true, title:true, status:true, createdAt:true } })) {
  console.log(`  ${a.type} | ${String(a.title).slice(0,45)} | ${a.status} | ${a.createdAt.toISOString().slice(0,10)}`);
}

console.log('\n=== PlacementRun (141) — 5 ล่าสุด ===');
for (const r of await prisma.placementRun.findMany({ select: { jobId:true, status:true, createdAt:true }, orderBy:{ createdAt:'desc' }, take:5 })) {
  console.log(`  ${r.jobId} | ${r.status} | ${r.createdAt.toISOString()}`);
}

console.log('\n=== EventOutbox 1215 — แยก channel/status ===');
for (const g of await prisma.eventOutbox.groupBy({ by:['channel','status'], _count:{ _all:true } })) {
  console.log(`  ${g.channel}/${g.status}: ${g._count._all}`);
}

console.log('\n=== Video (53) ===');
const v = await prisma.video.findMany({ select: { videoId:true, title:true, status:true, topic:true }, take: 6, orderBy:{ createdAt:'desc' } });
for (const x of v) console.log(`  ${x.videoId} | ${String(x.title).slice(0,40)} | ${x.status} | ${x.topic ?? '-'}`);
console.log(`  ทั้งหมด: ${await prisma.video.count()}`);
await prisma.$disconnect();
