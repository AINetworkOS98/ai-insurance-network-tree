import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const TOLERANCE = 0.001;

function inRange(v: number, r: any){
  if(!r) return true;
  if(r[0] != null && v < r[0]) return false;
  if(r[1] != null && v > r[1]) return false;
  return true;
}

function matchVariant(p: any, q: { age?: number; capital?: number; paymentYears?: number; plan?: string }){
  return (p.v || []).filter((v: any)=>
    (q.age == null || inRange(q.age, v.a)) &&
    (q.capital == null || inRange(q.capital, v.cap)) &&
    (q.paymentYears == null || inRange(q.paymentYears, v.pay)) &&
    (q.plan == null || !v.pl || String(v.pl) === String(q.plan))
  );
}

function rateForYear(v: any, policyYear: number){
  if(policyYear <= 1) return v.y1;
  if(policyYear === 2) return v.y2;
  if(policyYear === 3) return v.y3;
  return v.y4;
}

// ระดับการเห็นข้อมูล: 0 = ชื่ออย่างเดียว, 1-2 = +คอมปีแรก, 3+ = ทั้งหมด
function gateProduct(p: any, rank: number){
  const base: any = { c: p.c, n: p.n, cat: p.cat };
  if((p.aka || []).length) base.aka = p.aka;
  if(rank <= 0) return base;
  const y1 = (p.v || []).map((v: any)=> ({ ...(v.a ? { a: v.a } : {}), ...(v.cap ? { cap: v.cap } : {}), ...(v.pay ? { pay: v.pay } : {}), ...(v.pl ? { pl: v.pl } : {}), y1: v.y1 ?? null, ...(v.note ? { note: v.note } : {}) }));
  base.v = y1;
  if(rank <= 2) return base;
  base.v = p.v;
  return base;
}

async function activeTable(){
  const t: any = await (prisma as any).commissionTable.findFirst({ where:{ isActive: true }, orderBy:{ effectiveFrom:'desc' } }).catch(()=>null);
  return t;
}

function authed(req: NextRequest){
  const token = req.cookies.get('token')?.value || req.headers.get('authorization')?.replace(/^Bearer\s+/i,'') || '';
  if(!token) return null;
  try{ return verifyToken(token) as any; }catch{ return null; }
}

// GET /api/commissions?q=&category=&versions=1 — ค้นหาแบบ dropdown (กรองฟิลด์ตามระดับ)
export async function GET(req: NextRequest){
  try{
    const payload = authed(req);
    if(!payload) return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    const rank = payload.rankLevel ?? 0;
    const { searchParams } = new URL(req.url);
    if(searchParams.get('versions') === '1'){
      const vers: any[] = await (prisma as any).commissionTable.findMany({ select:{ version:true, effectiveFrom:true, effectiveTo:true, sourceRef:true, isActive:true }, orderBy:{ effectiveFrom:'desc' } }).catch(()=>[]);
      return NextResponse.json({ ok:true, versions: vers });
    }
    const t = await activeTable();
    if(!t) return NextResponse.json({ ok:false, error:'ยังไม่มีตารางค่าคอมมิชชั่น' }, { status:404 });
    const data = t.data as any;
    const q = (searchParams.get('q') || '').trim().toLowerCase();
    const cat = (searchParams.get('category') || '').trim();
    let products = (data.products || []) as any[];
    if(cat) products = products.filter(p=> p.cat === cat);
    if(q){
      products = products.filter(p=>
        String(p.c).toLowerCase().includes(q) || String(p.n).toLowerCase().includes(q) ||
        ((p.aka || []) as string[]).some((a:string)=> String(a).toLowerCase().includes(q))
      ).slice(0, 50);
    } else {
      products = products.slice(0, 100);
    }
    const categories = [...new Set(((data.products || []) as any[]).map(p=> p.cat))];
    return NextResponse.json({
      ok:true, version: t.version, effectiveFrom: t.effectiveFrom, effectiveTo: t.effectiveTo,
      rank, tier: rank <= 0 ? 'names_only' : rank <= 2 ? 'first_year' : 'full',
      categories, count: products.length, products: products.map(p=> gateProduct(p, rank)),
    });
  }catch(e:any){ return NextResponse.json({ ok:false, error:e?.message || 'error' }, { status:500 }); }
}

