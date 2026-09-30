// navCatalog.ts — แหล่งความจริงเดียวของ "เมนูระบบ" + กติกาว่าใครเห็นเมนูไหน
// ใช้ได้ทั้ง client / server / edge (ห้าม import prisma ที่นี่)
//
// ระดับตำแหน่งอ้างอิง rankCatalog.ts (ห้ามสร้างระดับใหม่):
//   0 = สมาชิกทั่วไป | 1 = ตัวแทน | 2 = หัวหน้าหน่วย | 3 = ผู้จัดการศูนย์ | 4 = ผู้จัดการภาค (สูงสุด)
//
// กติกาที่เจ้าของระบบสั่งไว้:
//   - สมาชิกทั่วไป (0)        → เห็นชุดพื้นฐาน
//   - ตัวแทน (1)              → เห็นเพิ่ม (งานตัวแทนทั้งชุด)
//   - หัวหน้าหน่วย (2) ขึ้นไป  → เห็นเพิ่มตามลำดับ
//   - ผู้จัดการศูนย์ (3) / ภาค (4) → เห็นมากที่สุดฝั่งสายงาน
//   - Admin + อีเมล akarapol.pro798@gmail.com → เห็นทุกเมนู
//   - เมนู "Admin" อยู่ต่อจาก "หน้าแรก" ทันที ที่เหลือไล่ตามระดับลงมา
//
// เพิ่ม/ย้ายเมนู = แก้ที่ไฟล์นี้ไฟล์เดียว (Sidebar เรนเดอร์ตาม catalog นี้)
// หมายเหตุ: เมนูไม่ใช่การป้องกัน — หน้า/API ยังกั้นสิทธิ์ของตัวเองอยู่ (middleware + progressAccess)

export type NavTier = 0 | 1 | 2 | 3 | 4;

export interface NavSection {
  id: string;
  label: string;      // ป้ายไทย (ค่าเริ่มต้น)
  key?: string;       // i18n key (ทับ label เมื่อมีคำแปล)
  minRank: NavTier;   // ระดับขั้นต่ำที่เห็นหัวข้อนี้
  adminOnly?: boolean;
}

export interface NavEntry {
  href: string;
  section: string;
  label: string;
  key?: string;
  icon: string;
  minRank: NavTier;   // ระดับขั้นต่ำที่เห็นเมนูนี้ (ระดับสูงเห็นของทุกระดับล่างด้วย)
  adminOnly?: boolean;
  external?: boolean; // ลิงก์ออกนอกแอป (เปิดแท็บใหม่)
  sub?: 'network';    // เมนูย่อยในกลุ่ม "สร้างเครือข่าย"
}

// ลำดับหัวข้อ: หน้าแรก → Admin (ต่อจากหน้าแรกตามที่สั่ง) → ไล่ตามระดับจากต่ำไปสูง → ระบบอัตโนมัติ (Admin)
export const NAV_SECTIONS: NavSection[] = [
  { id: 'home',    label: 'หน้าแรก',                key: 'nav_home',     minRank: 0 },
  { id: 'admin',   label: 'ผู้ดูแลระบบ',             key: 'menu_admin',   minRank: 0, adminOnly: true },
  { id: 'general', label: 'สมาชิกทั่วไป',            key: 'menu_general', minRank: 0 },
  { id: 'agent',   label: 'ตัวแทน',                 key: 'menu_agent',   minRank: 1 },
  { id: 'unit',    label: 'หัวหน้าหน่วยขึ้นไป',       key: 'menu_unit',    minRank: 2 },
  { id: 'center',  label: 'ผู้จัดการศูนย์ขึ้นไป',      key: 'menu_center',  minRank: 3 },
  { id: 'region',  label: 'ผู้จัดการภาค (สูงสุด)',     key: 'menu_region',  minRank: 4 },
  { id: 'system',  label: 'ระบบอัตโนมัติ',           key: 'menu_system',  minRank: 0, adminOnly: true },
];

