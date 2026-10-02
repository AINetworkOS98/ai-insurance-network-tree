#!/usr/bin/env node
/**
 * กู้ข้อมูลจากชุดสำรอง CSV (ที่สร้างด้วย db-full-backup.mjs) เข้าฐานข้อมูลปลายทาง
 *
 * ใช้:  PGURL="postgres://user:pass@host:5432/db" node scripts/db-restore-csv.mjs <โฟลเดอร์สำรอง> [--dry]
 *   --dry : แค่โชว์ว่าจะทำอะไร ไม่เขียนจริง
 *
 * ลำดับที่ถูกต้อง:
 *   1) สร้างโครงตารางก่อน:  npx prisma migrate deploy   (ใช้ prisma/migrations ในรีโป — ไม่ต้องพึ่งไฟล์สำรอง)
 *   2) กู้ข้อมูลด้วยสคริปต์นี้
 *
 * ข้อควรระวัง: สคริปต์จะ "ล้างข้อมูลเดิม" ในตารางที่อยู่ในชุดสำรองเท่านั้น (DELETE) แล้วใส่กลับ
 * และตั้ง session_replication_role=replica เพื่อข้ามการเช็ค FK ระหว่างโหลด (ต้องเป็น superuser)
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { Client } from 'pg';

const dir = process.argv[2];
const dry = process.argv.includes('--dry');
const rawUrl = process.env.PGURL;
if (!dir || !existsSync(dir)) { console.error('✗ ต้องระบุโฟลเดอร์สำรองที่มี manifest.json:  node scripts/db-restore-csv.mjs <dir>'); process.exit(1); }
if (!rawUrl) { console.error('✗ ต้องส่ง PGURL ของฐานข้อมูลปลายทาง'); process.exit(1); }

const cleanUrl = rawUrl.replace(/([?&])sslmode=[^&]*/g, '$1').replace(/[?&]$/, '').replace(/\?&/, '?');
const c = new Client({ connectionString: cleanUrl, ssl: { rejectUnauthorized: false } });

/** แปลง CSV (รองรับ quote/escape/comma/บรรทัดใหม่ในฟิลด์) เป็นแถว */
function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false;
      } else cell += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
    else if (ch === '\r') { /* ข้าม */ }
    else cell += ch;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ''));
}

async function main() {
  const manifest = JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8'));
  const files = readdirSync(dir).filter((f) => f.endsWith('.csv')).map((f) => f.replace(/\.csv$/, ''));
  await c.connect();
  console.log(`กู้จาก ${dir}\n  ตารางในชุดสำรอง ${manifest.tables} · แถวรวม ${manifest.totalRows} · ไฟล์ CSV ${files.length}`);
  if (dry) { console.log('  (dry run — ไม่เขียนอะไร)'); await c.end(); return; }

  await c.query(`set session_replication_role = replica`); // ข้าม FK/trigger ระหว่างโหลด
  let totalRows = 0;
  const problems = [];
  for (const t of files) {
    const text = readFileSync(`${dir}/${t}.csv`, 'utf8');
    const rows = parseCsv(text);
    if (!rows.length) { problems.push(`${t}: ไฟล์ว่าง`); continue; }
    const cols = rows[0];
    const data = rows.slice(1);
    try {
      await c.query(`delete from "${t}"`);
      const BATCH = 200;
      for (let i = 0; i < data.length; i += BATCH) {
        const chunk = data.slice(i, i + BATCH);
        const params = [];
        const tuples = chunk.map((r) => '(' + r.map((v) => { params.push(v === '' ? null : v); return '$' + params.length; }).join(',') + ')');
        await c.query(`insert into "${t}" (${cols.map((x) => `"${x}"`).join(',')}) values ${tuples.join(',')}`, params);
      }
      totalRows += data.length;
      // ปรับ sequence ให้ต่อจากค่าที่โหลด (กัน id ชนกันในอนาคต)
      try {
        const seq = await c.query(`select pg_get_serial_sequence('"${t}"', 'id') as s`);
        if (seq.rows[0].s) await c.query(`select setval('${seq.rows[0].s}', coalesce((select max(id) from "${t}"), 1))`);
      } catch {}
      if (data.length) console.log(`  ${t}: ${data.length} แถว`);
    } catch (e) {
      problems.push(`${t}: ${String(e.message).slice(0, 120)}`);
    }
  }
  await c.query(`set session_replication_role = default`);
  console.log(`✓ โหลดเสร็จ ${totalRows} แถว · ปัญหา ${problems.length}`);
  if (problems.length) console.log('  ' + problems.slice(0, 12).join('\n  '));
  await c.end();
}

main().catch((e) => { console.error('✗ ล้มเหลว:', e.message); process.exit(1); });
