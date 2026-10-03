const fs = require('fs');
const env = fs.readFileSync('C:/Users/User/ai-insurance-network-tree/.env.local', 'utf8').split(/\r?\n/).reduce((a, l) => { const m = l.match(/^([A-Z0-9_]+)=(.*)$/); if (m) a[m[1]] = m[2].replace(/^"|"$/g, ''); return a; }, {});
process.env.DATABASE_URL = env.DIRECT_URL || env.DATABASE_URL; delete process.env.DIRECT_URL;
const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient();
const fmt = (d) => new Date(d).toISOString().replace('T', ' ').slice(0, 19);
(async () => {
  console.log('NOW(UTC)', fmt(new Date()));
  const runs = await p.$queryRawUnsafe(`select "jobId", "idempotencyKey", status, "startedAt", "totalSuccess", "totalFailed", "totalQueued" from "PlacementRun" order by "startedAt" desc limit 8`);
  for (const r of runs) console.log('RUN', fmt(r.startedAt), r.status, 'jobId=' + r.jobId, 'key=' + r.idempotencyKey, 'promoted=' + r.totalSuccess, 'failed=' + r.totalFailed, 'queued=' + r.totalQueued);
  const detail = await p.$queryRawUnsafe(`select jobid, status, start_time from cron.job_run_details order by start_time desc limit 6`).catch(e => 'ERR');
  console.log('CRON RUNS:', Array.isArray(detail) ? detail.map((d) => fmt(d.start_time) + ' ' + d.status).join(' | ') : detail);
  const resp = await p.$queryRawUnsafe(`select status_code, created from net._http_response order by created desc limit 6`).catch(e => 'ERR');
  console.log('HTTP RESP :', Array.isArray(resp) ? resp.map((r) => fmt(r.created) + ' -> ' + r.status_code).join(' | ') : resp);
  await p.$disconnect();
})().catch(e => console.log('FATAL', String(e.message).slice(0, 200)));
