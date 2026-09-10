import { NextRequest, NextResponse } from 'next/server';
import { calculateTotalIncome } from '@/lib/calculationEngine';
import { getDb } from '@/lib/firebase-admin';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    
    // Map Firestore data to CalculationInput
    const input = {
      memberId: body.memberId,
      positionId: body.positionId || 'agent',
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
      centerComList: body.centerComList,
      centerFycList: body.centerFycList,
      annualFYC: body.annualFYC,
      annualCOM: body.annualCOM,
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