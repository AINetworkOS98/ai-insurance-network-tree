#!/usr/bin/env node
/** อ่านร่องรอย oauth_trace จาก AuditLog (ไว้หาว่าคำขอ callback ตายที่ขั้นไหน) */
import { readFileSync, existsSync } from 'node:fs';
import { Client } from 'pg';

const ROOT = 'C:/Users/User/ai-insurance-network-tree';
function readEnv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}
const pulled = readEnv(`${ROOT}/.env.vercel.pull`);
const url = process.env.PGURL || pulled.POSTGRES_URL_NON_POOLING || pulled.POSTGRES_PRISMA_URL || pulled.DATABASE_URL;
const cleanUrl = url.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/[?&]$/, '').replace(/\?&/, '?');
const c = new Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });

await c.connect();
const rows = await c.query(`
  select id, action, "newValue", "createdAt"
  from "AuditLog"
  order by "createdAt" desc limit 12`);
for (const r of rows.rows) console.log(String(r.createdAt).slice(11, 19), '|', r.action, '|', JSON.stringify(r.newValue).slice(0, 90));
const cnt = await c.query(`select count(*)::int n from "UserSession"`);
console.log('UserSession rows:', cnt.rows[0].n);
await c.end();
