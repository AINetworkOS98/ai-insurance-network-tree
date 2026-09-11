import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase-admin';

interface FirestoreMember {
  id: string;
  memberCode?: string;
  displayName?: string;
  name?: string;
  positionId?: string;
  role?: string;
  status?: string;
  personalFYC?: number;
  personalCOM?: number;
  sponsorId?: string;
  joinDate?: string;
  uid?: string;
}

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const memberId = searchParams.get('memberId');
    
    if (memberId) {
      // Single member detail
      const memberRef = db.collection('members').doc(memberId);
      const memberSnap = await memberRef.get();
      
      if (!memberSnap.exists) {
        return NextResponse.json({ ok: false, error: 'ไม่พบสมาชิก' }, { status: 404 });
      }
      
      const member: FirestoreMember = { id: memberSnap.id, ...memberSnap.data() } as FirestoreMember;
      
      // Also get memberAccess
      const accessRef = db.collection('memberAccess').doc(member.uid || '');
      const accessSnap = await accessRef.get();
      
      return NextResponse.json({ ok: true, member, memberAccess: accessSnap.exists ? accessSnap.data() : null });
    }
    
    // List all members with basic info
    const membersSnap = await db.collection('members').limit(50).get();
    const members: FirestoreMember[] = [];
    membersSnap.forEach(doc => {
      const data = doc.data();
      members.push({
        id: doc.id,
        memberCode: data.memberCode,
        name: data.name,
        positionId: data.positionId,
        role: data.role,
        status: data.status,
        sponsorId: data.sponsorId,
        joinDate: data.joinDate,
        personalFYC: data.personalFYC,
        personalCOM: data.personalCOM,
      });
    });
    
    return NextResponse.json({ ok: true, members });
    
  } catch (error: any) {
    console.error('Members list error:', error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}