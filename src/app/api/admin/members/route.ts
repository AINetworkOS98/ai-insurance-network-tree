import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase-admin';
import { verifyToken } from '@/lib/auth';

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
  uid?: string;
}

export async function GET(req: NextRequest) {
  try {
    // Verify auth token
    const authHeader = req.headers.get('authorization');
    const token = authHeader?.replace('Bearer ', '') || (req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value);
    
    if (!token) {
      return NextResponse.json({ ok: false, error: 'ไม่พบโทเค็นการยืนยันตัวตน' }, { status: 401 });
    }
    
    const decoded = verifyToken(token);
    if (!decoded) {
      return NextResponse.json({ ok: false, error: 'โทเค็นไม่ถูกต้องหรือหมดอายุ' }, { status: 401 });
    }
    
    // Check admin: แยก rank กับ permission (สเปคหมวด 2)
    const roles = (decoded as any).roles || ((decoded as any).role ? [(decoded as any).role] : []);
    const isAdmin = roles.includes('admin') || roles.includes('super_admin') || roles.includes('auditor');
    if (!isAdmin) {
      return NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์เข้าถึง' }, { status: 403 });
    }
    
    const db = getDb();
    const membersSnap = await db.collection('members').orderBy('memberCode').get();
    
    const members: FirestoreMember[] = membersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as FirestoreMember));
    
    // Also get memberAccess for UID mapping
    const accessSnap = await db.collection('memberAccess').get();
    const accessMap = new Map<string, string>();
    accessSnap.docs.forEach(doc => {
      accessMap.set(doc.data().memberId, doc.id);
    });
    
    const membersWithUid = members.map(m => ({
      ...m,
      uid: accessMap.get(m.id) || null
    }));
    
    return NextResponse.json({ ok: true, members: membersWithUid, count: members.length });
    
  } catch (error: any) {
    console.error('Admin members API error:', error);
    return NextResponse.json({ ok: false, error: 'เกิดข้อผิดพลาดในการดึงข้อมูลสมาชิก' }, { status: 500 });
  }
}