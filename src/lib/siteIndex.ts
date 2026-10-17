// ─────────────────────────────────────────────────────────────────────────────
// siteIndex.ts — ดัชนีเนื้อหาทุกหน้าของเว็บ (สำหรับให้ AI ตอบเจาะเนื้อหาแต่ละหน้า)
//   • crawl หน้าเว็บจริงของเราเอง (same-origin) → เก็บ url/title/หัวข้อ/เนื้อหาย่อ
//   • เวลาตอบ: เลือกเฉพาะ 3-5 หน้าที่ "เกี่ยวกับคำถาม" (ค้นคืนแบบง่าย รองรับภาษาไทย)
//   • เก็บใน line_oa_config.ai_site_index (ไม่ต้องมี bucket/vector DB)
// ─────────────────────────────────────────────────────────────────────────────
import { siteLinks, siteBase, absoluteUrl } from '@/lib/siteMap';

export interface SitePage {
  url: string;
  path: string;
  title: string;
  description?: string;
  headings: string[];
  text: string;
  updatedAt: string;
}

export interface SiteIndexData {
  builtAt: string;
  base: string;
  pages: SitePage[];
  skipped: { path: string; reason: string }[];
}

/** ตัด HTML → ข้อความอ่านง่าย (เอา script/style/nav ออก) */
export function htmlToText(html: string): { title: string; description: string; headings: string[]; text: string } {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
  const description = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i)?.[1] || '').trim();
  const headings: string[] = [];
  for (const m of html.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    const t = m[2].replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    if (t && t.length >= 2 && !headings.includes(t)) headings.push(t);
  }
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .split('\n').map((s) => s.trim()).filter((s) => s.length > 1).join('\n');
  return { title, description, headings, text: body.slice(0, 2500) };
}

/** crawl หน้าเว็บทั้งหมดของเรา (ข้ามลิงก์นอกโดเมน/หน้าที่ต้องล็อกอิน) */
export async function crawlSite(maxPages = 60, perPageChars = 1400): Promise<SiteIndexData> {
  const base = siteBase();
  const links = siteLinks().filter((l) => l.url.startsWith(base));
  const pages: SitePage[] = [];
  const skipped: { path: string; reason: string }[] = [];
  const seen = new Set<string>();

  for (const l of links.slice(0, maxPages)) {
    const path = l.url.replace(base, '') || '/';
    if (seen.has(path)) continue;
    seen.add(path);
    try {
      const res = await fetch(absoluteUrl(path), { headers: { 'user-agent': 'HermesSiteIndex/1.0' }, redirect: 'manual', cache: 'no-store' });
      if (res.status !== 200) { skipped.push({ path, reason: res.status === 307 || res.status === 302 ? 'ต้องล็อกอิน' : 'HTTP ' + res.status }); continue; }
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('text/html')) { skipped.push({ path, reason: 'ไม่ใช่หน้าเว็บ' }); continue; }
      const html = await res.text();
      const parsed = htmlToText(html);
      if (!parsed.text) { skipped.push({ path, reason: 'ไม่มีเนื้อหา (เรนเดอร์ฝั่ง client)' }); continue; }
      pages.push({
        url: absoluteUrl(path), path,
        title: parsed.title || l.label,
        description: parsed.description,
        headings: parsed.headings.slice(0, 12),
        text: parsed.text.slice(0, perPageChars),
        updatedAt: new Date().toISOString(),
      });
    } catch (e: any) {
      skipped.push({ path, reason: String(e?.message || e).slice(0, 80) });
    }
  }
  return { builtAt: new Date().toISOString(), base, pages, skipped };
}

export function parseIndex(raw: string | null | undefined): SiteIndexData | null {
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    if (!Array.isArray(j?.pages)) return null;
    return j as SiteIndexData;
  } catch { return null; }
}

/** คะแนนความเกี่ยวข้องแบบง่าย (รองรับไทย: ใช้ทั้งคำทั้งก้อน + bigram) */
function scorePage(q: string, p: SitePage): number {
  const hay = `${p.title}\n${(p.headings || []).join(' ')}\n${p.text}`.toLowerCase();
  const ql = q.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ');
  const words = ql.split(/\s+/).filter((w) => w.length >= 2);
  let score = 0;
  for (const w of words) {
    if (hay.includes(w)) score += w.length >= 4 ? 3 : 2;
    // bigram สำหรับภาษาไทยที่ไม่มีช่องว่าง
    if (w.length >= 4) {
      for (let i = 0; i + 2 <= w.length; i += 2) {
        const bg = w.slice(i, i + 2);
        if (bg.trim().length === 2 && hay.includes(bg)) score += 1;
      }
    }
  }
  if (p.path !== '/' && ql.includes(p.path.replace('/', '').toLowerCase()) && p.path.length > 2) score += 5;
  return score;
}

/** เลือกหน้าที่เกี่ยวกับคำถามมากที่สุด (สูงสุด limit หน้า) */
export function relevantPages(question: string, idx: SiteIndexData | null, limit = 4): SitePage[] {
  if (!idx?.pages?.length || !question?.trim()) return [];
  const scored = idx.pages
    .map((p) => ({ p, s: scorePage(question, p) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, limit);
  return scored.map((x) => x.p);
}

/** บล็อกข้อความสำหรับใส่ใน prompt (เนื้อหาหน้าที่เกี่ยวข้อง) */
export function renderPagesForPrompt(pages: SitePage[], perPageChars = 900): string {
  if (!pages.length) return '';
  const blocks = pages.map((p, i) => {
    const heads = (p.headings || []).slice(0, 8).join(' · ');
    return `[หน้า ${i + 1}] ${p.title}\nURL: ${p.url}\nหัวข้อในหน้า: ${heads || '-'}\nเนื้อหาย่อ: ${p.text.replace(/\n+/g, ' ').slice(0, perPageChars)}`;
  });
  return `── เนื้อหาจริงของหน้าที่เกี่ยวข้องกับคำถามนี้ (ใช้ตอบให้ตรงหน้า) ──\n${blocks.join('\n\n')}`;
}
