import { NextRequest, NextResponse } from 'next/server';
export async function POST(req: NextRequest){
  const { otp, prospectId } = await req.json();
  if(otp==='123456') return NextResponse.json({ok:true, verified:true, prospectId});
  return NextResponse.json({ok:false, error:'OTP ไม่ถูกต้อง'}, {status:400});
}
