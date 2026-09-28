import { sendEmail as sendViaResend } from '@/lib/memberMessages';

// ส่งเมลแบบรวมศูนย์: เลือกผู้ส่งอัตโนมัติ
//   1) SMTP (ถ้าตั้ง SMTP_HOST + SMTP_USER + SMTP_PASS) — ใช้ได้ทันทีโดยไม่ต้องมีโดเมน
//   2) Resend (EMAIL_API_KEY + EMAIL_FROM_ADDRESS) — ต้อง verify โดเมนก่อนจึงส่งถึงคนอื่นได้
// คืน { ok, error, provider } เพื่อให้ worker บันทึกเหตุผลได้ตรง ๆ

export type MailResult = { ok: boolean; error?: string; provider: 'smtp' | 'resend' | 'none' };

export function smtpConfigured(){
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

export function activeProvider(): 'smtp' | 'resend' | 'none' {
  if(smtpConfigured()) return 'smtp';
  if(process.env.EMAIL_API_KEY && process.env.EMAIL_FROM_ADDRESS) return 'resend';
  return 'none';
}

// ที่อยู่ผู้ส่ง: ใช้ SMTP_FROM ก่อน แล้วค่อย EMAIL_FROM_ADDRESS
export function fromAddress(){
  return process.env.SMTP_FROM || process.env.EMAIL_FROM_ADDRESS || process.env.SMTP_USER || '';
}

export async function sendMail(opts:{ to:string; subject:string; html:string }): Promise<MailResult>{
  // ── SMTP ก่อน (ถ้าตั้งไว้) ──
  if(smtpConfigured()){
    try{
      const nodemailer: any = await import('nodemailer');
      const port = Number(process.env.SMTP_PORT || 587);
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port,
        secure: port === 465,          // 465 = implicit TLS, 587 = STARTTLS
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      const info: any = await transporter.sendMail({
        from: fromAddress(),
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
      });
      return { ok: true, provider: 'smtp' };
    }catch(e:any){
      return { ok: false, error: `SMTP: ${e?.message || 'send failed'}`, provider: 'smtp' };
    }
  }

  // ── Resend (เดิม) ──
  const r: any = await sendViaResend({ to: opts.to, subject: opts.subject, html: opts.html });
  return { ok: !!r?.ok, error: r?.error, provider: 'resend' };
}
