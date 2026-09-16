import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

// POST /api/tree/place-member — BFS 5-wide พร้อม transaction + idempotencyKey + row lock
export async function POST(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.headers.get('authorization')?.replace('Bearer ','') || '';
    const payload = token ? verifyToken(token) : null;
    // ต้องมี tree.manage
    if(payload){
      const roles = (payload as any).roles || ((payload as any).role ? [(payload as any).role] : []);
      const isAdmin = roles.includes('admin') || roles.includes('super_admin');
      if(!isAdmin){
        // ตรวจ DB permission
        const actorRoles = await prisma.userRole.findMany({ where:{ userId:(payload as any).sub }, include:{ role:{ include:{ permissions:true } } } }).catch(()=>[]);
        const permKeys = actorRoles.flatMap((ur:any)=> ur.role.permissions.map((rp:any)=> rp.permission.key));
        if(!permKeys.includes('tree.manage')) return NextResponse.json({ ok:false, error:'ไม่มีสิทธิรันจัดวาง — ต้องมี tree.manage' }, { status:403 });
      }
    }

    const { childId, idempotencyKey, parentId: requestedParentId } = await req.json();
    if(!childId) return NextResponse.json({ ok:false, error:'กรุณาระบุ childId' }, { status:400 });

    // Idempotency: ถ้ามี key นี้อยู่แล้ว ส่งผลเดิมกลับ (ไม่จัดวางซ้ำ)
    if(idempotencyKey){
      const existing = await prisma.treePlacement.findUnique({ where:{ idempotencyKey } }).catch(()=>null);
      if(existing) return NextResponse.json({ ok:true, placement: existing, idempotent:true });
    }

    // ตรวจว่าลูกมีอยู่และยังไม่จัดวาง
    const childUser = await prisma.user.findUnique({ where:{ id: childId } });
    if(!childUser) return NextResponse.json({ ok:false, error:'ไม่พบสมาชิก' }, { status:404 });
    const existingPlacement = await prisma.treePlacement.findUnique({ where:{ childId } }).catch(()=>null);
    if(existingPlacement) return NextResponse.json({ ok:false, error:'สมาชิกนี้ถูกจัดวางแล้ว' }, { status:409 });

    // ต้องเป็นตัวแทนที่ผ่านอนุมัติแล้ว (สเปค: นำสมาชิกจริงที่ผ่านสถานะตัวแทนเข้าสู่คิว)
    // อนุญาตให้ rankLevel >=1 หรือ status ACTIVE
    if((childUser.rankLevel ?? 0) < 1 && childUser.status !== 'ACTIVE'){
      return NextResponse.json({ ok:false, error:'สมาชิกต้องผ่านสถานะตัวแทนก่อนจัดวาง' }, { status:400 });
    }

    // หา parent ที่เหมาะสม: ใช้ sponsorId เป็นจุดเริ่ม BFS (ถ้ามี)
    const sponsorId = (childUser as any).sponsorId || requestedParentId || null;

    // Transaction: lock parent row + insert placement + update directCount + history
    const result = await prisma.$transaction(async (tx:any)=>{
      // หา parent node ที่ว่างด้วย BFS (อ่านจาก tx)
      const allNodes: any[] = await tx.treeNode.findMany({ select:{ id:true, userId:true, level:true } });
      const allPlacements: any[] = await tx.treePlacement.findMany({ select:{ parentId:true, slot:true, childId:true } });

      // ถ้าไม่มี TreeNode เลย — สร้าง root จาก sponsor หรือคนแรก
      if(allNodes.length === 0){
        if(sponsorId){
          const sponsorNode = await tx.treeNode.create({ data:{ userId: sponsorId, level:0 } });
          const slot = 1;
          const placement = await tx.treePlacement.create({
            data:{ parentId: sponsorNode.id, childId, slot, level:1, reason:'BFS root', idempotencyKey: idempotencyKey || undefined }
          });
          await tx.treeNode.update({ where:{ id: sponsorNode.id }, data:{ directCount:1 } });
          await tx.user.update({ where:{ id: childId }, data:{ placementParentId: sponsorId } });
          await tx.placementHistory.create({ data:{ userId: childId, parentId: sponsorNode.id, slot, level:1, action:'placed', reason:'BFS root' } });
          // สร้าง TreeNode ให้ child ด้วย
          await tx.treeNode.create({ data:{ userId: childId, level:1 } }).catch(()=>null);
          return placement;
        }
        return null;
      }

      // สร้าง helper สำหรับ BFS
      const nodeByUserId = new Map<string, any>(allNodes.map((n:any)=> [n.userId, n]));
      const nodeById = new Map<string, any>(allNodes.map((n:any)=> [n.id, n]));
      const placementsByParent = new Map<string, number[]>();
      const childrenByParentUserId = new Map<string, string[]>();
      for(const p of allPlacements){
        if(!placementsByParent.has(p.parentId)) placementsByParent.set(p.parentId, []);
        placementsByParent.get(p.parentId)!.push(p.slot);
        const parentNode = nodeById.get(p.parentId);
        if(parentNode){
          if(!childrenByParentUserId.has(parentNode.userId)) childrenByParentUserId.set(parentNode.userId, []);
          childrenByParentUserId.get(parentNode.userId)!.push(p.childId);
        }
      }

      let target: { parentNodeId:string; parentUserId:string; slot:number; level:number } | null = null;

      // ลองจาก sponsor ก่อน
      if(sponsorId && nodeByUserId.has(sponsorId)){
        const occ = placementsByParent.get(nodeByUserId.get(sponsorId)!.id) || [];
        if(occ.length < 5){
          const slot = [1,2,3,4,5].find(s=> !occ.includes(s))!;
          target = { parentNodeId: nodeByUserId.get(sponsorId)!.id, parentUserId: sponsorId, slot, level: nodeByUserId.get(sponsorId)!.level + 1 };
        } else {
          // BFS จาก sponsor
          const queue: string[] = [sponsorId];
          const visited = new Set<string>([sponsorId]);
          while(queue.length && !target){
            const cur = queue.shift()!;
            const childs = childrenByParentUserId.get(cur) || [];
            for(const c of childs){ if(!visited.has(c)){ visited.add(c); queue.push(c); } }
            if(cur !== sponsorId){
              const curNode = nodeByUserId.get(cur);
              if(curNode){
                const cOcc = placementsByParent.get(curNode.id) || [];
                if(cOcc.length < 5){
                  const slot = [1,2,3,4,5].find(s=> !cOcc.includes(s))!;
                  target = { parentNodeId: curNode.id, parentUserId: cur, slot, level: curNode.level + 1 };
                  break;
                }
              }
            }
          }
        }
      }

      // Fallback global BFS
      if(!target){
        const sorted = [...allNodes].sort((a,b)=> a.level - b.level);
        for(const n of sorted){
          const o = placementsByParent.get(n.id) || [];
          if(o.length < 5){
            const slot = [1,2,3,4,5].find(s=> !o.includes(s))!;
            target = { parentNodeId: n.id, parentUserId: n.userId, slot, level: n.level + 1 };
            break;
          }
        }
      }

      if(!target) throw new Error('ไม่มีตำแหน่งว่างในผัง');

      // Lock parent row
      await tx.$queryRaw`SELECT id FROM "TreeNode" WHERE id = ${target.parentNodeId} FOR UPDATE`;

      // Insert placement — unique(parentId,slot) จะกันซ้ำถ้ามีคนกดพร้อมกัน
      const placement = await tx.treePlacement.create({
        data:{
          parentId: target.parentNodeId,
          childId,
          slot: target.slot,
          level: target.level,
          reason: 'BFS level-order tie-break คงที่',
          idempotencyKey: idempotencyKey || undefined,
          policy: 'STRICT_HISTORY'
        }
      });
      await tx.treeNode.update({ where:{ id: target.parentNodeId }, data:{ directCount:{ increment:1 } } });
      await tx.user.update({ where:{ id: childId }, data:{ placementParentId: target.parentUserId } });
      await tx.placementHistory.create({ data:{ userId: childId, parentId: target.parentNodeId, slot: target.slot, level: target.level, action:'placed', reason:'BFS' } });
      // สร้าง TreeNode ให้ child เพื่อขยายต่อได้
      await tx.treeNode.create({ data:{ userId: childId, level: target.level } }).catch(()=>null);
      // ลบออกจากคิวถ้ามี
      await tx.placementQueue.delete({ where:{ userId: childId } }).catch(()=>null);
      return placement;
    });

    if(!result) return NextResponse.json({ ok:false, error:'ไม่สามารถจัดวางได้ — ไม่มีตำแหน่งว่าง' }, { status:500 });
    // แจ้งเตือนจัดวางผัง 1 แตก 5: สมาชิกที่ถูกวาง + แม่ทีม
    try{
      const { emitNotification } = await import('@/lib/notify');
      const pl:any = result;
      const child: any = await prisma.user.findUnique({ where:{ id: childId }, select:{ displayName:true, firstName:true } }).catch(()=>null);
      const parentNode: any = await prisma.treeNode.findUnique({ where:{ id: pl.parentId } }).catch(()=>null);
      const nm = child?.displayName || child?.firstName || 'สมาชิกใหม่';
      await emitNotification({ userId: childId, type:'tree_placed', title:'คุณถูกจัดวางในผัง 1 แตก 5 แล้ว', body:`ช่องที่ ${pl.slot} ระดับ ${pl.level}`, referenceId:'/tree' }).catch(()=>null);
      if(parentNode && parentNode.userId !== childId){
        await emitNotification({ userId: parentNode.userId, type:'tree_new_child', title:'มีสมาชิกใหม่ในผังของคุณ', body:`${nm} เข้าช่องที่ ${pl.slot}`, referenceId:'/tree' }).catch(()=>null);
      }
    }catch{}
    return NextResponse.json({ ok:true, placement: result });
  }catch(e:any){
    if(String(e.code)==='P2002'){
      return NextResponse.json({ ok:false, error:'ตำแหน่งนี้ถูกใช้งานแล้ว — กรุณาลองใหม่ (กันซ้ำด้วย unique constraint)' }, { status:409 });
    }
    console.error('place-member', e);
    return NextResponse.json({ ok:false, error: e.message || 'เกิดข้อผิดพลาด' }, { status:500 });
  }
}
