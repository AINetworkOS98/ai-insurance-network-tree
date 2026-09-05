import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
const SECRET = process.env.AUTH_SECRET || "dev-secret";
export async function hashPassword(p:string){ return bcrypt.hash(p,10); }
export async function verifyPassword(p:string,hash:string){ return bcrypt.compare(p,hash); }
export function signToken(payload:object){ return jwt.sign(payload, SECRET, {expiresIn:"7d"}); }
export function verifyToken(token:string){ try{ return jwt.verify(token, SECRET) as any; }catch{ return null; } }
export function maskIdCard(last4?:string|null){ if(!last4) return "XXXX-XXXX-XXXX-XXXX"; return `XXXX-XXXX-XXXX-${last4}`; }
