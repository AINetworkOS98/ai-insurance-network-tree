import { NextResponse } from 'next/server';
import { INCOME_DISCLAIMER } from '@/lib/income';
export async function GET(){
  return NextResponse.json({ ok:true, summary:{ estimated:7760, approved:24250, paid:14550 }, disclaimer: INCOME_DISCLAIMER, note:'Estimated ไม่ใช่ยอดที่ได้รับจริง' });
}
