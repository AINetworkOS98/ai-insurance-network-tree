import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';
import { calculateTotalIncome, INITIAL_PLAN_VERSION, DEFAULT_POSITIONS } from '@/lib/calculationEngine';

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || req.cookies.get('auth_token')?.value;
    
    if (!token) {
      return NextResponse.json({ ok: false, error: 'ไม่พบโทเค็นการยืนยันตัวตน' }, { status: 401 });
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ ok: false, error: 'โทเค็นไม่ถูกต้องหรือหมดอายุ' }, { status: 401 });
    }
    
    if (decoded.role !== 'admin' && decoded.role !== 'super_admin') {
      return NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });
    }
    
    const db = getDb();
    const membersSnap = await db.collection('members').where('status', '==', 'active').get();
    
    const members = membersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    
    // Calculate income for each member based on their position
    const incomeResults = [];
    
    for (const member of members) {
      const positionId = member.positionId || 'agent';
      const personalFYC = member.personalFYC || 0;
      const teamFYC = member.teamFYC || 0;
      const personalCOM = member.personalCOM || 0;
      const teamCOM = member.teamCOM || 0;
      const renewalPremium = member.renewalPremium || 0;
      const firstYearPremium = member.firstYearPremium || 0;
      const separatedUnitsCount = member.separatedUnitsCount || 0;
      const separatedCentersCount = member.separatedCentersCount || 0;
      const separatedRegionsCount = member.separatedRegionsCount || 0;
      
      // Get downline members for team metrics
      const downlineSnap = await db.collection('members')
        .where('parentMemberId', '==', member.id)
        .get();
      
      const downlineMembers = downlineSnap.docs.map(d => ({ id: d.id, ...d.data() }));
      const activeDownline = downlineMembers.filter(m => m.status === 'active');
      const teamFYCCalc = activeDownline.reduce((sum, m) => sum + (m.personalFYC || 0), 0);
      const teamCOMCalc = activeDownline.reduce((sum, m) => sum + (m.personalCOM || 0), 0);
      const totalUnits = activeDownline.filter(m => m.positionId === 'unit_manager' || m.positionId === 'senior_unit_manager').length;
      const totalCenters = activeDownline.filter(m => m.positionId === 'center_manager' || m.positionId === 'senior_center_manager').length;
      const totalRegions = activeDownline.filter(m => m.positionId === 'region_manager' || m.positionId === 'executive_region').length;
      
      const result = calculateTotalIncome({
        memberId: member.id,
        positionId: positionId as any,
        personalFYC,
        teamFYC: teamFYCCalc || teamFYC,
        personalCOM,
        teamCOM: teamCOMCalc || teamCOM,
        firstYearPremium,
        renewalPremium,
        directMembersCount: downlineMembers.length,
        activeMembersCount: activeDownline.length,
        separatedUnitsCount,
        separatedCentersCount,
        separatedRegionsCount,
        annualFYC: (teamFYCCalc || teamFYC) * 12,
        annualCOM: (teamCOMCalc || teamCOM) * 12,
        period: '2026-09',
        planVersion: INITIAL_PLAN_VERSION,
      });
      
      incomeResults.push({
        memberId: member.id,
        memberCode: member.memberCode,
        name: member.displayName || member.name,
        positionId,
        positionName: DEFAULT_POSITIONS.find(p => p.id === positionId)?.name || positionId,
        totalIncome: result.totalIncome,
        breakdown: result.breakdown,
        summary: result.summary,
        metricsUsed: result.metricsUsed,
      });
    }
    
    // Sort by total income descending
    incomeResults.sort((a, b) => b.totalIncome - a.totalIncome);
    
    return NextResponse.json({ 
      ok: true, 
      incomes: incomeResults,
      count: incomeResults.length,
      planVersion: INITIAL_PLAN_VERSION.code
    });
    
  } catch (error: any) {
    console.error('Admin income API error:', error);
    return NextResponse.json({ ok: false, error: 'เกิดข้อผิดพลาดในการคำนวณรายได้' }, { status: 500 });
  }
}