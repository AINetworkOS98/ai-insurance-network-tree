import { NextRequest, NextResponse } from 'next/server';
import { verifyTokenEdge } from '@/lib/auth-edge';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest){
  const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value || req.headers.get('authorization')?.replace(/^Bearer\s+/i,'') || '';
  if(!token) return NextResponse.json({ ok:false, authed:false }, { status:401 });
  const payload = verifyTokenEdge(token);
  if(!payload) return NextResponse.json({ ok:false, authed:false }, { status:401 });
  if(['SUSPENDED','RESIGNED','INACTIVE'].includes(String(payload.status))) return NextResponse.json({ ok:false, authed:false, error:'suspended' }, { status:403 });
  // ดึงโปรไฟล์เต็มของตัวเองจากฐาน — หน้า settings ใช้เป็นฐานเดียวในการแสดง/บันทึก
  let profile: any = null;
  let consents: any[] = [];
  try{
    profile = await prisma.user.findUnique({
      where:{ id: String((payload as any).sub) },
      select:{ id:true, email:true, username:true, nickname:true, firstName:true, lastName:true, displayName:true, phone:true, occupation:true, province:true, district:true, subdistrict:true, addressLine:true, zipCode:true, lineId:true, facebookUrl:true, tiktokUrl:true, branch:true, memberCode:true, referralCode:true, status:true, rankLevel:true, pdpaConsentVersion:true, pdpaConsentedAt:true },
    });
    // รหัสสมาชิก/รหัสแนะนำรันอัตโนมัติ — ถ้ายังว่าง (บัญชี OAuth เก่า) เติมให้ทันที
    if(profile && (!profile.memberCode || !profile.referralCode)){
      const { ensureMemberCodes } = await import('@/lib/referral');
      const filled = await ensureMemberCodes(prisma, profile.id);
      if(filled) profile = { ...profile, ...filled };
    }
  // บันทึกความยินยอมของตัวเอง (สิทธิของเจ้าของข้อมูลตาม PDPA — เข้าถึง/ตรวจสอบย้อนหลังได้)
    if(profile?.id){
      consents = await (prisma as any).consentRecord.findMany({
        where:{ userId: profile.id },
        orderBy:{ consentedAt: 'desc' },
        select:{ type:true, version:true, granted:true, source:true, consentedAt:true },
      }).catch(()=>[]);
    }
  }catch{}
  return NextResponse.json({ ok:true, authed:true, user: { ...payload, ...(profile || {}) }, consents });
}
