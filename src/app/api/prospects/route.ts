import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(){
  // 1) Firestore applications → prospects
  try{
    const { getDb } = await import('@/lib/firebase-admin');
    const db = getDb();
    const snap = await db.collection('applications').orderBy('submittedAt','desc').limit(100).get();
    if(!snap.empty){
      const prospects = snap.docs.map(d=>{
        const data:any = d.data();
        return {
          id: data.applicationNo || d.id,
          _id: d.id,
          name: `${data.firstName||''} ${data.lastName||''}`.trim() || data.name || d.id,
          phone: data.phone || '',
          email: data.email || '',
          status: (data.status||'pending_review').toUpperCase(),
          score: data.leadScore || 0,
          province: data.province || '',
          sponsorCode: data.sponsorCode || '',
        };
      });
      return NextResponse.json({ ok:true, prospects, source:'firestore', count: prospects.length, projectId:'akarapol798' });
    }
    // also try prospect-like members with pending?
  }catch(e:any){ console.warn('prospects firestore failed', e?.message); }

  // 2) Prisma prospects
  try{
    if(process.env.DATABASE_URL){
      const prospects = await prisma.prospect.findMany({
        take: 100,
        orderBy:{ createdAt:'desc' },
        select:{ id:true, prospectId:true, firstName:true, lastName:true, phone:true, email:true, status:true, leadScore:true, province:true }
      });
      if(prospects.length>0){
        const data = prospects.map(p=>({
          id: p.prospectId || p.id,
          _id: p.id,
          name: `${p.firstName} ${p.lastName}`.trim(),
          phone: p.phone || '',
          email: p.email || '',
          status: p.status,
          score: p.leadScore,
          province: p.province || '',
        }));
        return NextResponse.json({ ok:true, prospects: data, source:'prisma', count: data.length });
      }
    }
  }catch{}

  return NextResponse.json({ ok:true, prospects:[], source:'empty', count:0, note:'No prospects — Firestore applications empty' });
}

export async function POST(req:Request){
  const b=await req.json().catch(()=>({}));
  if(!b.firstName || !b.lastName) return NextResponse.json({ok:false, error:'firstName and lastName required'}, {status:400});
  // Prefer Firestore
  try{
    const { getDb } = await import('@/lib/firebase-admin');
    const db = getDb();
    const id = `app_${Date.now().toString(36)}`;
    const applicationNo = `APP-${Math.random().toString(36).slice(2,6).toUpperCase()}`;
    const docData = {
      id,
      applicationNo,
      firstName: String(b.firstName),
      lastName: String(b.lastName),
      phone: b.phone || '',
      email: b.email || '',
      province: b.province || '',
      status: b.status || 'pending_review',
      submittedAt: new Date().toISOString(),
      sponsorCode: b.sponsorCode || '',
    };
    await db.collection('applications').doc(id).set(docData);
    return NextResponse.json({ok:true, created:{ id: applicationNo, _id: id, name: `${docData.firstName} ${docData.lastName}`.trim(), status: docData.status }, source:'firestore'});
  }catch(e:any){
    // fallback prisma
    try{
      if(process.env.DATABASE_URL){
        const prospectId = 'P-'+Math.random().toString(36).slice(2,8).toUpperCase();
        const created = await prisma.prospect.create({
          data:{
            prospectId,
            firstName: String(b.firstName),
            lastName: String(b.lastName),
            phone: b.phone || null,
            email: b.email || null,
            province: b.province || null,
            status: b.status || 'NEW',
            leadScore: b.leadScore ?? 0,
          }
        });
        return NextResponse.json({ok:true, created:{ id: created.prospectId, _id: created.id, name: `${created.firstName} ${created.lastName}`.trim(), status: created.status }, source:'prisma'});
      }
    }catch(e2:any){}
    return NextResponse.json({ok:false, error: e.message || 'create failed'}, {status:500});
  }
}
