import { readFileSync } from 'node:fs';
import pg from 'pg';
const ROOT = 'C:/Users/User/ai-insurance-network-tree';
const env = {};
for (const line of readFileSync(`${ROOT}/.env.local`, 'utf8').split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m) env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
}
const url = (env.POSTGRES_URL_NON_POOLING || env.DATABASE_URL).replace(/([?&])sslmode=[^&]*/g, '$1').replace(/[?&]$/, '');
const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect();
console.log('--- AuditLog recent (auth/oauth) ---');
const a = await c.query(`select action, "newValue", "createdAt" from "AuditLog" where action ilike '%auth%' or action like 'oauth%' order by "createdAt" desc limit 15`);
for (const r of a.rows) console.log(String(r.createdAt), '|', r.action, '|', JSON.stringify(r.newValue).slice(0, 160));
console.log('--- UserSession recent ---');
const s = await c.query(`select id, "userId", "lastActiveAt", "createdAt" from "UserSession" order by "createdAt" desc limit 10`);
for (const r of s.rows) console.log(String(r.createdAt), '|', String(r.lastActiveAt).slice(0,19), '|', r.userId.slice(0,8));
const n = await c.query(`select count(*)::int n from "UserSession"`);
console.log('UserSession total:', n.rows[0].n);
console.log('--- User count / statuses ---');
const u = await c.query(`select status, count(*)::int n from "User" group by status order by n desc`);
console.log(u.rows.map(r => `${r.status}:${r.n}`).join('  '));
await c.end();
