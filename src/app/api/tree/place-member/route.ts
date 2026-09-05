import { NextRequest, NextResponse } from 'next/server';
import { findPlacementParent } from '@/lib/tree';
// POST /api/tree/place-member — BFS 5-wide with idempotencyKey + row lock (see lib/tree.ts)
export async function POST(req: NextRequest){
  const { parentId, childId, idempotencyKey } = await req.json();
  // In production: wrap in Prisma $transaction with SELECT ... FOR UPDATE
  // Demo: mock BFS result
  return NextResponse.json({ ok:true, placement:{ parentId, childId, slot:2, level:2, policy:'STRICT_HISTORY', idempotencyKey, reason:'BFS level-order' } });
}
