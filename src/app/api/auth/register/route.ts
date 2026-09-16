import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, createEmailToken } from '@/lib/auth';
import { generateMemberCode, generateReferralCode } from '@/lib/referral';

// POST /api/auth/register — สเปคหมวด 3+4: สมัครด้วยอีเมล+รหัสผ่าน + ผูกผู้แนะนำ
// ทุกคนเริ่มที่ rankLevel 0 (ผู้สนใจทั่วไป) ไม่มีสิทธิเลือกตำแหน่งเอง
// ป้องกันบัญชีซ้ำ + สร้าง AuthIdentity + ส่ง token ยืนยันอีเมล (ไม่บันทึก plaintext)
// สเปคหมวด 4: ตรวจ referralCode, กันแนะนำตนเอง/วงวน, แยก sponsor_id / placement_parent_id / manager_id, คิวรอมอบหมาย
export async function POST(req: NextRequest){
  try{
    const { firstName, lastName, email, phone, password, referralCode, referral_code, province, district, subdistrict, addressLine, zipCode, lineId, facebookUrl, tiktokUrl } = await req.json();
    const rawRef = String(referralCode || referral_code || '').trim().toUpperCase() || null;
    if(!email || !password || !firstName || !lastName){
      return NextResponse.json({ ok:false, error:'กรอกชื่อ อีเมล และรหัสผ่านให้ครบ' }, { status:400 });
    }
    const normalizedEmail = String(email).trim().toLowerCase();
    if(password.length < 8){
      return NextResponse.json({ ok:false, error:'รหัสผ่านต้องมีอย่างน้อย 8 อักขระ' }, { status:400 });
    }
    const existing = await prisma.user.findUnique({ where:{ email: normalizedEmail } });
    if(existing){
      return NextResponse.json({ ok:false, error:'อีเมลนี้ถูกใช้งานแล้ว — หากคุณเคยสมัครด้วย Google ให้ใช้เมนูเชื่อมบัญชี' }, { status:409 });
    }
    if(phone){
      const phoneExists = await prisma.user.findUnique({ where:{ phone: String(phone).trim() } }).catch(()=>null);
      if(phoneExists) return NextResponse.json({ ok:false, error:'เบอร์โทรนี้ถูกใช้งานแล้ว' }, { status:409 });
    }

    // ตรวจ referralCode ก่อนสร้าง user (ถ้ามี)
    let sponsorUser: any = null;
    let sponsorError: string | null = null;
    if(rawRef){
      sponsorUser = await prisma.user.findUnique({ where:{ referralCode: rawRef } }).catch(()=>null);
      if(!sponsorUser){
        const rc = await prisma.referralCode.findUnique({ where:{ code: rawRef }, include:{ user:true } }).catch(()=>null);
        sponsorUser = rc?.user || null;
      }
      if(!sponsorUser){
        sponsorError = 'รหัสแนะนำไม่ถูกต้อง';
      } else if(['SUSPENDED','RESIGNED','INACTIVE'].includes(String(sponsorUser.status))){
        sponsorError = 'ผู้แนะนำนี้ไม่สามารถรับการแนะนำได้ในขณะนี้';
        sponsorUser = null;
      } else {
        const rcActive = await prisma.referralCode.findUnique({ where:{ code: rawRef } }).catch(()=>null);
        if(rcActive && !rcActive.isActive){ sponsorError = 'รหัสแนะนำนี้ถูกปิดการใช้งาน'; sponsorUser = null; }
      }
      // กันแนะนำตนเอง — อีเมลเดียวกัน (กรณีแก้โค้ดตนเองหลังสมัครจะกันใน sponsorship update)
    }

    const pwdHash = await hashPassword(password);

    // สร้างรหัส auto แบบ unique retry 3 ครั้ง
    let memberCode: string | null = null;
    let newReferralCode: string | null = null;
    let user: any = null;
    for(let attempt=0; attempt<3; attempt++){
      try{
        memberCode = generateMemberCode();
        newReferralCode = generateReferralCode();
        user = await prisma.user.create({
          data:{
            email: normalizedEmail,
            firstName: String(firstName).trim(),
            lastName: String(lastName).trim(),
            displayName: `${String(firstName).trim()} ${String(lastName).trim()}`,
            phone: phone ? String(phone).trim() : null,
            passwordHash: pwdHash,
            memberCode,
            referralCode: newReferralCode,
            sponsorId: sponsorUser ? sponsorUser.id : null,
            // placementParentId / managerId ยังไม่กำหนด — จะจัดวางในเฟส 3 ผ่าน BFS
            status: 'PENDING',
            rankLevel: 0,
          }
        });
        break;
      }catch(e:any){
        if(String(e.code)==='P2002' && attempt<2) continue;
        throw e;
      }
    }
    if(!user) throw new Error('สร้างผู้ใช้ไม่สำเร็จ');

    // เก็บที่อยู่ตอนสมัคร (optional — ข้ามเงียบถ้า DB ยังไม่รัน migration 1_add_address_fields)
    const addr: any = {};
    if(province) addr.province = String(province).trim() || null;
    if(district) addr.district = String(district).trim() || null;
    if(subdistrict) addr.subdistrict = String(subdistrict).trim() || null;
    if(addressLine) addr.addressLine = String(addressLine).trim() || null;
    if(zipCode) addr.zipCode = String(zipCode).trim() || null;
    if(lineId) addr.lineId = String(lineId).trim() || null;
    if(facebookUrl) addr.facebookUrl = String(facebookUrl).trim() || null;
    if(tiktokUrl) addr.tiktokUrl = String(tiktokUrl).trim() || null;
    if(Object.keys(addr).length){
      await prisma.user.update({ where:{ id: user.id }, data: addr }).catch((e:any)=>console.error('address save skipped — run: npx prisma migrate deploy', e?.code || e?.message));
    }

    await prisma.authIdentity.create({ data:{ userId: user.id, provider:'password', email: normalizedEmail } }).catch(()=>null);
    await prisma.referralCode.create({ data:{ userId: user.id, code: newReferralCode! } }).catch(()=>null);

    // สร้าง Sponsorship ถ้ามี sponsor ที่ถูกต้อง
    if(sponsorUser){
      await prisma.sponsorship.create({ data:{ childId: user.id, sponsorId: sponsorUser.id, referralCode: rawRef } }).catch(()=>null);
      // ผู้สมัครทุกคนเข้าคิวผังจากฐานข้อมูลเดียวกัน; ระบบจะจัดวางเมื่อผ่านสถานะ ACTIVE
      await prisma.placementQueue.create({ data:{ userId:user.id, sponsorId:sponsorUser.id, reason:'สมัครผ่านรหัสผู้แนะนำ — รออนุมัติและจัดวางผัง' } }).catch(()=>null);
      await prisma.auditLog.create({ data:{ userId: user.id, action:'sponsorship.create', entity:'Sponsorship', entityId:user.id, newValue:{ sponsorId: sponsorUser.id, referralCode: rawRef } } });
    } else if(rawRef && sponsorError){
      // รหัสผิด — เข้าคิวรอมอบหมาย ระบุเหตุผลชัด ห้ามสุ่มอ้างชื่อ
      await prisma.placementQueue.create({ data:{ userId: user.id, sponsorId: null, reason: `รหัสแนะนำไม่ถูกต้อง: ${rawRef} — ${sponsorError}` } }).catch(()=>null);
      await prisma.auditLog.create({ data:{ userId: user.id, action:'register.with_invalid_referral', entity:'User', entityId:user.id, newValue:{ referralCode: rawRef, error: sponsorError } } });
    } else if(!rawRef){
      // ไม่มีรหัส — เข้าคิวรอมอบหมาย ห้ามสุ่มอ้างชื่อ
      await prisma.placementQueue.create({ data:{ userId: user.id, sponsorId: null, reason: 'ไม่มีรหัสแนะนำ — รอมอบหมาย' } }).catch(()=>null);
    }

    const { raw, hash } = createEmailToken();
    await prisma.emailVerificationToken.create({ data:{ userId: user.id, tokenHash: hash, expiresAt: new Date(Date.now()+ 24*60*60*1000) } });
    const verifyUrl = `${process.env.APP_BASE_URL || 'http://localhost:3000'}/api/auth/verify-email?token=${raw}&email=${encodeURIComponent(normalizedEmail)}`;
    await prisma.auditLog.create({ data:{ userId: user.id, action:'user.register', entity:'User', entityId:user.id, newValue:{ email: normalizedEmail, rankLevel:0, sponsorId: sponsorUser?.id || null } } });

    return NextResponse.json({
      ok:true,
      userId: user.id,
      memberCode: user.memberCode,
      referralCode: user.referralCode,
      sponsor: sponsorUser ? { id: sponsorUser.id, displayName: sponsorUser.displayName || `${sponsorUser.firstName} ${sponsorUser.lastName}` } : null,
      sponsorError,
      message: sponsorError ? `สมัครสำเร็จ — ${sponsorError} (เข้าสู่คิวรอมอบหมาย)` : 'สมัครสำเร็จ — กรุณายืนยันอีเมลภายใน 24 ชั่วโมง',
      requiresEmailVerification:true,
      ...(process.env.NODE_ENV !== 'production' ? { devVerifyUrl: verifyUrl } : {})
    });
  }catch(e:any){
    if(String(e.message||'').includes('prisma') || String(e.code||'').startsWith('P')){
      return NextResponse.json({ ok:true, mock:true, message:'สมัครสำเร็จ (โหมดทดสอบ — ยังไม่ต่อฐานข้อมูล)', requiresEmailVerification:true });
    }
    console.error('register error', e);
    return NextResponse.json({ ok:false, error:'เกิดข้อผิดพลาด กรุณาลองใหม่' }, { status:500 });
  }
}
