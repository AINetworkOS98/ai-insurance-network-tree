import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase-admin';
import { PositionId } from '@/lib/types';

interface TreePosition {
  id: string;
  parentId?: string;
  childId?: string;
  slot?: number;
  level?: string;
  policy?: string;
}

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    
    // Get all tree positions
    const positionsSnap = await db.collection('treePositions').limit(100).get();
    const positions: TreePosition[] = [];
    positionsSnap.forEach(doc => {
      const data = doc.data();
      positions.push({
        id: doc.id,
        parentId: data.parentId,
        childId: data.childId,
        slot: data.slot,
        level: data.level,
        policy: data.policy,
      });
    });
    
    return NextResponse.json({ ok: true, positions });
    
  } catch (error: any) {
    console.error('Tree positions error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();
    
    // Validate required fields
    if (!body.parentId || !body.childId || body.slot === undefined) {
      return NextResponse.json({ ok: false, error: 'parentId, childId, slot required' }, { status: 400 });
    }
    
    // Check if slot is already occupied
    const existing = await db.collection('treePositions')
      .where('parentId', '==', body.parentId)
      .where('slot', '==', body.slot)
      .limit(1)
      .get();
    
    if (!existing.empty) {
      return NextResponse.json({ ok: false, error: 'Slot ' + body.slot + ' already occupied' }, { status: 409 });
    }
    
    // Check if childId already has a position
    const childCheck = await db.collection('treePositions')
      .where('childId', '==', body.childId)
      .limit(1)
      .get();
    
    if (!childCheck.empty) {
      return NextResponse.json({ ok: false, error: 'Child already has a tree position' }, { status: 409 });
    }
    
    // Create new position
    const newPositionRef = db.collection('treePositions').doc();
    await newPositionRef.set({
      parentId: body.parentId,
      childId: body.childId,
      slot: body.slot,
      level: body.level || 'agent',
      policy: body.policy || 'STRICT_HISTORY',
      createdAt: new Date(),
    });
    
    return NextResponse.json({ 
      ok: true, 
      positionId: newPositionRef.id,
      message: 'Member placed in tree successfully' 
    });
    
  } catch (error: any) {
    console.error('Tree place error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}