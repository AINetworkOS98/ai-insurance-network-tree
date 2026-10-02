import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { RANK_CATALOG } from '@/lib/rankCatalog';

// GET /api/career/board — กระดานผู้เลื่อนตำแหน่ง + รายได้ (เห็นเฉพาะระดับตัวแทนขึ้นไป)
export async function GET(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.headers.get('authorization')?.replace(/^Bearer\s+/i,'') || '';
    if(!token) return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    let payload:any; try{ payload = verifyToken(token); }catch{ return NextResponse.json({ ok:false, error:'โทเค็นไม่ถูกต้อง' }, { status:401 }); }
    // ดึง rank ปัจจุบันจาก DB (token อาจ stale หลัง admin ปรับระดับ)
    const userId = (payload as any).sub;
    const me = userId ? await prisma.user.findUnique({ where:{ id: userId }, select:{ rankLevel:true } }).catch(()=>null) : null;
    const rankLevel = me?.rankLevel ?? (payload.rankLevel ?? 0);
    if(rankLevel < 1) return NextResponse.json({ ok:false, error:'สมาชิกทั่วไปดูได้เฉพาะหน้าแรก' }, { status:403 });

    const history: any[] = await prisma.rankHistory.findMany({
      where:{ result:'promoted' }, orderBy:{ evaluatedAt:'desc' }, take:50,
    }).catch(()=>[]);
    const userIds = [...new Set(history.map(h=> h.userId))];
    const users: any[] = userIds.length
      ? await prisma.user.findMany({ where:{ id:{ in: userIds } }, select:{ id:true, displayName:true, firstName:true, lastName:true, memberCode:true, rankLevel:true } })
      : [];
    const umap = new Map(users.map(u=> [u.id, u]));
    // รายได้รับรองสะสมของแต่ละคน (เฉพาะ active)
    const ledgers: any[] = userIds.length
      ? await prisma.performanceLedger.findMany({ where:{ userId:{ in: userIds }, status:'active' }, select:{ userId:true, amount:true, type:true } }).catch(()=>[])
      : [];
    const income = new Map<string, number>();
    for(const l of ledgers) income.set(l.userId, (income.get(l.userId) || 0) + Number(l.amount));

    const board = history.map(h=> {
      const u: any = umap.get(h.userId);
      return {
        id: h.id,
        name: u?.displayName || `${u?.firstName || ''} ${u?.lastName || ''}`.trim() || 'สมาชิก',
        memberCode: u?.memberCode || null,
        fromRank: h.fromRank,
        fromRankName: RANK_CATALOG.find(r=> r.level===h.fromRank)?.nameTh || '',
        toRank: h.toRank,
        toRankName: RANK_CATALOG.find(r=> r.level===h.toRank)?.nameTh || '',
        income: income.get(h.userId) || 0,
        at: h.evaluatedAt,
      };
    });
    return NextResponse.json({ ok:true, count: board.length, board });
  }catch(e:any){ return NextResponse.json({ ok:false, error:e?.message || 'error' }, { status:500 }); }
}
