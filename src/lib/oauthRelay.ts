import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

/**
 * oauthRelay — ตัวช่วย "ย้ายงานหนักไปโฮสต์ที่เร็ว"
 *
 * ทำไมต้องมี: บนโฮสต์แชร์ (Hostinger Cloud Startup) คำขอ /auth/callback ที่ต้องคุยกับ Google
 * + อ่าน/เขียนฐานข้อมูล ใช้เวลาเกินเพดานของแพลน → 504. แต่ทั้งสองโฮสต์ใช้ AUTH_SECRET ตัวเดียวกัน
 * จึงให้ Hostinger ส่งต่อ (302) ทันทีโดยไม่แตะ DB → Vercel ทำ token exchange + หา/สร้างผู้ใช้ (เร็ว)
 * → ออก "ตั๋ว" อายุ 2 นาที ส่งกลับมาให้ Hostinger แลกเป็นคุกกี้เซสชัน (ตรวจลายเซ็นเท่านั้น ไม่แตะ DB)
 *
 * ความปลอดภัย: ตั๋วเป็น JWT เซ็นด้วย AUTH_SECRET, อายุสั้น, และมี relay_sig ยืนยันว่าโฮสต์ปลายทาง
 * เป็นผู้เริ่มคำขอจริง (HMAC ของ code|state|relayHost) — ใช้ได้เฉพาะผู้ถือกุญแจระบบเท่านั้น
 */

const SECRET = () => process.env.AUTH_SECRET || '';

/** โฮสต์ที่รับทำงาน OAuth แทน (ตั้งใน env ของโฮสต์ที่ช้า) */
export function relayBase(): string | null {
  const v = (process.env.OAUTH_EXCHANGE_BASE || '').trim();
  return v ? v.replace(/\/$/, '') : null;
}

/** ลายเซ็นยืนยันต้นทางของ relay: HMAC(code|state|relayHost) */
export function relaySig(code: string, state: string | null, relayHost: string): string {
  return crypto.createHmac('sha256', SECRET()).update(`${code}|${state || ''}|${relayHost}`).digest('base64url');
}

export function verifyRelaySig(sig: string | null, code: string, state: string | null, relayHost: string): boolean {
  if (!sig) return false;
  const want = relaySig(code, state, relayHost);
  const a = Buffer.from(sig);
  const b = Buffer.from(want);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export type Ticket = { tkt: true; sub: string; email: string; rankLevel: number; status: string; next?: string };

/** ออกตั๋วอายุสั้น (ค่าเริ่มต้น 2 นาที) — ใช้แลกคุกกี้ที่ปลายทาง */
export function mintTicket(payload: Omit<Ticket, 'tkt'>, ttlSeconds = 120): string {
  return jwt.sign({ ...payload, tkt: true }, SECRET(), { expiresIn: ttlSeconds });
}

/** ตรวจตั๋ว — คืน null ถ้าปลอม/หมดอายุ/ไม่ใช่ตั๋ว */
export function verifyTicket(token: string): Ticket | null {
  try {
    const p: any = jwt.verify(token, SECRET());
    if (!p || p.tkt !== true || !p.sub) return null;
    return p as Ticket;
  } catch {
    return null;
  }
}
