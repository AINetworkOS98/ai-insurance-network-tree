import { NextRequest, NextResponse } from 'next/server';
export async function POST(req: NextRequest){
  const body = await req.json();
  // Validate, hash, create prospect/user, dedup phone/email, send OTP email (idempotent)
  // Masking before response
  return NextResponse.json({ ok:true, prospectId: 'P-'+Math.random().toString(36).slice(2,8).toUpperCase(), message:'ได้รับข้อมูลแล้ว — ตรวจสอบ OTP', requiresOtp:true, received: body });
}
