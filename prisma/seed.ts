import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main(){
  console.log('Seeding demo data — ติดป้าย ข้อมูลทดลอง');
  // Roles
  const perms = ['dashboard.view','prospect.view','member.view_own','tree.view_own','income.view_own'];
  for(const p of perms){
    await prisma.permission.upsert({ where:{key:p}, update:{}, create:{key:p, nameTh:p, category:p.split('.')[0]} });
  }
  const role = await prisma.role.upsert({ where:{code:'member'}, update:{}, create:{code:'member', nameTh:'สมาชิกทั่วไป', priority:10} });
  console.log('Seed done', role.code);
}
main().finally(()=>prisma.$disconnect());
