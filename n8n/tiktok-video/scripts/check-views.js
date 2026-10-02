// หลักฐานจากฐานข้อมูลจริง: แต่ละรอบดู "เล่นจนจบ" ไหม และรอบถัดไปเริ่มห่างจากรอบก่อนกี่วินาที
// ใช้ Prisma ของโปรเจกต์ (DATABASE_URL อ่านจาก .env.local)
const fs = require('fs');
const path = require('path');

const ENV = fs.readFileSync('C:/Users/User/ai-insurance-network-tree/.env.local', 'utf8');
const m = ENV.match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
if (m) process.env.DATABASE_URL = m[1];

const { PrismaClient } = require('C:/Users/User/ai-insurance-network-tree/node_modules/@prisma/client');
const prisma = new PrismaClient();

(async () => {
  const rows = await prisma.videoView.findMany({
    where: { startedAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
    orderBy: { startedAt: 'asc' },
    select: { id: true, videoId: true, sessionId: true, startedAt: true, endedAt: true, secondsWatched: true, completionPct: true, completed: true },
    take: 200,
  });

  const vids = await prisma.video.findMany({ select: { id: true, videoId: true, durationSec: true, topic: true } });
  const vmap = new Map(vids.map((v) => [v.id, v]));

  console.log('=== การดูใน 60 นาทีล่าสุด:', rows.length, 'รอบ ===');
  const bySess = {};
  rows.forEach((r) => { (bySess[r.sessionId] = bySess[r.sessionId] || []).push(r); });

  let completedCount = 0;
  let gaps = [];
  Object.entries(bySess).forEach(([sess, list]) => {
    console.log('\nsession ' + sess + ' (' + list.length + ' รอบ)');
    list.forEach((r, i) => {
      const v = vmap.get(r.videoId) || {};
      if (r.completed) completedCount++;
      const dur = v.durationSec || 0;
      const line = `  ${i + 1}. ${new Date(r.startedAt).toISOString().slice(11, 19)} → ${r.endedAt ? new Date(r.endedAt).toISOString().slice(11, 19) : '(ยังไม่จบ)'} | ${r.secondsWatched}s/${dur}s | ${r.completionPct}% | completed=${r.completed}`;
      console.log(line);
      const prev = list[i - 1];
      if (prev && prev.endedAt) {
        const gap = (new Date(r.startedAt) - new Date(prev.endedAt)) / 1000;
        if (Math.abs(gap) < 120) gaps.push(gap);
        console.log(`      ↳ เริ่มรอบใหม่ห่างจากรอบก่อน ${gap.toFixed(1)} วิ`);
      }
    });
  });
  const avg = gaps.length ? (gaps.reduce((a, b) => a + b, 0) / gaps.length) : 0;
  console.log('\nสรุป: รอบที่ดูจนจบ =', completedCount, '/', rows.length, '| ค่าเฉลี่ยเวลาต่อรอบใหม่ =', avg.toFixed(2), 'วิ (จาก', gaps.length, 'คู่)');
  await prisma.$disconnect();
  await new Promise((r) => setTimeout(r, 300));
})();
