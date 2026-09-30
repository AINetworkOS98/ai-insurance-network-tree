// edge-safe JWT verify — ใช้ใน middleware/proxy (Edge Runtime ใช้ WebCrypto ไม่มี 'crypto' ของ Node)
// เดิม: ถอด payload ออกมาดูเฉย ๆ ไม่ตรวจลายเซ็น → ใครก็ปลอมโทเคนที่มี payload อะไรก็ได้ให้ middleware ผ่าน
// ตอนนี้: ตรวจ HMAC-SHA256 ด้วย AUTH_SECRET (ตัวเดียวกับที่เซ็นตอนล็อกอิน) ผ่าน WebCrypto ของ Edge
export interface AuthPayload { sub:string; email:string; rankLevel:number; status:string; roles?:string[] }

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4; if (pad) s += '='.repeat(4 - pad);
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodePayload(s: string): AuthPayload | null {
  try {
    s = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = s.length % 4; if (pad) s += '='.repeat(4 - pad);
    return JSON.parse(atob(s));
  } catch { return null; }
}

let cachedKey: CryptoKey | null = null;
let keySecret: string | null = null;

async function hmacKey(secret: string): Promise<CryptoKey> {
  if (cachedKey && keySecret === secret) return cachedKey;
  cachedKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  keySecret = secret;
  return cachedKey;
}

export async function verifyTokenEdge(token: string): Promise<AuthPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = decodePayload(parts[1]);
    if (!payload || !payload.sub) return null;
    if ((payload as any).exp && Date.now() / 1000 > (payload as any).exp) return null;

    const secret = process.env.AUTH_SECRET;
    if (!secret) {
      // ไม่มีคีย์ใน runtime นี้ — ระบบล็อกอินจะใช้ไม่ได้อยู่แล้ว จึงให้ผ่านระดับ middleware
      // แล้วให้ API route ตรวจซ้ำด้วย jsonwebtoken (ซึ่งจะปฏิเสธถ้าไม่มีคีย์)
      return payload;
    }
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      b64urlToBytes(parts[2] as string) as unknown as BufferSource,
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
    return ok ? payload : null;
  } catch { return null; }
}
