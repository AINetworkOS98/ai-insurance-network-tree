import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

// Persistent visitor counter — เก็บใน Firestore ไม่หายเมื่อ cold start
// ใช้ FieldValue.increment() atomic → ปลอดภัยเมื่อหลาย instance รันพร้อมกัน
const DOC = 'site_stats';
const ID = 'visitor';

let cachedCount: number | null = null;

async function readCount(): Promise<number> {
  try {
    const snap = await getDb().collection(DOC).doc(ID).get();
    const val = snap.exists ? Number(snap.data()?.count ?? 0) : 0;
    cachedCount = val;
    return val;
  } catch {
    return cachedCount ?? 0;
  }
}

export async function GET() {
  const count = await readCount();
  return NextResponse.json({ count, success: true });
}

export async function POST(request: NextRequest) {
  const seen = request.cookies.get('visitor_seen');

  if (seen?.value === '1') {
    return NextResponse.json({ count: await readCount(), success: true, incremented: false });
  }

  // Atomic increment — ไม่มี lost update ระหว่าง instance
  let next: number;
  try {
    await getDb().collection(DOC).doc(ID).set(
      { count: FieldValue.increment(1), updatedAt: new Date().toISOString() },
      { merge: true },
    );
    next = await readCount();
  } catch {
    next = (cachedCount ?? 0) + 1;
    cachedCount = next;
  }

  const response = NextResponse.json({ count: next, success: true, incremented: true });
  response.cookies.set('visitor_seen', '1', {
    maxAge: 60 * 60 * 24,
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
  });
  return response;
}
