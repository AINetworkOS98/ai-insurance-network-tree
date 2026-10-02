import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { signToken, hashToken } from '@/lib/auth';

// POST /api/auth/logout — ออกจากระบบ + ลบ session
export async function POST(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.headers.get('authorization')?.replace('Bearer ','') || '';
    if(token){
      const hash = hashToken(token);
      // ลบ session ที่ตรงกับ hash (หรือทั้งหมดของผู้ใช้)
      await prisma.userSession.deleteMany({ where:{ tokenHash: hash } }).catch(()=>null);
      await prisma.userSession.deleteMany({ where:{ tokenHash: token.slice(-32) } }).catch(()=>null);
    }
    const res = NextResponse.json({ ok:true, message:'ออกจากระบบสำเร็จ' });
    res.cookies.set('token', '', { httpOnly:true, path:'/', maxAge:0 });
    res.cookies.set('auth_token', '', { httpOnly:true, path:'/', maxAge:0 });
    return res;
  }catch(e:any){
    const res = NextResponse.json({ ok:true, message:'ออกจากระบบสำเร็จ' });
    res.cookies.set('token', '', { httpOnly:true, path:'/', maxAge:0 });
    return res;
  }
}
