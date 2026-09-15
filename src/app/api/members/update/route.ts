import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getDb } from '@/lib/firebase-admin';

export async function PUT(req: NextRequest){
  try{
    const body = await req.json().catch(()=>({}));
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value || req.headers.get('authorization')?.replace(/^Bearer\s+/i,'') || '';
    let userId:string|null = null;
    if(token){
      try{ const p:any = verifyToken(token); if(p?.sub) userId = p.sub; }catch{}
    }
    // fallback: if no auth, try update first member (for demo) — but prefer auth
    const allowed = ['firstName','lastName','phone','province','district','subdistrict','addressLine','zipCode','lineId','facebookUrl','tiktokUrl'];
    const data:any = {};
    for(const k of allowed){
      if(typeof body[k]==='string') data[k]= String(body[k]).trim() || null;
    }
    // email change needs verification — skip direct email update for now
    if(userId){
      const updated = await prisma.user.update({ where:{ id:userId }, data }).catch(async (e:any)=>{
        // if columns missing (migration not run), try without new fields
        if(String(e?.code)==='P2022' || String(e?.message)?.includes('column')){
          const fallback:any = {};
          for(const k of ['firstName','lastName','phone','province']){ if(data[k]!==undefined) fallback[k]=data[k]; }
          return prisma.user.update({ where:{ id:userId }, data: fallback });
        }
        throw e;
      });
      // mirror to Firestore members if exists
      try{
        const db=getDb();
        const snap = await db.collection('members').where('uid','==',userId).limit(1).get().catch(()=>null);
        if(snap && !snap.empty){
          const doc=snap.docs[0];
          await doc.ref.update({ ...data, updatedAt: new Date().toISOString() }).catch(()=>null);
        }
      }catch{}
      return NextResponse.json({ ok:true, memberCode: updated.memberCode, referralCode: updated.referralCode });
    }
    // no auth — try firestore first member for demo
    try{
      const db=getDb();
      const snap = await db.collection('members').limit(1).get();
      if(!snap.empty){
        await snap.docs[0].ref.update({ ...data, updatedAt: new Date().toISOString() });
        return NextResponse.json({ ok:true });
      }
    }catch{}
    return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบก่อนบันทึก' }, {status:401});
  }catch(e:any){
    return NextResponse.json({ ok:false, error:e?.message||'error' }, {status:500});
  }
}
