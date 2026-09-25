import { prisma } from '@/lib/prisma';

// หมวด 8: ตัดยอด Asia/Bangkok — มกราคม-ธันวาคม, 00:00 แรกเดือนถึง 00:00 เดือนถัดไป
// แสดง พ.ศ. ได้ แต่เก็บ UTC

function bangkokOffsetMs(){ return 7 * 60 * 60 * 1000; }

export function monthBounds(period: string){
  // period YYYY-MM
  const [y,m] = period.split('-').map(Number);
  // 00:00 แรกเดือน Bangkok -> UTC
  const startBangkok = Date.UTC(y, m-1, 1, 0,0,0) - bangkokOffsetMs(); // จริงๆต้อง +7h -> UTC = BKK -7h
  // แต่ UTC ที่ตรงกับ BKK 00:00 คือ UTC ก่อนหน้า 17:00 วันก่อนหน้า
  // ง่าย: สร้าง Date UTC แล้วลบ 7 ชม
  const startAt = new Date(Date.UTC(y, m-1, 1, 0,0,0) - bangkokOffsetMs());
  // เดือนถัดไป
  const ny = m===12 ? y+1 : y;
  const nm = m===12 ? 1 : m+1;
  const endAt = new Date(Date.UTC(ny, nm-1, 1, 0,0,0) - bangkokOffsetMs());
  return { startAt, endAt };
}

export function toBangkokLabel(period: string){
  const [y,m] = period.split('-').map(Number);
  return `${m}/${y+543}`;
}

export function currentPeriod(): string {
  const now = new Date(Date.now() + bangkokOffsetMs());
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth()+1;
  return `${y}-${String(m).padStart(2,'0')}`;
}

export async function ensurePeriod(period: string){
  let cal: any = await prisma.calendarPeriod.findUnique({ where:{ period } });
  if(cal) return cal;
  const { startAt, endAt } = monthBounds(period);
  cal = await prisma.calendarPeriod.create({ data:{ period, startAt, endAt, status:'Open' } as any });
  return cal;
}

export function getBangkokPeriod(d: Date = new Date()){
  const b = new Date(d.getTime() + bangkokOffsetMs());
  return `${b.getUTCFullYear()}-${String(b.getUTCMonth()+1).padStart(2,'0')}`;
}

// เดือนก่อนหน้า (YYYY-MM)
export function previousPeriod(period?: string){
  const base = period || currentPeriod();
  const [y,m] = base.split('-').map(Number);
  const d = new Date(Date.UTC(y, m-1, 1));
  d.setUTCMonth(d.getUTCMonth() - 1);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
}

const TH_MONTHS = ['มกราคม','กุมภาพันธ์','มีนาคม','เมษายน','พฤษภาคม','มิถุนายน','กรกฎาคม','สิงหาคม','กันยายน','ตุลาคม','พฤศจิกายน','ธันวาคม'];

// ป้าย พ.ศ. เต็ม: "กันยายน 2569" — วันสิ้นเดือนถือปีพุทธศักราช
export function toBuddhistLabel(period: string){
  const [y,m] = period.split('-').map(Number);
  if(!y || !m) return period;
  return `${TH_MONTHS[m-1]} ${y+543}`;
}

// ตารางตัดยอดสิ้นเดือนล่วงหน้า n เดือน: period + cutoff (Bangkok month-end) + ป้าย พ.ศ.
export function monthEndSchedule(n: number = 12){
  const tmp: Array<{ period:string; label:string; cutoffBangkok:string; cutoffAt:string }> = [];
  const [cy,cm] = currentPeriod().split('-').map(Number);
  for(let i=0; i<n; i++){
    const d = new Date(Date.UTC(cy, cm-1+i, 1));
    const y = d.getUTCFullYear();
    const m = d.getUTCMonth()+1;
    const period = `${y}-${String(m).padStart(2,'0')}`;
    const { endAt } = monthBounds(period);
    const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    tmp.push({
      period,
      label: toBuddhistLabel(period),
      cutoffBangkok: `${lastDay} ${TH_MONTHS[m-1]} ${y+543} 24:00 น. (เที่ยงคืนสิ้นเดือน)`,
      cutoffAt: endAt.toISOString(),
    });
  }
  // เรียงจากเดือนปัจจุบันไปอนาคต (ปัจจุบันอยู่บนสุด)
  return tmp;
}

// ปิดยอด: สร้าง snapshot ทุกคน — เรียกซ้ำได้ไม่ลงซ้ำ (idempotent)
export async function closePeriodJob(period: string, closedBy?: string){
  const cal: any = await ensurePeriod(period);
  if(cal.status==='Closed'){
    const snaps = await prisma.monthlySnapshot.count({ where:{ period } });
    return { ok:true as const, alreadyClosed:true, snapshots: snaps };
  }
  // ถ้ายัง Open -> เปลี่ยนเป็น PendingFinalization แล้วรอ cutoff / ตรวจ pending
  // สร้าง snapshot จาก PerformanceLedger ที่ verified ใน period
  const users: any[] = await prisma.user.findMany({ select:{ id:true, rankLevel:true } });
  const plan: any = await prisma.rankPlan.findFirst({ where:{ status:'Active' } });

  let created = 0;
  for(const u of users){
    const already: any = await prisma.monthlySnapshot.findUnique({ where:{ period_userId: { period, userId: u.id } } as any });
    if(already) continue;
    const ledgers: any[] = await prisma.performanceLedger.findMany({ where:{ userId: u.id, period, status:'active' } });
    const verifiedAmount = ledgers.reduce((s:any,r:any)=> s + Number(r.amount), 0);
    // pending = receipt ที่ uploaded/extracted/pendingVerification ใน period นั้น
    const pendingReceipts: any = await prisma.receiptFile.count({ where:{ userId: u.id, status:{ in:['Uploaded','Extracted','PendingVerification'] } } });
    const pendingAmount = 0; // ประมาณ — คำนวณจาก extraction amount ที่ยังไม่ verified ถ้ามี
    await prisma.monthlySnapshot.create({
      data:{
        period, userId: u.id, rankLevel: u.rankLevel ?? 0, planVersion: plan?.version || null,
        verifiedAmount, pendingAmount, rejectedAmount: 0, remainingToTarget: null,
        snapshot:{ planVersion: plan?.version || null, rankLevel: u.rankLevel, closedAt: new Date().toISOString() } as any
      } as any
    });
    created++;
  }
  await prisma.calendarPeriod.update({ where:{ period }, data:{ status:'Closed' } as any });
  await prisma.auditLog.create({ data:{ userId: closedBy || null, action:'period.closed', entity:'CalendarPeriod', entityId: period, newValue:{ period, snapshots: created } as any } as any });
  return { ok:true as const, alreadyClosed:false, snapshots: created };
}
