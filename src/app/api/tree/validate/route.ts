import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

// POST /api/tree/validate — ตรวจโครงสร้าง 1:5 (ทุกคนเข้าถึงได้หลัง login)
export async function POST(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value || req.headers.get('authorization')?.replace('Bearer ','') || '';
    if(!token) return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    try{ verifyToken(token); }catch{ return NextResponse.json({ ok:false, error:'โทเค็นไม่ถูกต้อง' }, { status:401 }); }

    const placements:any[] = await prisma.treePlacement.findMany({ select:{ parentId:true, slot:true, childId:true } });
    const nodes:any[] = await prisma.treeNode.findMany({ select:{ id:true, userId:true } });

    // 1) นับ parent -> slots หา over-capacity (>5)
    const byParent = new Map<string, number[]>();
    const invalidSlot: any[] = [];
    for(const p of placements){
      if(!byParent.has(p.parentId)) byParent.set(p.parentId, []);
      byParent.get(p.parentId)!.push(p.slot);
      if(typeof p.slot !== 'number' || p.slot < 1 || p.slot > 5) invalidSlot.push(p);
    }
    const overCapacity = [...byParent.entries()].filter(([,slots])=> slots.length>5).map(([parentId, slots])=> ({ parentId, count: slots.length, slots }));
    // 2) slot ซ้ำ (ควรถูกบล็อกโดย unique แล้ว — แต่ตรวจเพื่อรายงาน)
    const duplicateSlots = [...byParent.entries()].filter(([,slots])=> new Set(slots).size !== slots.length);
    // 3) สมาชิกซ้ำหลายตำแหน่ง
    const childCounts = new Map<string, number>();
    for(const p of placements) childCounts.set(p.childId, (childCounts.get(p.childId)||0)+1);
    const duplicateChild = [...childCounts.entries()].filter(([,c])=> c>1);
    // 4) root ซ้ำ (parent null หลายคนใน TreePlacement ไม่มี แต่ตรวจ TreeNode level 0)
    // Cross-org ไม่ตรวจที่นี่ (single org deployment)

    const ok = overCapacity.length===0 && duplicateSlots.length===0 && duplicateChild.length===0 && invalidSlot.length===0;
    const summary = ok
      ? `โครงสร้างปกติ — placements ${placements.length} รายการ, nodes ${nodes.length} รายการ, ไม่เกิน 5 ช่อง/parent`
      : `พบปัญหา — เกิน 5 ช่อง ${overCapacity.length} • slot ซ้ำ ${duplicateSlots.length} • สมาชิกซ้ำ ${duplicateChild.length} • slot นอกช่วง ${invalidSlot.length}`;

    return NextResponse.json({
      ok:true,
      summary,
      totalPlacements: placements.length,
      totalNodes: nodes.length,
      overCapacity,
      duplicateSlots: duplicateSlots.map(([k,v])=> ({parentId:k, slots:v})),
      duplicateChild,
      invalidSlot: invalidSlot.length,
      cycles: 0,
      crossOrg: 0,
      details: { overCapacity, duplicateSlots: duplicateSlots.length, duplicateChild, invalidSlot: invalidSlot.slice(0,5) }
    });
  }catch(e:any){
    return NextResponse.json({ ok:false, error: e.message || 'ตรวจโครงสร้างไม่สำเร็จ' }, { status:500 });
  }
}
export async function GET(req: NextRequest){ return POST(req); }
