import { NextResponse } from 'next/server';

// ─── Cron auth guard ───
// Vercel จะส่ง `Authorization: Bearer <CRON_SECRET>` อัตโนมัติให้ทุกครั้งที่ cron fire
// ห้ามเชื่อ header อื่น (เช่น x-vercel-cron) เพราะ client ใด ๆ ปลอมได้
// ถ้ายังไม่ตั้ง CRON_SECRET → fail closed (500) ไม่ใช่เปิดสาธารณะ

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function requireCronAuth(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET ไม่ได้ตั้งค่า — ปิด cron ไว้เพื่อความปลอดภัย' },
      { status: 500 },
    );
  }
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${secret}`;
  if (!timingSafeEqual(auth, expected)) {
    return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
  }
  return null;
}
