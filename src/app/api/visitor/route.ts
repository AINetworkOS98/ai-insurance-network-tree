import { kv } from '@vercel/kv';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

// GET: ดูจำนวนvisitorปัจจุบัน (ไม่บวก)
export async function GET() {
  let count = 0;
  try {
    const result = await kv.incr('visitor_count', 0);
    count = result ?? 0;
  } catch(e) {
    console.error('KV get error:', e);
  }
  return NextResponse.json({ count, success: true });
}

// POST: เพิ่มจำนวนvisitor + เซต cookie ป้องกันบวกซ้ำ
export async function POST(request: NextRequest) {
  // ตรวจสอบว่าเคยบันทึกไปแล้วหรือไม่ (24 ชม.)
  const seen = request.cookies.get('visitor_seen');
  if (seen?.value === '1') {
    const count = await kv.get('visitor_count') ?? 0;
    return NextResponse.json({ count, success: true, incremented: false });
  }

  let count = 0;
  try {
    const result = await kv.incr('visitor_count');
    count = result ?? 1;
  } catch(e) {
    console.error('KV incr error:', e);
    count = 1; // fallback
  }

  const response = NextResponse.json({ count, success: true, incremented: true });
  response.cookies.set('visitor_seen', '1', {
    maxAge: 60 * 60 * 24,
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
  });
  return response;
}
