import { NextRequest, NextResponse } from 'next/server';
import { simulate781, SIMULATE_781_TOTAL } from '@/lib/tree';

// GET /api/tree/simulate — โหมดจำลอง 781 ตำแหน่ง (แยกจากข้อมูลจริง ไม่สร้างสมาชิกจริง)
export async function GET(req: NextRequest){
  const { searchParams } = new URL(req.url);
  const level = parseInt(searchParams.get('level') || '4');
  const clamped = Math.max(0, Math.min(4, isNaN(level) ? 4 : level));
  const table = simulate781();
  const slice = table.filter(r=> r.level <= clamped);
  const total = slice[slice.length-1]?.totalUpToLevel || 0;
  return NextResponse.json({
    ok:true,
    note:'ตัวเลขนี้เป็นจำนวนตำแหน่งตามแบบจำลอง ไม่ใช่จำนวนสมาชิกจริงหรือการรับประกันรายได้',
    table,
    requestedLevel: clamped,
    totalUpToRequested: total,
    maxTotal: SIMULATE_781_TOTAL,
    breakdown: { '1':1, '5':5, '25':25, '125':125, '625':625, total:781 },
    description:'แต่ละชั้นมี 1, 5, 25, 125, 625 ตำแหน่ง รวม 781 ตำแหน่งเมื่อรวมจุดเริ่มต้นถึงชั้นที่ 4',
  });
}
