import { NextRequest, NextResponse } from 'next/server';
import { calculateTotalIncome, PositionId, INITIAL_PLAN_VERSION } from '@/lib/calculationEngine';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';

const rankToPosition: Record<number, PositionId> = {
  0: 'agent',
  1: 'unit_manager',
  2: 'center_manager',
  3: 'region_manager',
  4: 'executive_region',
};

function asNumber(value: unknown): number {
  return Number(value || 0);
}

function sumPerformance(rows: Array<{ type: string; amount: unknown }>) {
  const sum = (types: string[]) => rows
    .filter(row => types.includes(String(row.type).toLowerCase()))
    .reduce((total, row) => total + asNumber(row.amount), 0);

  return {
    fyc: sum(['fyc', 'first_year_premium']),
    com: sum(['com', 'commission']),
    firstYearPremium: sum(['first_year_premium']),
    renewalPremium: sum(['renewal', 'renewal_premium']),
  };
}

// GET /api/income/summary — รายงานสรุปยอด (verified / pending / rejected + ธุรกรรม)
// เห็นได้ระดับตัวแทนขึ้นไป (หัวหน้าหน่วย ศูนย์ ภาค)
export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    const payload: any = token ? verifyToken(token) : null;
    if (!payload?.sub) return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    const userId = String(payload.sub);
    // ดึง rank ปัจจุบันจาก DB (token อาจ stale)
    const me = await prisma.user.findUnique({ where:{ id:userId }, select:{ rankLevel:true } }).catch(()=>null);
    const rank = me?.rankLevel ?? (payload.rankLevel ?? 0);
    if (rank < 1) return NextResponse.json({ ok:false, error:'รายงานนี้สำหรับระดับตัวแทนขึ้นไป' }, { status:403 });

    // ยอดรับรองแล้ว + ธุรกรรมย้อนหลัง จาก performanceLedger
    const ledgers: any[] = await prisma.performanceLedger.findMany({
      orderBy:{ createdAt:'desc' }, take:200,
      select:{ type:true, amount:true, status:true, period:true, createdAt:true },
    }).catch(()=>[]);
    const verified = ledgers.filter(l => String(l.status)==='active').reduce((s,l)=> s + Number(l.amount||0), 0);

    // รอตรวจ / ไม่ผ่าน จากใบเสร็จ (ดึงยอดจาก extraction ล่าสุด)
    const pendingRows: any[] = await prisma.receiptFile.findMany({
      where:{ status:{ in:['Uploaded','Extracted','PendingVerification'] } },
      include:{ extractions:{ orderBy:{ createdAt:'desc' }, take:1 } },
    }).catch(()=>[]);
    const rejectedRows: any[] = await prisma.receiptFile.findMany({
      where:{ status:{ in:['Rejected','Duplicate','Reversed'] } },
      include:{ extractions:{ orderBy:{ createdAt:'desc' }, take:1 } },
    }).catch(()=>[]);
    const pending = pendingRows.reduce((s,r)=> s + Number(r.extractions?.[0]?.amount||0), 0);
    const rejected = rejectedRows.reduce((s,r)=> s + Number(r.extractions?.[0]?.amount||0), 0);

    return NextResponse.json({
      ok:true,
      rank,
      verified,
      pending,
      rejected,
      transactions: ledgers,
    });
  } catch (e:any) {
    console.error('income summary GET error:', e);
    return NextResponse.json({ ok:false, error:e?.message || 'โหลดรายงานไม่สำเร็จ' }, { status:500 });
  }
}

// POST /api/income/summary
// ใช้สมาชิกและผลงานที่บันทึกจริงจากฐานข้อมูลเท่านั้น — ไม่รับยอดจาก browser
export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
    const payload: any = token ? verifyToken(token) : null;
    if (!payload?.sub) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบ' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(String(body.period || ''))
      ? String(body.period)
      : new Date().toISOString().slice(0, 7);
    const userId = String(payload.sub);

    const member = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, rankLevel: true, status: true },
    });
    if (!member) return NextResponse.json({ ok: false, error: 'ไม่พบสมาชิก' }, { status: 404 });

    // สร้างรายชื่อทีมจากผังจริง TreePlacement (ลูกทุกระดับ)
    const placements = await prisma.treePlacement.findMany({
      select: { childId: true, parent: { select: { userId: true } } },
    });
    const children = new Map<string, string[]>();
    for (const placement of placements) {
      const parentUserId = placement.parent.userId;
      const list = children.get(parentUserId) || [];
      list.push(placement.childId);
      children.set(parentUserId, list);
    }
    const descendants: string[] = [];
    const queue = [...(children.get(userId) || [])];
    const seen = new Set<string>();
    while (queue.length) {
      const childId = queue.shift()!;
      if (seen.has(childId)) continue;
      seen.add(childId);
      descendants.push(childId);
      queue.push(...(children.get(childId) || []));
    }

    const activeTeam = descendants.length
      ? await prisma.user.findMany({
          where: { id: { in: descendants }, status: 'ACTIVE' },
          select: { id: true, rankLevel: true },
        })
      : [];
    const activeTeamIds = activeTeam.map(user => user.id);
    const performance = await prisma.performanceRecord.findMany({
      where: { userId: { in: [userId, ...activeTeamIds] }, period },
      select: { userId: true, type: true, amount: true },
    });

    const personal = sumPerformance(performance.filter(row => row.userId === userId));
    const team = sumPerformance(performance.filter(row => row.userId !== userId));
    const positionId = rankToPosition[member.rankLevel] || 'agent';
    const result = calculateTotalIncome({
      memberId: userId,
      positionId,
      period,
      planVersion: INITIAL_PLAN_VERSION,
      personalFYC: personal.fyc,
      teamFYC: team.fyc,
      personalCOM: personal.com,
      teamCOM: team.com,
      firstYearPremium: personal.firstYearPremium,
      renewalPremium: personal.renewalPremium,
      directMembersCount: (children.get(userId) || []).length,
      activeMembersCount: activeTeamIds.length,
      separatedUnitsCount: activeTeam.filter(user => user.rankLevel === 1).length,
      separatedCentersCount: activeTeam.filter(user => user.rankLevel === 2).length,
      separatedRegionsCount: activeTeam.filter(user => user.rankLevel >= 3).length,
      annualFYC: team.fyc * 12,
      annualCOM: team.com * 12,
      status: member.status === 'ACTIVE' ? 'active' : 'inactive',
    });

    return NextResponse.json({
      ok: true,
      result,
      source: {
        period,
        memberId: userId,
        directMembers: (children.get(userId) || []).length,
        activeTeamMembers: activeTeamIds.length,
        performanceRecords: performance.length,
        basis: 'registration-user + tree-placement + performance-record',
      },
    });
  } catch (error: any) {
    console.error('Income summary error:', error);
    return NextResponse.json({ ok: false, error: error.message || 'คำนวณผลประโยชน์ไม่สำเร็จ' }, { status: 500 });
  }
}
