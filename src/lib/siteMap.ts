// ─────────────────────────────────────────────────────────────────────────────
// siteMap.ts — แผนที่เว็บ/เมนูทั้งหมดของระบบ (แหล่งเดียว = src/lib/navCatalog.ts)
//   ใช้ป้อนให้ AI (LINE OA + /contact) รู้ "ทุกหน้าทุกเมนู" พร้อมลิงก์เต็ม
//   ★ สร้างจาก navCatalog ทุกครั้งที่เรียก → เพิ่มเมนูใหม่ในอนาคต AI รู้เองโดยไม่ต้องแก้คำตอบ
// ─────────────────────────────────────────────────────────────────────────────
import { NAV_SECTIONS, NAV_ENTRIES, type NavEntry } from '@/lib/navCatalog';

const SECTION_LABEL: Record<string, string> = Object.fromEntries(NAV_SECTIONS.map((s) => [s.id, s.label]));

// หน้าที่มีจริงแต่ไม่อยู่ในเมนู Sidebar (หน้าสาธารณะ/เครื่องมือ)
const EXTRA: { label: string; path: string; note?: string }[] = [
  { label: 'หน้าแรก', path: '/' },
  { label: 'ติดต่อ/ช่วยเหลือ (มีผู้ช่วย AI ตอบอัตโนมัติ)', path: '/contact' },
  { label: 'เข้าสู่ระบบ', path: '/login' },
  { label: 'สมัครสมาชิก', path: '/register' },
  { label: 'คำถามที่พบบ่อย', path: '/faq' },
  { label: 'ความเป็นส่วนตัว (PDPA)', path: '/privacy' },
  { label: 'ข้อกำหนดการใช้บริการ', path: '/terms' },
  { label: 'LINE OA ทีมงาน (แอดเพื่อน/แชท)', path: 'https://line.me/R/ti/p/@923jrlgz' },
  { label: 'ประกันคีย์แมน (เครื่องคำนวณภาษี)', path: '/api/tax/keyman' },
  { label: 'ภาษีบุคคลธรรมดา (เครื่องคำนวณ)', path: '/api/tax/thai-pit' },
  { label: 'ภาษีนิติบุคคล (เครื่องคำนวณ)', path: '/api/tax/thai-cit' },
];

export function siteBase(): string {
  const raw = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || 'https://ai-insurance-network-tree.vercel.app';
  return raw.replace(/\/+$/, '');
}

export function absoluteUrl(p: string): string {
  if (/^https?:\/\//i.test(p)) return p;
  return siteBase() + (p.startsWith('/') ? p : '/' + p);
}

export interface SiteLink { section: string; label: string; url: string; minRank?: number; adminOnly?: boolean }

/** ลิงก์ทั้งหมดของระบบ (เรียงตามเมนูจริง) */
export function siteLinks(): SiteLink[] {
  const out: SiteLink[] = [];
  const seen = new Set<string>();
  for (const e of NAV_ENTRIES as NavEntry[]) {
    const url = absoluteUrl(e.href);
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ section: SECTION_LABEL[e.section] || e.section, label: e.label, url, minRank: e.minRank, adminOnly: e.adminOnly });
  }
  for (const x of EXTRA) {
    const url = absoluteUrl(x.path);
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ section: 'หน้าสาธารณะ/เครื่องมือ', label: x.label, url });
  }
  return out;
}

/** บล็อกความรู้เรื่องลิงก์/เมนู — ใส่ใน prompt ของ AI ทุกครั้ง (อัปเดตเองเมื่อมีเมนูใหม่) */
export function siteKnowledgeBlock(maxChars = 6000): string {
  const links = siteLinks();
  const groups = new Map<string, SiteLink[]>();
  for (const l of links) {
    if (!groups.has(l.section)) groups.set(l.section, []);
    groups.get(l.section)!.push(l);
  }
  const lines: string[] = [
    `── ลิงก์และเมนูทั้งหมดของระบบ (สร้างอัตโนมัติจากเมนูจริงของแอป · ${links.length} ลิงก์) ──`,
    `เว็บหลัก: ${siteBase()}`,
    'กฎการใช้ลิงก์: ส่งลิงก์เต็ม (ขึ้นต้น https://) เท่านั้น · หน้าของสมาชิก/ผู้ดูแลต้องล็อกอินก่อน · ห้ามแต่ง URL ที่ไม่มีในรายการนี้',
  ];
  for (const [section, items] of groups) {
    lines.push(`[${section}]`);
    for (const l of items) lines.push(`- ${l.label}: ${l.url}`);
  }
  let text = lines.join('\n');
  if (text.length > maxChars) text = text.slice(0, maxChars) + '\n…(ตัดบางเมนู)';
  return text;
}

export function siteLinkCount(): number {
  return siteLinks().length;
}
