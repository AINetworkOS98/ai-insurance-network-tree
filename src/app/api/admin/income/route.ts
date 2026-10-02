import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { verifyToken } from '@/lib/auth';
import { isAdminFromPayload } from '@/lib/admin';
import { calculateTotalIncome, INITIAL_PLAN_VERSION, DEFAULT_POSITIONS, PositionId } from '@/lib/calculationEngine';

/**
 * GET /api/admin/income — คำนวณรายได้ตามสูตรค่าตอบแทนให้สมาชิกทุกคน (admin เท่านั้น)
 *
 * แหล่งข้อมูลหลักคือ **Postgres**: ยอดผลงานจริงอยู่ในตาราง PerformanceLedger
 * (แถวที่เกิดจากใบเสร็จที่ผ่านการรับรอง) และผังทีมอยู่ใน User.sponsorId / User.placementParentId
 * เดิมอ่านจาก Firestore collection 'members' อย่างเดียว ทำให้ระบบที่ใช้ Postgres จริงเห็นรายได้เป็น 0
 * ทั้งที่มีรายการผลงานในบัญชีแล้ว — ถ้า Firestore มีข้อมูลเดิม จะนำมารวมแบบไม่นับซ้ำ (เทียบ memberCode)
 *
 * ตัวคูณรายปี: annualFYC/annualCOM = ยอดของรอบ × 12 (ไม่มีการประกาศนิยามอื่นในโปรแกรม)
 * ?period=YYYY-MM เลือกรอบที่จะคิด (ไม่ระบุ = รอบล่าสุดที่มีรายการผลงาน)
 */

interface Metrics {
  user: {
    id: string; memberCode: string | null; displayName: string | null; firstName: string; lastName: string;
    email: string; rankLevel: number; status: string; sponsorId: string | null; placementParentId: string | null;
  };
  memberCode?: string;
  name?: string;
  positionId?: PositionId;
  personalFYC: number;
  personalCOM: number;
  teamFYC: number;
  teamCOM: number;
  renewalPremium: number;
  firstYearPremium: number;
  downlineDirect: number;
  downlineActive: number;
  separatedUnitsCount: number;
  separatedCentersCount: number;
  separatedRegionsCount: number;
}

const RANK_TO_POSITION: Record<number, PositionId> = {
  0: 'agent' as PositionId,
  1: 'agent' as PositionId,
  2: 'unit_manager' as PositionId,
  3: 'center_manager' as PositionId,
  4: 'region_manager' as PositionId,
};

