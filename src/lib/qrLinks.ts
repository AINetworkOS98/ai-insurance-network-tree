// ─────────────────────────────────────────────────────────────────────────────
// ลิงก์สั้นสำหรับ QR (QR short links) — ทำตามแนวปฏิบัติสากล
//
// หลักการ:
//   1. ลาย QR พิมพ์แล้ว "แก้ไม่ได้" → อย่าให้ลาย QR เก็บปลายทางจริง
//      ให้เก็บ "ลิงก์สั้นของเราเอง" แล้ว 302 ไปปลายทาง (เปลี่ยนปลายทางได้โดยไม่ต้องพิมพ์ใหม่)
//   2. UTM ไม่ควรอยู่ในลาย QR (ทำให้ลายแน่น = โมดูลเล็กลง = สแกนยากและเล็กกว่าเดิม)
//      ให้ต่อ UTM ที่ชั้น redirect แทน — ที่นี่คือที่เดียวที่ประกอบ UTM ของ QR
//   3. วัดผลได้: ปลายทางมี UTM ครบ → ระบบนี้เก็บที่มาให้แล้ว
//      (src/lib/utm.ts → sessionStorage aintree_utm → /api/track → Visitor/VisitorEvent/Prospect)
//
// กติกา UTM ที่ใช้ (คงที่ทั้งชุด ห้ามเปลี่ยนกลางทาง ไม่งั้นข้อมูลแยกกลุ่มรวมกันไม่ได้):
//   utm_source   = qr-<slug>   (เช่น qr-contact-flyer) — ใช้กรอง "ทราฟฟิกจาก QR" ทั้งหมด
//   utm_medium   = offline     (งานพิมพ์/ป้าย = offline ทั้งหมด)
//   utm_campaign = aitree-offline-2026
//   utm_content  = ตำแหน่งที่วาง (flyer-a5, business-card, rich-menu, poster-a2 …)
//   utm_term     = slug
// ─────────────────────────────────────────────────────────────────────────────

export const QR_SITE =
  process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
  'https://ai-insurance-network-tree.vercel.app';

export const QR_CAMPAIGN = 'aitree-offline-2026';

export type QrTarget = {
  /** ปลายทางจริงในเว็บ */
  path: string;
  /** utm_content — ตำแหน่ง/ชิ้นงานที่วาง QR */
  content: string;
  /** ใช้ทำแคปชันบนชิ้นงานพิมพ์ (ข้อความที่คนอ่านเห็น) */
  label: string;
};

/** slug → ปลายทาง (slug สั้นเพื่อให้ได้เวอร์ชัน QR ต่ำ = โมดูลใหญ่ = สแกนง่าย) */
export const QR_LINKS: Record<string, QrTarget> = {
  contact: { path: '/contact', content: 'general', label: 'ติดต่อทีมงาน' },
  'contact-flyer': { path: '/contact', content: 'flyer-a5', label: 'ติดต่อทีมงาน' },
  'contact-card': { path: '/contact', content: 'business-card', label: 'ติดต่อทีมงาน' },
  'contact-line': { path: '/contact', content: 'line-rich-menu', label: 'ติดต่อทีมงาน' },
  'contact-poster': { path: '/contact', content: 'poster-a2', label: 'ติดต่อทีมงาน' },
  recruit: { path: '/recruit', content: 'general', label: 'สมัครเป็นตัวแทน' },
  'recruit-flyer': { path: '/recruit', content: 'flyer-a5', label: 'สมัครเป็นตัวแทน' },
  'recruit-card': { path: '/recruit', content: 'business-card', label: 'สมัครเป็นตัวแทน' },
};

export const DEFAULT_QR_SLUG = 'contact';

/** ลิงก์สั้นที่ "พิมพ์ลงลาย QR" (ไม่มี query เลย → สั้นที่สุดเท่าที่เป็นไปได้) */
export function qrShortLink(slug: string = DEFAULT_QR_SLUG): string {
  return `${QR_SITE}/q/${slug}`;
}

/** ปลายทางจริงที่ต่อ UTM ครบชุด — ใช้ตอบ 302 (ตัวเดียวที่ประกอบ UTM ของ QR) */
export function buildQrDestination(slugInput: string, incoming?: URLSearchParams): string {
  const slug = (slugInput || '').trim().toLowerCase();
  const known = Object.prototype.hasOwnProperty.call(QR_LINKS, slug);
  const key = known ? slug : DEFAULT_QR_SLUG;
  const hit = QR_LINKS[key];

  const url = new URL(hit.path, QR_SITE);
  // พารามิเตอร์อื่นที่ติดมากับลิงก์ (เช่น ?p=...) เก็บไว้ แต่ห้ามทับ UTM ของเรา
  if (incoming) {
    for (const [k, v] of incoming.entries()) {
      if (k.toLowerCase().startsWith('utm_')) continue;
      url.searchParams.set(k, v);
    }
  }
  url.searchParams.set('utm_source', known ? `qr-${key}` : 'qr-unknown');
  url.searchParams.set('utm_medium', 'offline');
  url.searchParams.set('utm_campaign', QR_CAMPAIGN);
  url.searchParams.set('utm_content', hit.content);
  url.searchParams.set('utm_term', known ? key : slug.slice(0, 64));
  return url.toString();
}

/** รายการ slug ที่มีจริง — ใช้ตรวจก่อนสร้างลาย QR (กันพิมพ์ลิงก์ที่ไม่มีอยู่) */
export function isKnownQrSlug(slug: string): boolean {
  return Object.prototype.hasOwnProperty.call(QR_LINKS, (slug || '').trim().toLowerCase());
}
