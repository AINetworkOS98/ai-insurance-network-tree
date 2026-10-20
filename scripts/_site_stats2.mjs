import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const byType = await prisma.visitorEvent.groupBy({ by: ['eventType'], _count: { _all: true } }).catch(async () => {
  return prisma.visitorEvent.groupBy({ by: ['type'], _count: { _all: true } }).catch(() => []);
});
const prof = await prisma.memberProfile.count().catch(() => -1);
const prosp = await prisma.prospect.count().catch(() => -1);
const usersByStatus = await prisma.user.groupBy({ by: ['status'], _count: { _all: true } });
console.log(JSON.stringify({ byType, memberProfiles: prof, prospects: prosp, usersByStatus }, null, 1));
await prisma.$disconnect();
