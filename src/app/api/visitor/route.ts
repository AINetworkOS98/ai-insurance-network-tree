import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

// ใน-memory counter — สำหรับ demo
// ใน production ควรใช้ Vercel KV เพื่อให้ count persist ระหว่าง deployment
let requestCount = 0;

export async function GET() {
  return NextResponse.json({ count: requestCount, success: true });
}

export async function POST(request: NextRequest) {
  const seen = request.cookies.get('visitor_seen');
  
  if (seen?.value === '1') {
    return NextResponse.json({ 
      count: requestCount, 
      success: true, 
      incremented: false 
    });
  }
  
  requestCount++;
  const response = NextResponse.json({ 
    count: requestCount, 
    success: true, 
    incremented: true 
  });
  response.cookies.set('visitor_seen', '1', {
    maxAge: 60 * 60 * 24,
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
  });
  return response;
}
