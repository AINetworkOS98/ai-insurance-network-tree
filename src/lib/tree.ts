// Placement Tree BFS 5-wide — core algorithm + DB transaction
export type PlacementRequest = { parentId: string; childId: string; idempotencyKey?: string };
export type TreeNodeData = { id:string; parentId:string|null; slot:number|null; level:number; children:string[] };

// In-memory BFS for demo / also used server-side with DB transaction
export function findPlacementParent(
  nodes: Map<string, TreeNodeData>,
  placements: Map<string, number[]>, // parentId -> occupied slots
  requestedParentId: string
): { parentId:string; slot:number; level:number } | null {
  const occ = placements.get(requestedParentId) || [];
  if (occ.length < 5) {
    const slot = [1,2,3,4,5].find(s=>!occ.includes(s))!;
    const level = (nodes.get(requestedParentId)?.level ?? 0) + 1;
    return { parentId: requestedParentId, slot, level };
  }
  const queue: string[] = [requestedParentId];
  const visited = new Set<string>([requestedParentId]);
  while (queue.length) {
    const cur = queue.shift()!;
    const curNode = nodes.get(cur);
    if (!curNode) continue;
    for (const childId of curNode.children) {
      if (!visited.has(childId)) { visited.add(childId); queue.push(childId); }
    }
    if (cur !== requestedParentId) {
      const cOcc = placements.get(cur) || [];
      if (cOcc.length < 5) {
        const slot = [1,2,3,4,5].find(s=>!cOcc.includes(s))!;
        const lvl = (nodes.get(cur)?.level ?? 0) + 1;
        return { parentId: cur, slot, level: lvl };
      }
    }
  }
  const sorted = [...nodes.values()].sort((a,b)=> a.level - b.level || a.id.localeCompare(b.id));
  for(const n of sorted){
    const o = placements.get(n.id) || [];
    if(o.length < 5) {
      const slot = [1,2,3,4,5].find(s=>!o.includes(s))!;
      return { parentId: n.id, slot, level: n.level+1 };
    }
  }
  return null;
}

export const PLACEMENT_SQL = `
-- ใช้ Transaction + Row Lock ป้องกัน Slot ซ้ำ
BEGIN;
SELECT id FROM "TreeNode" WHERE id = $1 FOR UPDATE;
-- ตรวจสอบลูก <5 แล้ว INSERT ... ON CONFLICT (parentId, slot) DO NOTHING
-- Idempotency: UNIQUE(idempotencyKey)
COMMIT;
`;

// ── DB helpers — ใช้ใน API routes ───────────────────────────

