import { prisma } from '@/lib/prisma';

// ผู้บริหารระบบเท่านั้นที่เปลี่ยนเกณฑ์/ตั้งค่าระบบได้:
// - มี role super_admin / admin / สิทธิ system.manage, หรือ
// - อีเมล Admin Akarapol (รองรับรูปเขียนตามที่แจ้ง + gmail มาตรฐาน กันล็อกตัวเอง)
const ADMIN_EMAILS = [
  'akarapol.pro798@gmai.com',
  'akarapol.pro798@gmail.com',
  'akarapol.pro@gmail.com',
];

export function isAdminEmail(email: unknown){
  if(!email) return false;
  return ADMIN_EMAILS.includes(String(email).trim().toLowerCase());
}

export async function isSystemAdmin(userId: string): Promise<{ ok: boolean; user?: any }>{
  try{
    const user: any = await prisma.user.findUnique({
      where:{ id: userId },
      include:{ roles:{ include:{ role:{ include:{ permissions:true } } } } as any },
    }).catch(()=>null);
    if(!user) return { ok:false };
    if(isAdminEmail(user.email)) return { ok:true, user };
    const roles: string[] = (user.roles || []).map((ur:any)=> String(ur.role?.code || '').toLowerCase());
    if(roles.includes('super_admin') || roles.includes('admin')) return { ok:true, user };
    const perms: string[] = (user.roles || []).flatMap((ur:any)=> (ur.role?.permissions || []).map((rp:any)=> String(rp.permission?.key || '')));
    if(perms.includes('system.manage')) return { ok:true, user };
    return { ok:false, user };
  }catch{ return { ok:false }; }
}
