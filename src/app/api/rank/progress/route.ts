import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { evaluateRank } from '@/lib/rankEngine';

// GET /api/rank/progress?userId= — เส้นทางตำแหน่งและความคืบหน้า
export async function GET(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if(!token) return NextResponse.json({ error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    let payload: any; try{ payload = verifyToken(token); }catch{ return NextResponse.json({ error:'โทเค็นไม่ถูกต้อง' }, { status:401 }); }
    const sp = new URL(req.url).searchParams;
    const userId = sp.get('userId') || payload.sub || payload.id;
    const ev: any = await evaluateRank(userId);
    const user: any = await prisma.user.findUnique({ where:{ id: userId }, select:{ rankLevel:true, rankUpdatedAt:true } });
    const history: any = await prisma.rankHistory.findMany({ where:{ userId }, orderBy:{ createdAt:'desc' }, take:10 });
    const { RANK_CATALOG } = await import('@/lib/rankCatalog');
    return NextResponse.json({
      ok:true,
      userId,
      currentRank: user?.rankLevel ?? 0,
      currentRankNameTh: (RANK_CATALOG as any).find((r:any)=> r.level===(user?.rankLevel ?? 0))?.nameTh || '',
      targetRank: ev.targetRank ?? null,
      targetRankNameTh: ev.targetRank != null ? ((RANK_CATALOG as any).find((r:any)=> r.level===ev.targetRank)?.nameTh || '') : null,
      result: ev.result,
      evalMessage: ev.message,
      missing: ev.missing || [],
      evalType: ev.evalType || null,
      rankUpdatedAt: user?.rankUpdatedAt || null,
      history
    });
  }catch(e:any){ return NextResponse.json({ error:e?.message || 'error' }, { status:500 }); }
}
