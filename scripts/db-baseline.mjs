#!/usr/bin/env node
/**
 * เก็บ "ภาพก่อนย้าย" ของฐานข้อมูล production — ใช้เทียบหลังย้าย (row counts ต้องตรงกัน)
 * อ่าน connection string จาก .env.vercel.pull (POSTGRES_URL_NON_POOLING / POSTGRES_PRISMA_URL)
 * หรือส่งผ่าน env:  PGURL=... node scripts/db-baseline.mjs
 *
 * ไม่พิมพ์รหัสผ่านออกจอ — เขียนผลเป็น JSON ลง $TMPDIR/db-baseline-<วันที่>.json
 *
 * ต้องมีไดรเวอร์ pg (ไม่ใส่ใน package.json เพื่อไม่ให้ bundle ขึ้น production):
 *     npm i pg --no-save
 * รัน:  node scripts/db-baseline.mjs        (อ่าน .env.vercel.pull ที่ได้จาก vercel env pull)
 *       PGURL="postgres://..." node scripts/db-baseline.mjs   (ชี้ไป VPS หลังย้าย เพื่อเทียบ row count)
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
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
const url =
  process.env.PGURL ||
  pulled.POSTGRES_URL_NON_POOLING ||
  pulled.POSTGRES_PRISMA_URL ||
  pulled.DATABASE_URL;

if (!url || url.includes('[SENSITIVE]')) {
  console.error('✗ ไม่พบ connection string ที่ใช้ได้ (ลอง vercel env pull ก่อน)');
  process.exit(1);
}
const safe = url.replace(/(:\/\/[^:]+:)[^@]+@/, '$1••••@');

// node-postgres ตีความ sslmode=require เป็น verify-full → Supavisor ใช้ cert ที่ Node ไม่รู้จัก
// จึงถอด sslmode ออกจาก connection string แล้วคุมด้วย ssl option เอง
const cleanUrl = url.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/[?&]$/, '').replace(/\?&/, '?');

const c = new Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });

async function main() {
  await c.connect();
  const ver = await c.query('select version() as v, current_setting(\'server_version\') as sv');
  const size = await c.query('select pg_size_pretty(pg_database_size(current_database())) as s');
  const tables = await c.query(`
    select table_name from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE'
    order by table_name`);
  const names = tables.rows.map((r) => r.table_name);

  const counts = {};
  let total = 0;
  for (const t of names) {
    try {
      const r = await c.query(`select count(*)::bigint as n from "${t}"`);
      const n = Number(r.rows[0].n);
      counts[t] = n;
      total += n;
    } catch (e) {
      counts[t] = `ERR:${String(e.message).slice(0, 60)}`;
    }
  }

  const mig = names.includes('_prisma_migrations')
    ? Number((await c.query('select count(*)::bigint as n from "_prisma_migrations" where finished_at is not null')).rows[0].n)
    : null;
  const lastMig = names.includes('_prisma_migrations')
    ? (await c.query('select migration_name, finished_at from "_prisma_migrations" order by finished_at desc nulls last limit 1')).rows[0]
    : null;

  const out = {
    capturedAt: new Date().toISOString(),
    host: safe.replace(/.*@/, '').split('/')[0],
    postgresVersion: ver.rows[0].sv,
    serverVersion: ver.rows[0].v.slice(0, 60),
    databaseSize: size.rows[0].s,
    tableCount: names.length,
    appliedMigrations: mig,
    lastMigration: lastMig,
    totalRows: total,
    rowCounts: counts,
  };

  const stamp = new Date().toISOString().slice(0, 10);
  const outFile = `${process.env.TMPDIR || '.'}/db-baseline-${stamp}.json`;
  writeFileSync(outFile, JSON.stringify(out, null, 2));

  console.log('host          :', out.host);
  console.log('Postgres      :', out.postgresVersion, '| DB size:', out.databaseSize);
  console.log('ตาราง          :', out.tableCount, '| แถวรวม:', total.toLocaleString('th-TH'));
  console.log('migration ที่ใช้แล้ว:', out.appliedMigrations, '| ล่าสุด:', out.lastMigration?.migration_name);
  const top = Object.entries(counts).filter(([, v]) => typeof v === 'number' && v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log('ตารางที่มีข้อมูลมากสุด:', top.map(([k, v]) => `${k}=${v}`).join(', ') || '(ว่าง)');
  console.log('บันทึกไฟล์:', outFile);
  await c.end();
}

main().catch(async (e) => { console.error('ERROR:', e.message); try { await c.end(); } catch {} process.exit(1); });
