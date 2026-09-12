import { NextRequest, NextResponse } from 'next/server';
import { getHermesProvider } from '@/lib/ai/hermesProvider';

// GET /api/ai/status — ตรวจสอบสถานะ Hermes เบื้องหลัง (admin only ถ้ามี token)
// แต่ถ้าไม่มี token ก็ตอบแบบ public ว่า configured หรือไม่ — ไม่ expose ชื่อ provider จริง
export async function GET(req: NextRequest){
  const p = getHermesProvider();
  const info = p.getInfo();
  const userRank = req.headers.get('x-user-rank');
  const isAdmin = userRank && Number(userRank) >= 3;
  return NextResponse.json({
    ok: true,
    displayName: 'ระบบค้นหาด้วย AI อัจฉริยะ',
    configured: info.configured,
    // รายละเอียด provider จริงแสดงเฉพาะ admin
    ...(isAdmin ? { provider: info.provider, model: info.model } : {}),
    gateway: 'active',
    modes: ['เร็ว','อัจฉริยะ','วิเคราะห์เชิงลึก'],
  });
}
