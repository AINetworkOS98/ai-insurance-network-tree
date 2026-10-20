import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

const users = await prisma.user.count();
const active = await prisma.user.count({ where: { status: 'ACTIVE' } });
const ranked = await prisma.user.count({ where: { rankLevel: { gt: 0 } } });

const v = await prisma.visitor.aggregate({ _count: { _all: true }, _sum: { totalVisits: true, totalEvents: true } });
let pageViews = 0;
try { pageViews = await prisma.visitorEvent.count(); } catch (e) { pageViews = -1; }

console.log(JSON.stringify({
  members: { total: users, active, ranked },
  visitors: {
    unique: v._count._all,
    sumTotalVisits: v._sum.totalVisits,
    sumTotalEvents: v._sum.totalEvents,
    withFirstVisit: (v._sum.totalVisits || 0) + v._count._all,
    visitorEvents: pageViews,
  },
}, null, 1));
await prisma.$disconnect();
