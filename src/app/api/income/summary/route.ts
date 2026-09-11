import { NextRequest, NextResponse } from 'next/server';
import { calculateTotalIncome, MemberMetrics, PositionId, CompensationPlanVersion, INITIAL_PLAN_VERSION } from '@/lib/calculationEngine';
import { getDb } from '@/lib/firebase-admin';

interface CalculationInput extends MemberMetrics {
  memberId: string;
  positionId: PositionId;
  period: string;
  planVersion: CompensationPlanVersion;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Map Firestore data to CalculationInput
    const input: CalculationInput = {
      memberId: body.memberId,
      positionId: (body.positionId || 'agent') as PositionId,
      personalFYC: body.personalFYC || 0,
      teamFYC: body.teamFYC || 0,
      personalCOM: body.personalCOM || 0,
      teamCOM: body.teamCOM || 0,
      firstYearPremium: body.firstYearPremium || 0,
      renewalPremium: body.renewalPremium || 0,
      directMembersCount: body.directMembersCount || 0,
      activeMembersCount: body.activeMembersCount || 0,
      separatedUnitsCount: body.separatedUnitsCount || 0,
      separatedCentersCount: body.separatedCentersCount || 0,
      separatedRegionsCount: body.separatedRegionsCount || 0,
      annualFYC: body.annualFYC,
      annualCOM: body.annualCOM,
      status: 'active',
      period: body.period || '2026-09',
      planVersion: INITIAL_PLAN_VERSION,
    };
    
    const result = calculateTotalIncome(input);
    
    return NextResponse.json({
      ok: true,
      result,
    });
    
  } catch (error: any) {
    console.error('Income summary error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}