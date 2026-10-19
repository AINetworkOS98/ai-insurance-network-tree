// lib/secretBox.ts — เข้ารหัส/ถอดรหัสข้อมูลส่วนบุคคลของ "เคสทำประกัน" (AES-256-GCM)
// กุญแจมาจาก CASE_SECRET (แนะนำ) หรือ AUTH_SECRET — ถ้าไม่มีเลยจะใช้ค่า dev (เฉพาะ localhost)
import crypto from 'crypto';

function key(): Buffer {
  const secret = process.env.CASE_SECRET || process.env.AUTH_SECRET || 'dev-only-unsafe-key';
  return crypto.createHash('sha256').update(secret).digest();
}

export function seal(obj: unknown): string {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(Buffer.from(JSON.stringify(obj), 'utf8')), c.final()]);
  const tag = c.getAuthTag();
  return ['v1', iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join('.');
}

export function open(sealed: string): any {
  const [v, ivB, tagB, dataB] = String(sealed || '').split('.');
  if (v !== 'v1' || !ivB || !tagB || !dataB) return null;
  try {
    const d = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB, 'base64'));
    d.setAuthTag(Buffer.from(tagB, 'base64'));
    const out = Buffer.concat([d.update(Buffer.from(dataB, 'base64')), d.final()]);
    return JSON.parse(out.toString('utf8'));
  } catch {
    return null;
  }
}
