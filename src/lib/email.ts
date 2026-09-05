export type EmailEventKey =
 | "prospect.registered" | "prospect.otp_verified" | "prospect.assigned"
 | "application.received" | "application.approved" | "application.rejected"
 | "member.placed" | "member.new_downline" | "income.created" | "income.approved" | "payout.paid";

export const EMAIL_TEMPLATES: Record<string,{subject:string, body:string}> = {
  "prospect.registered": { subject:"ได้รับข้อมูลการสมัครของคุณแล้ว — {{application_reference}}", body:"สวัสดี {{name}} เราได้รับใบสมัครของคุณแล้ว เลขอ้างอิง {{application_reference}} วันที่ {{date}} สถานะ: {{status}}" },
  "member.approved": { subject:"บัญชีสมาชิกของคุณได้รับการอนุมัติแล้ว", body:"ยินดีด้วย {{name}} Member ID: {{member_id}} วันที่อนุมัติ {{date}} ระดับเริ่มต้น {{role}}" },
  "member.placed": { subject:"ระบบจัดวางตำแหน่งสมาชิกของคุณเรียบร้อยแล้ว", body:"Member ID {{member_id}} วางใต้ {{parent}} ช่องที่ {{slot}} ชั้น {{level}} เวลา {{datetime}}" },
  "income.created": { subject:"มีรายการรายได้ใหม่ — {{transaction_reference}}", body:"ประเภท {{type}} รอบ {{period}} ยอดก่อนหัก {{gross}} ภาษี {{tax}} สุทธิ {{net}} สถานะ {{status}}" },
  "payout.paid": { subject:"ยืนยันการจ่ายเงินแล้ว — {{payout_reference}}", body:"จ่ายเงินสำเร็จ ยอดสุทธิ {{net}} วันที่ {{date}} เอกสาร {{doc_link}}" },
};

export function renderTemplate(key:string, vars:Record<string,string>){
  const t = EMAIL_TEMPLATES[key];
  if(!t) return null;
  let subject=t.subject, body=t.body;
  for(const [k,v] of Object.entries(vars)){
    const ph = `{{${k}}}`;
    subject=subject.replaceAll(ph,v);
    body=body.replaceAll(ph,v);
  }
  return {subject, body};
}

// Idempotency + dedup logic documented for queue
export const EMAIL_DEDUP_SQL = `-- idempotencyKey UNIQUE prevents duplicate sends
INSERT INTO "EmailMessage" (idempotencyKey, ...) VALUES (...) ON CONFLICT (idempotencyKey) DO NOTHING;`;
