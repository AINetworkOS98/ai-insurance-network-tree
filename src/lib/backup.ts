import { prisma } from '@/lib/prisma';
import { getDb } from '@/lib/firebase-admin';

// สำรองข้อมูลสมาชิกและธุรกรรมลง Firestore ตลอดเวลา + กู้คืนเมื่อฐานหลักล่ม
// - backup: ดึงตารางหลัก (ตัด secret) เก็บ backups/{stamp} + ชี้ backups/latest
// - restoreMissing: เติมเฉพาะแถวที่หายไป (ไม่เขียนทับของใหม่)
// - health: ตรวจ Postgres + Firestore + สำรองล่าสุด

const USER_SAFE_SELECT = {
  id:true, email:true, emailVerified:true, phone:true, firstName:true, lastName:true, displayName:true,
  province:true, district:true, subdistrict:true, addressLine:true, zipCode:true, lineId:true,
  facebookUrl:true, tiktokUrl:true, branch:true, avatarUrl:true, sponsorId:true, placementParentId:true,
  managerId:true, memberCode:true, referralCode:true, status:true, rankLevel:true, rankUpdatedAt:true,
  createdAt:true, approvedAt:true, updatedAt:true,
} as any;

export async function runBackup(){
  const at = new Date();
  const stamp = at.toISOString().slice(0,16).replace(/[-:T]/g,'');
  const counts: Record<string, number> = {};
  const payload: Record<string, any[]> = {};
  const clean = (rows:any[]) => JSON.parse(JSON.stringify(rows));
  try{
    const jobs: Array<[string, Promise<any[]>]> = [
      ['users', (prisma as any).user.findMany({ select: USER_SAFE_SELECT })],
      ['authIdentities', (prisma as any).authIdentity.findMany()],
      ['sponsorships', (prisma as any).sponsorship.findMany()],
      ['treeNodes', (prisma as any).treeNode.findMany()],
      ['treePlacements', (prisma as any).treePlacement.findMany()],
      ['receiptFiles', (prisma as any).receiptFile.findMany({ select:{ id:true, userId:true, originalName:true, mimeType:true, sizeBytes:true, fileHash:true, status:true, submissionAt:true, verifiedAt:true, creditedPeriod:true, createdAt:true } })],
      ['receiptExtractions', (prisma as any).receiptExtraction.findMany()],
      ['performanceLedger', (prisma as any).performanceLedger.findMany()],
      ['incomeTransactions', (prisma as any).incomeTransaction.findMany({ select:{ id:true, transactionId:true, userId:true, policyRef:true, type:true, period:true, grossAmount:true, netAmount:true, status:true, occurredAt:true, createdAt:true } })],
      ['monthlySnapshots', (prisma as any).monthlySnapshot.findMany()],
      ['rankHistories', (prisma as any).rankHistory.findMany()],
      ['maintenanceResults', (prisma as any).maintenanceResult.findMany()],
      ['commissionTables', (prisma as any).commissionTable.findMany()],
      ['calendarPeriods', (prisma as any).calendarPeriod.findMany()],
    ];
    for(const [name, p] of jobs){
      try{
        const rows = clean(await p);
        payload[name] = rows;
        counts[name] = rows.length;
      }catch(e:any){ counts[name] = -1; }
    }
    const db = getDb();
    const doc = { stamp, at: at.toISOString(), counts, data: payload };
    await db.collection('backups').doc(stamp).set(doc);
    await db.collection('backups').doc('latest').set({ stamp, at: at.toISOString(), counts });
    await prisma.auditLog.create({ data:{ action:'system.backup', entity:'Backup', entityId: stamp, newValue:{ counts } as any } }).catch(()=>null);
    return { ok:true as const, stamp, counts };
  }catch(e:any){
    return { ok:false as const, error: e?.message || 'backup failed', counts };
  }
}

export async function restoreMissing(stamp?: string){
  // เติมเฉพาะแถวที่ไม่มีในฐานหลัก (กันเขียนทับข้อมูลใหม่)
  const db = getDb();
  const ref = stamp ? db.collection('backups').doc(stamp) : db.collection('backups').doc('latest');
  let targetStamp = stamp;
  if(!targetStamp){
    const latest = await ref.get().catch(()=>null);
    targetStamp = (latest as any)?.data?.()?.stamp;
    if(!targetStamp) return { ok:false as const, error:'ไม่มีข้อมูลสำรอง' };
  }
  const snap = await db.collection('backups').doc(targetStamp!).get().catch(()=>null);
  const data = (snap as any)?.data?.()?.data;
  if(!data) return { ok:false as const, error:'ไม่พบข้อมูลสำรอง' };
  const restored: Record<string, number> = {};
  const putMissing = async (model: string, rows: any[], uniqueKey = 'id') => {
    let n = 0;
    for(const r of rows || []){
      try{
        const where: any = { [uniqueKey]: r[uniqueKey] };
        const exists = await (prisma as any)[model].findUnique({ where }).catch(()=>null);
        if(!exists){
          const { _mirroredAt, _source, ...cleanRow } = r;
          await (prisma as any)[model].create({ data: cleanRow }).catch(()=>null);
          n++;
        }
      }catch{}
    }
    restored[model] = n;
  };
  // ลำดับ FK: user ก่อน, ที่เหลือตาม
  await putMissing('user', data.users);
  await putMissing('authIdentity', data.authIdentities);
  await putMissing('sponsorship', data.sponsorships);
  await putMissing('treeNode', data.treeNodes);
  await putMissing('treePlacement', data.treePlacements);
  await putMissing('receiptFile', data.receiptFiles);
  await putMissing('receiptExtraction', data.receiptExtractions);
  await putMissing('performanceLedger', data.performanceLedger);
  await putMissing('incomeTransaction', data.incomeTransactions, 'transactionId');
  await putMissing('monthlySnapshot', data.monthlySnapshots);
  await putMissing('rankHistory', data.rankHistories);
  await putMissing('maintenanceResult', data.maintenanceResults);
  await putMissing('commissionTable', data.commissionTables, 'version');
  await putMissing('calendarPeriod', data.calendarPeriods, 'period');
  await prisma.auditLog.create({ data:{ action:'system.restore', entity:'Backup', entityId: targetStamp!, newValue:{ restored } as any } }).catch(()=>null);
  return { ok:true as const, stamp: targetStamp, restored };
}

export async function systemHealth(){
  const out: any = { at: new Date().toISOString(), db:'unknown', firestore:'unknown', lastBackup:null as any };
  try{
    await (prisma as any).user.count();
    out.db = 'up';
  }catch(e:any){ out.db = 'down'; out.dbError = e?.message; }
  try{
    const db = getDb();
    await db.collection('backups').doc('latest').get();
    out.firestore = 'up';
    const latest: any = await db.collection('backups').doc('latest').get().catch(()=>null);
    const d = (latest as any)?.data?.();
    if(d) out.lastBackup = { stamp: d.stamp, at: d.at, counts: d.counts };
  }catch(e:any){ out.firestore = 'down'; out.firestoreError = e?.message; }
  return out;
}
