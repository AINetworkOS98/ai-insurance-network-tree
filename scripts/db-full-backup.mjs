#!/usr/bin/env node
/**
 * สำรองข้อมูลทั้งหมดของ Postgres (ทุกตารางใน schema public) ออกเป็นไฟล์ CSV + manifest
 * ใช้เป็น "ตาข่ายนิรภัย" ก่อนย้ายขึ้น VPS และเป็นต้นทางสำหรับ db-restore-csv.mjs
 *
 * อ่าน connection string จาก .env.vercel.pull (POSTGRES_URL_NON_POOLING / POSTGRES_PRISMA_URL / DATABASE_URL)
 * หรือส่งผ่าน env: PGURL="postgres://..." node scripts/db-full-backup.mjs
 *
 * ต้องมีไดรเวอร์ pg (ไม่ใส่ใน package.json เพื่อไม่ให้ bundle ขึ้น production):  npm i pg --no-save
 * รัน:  node scripts/db-full-backup.mjs  [--out <โฟลเดอร์>]
 * ผลลัพธ์: backups/supabase-<YYYYMMDD-HHmm>/  (.csv ต่อตาราง + manifest.json + _schema.txt)
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
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
if (!url || url.includes('[SENSITIVE]')) {
  console.error('✗ ไม่พบ connection string ที่ใช้ได้ (ลอง vercel env pull ก่อน)');
  process.exit(1);
}
// ตัด sslmode ออกแล้วคุมด้วย ssl option เอง (Supavisor ใช้ cert ที่ Node ไม่รู้จัก)
const cleanUrl = url.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/[?&]$/, '').replace(/\?&/, '?');
const c = new Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });

const outIdx = process.argv.indexOf('--out');
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 13); // YYYYMMDDHHmm
const dir = outIdx > -1 && process.argv[outIdx + 1] ? process.argv[outIdx + 1] : `${ROOT}/backups/supabase-${stamp}`;

function csvCell(v) {
  if (v === null || v === undefined) return '';
  let s;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function main() {
  mkdirSync(dir, { recursive: true });
  await c.connect();
  const meta = await c.query(`select current_setting('server_version') as sv, pg_size_pretty(pg_database_size(current_database())) as size`);

  const tables = (await c.query(`
    select table_name from information_schema.tables
    where table_schema='public' and table_type='BASE TABLE' order by table_name`)).rows.map((r) => r.table_name);

  const ddl = (await c.query(`
    select table_name, column_name, data_type, is_nullable
    from information_schema.columns where table_schema='public' order by table_name, ordinal_position`)).rows;
  writeFileSync(`${dir}/_schema.txt`,
    ddl.map((r) => `${r.table_name}.${r.column_name} :: ${r.data_type}${r.is_nullable === 'NO' ? ' NOT NULL' : ''}`).join('\n') +
    '\n\nหมายเหตุ: ไฟล์นี้ไว้ตรวจโครงเท่านั้น — กู้โครงจริงด้วย `prisma migrate deploy` (ใช้ prisma/migrations ในรีโป)\n', 'utf8');

  const counts = {};
  const failed = [];
  let total = 0;
  for (const t of tables) {
    try {
      const r = await c.query(`select * from "${t}"`);
      const cols = r.fields.map((f) => f.name);
      const lines = [cols.map(csvCell).join(',')];
      for (const row of r.rows) lines.push(cols.map((col) => csvCell(row[col])).join(','));
      writeFileSync(`${dir}/${t}.csv`, lines.join('\n') + '\n', 'utf8');
      counts[t] = r.rows.length;
      total += r.rows.length;
    } catch (e) {
      failed.push({ table: t, error: String(e.message).slice(0, 100) });
      counts[t] = 'ERR';
    }
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    source: url.replace(/(:\/\/[^:]+:)[^@]+@/, '$1••••@'),
    serverVersion: meta.rows[0].sv,
    databaseSize: meta.rows[0].size,
    tables: tables.length,
    totalRows: total,
    counts,
    failed,
    restoreNote: 'กู้ด้วย: (1) prisma migrate deploy สร้างโครง (2) node scripts/db-restore-csv.mjs <โฟลเดอร์นี้>',
  };
  writeFileSync(`${dir}/manifest.json`, JSON.stringify(manifest, null, 1), 'utf8');
  console.log(`✓ สำรองเสร็จ: ${dir}`);
  console.log(`  ตาราง ${tables.length} · แถวรวม ${total} · ขนาด DB ${meta.rows[0].size} · ไฟล์ที่ล้มเหลว ${failed.length}`);
  const top = Object.entries(counts).filter(([, v]) => typeof v === 'number' && v > 0).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log('  ตารางที่มีข้อมูลมากสุด: ' + top.map(([k, v]) => `${k}=${v}`).join(', '));
  await c.end();
}

main().catch((e) => { console.error('✗ ล้มเหลว:', e.message); process.exit(1); });
