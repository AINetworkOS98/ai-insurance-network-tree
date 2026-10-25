import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import release from '@/lib/app-release.json';
import { prisma } from '@/lib/prisma';
import { authorizeLeadApi } from '@/lib/leadApiAuth';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/app-release — "ใบรับรองเวอร์ชัน" ล่าสุดของแอป (ใช้โดยหน้า /download + n8n)
//
// คืน:
//   • app / build / apk / changelog  ← จาก src/lib/app-release.json (สร้างตอน build)
//   • fingerprint                    ← ลายนิ้วมือของ "ตัวโปรแกรม" (version+commit+apk hash)
//   • stats + dataFingerprint        ← จำนวนข้อมูลในระบบ (เฉพาะผู้เรียกที่แนบ Bearer CRON_SECRET)
//   • fingerprintAll                 ← program + data (ให้ n8n ใช้ตัดสินว่า "มีอะไรเปลี่ยน")
//
// ทำไม: หน้า /download ต้องสะท้อนของจริงเสมอ (เวอร์ชัน/ขนาด/เวลาอัปเดต/มีอะไรใหม่ + ?v=<hash>)
//   และ n8n ใช้ endpoint นี้เป็นแหล่งความจริงเดียวในการรายงานอีเมลเมื่อแอป/ข้อมูลอัปเดต
//
// สิทธิ์: manifest เปิดสาธารณะ (หน้า /download เปิดให้คนทั่วไป) — ตัวเลขข้อมูลระบบต้องมี Bearer
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Counts = { members: number; receipts: number; income: number; prospects: number; total: number };

async function readCounts(): Promise<Counts | null> {
  try {
    const db = prisma as any;
    const [members, receipts, income, prospects] = await Promise.all([
      db.user.count().catch(() => 0),
      db.financialDocument.count().catch(() => 0),
      db.incomeTransaction.count().catch(() => 0),
      db.prospect.count().catch(() => 0),
    ]);
    return { members, receipts, income, prospects, total: members + receipts + income + prospects };
  } catch {
    return null;
  }
}

function hash(s: string) {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 16);
}

export async function GET(req: NextRequest) {
  const auth = authorizeLeadApi(req);
  const stats = auth.ok ? await readCounts() : null;

  const dataFingerprint = stats ? hash(`${stats.members}|${stats.receipts}|${stats.income}|${stats.prospects}`) : null;
  const programFingerprint = (release as any)?.fingerprint || hash(JSON.stringify(release));

  return NextResponse.json(
    {
      ok: true,
      app: (release as any).app,
      build: (release as any).build,
      apk: (release as any).apk,
      changelog: (release as any).changelog || [],
      downloadPage: '/download',
      fingerprint: programFingerprint,
      dataFingerprint,
      fingerprintAll: dataFingerprint ? hash(`${programFingerprint}|${dataFingerprint}`) : programFingerprint,
      stats,
      fetchedAt: new Date().toISOString(),
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0, must-revalidate',
        'X-Release-Fingerprint': programFingerprint,
      },
    },
  );
}
