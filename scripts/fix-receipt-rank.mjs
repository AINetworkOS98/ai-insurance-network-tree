import fs from 'node:fs';
// อัปเดตค่าตั้งค่าใบเสร็จ + ตรวจผลกระทบต่อการขึ้นตำแหน่ง (ไม่พิมพ์ข้อมูลส่วนบุคคล)
const envTxt = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
for (const line of envTxt.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient();
const j = (x) => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? String(v) : v));

const PATCH = {
  maxAmount: 1000000,            // เดิม 20,000 → ใบจริง 66,604 กดรับรองไม่ผ่าน
  autoVerifyLimit: 20000,
  requirePolicyNo: false,        // ใบเสร็จรับเงินไม่มีเลขกรมธรรม์
  defaultLedgerType: 'premium',  // เดิม commission → ledger ผิดชนิด
  allowedTypes: ['premium', 'commission'],
  countPremiumForRank: true,     // ให้เบี้ยจากใบเสร็จที่รับรองนับเป็นผลงานขึ้นตำแหน่ง
  autoEvaluateAfterVerify: true, // รับรองแล้วประเมินตำแหน่งทันที
  maskPayerName: true,           // PDPA
};

const row = await p.receiptSettings.findUnique({ where: { id: 'default' } });
const before = row?.settings || {};
const next = { ...before, ...PATCH };
await p.receiptSettings.upsert({ where: { id: 'default' }, create: { id: 'default', settings: next }, update: { settings: next } });
await p.auditLog.create({ data: { action: 'receipt.settings_update', entity: 'ReceiptSettings', entityId: 'default', newValue: { source: 'hermes:fix-receipt-rank', ...PATCH } } }).catch(() => null);

const after = (await p.receiptSettings.findUnique({ where: { id: 'default' } }))?.settings;
console.log('BEFORE:', j({ maxAmount: before.maxAmount, autoVerifyLimit: before.autoVerifyLimit, requirePolicyNo: before.requirePolicyNo, defaultLedgerType: before.defaultLedgerType }));
console.log('AFTER :', j({ maxAmount: after.maxAmount, autoVerifyLimit: after.autoVerifyLimit, requirePolicyNo: after.requirePolicyNo, defaultLedgerType: after.defaultLedgerType, countPremiumForRank: after.countPremiumForRank, autoEvaluateAfterVerify: after.autoEvaluateAfterVerify, maskPayerName: after.maskPayerName }));
console.log('คีย์อื่นยังอยู่ (net1x5):', !!after.net1x5);

const plan = await p.rankPlan.findFirst({ where: { status: 'Active' }, include: { rules: true } });
console.log('\nแผน Active:', plan?.version, '| rules', plan?.rules?.length);
const sources = after.countPremiumForRank === false ? ['commission'] : ['commission', 'premium'];
console.log('แหล่งผลงานที่ใช้นับตอนนี้:', sources.join(' + '));

const users = await p.user.findMany({ select: { id: true, rankLevel: true, status: true } });
for (const u of users) {
  const rows = await p.performanceLedger.findMany({ where: { userId: u.id, type: { in: sources }, status: 'active' } });
  const sum = rows.reduce((s, r) => s + Number(r.amount), 0);
  const premiumOnly = rows.filter((r) => r.type === 'premium').reduce((s, r) => s + Number(r.amount), 0);
  const target = (u.rankLevel ?? 0) + 1;
  const rule = plan?.rules?.find((r) => r.targetRank === target);
  const need = rule?.personalMin != null ? Number(rule.personalMin) : null;
  console.log(`user ${String(u.id).slice(0, 8)}… rank=${u.rankLevel} ${u.status} | ledger(นับ) = ${sum.toLocaleString()} (เบี้ยจากใบเสร็จ ${premiumOnly.toLocaleString()}) | เป้าระดับ ${target} ต้องการ ${need == null ? 'ไม่กำหนด' : need.toLocaleString()} => ${need != null && sum >= need ? 'PASS' : 'ยังไม่ผ่าน'}`);
}

const receipts = await p.receiptFile.findMany({ select: { id: true, userId: true, status: true, originalName: true, extractions: { select: { amount: true, type: true } } } });
console.log('\nใบเสร็จในระบบ:', receipts.length);
for (const r of receipts) console.log(`  ${String(r.id).slice(0, 8)}… ${r.status} user=${String(r.userId).slice(0, 8)}… amount=${r.extractions?.[0]?.amount ?? '-'} type=${r.extractions?.[0]?.type ?? '-'}`);
await p.$disconnect();
