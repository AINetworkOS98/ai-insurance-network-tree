import { NextRequest } from 'next/server';
import { lineStatusResponse, lineTestResponse } from '@/lib/lineAdmin';

// ใช้จากหน้าเว็บผู้ดูแล (/admin/reports) — หรือจากระบบอัตโนมัติที่มี CRON_SECRET
// logic อยู่ที่ src/lib/lineAdmin.ts (แชร์กับ /api/line)
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// GET  → สถานะการตั้งค่า (ไม่เปิดเผย token)
export async function GET(req: NextRequest) {
  return lineStatusResponse(req);
}

// POST → ส่งข้อความทดสอบ LINE
export async function POST(req: NextRequest) {
  return lineTestResponse(req);
}
