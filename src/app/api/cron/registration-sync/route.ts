import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cronAuth';

// POST/GET /api/cron/registration-sync
// Worker ประมวลผล EventOutbox ช่องทาง 'registration' (eventType member.registered)
// เรียกได้จาก Vercel Cron หรือ n8n (ทุก 1 นาที) — ต้องมี Authorization: Bearer $CRON_SECRET
// Idempotent: eventId เป็น unique, ประมวลผลซ้ำไม่สร้างผลข้างเคียงซ้ำ

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BATCH = 25;

async function run(req: NextRequest){
  const denied = requireCronAuth(req);
  if(denied) return denied;

  const now = new Date().toISOString();
  let processed = 0, failed = 0, skipped = 0;

  try{
    const { prisma } = await import('@/lib/prisma');
    const { emitNotification, notifyAdmins } = await import('@/lib/notify');

    const pending: any[] = await (prisma as any).eventOutbox.findMany({
      where: { channel: 'registration', status: 'pending' },
      orderBy: { createdAt: 'asc' },
      take: BATCH,
    }).catch(()=>[]);

    for(const ev of pending){
      const payload: any = ev.payload || {};
      const userId: string | undefined = payload.userId;
      if(!userId){ skipped++; continue; }

      try{
        const user: any = await (prisma as any).user.findUnique({ where:{ id: userId } });
        if(!user){
          await (prisma as any).eventOutbox.update({ where:{ id: ev.id }, data:{ status:'failed', attempts:{ increment:1 }, sentAt: new Date() } }).catch(()=>null);
          failed++;
          continue;
        }

        const nm = user.displayName || `${user.firstName || ''} ${user.lastName || ''}`.trim();

        // ยืนยันว่ามี consent log ครบ (PDPA) — เติมให้ถ้าหาย (idempotent, unique ต่อ type)
        const pdpa: any = await (prisma as any).consentRecord.findFirst({ where:{ userId, type:'PDPA' } }).catch(()=>null);
        if(!pdpa){
          await (prisma as any).consentRecord.create({
            data:{ userId, type:'PDPA', version:'1.0', granted:true, source:'registration-sync' }
          }).catch(()=>null);
        }

        // แจ้งเตือนผู้แนะนำ + ผู้ดูแลระบบ (best-effort — ผู้ใช้มีอยู่จริงแล้ว)
        if(user.sponsorId){
          await emitNotification({ userId: user.sponsorId, type:'new_downline', title:'มีสมาชิกใหม่ในสายงาน', body:`${nm} สมัครสมาชิกสำเร็จ`, referenceId:'/members' }).catch(()=>null);
        }
        await notifyAdmins({ type:'member_registered', title:'สมาชิกสมัครใหม่', body:`${nm} (${user.email})`, referenceId:'/admin/members' }).catch(()=>null);

        // ส่งต่อไป n8n webhook ปลายทาง (ถ้าตั้งไว้) — ไม่บล็อกผลลัพธ์
        const hook = process.env.N8N_REGISTRATION_WEBHOOK_URL;
        if(hook){
          try{
            await fetch(hook, {
              method:'POST',
              headers:{ 'Content-Type':'application/json' },
              body: JSON.stringify({ eventId: ev.eventId, eventType: ev.eventType, userId, memberCode: user.memberCode, status: user.status }),
              signal: AbortSignal.timeout(5000),
            });
          }catch{}
        }

        await (prisma as any).eventOutbox.update({ where:{ id: ev.id }, data:{ status:'sent', attempts:{ increment:1 }, sentAt: new Date() } });
        processed++;
      }catch(e:any){
        await (prisma as any).eventOutbox.update({ where:{ id: ev.id }, data:{ status:'failed', attempts:{ increment:1 }, sentAt: new Date() } }).catch(()=>null);
        failed++;
      }
    }

    return NextResponse.json({ ok:true, processed, failed, skipped, total: pending.length, at: now });
  }catch(e:any){
    return NextResponse.json({ ok:false, processed, failed, skipped, error: e?.message || 'unknown', at: now }, { status:500 });
  }
}

export async function POST(req: NextRequest){ return run(req); }
export async function GET(req: NextRequest){ return run(req); }