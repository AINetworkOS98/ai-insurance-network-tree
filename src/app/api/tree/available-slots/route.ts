import { NextRequest, NextResponse } from 'next/server';
export async function GET(req: NextRequest){
  const parentId = new URL(req.url).searchParams.get('parentId') || 'A';
  return NextResponse.json({ ok:true, parentId, occupied:[1,3], vacant:[2,4,5], capacity:'3/5' });
}
