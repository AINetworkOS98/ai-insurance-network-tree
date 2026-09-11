// edge-safe JWT verify — ใช้ใน middleware/proxy (Edge Runtime ห้าม import 'crypto')
export interface AuthPayload { sub:string; email:string; rankLevel:number; status:string; roles?:string[] }

function base64UrlDecode(s:string){
  s = s.replace(/-/g,'+').replace(/_/g,'/');
  const pad = s.length % 4; if(pad) s += '='.repeat(4-pad);
  try{ return JSON.parse(Buffer.from(s,'base64').toString('utf8')); }catch{ return null; }
}

export function verifyTokenEdge(token:string): AuthPayload | null {
  try{
    const parts = token.split('.');
    if(parts.length !== 3) return null;
    const payload = base64UrlDecode(parts[1]);
    if(!payload || !payload.sub) return null;
    // ตรวจ exp แบบไม่ verify signature (full verify ทำใน API route ด้วย jsonwebtoken)
    if(payload.exp && Date.now()/1000 > payload.exp) return null;
    return payload as AuthPayload;
  }catch{ return null; }
}
