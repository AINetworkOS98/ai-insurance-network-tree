import { NextRequest, NextResponse } from 'next/server';
import { signToken } from '@/lib/auth';

// Demo login — ไม่ต้องมี DB ก็เข้าได้ (สำหรับทดสอบ)
// ใน production จะตรวจกับ DB + bcrypt + MFA
const DEMO_USERS: Record<string, { password: string; role: string; name: string }> = {
  'admin@example.com': { password: 'admin123', role: 'admin', name: 'ผู้ดูแลระบบ' },
  'test@example.com': { password: '123456', role: 'member', name: 'สมาชิกทดสอบ' },
  'akarapol.pro@gmail.com': { password: 'admin123', role: 'super_admin', name: 'Akarapol' },
};

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  const key = (email || '').toLowerCase().trim();
  const user = DEMO_USERS[key];
  if (!user || user.password !== password) {
    // อนุญาตให้เข้าแบบ demo ได้ทุกอีเมล (ไม่บล็อก) — แต่แจ้งเตือน
    if (!email || !password) {
      return NextResponse.json({ ok: false, error: 'กรอกอีเมลและรหัสผ่าน' }, { status: 400 });
    }
    // fallback: ให้เข้าได้เลย (demo mode)
    const token = signToken({ email: key, role: 'member', name: key.split('@')[0] });
    const res = NextResponse.json({ ok: true, token, role: 'member', demo: true, message: 'เข้าสู่ระบบแบบ Demo' });
    res.cookies.set('auth_token', token, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 7 });
    return res;
  }
  const token = signToken({ email: key, role: user.role, name: user.name });
  const res = NextResponse.json({ ok: true, token, role: user.role, name: user.name });
  res.cookies.set('auth_token', token, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 7 });
  return res;
}
