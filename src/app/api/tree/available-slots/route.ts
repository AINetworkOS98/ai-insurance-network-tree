import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(req: NextRequest){
  const parentId = new URL(req.url).searchParams.get('parentId');
  try{
    if(process.env.DATABASE_URL){
      // นับลูกจริงจาก TreePlacement
      if(parentId){
        const placements = await prisma.treePlacement.findMany({ where:{ parentId }, select:{ slot:true }});
        const occupied = placements.map(p=>p.slot);
        const vacant = [1,2,3,4,5].filter(s=> !occupied.includes(s));
        return NextResponse.json({ ok:true, parentId, occupied, vacant, capacity:`${occupied.length}/5`, source:'db' });
      }
      const totalNodes = await prisma.treeNode.count();
      return NextResponse.json({ ok:true, totalNodes, capacity: totalNodes===0 ? 'empty' : `${totalNodes} nodes`, source:'db' });
    }
  }catch{}
  // ไม่ส่งข้อมูลปลอม — ถ้าไม่มี parentId หรือ DB ไม่พร้อม ให้ตอบว่าง
  return NextResponse.json({ ok:true, parentId: parentId||null, occupied:[], vacant:[1,2,3,4,5], capacity:'0/5', source:'empty', note:'No demo tree — DB empty or not connected' });
}
