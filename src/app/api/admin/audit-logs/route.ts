import { NextResponse } from 'next/server';
export async function GET(){
  return NextResponse.json({ ok:true, logs:[{at:'2026-09-05T02:12:00Z', user:'admin@', action:'member.approve', entity:'Prospect P-1003'},{at:'2026-09-05T02:15:00Z', user:'system', action:'tree.place', entity:'M-000004 -> A01 slot2'}] });
}
