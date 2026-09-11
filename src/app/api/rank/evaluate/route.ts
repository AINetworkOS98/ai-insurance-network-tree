import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { evaluateRank, applyRankPromotion } from '@/lib/rankEngine';

// POST /api/rank/evaluate { userId?, action?: 'evaluate'|'promote' }
export async function POST(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;
    if(!token) return NextResponse.json({ error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    let payload: any; try{ payload = verifyToken(token); }catch{ return NextResponse.json({ error:'โทเค็นไม่ถูกต้อง' }, { status:401 }); }
    const body = await req.json().catch(()=> ({} as any));
    const targetId = body.userId || payload.sub || payload.id;
    const action = body.action || 'evaluate';

    // ถ้าประเมินคนอื่น ต้องมี rank.manage หรือ rank.approve
    if(targetId !== (payload.sub || payload.id)){
      const requester: any = await prisma.user.findUnique({ where:{ id: payload.sub || payload.id }, include:{ roles:{ include:{ role:true } } } as any });
      const perms: string[] = [];
      const allowed = perms.includes('rank.manage') || perms.includes('rank.approve') || (payload.roles||[]).includes('admin');
      if(!allowed) return NextResponse.json({ error:'ต้องมีสิทธิ rank.manage / rank.approve' }, { status:403 });
    }

    if(action==='promote'){
      const res: any = await applyRankPromotion(targetId, payload.sub || payload.id);
      return NextResponse.json({ ok:true, ...res });
    }
    const res: any = await evaluateRank(targetId);
    return NextResponse.json({ ok:true, ...res });
  }catch(e:any){ return NextResponse.json({ error:e?.message || 'error' }, { status:500 }); }
}
