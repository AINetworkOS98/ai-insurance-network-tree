import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cronAuth';
import { runCycle, loadRules, requireNetAccess } from '@/lib/net1x5';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET/POST /api/cron/net-1x5 — "ตัวเฝ้าให้ข้อมูลเป็นปัจจุบันเสมอ" ของระบบ 1 แตก 5
//
// ทำไมต้องมี: วงจร 1 แตก 5 เดิมถูกสั่งรันจาก n8n ที่รันบนเครื่องผู้ใช้ (localhost:5679)
// → พอเครื่องปิด ข้อมูลก็หยุดอัปเดต ตัวนี้ย้ายการรันขึ้น "คลาวด์" จึงเป็นปัจจุบันได้ตลอดเวลา
//
// เรียกได้จาก (ทุกช่องทางมีสิทธิ์เท่ากัน):
//   - GitHub Actions ทุก 5 นาที (ไม่ต้องพึ่งเครื่องผู้ใช้)   Authorization: Bearer CRON_SECRET
//   - Vercel Cron (แผน Hobby = วันละครั้ง)                  Vercel ส่ง Bearer ให้เอง
//   - n8n บนเครื่องผู้ใช้ ทุก 15 นาที (สำรอง)
//   - ผู้ดูแลระบบที่ล็อกอินอยู่ (กดรีเฟรช/เปิดหน้า แล้วตัวหน้าเว็บเรียกเอง)
//
// กติกาความปลอดภัย:
//   - รันเฉพาะเมื่อข้อมูล "เก่าเกิน" N นาที (กันรันถี่เกินจำเป็น) — ?min=10 ปรับได้, ?force=1 บังคับรัน
//   - ยังเคารพกติกาใน DB เสมอ: enforceCut=false (ค่าเริ่มต้น) = ไม่คัดใครออกอัตโนมัติ
//   - idempotencyKey ต่อช่วงเวลา → ยิงซ้ำในช่วงเดียวกันไม่ทำงานซ้ำ (บันทึกใน PlacementRun)
//   - ?mode=preview = ตรวจอย่างเดียว ไม่เขียนข้อมูลจริง
const DEFAULT_MIN_GAP = 5; // นาที

async function run(req: NextRequest) {
  // 1) ทาง Bearer CRON_SECRET (GitHub Actions / Vercel Cron / n8n)
  let via: string = 'bearer';
  const denied = requireCronAuth(req);
  if (denied) {
    // 2) ไม่ใช่ Bearer — ลองทางคุกกี้ผู้ใช้ที่ล็อกอินอยู่ (ต้องเป็นผู้ดูแลระบบเท่านั้น)
    const access = await requireNetAccess(req);
    if (!access.ok || !access.isAdmin) return denied;
    via = 'session-admin';
  }

  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';
  const mode: 'preview' | 'apply' = url.searchParams.get('mode') === 'preview' ? 'preview' : 'apply';
  const minGap = Math.max(1, Math.min(240, Number(url.searchParams.get('min') || DEFAULT_MIN_GAP) || DEFAULT_MIN_GAP));

  try {
    const { prisma } = await import('@/lib/prisma');
    const rules = await loadRules();
    const period = rules.period;

    // ข้อมูลเก่าอยู่หรือไม่? ใช้ PlacementRun (ทุกการรันถูกบันทึกที่นี่อยู่แล้ว)
    const last: any = force ? null : await (prisma as any).placementRun
      .findFirst({ orderBy: { startedAt: 'desc' }, select: { id: true, startedAt: true, jobId: true } })
      .catch(() => null);
    const lastAt = last?.startedAt ? new Date(last.startedAt).getTime() : 0;
    const ageMin = lastAt ? (Date.now() - lastAt) / 60000 : Infinity;
    if (!force && ageMin < minGap) {
      return NextResponse.json({
        ok: true, ran: false, skipped: true, via, period, mode,
        lastRunAt: last?.startedAt || null, ageMinutes: Math.round(ageMin * 10) / 10, minGap,
        message: `ข้อมูลยังใหม่ (รันล่าสุด ${Math.round(ageMin)} นาทีที่แล้ว) — ยังไม่ต้องรันซ้ำ`,
        at: new Date().toISOString(),
      });
    }

    // คีย์กันซ้ำแบบรายช่วงเวลา (5 นาที × minGap) — ยิงพร้อมกันหลายทางก็ทำงานครั้งเดียว
    const bucket = Math.floor(Date.now() / (minGap * 60000));
    const idempotencyKey = `net1x5-keep-${period}-${mode}-${bucket}`;

    const result = await runCycle({ mode, actorId: null, period, idempotencyKey });

    return NextResponse.json({
      ok: true, ran: true, skipped: false, via, mode, period,
      runId: result.runId, idempotencyKey,
      previousRunAt: last?.startedAt || null,
      summary: result.summary,
      counts: {
        checked: result.steps.find((s) => s.key === 'verify')?.count ?? 0,
        cuttable: result.steps.find((s) => s.key === 'identify')?.count ?? 0,
        cut: result.cut.length,
        promoted: result.promotions.length,
        vacancies: result.vacancies.length,
      },
      warnings: result.warnings,
      at: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error('[GET /api/cron/net-1x5]', e?.message);
    return NextResponse.json({ ok: false, ran: false, error: 'keepalive_failed', message: e?.message || 'รันไม่สำเร็จ' }, { status: 500 });
  }
}

export async function GET(req: NextRequest) { return run(req); }
export async function POST(req: NextRequest) { return run(req); }
