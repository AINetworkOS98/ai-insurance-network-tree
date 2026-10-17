// ─────────────────────────────────────────────────────────────────────────────
// /api/admin/line-oa/site-index — ดัชนีเนื้อหาทุกหน้า (ให้ AI ตอบเจาะเนื้อหาแต่ละหน้า)
//   GET  → สรุปว่ามีหน้ากี่หน้า อัปเดตล่าสุดเมื่อไร หน้าไหนถูกข้ามเพราะอะไร
//   POST → crawl ใหม่ทั้งเว็บ แล้วบันทึก (ใช้จากปุ่มในหน้าจัดการ หรือ CRON_SECRET)
// ─────────────────────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireLineAdmin, fail } from '@/lib/lineOaAdmin';
import { crawlSite, parseIndex } from '@/lib/siteIndex';
import { loadConfig } from '@/lib/lineOa';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  const a = await requireLineAdmin(req);
  if (!a.ok) return a.res;
  try {
    // เรียกจาก Vercel Cron (Bearer CRON_SECRET) = ให้ crawl ใหม่ทันที หรือ ?refresh=1 จากหน้าจัดการ
    const wantRefresh = a.via === 'cron' || new URL(req.url).searchParams.get('refresh') === '1';
    if (wantRefresh) {
      const idx = await crawlSite(60, 1400);
      await loadConfig();
      await (prisma as any).lineOaConfig.update({
        where: { id: 'default' },
        data: { aiSiteIndex: JSON.stringify(idx), aiSiteIndexAt: new Date() },
      });
      return NextResponse.json({
        ok: true, crawled: true, builtAt: idx.builtAt,
        pageCount: idx.pages.length, skipped: idx.skipped.length,
        pages: idx.pages.map((p) => ({ path: p.path, title: p.title, chars: p.text.length })),
      });
    }
    const cfg: any = await loadConfig();
    const idx = parseIndex(cfg.aiSiteIndex);
    return NextResponse.json({
      ok: true,
      builtAt: idx?.builtAt || null,
      savedAt: cfg.aiSiteIndexAt || null,
      pageCount: idx?.pages?.length || 0,
      skipped: (idx?.skipped || []).slice(0, 30),
      pages: (idx?.pages || []).map((p) => ({ path: p.path, title: p.title, headings: (p.headings || []).slice(0, 5), chars: p.text.length })),
    });
  } catch (e: any) { return fail(e); }
}

export async function POST(req: NextRequest) {
  const a = await requireLineAdmin(req);
  if (!a.ok) return a.res;
  try {
    const idx = await crawlSite(60, 1400);
    await loadConfig();
    await (prisma as any).lineOaConfig.update({
      where: { id: 'default' },
      data: { aiSiteIndex: JSON.stringify(idx), aiSiteIndexAt: new Date() },
    });
    return NextResponse.json({
      ok: true,
      builtAt: idx.builtAt,
      pages: idx.pages.length,
      skipped: idx.skipped.length,
      detail: idx.pages.map((p) => ({ path: p.path, title: p.title, chars: p.text.length })),
      skippedDetail: idx.skipped,
    });
  } catch (e: any) { return fail(e, 'อัปเดตดัชนีไม่สำเร็จ'); }
}
