import { NextRequest, NextResponse } from 'next/server';
import { getMemories, saveMemory, deleteMemory } from '@/lib/ai/memory';

export const runtime = 'nodejs';
export async function GET(req: NextRequest){
  const userId = req.headers.get('x-user-id') || req.nextUrl.searchParams.get('userId') || 'guest';
  const mems = await getMemories(userId);
  return NextResponse.json({ ok:true, userId, count: mems.length, memories: mems });
}
export async function POST(req: NextRequest){
  const body = await req.json().catch(()=> ({}));
  const userId = body.userId || req.headers.get('x-user-id') || 'guest';
  const { kind, key, value } = body;
  if(!key || !value) return NextResponse.json({ ok:false, error:'ต้องมี key และ value' }, {status:400});
  const m = await saveMemory(userId, kind ?? 'fact', String(key), String(value));
  return NextResponse.json({ ok:true, memory: m });
}
export async function DELETE(req: NextRequest){
  const body = await req.json().catch(()=> ({}));
  const userId = body.userId || req.headers.get('x-user-id') || 'guest';
  const key = body.key || req.nextUrl.searchParams.get('key');
  if(!key) return NextResponse.json({ ok:false, error:'ต้องมี key' }, {status:400});
  const ok = await deleteMemory(userId, String(key));
  return NextResponse.json({ ok, deleted: ok });
}
