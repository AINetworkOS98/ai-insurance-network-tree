import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import crypto from "crypto";
const SECRET = process.env.AUTH_SECRET || "dev-secret-change-me";

export async function hashPassword(p:string){ return bcrypt.hash(p,10); }
export async function verifyPassword(p:string,hash:string){ return bcrypt.compare(p,hash); }
export function hashToken(raw:string){ return crypto.createHash('sha256').update(raw).digest('hex'); }
export function randomToken(bytes=32){ return crypto.randomBytes(bytes).toString('hex'); }

// payload ต้องมี rankLevel + status เพื่อให้ middleware ตรวจได้โดยไม่ต้อง query DB ทุกครั้ง
export interface AuthPayload { sub:string; email:string; rankLevel:number; status:string; roles?:string[] }
export function signToken(payload:AuthPayload){ return jwt.sign(payload, SECRET, {expiresIn:"7d"}); }
export function verifyToken(token:string): AuthPayload | null { try{ return jwt.verify(token, SECRET) as AuthPayload; }catch{ return null; } }
export function maskIdCard(last4?:string|null){ if(!last4) return "XXXX-XXXX-XXXX-XXXX"; return `XXXX-XXXX-XXXX-${last4}`; }

// ── ตรวจรหัสผู้ใช้ที่ส่งมากับโทเคน ───────────────────────────────────────────
// โทเคนเก่า/จากระบบอื่นอาจมี sub ที่ไม่ใช่ UUID (เช่น UID ของ Firebase) → ถ้าเอาไป
// query Prisma ตรง ๆ จะได้ P2023 แล้วกลายเป็น 500 ทั้งที่ความจริงคือ "เซสชันใช้ไม่ได้"
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v?: string | null): boolean { return !!v && UUID_RE.test(String(v)); }
/** รหัสผู้ใช้จาก payload ที่ใช้กับ Prisma ได้จริง — คืน null ถ้าโทเคนไม่ได้ผูกกับผู้ใช้ที่เป็น UUID */
export function payloadUserId(payload: any): string | null {
  const id = payload?.sub ?? payload?.id;
  return isUuid(id) ? String(id) : null;
}

// ใช้สำหรับ email verification / password reset — เก็บ hash ใน DB, ส่ง raw ทางอีเมล
export function createEmailToken(){ const raw = randomToken(32); return { raw, hash: hashToken(raw) }; }
