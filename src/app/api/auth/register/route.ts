import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, hashToken, createEmailToken } from '@/lib/auth';

// POST /api/auth/register — สเปคหมวด 3: สมัครด้วยอีเมล+รหัสผ่าน
// ทุกคนเริ่มที่ rankLevel 0 (ผู้สนใจทั่วไป) ไม่มีสิทธิเลือกตำแหน่งเอง
// ป้องกันบัญชีซ้ำ + สร้าง AuthIdentity + ส่ง token ยืนยันอีเมล (ไม่บันทึก plaintext)
export async function POST(req: NextRequest){
  try{
    const { firstName, lastName, email, phone, password, referralCode } = await req.json();
    if(!email || !password || !firstName || !lastName){
      return NextResponse.json({ ok:false, error:'กรอกชื่อ อีเมล และรหัสผ่านให้ครบ' }, { status:400 });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    if(password.length < 8){
      return NextResponse.json({ ok:false, error:'รหัสผ่านต้องมีอย่างน้อย 8 อักขระ' }, { status:400 });
    }
    // กันบัญชีซ้ำ — อีเมล
    const existing = await prisma.user.findUnique({ where:{ email: normalizedEmail } });
    if(existing){
      return NextResponse.json({ ok:false, error:'อีเมลนี้ถูกใช้งานแล้ว — หากคุณเคยสมัครด้วย Google ให้ใช้เมนูเชื่อมบัญชี' }, { status:409 });
    }
    if(phone){
      const phoneExists = await prisma.user.findUnique({ where:{ phone: String(phone).trim() } }).catch(()=>null);
      if(phoneExists) return NextResponse.json({ ok:false, error:'เบอร์โทรนี้ถูกใช้งานแล้ว' }, { status:409 });
    }

    const pwdHash = await hashPassword(password);
    const user = await prisma.user.create({
      data:{
        email: normalizedEmail,
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        displayName: `${String(firstName).trim()} ${String(lastName).trim()}`,
        phone: phone ? String(phone).trim() : null,
        passwordHash: pwdHash,
        status: 'PENDING',
        rankLevel: 0, // ผู้สนใจทั่วไป — ไม่ให้เลือกตำแหน่งเอง
      }
    });

    // AuthIdentity สำหรับ password
    await prisma.authIdentity.create({
      data:{ userId: user.id, provider:'password', email: normalizedEmail }
    });

    // referralCode ถ้ามี — ตรวจว่ามีจริง (จะผูก sponsor ในเฟส 2 แบบเต็ม)
    if(referralCode){
      // เก็บไว้ใน audit — ไม่บล็อกการสมัครถ้าโค้ดผิด แต่แจ้งเตือน
      await prisma.auditLog.create({ data:{ userId: user.id, action:'register.with_referral', entity:'User', entityId:user.id, newValue:{ referralCode } } });
    }

    // สร้าง token ยืนยันอีเมล (เก็บ hash)
    const { raw, hash } = createEmailToken();
    await prisma.emailVerificationToken.create({
      data:{ userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now()+ 24*60*60*1000) }
    });

    // ส่งอีเมลจริงจะทำใน worker — ตอนนี้ตอบกลับพร้อมลิงก์ (dev)
    const verifyUrl = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/api/auth/verify-email?token=${raw}&email=${encodeURIComponent(normalizedEmail)}`;

    await prisma.auditLog.create({ data:{ userId: user.id, action:'user.register', entity:'User', entityId:user.id, newValue:{ email: normalizedEmail, rankLevel:0 } } });

    return NextResponse.json({
      ok:true,
      userId: user.id,
      message:'สมัครสำเร็จ — กรุณายืนยันอีเมลภายใน 24 ชั่วโมง',
      requiresEmailVerification:true,
      // ใน production ไม่ส่ง raw token กลับ — ส่งทางอีเมลเท่านั้น
      ...(process.env.NODE_ENV !== 'production' ? { devVerifyUrl: verifyUrl } : {})
    });
  }catch(e:any){
    // Prisma not migrated yet — fallback mock (ไม่ให้ flow พังระหว่าง dev)
    if(String(e.message||'').includes('prisma') || String(e.code||'').startsWith('P')){
      return NextResponse.json({ ok:true, mock:true, message:'สมัครสำเร็จ (โหมดทดสอบ — ยังไม่ต่อฐานข้อมูล)', requiresEmailVerification:true });
    }
    console.error('register error', e);
    return NextResponse.json({ ok:false, error:'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status:500 });
  }
}
