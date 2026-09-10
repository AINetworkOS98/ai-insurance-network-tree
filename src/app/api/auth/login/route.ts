import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getDb } from '@/lib/firebase-admin';
import { signToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { idToken, email, password } = await req.json();
    
    // Case 1: Firebase ID token (from Google OAuth or email/password client-side)
    if (idToken) {
      const decoded = await getAuth().verifyIdToken(idToken);
      const uid = decoded.uid;
      const email = decoded.email;
      
      if (!email) {
        return NextResponse.json({ ok: false, error: 'ไม่พบอีเมลในโทเค็น' }, { status: 400 });
      }
      
      // Look up member in Firestore
      const db = getDb();
      const memberAccessRef = db.collection('memberAccess').doc(uid);
      const memberAccessSnap = await memberAccessRef.get();
      
      if (!memberAccessSnap.exists) {
        return NextResponse.json({ ok: false, error: 'ไม่พบข้อมูลสมาชิก — ติดต่อผู้ดูแลระบบ' }, { status: 404 });
      }
      
      const memberAccess = memberAccessSnap.data();
      const memberId = memberAccess?.memberId;
      
      if (!memberId) {
        return NextResponse.json({ ok: false, error: 'ข้อมูลสมาชิกไม่สมบูรณ์' }, { status: 500 });
      }
      
      const memberRef = db.collection('members').doc(memberId);
      const memberSnap = await memberRef.get();
      
      if (!memberSnap.exists) {
        return NextResponse.json({ ok: false, error: 'ไม่พบโปรไฟล์สมาชิก' }, { status: 404 });
      }
      
      const member = memberSnap.data();
      const role = member?.role || 'agent';
      const name = member?.displayName || member?.name || email.split('@')[0];
      
      const token = signToken({ uid, email, memberId, role, name });
      const res = NextResponse.json({ 
        ok: true, 
        token, 
        role, 
        name, 
        memberId,
        email 
      });
      res.cookies.set('auth_token', token, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 7 });
      return res;
    }
    
    // Case 2: Email/password (fallback - server-side verification)
    if (email && password) {
      // For email/password, we can't verify directly with Admin SDK
      // Client should use Firebase Client SDK to sign in and get ID token
      return NextResponse.json({ 
        ok: false, 
        error: 'กรุณาใช้ Firebase Client SDK สำหรับ email/password — ส่ง idToken แทน' 
      }, { status: 400 });
    }
    
    return NextResponse.json({ ok: false, error: 'กรอกข้อมูลไม่ครบ' }, { status: 400 });
    
  } catch (error: any) {
    console.error('Login error:', error);
    if (error.code === 'auth/id-token-expired') {
      return NextResponse.json({ ok: false, error: 'เซสชันหมดอายุ — เข้าสู่ระบบใหม่' }, { status: 401 });
    }
    if (error.code === 'auth/id-token-revoked') {
      return NextResponse.json({ ok: false, error: 'เซสชันถูกเพิกถอน' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' }, { status: 500 });
  }
}