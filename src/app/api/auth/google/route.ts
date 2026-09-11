import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from 'firebase-admin/auth';
import { prisma } from '@/lib/prisma';
import { signToken } from '@/lib/auth';

// POST /api/auth/google {idToken} — สเปคหมวด 3: เข้าสู่ระบบด้วย Google
// ป้องกันบัญชีซ้ำและการเชื่อมผิดคน: ต้องยืนยันความเป็นเจ้าของทั้งสองช่องทาง
export async function POST(req: NextRequest){
  try{
    const { idToken } = await req.json();
    if(!idToken) return NextResponse.json({ ok:false, error:'กรุณาส่ง idToken จาก Google' }, { status:400 });

    const decoded: any = await getAuth().verifyIdToken(idToken);
    const googleSub = decoded.uid as string;
    const email = String(decoded.email||'').toLowerCase();
    const emailVerified = !!decoded.email_verified;
    const name = String(decoded.name || decoded.email?.split('@')[0] || 'ผู้ใช้ Google');

    if(!email) return NextResponse.json({ ok:false, error:'บัญชี Google นี้ไม่มีอีเมล' }, { status:400 });

    // 1) หา AuthIdentity google ก่อน
    let identity = await prisma.authIdentity.findFirst({ where:{ provider:'google', providerUserId: googleSub } }).catch(()=>null);
    let user: any = null;

    if(identity){
      user = await prisma.user.findUnique({ where:{ id: identity.userId } });
    } else {
      // 2) ยังไม่เคยเชื่อม — หา user จากอีเมล
      user = await prisma.user.findUnique({ where:{ email } }).catch(()=>null);
      if(user){
        // มี user อีเมลอยู่แล้ว — เชื่อม Google เข้าบัญชีเดิม แต่ต้องตรวจว่า email ตรงกันและ emailVerified
        if(!emailVerified){
          return NextResponse.json({ ok:false, error:'กรุณายืนยันอีเมล Google ก่อนเชื่อมบัญชี' }, { status:403 });
        }
        // กันชน provider+email ซ้ำ
        const emailIdentity = await prisma.authIdentity.findFirst({ where:{ provider:'google', email } }).catch(()=>null);
        if(emailIdentity && emailIdentity.userId !== user.id){
          return NextResponse.json({ ok:false, error:'อีเมลนี้ถูกเชื่อมกับบัญชีอื่นแล้ว' }, { status:409 });
        }
        identity = await prisma.authIdentity.create({
          data:{ userId: user.id, provider:'google', providerUserId: googleSub, email }
        });
        await prisma.auditLog.create({ data:{ userId: user.id, action:'auth.link_google', entity:'User', entityId: user.id, newValue:{ googleSub, email } } });
      } else {
        // 3) สมัครใหม่จาก Google — ทุกคนเริ่ม rankLevel 0
        const [firstName, ...rest] = name.split(' ');
        user = await prisma.user.create({
          data:{
            email,
            emailVerified: !!emailVerified,
            firstName: firstName || name,
            lastName: rest.join(' ') || '',
            displayName: name,
            status: 'PENDING',
            rankLevel: 0,
          }
        });
        identity = await prisma.authIdentity.create({
          data:{ userId: user.id, provider:'google', providerUserId: googleSub, email }
        });
        // เผื่อมี password identity ด้วยในอนาคต
        await prisma.auditLog.create({ data:{ userId: user.id, action:'auth.register_google', entity:'User', entityId: user.id, newValue:{ email, rankLevel:0 } } });
      }
    }

    if(!user) return NextResponse.json({ ok:false, error:'เกิดข้อผิดพลาด' }, { status:500 });
    if(['SUSPENDED','RESIGNED','INACTIVE'].includes(String(user.status))){
      return NextResponse.json({ ok:false, error:'บัญชีถูกระงับสิทธิ กรุณาติดต่อผู้ดูแลระบบ' }, { status:403 });
    }

    // สร้าง session
    const token = signToken({ sub: user.id, email: user.email, rankLevel: user.rankLevel ?? 0, status: String(user.status) });
    await prisma.userSession.create({
      data:{ userId: user.id, tokenHash: token.slice(-32), expiresAt: new Date(Date.now()+7*24*60*60*1000) }
    }).catch(()=>null);

    const res = NextResponse.json({ ok:true, token, user:{ id:user.id, email:user.email, rankLevel: user.rankLevel, status: user.status } });
    res.cookies.set('token', token, { httpOnly:true, path:'/', maxAge:60*60*24*7, sameSite:'lax' });
    return res;
  }catch(e:any){
    console.error('google auth', e);
    const code = e.code as string | undefined;
    if(code === 'auth/id-token-expired') return NextResponse.json({ ok:false, error:'เซสชัน Google หมดอายุ — ลองใหม่' }, { status:401 });
    return NextResponse.json({ ok:false, error:'เข้าสู่ระบบด้วย Google ไม่สำเร็จ' }, { status:500 });
  }
}