// POST /api/commissions {action:'check', code, age, capital?, paymentYears?, plan?, policyYear, inputRate}
// ตรวจค่าคอมที่กรอกเทียบตารางมาตรฐาน (tolerance 0.001)
export async function POST(req: NextRequest){
  try{
    const payload = authed(req);
    if(!payload) return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    const body = await req.json().catch(()=> ({}));
    if(body.action === 'check'){
      const t = await activeTable();
      if(!t) return NextResponse.json({ ok:false, error:'ยังไม่มีตารางค่าคอมมิชชั่น' }, { status:404 });
      const data = t.data as any;
      const code = String(body.code || '').toUpperCase();
      const p = (data.products || []).find((x:any)=> String(x.c).toUpperCase() === code ||
        ((x.aka || []) as string[]).some((a:string)=> String(a).toUpperCase() === code));
      if(!p) return NextResponse.json({ ok:false, error:`ไม่พบรหัส ${code} ในเวอร์ชัน ${t.version}` }, { status:404 });
      const age = Number(body.age);
      if(!Number.isFinite(age)) return NextResponse.json({ ok:false, error:'กรุณาระบุอายุ' }, { status:400 });
      const cands = matchVariant(p, { age, capital: body.capital != null ? Number(body.capital) : undefined, paymentYears: body.paymentYears != null ? Number(body.paymentYears) : undefined, plan: body.plan });
      if(!cands.length) return NextResponse.json({ ok:false, error:'ไม่มีเงื่อนไขตรงกับอายุ/ทุน/ปีชำระที่ระบุ', product: { c: p.c, n: p.n } });
      const policyYear = Math.max(1, Number(body.policyYear || 1));
      const input = Number(body.inputRate);
      const results = cands.map((v:any)=> {
        const expected = rateForYear(v, policyYear);
        const diff = expected == null || !Number.isFinite(input) ? null : input - expected;
        return { variant: v, expected, input: Number.isFinite(input) ? input : null, difference: diff, pass: diff == null ? null : Math.abs(diff) <= TOLERANCE };
      });
      return NextResponse.json({ ok:true, version: t.version, product:{ c: p.c, n: p.n }, policyYear, results });
    }

    // action:'save-version' — บันทึกเวอร์ชันใหม่ (admin เท่านั้น)
    if(body.action === 'save-version'){
      const { isSystemAdmin } = await import('@/lib/admin');
      if(!(await isSystemAdmin(payload.sub)).ok) return NextResponse.json({ ok:false, error:'เปลี่ยนได้เฉพาะผู้บริหารระบบ / Admin Akarapol' }, { status:403 });
      const { version, effectiveFrom, effectiveTo, sourceRef, data } = body;
      if(!version || !effectiveFrom || !data?.products?.length) return NextResponse.json({ ok:false, error:'กรุณาระบุ version, effectiveFrom และข้อมูล products' }, { status:400 });
      const created: any = await (prisma as any).commissionTable.upsert({
        where:{ version: String(version) },
        create:{ version: String(version), effectiveFrom: new Date(effectiveFrom), effectiveTo: effectiveTo ? new Date(effectiveTo) : null, sourceRef: sourceRef || null, data, isActive: true },
        update:{ effectiveFrom: new Date(effectiveFrom), effectiveTo: effectiveTo ? new Date(effectiveTo) : null, sourceRef: sourceRef || null, data, isActive: true },
      });
      await (prisma as any).commissionTable.updateMany({ where:{ version:{ not: String(version) } }, data:{ isActive:false } });
      await prisma.auditLog.create({ data:{ userId: payload.sub, action:'commission.save_version', entity:'CommissionTable', entityId: created.id, newValue:{ version } } }).catch(()=>null);
      return NextResponse.json({ ok:true, version: created.version });
    }

    return NextResponse.json({ ok:false, error:'action ไม่ถูกต้อง' }, { status:400 });
  }catch(e:any){ return NextResponse.json({ ok:false, error:e?.message || 'error' }, { status:500 }); }
}
