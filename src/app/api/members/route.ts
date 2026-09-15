import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase-admin';

interface FirestoreMember {
  id: string;
  memberCode?: string;
  displayName?: string;
  name?: string;
  positionId?: string;
  role?: string;
  status?: string;
  province?: string;
  district?: string;
  subdistrict?: string;
  addressLine?: string;
  zipCode?: string;
  lineId?: string;
  facebookUrl?: string;
  tiktokUrl?: string;
  referralCode?: string;
  branch?: string;
  personalFYC?: number;
  personalCOM?: number;
  sponsorId?: string;
  joinDate?: string;
  uid?: string;
  email?: string;
  phone?: string;
}

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get('memberId');
    
    if (memberId) {
      // Single member detail
      const memberRef = db.collection('members').doc(memberId);
      const memberSnap = await memberRef.get();
      
      if (!memberSnap.exists) {
        return NextResponse.json({ ok: false, error: 'ไม่พบสมาชิก' }, { status: 404 });
      }
      
      const member: FirestoreMember = { id: memberSnap.id, ...memberSnap.data() } as FirestoreMember;
      
      // Also get memberAccess
      const accessRef = db.collection('memberAccess').doc(member.uid || '');
      const accessSnap = await accessRef.get();
      
      return NextResponse.json({ ok: true, member, memberAccess: accessSnap.exists ? accessSnap.data() : null });
    }
    
    // List all members with basic info
    const membersSnap = await db.collection('members').limit(50).get();
    const members: FirestoreMember[] = [];
    membersSnap.forEach(doc => {
      const data = doc.data();
      members.push({
        id: doc.id,
        memberCode: data.memberCode,
        name: data.name,
        positionId: data.positionId,
        role: data.role,
        status: data.status,
        province: data.province,
        district: data.district,
        subdistrict: data.subdistrict,
        addressLine: data.addressLine,
        zipCode: data.zipCode,
        lineId: data.lineId,
        facebookUrl: data.facebookUrl,
        tiktokUrl: data.tiktokUrl,
        referralCode: data.referralCode,
        branch: data.branch,
        email: data.email,
        phone: data.phone,
        sponsorId: data.sponsorId,
        joinDate: data.joinDate,
        personalFYC: data.personalFYC,
        personalCOM: data.personalCOM,
      });
    });
    
    return NextResponse.json({ ok: true, members });
    
  } catch (error: any) {
    console.error('Members list error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
export async function PUT(req: NextRequest){
  try{
    const body = await req.json().catch(()=>({}));
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value || req.headers.get('authorization')?.replace(/^Bearer\s+/i,'') || '';
    let userId:string|null = null;
    if(token){
      try{ const { verifyToken } = await import('@/lib/auth'); const p:any = verifyToken(token); if(p?.sub) userId = String(p.sub); }catch{}
    }
    const allowed = ['firstName','lastName','phone','province','district','subdistrict','addressLine','zipCode','lineId','facebookUrl','tiktokUrl'];
    const data:any = {};
    for(const k of allowed){ if(typeof body[k]==='string') data[k]= String(body[k]).trim() || null; }
    if(userId){
      const { prisma } = await import('@/lib/prisma');
      const updated = await prisma.user.update({ where:{ id:userId }, data }).catch(async (e:any)=>{
        if(String(e?.code)==='P2022' || String(e?.message)?.includes('column')){
          const fb:any={}; for(const k of ['firstName','lastName','phone','province']){ if(data[k]!==undefined) fb[k]=data[k]; }
          return prisma.user.update({ where:{ id:userId }, data: fb });
        }
        throw e;
      });
      try{
        const db=getDb();
        const snap = await db.collection('members').where('uid','==',userId).limit(1).get().catch(()=>null);
        if(snap && !snap.empty) await snap.docs[0].ref.update({ ...data, updatedAt: new Date().toISOString() }).catch(()=>null);
      }catch{}
      return NextResponse.json({ ok:true, memberCode: (updated as any).memberCode, referralCode: (updated as any).referralCode });
    }
    try{
      const db=getDb();
      const snap = await db.collection('members').limit(1).get();
      if(!snap.empty){ await snap.docs[0].ref.update({ ...data, updatedAt: new Date().toISOString() }); return NextResponse.json({ ok:true }); }
    }catch{}
    return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบก่อนบันทึก' }, {status:401});
  }catch(e:any){
    return NextResponse.json({ ok:false, error:e?.message||'error' }, {status:500});
  }
}