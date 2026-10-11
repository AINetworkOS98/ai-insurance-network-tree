import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// ไม่ export — Next 16 อนุญาตให้ route file export เฉพาะ HTTP handler/config เท่านั้น
const DEFAULT_RECEIPT_SETTINGS = {
  maxAmount: 1000000,          // เพดานรับรองต่อใบ — ใบเสร็จเบี้ยจริงมักหลักหมื่นถึงแสน (เดิม 20,000 ทำให้ใบจริงกดรับรองไม่ผ่าน)
  autoVerifyLimit: 20000,      // ยอดไม่เกินนี้ + confidence >= 0.8 + ประเภทเบี้ย = รับรองอัตโนมัติ
  requirePolicyNo: false,      // ใบเสร็จรับเงินส่วนใหญ่ไม่มีเลขกรมธรรม์ — ไม่บังคับ
  defaultLedgerType: 'premium',// ใบเสร็จรับเงิน = เบี้ยรับชำระ (ไม่ใช่ค่าบำเหน็จ)
  allowedTypes: ['premium', 'commission'],
  countPremiumForRank: true,   // นับเบี้ยจากใบเสร็จที่รับรองแล้วเป็นผลงานขึ้นตำแหน่ง (แผนที่ใช้ metric = commission)
  autoEvaluateAfterVerify: true, // รับรองยอดแล้วประเมิน/เลื่อนตำแหน่งทันที
  maskPayerName: true,         // PDPA: ไม่เก็บชื่อผู้ชำระเงินแบบเต็มในระบบ
};

function normalizeReceiptSettings(body: any){
  const base: any = DEFAULT_RECEIPT_SETTINGS;
  return {
    maxAmount: Math.max(0, Number(body?.maxAmount ?? base.maxAmount) || 0),
    autoVerifyLimit: Math.max(0, Number(body?.autoVerifyLimit ?? base.autoVerifyLimit) || 0),
    requirePolicyNo: !!body?.requirePolicyNo,
    defaultLedgerType: body?.defaultLedgerType === 'commission' ? 'commission' : 'premium',
    allowedTypes: Array.isArray(body?.allowedTypes) && body.allowedTypes.length
      ? body.allowedTypes.filter((t: string) => ['premium', 'commission'].includes(t)) : base.allowedTypes,
    countPremiumForRank: body?.countPremiumForRank !== false,
    autoEvaluateAfterVerify: body?.autoEvaluateAfterVerify !== false,
    maskPayerName: body?.maskPayerName !== false,
  };
}

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
    // แนบเกณฑ์ขึ้นตำแหน่ง (แผน Active) ให้หน้าตั้งค่าแสดงคู่กัน — ผู้ใช้จะเห็นว่าใบเสร็จจะถูกนับเข้าตำแหน่งใด
    let activePlan: any = null;
    try{
      const plan: any = await (prisma as any).rankPlan.findFirst({ where:{ status:'Active' }, include:{ rules:true } });
      if(plan) activePlan = {
        id: plan.id, version: plan.version, status: plan.status,
        rules: (plan.rules || []).map((r:any)=> ({
          targetRank: r.targetRank, metric: r.metric, personalMin: r.personalMin, teamMin: r.teamMin,
          qualifiedUnits: r.qualifiedUnits, qualifiedCenters: r.qualifiedCenters,
          durationMinMonths: r.durationMinMonths, licenseRequired: r.licenseRequired, evalType: r.evalType,
        })),
      };
    }catch{}
    const settings = await loadSettings();
    const { RECEIPT_STANDARD } = await import('@/lib/receiptStandard');
    return NextResponse.json({ ok:true, settings, canEdit, activePlan, receiptStandard: RECEIPT_STANDARD,
      rankSources: (settings as any).countPremiumForRank === false ? ['commission'] : ['commission','premium'] });
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
    const patch = normalizeReceiptSettings(body);
    // คงคีย์อื่นที่แชร์อยู่ใน settings ก้อนเดียวกัน (เช่น net1x5) — เดิมเขียนทับทั้งก้อนทำให้ค่าอื่นหาย
    const existing: any = await (prisma as any).receiptSettings.findUnique({ where:{ id:'default' } }).catch(()=>null);
    const next = { ...(existing?.settings || {}), ...patch };
    await (prisma as any).receiptSettings.upsert({
      where:{ id:'default' }, create:{ id:'default', settings: next }, update:{ settings: next },
    });
    await prisma.auditLog.create({ data:{ userId: payload.sub, action:'receipt.settings_update', entity:'ReceiptSettings', entityId:'default', newValue: next as any } }).catch(()=>null);
    return NextResponse.json({ ok:true, settings: next });
  }catch(e:any){ return NextResponse.json({ ok:false, error:e?.message || 'error' }, { status:500 }); }
}