// BFS หาตำแหน่งว่างจาก DB (จำกัดขอบเขตทีมได้)
export async function findNextPlacementSlotDB(
  prisma: any,
  requestedParentUserId: string | null, // userId ของผู้แนะนำ (หรือ null = global BFS)
  excludeUserIds: Set<string> = new Set(),
): Promise<{ parentNodeId:string; parentUserId:string; slot:number; level:number } | null> {
  // โหลด TreeNode ทั้งหมดที่เกี่ยวข้อง (จำกัดขอบเขตถ้ามี requestedParent)
  // สำหรับ MVP: โหลดทั้งหมดแล้ว BFS ในหน่วยความจำ — ป้องกันด้วย transaction ตอน insert
  const allNodes: any[] = await prisma.treeNode.findMany({ select:{ id:true, userId:true, level:true } });
  const allPlacements: any[] = await prisma.treePlacement.findMany({ select:{ parentId:true, slot:true, childId:true } });

  const nodeByUserId = new Map<string, any>(allNodes.map((n:any)=> [n.userId, n]));
  const nodeById = new Map<string, any>(allNodes.map((n:any)=> [n.id, n]));
  const placementsByParent = new Map<string, number[]>();
  const childrenByParent = new Map<string, string[]>();

  for(const p of allPlacements){
    if(!placementsByParent.has(p.parentId)) placementsByParent.set(p.parentId, []);
    placementsByParent.get(p.parentId)!.push(p.slot);
    // children mapping: parentUserId -> childUserIds (ผ่าน TreeNode)
    const parentNode = nodeById.get(p.parentId);
    if(parentNode){
      if(!childrenByParent.has(parentNode.userId)) childrenByParent.set(parentNode.userId, []);
      // childId คือ userId ของลูก (TreePlacement.childId = User.id)
      // ต้องหา childUserId
      const childNode = allNodes.find((n:any)=> n.userId === p.childId);
      // ถ้ายังไม่มี TreeNode สำหรับ child (ยังไม่จัดวาง) ให้ข้าม
    }
  }

  // สร้าง children list สำหรับ BFS: จาก TreePlacement parentId -> child UserIds
  // แม็ป parentNodeId -> child UserIds
  const childrenUserIdsByParentUserId = new Map<string, string[]>();
  for(const p of allPlacements){
    const parentNode = nodeById.get(p.parentId);
    if(!parentNode) continue;
    if(!childrenUserIdsByParentUserId.has(parentNode.userId)) childrenUserIdsByParentUserId.set(parentNode.userId, []);
    // childId เป็น User.id โดยตรง
    childrenUserIdsByParentUserId.get(parentNode.userId)!.push(p.childId);
  }

  // ถ้ามี requestedParent → BFS จากจุดนั้น
  if(requestedParentUserId && nodeByUserId.has(requestedParentUserId)){
    const occ = placementsByParent.get(nodeByUserId.get(requestedParentUserId)!.id) || [];
    if(occ.length < 5){
      const slot = [1,2,3,4,5].find(s=> !occ.includes(s))!;
      return { parentNodeId: nodeByUserId.get(requestedParentUserId)!.id, parentUserId: requestedParentUserId, slot, level: nodeByUserId.get(requestedParentUserId)!.level + 1 };
    }
    // BFS
    const queue: string[] = [requestedParentUserId];
    const visited = new Set<string>([requestedParentUserId]);
    while(queue.length){
      const curUserId = queue.shift()!;
      const childs = childrenUserIdsByParentUserId.get(curUserId) || [];
      for(const c of childs){ if(!visited.has(c)){ visited.add(c); queue.push(c); } }
      if(curUserId !== requestedParentUserId){
        const curNode = nodeByUserId.get(curUserId);
        if(!curNode) continue;
        const cOcc = placementsByParent.get(curNode.id) || [];
        if(cOcc.length < 5){
          const slot = [1,2,3,4,5].find(s=> !cOcc.includes(s))!;
          return { parentNodeId: curNode.id, parentUserId: curUserId, slot, level: curNode.level + 1 };
        }
      }
    }
  }

  // Global BFS: เรียงตาม level แล้วหาช่องว่างแรก
  const sortedNodes = [...allNodes].sort((a,b)=> a.level - b.level);
  for(const n of sortedNodes){
    const o = placementsByParent.get(n.id) || [];
    if(o.length < 5){
      const slot = [1,2,3,4,5].find(s=> !o.includes(s))!;
      return { parentNodeId: n.id, parentUserId: n.userId, slot, level: n.level + 1 };
    }
  }
  // ถ้าไม่มี TreeNode เลย (ระบบใหม่) — ให้ root เป็นคนแรกที่มี TreeNode
  if(allNodes.length === 0) return null;
  return null;
}

// สร้าง TreeNode ให้ผู้ใช้ถ้ายังไม่มี (สำหรับ root หรือผู้ที่เพิ่งผ่านอนุมัติตัวแทน)
export async function ensureTreeNode(prisma:any, userId:string, level:number = 0){
  let node = await prisma.treeNode.findUnique({ where:{ userId } });
  if(!node){
    node = await prisma.treeNode.create({ data:{ userId, level, directCount:0 } });
  }
  return node;
}

// จำลอง 781 ตำแหน่ง: 1 + 5 + 25 + 125 + 625 (ชั้น 0-4) — แยกจากข้อมูลจริง ไม่สร้างสมาชิกจริง
export function simulate781(): { level:number; countAtLevel:number; totalUpToLevel:number }[] {
  const out = [];
  let total = 0;
  for(let lvl=0; lvl<=4; lvl++){
    const count = Math.pow(5, lvl);
    total += count;
    out.push({ level: lvl, countAtLevel: count, totalUpToLevel: total });
  }
  return out; // สุดท้าย total = 781
}
export const SIMULATE_781_TOTAL = 781;
