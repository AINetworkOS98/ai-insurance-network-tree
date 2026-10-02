import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateMemberCode, generateReferralCode } from '@/lib/referral';

// แปลง User (ผู้สนใจทั่วไป rankLevel 0) → รูปแบบ prospect
function userToProspect(u: any){
  return {
    id: u.memberCode || u.id,
    _id: u.id,
    name: u.displayName || `${u.firstName||''} ${u.lastName||''}`.trim() || u.email || u.id,
    phone: u.phone || '',
    email: u.email || '',
    status: String(u.status||'PENDING').toUpperCase(),
    score: 0,
    province: u.province || '',
    rankLevel: u.rankLevel ?? 0,
    memberCode: u.memberCode || '',
    referralCode: u.referralCode || '',
    source: 'register',
  };
}

export async function GET(){
  const merged: any[] = [];
  const seen = new Set<string>();

  // 1) Prisma Users ระดับผู้สนใจทั่วไป (rankLevel 0) — ฐานเดียวกับ /register (แหล่งหลัก)
  try{
    const users: any[] = await prisma.user.findMany({
      where:{ rankLevel: 0 },
      orderBy:{ createdAt:'desc' },
      take: 200,
      select:{ id:true, email:true, firstName:true, lastName:true, displayName:true, phone:true, province:true, memberCode:true, referralCode:true, status:true, rankLevel:true, createdAt:true } as any,
    });
    for(const u of users){
      const p = userToProspect(u);
      const key = (p.email || p.id).toLowerCase();
      if(seen.has(key)) continue;
      seen.add(key);
      merged.push(p);
    }
  }catch(e:any){ console.warn('prospects users fetch skipped', e?.message); }

  // 2) Prisma Prospect (CRM เก่า)
  try{
    if(process.env.DATABASE_URL){
      const prospects = await prisma.prospect.findMany({
        take: 100, orderBy:{ createdAt:'desc' },
        select:{ id:true, prospectId:true, firstName:true, lastName:true, phone:true, email:true, status:true, leadScore:true, province:true }
      });
      for(const p of prospects){
        const item = {
          id: p.prospectId || p.id, _id: p.id,
          name: `${p.firstName} ${p.lastName}`.trim(),
          phone: p.phone || '', email: p.email || '',
          status: p.status, score: p.leadScore, province: p.province || '', source:'prospect',
        };
        const key = (item.email || item.id).toLowerCase();
        if(seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
      }
    }
  }catch{}

  // 3) Firestore applications (สำรอง/เดิม)
  try{
    const { getDb } = await import('@/lib/firebase-admin');
    const db = getDb();
    const snap = await db.collection('applications').orderBy('submittedAt','desc').limit(100).get();
    snap.forEach(d=>{
      const data:any = d.data();
      const item = {
        id: data.applicationNo || d.id, _id: d.id,
        name: `${data.firstName||''} ${data.lastName||''}`.trim() || data.name || d.id,
        phone: data.phone || '', email: data.email || '',
        status: (data.status||'pending_review').toUpperCase(), score: data.leadScore || 0,
        province: data.province || '', source:'firestore',
      };
      const key = (item.email || item.id).toLowerCase();
      if(seen.has(key)) return;
      seen.add(key);
      merged.push(item);
    });
  }catch(e:any){ console.warn('prospects firestore failed', e?.message); }

  return NextResponse.json({ ok:true, prospects: merged, source:'merged', count: merged.length });
}

export async function POST(req:Request){
  const b = await req.json().catch(()=>({}));
  const firstName = String(b.firstName||'').trim();
  const lastName = String(b.lastName||'').trim();
  if(!firstName || !lastName) return NextResponse.json({ok:false, error:'กรุณากรอกชื่อและนามสกุล'}, {status:400});
  const email = String(b.email||'').trim().toLowerCase();
  const phone = String(b.phone||'').trim();
  const province = String(b.province||'').trim();

  // มีอีเมล → สร้าง User ผู้สนใจทั่วไป (rankLevel 0) ฐานเดียวกับ /register
  if(email){
    try{
      const existing = await prisma.user.findUnique({ where:{ email } });
      if(existing) return NextResponse.json({ok:false, error:'อีเมลนี้มีในระบบแล้ว (เป็นสมาชิกผู้สนใจอยู่แล้ว)'}, {status:409});
      let memberCode: string|null = null, referralCode: string|null = null;
      let user: any = null;
      for(let attempt=0; attempt<3; attempt++){
        try{
          memberCode = generateMemberCode();
          referralCode = generateReferralCode();
          user = await prisma.user.create({ data:{
            email, firstName, lastName, displayName:`${firstName} ${lastName}`.trim(),
            phone: phone || null, province: province || null,
            memberCode, referralCode, status:'PENDING', rankLevel:0,
          }});
          break;
        }catch(e:any){ if(String(e.code)==='P2002' && attempt<2) continue; throw e; }
      }
      if(!user) throw new Error('สร้างไม่สำเร็จ');
      await prisma.referralCode.create({ data:{ userId: user.id, code: referralCode! } }).catch(()=>null);
      await prisma.placementQueue.create({ data:{ userId: user.id, sponsorId: null, reason:'เพิ่มผู้สนใจโดยตรง — รออนุมัติและจัดวางผัง' } }).catch(()=>null);
      await prisma.auditLog.create({ data:{ userId: user.id, action:'prospect.create', entity:'User', entityId:user.id, newValue:{ email, rankLevel:0 } } }).catch(()=>null);
      return NextResponse.json({ ok:true, created: userToProspect(user), source:'register' });
    }catch(e:any){
      // fallback ไป firestore ด้านล่าง
    }
  }

  // ไม่มีอีเมล → เก็บลง Firestore applications (เดิม)
  try{
    const { getDb } = await import('@/lib/firebase-admin');
    const db = getDb();
    const id = `app_${Date.now().toString(36)}`;
    const applicationNo = `APP-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    const docData = { id, applicationNo, firstName, lastName, phone, email, province, status: b.status || 'pending_review', submittedAt: new Date().toISOString(), sponsorCode: b.sponsorCode || '' };
    await db.collection('applications').doc(id).set(docData);
    return NextResponse.json({ok:true, created:{ id: applicationNo, _id: id, name:`${firstName} ${lastName}`.trim(), status:'PENDING_REVIEW' }, source:'firestore'});
  }catch(e:any){
    try{
      if(process.env.DATABASE_URL){
        const prospectId = 'P-'+Math.random().toString(36).slice(2,8).toUpperCase();
        const created = await prisma.prospect.create({ data:{ prospectId, firstName, lastName, phone: phone||null, email: email||null, province: province||null, status: b.status || 'NEW', leadScore: b.leadScore ?? 0 } });
        return NextResponse.json({ok:true, created:{ id: created.prospectId, _id: created.id, name:`${created.firstName} ${created.lastName}`.trim(), status: created.status }, source:'prisma'});
      }
    }catch{}
    return NextResponse.json({ok:false, error:'บันทึกไม่สำเร็จ'}, {status:500});
  }
}
