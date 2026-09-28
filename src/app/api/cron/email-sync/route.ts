import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cronAuth';

// POST/GET /api/cron/email-sync
// Worker ส่งอีเมลที่ค้างอยู่ในคิว EmailMessage (status=QUEUED) ผ่าน Resend
// เรียกโดย n8n ทุก 1 นาที (หรือ Vercel Cron) — ต้องมี Authorization: Bearer $CRON_SECRET
// Idempotent: ส่งแล้วเปลี่ยนสถานะเป็น SENT จึงไม่ส่งซ้ำ; ล้มเหลว -> FAILED พร้อมเหตุผล
// ความยินยอม: อีเมลการตลาดจะถูกระงับถ้าเจ้าของยังไม่ให้ความยินยอม MARKETING

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BATCH = 20;

// ผู้ใช้ยังยินยอมรับข่าวสารการตลาดอยู่หรือไม่ (ดูบันทึกล่าสุด)
async function hasMarketingConsent(prisma: any, userId?: string | null){
  if(!userId) return false;
  try{
    const rec: any = await prisma.consentRecord.findFirst({
      where:{ userId, type:'MARKETING' },
      orderBy:{ consentedAt: 'desc' },
    });
    return !!rec?.granted;
  }catch{ return false; }
}

// วินิจฉัยผู้ส่งอีเมล — บอกตรง ๆ ว่าส่งถึงสมาชิกจริงได้หรือยัง
async function providerStatus(){
  const { activeProvider, smtpConfigured, fromAddress } = await import('@/lib/mailer');
  const provider = activeProvider();
  const from = fromAddress();
  const domain = from.split('@')[1] || '';
  const info: any = { provider, from: from || null, fromDomain: domain || null, smtpConfigured: smtpConfigured() };

  if(provider === 'smtp'){
    info.hint = 'ส่งผ่าน SMTP — ส่งถึงผู้รับใดก็ได้ ไม่ต้อง verify โดเมน';

    return info;
  }
  if(provider === 'none'){
    info.hint = 'ยังไม่ได้ตั้งผู้ส่งเลย — ตั้ง SMTP_HOST/SMTP_USER/SMTP_PASS หรือ EMAIL_API_KEY/EMAIL_FROM_ADDRESS';
    return info;
  }

  // Resend: ต้อง verify โดเมนก่อนจึงส่งถึงคนอื่นได้
  const key = process.env.EMAIL_API_KEY || '';
  info.resendTestSender = domain === 'resend.dev';
  info.verifiedDomains = null;
  try{
    const r = await fetch('https://api.resend.com/domains', { headers:{ Authorization: `Bearer ${key}` } });
    if(r.ok){
      const d: any = await r.json();
      info.verifiedDomains = (d?.data || []).map((x: any)=> ({ name: x.name, status: x.status }));
    }
  }catch{ /* วินิจฉัยล้มเหลวไม่ควรทำให้ worker ล้ม */ }
  if(info.resendTestSender) info.hint = 'ผู้ส่งยังเป็น Resend โหมดทดสอบ — ส่งได้เฉพาะอีเมลเจ้าของบัญชี Resend; ต้อง verify โดเมนที่ resend.com/domains แล้วตั้ง EMAIL_FROM_ADDRESS เป็นอีเมลบนโดเมนนั้น (หรือตั้ง SMTP_HOST/SMTP_USER/SMTP_PASS เพื่อใช้ SMTP แทน)';
  return info;
}

async function run(req: NextRequest){
  const denied = requireCronAuth(req);
  if(denied) return denied;

  const at = new Date().toISOString();
  let sent = 0, failed = 0, suppressed = 0;
  let lastError: string | null = null;

  try{
    const { prisma } = await import('@/lib/prisma');
    const { sendMail } = await import('@/lib/mailer');

    const queued: any[] = await (prisma as any).emailMessage.findMany({
      where:{ OR:[ { status:'QUEUED' }, { status:'FAILED', attempts:{ lt: 3 } } ] },
      orderBy:{ queuedAt: 'asc' },
      take: BATCH,
    }).catch(()=>[]);

    for(const msg of queued){
      // กันส่งซ้ำ: จองสิทธิ์ด้วยการเปลี่ยนสถานะก่อน (ต้องตรงกับเงื่อนไขที่ select มา ไม่งั้นแถวที่ retry จะถูกข้าม)
      const claimed: any = await (prisma as any).emailMessage.updateMany({
        where:{ id: msg.id, status: msg.status },
        data:{ status: 'PROCESSING', attempts: { increment: 1 } },
      }).catch(()=> ({ count: 0 }));
      if(!claimed?.count) continue;

      const key = String(msg.eventId || msg.idempotencyKey || '');
      const isMarketing = key.startsWith('marketing.') || key.includes('marketing');

      // ระงับอีเมลการตลาดถ้าเจ้าของไม่ยินยอม
      if(isMarketing){
        const ok = await hasMarketingConsent(prisma, msg.toUserId);
        if(!ok){
          await (prisma as any).emailMessage.update({ where:{ id: msg.id }, data:{ status:'FAILED', error:'ไม่ส่ง: เจ้าของยังไม่ให้ความยินยอมด้านการตลาด' } }).catch(()=>null);
          suppressed++;
          continue;
        }
      }

      // ระงับรายชื่อที่ขอไม่รับอีเมล (suppression list)
      const blocked: any = await (prisma as any).emailSuppression.findUnique({ where:{ email: String(msg.toEmail).toLowerCase() } }).catch(()=>null);
      if(blocked){
        await (prisma as any).emailMessage.update({ where:{ id: msg.id }, data:{ status:'FAILED', error:'ไม่ส่ง: อยู่ในรายการระงับอีเมล' } }).catch(()=>null);
        suppressed++;
        continue;
      }

      const r = await sendMail({ to: msg.toEmail, subject: msg.subject, html: msg.bodyHtml });
      const now = new Date();
      await (prisma as any).emailMessage.update({
        where:{ id: msg.id },
        data: r.ok
          ? { status:'SENT', sentAt: now, error: null }
          : { status:'FAILED', error: String(r.error || 'send failed').slice(0, 900) },
      }).catch(()=>null);
      await (prisma as any).emailDeliveryLog.create({
        data:{ messageId: msg.id, status: r.ok ? 'SENT' : 'FAILED', providerResponse: r.ok ? `${r.provider}:accepted` : String(r.error||'').slice(0,500) },
      }).catch(()=>null);
      if(!r.ok){
        lastError = String(r.error || 'send failed').slice(0, 300);
        await (prisma as any).emailFailure.create({ data:{ messageId: msg.id, email: msg.toEmail, reason: String(r.error||'').slice(0,500) } }).catch(()=>null);
      }
      r.ok ? sent++ : failed++;
    }

    return NextResponse.json({ ok:true, sent, failed, suppressed, picked: queued.length, lastError, provider: await providerStatus(), at });
  }catch(e:any){
    return NextResponse.json({ ok:false, sent, failed, suppressed, error: e?.message || 'unknown', at }, { status:500 });
  }
}

export async function POST(req: NextRequest){ return run(req); }
export async function GET(req: NextRequest){ return run(req); }