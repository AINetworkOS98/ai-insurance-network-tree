import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { getDb } from '@/lib/firebase-admin';
import { prisma } from '@/lib/prisma';
import { signToken, verifyPassword } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { idToken, email, password } = await req.json();
    
    // Case 1: Firebase ID token (จาก Google OAuth หรือ client-side email/pass)
    if (idToken) {
      const decoded: any = await getAuth().verifyIdToken(idToken);
      const uid = decoded.uid;
      const decodedEmail = String(decoded.email||'').toLowerCase();
      
      if (!decodedEmail) {
        return NextResponse.json({ ok: false, error: 'ไม่พบอีเมลในโทเค็น' }, { status: 400 });
      }
      
      // ลองหาใน Prisma ก่อน
      let user: any = await prisma.user.findUnique({ where:{ email: decodedEmail } }).catch(()=>null);
      if(user){
        if(['SUSPENDED','RESIGNED','INACTIVE'].includes(String(user.status))){
          return NextResponse.json({ ok:false, error:'บัญชีถูกระงับสิทธิ' }, { status:403 });
        }
        const token = signToken({ sub: user.id, email: user.email, rankLevel: user.rankLevel ?? 0, status: String(user.status) });
        const res = NextResponse.json({ ok: true, token, user:{ id:user.id, email:user.email, rankLevel:user.rankLevel, status:user.status } });
        res.cookies.set('token', token, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 7, sameSite:'lax' });
        return res;
      }

      // Fallback: Firestore memberAccess (ระบบเก่า)
      try{
        const db = getDb();
        const memberAccessRef = db.collection('memberAccess').doc(uid);
        const memberAccessSnap = await memberAccessRef.get();
        if (memberAccessSnap.exists) {
          const memberAccess = memberAccessSnap.data();
          const memberId = memberAccess?.memberId;
          const memberRef = db.collection('members').doc(memberId);
          const memberSnap = await memberRef.get();
          if (memberSnap.exists) {
            const member = memberSnap.data();
            const role = member?.role || 'agent';
            const name = member?.displayName || member?.name || decodedEmail.split('@')[0];
            // map role -> rankLevel
            const rankMap: any = { general:0, agent:1, unit_manager:2, center_manager:3, regional_manager:4 };
            const rankLevel = rankMap[role] ?? 1;
            const token = signToken({ sub: uid, email: decodedEmail, rankLevel, status: 'ACTIVE' });
            const res = NextResponse.json({ ok: true, token, role, name, memberId, email: decodedEmail });
            res.cookies.set('token', token, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 7, sameSite:'lax' });
            return res;
          }
        }
      }catch{}
      return NextResponse.json({ ok: false, error: 'ไม่พบข้อมูลสมาชิก — ติดต่อผู้ดูแลระบบ' }, { status: 404 });
    }
    
    // Case 2: Email/password — ตรวจผ่าน Prisma (hash เอง ไม่ฝัง Secret ในหน้าเว็บ)
    if (email && password) {
      const normalized = String(email).trim().toLowerCase();
      const user = await prisma.user.findUnique({ where:{ email: normalized } });
      if(!user || !user.passwordHash){
        return NextResponse.json({ ok:false, error:'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, { status:401 });
      }
      if(['SUSPENDED','RESIGNED','INACTIVE'].includes(String(user.status))){
        return NextResponse.json({ ok:false, error:'บัญชีถูกระงับสิทธิ กรุณาติดต่อผู้ดูแลระบบ' }, { status:403 });
      }
      const ok = await verifyPassword(String(password), user.passwordHash);
      if(!ok) return NextResponse.json({ ok:false, error:'อีเมลหรือรหัสผ่านไม่ถูกต้อง' }, { status:401 });

      const token = signToken({ sub: user.id, email: user.email, rankLevel: user.rankLevel ?? 0, status: String(user.status) });
      await prisma.userSession.create({ data:{ userId: user.id, tokenHash: token.slice(-32), expiresAt: new Date(Date.now()+7*24*60*60*1000) } }).catch(()=>null);
      const res = NextResponse.json({ ok:true, token, user:{ id:user.id, email:user.email, rankLevel:user.rankLevel, status:user.status } });
      res.cookies.set('token', token, { httpOnly:true, path:'/', maxAge:60*60*24*7, sameSite:'lax' });
      return res;
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