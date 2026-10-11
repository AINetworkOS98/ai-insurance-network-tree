#!/usr/bin/env node
/**
 * register-report.mjs — รายงานผู้สนใจสมัครใหม่จากหน้า /register
 *
 * ใช้: node scripts/register-report.mjs --days 7 [--limit 100] [--full]
 * อ่าน DATABASE_URL จาก .env.local ของโปรเจกต์ (ไม่พิมพ์ secret ออก stdout)
 * stdout: JSON บรรทัดเดียว { ok, days, total, registrants:[{ email, name, phone, createdAt, source }], error }
 *
 * หมายเหตุ PDPA: ไฟล์นี้ไม่บันทึกลงดิสก์ และไม่พิมพ์ secret — ผู้รับคือเจ้าของระบบเท่านั้น
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[m[1]]) process.env[m[1]] = v;
  }
}
loadEnv(path.join(REPO, '.env.local'));
loadEnv(path.join(REPO, '.env'));

function arg(name, def = null) {
  const i = process.argv.indexOf('--' + name);
  if (i === -1) return def;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : true;
}

const DAYS = Math.max(1, Math.min(365, Number(arg('days', 7)) || 7));
const LIMIT = Math.max(1, Math.min(500, Number(arg('limit', 200)) || 200));

const out = { ok: false, days: DAYS, generatedAt: new Date().toISOString(), total: 0, byDay: {}, registrants: [], error: null };

try {
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient();
  const since = new Date(Date.now() - DAYS * 86400000);

  const users = await prisma.user.findMany({
    where: { createdAt: { gte: since } },
    select: { id: true, email: true, firstName: true, lastName: true, displayName: true, phone: true, rankLevel: true, status: true, createdAt: true, sponsorId: true },
    orderBy: { createdAt: 'desc' },
    take: LIMIT,
  });

  // ชื่อผู้แนะนำ (ถ้ามี) — map จาก sponsorId
  const sponsorIds = [...new Set(users.map(u => u.sponsorId).filter(Boolean))];
  const sponsors = sponsorIds.length
    ? await prisma.user.findMany({ where: { id: { in: sponsorIds } }, select: { id: true, email: true, firstName: true, lastName: true } })
    : [];
  const sMap = new Map(sponsors.map(s => [s.id, [s.firstName, s.lastName].filter(Boolean).join(' ').trim() || s.email]));

  const fmtPhone = (p) => {
    const d = String(p || '').replace(/\D/g, '');
    if (d.length < 9) return null;
    return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}` : `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  };

  out.total = users.length;
  for (const u of users) {
    const day = new Date(u.createdAt).toISOString().slice(0, 10);
    out.byDay[day] = (out.byDay[day] || 0) + 1;
    out.registrants.push({
      email: u.email,
      name: [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.displayName || null,
      phone: fmtPhone(u.phone),
      level: u.rankLevel,
      status: u.status,
      createdAt: u.createdAt,
      sponsor: u.sponsorId ? (sMap.get(u.sponsorId) || null) : null,
    });
  }

  // นับทั้งหมดในช่วงเวลา (ไม่จำกัด limit) เพื่อให้ตัวเลขรายงานตรง
  out.totalAll = await prisma.user.count({ where: { createdAt: { gte: since } } });
  out.interested = out.registrants.filter(r => Number(r.level) === 0).length;
  out.ok = true;
  await prisma.$disconnect();
  console.log(JSON.stringify(out));
  process.exit(0);
} catch (e) {
  out.error = String(e && e.message ? e.message : e).slice(0, 400);
  console.log(JSON.stringify(out));
  process.exit(1);
}
