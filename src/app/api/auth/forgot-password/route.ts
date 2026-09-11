import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashToken, createEmailToken } from '@/lib/auth';

// POST /api/auth/forgot-password {email}
export async function POST(req: NextRequest){
  try{
    const { email } = await req.json();
    const normalized = String(email||'').trim().toLowerCase();
    if(!normalized) return NextResponse.json({ ok:false, error:'กรุณากรอกอีเมล' }, { status:400 });

    const user = await prisma.user.findUnique({ where:{ email: normalized } });
    // ตอบเหมือนกันเสมอเพื่อไม่ให้เดาอีเมลได้
    if(!user){
      return NextResponse.json({ ok:true, message:'หากอีเมลนี้มีในระบบ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปแล้ว' });
    }

    const { raw, hash } = createEmailToken();
    await prisma.passwordResetToken.create({
      data:{ userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now()+ 60*60*1000) } // 1 ชม.
    });

    const resetUrl = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/reset-password?token=${raw}&email=${encodeURIComponent(normalized)}`;
    // TODO: ส่งอีเมลจริงผ่าน Resend queue — ตอนนี้ log ไว้
    console.log('[forgot-password] resetUrl for', normalized, resetUrl);
    await prisma.auditLog.create({ data:{ userId: user.id, action:'password.forgot', entity:'User', entityId:user.id } });

    return NextResponse.json({
      ok:true, message:'หากอีเมลนี้มีในระบบ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่ไปแล้ว',
      ...(process.env.NODE_ENV !== 'production' ? { devResetUrl: resetUrl } : {})
    });
  }catch(e:any){
    console.error('forgot-password', e);
    return NextResponse.json({ ok:true, message:'หากอีเมลนี้มีในระบบ เราได้ส่งลิงก์ไปแล้ว' });
  }
}
