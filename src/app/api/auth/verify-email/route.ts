import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashToken } from '@/lib/auth';

// GET /api/auth/verify-email?token=...&email=...  และ  POST {token,email}
export async function GET(req: NextRequest){
  const { searchParams } = new URL(req.url);
  return handleVerify(searchParams.get('token')||'', searchParams.get('email')||'');
}
export async function POST(req: NextRequest){
  const { token, email } = await req.json().catch(()=>({}));
  return handleVerify(String(token||''), String(email||''));
}

async function handleVerify(rawToken:string, email:string){
  if(!rawToken) return NextResponse.json({ ok:false, error:'โทเค็นไม่ถูกต้อง' }, { status:400 });
  const hash = hashToken(rawToken);
  try{
    const record = await prisma.emailVerificationToken.findUnique({ where:{ tokenHash: hash } });
    if(!record) return NextResponse.json({ ok:false, error:'โทเค็นไม่ถูกต้องหรือหมดอายุ' }, { status:400 });
    if(record.usedAt) return NextResponse.json({ ok:false, error:'โทเค็นนี้ถูกใช้งานแล้ว' }, { status:400 });
    if(record.expiresAt < new Date()) return NextResponse.json({ ok:false, error:'โทเค็นหมดอายุ — กรุณาขอใหม่' }, { status:400 });

    await prisma.$transaction([
      prisma.emailVerificationToken.update({ where:{ tokenHash: hash }, data:{ usedAt: new Date() } }),
      prisma.user.update({ where:{ id: record.userId }, data:{ emailVerified: true } }),
    ]);
    await prisma.auditLog.create({ data:{ userId: record.userId, action:'email.verified', entity:'User', entityId: record.userId } });
    return NextResponse.json({ ok:true, message:'ยืนยันอีเมลสำเร็จ — เข้าสู่ระบบได้ทันที' });
  }catch(e:any){
    console.error('verify-email', e);
    return NextResponse.json({ ok:false, error:'เกิดข้อผิดพลาด' }, { status:500 });
  }
}
