import { NextRequest, NextResponse } from 'next/server';
export async function POST(req: NextRequest){
  const { prospectId, approvedBy, reason } = await req.json();
  // Must be called by user with member.approve permission, check RBAC here
  // Create Member ID, link prospectConversion, audit log
  const memberId = 'M-'+Math.random().toString(36).slice(2,8).toUpperCase();
  return NextResponse.json({ ok:true, memberId, prospectId, approvedBy, reason, placed:false, next:'/api/tree/place-member' });
}