// เรียงตามลำดับที่ต้องการให้แสดง (ในแต่ละหัวข้อ เรียงตาม index ของ array นี้)
export const NAV_ENTRIES: NavEntry[] = [
  // ── หน้าแรก (ทุกคนที่ล็อกอิน) ──────────────────────────────────────────────
  { href: '/', section: 'home', label: 'หน้าแรก', key: 'nav_home', icon: '⌂', minRank: 0 },

  // ── ผู้ดูแลระบบ (Admin + akarapol.pro798@gmail.com) — ต่อจากหน้าแรก ─────────
  { href: '/admin', section: 'admin', label: 'ผู้ดูแลระบบ (Admin Dashboard)', key: 'sb_admin', icon: '🛡', minRank: 0, adminOnly: true },
  { href: '/admin/messages', section: 'admin', label: 'ข้อความระบบ', key: 'sb_admin_messages', icon: '✉', minRank: 0, adminOnly: true },
  { href: '/admin/reports', section: 'admin', label: 'รายงานผู้ดูแล', key: 'sb_admin_reports', icon: '▤', minRank: 0, adminOnly: true },
  { href: '/admin/support', section: 'admin', label: 'ช่วยเหลือ/ร้องเรียน', key: 'sb_admin_support', icon: '🆘', minRank: 0, adminOnly: true },
  { href: '/admin/consent', section: 'admin', label: 'ความยินยอม (PDPA)', key: 'sb_admin_consent', icon: '📜', minRank: 0, adminOnly: true },
  { href: '/admin/backup', section: 'admin', label: 'สำรองข้อมูล', key: 'sb_admin_backup', icon: '💾', minRank: 0, adminOnly: true },

  // ── สมาชิกทั่วไป (rank 0) ────────────────────────────────────────────────
  { href: '/financial-freedom', section: 'general', label: 'อิสรภาพทางการเงิน', key: 'sb_financial_freedom', icon: '🌟', minRank: 0 },
  { href: '/notifications', section: 'general', label: 'ศูนย์แจ้งเตือน', key: 'nav_notif', icon: '🔔', minRank: 0 },
  { href: '/settings', section: 'general', label: 'ตั้งค่าโปรไฟล์', key: 'sb_settings', icon: '⚙', minRank: 0 },

  // ── ตัวแทน (rank 1 ขึ้นไป) ───────────────────────────────────────────────
  { href: '/dashboard', section: 'agent', label: 'ภาพรวม', key: 'sb_dashboard', icon: '▦', minRank: 1 },
  { href: '/prospects', section: 'agent', label: 'สมาชิกทั่วไป', key: 'nav_prospects', icon: '◎', minRank: 1 },
  // ย้ายจากเมนูด้านบน (Header) มาฝั่งซ้ายตามคำสั่ง — ค้นหา/ตรวจสอบสมาชิก (ใช้ /api/members)
  { href: '/verify', section: 'agent', label: 'ตรวจสอบสมาชิก', key: 'nav_verify', icon: '🔍', minRank: 1 },
  { href: '/members', section: 'agent', label: 'สมาชิกของฉัน', key: 'sb_my_members', icon: '◉', minRank: 1 },
  { href: '/tree', section: 'agent', label: 'ผังทีม 1:5', key: 'sb_tree', icon: '⁂', minRank: 1 },
  { href: '/career', section: 'agent', label: 'ขึ้นตำแหน่ง', key: 'sb_career', icon: '▲', minRank: 1 },
  { href: '/criteria', section: 'agent', label: 'เกณฑ์มาตรฐาน', key: 'sb_criteria', icon: '✓', minRank: 1 },
  { href: '/rank-plans', section: 'agent', label: 'แผนตำแหน่ง', key: 'sb_rank_plans', icon: '🎯', minRank: 1 },
  { href: '/commissions', section: 'agent', label: 'ค่าคอมมิชชั่น', key: 'sb_commissions', icon: '฿', minRank: 1 },
  { href: '/income', section: 'agent', label: 'รายได้และเอกสาร', key: 'sb_income', icon: '📈', minRank: 1 },
  { href: '/receipts', section: 'agent', label: 'หลักฐานและผลงาน', key: 'sb_receipts', icon: '🧾', minRank: 1 },
  { href: '/periods', section: 'agent', label: 'ตัดยอดรายเดือน', key: 'sb_periods', icon: '◷', minRank: 1 },
  { href: '/reports', section: 'agent', label: 'รายงาน', key: 'sb_reports', icon: '▤', minRank: 1 },
  { href: '/appointments', section: 'agent', label: 'นัดหมาย', key: 'sb_appointments', icon: '📅', minRank: 1 },
  { href: '/documents', section: 'agent', label: 'สแกนใบเสร็จรับเงิน', key: 'sb_documents', icon: '📄', minRank: 1 },

  // เมนูย่อย "สร้างเครือข่าย" (rank 1 ขึ้นไป)
  { href: '/referral', section: 'agent', sub: 'network', label: 'ชวนสมาชิก', key: 'sb_invite', icon: '✉', minRank: 1 },
  { href: '/network-example', section: 'agent', sub: 'network', label: 'ตัวอย่างเครือข่าย', key: 'sb_network_example', icon: '👥', minRank: 1 },
  { href: '/network/promotions', section: 'agent', sub: 'network', label: 'ผู้ขึ้นตำแหน่ง', key: 'sb_promotions', icon: '🎖', minRank: 1 },
  { href: '/network/1x5-rules', section: 'agent', sub: 'network', label: 'หลักเกณฑ์ 1 แตก 5', key: 'sb_1x5_rules', icon: '📋', minRank: 1 },

  // ── หัวหน้าหน่วยขึ้นไป (rank 2) ────────────────────────────────────────────
  { href: '/progress', section: 'unit', label: 'ความก้าวหน้า (บอร์ดโมเดลธุรกิจ)', key: 'sb_progress', icon: '⬆', minRank: 2 },
  { href: '/recruit', section: 'unit', label: 'รับสมัคร/คัดเลือกตัวแทน', key: 'sb_recruit', icon: '🧑‍💼', minRank: 2 },

  // ── ผู้จัดการศูนย์ขึ้นไป (rank 3) ──────────────────────────────────────────
  { href: '/receipts/settings', section: 'center', label: 'ตั้งค่าการรับเงิน (ระดับศูนย์)', key: 'sb_receipt_settings', icon: '⚙', minRank: 3 },

  // ── ระบบอัตโนมัติ (Admin เท่านั้น) ────────────────────────────────────────
  { href: 'http://localhost:5679/', section: 'system', label: 'n8n · สร้าง Workflow', key: 'sb_n8n_editor', icon: '⚡', minRank: 0, adminOnly: true, external: true },
  { href: '/n8n', section: 'system', label: 'หน้า N8N ในระบบ', key: 'nav_n8n', icon: '🔗', minRank: 0, adminOnly: true },
  { href: '/n8n/workflows', section: 'system', label: 'เวิร์กโฟลว์', key: 'n8n_workflows', icon: '🧩', minRank: 0, adminOnly: true },
];

