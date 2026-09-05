// Placement Tree BFS 5-wide — core algorithm
export type PlacementRequest = { parentId: string; childId: string; idempotencyKey?: string };
export type TreeNodeData = { id:string; parentId:string|null; slot:number|null; level:number; children:string[] };

// In-memory BFS for demo / also used server-side with DB transaction
export function findPlacementParent(
  nodes: Map<string, TreeNodeData>,
  placements: Map<string, number[]>, // parentId -> occupied slots
  requestedParentId: string
): { parentId:string; slot:number; level:number } | null {
  // 1) try requested parent
  const occ = placements.get(requestedParentId) || [];
  if (occ.length < 5) {
    const slot = [1,2,3,4,5].find(s=>!occ.includes(s))!;
    const level = (nodes.get(requestedParentId)?.level ?? 0) + 1;
    return { parentId: requestedParentId, slot, level };
  }
  // 2) BFS level-order from requested parent downward
  const queue: string[] = [requestedParentId];
  const visited = new Set<string>([requestedParentId]);
  while (queue.length) {
    const cur = queue.shift()!;
    const curNode = nodes.get(cur);
    if (!curNode) continue;
    // enqueue children first (breadth)
    for (const childId of curNode.children) {
      if (!visited.has(childId)) {
        visited.add(childId);
        queue.push(childId);
      }
    }
    // check if cur has vacancy (skip root already checked as requestedParent except we already did)
    if (cur !== requestedParentId) {
      const cOcc = placements.get(cur) || [];
      if (cOcc.length < 5) {
        const slot = [1,2,3,4,5].find(s=>!cOcc.includes(s))!;
        const lvl = (nodes.get(cur)?.level ?? 0) + 1;
        return { parentId: cur, slot, level: lvl };
      }
    } else {
      // For requested parent we already checked, but still need to BFS deeper: add its children already queued
    }
  }
  // Fallback: BFS across all nodes sorted by level then id (global)
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

// DB transaction pseudo for API route (documented):
export const PLACEMENT_SQL = `
-- ใช้ Transaction + Row Lock ป้องกัน Slot ซ้ำ
BEGIN;
SELECT id FROM "TreeNode" WHERE id = $1 FOR UPDATE;
-- ตรวจสอบลูก <5 แล้ว INSERT ... ON CONFLICT (parentId, slot) DO NOTHING
-- Idempotency: UNIQUE(idempotencyKey)
COMMIT;
`;
