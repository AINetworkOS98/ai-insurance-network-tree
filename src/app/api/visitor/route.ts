import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

async function getCount(): Promise<number> {
  const { data, error } = await supabase
    .from('visitor_counts')
    .select('count')
    .eq('id', 1)
    .single();
  if (error || !data) {
    await supabase.from('visitor_counts').insert({ id: 1, count: 0 });
    return 0;
  }
  return data.count;
}

async function incrementCount(): Promise<number> {
  const { data, error } = await supabase
    .from('visitor_counts')
    .select('count')
    .eq('id', 1)
    .single();
  if (error || !data) {
    await supabase.from('visitor_counts').insert({ id: 1, count: 1 });
    return 1;
  }
  const newCount = data.count + 1;
  await supabase
    .from('visitor_counts')
    .update({ count: newCount })
    .eq('id', 1);
  return newCount;
}

export async function GET() {
  const count = await getCount();
  return NextResponse.json({ count, success: true });
}

export async function POST(request: NextRequest) {
  const seen = request.cookies.get('visitor_seen');

  if (seen?.value === '1') {
    const count = await getCount();
    return NextResponse.json({
      count,
      success: true,
      incremented: false
    });
  }

  const newCount = await incrementCount();
  const response = NextResponse.json({
    count: newCount,
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