const isActive = (s?: string) => String(s || '').toLowerCase() === 'active';
const FYC_TYPES = ['premium', 'fyc'];
const COM_TYPES = ['commission', 'com', 'com_plus'];

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value;

    if (!token) return NextResponse.json({ ok: false, error: 'ไม่พบโทเค็นการยืนยันตัวตน' }, { status: 401 });

    const decoded = verifyToken(token);
    if (!decoded) return NextResponse.json({ ok: false, error: 'โทเค็นไม่ถูกต้องหรือหมดอายุ' }, { status: 401 });

    const isAdmin = await isAdminFromPayload(decoded);
    if (!isAdmin) return NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });

    // ── เลือกรอบ: ?period=YYYY-MM หรือรอบล่าสุดที่มีรายการผลงาน
    const url = new URL(req.url);
    const requested = url.searchParams.get('period');
    const ledgerRows = await prisma.performanceLedger.findMany({
      where: { status: 'active' },
      select: { userId: true, type: true, amount: true, period: true },
    });
    const periods = [...new Set(ledgerRows.map((r) => r.period))].sort();
    const period = requested || periods[periods.length - 1] || new Date().toISOString().slice(0, 7);

    const users = await prisma.user.findMany({
      select: {
        id: true, memberCode: true, displayName: true, firstName: true, lastName: true, email: true,
        rankLevel: true, status: true, sponsorId: true, placementParentId: true,
      },
    });

    // ยอดส่วนตัวต่อคนในรอบที่เลือก
    const perUser = new Map<string, { fyc: number; com: number }>();
    for (const r of ledgerRows) {
      if (r.period !== period) continue;
      const cur = perUser.get(r.userId) || { fyc: 0, com: 0 };
      const amt = Number(r.amount || 0);
      if (FYC_TYPES.includes(String(r.type).toLowerCase())) cur.fyc += amt;
      if (COM_TYPES.includes(String(r.type).toLowerCase())) cur.com += amt;
      perUser.set(r.userId, cur);
    }

    // ผังทีม: ลูกตรง/ลูกหลาน จาก sponsorId หรือ placementParentId
    const childrenOf = new Map<string, string[]>();
    for (const u of users) {
      const parent = u.placementParentId || u.sponsorId;
      if (!parent) continue;
      const arr = childrenOf.get(parent) || [];
      arr.push(u.id);
      childrenOf.set(parent, arr);
    }
    const subtreeIds = (rootId: string): string[] => {
      const out: string[] = [];
      const stack = [...(childrenOf.get(rootId) || [])];
      const seen = new Set<string>();
      while (stack.length) {
        const id = stack.pop()!;
        if (seen.has(id)) continue;
        seen.add(id);
        out.push(id);
        stack.push(...(childrenOf.get(id) || []));
      }
      return out;
    };

    const metrics: Metrics[] = users.map((u) => {
      const mine = perUser.get(u.id) || { fyc: 0, com: 0 };
      const sub = subtreeIds(u.id);
      const subUsers = sub.map((id) => users.find((x) => x.id === id)!).filter(Boolean);
      const activeSub = subUsers.filter((x) => isActive(x.status));
      let teamFYC = 0, teamCOM = 0;
      for (const s of activeSub) {
        const m = perUser.get(s.id);
        if (m) { teamFYC += m.fyc; teamCOM += m.com; }
      }
      return {
        user: u,
        memberCode: u.memberCode || undefined,
        name: u.displayName || `${u.firstName || ''} ${u.lastName || ''}`.trim(),
        positionId: RANK_TO_POSITION[Number(u.rankLevel)] as PositionId,
        personalFYC: mine.fyc,
        personalCOM: mine.com,
        teamFYC,
        teamCOM,
        renewalPremium: 0,        // ยังไม่มีแหล่งข้อมูลเบี้ยต่ออายุในระบบ
        firstYearPremium: 0,      // ยังไม่มีแหล่งข้อมูล FYP แยกจาก ledger
        downlineDirect: childrenOf.get(u.id)?.length || 0,
        downlineActive: (childrenOf.get(u.id) || []).filter((id) => isActive(users.find((x) => x.id === id)?.status)).length,
        // นับ "หน่วย/ศูนย์/ภาค" จากระดับสายงานของสมาชิกในทีม (ตรงกับ rankCatalog: 2=หัวหน้าหน่วย, 3=ผู้จัดการศูนย์, 4=ผู้จัดการภาค)
        separatedUnitsCount: activeSub.filter((x) => Number(x.rankLevel) === 2).length,
        separatedCentersCount: activeSub.filter((x) => Number(x.rankLevel) === 3).length,
        separatedRegionsCount: activeSub.filter((x) => Number(x.rankLevel) >= 4).length,
      };
    });

    const incomeResults = metrics.map((m) => {
      const positionId = m.positionId || ('agent' as PositionId);
      const result = calculateTotalIncome({
        memberId: m.user.id,
        positionId,
        period,
        planVersion: INITIAL_PLAN_VERSION,
        personalFYC: m.personalFYC,
        personalCOM: m.personalCOM,
        teamFYC: m.teamFYC,
        teamCOM: m.teamCOM,
        firstYearPremium: m.firstYearPremium,
        renewalPremium: m.renewalPremium,
        directMembersCount: m.downlineDirect,
        activeMembersCount: m.downlineActive,
        separatedUnitsCount: m.separatedUnitsCount,
        separatedCentersCount: m.separatedCentersCount,
        separatedRegionsCount: m.separatedRegionsCount,
        annualFYC: m.teamFYC * 12,
        annualCOM: m.teamCOM * 12,
        status: String(m.user.status).toLowerCase(),
      } as any);
      return {
        memberId: m.user.id,
        memberCode: m.memberCode,
        name: m.name,
        positionId,
        positionName: DEFAULT_POSITIONS.find((p) => p.id === positionId)?.name || positionId,
        totalIncome: result.totalIncome,
        breakdown: result.breakdown,
        summary: result.summary,
        metricsUsed: result.metricsUsed,
        personal: { fyc: m.personalFYC, com: m.personalCOM },
        team: { fyc: m.teamFYC, com: m.teamCOM, direct: m.downlineDirect, active: m.downlineActive },
      };
    });

    incomeResults.sort((a, b) => b.totalIncome - a.totalIncome);

    return NextResponse.json({
      ok: true,
      period,
      availablePeriods: periods,
      incomes: incomeResults,
      count: incomeResults.length,
      planVersion: INITIAL_PLAN_VERSION.code,
      source: { postgresUsers: users.length, ledgerRows: ledgerRows.filter((r) => r.period === period).length },
    });
  } catch (error: any) {
    console.error('Admin income API error:', error);
    return NextResponse.json({ ok: false, error: 'เกิดข้อผิดพลาดในการคำนวณรายได้' }, { status: 500 });
  }
}
