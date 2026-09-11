import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashToken, hashPassword } from '@/lib/auth';

// POST /api/auth/reset-password {token, email, newPassword}
export async function POST(req: NextRequest){
  try{
    const { token, email, newPassword } = await req.json();
    if(!token || !newPassword) return NextResponse.json({ ok:false, error:'ข้อมูลไม่ครบ' }, { status:400 });
    if(String(newPassword).length < 8) return NextResponse.json({ ok:false, error:'รหัสผ่านต้องมีอย่างน้อย 8 อักขระ' }, { status:400 });

    const hash = hashToken(String(token));
    const record = await prisma.passwordResetToken.findUnique({ where:{ tokenHash: hash } });
    if(!record) return NextResponse.json({ ok:false, error:'โทเค็นไม่ถูกต้อง' }, { status:400 });
    if(record.usedAt) return NextResponse.json({ ok:false, error:'โทเค็นถูกใช้งานแล้ว' }, { status:400 });
    if(record.expiresAt < new Date()) return NextResponse.json({ ok:false, error:'โทเค็นหมดอายุ — กรุณาขอใหม่' }, { status:400 });

    // ยกเลิก session ทั้งหมดที่ค้างอยู่ (สเปค: เปลี่ยนรหัสต้องยกเลิก session เดิม)
    const pwdHash = await hashPassword(String(newPassword));
    await prisma.$transaction([
      prisma.user.update({ where:{ id: record.userId }, data:{ passwordHash: pwdHash } }),
      prisma.passwordResetToken.update({ where:{ tokenHash: hash }, data:{ usedAt: new Date() } }),
      prisma.userSession.deleteMany({ where:{ userId: record.userId } }),
    ]);
    await prisma.auditLog.create({ data:{ userId: record.userId, action:'password.reset', entity:'User', entityId: record.userId } });

    return NextResponse.json({ ok:true, message:'ตั้งรหัสผ่านใหม่สำเร็จ — เข้าสู่ระบบด้วยรหัสใหม่ได้ทันที' });
  }catch(e:any){
    console.error('reset-password', e);
    return NextResponse.json({ ok:false, error:'เกิดข้อผิดพลาด' }, { status:500 });
  }
}
