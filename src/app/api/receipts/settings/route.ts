import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export const DEFAULT_RECEIPT_SETTINGS = {
  maxAmount: 500000,          // เพดานรับรองต่อใบ — เกินนี้ verify ไม่ผ่าน
  autoVerifyLimit: 0,         // 0 = ปิด; >0 รับรองอัตโนมัติเมื่อยอดไม่เกินนี้ + confidence >= 0.8
  requirePolicyNo: false,     // บังคับเลขกรมธรรม์ก่อนส่งตรวจ
  defaultLedgerType: 'premium',
  allowedTypes: ['premium', 'commission'],
};

async function loadSettings(){
  try{
    const row: any = await prisma.receiptSettings.findUnique({ where:{ id:'default' } });
    if(row?.settings) return { ...DEFAULT_RECEIPT_SETTINGS, ...row.settings };
  }catch{}
  return { ...DEFAULT_RECEIPT_SETTINGS };
}

// GET /api/receipts/settings — ดูค่าตั้งค่า (ต้องล็อกอิน) + บอกว่าแก้ได้ไหม
export async function GET(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.headers.get('authorization')?.replace(/^Bearer\s+/i,'') || '';
    if(!token) return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    let payload:any; try{ payload = verifyToken(token); }catch{ return NextResponse.json({ ok:false, error:'โทเค็นไม่ถูกต้อง' }, { status:401 }); }
    const { isSystemAdmin } = await import('@/lib/admin');
    const canEdit = (await isSystemAdmin(payload.sub).catch(()=> ({ ok:false }))).ok;
    return NextResponse.json({ ok:true, settings: await loadSettings(), canEdit });
  }catch(e:any){ return NextResponse.json({ ok:false, error:e?.message || 'error' }, { status:500 }); }
}

// PUT /api/receipts/settings — เปลี่ยนค่าได้เฉพาะผู้บริหารระบบ / Admin Akarapol
export async function PUT(req: NextRequest){
  try{
    const token = req.cookies.get('token')?.value || req.headers.get('authorization')?.replace(/^Bearer\s+/i,'') || '';
    if(!token) return NextResponse.json({ ok:false, error:'กรุณาเข้าสู่ระบบ' }, { status:401 });
    let payload:any; try{ payload = verifyToken(token); }catch{ return NextResponse.json({ ok:false, error:'โทเค็นไม่ถูกต้อง' }, { status:401 }); }
    const { isSystemAdmin } = await import('@/lib/admin');
    if(!(await isSystemAdmin(payload.sub)).ok) return NextResponse.json({ ok:false, error:'เปลี่ยนได้เฉพาะผู้บริหารระบบ / Admin Akarapol' }, { status:403 });
    const body = await req.json().catch(()=> ({}));
    const next = {
      maxAmount: Math.max(0, Number(body.maxAmount ?? DEFAULT_RECEIPT_SETTINGS.maxAmount)),
      autoVerifyLimit: Math.max(0, Number(body.autoVerifyLimit ?? 0)),
      requirePolicyNo: !!body.requirePolicyNo,
      defaultLedgerType: body.defaultLedgerType === 'commission' ? 'commission' : 'premium',
      allowedTypes: Array.isArray(body.allowedTypes) && body.allowedTypes.length
        ? body.allowedTypes.filter((t:string)=> ['premium','commission'].includes(t)) : ['premium','commission'],
    };
    await (prisma as any).receiptSettings.upsert({
      where:{ id:'default' }, create:{ id:'default', settings: next }, update:{ settings: next },
    });
    await prisma.auditLog.create({ data:{ userId: payload.sub, action:'receipt.settings_update', entity:'ReceiptSettings', entityId:'default', newValue: next as any } }).catch(()=>null);
    return NextResponse.json({ ok:true, settings: next });
  }catch(e:any){ return NextResponse.json({ ok:false, error:e?.message || 'error' }, { status:500 }); }
}
