import { NextRequest, NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cronAuth';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/tl-smart/queue   (Authorization: Bearer $CRON_SECRET)
// ดึงใบสมัครที่ยังไม่ถูกส่งเข้า TL SMART พร้อม payload ครบทุกช่อง
//   ?limit=25        จำนวนสูงสุด
//   ?prospectId=P-XX ดึงเฉพาะราย
//   ?format=html     หน้าเว็บสำหรับพิมพ์/คัดลอกเข้าฟอร์ม TL SMART ด้วยมือ
// ตัวเลข "queueRef" = เลขรันภายในระบบเรา (คิว) — เลขตัวแทนจริงออกโดย TL SMART เท่านั้น
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const denied = requireCronAuth(req);
  if (denied) return denied;

  try {
    const { prisma } = await import('@/lib/prisma');
    const { TL_SMART_CHANNEL } = await import('@/lib/tlSmart');
    const sp = req.nextUrl.searchParams;
    const limit = Math.min(100, Math.max(1, Number(sp.get('limit') || 25) || 25));
    const only = (sp.get('prospectId') || '').trim();

    const where: any = { channel: TL_SMART_CHANNEL, status: 'pending' };
    if (only) where.eventId = `tl_smart:${only}`;

    const rows: any[] = await (prisma as any).eventOutbox
      .findMany({ where, orderBy: { createdAt: 'asc' }, take: limit })
      .catch(() => []);

    const items = rows.map((r) => ({
      eventId: r.eventId,
      prospectId: String(r.eventId || '').replace('tl_smart:', ''),
      attempts: r.attempts,
      queuedAt: r.createdAt,
      queueRef: (r.payload?.agentCodeIssued as string) || null,
      payload: r.payload,
    }));

    const format = (sp.get('format') || '').toLowerCase();
    if (format === 'html') {
      const body = items
        .map((it, i) => {
          const p = it.payload || {};
          const a = p.applicant || {};
          const rowsHtml = [
            ['ชื่อ-สกุล', `${a.prefix || ''} ${a.firstName || ''} ${a.lastName || ''}`.trim()],
            ['ชื่อเล่น', a.nickname],
            ['เลขบัตรประชาชน', a.nationalId],
            ['วันเกิด', a.birthDate],
            ['เพศ', a.gender],
            ['เบอร์โทร', a.phone],
            ['อีเมล', a.email],
            ['LINE ID', a.lineId],
            ['ที่อยู่', a.address?.current],
            ['ตำบล/อำเภอ', a.address?.district],
            ['จังหวัด', a.address?.province],
            ['รหัสไปรษณีย์', a.address?.postalCode],
            ['การศึกษา', `${p.education?.level || ''} ${p.education?.university || ''} ${p.education?.major || ''}`.trim()],
            ['อาชีพปัจจุบัน', p.work?.currentOccupation],
            ['ประสบการณ์ประกัน', `${p.work?.experienceLevel || ''} ${p.work?.insuranceExperienceYears ?? ''}`.trim()],
            ['สถานะใบอนุญาต', p.license?.status],
            ['เลขใบอนุญาต', p.license?.number],
            ['หมดอายุ', p.license?.expiryDate],
            ['ตำแหน่งเป้าหมาย', p.goals?.positionPreference],
            ['เป้ารายได้/เดือน', p.goals?.monthlyIncomeGoal],
            ['ช่องทางที่มา', p.goals?.recruitmentChannel],
            ['ผู้แนะนำ (รหัสตัวแทน)', p.sponsorAgentCode],
            ['คิวรันของเรา', it.queueRef],
          ]
            .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
            .map(([k, v]) => `<tr><th>${k}</th><td>${String(v)}</td></tr>`)
            .join('');
          return `<section><h2>${i + 1}. ${a.firstName || ''} ${a.lastName || ''} <small>${it.prospectId} · คิว ${it.queueRef || '-'}</small></h2><table>${rowsHtml}</table></section>`;
        })
        .join('\n');
      const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>คิวส่งเข้า TL SMART (${items.length})</title>
<style>body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;margin:24px;color:#0f172a}h1{font-size:20px}h2{font-size:16px;margin:18px 0 6px}h2 small{color:#64748b;font-weight:400}table{border-collapse:collapse;width:100%;max-width:820px}th,td{border:1px solid #dbeafe;padding:6px 10px;font-size:13px;text-align:left}th{background:#f0f7ff;width:210px;font-weight:600}</style>
</head><body><h1>คิวใบสมัครที่ต้องกรอกเข้า TL SMART — ${items.length} ราย</h1>
<p style="color:#64748b;font-size:13px">เลขตัวแทนจริงจะออกโดยระบบ TL SMART · ตัวเลข "คิวรันของเรา" ใช้ติดตามเท่านั้น</p>${body}</body></html>`;
      return new NextResponse(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
    }

    return NextResponse.json({ ok: true, count: items.length, items });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e).slice(0, 300) }, { status: 500 });
  }
}
