// RBAC — Deny by Default
export type PermissionKey = string;
export type DataScope = "Own"|"Direct"|"Team"|"Branch"|"Assigned"|"All";

export const PERMISSIONS: {key:string, nameTh:string, category:string}[] = [
  {key:"dashboard.view", nameTh:"ดูภาพรวม", category:"dashboard"},
  {key:"prospect.view", nameTh:"ดูผู้สนใจ", category:"prospect"},
  {key:"prospect.create", nameTh:"สร้างผู้สนใจ", category:"prospect"},
  {key:"prospect.edit", nameTh:"แก้ไขผู้สนใจ", category:"prospect"},
  {key:"prospect.assign", nameTh:"มอบหมายผู้ดูแล", category:"prospect"},
  {key:"prospect.convert", nameTh:"แปลงเป็นสมาชิก", category:"prospect"},
  {key:"member.view_own", nameTh:"ดูข้อมูลตนเอง", category:"member"},
  {key:"member.view_direct_team", nameTh:"ดูทีมตรง", category:"member"},
  {key:"member.view_full_downline", nameTh:"ดูสายงานทั้งหมด", category:"member"},
  {key:"member.view_all", nameTh:"ดูสมาชิกทั้งหมด", category:"member"},
  {key:"member.approve", nameTh:"อนุมัติสมาชิก", category:"member"},
  {key:"tree.view_own", nameTh:"ดูต้นไม้ตนเอง", category:"tree"},
  {key:"tree.view_team", nameTh:"ดูต้นไม้ทีม", category:"tree"},
  {key:"tree.view_all", nameTh:"ดูต้นไม้ทั้งหมด", category:"tree"},
  {key:"tree.manage", nameTh:"จัดการต้นไม้", category:"tree"},
  {key:"income.view_own", nameTh:"ดูรายได้ตนเอง", category:"income"},
  {key:"income.view_team", nameTh:"ดูรายได้ทีม", category:"income"},
  {key:"income.view_all", nameTh:"ดูรายได้ทั้งหมด", category:"income"},
  {key:"income.approve", nameTh:"อนุมัติรายได้", category:"income"},
  {key:"document.download", nameTh:"ดาวน์โหลดเอกสาร", category:"document"},
  {key:"report.export", nameTh:"ส่งออกข้อมูล", category:"report"},
  {key:"role.manage", nameTh:"จัดการบทบาท", category:"admin"},
  {key:"permission.manage", nameTh:"จัดการสิทธิ์", category:"admin"},
  {key:"audit.view", nameTh:"ดู Audit Log", category:"admin"},
];

export const ROLES = [
  {code:"prospect", nameTh:"ผู้สนใจทั่วไป", perms:["dashboard.view"]},
  {code:"applicant", nameTh:"ผู้สมัครสมาชิก", perms:["dashboard.view","member.view_own"]},
  {code:"pending_member", nameTh:"สมาชิกรอตรวจสอบ", perms:["dashboard.view","member.view_own","tree.view_own"]},
  {code:"member", nameTh:"สมาชิกทั่วไป", perms:["dashboard.view","member.view_own","tree.view_own","income.view_own","document.download"]},
  {code:"agent", nameTh:"ตัวแทน", perms:["dashboard.view","member.view_own","member.view_direct_team","tree.view_team","income.view_own","prospect.view"]},
  {code:"unit_manager", nameTh:"ผู้บริหารหน่วย", perms:["dashboard.view","member.view_direct_team","tree.view_team","income.view_own","income.view_team","prospect.view","prospect.assign"]},
  {code:"sales_manager", nameTh:"ผู้บริหารศูนย์", perms:["dashboard.view","member.view_full_downline","tree.view_team","income.view_team","prospect.view"]},
  {code:"district_manager", nameTh:"ผู้บริหารภาค", perms:["dashboard.view","member.view_full_downline","tree.view_team","income.view_team"]},
  {code:"finance", nameTh:"เจ้าหน้าที่การเงิน", perms:["dashboard.view","income.view_all","income.approve","document.download","report.export"]},
  {code:"auditor", nameTh:"ผู้ตรวจสอบ", perms:["dashboard.view","member.view_all","income.view_all","audit.view","report.export"]},
  {code:"admin", nameTh:"ผู้ดูแลระบบ", perms: PERMISSIONS.map(p=>p.key)},
  {code:"super_admin", nameTh:"ผู้ดูแลระบบสูงสุด", perms: PERMISSIONS.map(p=>p.key)},
];

export function hasPermission(userPerms:string[], key:string){ return userPerms.includes(key); }
export function checkScope(userScope:DataScope, required:DataScope){
  const order:DataScope[] = ["Own","Direct","Team","Branch","Assigned","All"];
  return order.indexOf(userScope) >= order.indexOf(required);
}
