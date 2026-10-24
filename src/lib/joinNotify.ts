// joinNotify.ts — รายงาน "มีคนสมัครเข้าใช้ app" เข้า LINE OA + อีเมล (+ กระดิ่งในแอป)
//
// PDPA: ส่งเฉพาะข้อมูลที่ผู้สมัครให้ความยินยอมเพื่อการติดต่อ (ชื่อ/เบอร์/อีเมล/จังหวัด/อาชีพ/ช่วงรายได้/ความสนใจ)
//       ไม่มีเลขบัตรประชาชน/ที่อยู่เต็ม/ข้อมูลสุขภาพ
import { notifyAdmins } from '@/lib/notify';
import { sendLineAlert } from '@/lib/lineAlert';
import { sendMail, activeProvider } from '@/lib/mailer';
import { ADMIN_EMAILS } from '@/lib/access-rules';

function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://ai-insurance-network-tree.vercel.app').replace(/\/$/, '');
}

export type SignupReportInput = {
  name: string;
  phone?: string | null;
  email?: string | null;
  province?: string | null;
  occupation?: string | null;
  incomeRange?: string | null;
  interests?: string[];
  source?: string | null;
  prospectCode?: string | null;
  score?: number | null;
  isExisting?: boolean;
};

/** ข้อความรายงานสำหรับ LINE OA (สั้น อ่านบนมือถือได้) */
export function buildSignupReport(o: SignupReportInput): string {
  const lines = [
    `${o.isExisting ? '🔁 มีผู้สนใจเดิมกรอกซ้ำ' : '🆕 มีคนสมัครเข้าใช้ app ใหม่'}`,
    `ชื่อ: ${o.name || '-'}`,
    `เบอร์: ${o.phone || '-'}`,
    o.email ? `อีเมล: ${o.email}` : null,
    o.province ? `จังหวัด: ${o.province}` : null,
    o.occupation ? `อาชีพ: ${o.occupation}` : null,
    o.incomeRange ? `ช่วงรายได้: ${o.incomeRange}` : null,
    o.interests?.length ? `สนใจ: ${o.interests.slice(0, 5).join(' · ')}` : null,
    o.score != null ? `คะแนนความสนใจ: ${o.score}` : null,
    o.source ? `ที่มา: ${o.source}` : null,
    o.prospectCode ? `รหัสผู้สนใจ: ${o.prospectCode}` : null,
    `เวลา: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
    '',
    `เปิดรายชื่อผู้สนใจ: ${appUrl()}/prospects`,
  ].filter(Boolean) as string[];
  return lines.join('\n');
}

function reportHtml(o: SignupReportInput): string {
  const row = (k: string, v?: string | null) => (v ? `<tr><td style="padding:4px 10px 4px 0;color:#64748b">${k}</td><td style="padding:4px 0"><b>${v}</b></td></tr>` : '');
  return `<div style="font-family:Sarabun,Segoe UI,sans-serif;font-size:14px;color:#0f172a">
  <h2 style="margin:0 0 8px">${o.isExisting ? 'มีผู้สนใจเดิมกรอกซ้ำ' : 'มีคนสมัครเข้าใช้ app ใหม่'}</h2>
  <table style="border-collapse:collapse">
    ${row('ชื่อ', o.name)}
    ${row('เบอร์โทร', o.phone)}
    ${row('อีเมล', o.email)}
    ${row('จังหวัด', o.province)}
    ${row('อาชีพ', o.occupation)}
    ${row('ช่วงรายได้', o.incomeRange)}
    ${row('ความสนใจ', (o.interests || []).slice(0, 6).join(' · '))}
    ${row('คะแนนความสนใจ', o.score != null ? String(o.score) : null)}
    ${row('ที่มา', o.source)}
    ${row('รหัสผู้สนใจ', o.prospectCode)}
    ${row('เวลา', new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }))}
  </table>
  <p style="margin:14px 0 0"><a href="${appUrl()}/prospects" style="background:#0b2b5b;color:#fff;padding:9px 16px;border-radius:999px;text-decoration:none">เปิดรายชื่อผู้สนใจ</a></p>
  <p style="color:#94a3b8;font-size:11px;margin-top:12px">ส่งอัตโนมัติจากระบบ AI Insurance Network Tree · PDPA: ไม่มีเลขบัตร/ที่อยู่เต็ม</p>
</div>`;
}

export type SignupNotifyResult = {
  line: { configured: boolean; sent: boolean; error?: string | null };
  email: { configured: boolean; sent: boolean; provider: string; to: string[]; error?: string | null };
  inApp: { notified: number };
};

/** ยิงรายงานทันที 3 ช่องทาง — ไม่ throw แม้ช่องทางใดล่ม (การสมัครต้องไม่ล้มเพราะแจ้งเตือน) */
export async function notifyJoinSignup(o: SignupReportInput): Promise<SignupNotifyResult> {
  const text = buildSignupReport(o);

  // ① LINE OA — sendLineAlert จะเก็บคิวให้ถ้ายังไม่ตั้งค่า
  let line: SignupNotifyResult['line'] = { configured: false, sent: false, error: null };
  try {
    const r = await sendLineAlert({ text, refId: o.prospectCode || o.phone || 'join', kind: 'lead' });
    line = { configured: Boolean(r?.configured), sent: Boolean(r?.sent), error: r?.error ?? null };
  } catch (e: any) {
    line = { configured: true, sent: false, error: String(e?.message || e).slice(0, 200) };
  }

  // ② อีเมล — ส่งถึงผู้ดูแลระบบ (สูงสุด 3 คน) หรือ SIGNUP_REPORT_EMAIL ถ้าตั้งไว้
  const to = (process.env.SIGNUP_REPORT_EMAIL
    ? process.env.SIGNUP_REPORT_EMAIL.split(',').map((s) => s.trim()).filter(Boolean)
    : (ADMIN_EMAILS || []).slice(0, 3)
  ).filter(Boolean) as string[];
  let email: SignupNotifyResult['email'] = { configured: activeProvider() !== 'none', sent: false, provider: activeProvider(), to, error: null };
  if (to.length) {
    try {
      const r = await sendMail({
        to: to.join(','),
        subject: `${o.isExisting ? '[ซ้ำ] ' : ''}มีคนสมัครเข้าใช้ app: ${o.name || o.phone || '-'}`,
        html: reportHtml(o),
      });
      email = { configured: r.provider !== 'none', sent: Boolean(r.ok), provider: r.provider, to, error: r.error ?? null };
    } catch (e: any) {
      email = { ...email, sent: false, error: String(e?.message || e).slice(0, 200) };
    }
  } else {
    email = { ...email, error: 'ไม่พบอีเมลผู้ดูแล (ADMIN_EMAILS ว่าง)' };
  }

  // ③ กระดิ่งในแอป
  let notified = 0;
  try {
    await notifyAdmins({
      type: 'lead_signup',
      title: `คนสมัครใช้ app: ${o.name || o.prospectCode || '-'}`,
      body: `${o.phone || '-'} · ${(o.interests || []).slice(0, 3).join(', ')}`,
      referenceId: o.prospectCode || o.phone || 'join',
    });
    notified = (ADMIN_EMAILS || []).length;
  } catch { /* ignore */ }

  return { line, email, inApp: { notified } };
}
