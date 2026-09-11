import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { generateMemberCode, generateReferralCode, referralLink } from '@/lib/referral';

// GET /api/referral — ดูรหัสของตนเอง + ลิงก์ + QR data + รายชื่อที่แนะนำ
export async function GET(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.headers.get('authorization')?.replace('Bearer ','') || '';
    if(!token) return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    const payload = verifyToken(token);
    if(!payload) return NextResponse.json({ ok:false, error:'เซสชันหมดอายุ' }, { status:401 });
    const userId = (payload as any).sub;

    // สร้างรหัส auto ถ้ายังไม่มี (unique constraint กันซ้ำฝั่ง DB + retry)
    let user = await prisma.user.findUnique({ where:{ id: userId } });
    if(!user) return NextResponse.json({ ok:false, error:'ไม่พบผู้ใช้' }, { status:404 });

    // สร้าง memberCode/referralCode ถ้ายังไม่มี
    for(let attempt=0; attempt<3; attempt++){
      try{
        if(!user.memberCode || !user.referralCode){
          const updates: any = {};
          if(!user.memberCode) updates.memberCode = generateMemberCode();
          if(!user.referralCode) updates.referralCode = generateReferralCode();
          user = await prisma.user.update({ where:{ id: userId }, data: updates });
          // สร้าง ReferralCode record ด้วย
          if(updates.referralCode){
            await prisma.referralCode.create({ data:{ userId, code: updates.referralCode } }).catch(()=>null);
          }
        } else {
          // sync ReferralCode table
          await prisma.referralCode.upsert({
            where:{ userId }, update:{ code: user.referralCode },
            create:{ userId, code: user.referralCode }
          }).catch(()=>null);
        }
        break;
      }catch(e:any){
        if(String(e.code) === 'P2002' && attempt < 2) continue;
        throw e;
      }
    }

    const baseUrl = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const link = user!.referralCode ? referralLink(baseUrl, user!.referralCode) : null;

    // รายชื่อที่แนะนำ (sponsored)
    const sponsored = await prisma.user.findMany({
      where:{ sponsorId: userId },
      select:{ id:true, displayName:true, firstName:true, lastName:true, memberCode:true, referralCode:true, rankLevel:true, status:true, createdAt:true },
      orderBy:{ createdAt:'desc' }, take:50
    });

    // นับทั้งหมด
    const totalSponsored = await prisma.user.count({ where:{ sponsorId: userId } });

    return NextResponse.json({
      ok:true,
      memberCode: user!.memberCode,
      referralCode: user!.referralCode,
      referralLink: link,
      // QR ให้ frontend สร้างจาก link ด้วย <qrcode> lib (ไม่ต้องส่งรูปจาก server)
      sponsored,
      totalSponsored,
      // สเปค: อนุญาตให้ผู้สนใจทั่วไปมีรหัสแนะนำได้ แต่ไม่ทำให้ได้สถานะ/ผลตอบแทนอัตโนมัติ
      note: 'การมีรหัสแนะนำไม่ทำให้ได้รับสถานะตัวแทนหรือผลตอบแทนอัตโนมัติ — ต้องผ่านการอนุมัติตามเกณฑ์',
    });
  }catch(e:any){
    console.error('referral GET', e);
    return NextResponse.json({ ok:false, error:'เกิดข้อผิดพลาด' }, { status:500 });
  }
}
