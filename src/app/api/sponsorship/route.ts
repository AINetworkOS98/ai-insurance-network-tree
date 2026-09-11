import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { wouldCreateLoop } from '@/lib/referral';

// PUT /api/sponsorship — แก้ผู้แนะนำ (สเปคหมวด 4: หลังยืนยันแล้ว สมาชิกแก้เองไม่ได้ ผู้ดูแลที่ได้รับสิทธิเท่านั้น แก้ได้พร้อมเหตุผลและประวัติก่อน-หลัง)
// Body: { childId, newSponsorId | newReferralCode, reason }
export async function PUT(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.headers.get('authorization')?.replace('Bearer ','') || '';
    if(!token) return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    const payload = verifyToken(token);
    if(!payload) return NextResponse.json({ ok:false, error:'เซสชันหมดอายุ' }, { status:401 });
    const actorId = (payload as any).sub;

    // ตรวจสิทธิ: ต้องมี member.sponsor_edit หรือ admin
    const roles = (payload as any).roles || ((payload as any).role ? [(payload as any).role] : []);
    const hasPerm = roles.includes('admin') || roles.includes('super_admin');
    // fallback: ถ้าไม่มี roles ให้ตรวจจาก DB
    let allowed = hasPerm;
    if(!allowed){
      const actorRoles = await prisma.userRole.findMany({ where:{ userId: actorId }, include:{ role:{ include:{ permissions:true } } } }).catch(()=>[]);
      const permKeys = actorRoles.flatMap((ur:any)=> ur.role.permissions.map((rp:any)=> rp.permission.key));
      allowed = permKeys.includes('member.sponsor_edit') || permKeys.includes('permission.manage');
    }
    if(!allowed) return NextResponse.json({ ok:false, error:'ไม่มีสิทธิแก้ผู้แนะนำ — ต้องได้รับมอบหมาย member.sponsor_edit' }, { status:403 });

    const { childId, newSponsorId, newReferralCode, reason } = await req.json();
    if(!childId || !reason || String(reason).trim().length < 5){
      return NextResponse.json({ ok:false, error:'กรุณาระบุ childId และเหตุผล (อย่างน้อย 5 อักขระ)' }, { status:400 });
    }

    let targetSponsorId: string | null = newSponsorId || null;
    if(newReferralCode && !targetSponsorId){
      const rcUser = await prisma.user.findUnique({ where:{ referralCode: String(newReferralCode).trim().toUpperCase() } });
      if(!rcUser) return NextResponse.json({ ok:false, error:'รหัสแนะนำใหม่ไม่ถูกต้อง' }, { status:404 });
      targetSponsorId = rcUser.id;
    }
    if(targetSponsorId){
      const sponsor = await prisma.user.findUnique({ where:{ id: targetSponsorId } });
      if(!sponsor) return NextResponse.json({ ok:false, error:'ไม่พบผู้แนะนำใหม่' }, { status:404 });
      if(await wouldCreateLoop(prisma, childId, targetSponsorId)){
        return NextResponse.json({ ok:false, error:'ไม่สามารถตั้งผู้แนะนำนี้ได้ — จะทำให้เกิดวงวนในสายงาน' }, { status:400 });
      }
    }

    const sponsorship = await prisma.sponsorship.findUnique({ where:{ childId } }).catch(()=>null);
    const oldSponsorId = (sponsorship as any)?.sponsorId ?? (await prisma.user.findUnique({ where:{ id: childId }, select:{ sponsorId:true } }).then((u:any)=>u?.sponsorId) ?? null);

    // ห้ามแนะนำตนเอง
    if(targetSponsorId === childId) return NextResponse.json({ ok:false, error:'ไม่สามารถแนะนำตนเองได้' }, { status:400 });

    await prisma.$transaction(async (tx:any)=>{
      // อัปเดต User.sponsorId + Sponsorship
      await tx.user.update({ where:{ id: childId }, data:{ sponsorId: targetSponsorId } });
      if(sponsorship){
        await tx.sponsorship.update({ where:{ childId }, data:{ sponsorId: targetSponsorId!, referralCode: newReferralCode || undefined } });
      } else if(targetSponsorId){
        await tx.sponsorship.create({ data:{ childId, sponsorId: targetSponsorId, referralCode: newReferralCode || null } });
      }
      await tx.sponsorshipHistory.create({ data:{ childId, oldSponsorId, newSponsorId: targetSponsorId, reason: String(reason).trim(), changedBy: actorId } });
      await tx.auditLog.create({ data:{ userId: actorId, action:'sponsorship.update', entity:'Sponsorship', entityId: childId, oldValue:{ sponsorId: oldSponsorId }, newValue:{ sponsorId: targetSponsorId }, reason: String(reason).trim() } });
    });

    return NextResponse.json({ ok:true, message:'แก้ไขผู้แนะนำสำเร็จ', oldSponsorId, newSponsorId: targetSponsorId });
  }catch(e:any){
    console.error('sponsorship PUT', e);
    return NextResponse.json({ ok:false, error:'เกิดข้อผิดพลาด' }, { status:500 });
  }
}

// GET /api/sponsorship?childId=xxx — ดูประวัติ
export async function GET(req: NextRequest){
  const { searchParams } = new URL(req.url);
  const childId = searchParams.get('childId');
  if(!childId) return NextResponse.json({ ok:false, error:'กรุณาระบุ childId' }, { status:400 });
  try{
    const history = await prisma.sponsorshipHistory.findMany({ where:{ childId }, orderBy:{ createdAt:'desc' }, take:20 });
    const current = await prisma.sponsorship.findUnique({ where:{ childId } }).catch(()=>null);
    const user = await prisma.user.findUnique({ where:{ id: childId }, select:{ sponsorId:true } }).catch(()=>null);
    return NextResponse.json({ ok:true, current: current || { childId, sponsorId: user?.sponsorId || null }, history });
  }catch(e:any){
    return NextResponse.json({ ok:false, error:'เกิดข้อผิดพลาด' }, { status:500 });
  }
}
