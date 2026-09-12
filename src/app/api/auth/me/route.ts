import { NextRequest, NextResponse } from 'next/server';
import { verifyTokenEdge } from '@/lib/auth-edge';

export async function GET(req: NextRequest){
  const token = req.cookies.get('token')?.value || req.cookies.get('auth_token')?.value || req.headers.get('authorization')?.replace(/^Bearer\s+/i,'') || '';
  if(!token) return NextResponse.json({ ok:false, authed:false }, { status:401 });
  const payload = verifyTokenEdge(token);
  if(!payload) return NextResponse.json({ ok:false, authed:false }, { status:401 });
  if(['SUSPENDED','RESIGNED','INACTIVE'].includes(String(payload.status))) return NextResponse.json({ ok:false, authed:false, error:'suspended' }, { status:403 });
  return NextResponse.json({ ok:true, authed:true, user: payload });
}
