import { prisma } from '@/lib/prisma';

// ผู้บริหารระบบเท่านั้นที่เปลี่ยนเกณฑ์/ตั้งค่าระบบได้:
// - มี role super_admin / admin / สิทธิ system.manage, หรือ
// - อีเมล Admin Akarapol (รองรับรูปเขียนตามที่แจ้ง + gmail มาตรฐาน กันล็อกตัวเอง)
// รายชื่ออีเมล/กติกาหน้าสงวนสิทธิ์ ย้ายไปอยู่ที่ lib/access-rules.ts (แหล่งเดียว ใช้ได้ทั้ง middleware และ client)
import { ADMIN_EMAILS, isAdminEmail } from '@/lib/access-rules';
export { ADMIN_EMAILS, isAdminEmail };


// ผูก super_admin ให้อีเมล admin อัตโนมัติ (สร้าง Role/Permission ที่ขาดให้ด้วย)
export async function ensureSuperAdmin(userId: string){
  try{
    const { PERMISSIONS, ROLES } = await import('@/lib/rbac');
    const def = ROLES.find((r:any)=> r.code === 'super_admin')!;
    let roleRow: any = await prisma.role.findUnique({ where:{ code:'super_admin' } }).catch(()=>null);
    if(!roleRow){
      roleRow = await prisma.role.create({ data:{ code:'super_admin', nameTh: def.nameTh } }).catch(()=>null);
    }
    if(roleRow){
      for(const p of PERMISSIONS){
        let perm: any = await prisma.permission.findUnique({ where:{ key: p.key } }).catch(()=>null);
        if(!perm){
          perm = await prisma.permission.create({ data:{ key: p.key, nameTh: p.nameTh, category: p.category } }).catch(()=>null);
        }
        if(perm){
          await prisma.rolePermission.upsert({
            where:{ roleId_permissionId: { roleId: roleRow.id, permissionId: perm.id } },
            create:{ roleId: roleRow.id, permissionId: perm.id },
            update:{},
          }).catch(()=>null);
        }
      }
      await prisma.userRole.upsert({
        where:{ userId_roleId: { userId, roleId: roleRow.id } },
        create:{ userId, roleId: roleRow.id },
        update:{},
      }).catch(()=>null);
    }
  }catch{}
}

export async function isSystemAdmin(userId: string): Promise<{ ok: boolean; user?: any }>{
  try{
    const user: any = await prisma.user.findUnique({
      where:{ id: userId },
      include:{ roles:{ include:{ role:{ include:{ permissions:true } } } } as any },
    }).catch(()=>null);
    if(!user) return { ok:false };
    if(isAdminEmail(user.email)){
      // อีเมล admin — ผูก super_admin ให้ทันที (best-effort) แล้วผ่าน
      await ensureSuperAdmin(user.id);
      return { ok:true, user };
    }
    const roles: string[] = (user.roles || []).map((ur:any)=> String(ur.role?.code || '').toLowerCase());
    if(roles.includes('super_admin') || roles.includes('admin')) return { ok:true, user };
    const perms: string[] = (user.roles || []).flatMap((ur:any)=> (ur.role?.permissions || []).map((rp:any)=> String(rp.permission?.key || '')));
    if(perms.includes('system.manage')) return { ok:true, user };
    return { ok:false, user };
  }catch{ return { ok:false }; }
}

// ── ผู้แนะนำราก (รหัสแรก) ───────────────────────────────────────
// สมาชิกทุกคนที่ไม่มีรหัสแนะนำ (หรือรหัสไม่ถูกต้อง) จะผูกกับ admin หลักนี้เป็นผู้แนะนำโดยอัตโนมัติ
export const ROOT_SPONSOR_EMAIL = 'akarapol.pro798@gmail.com';

export async function getRootSponsor(){
  try{
    let user: any = await prisma.user.findUnique({ where:{ email: ROOT_SPONSOR_EMAIL } }).catch(()=>null);
    if(!user) return null;
    // ผูก super_admin + สร้างเลขรหัสสมาชิก/รหัสแนะนำถ้ายังไม่มี (เลขรหัสแรก)
    await ensureSuperAdmin(user.id);
    const { ensureMemberCodes } = await import('@/lib/referral');
    await ensureMemberCodes(prisma, user.id);
    user = await prisma.user.findUnique({ where:{ id: user.id } }).catch(()=>null);
    return user;
  }catch{ return null; }
}
