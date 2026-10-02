import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET /api/referral/verify?code=R-XXXXXX — แสดงชื่อผู้แนะนำก่อนสมัคร (สเปคหมวด 4)
export async function GET(req: NextRequest){
  const { searchParams } = new URL(req.url);
  const code = String(searchParams.get('code')||'').trim().toUpperCase();
  if(!code) return NextResponse.json({ ok:false, error:'กรุณาระบุรหัสแนะนำ' }, { status:400 });

  try{
    // หาจาก User.referralCode ก่อน (เร็ว) แล้วค่อย ReferralCode table
    let user = await prisma.user.findUnique({ where:{ referralCode: code }, select:{ id:true, displayName:true, firstName:true, lastName:true, referralCode:true, memberCode:true, status:true } });
    if(!user){
      const rc = await prisma.referralCode.findUnique({ where:{ code }, include:{ user:{ select:{ id:true, displayName:true, firstName:true, lastName:true, referralCode:true, memberCode:true, status:true } } } });
      user = rc?.user || null;
    }
    if(!user){
      return NextResponse.json({ ok:false, error:'รหัสแนะนำไม่ถูกต้องหรือหมดอายุ', valid:false }, { status:404 });
    }
    if(user.status === 'SUSPENDED' || user.status === 'RESIGNED'){
      return NextResponse.json({ ok:false, error:'ผู้แนะนำนี้ไม่สามารถรับการแนะนำได้ในขณะนี้', valid:false }, { status:403 });
    }
    // เช็ค isActive ใน ReferralCode table
    const rcActive = await prisma.referralCode.findUnique({ where:{ code } }).catch(()=>null);
    if(rcActive && !rcActive.isActive){
      return NextResponse.json({ ok:false, error:'รหัสแนะนำนี้ถูกปิดการใช้งาน', valid:false }, { status:403 });
    }

    return NextResponse.json({
      ok:true, valid:true,
      sponsor:{ id: user.id, displayName: user.displayName || `${user.firstName} ${user.lastName}`, memberCode: user.memberCode, referralCode: user.referralCode }
    });
  }catch(e:any){
    console.error('referral verify', e);
    return NextResponse.json({ ok:false, error:'เกิดข้อผิดพลาด' }, { status:500 });
  }
}
