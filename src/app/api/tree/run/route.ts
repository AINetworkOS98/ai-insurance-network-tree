import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import crypto from 'crypto';

// POST /api/tree/run — รันจัดวางอัตโนมัติ (ต้องมี tree.manage + ขอบเขตทีม)
// Body: { scopeTeamId?, idempotencyKey? }
export async function POST(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.headers.get('authorization')?.replace('Bearer ','') || '';
    const payload = token ? verifyToken(token) : null;
    if(!payload) return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    const actorId = (payload as any).sub;

    // ตรวจสิทธิ
    const roles = (payload as any).roles || ((payload as any).role ? [(payload as any).role] : []);
    let hasPerm = roles.includes('admin') || roles.includes('super_admin');
    if(!hasPerm){
      const actorRoles = await prisma.userRole.findMany({ where:{ userId: actorId }, include:{ role:{ include:{ permissions:true } } } }).catch(()=>[]);
      const permKeys = actorRoles.flatMap((ur:any)=> ur.role.permissions.map((rp:any)=> rp.permission.key));
      hasPerm = permKeys.includes('tree.manage');
    }
    if(!hasPerm) return NextResponse.json({ ok:false, error:'ไม่มีสิทธิรันจัดวาง — ต้องมี tree.manage' }, { status:403 });

    const body = await req.json().catch(()=>({}));
    const idempotencyKey: string | undefined = body.idempotencyKey || `run-${actorId}-${Date.now()}`;
    const scopeTeamId: string | undefined = body.scopeTeamId;

    // Idempotency: ถ้ามี run ด้วย key นี้แล้ว ส่งกลับเลย
    if(idempotencyKey){
      const existing = await prisma.placementRun.findUnique({ where:{ idempotencyKey } }).catch(()=>null);
      if(existing) return NextResponse.json({ ok:true, run: existing, idempotent:true });
    }

    const jobId = `job-${crypto.randomBytes(8).toString('hex')}`;
    const queue = await prisma.placementQueue.findMany({
      include:{ user:true },
      orderBy:{ queueNo:'asc' }, take:100
    });

    const run = await prisma.placementRun.create({
      data:{
        jobId,
        idempotencyKey,
        status:'running',
        startedBy: actorId,
        totalQueued: queue.length,
        scopeTeamId: scopeTeamId || null,
      }
    });

    // รันแบบ background (จำลอง synchronous ใน request นี้ แต่ idempotent + ไม่ซ้ำ)
    // ใน production ควรใช้ queue worker — ที่นี่รันทีละคนใน transaction
    let success=0, skipped=0, failed=0;

    for(const q of queue){
      // เช็ค pause
      const curRun = await prisma.placementRun.findUnique({ where:{ id: run.id } });
      if(curRun?.status === 'paused'){
        await prisma.placementRunEntry.create({ data:{ runId: run.id, userId: q.userId, status:'skipped', reason:'พักการรัน' } });
        skipped++;
        continue;
      }

      const user = q.user as any;
      const isAgent = (user.rankLevel ?? 0) >= 1 || user.status === 'ACTIVE';
      if(!isAgent){
        await prisma.placementRunEntry.create({ data:{ runId: run.id, userId: q.userId, status:'skipped', reason:'ยังไม่ผ่านสถานะตัวแทน' } });
        skipped++;
        continue;
      }
      // ขอบเขตทีม: ถ้ามี scopeTeamId ให้ตรวจว่า sponsor อยู่ในทีมนั้น (simplified: ข้ามถ้าไม่ตรง)
      // MVP: ไม่กรอง — รันทั้งหมดในขอบเขตที่ได้รับสิทธิ

      try{
        // เรียก logic เดียวกับ place-member แต่ inline เพื่อ idempotency
        const childId = q.userId;
        const existingPlacement = await prisma.treePlacement.findUnique({ where:{ childId } }).catch(()=>null);
        if(existingPlacement){
          await prisma.placementRunEntry.create({ data:{ runId: run.id, userId: childId, status:'skipped', reason:'จัดวางแล้ว' } });
          skipped++;
          continue;
        }

        // หา placement slot แบบ transaction (reuse logic)
        // ใช้ $transaction เดียวกับ place-member
        const placement = await prisma.$transaction(async (tx:any)=>{
          const allNodes: any[] = await tx.treeNode.findMany({ select:{ id:true, userId:true, level:true } });
          const allPlacements: any[] = await tx.treePlacement.findMany({ select:{ parentId:true, slot:true } });
          const nodeByUserId = new Map<string, any>(allNodes.map((n:any)=> [n.userId, n]));
          const nodeById = new Map<string, any>(allNodes.map((n:any)=> [n.id, n]));
          const placementsByParent = new Map<string, number[]>();
          const childrenByParentUserId = new Map<string, string[]>();
          for(const p of allPlacements){
            if(!placementsByParent.has(p.parentId)) placementsByParent.set(p.parentId, []);
            placementsByParent.get(p.parentId)!.push(p.slot);
            const pn = nodeById.get(p.parentId);
            if(pn){
              if(!childrenByParentUserId.has(pn.userId)) childrenByParentUserId.set(pn.userId, []);
              childrenByParentUserId.get(pn.userId)!.push(p.childId || '');
            }
          }

          // ถ้าไม่มี node เลย — สร้าง root จาก sponsor
          if(allNodes.length === 0){
            const sponsorId = user.sponsorId;
            if(!sponsorId) throw new Error('ไม่มีตำแหน่งว่าง — ต้องมี root ก่อน');
            const sponsorNode = await tx.treeNode.create({ data:{ userId: sponsorId, level:0 } });
            const slot = 1;
            const pl = await tx.treePlacement.create({ data:{ parentId: sponsorNode.id, childId, slot, level:1, reason:'BFS auto run root' } });
            await tx.treeNode.update({ where:{ id: sponsorNode.id }, data:{ directCount:1 } });
            await tx.user.update({ where:{ id: childId }, data:{ placementParentId: sponsorId } });
            await tx.treeNode.create({ data:{ userId: childId, level:1 } }).catch(()=>null);
            await tx.placementQueue.delete({ where:{ userId: childId } }).catch(()=>null);
            return pl;
          }

          let target: any = null;
          const sponsorId = user.sponsorId;
          if(sponsorId && nodeByUserId.has(sponsorId)){
            const occ = placementsByParent.get(nodeByUserId.get(sponsorId)!.id) || [];
            if(occ.length < 5){
              const slot = [1,2,3,4,5].find(s=> !occ.includes(s))!;
              target = { parentNodeId: nodeByUserId.get(sponsorId)!.id, parentUserId: sponsorId, slot, level: nodeByUserId.get(sponsorId)!.level + 1 };
            } else {
              const queueBfs: string[] = [sponsorId];
              const visited = new Set<string>([sponsorId]);
              while(queueBfs.length && !target){
                const cur = queueBfs.shift()!;
                const childs = childrenByParentUserId.get(cur) || [];
                for(const c of childs){ if(c && !visited.has(c)){ visited.add(c); queueBfs.push(c); } }
                if(cur !== sponsorId){
                  const curNode = nodeByUserId.get(cur);
                  if(curNode){
                    const cOcc = placementsByParent.get(curNode.id) || [];
                    if(cOcc.length < 5){
                      const slot = [1,2,3,4,5].find(s=> !cOcc.includes(s))!;
                      target = { parentNodeId: curNode.id, parentUserId: cur, slot, level: curNode.level + 1 };
                    }
                  }
                }
              }
            }
          }
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
          if(!target) throw new Error('ไม่มีตำแหน่งว่าง');

          await tx.$queryRaw`SELECT id FROM "TreeNode" WHERE id = ${target.parentNodeId} FOR UPDATE`;
          const pl = await tx.treePlacement.create({ data:{ parentId: target.parentNodeId, childId, slot: target.slot, level: target.level, reason:'BFS auto run' } });
          await tx.treeNode.update({ where:{ id: target.parentNodeId }, data:{ directCount:{ increment:1 } } });
          await tx.user.update({ where:{ id: childId }, data:{ placementParentId: target.parentUserId } });
          await tx.placementHistory.create({ data:{ userId: childId, parentId: target.parentNodeId, slot: target.slot, level: target.level, action:'placed', reason:'auto run' } });
          await tx.treeNode.create({ data:{ userId: childId, level: target.level } }).catch(()=>null);
          await tx.placementQueue.delete({ where:{ userId: childId } }).catch(()=>null);
          return pl;
        });

        await prisma.placementRunEntry.create({ data:{ runId: run.id, userId: q.userId, parentId: (placement as any).parentId, slot: (placement as any).slot, status:'success' } });
        try{
          const { emitNotification } = await import('@/lib/notify');
          await emitNotification({ userId: q.userId, type:'tree_placed', title:'คุณถูกจัดวางในผัง 1 แตก 5 แล้ว', body:`ช่องที่ ${(placement as any).slot}`, referenceId:'/tree' }).catch(()=>null);
        }catch{}
        success++;
      }catch(e:any){
        const isSlotConflict = String(e.code)==='P2002' || String(e.message).includes('ว่าง');
        await prisma.placementRunEntry.create({ data:{ runId: run.id, userId: q.userId, status:'failed', reason: e.message?.slice(0,500) || 'ผิดพลาด' } });
        if(isSlotConflict) skipped++; else failed++;
      }
    }

    const finished = await prisma.placementRun.update({
      where:{ id: run.id },
      data:{ status:'completed', finishedAt: new Date(), totalSuccess: success, totalSkipped: skipped, totalFailed: failed }
    });

    return NextResponse.json({ ok:true, run: finished, jobId });
  }catch(e:any){
    console.error('tree/run', e);
    return NextResponse.json({ ok:false, error: e.message || 'เกิดข้อผิดพลาด' }, { status:500 });
  }
}

// PUT /api/tree/run — พัก/ต่อ
export async function PUT(req: NextRequest){
  try{
    const { jobId, action } = await req.json();
    if(!jobId || !['pause','resume'].includes(action)) return NextResponse.json({ ok:false, error:'กรุณาระบุ jobId และ action pause/resume' }, { status:400 });
    const run = await prisma.placementRun.findUnique({ where:{ jobId } });
    if(!run) return NextResponse.json({ ok:false, error:'ไม่พบ job' }, { status:404 });
    const nextStatus = action === 'pause' ? 'paused' : 'running';
    const updated = await prisma.placementRun.update({ where:{ jobId }, data:{ status: nextStatus } });
    return NextResponse.json({ ok:true, run: updated });
  }catch(e:any){
    return NextResponse.json({ ok:false, error:'เกิดข้อผิดพลาด' }, { status:500 });
  }
}
