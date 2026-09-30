import { NextRequest } from 'next/server';
import { lineStatusResponse, lineTestResponse } from '@/lib/lineAdmin';

/* เส้นทางสำหรับ "ระบบอัตโนมัติ" (n8n / Vercel Cron / สคริปต์ตรวจสอบ)
   ต้องแนบ Authorization: Bearer <CRON_SECRET> — ถ้าไม่มี จะได้ 401
   หน้าผู้ดูแลใช้ /api/admin/line (cookie session) แทน — logic เดียวกัน */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  return lineStatusResponse(req);
}

export async function POST(req: NextRequest) {
  return lineTestResponse(req);
}
