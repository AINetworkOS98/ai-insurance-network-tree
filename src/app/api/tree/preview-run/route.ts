import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

// GET /api/tree/preview-run — ตรวจสอบก่อนรัน: แสดงคิว ตำแหน่งที่จะได้รับ สมาชิกที่ข้าม และสาเหตุ
export async function GET(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.headers.get('authorization')?.replace('Bearer ','') || '';
    const payload = token ? verifyToken(token) : null;
    if(!payload) return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบ' }, { status:401 });

    // คิวที่ยังไม่จัดวาง (ผ่านสถานะตัวแทนแล้ว)
    const queue = await prisma.placementQueue.findMany({
      include:{ user:{ select:{ id:true, displayName:true, firstName:true, lastName:true, memberCode:true, rankLevel:true, status:true, sponsorId:true, createdAt:true } } },
      orderBy:{ queueNo:'asc' }, take:50
    });

    const allNodes: any[] = await prisma.treeNode.findMany({ select:{ id:true, userId:true, level:true } });
    const allPlacements: any[] = await prisma.treePlacement.findMany({ select:{ parentId:true, slot:true } });
    const placementsByParent = new Map<string, number[]>();
    for(const p of allPlacements){
      if(!placementsByParent.has(p.parentId)) placementsByParent.set(p.parentId, []);
      placementsByParent.get(p.parentId)!.push(p.slot);
    }

    // จำลอง BFS สำหรับแต่ละคนในคิว ว่าจะได้ parent/slot ไหน (ไม่เขียน DB)
    const preview: any[] = [];
    const simulatedPlacements = new Map(placementsByParent);
    const nodeByUserId = new Map<string, any>(allNodes.map((n:any)=> [n.userId, n]));
    const sortedNodes = [...allNodes].sort((a,b)=> a.level - b.level);

    for(const q of queue){
      const user = q.user;
      // เงื่อนไขผ่านตัวแทน?
      const isAgent = (user.rankLevel ?? 0) >= 1 || user.status === 'ACTIVE';
      if(!isAgent){
        preview.push({ userId: user.id, displayName: user.displayName || `${user.firstName} ${user.lastName}`, memberCode: user.memberCode, status:'skipped', reason:'ยังไม่ผ่านสถานะตัวแทน — รอตรวจคุณสมบัติ' });
        continue;
      }
      // หา parent ว่างแบบจำลอง
      let found: any = null;
      if(q.sponsorId && nodeByUserId.has(q.sponsorId)){
        const occ = simulatedPlacements.get(nodeByUserId.get(q.sponsorId)!.id) || [];
        if(occ.length < 5){
          const slot = [1,2,3,4,5].find(s=> !occ.includes(s))!;
          found = { parentUserId: q.sponsorId, parentNodeId: nodeByUserId.get(q.sponsorId)!.id, slot, level: nodeByUserId.get(q.sponsorId)!.level + 1 };
        }
      }
      if(!found){
        for(const n of sortedNodes){
          const o = simulatedPlacements.get(n.id) || [];
          if(o.length < 5){
            const slot = [1,2,3,4,5].find(s=> !o.includes(s))!;
            found = { parentUserId: n.userId, parentNodeId: n.id, slot, level: n.level + 1 };
            break;
          }
        }
      }
      if(!found){
        // ไม่มี node เลย — จะสร้าง root
        preview.push({ userId: user.id, displayName: user.displayName || `${user.firstName} ${user.lastName}`, memberCode: user.memberCode, status:'pending_root', reason: q.reason || 'รอสร้างตำแหน่งแรก' });
        continue;
      }
      // จอง slot จำลองเพื่อคนถัดไป
      if(!simulatedPlacements.has(found.parentNodeId)) simulatedPlacements.set(found.parentNodeId, []);
      simulatedPlacements.get(found.parentNodeId)!.push(found.slot);
      preview.push({ userId: user.id, displayName: user.displayName || `${user.firstName} ${user.lastName}`, memberCode: user.memberCode, status:'will_place', parentUserId: found.parentUserId, slot: found.slot, level: found.level, reason: q.reason || null });
    }

    return NextResponse.json({
      ok:true,
      queueLength: queue.length,
      preview,
      totalNodes: allNodes.length,
      totalPlacements: allPlacements.length,
    });
  }catch(e:any){
    console.error('preview-run', e);
    return NextResponse.json({ ok:false, error:'เกิดข้อผิดพลาด' }, { status:500 });
  }
}
