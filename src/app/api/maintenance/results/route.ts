import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

// GET /api/maintenance/results?period=&planId=
export async function GET(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if(!token) return NextResponse.json({ error:'กรุณาเข้าสู่ระบบ'},{status:401});
    const sp = new URL(req.url).searchParams;
    const period = sp.get('period');
    const planId = sp.get('planId');
    const where: any = {};
    if(period) where.period = period;
    if(planId) where.planId = planId;
    const results: any = await prisma.maintenanceResult.findMany({ where, orderBy:{ period:'desc' }, take:200 });
    const statuses = ['passed','warning','suspended','removed','pending_review'] as const;
    const summary: any = {};
    for(const s of statuses) summary[s] = results.filter((r:any)=> r.status===s).length;
    return NextResponse.json({ ok:true, results, summary });
  }catch(e:any){ return NextResponse.json({error:e?.message||'error'},{status:500});}
}
