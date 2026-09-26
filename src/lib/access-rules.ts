// กติกาสิทธิ์ระดับหน้า — แหล่งความจริงเดียวของ "ใครคือ Admin" สำหรับการกั้นหน้า
// ไฟล์นี้ต้อง import ได้ทั้ง Edge Runtime (middleware), server และ client → ห้าม import prisma ที่นี่
// (prisma อยู่ใน lib/admin.ts ซึ่ง re-export ค่าจากไฟล์นี้ เพื่อไม่ให้มีรายชื่ออีเมลซ้ำสองที่)

export const ADMIN_EMAILS = [
  'akarapol.pro798@gmail.com',
  'akarapol.pro@gmail.com',
];

export const ADMIN_ROLE_CODES = ['super_admin', 'admin'];

// หน้าสงวนสิทธิ์: เข้าได้เฉพาะ Admin หรือสมาชิกอีเมล akarapol.pro798@gmail.com เท่านั้น
// ต้องการกั้นหน้าเพิ่ม = เพิ่ม path ที่นี่บรรทัดเดียว (ครอบทั้ง path ตรงตัวและ path ย่อย)
export const ADMIN_ONLY_PAGE_PREFIXES = ['/n8n', '/n8n_automation', '/admin/backup', '/admin/messages', '/admin/reports', '/admin/support'];

export function normalizeEmail(email: unknown){
  return String(email ?? '').trim().toLowerCase();
}

export function isAdminEmail(email: unknown){
  if(!email) return false;
  return ADMIN_EMAILS.includes(normalizeEmail(email));
}

// token อาจไม่มี roles (login ปัจจุบันไม่ใส่) — ถ้ามีก็ถือว่าเป็น Admin ได้เลย
export function isAdminRole(roles: unknown){
  if(!Array.isArray(roles)) return false;
  return roles.some((r)=> ADMIN_ROLE_CODES.includes(String(r ?? '').trim().toLowerCase()));
}

export function isAdminOnlyPage(pathname: string){
  return ADMIN_ONLY_PAGE_PREFIXES.some((p)=> pathname === p || pathname.startsWith(p + '/'));
}

// ผ่าน = อีเมลอยู่ในรายชื่อ Admin (รวม akarapol.pro798@gmail.com) หรือมี role admin ใน token
export function canAccessAdminOnlyPage(user: { email?: unknown; roles?: unknown } | null | undefined){
  if(!user) return false;
  return isAdminEmail(user.email) || isAdminRole(user.roles);
}
