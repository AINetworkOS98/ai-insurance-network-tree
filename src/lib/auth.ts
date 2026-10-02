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

// ใช้สำหรับ email verification / password reset — เก็บ hash ใน DB, ส่ง raw ทางอีเมล
export function createEmailToken(){ const raw = randomToken(32); return { raw, hash: hashToken(raw) }; }
