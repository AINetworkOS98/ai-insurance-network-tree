import fs from 'node:fs';
// โหลด .env.local แบบเงียบ (ไม่พิมพ์ค่า secret)
const envTxt = fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
for (const line of envTxt.split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
const { PrismaClient } = await import('@prisma/client');
const p = new PrismaClient();
const j = (x) => JSON.stringify(x, (k, v) => (typeof v === 'bigint' ? String(v) : v));
const safe = async (label, fn) => { try { return await fn(); } catch (e) { console.log(`${label}: ERR ${String(e.message).slice(0, 90)}`); return null; } };

console.log('receiptSettings:', j(await safe('receiptSettings', () => p.receiptSettings.findUnique({ where: { id: 'default' } }))));

const plans = await safe('rankPlans', () => p.rankPlan.findMany({ include: { rules: true } }));
if (Array.isArray(plans)) {
  console.log('rankPlans:', plans.length);
  for (const pl of plans) {
    console.log(`  plan ${String(pl.id).slice(0, 8)} status=${pl.status} version=${pl.version ?? ''} rules=${(pl.rules || []).length}`);
    for (const r of (pl.rules || [])) {
      console.log(`     -> t${r.targetRank} metric=${r.metric} personalMin=${r.personalMin ?? '-'} teamMin=${r.teamMin ?? '-'} units=${r.qualifiedUnits ?? '-'} centers=${r.qualifiedCenters ?? '-'} months=${r.durationMinMonths ?? '-'} eval=${r.evalType} lic=${r.licenseRequired}`);
    }
  }
}
console.log('receipts by status:', j(await safe('receipts', () => p.receiptFile.groupBy({ by: ['status'], _count: { _all: true } }))));
console.log('users by rank:', j(await safe('users', () => p.user.groupBy({ by: ['rankLevel'], _count: { _all: true } }))));
console.log('ledger:', j(await safe('ledger', () => p.performanceLedger.groupBy({ by: ['type'], _sum: { amount: true }, _count: { _all: true } }))));
console.log('extractions sample:', j(await safe('ext', () => p.receiptExtraction.findMany({ take: 3, orderBy: { createdAt: 'desc' }, select: { id: true, issuerName: true, receiptNo: true, transactionRef: true, agentCode: true, amount: true, paidAt: true, type: true } }))));
await p.$disconnect();