export const NETWORK_GROUP_LABEL = 'สร้างเครือข่าย';
export const NETWORK_GROUP_KEY = 'sb_network';

export interface NavContext {
  rank: number;
  isAdmin: boolean;
  authed?: boolean;
}

function rankOk(need: NavTier, rank: number) {
  return (Number.isFinite(rank) ? rank : 0) >= need;
}

export function canSeeNavEntry(e: NavEntry, ctx: NavContext) {
  if(ctx.authed === false) return false;
  // Admin (อีเมลในรายการ / role admin) เห็นทุกเมนูทุกระดับ — ตามข้อกำหนด "Admin เห็นทุกอย่าง"
  if(ctx.isAdmin) return true;
  if(e.adminOnly) return false;
  return rankOk(e.minRank, ctx.rank);
}

export function canSeeNavSection(s: NavSection, ctx: NavContext) {
  if(ctx.authed === false) return false;
  if(ctx.isAdmin) return true;
  if(s.adminOnly) return false;
  return rankOk(s.minRank, ctx.rank);
}

export interface NavGroup { section: NavSection; items: NavEntry[]; network: NavEntry[] }

// เมนูที่ผู้ใช้คนนี้เห็นจริง — เรียงตามลำดับหัวข้อ (หน้าแรก → Admin → ระดับต่ำไปสูง)
// หัวข้อที่ไม่มีเมนูเลยจะไม่แสดง
export function visibleNav(ctx: NavContext): NavGroup[] {
  const out: NavGroup[] = [];
  for(const s of NAV_SECTIONS){
    if(!canSeeNavSection(s, ctx)) continue;
    const all = NAV_ENTRIES.filter(e => e.section === s.id && canSeeNavEntry(e, ctx));
    const items = all.filter(e => !e.sub);
    const network = all.filter(e => e.sub === 'network');
    if(items.length || network.length) out.push({ section: s, items, network });
  }
  return out;
}

export function visibleNavCount(ctx: NavContext) {
  return visibleNav(ctx).reduce((n, g) => n + g.items.length + g.network.length, 0);
}
