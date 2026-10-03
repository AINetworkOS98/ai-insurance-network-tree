// net1x5.ts — เครื่องยนต์กลางของ "ระบบบริหารเครือข่าย 1 แตก 5 (อัตโนมัติ)"
//
// หลักการที่ยึด (ตามสเปกที่เจ้าของระบบสั่ง):
//  1) 1 สมาชิกแตกได้ 5 ตำแหน่ง → ตรวจหาช่องว่าง + จัดวางอัตโนมัติ (BFS ตาม lib/tree.ts)
//  2) ตรวจเงื่อนไขอัตโนมัติ: สถานะสมาชิก · ใบเสร็จ/ยอดรับรองตามกำหนดเวลา · วัน-เวลาที่ต้องดำเนินการ
//  3) ไม่ผ่านเงื่อนไข → ตั้งสถานะ "ไม่ผ่านเงื่อนไข" → คัดออกจากตำแหน่ง (ตามกติกา) → ห้ามทิ้งตำแหน่งว่าง
//  4) เลื่อนสมาชิก "ที่ผ่านเงื่อนไขเท่านั้น" ขึ้นแทนตำแหน่งว่าง (ห้ามเลื่อนคนไม่ผ่าน — บังคับในโค้ด)
//  5) หลังเปลี่ยนตำแหน่ง → Recalculate โครงสร้างทุกระดับ (ระดับ/ผู้แนะนำ/สายงาน/ช่อง 1:5)
//  6) เก็บ Log ทุกการเปลี่ยนแปลง (AuditLog + PlacementHistory + PlacementRun) ตรวจสอบย้อนหลังได้
//  7) ลำดับความสำคัญเมื่อผ่านหลายคน: ใกล้ตำแหน่งว่าง → ผลงานรับรองสูงสุด → อาวุโส (joinDate)
//
// ข้อมูลที่ใช้เป็น "ข้อมูลจริง" ในตารางจริง (User / TreeNode / TreePlacement / PerformanceLedger /
// ReceiptFile / AuditLog / PlacementRun·Entry / MembershipStatusHistory) — ไม่ใช้ตาราง sim_* เลย
// กติกาทั้งหมดเก็บใน DB (ReceiptSettings.settings.net1x5) แก้ได้จาก Dashboard โดยไม่ต้องแก้โค้ด

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { POSITIONS, nextQualification, positionName, type PositionCode } from '@/lib/positions';
import { ADMIN_EMAILS } from '@/lib/access-rules';
import { checkPositionEligibility } from '@/lib/positions';
import { findNextPlacementSlotDB } from '@/lib/tree';

export const NET1X5_SETTINGS_KEY = 'net1x5';
export const BRANCH_LIMIT_DEFAULT = 5; // 1 แตก 5 (ตายตัวตามสเปก — ค่าใน DB ใช้เพื่อยืนยันเท่านั้น)
export const TEST_DOMAIN = '@ai-insurance-test.local'; // บัญชีทดสอบ (ลบได้ด้วยเครื่องมือ Admin เดิม)

export type PriorityMode = 'proximity' | 'performance' | 'seniority';

export interface Net1x5Rules {
  branchLimit: number;         // 1 แตก 5
  period: string;              // รอบที่ประเมิน (YYYY-MM)
  receiptDeadlineDays: number; // ต้องส่ง/ดาวน์โหลดใบเสร็จภายในกี่วันหลังปิดรอบ
  deadlineDayOfMonth: number;  // วันที่ต้องดำเนินการทุกเดือน (1-28)
  deadlineHour: number;        // เวลาที่ต้องดำเนินการ (0-23) — ใช้กับ n8n + ตัวนับถอยหลัง
  requireReceipt: boolean;     // ต้องมีใบเสร็จยืนยัน
  minVerifiedAmount: number;   // ยอดรับรองขั้นต่ำต่อรอบ (บาท)
  graceDays: number;           // ผ่อนผันสมาชิกใหม่ (วัน)
  enforceCut: boolean;         // true = คัดออกจริงอัตโนมัติ · false = ตรวจแล้วรออนุมัติ (ปลอดภัยโดยค่าเริ่มต้น)
  autoPromote: boolean;        // เลื่อนสมาชิกที่ผ่านเงื่อนไขขึ้นแทนตำแหน่งว่างอัตโนมัติ
  fillVacancy: boolean;        // ห้ามทิ้งตำแหน่งว่าง: เติมช่อง 1:5 ที่ว่างทันที
  priority: PriorityMode;      // ลำดับความสำคัญเมื่อผ่านหลายคน
  notify: boolean;             // แจ้งเตือนอัตโนมัติ (ตัวเอง/ผู้แนะนำ/Admin)
  maxCutPerRun: number;        // เพดานการคัดออกต่อรอบ (กันรอบทำงานยาวเกินเวลา — ที่เหลือทำรอบถัดไป)
  maxPromotePerRun: number;    // เพดานการเลื่อนตำแหน่งต่อรอบ
  updatedAt?: string;
  updatedBy?: string | null;
}

export function currentPeriod(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function defaultRules(d = new Date()): Net1x5Rules {
  return {
    branchLimit: BRANCH_LIMIT_DEFAULT,
    period: currentPeriod(d),
    receiptDeadlineDays: 15,
    deadlineDayOfMonth: 25,
    deadlineHour: 18,
    requireReceipt: true,
    minVerifiedAmount: 20000,
    graceDays: 30,
    enforceCut: false,
    autoPromote: true,
    fillVacancy: true,
    priority: 'proximity',
    notify: true,
    maxCutPerRun: 10,
    maxPromotePerRun: 3,
  };
}

/** อ่านกติกาจาก DB (ReceiptSettings.settings.net1x5) — ไม่มีก็ใช้ค่าเริ่มต้น */
export async function loadRules(): Promise<Net1x5Rules> {
  const def = defaultRules();
  try {
    const row: any = await prisma.receiptSettings.findUnique({ where: { id: 'default' } });
    const saved = (row?.settings as any)?.[NET1X5_SETTINGS_KEY];
    if (!saved || typeof saved !== 'object') return def;
    return { ...def, ...saved, period: saved.period || def.period };
  } catch {
    return def;
  }
}

export async function saveRules(patch: Partial<Net1x5Rules>, actorId?: string | null): Promise<Net1x5Rules> {
  const cur = await loadRules();
  const next: Net1x5Rules = { ...cur, ...patch, updatedAt: new Date().toISOString(), updatedBy: actorId || null };
  // กันค่าที่หลุดกรอบ (กติกาความปลอดภัย: 1 แตก 5, กำหนดเวลาต้องมีความหมาย)
  next.branchLimit = 5;
  next.receiptDeadlineDays = clamp(next.receiptDeadlineDays, 1, 90);
  next.deadlineDayOfMonth = clamp(next.deadlineDayOfMonth, 1, 28);
  next.deadlineHour = clamp(next.deadlineHour, 0, 23);
  next.minVerifiedAmount = Math.max(0, Number(next.minVerifiedAmount) || 0);
  next.graceDays = clamp(next.graceDays, 0, 365);
  next.maxCutPerRun = clamp(next.maxCutPerRun ?? 20, 1, 200);
  next.maxPromotePerRun = clamp(next.maxPromotePerRun ?? 5, 1, 100);
  if (!['proximity', 'performance', 'seniority'].includes(next.priority)) next.priority = 'proximity';

  let settings: any = {};
  try {
    const row: any = await prisma.receiptSettings.findUnique({ where: { id: 'default' } });
    settings = (row?.settings as any) || {};
  } catch { settings = {}; }
  settings[NET1X5_SETTINGS_KEY] = next;
  await prisma.receiptSettings.upsert({
    where: { id: 'default' },
    create: { id: 'default', settings } as any,
    update: { settings } as any,
  });
  await audit({ actorId, action: 'net1x5.rules_update', entity: 'ReceiptSettings', entityId: 'default', newValue: next, reason: 'แก้กติการะบบ 1 แตก 5' });
  return next;
}

function clamp(v: number, min: number, max: number) {
  const n = Number(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.round(n)));
}

export async function audit(opts: {
  actorId?: string | null; action: string; entity: string; entityId?: string | null;
  oldValue?: unknown; newValue?: unknown; reason?: string;
}) {
  try {
    await (prisma.auditLog as any).create({
      data: {
        userId: opts.actorId || null,
        action: opts.action,
        entity: opts.entity,
        entityId: opts.entityId || null,
        oldValue: (opts.oldValue ?? null) as any,
        newValue: (opts.newValue ?? null) as any,
        reason: opts.reason || null,
      },
    });
  } catch (e) {
    console.error('[net1x5.audit]', (e as Error).message);
  }
}

// ── โครงสร้างเครือข่ายจริง ────────────────────────────────────────────────
export interface NetMember {
  userId: string;
  code: string;
  name: string;
  rankLevel: number;
  positionName: string;
  status: string;
  isActive: boolean;         // จุดในผังยังใช้งาน
  nodeId: string | null;
  level: number;
  slot: number | null;
  parentUserId: string | null;
  sponsorId: string | null;
  managerId: string | null;
  joinDate: string;
  childrenCount: number;     // จำนวนช่องที่ถูกใช้จริง (0..5)
  emptySlots: number[];      // ช่องว่างใน 1..5
  isTest: boolean;
  isAdminAccount: boolean;   // บัญชีผู้ดูแลระบบ — ยกเว้นจากการประเมิน/คัดออกโดยอัตโนมัติเสมอ
  inTree: boolean;           // อยู่ในผังจริง (มี TreeNode) — ใช้คำนวณโครงสร้างให้ตรงฐานข้อมูล
  nodeLevel: number | null;  // ระดับจริงจาก TreeNode (แหล่งความจริงเดียวกับหน้าอื่นของระบบ)
  verifiedAmount: number;    // ยอดรับรองในรอบ (PerformanceLedger active)
  receiptCount: number;      // ใบเสร็จที่ยืนยันแล้วในรอบ
  pendingReceipts: number;   // ใบเสร็จรอตรวจ (ห้ามคัดเพราะ OCR/ผู้ตรวจล่าช้า)
  lastReceiptAt: string | null;
}

export interface CheckResult {
  userId: string;
  code: string;
  name: string;
  level: number;
  rankLevel: number;
  slot: number | null;
  pass: boolean;
  pendingReview: boolean;
  reasons: string[];
  checks: { key: string; label: string; ok: boolean; detail: string }[];
  verifiedAmount: number;
  readyForPromotion: boolean;
  promotionGap: string;
}

export interface VacancyInfo {
  kind: 'slot' | 'position';
  nodeId: string | null;
  parentUserId: string | null;
  parentName: string;
  slot: number;
  level: number;
  reason: string;
}

export interface Candidate {
  userId: string;
  code: string;
  name: string;
  rankLevel: number;
  level: number;
  score: number;
  priorityReason: string;
  verifiedAmount: number;
  ready: boolean;
  gap: string;
}

export interface EngineState {
  rules: Net1x5Rules;
  period: string;
  now: string;
  deadline: { iso: string; daysLeft: number; passed: boolean; label: string };
  summary: {
    total: number; active: number; nonActive: number; passed: number; failed: number;
    failedActionable: number; alreadyOut: number; outOfTree: number;
    pendingReview: number; vacancies: number; emptySlots: number; candidates: number; readyCandidates: number;
    promotedLast: number; cutLast: number;
  };
  members: NetMember[];
  checks: CheckResult[];
  failed: CheckResult[];
  vacancies: VacancyInfo[];
  candidates: Candidate[];
  tree: { roots: any[]; perLevel: { level: number; count: number; capacity: number }[]; branchLimit: number };
  lastRun: any | null;
  logs: any[];
  testAccounts: number;
}

const ACTIVE_STATES = ['ACTIVE'];

function fullName(u: any): string {
  return u?.displayName || `${u?.firstName || ''} ${u?.lastName || ''}`.trim() || u?.email || u?.id;
}

export function isTestUser(email?: string | null) {
  return String(email || '').endsWith(TEST_DOMAIN);
}

/** บัญชีผู้ดูแลระบบ (ตามรายการใน lib/access-rules) — ห้ามถูกคัดออก/เปลี่ยนระดับโดยวงจรอัตโนมัติเด็ดขาด */
function isAdminAccountEmail(email?: string | null): boolean {
  const e = String(email || '').trim().toLowerCase();
  if (!e) return false;
  try {
    // ใช้รายการกลางรายการเดียวกับระบบสิทธิ์ (ไม่ประกาศซ้ำที่นี่)
    const list = (ADMIN_EMAILS as unknown as string[]) || [];
    return list.map((x) => String(x).trim().toLowerCase()).includes(e);
  } catch {
    return false;
  }
}

/** โหลดสมาชิก + โครงสร้างผังจริงจาก DB */
export async function collectNetwork(): Promise<{ members: NetMember[]; nodeByUserId: Map<string, any>; placements: any[] }> {
  const users: any[] = await (prisma.user as any).findMany({
    where: { status: { notIn: ['RESIGNED'] }, OR: [{ rankLevel: { gte: 1 } }, { treeNode: { isNot: null } }] },
    select: {
      id: true, email: true, memberCode: true, displayName: true, firstName: true, lastName: true,
      status: true, rankLevel: true, sponsorId: true, managerId: true, placementParentId: true,
      createdAt: true,
      treeNode: { select: { id: true, level: true, isActive: true, directCount: true, createdAt: true } },
    },
    take: 4000,
  }).catch(() => []);

  const ids = users.map((u) => u.id);
  const placements: any[] = ids.length
    ? await (prisma.treePlacement as any).findMany({
        select: { id: true, parentId: true, childId: true, slot: true, level: true, createdAt: true },
      }).catch(() => [])
    : [];

  const nodeByUserId = new Map<string, any>();
  users.forEach((u) => { if (u.treeNode) nodeByUserId.set(u.id, u.treeNode); });
  const nodeById = new Map<string, any>();
  nodeByUserId.forEach((n, uid) => nodeById.set(n.id, { ...n, userId: uid }));

  const childByUser = new Map<string, any>();
  placements.forEach((p) => {
    const parentNode = nodeById.get(p.parentId);
    if (parentNode) childByUser.set(p.childId, { ...p, parentUserId: parentNode.userId });
  });

  // ยอดรับรอง + ใบเสร็จในรอบ
  const ledgers: any[] = ids.length
    ? await (prisma.performanceLedger as any).findMany({ where: { userId: { in: ids }, status: 'active' }, select: { userId: true, amount: true, period: true } }).catch(() => [])
    : [];
  const verifiedByUser = new Map<string, number>();
  ledgers.forEach((l) => verifiedByUser.set(l.userId, (verifiedByUser.get(l.userId) || 0) + Number(l.amount || 0)));

  const receipts: any[] = ids.length
    ? await (prisma.receiptFile as any).findMany({ where: { userId: { in: ids } }, select: { userId: true, status: true, createdAt: true } }).catch(() => [])
    : [];
  const receiptStats = new Map<string, { verified: number; pending: number; last: Date | null }>();
  receipts.forEach((r) => {
    const s = receiptStats.get(r.userId) || { verified: 0, pending: 0, last: null };
    const st = String(r.status || '');
    if (/verif|approv|accept/i.test(st)) s.verified += 1;
    if (/upload|extract|pend|queue|submitt/i.test(st)) s.pending += 1;
    const at = r.createdAt ? new Date(r.createdAt) : null;
    if (at && (!s.last || at > s.last)) s.last = at;
    receiptStats.set(r.userId, s);
  });

  const occupiedByParent = new Map<string, number[]>();
  placements.forEach((p) => {
    const arr = occupiedByParent.get(p.parentId) || [];
    arr.push(p.slot);
    occupiedByParent.set(p.parentId, arr);
  });

  const members: NetMember[] = users.map((u) => {
    const node = u.treeNode;
    const occ = node ? occupiedByParent.get(node.id) || [] : [];
    const rs = receiptStats.get(u.id);
    const place = childByUser.get(u.id);
    const rl = Number(u.rankLevel ?? 0);
    return {
      userId: u.id,
      code: u.memberCode || `U-${String(u.id).slice(0, 6)}`,
      name: fullName(u),
      rankLevel: rl,
      positionName: positionName(POSITIONS[rl]?.code || 'general'),
      status: String(u.status),
      isActive: node ? node.isActive !== false : false,
      inTree: !!node,
      nodeLevel: node ? Number(node.level ?? 0) : null,
      nodeId: node?.id || null,
      level: place?.level ?? node?.level ?? 0,
      slot: place?.slot ?? null,
      parentUserId: place?.parentUserId ?? u.placementParentId ?? null,
      sponsorId: u.sponsorId || null,
      managerId: u.managerId || null,
      joinDate: new Date(u.createdAt).toISOString(),
      childrenCount: occ.length,
      emptySlots: [1, 2, 3, 4, 5].filter((s) => !occ.includes(s)),
      isTest: isTestUser(u.email),
      isAdminAccount: isAdminAccountEmail(u.email),
      verifiedAmount: verifiedByUser.get(u.id) || 0,
      receiptCount: rs?.verified || 0,
      pendingReceipts: rs?.pending || 0,
      lastReceiptAt: rs?.last ? rs.last.toISOString() : null,
    };
  });

  return { members, nodeByUserId, placements };
}

/** กำหนดเวลาที่ต้องดำเนินการของรอบ (ใช้ทั้งในหน้าจอและ n8n) */
export function computeDeadline(rules: Net1x5Rules, now = new Date()) {
  const [y, m] = (rules.period || currentPeriod(now)).split('-').map(Number);
  const day = Math.min(rules.deadlineDayOfMonth, 28);
  const base = new Date(Date.UTC(y, (m || 1) - 1, day, rules.deadlineHour, 0, 0));
  const at = new Date(base.getTime() + rules.receiptDeadlineDays * 86400000);
  const daysLeft = Math.ceil((at.getTime() - now.getTime()) / 86400000);
  return {
    iso: at.toISOString(),
    daysLeft,
    passed: at.getTime() < now.getTime(),
    label: `กำหนดส่งใบเสร็จ/ปิดเงื่อนไขรอบ ${rules.period}: วันที่ ${at.getDate()}/${at.getMonth() + 1}/${at.getFullYear()} ${String(rules.deadlineHour).padStart(2, '0')}:00 (เหลือ ${Math.max(0, daysLeft)} วัน)`,
  };
}

/** ตรวจเงื่อนไขสมาชิก 1 คน (pure — ไม่ยิง DB) */
export function evaluateMember(m: NetMember, rules: Net1x5Rules, now = new Date()): CheckResult {
  const reasons: string[] = [];
  const checks: { key: string; label: string; ok: boolean; detail: string }[] = [];
  const joined = new Date(m.joinDate);
  const ageDays = Math.floor((now.getTime() - joined.getTime()) / 86400000);
  const grace = ageDays < rules.graceDays && m.rankLevel <= 1;

  // 0) บัญชีผู้ดูแลระบบ — ยกเว้นจากการประเมิน/คัดออกอัตโนมัติเสมอ (กันระบบตัดเจ้าของระบบ)
  if (m.isAdminAccount) {
    return {
      userId: m.userId, code: m.code, name: m.name, level: m.level, rankLevel: m.rankLevel, slot: m.slot,
      pass: true, pendingReview: false, reasons: [],
      checks: [{ key: 'admin_account', label: 'บัญชีผู้ดูแลระบบ', ok: true, detail: 'ยกเว้นจากการประเมิน/คัดออกโดยวงจรอัตโนมัติ' }],
      verifiedAmount: m.verifiedAmount, readyForPromotion: false, promotionGap: 'บัญชีผู้ดูแลระบบ — ไม่อยู่ในเกณฑ์เลื่อนตำแหน่งของวงจรอัตโนมัติ',
    };
  }

  // 1) สถานะสมาชิก
  const statusOk = ACTIVE_STATES.includes(m.status) && m.isActive;
  checks.push({
    key: 'status', label: 'สถานะสมาชิก', ok: statusOk || grace,
    detail: statusOk ? `สถานะ ${m.status} · จุดในผังใช้งาน` : `สถานะ ${m.status}${m.isActive ? '' : ' · จุดในผังปิด'}${grace ? ` (อยู่ในระยะผ่อนผัน ${rules.graceDays} วัน)` : ''}`,
  });
  if (!statusOk && !grace) reasons.push(`สถานะไม่ผ่าน (${m.status}${m.isActive ? '' : ' · จุดในผังปิด'})`);

  // 2) ใบเสร็จ / เอกสารตามเงื่อนไข
  const receiptOk = !rules.requireReceipt || m.receiptCount > 0 || m.verifiedAmount >= rules.minVerifiedAmount;
  checks.push({
    key: 'receipt', label: 'ดาวน์โหลด/ยืนยันใบเสร็จ', ok: receiptOk || grace,
    detail: rules.requireReceipt
      ? `ใบเสร็จยืนยันแล้ว ${m.receiptCount} ใบ${m.lastReceiptAt ? ` · ล่าสุด ${new Date(m.lastReceiptAt).toLocaleDateString('th-TH')}` : ' · ยังไม่มี'}`
      : 'กติกาปิดการบังคับใบเสร็จ',
  });
  if (!receiptOk && !grace) reasons.push('ไม่พบใบเสร็จที่ยืนยันภายในกำหนด');

  // 3) ยอดรับรองขั้นต่ำ
  const amountOk = m.verifiedAmount >= rules.minVerifiedAmount;
  checks.push({
    key: 'amount', label: 'ยอดรับรองขั้นต่ำ', ok: amountOk || grace,
    detail: `รับรองแล้ว ฿${m.verifiedAmount.toLocaleString('th-TH')} / เกณฑ์ ฿${rules.minVerifiedAmount.toLocaleString('th-TH')}`,
  });
  if (!amountOk && !grace) reasons.push(`ยอดรับรองไม่ถึงเกณฑ์ (฿${m.verifiedAmount.toLocaleString('th-TH')}/฿${rules.minVerifiedAmount.toLocaleString('th-TH')})`);

  // 4) รอตรวจ — ห้ามคัดเพราะ OCR/ผู้ตรวจล่าช้า
  const pendingReview = m.pendingReceipts > 0;
  checks.push({
    key: 'pending', label: 'ใบเสร็จรอตรวจ', ok: true,
    detail: pendingReview ? `มี ${m.pendingReceipts} ใบรอตรวจ — ระบบกันการคัดออกไว้ก่อน` : 'ไม่มีใบเสร็จค้างตรวจ',
  });

  // 5) คุณสมบัติพร้อมเลื่อนตำแหน่ง (ใช้อ่านอย่างเดียว — ไม่มีผลต่อการคัดออก)
  const code = (POSITIONS[m.rankLevel]?.code || 'general') as PositionCode;
  let readyForPromotion = false;
  let promotionGap = '';
  try {
    const q = checkPositionEligibility(code, m.verifiedAmount, Math.max(0, m.childrenCount), 0);
    readyForPromotion = !!q.qualified;
    promotionGap = q.summary;
  } catch {
    const nq = nextQualification(code);
    readyForPromotion = !nq;
    promotionGap = nq ? `เป้าถัดไป: ${nq.targetNameTh}` : 'ดำรงตำแหน่งสูงสุดแล้ว';
  }
  checks.push({ key: 'promotion', label: 'คุณสมบัติเลื่อนตำแหน่ง', ok: readyForPromotion, detail: promotionGap });

  const pass = reasons.length === 0;
  return {
    userId: m.userId, code: m.code, name: m.name, level: m.level, rankLevel: m.rankLevel, slot: m.slot,
    pass, pendingReview, reasons, checks,
    verifiedAmount: m.verifiedAmount, readyForPromotion, promotionGap,
  };
}

/** หาตำแหน่งว่างทั้งหมด: ช่อง 1:5 ที่ยังว่าง + ตำแหน่งที่ถูกคัดออกในรอบนี้ */
export async function findVacancies(members: NetMember[], cutUserIds: string[] = []): Promise<VacancyInfo[]> {
  const out: VacancyInfo[] = [];
  const byId = new Map(members.map((m) => [m.userId, m]));
  for (const m of members) {
    if (!m.nodeId || !m.isActive) continue;
    for (const s of m.emptySlots) {
      out.push({
        kind: 'slot', nodeId: m.nodeId, parentUserId: m.userId, parentName: m.name, slot: s, level: m.level + 1,
        reason: `ช่องที่ ${s} ของ ${m.name} ว่าง — ต้องเติมตามกติกา 1 แตก 5`,
      });
    }
  }
  for (const uid of cutUserIds) {
    const m = byId.get(uid);
    if (!m) continue;
    out.push({
      kind: 'position', nodeId: m.nodeId, parentUserId: m.parentUserId, parentName: m.name, slot: m.slot ?? 0, level: m.level,
      reason: `ตำแหน่งของ ${m.name} ว่างจากการคัดออก — ต้องเลื่อนผู้มีคุณสมบัติขึ้นแทน`,
    });
  }
  return out;
}

/** ค้นหาผู้มีคุณสมบัติครบ + จัดลำดับความสำคัญ (ห้ามเสนอคนไม่ผ่านเงื่อนไข) */
export function rankCandidates(checks: CheckResult[], members: NetMember[], vacancy: VacancyInfo | null, mode: PriorityMode): Candidate[] {
  const byId = new Map(members.map((m) => [m.userId, m]));
  const pool = checks.filter((c) => c.pass && !c.pendingReview);
  const rows = pool.map((c) => {
    const m = byId.get(c.userId)!;
    let proximity = 0;
    let why = 'อยู่ในเครือข่าย';
    if (vacancy?.parentUserId) {
      if (m.parentUserId === vacancy.parentUserId) { proximity = 3; why = 'อยู่ในสายงานเดียวกับตำแหน่งว่าง'; }
      else if (m.sponsorId === vacancy.parentUserId || m.managerId === vacancy.parentUserId) { proximity = 2; why = 'อยู่ใต้ผู้แนะนำเดียวกับตำแหน่งว่าง'; }
      else if (vacancy.level != null && Math.abs((m.level || 0) - vacancy.level) <= 1) { proximity = 1; why = 'อยู่ชั้นใกล้ตำแหน่งว่าง'; }
    }
    const seniority = -new Date(m.joinDate).getTime();
    const perf = c.verifiedAmount;
    const score =
      mode === 'performance' ? perf * 1e6 + proximity * 1e5 + seniority / 1e9
      : mode === 'seniority' ? seniority / 1e6 + proximity * 1e4 + perf / 1e3
      : proximity * 1e12 + perf * 1e3 + seniority / 1e9;
    return {
      userId: c.userId, code: c.code, name: c.name, rankLevel: c.rankLevel, level: c.level,
      score, priorityReason: `${why} · ยอดรับรอง ฿${c.verifiedAmount.toLocaleString('th-TH')} · สมัคร ${new Date(m.joinDate).toLocaleDateString('th-TH')}`,
      verifiedAmount: c.verifiedAmount, ready: c.readyForPromotion, gap: c.promotionGap,
    } as Candidate;
  });
  rows.sort((a, b) => b.score - a.score);
  return rows;
}

/** Recalculate โครงสร้าง: ระดับ / directCount / ช่องว่าง ของทุกระดับ (เรียกหลังเปลี่ยนตำแหน่งทุกครั้ง) */
export async function recalculateTree(actorId?: string | null): Promise<{ fixedLevels: number; fixedCounts: number; orphans: number; levels: { level: number; count: number }[] }> {
  const nodes: any[] = await (prisma.treeNode as any).findMany({ select: { id: true, userId: true, level: true, directCount: true, isActive: true } }).catch(() => []);
  const placements: any[] = await (prisma.treePlacement as any).findMany({ select: { id: true, parentId: true, childId: true, slot: true, level: true } }).catch(() => []);
  const parentByChild = new Map<string, any>();
  placements.forEach((p) => parentByChild.set(p.childId, p));
  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const occCount = new Map<string, number>();
  placements.forEach((p) => occCount.set(p.parentId, (occCount.get(p.parentId) || 0) + 1));

  let fixedLevels = 0, fixedCounts = 0, orphans = 0;
  const updates: { id: string; data: any }[] = [];
  // คำนวณระดับจริงจากรากลงมา (BFS ตามสายงาน)
  const childrenByParentNode = new Map<string, any[]>();
  placements.forEach((p) => {
    const arr = childrenByParentNode.get(p.parentId) || [];
    arr.push(p);
    childrenByParentNode.set(p.parentId, arr);
  });
  const roots = nodes.filter((n) => !parentByChild.has(n.userId));
  const queue: { userId: string; level: number }[] = roots.map((r) => ({ userId: r.userId, level: 0 }));
  const seen = new Set<string>();
  const levelOf = new Map<string, number>();
  while (queue.length) {
    const cur = queue.shift()!;
    if (seen.has(cur.userId)) continue;
    seen.add(cur.userId);
    levelOf.set(cur.userId, cur.level);
    const node = nodes.find((n) => n.userId === cur.userId);
    if (!node) continue;
    for (const p of childrenByParentNode.get(node.id) || []) {
      queue.push({ userId: p.childId, level: cur.level + 1 });
    }
  }

  for (const n of nodes) {
    const wantLevel = levelOf.get(n.userId);
    const occ = occCount.get(n.id) || 0;
    const data: any = {};
    if (wantLevel != null && wantLevel !== n.level) { data.level = wantLevel; fixedLevels++; }
    if (occ !== n.directCount) { data.directCount = occ; fixedCounts++; }
    if (!parentByChild.has(n.userId) && n.level !== 0 && wantLevel == null) {
      data.level = 0; fixedLevels++; orphans++;
    }
    if (Object.keys(data).length) updates.push({ id: n.id, data });
  }

  // อัปเดตเป็นชุด (ขนานแบบจำกัดคู่ขนาน) — เร็วกว่ายิงทีละแถวหลายเท่าเมื่อเครือข่ายใหญ่
  for (let i = 0; i < updates.length; i += 8) {
    await Promise.all(
      updates.slice(i, i + 8).map((u) => (prisma.treeNode as any).update({ where: { id: u.id }, data: u.data }).catch(() => null)),
    );
  }

  const perLevel = new Map<number, number>();
  levelOf.forEach((lv) => perLevel.set(lv, (perLevel.get(lv) || 0) + 1));
  if (fixedLevels || fixedCounts || orphans) {
    await audit({
      actorId, action: 'net1x5.tree_recalc', entity: 'TreeNode',
      newValue: { fixedLevels, fixedCounts, orphans }, reason: 'Recalculate โครงสร้างหลังเปลี่ยนตำแหน่ง',
    });
  }
  return { fixedLevels, fixedCounts, orphans, levels: [...perLevel.entries()].map(([level, count]) => ({ level, count })).sort((a, b) => a.level - b.level) };
}

export interface StepResult {
  step: number; key: string; label: string;
  status: 'ok' | 'warn' | 'skipped' | 'error';
  count: number; detail: string;
  items?: any[];
}

export interface CycleRunResult {
  runId: string | null;
  mode: 'preview' | 'apply';
  period: string;
  rules: Net1x5Rules;
  deadline: ReturnType<typeof computeDeadline>;
  steps: StepResult[];
  summary: any;
  failed: CheckResult[];
  cut: any[];
  promotions: any[];
  placements: any[];
  vacancies: VacancyInfo[];
  candidates: Candidate[];
  warnings: string[];
}

/**
 * รันวงจรเต็มตามสเปก:
 * ตรวจสอบเงื่อนไข → ระบุสมาชิกที่ไม่ผ่าน → นำออกจากตำแหน่ง → ค้นหาผู้มีคุณสมบัติครบ
 * → เลื่อนขึ้นแทน → ปรับสายงาน 1:5 → อัปเดตโครงสร้างทุกระดับ → แจ้งเตือน → เก็บ Log
 */
export async function runCycle(opts: {
  mode: 'preview' | 'apply'; actorId?: string | null; period?: string; idempotencyKey?: string;
  notifyImpl?: (o: { userId: string; type: string; title: string; body?: string; referenceId?: string }) => Promise<any>;
}): Promise<CycleRunResult> {
  const mode = opts.mode;
  const rules = await loadRules();
  if (opts.period) rules.period = opts.period;
  const now = new Date();
  const deadline = computeDeadline(rules, now);
  const warnings: string[] = [];
  const steps: StepResult[] = [];

  // ── ขั้น 1: ตรวจสอบเงื่อนไข ────────────────────────────────────────────
  const { members } = await collectNetwork();
  const checks = members.map((m) => evaluateMember(m, rules, now));
  const failed = checks.filter((c) => !c.pass);
  const pendingReview = checks.filter((c) => c.pendingReview && !c.pass);
  steps.push({
    step: 1, key: 'verify', label: 'ตรวจสอบเงื่อนไขสมาชิก', status: 'ok',
    count: checks.length,
    detail: `ตรวจ ${checks.length} คน · ผ่าน ${checks.length - failed.length} · ไม่ผ่าน ${failed.length}${pendingReview.length ? ` · รอตรวจใบเสร็จ (กันการคัด) ${pendingReview.length}` : ''}`,
    items: checks.map((c) => ({ code: c.code, name: c.name, pass: c.pass, reasons: c.reasons })),
  });

  // ── ขั้น 2: ระบุสมาชิกที่ไม่ผ่าน ───────────────────────────────────────
  const cuttable = failed.filter((c) => !c.pendingReview && !isGrace(members, c.userId, rules, now) && !isAlreadyCut(members, c.userId));
  steps.push({
    step: 2, key: 'identify', label: 'ระบุสมาชิกที่ไม่ผ่านเงื่อนไข', status: cuttable.length ? 'warn' : 'ok',
    count: cuttable.length,
    detail: cuttable.length
      ? `ไม่ผ่านเงื่อนไข ${cuttable.length} คน: ${cuttable.slice(0, 8).map((c) => c.code).join(', ')}${cuttable.length > 8 ? '…' : ''}`
      : 'ไม่มีสมาชิกที่ไม่ผ่านเงื่อนไขในรอบนี้',
    items: cuttable.map((c) => ({ code: c.code, name: c.name, reasons: c.reasons })),
  });

  // ── ขั้น 3: นำออกจากตำแหน่ง (ตามกติกา) ────────────────────────────────
  const cut: any[] = [];
  if (!cuttable.length) {
    steps.push({ step: 3, key: 'cut', label: 'นำออกจากตำแหน่ง', status: 'skipped', count: 0, detail: 'ไม่มีรายการให้ดำเนินการ' });
  } else if (!rules.enforceCut) {
    steps.push({
      step: 3, key: 'cut', label: 'นำออกจากตำแหน่ง', status: 'warn', count: 0,
      detail: `กติกายังไม่เปิด "คัดออกอัตโนมัติ" — ตรวจพบ ${cuttable.length} คนไม่ผ่านเงื่อนไข แต่ยังไม่ตัดออก (รอผู้ดูแลยืนยัน)`,
    });
  } else if (mode === 'preview') {
    steps.push({
      step: 3, key: 'cut', label: 'นำออกจากตำแหน่ง', status: 'skipped', count: 0,
      detail: `โหมดตรวจสอบ (preview) — จะตัดออก ${cuttable.length} คน เมื่อกดยืนยันดำเนินการจริง`,
    });
  } else {
    // เขียนเป็นชุด (เร็ว) + จำกัดจำนวนต่อรอบ เพื่อไม่ให้คำขอยาวเกินเวลาทำงานของเซิร์ฟเวอร์
    const batch = cuttable.slice(0, rules.maxCutPerRun || 20);
    const res = await applyCutsBatch(batch, members, rules, opts.actorId || null, opts.notifyImpl);
    cut.push(...res.cut);
    warnings.push(...res.warnings);
    if (cuttable.length > batch.length) {
      warnings.push(`รอบนี้ตัดออกครบเพดาน ${batch.length} คน — อีก ${cuttable.length - batch.length} คน ระบบจะดำเนินการต่อในรอบถัดไปอัตโนมัติ`);
    }
    steps.push({
      step: 3, key: 'cut', label: 'นำออกจากตำแหน่ง', status: cut.length ? 'warn' : 'error', count: cut.length,
      detail: `คัดออก ${cut.length} คน — ตั้งสถานะ "ไม่ผ่านเงื่อนไข" (SUSPENDED) ปิดจุดในผังเป็นไม่ใช้งาน ปลดช่องในผังให้เติมได้จริง และบันทึกประวัติครบ`,
      items: cut,
    });
  }

  // ── ขั้น 4: ค้นหาผู้มีคุณสมบัติครบ ─────────────────────────────────────
  const cutIds = cut.map((c) => c.userId);
  // ตำแหน่งว่างที่เกิดจากการคัดออก (อ้างจาก "ช่องของผู้ถูกคัดออก" ที่ระบบปลดให้แล้ว)
  const positionVacancies: VacancyInfo[] = cut
    .map((c) => {
      const m = members.find((x) => x.userId === c.userId);
      if (!m || !m.parentUserId) return null;
      const parent = members.find((x) => x.userId === m.parentUserId);
      return {
        kind: 'position' as const, nodeId: parent?.nodeId ?? null, parentUserId: m.parentUserId,
        parentName: parent?.name ?? '—', slot: m.slot ?? 0, level: m.level,
        reason: `ตำแหน่งของ ${m.name} ว่างจากการคัดออก — ต้องเลื่อนผู้มีคุณสมบัติขึ้นแทน`,
      };
    })
    .filter(Boolean) as VacancyInfo[];
  const vacancies = [...positionVacancies, ...(await findVacancies(members.filter((m) => !cutIds.includes(m.userId)), []))];
  const candidates = rankCandidates(checks, members, vacancies[0] || null, rules.priority);
  const ready = candidates.filter((c) => c.ready);
  steps.push({
    step: 4, key: 'search', label: 'ค้นหาสมาชิกที่มีคุณสมบัติครบ', status: ready.length ? 'ok' : 'warn',
    count: ready.length,
    detail: `ผู้ผ่านเงื่อนไข ${candidates.length} คน · คุณสมบัติครบพร้อมเลื่อน ${ready.length} คน (เรียงตามลำดับความสำคัญ: ${priorityLabel(rules.priority)})`,
    items: candidates.slice(0, 20),
  });

  // ── ขั้น 5: เลื่อนขึ้นแทนตำแหน่งว่าง ───────────────────────────────────
  const promotions: any[] = [];
  const placements: any[] = [];
  if (!vacancies.length) {
    steps.push({ step: 5, key: 'promote', label: 'เลื่อนขึ้นแทนตำแหน่งที่ว่าง', status: 'ok', count: 0, detail: 'ไม่มีตำแหน่งว่างในโครงสร้าง — ไม่ต้องเลื่อน' });
  } else if (!rules.autoPromote) {
    steps.push({ step: 5, key: 'promote', label: 'เลื่อนขึ้นแทนตำแหน่งที่ว่าง', status: 'skipped', count: 0, detail: 'กติกาปิดการเลื่อนตำแหน่งอัตโนมัติ' });
  } else if (mode === 'preview') {
    steps.push({
      step: 5, key: 'promote', label: 'เลื่อนขึ้นแทนตำแหน่งที่ว่าง', status: 'skipped', count: 0,
      detail: `โหมดตรวจสอบ — ตำแหน่งว่าง ${vacancies.length} ตำแหน่ง (ตำแหน่งจากคัดออก ${positionVacancies.length}) พร้อมผู้มีคุณสมบัติ ${ready.length} คน`,
      items: vacancies.slice(0, 20),
    });
  } else {
    const maxPromote = rules.maxPromotePerRun || 5;
    let promotedCount = 0;
    for (const v of positionVacancies.length ? positionVacancies : vacancies.slice(0, 1)) {
      if (promotedCount >= maxPromote) {
        warnings.push(`เลื่อนตำแหน่งครบเพดานรอบนี้ ${maxPromote} คน — ที่เหลือระบบดำเนินการต่อรอบถัดไปอัตโนมัติ`);
        break;
      }
      const pick = ready.shift();
      if (!pick) {
        warnings.push(`ตำแหน่งว่างที่ ${v.parentName} ช่อง ${v.slot} ยังไม่มีผู้มีคุณสมบัติครบ — เข้าคิวเติมรอบถัดไป (ห้ามทิ้งว่างถาวร)`);
        await queueVacancy(v, rules, opts.actorId || null);
        break;
      }
      const res = await applyPromotion(pick, v, rules, opts.actorId || null, opts.notifyImpl);
      if (res.ok) { promotions.push({ ...pick, ...res }); promotedCount++; }
      else warnings.push(`เลื่อน ${pick.code} ไม่สำเร็จ: ${res.error}`);
    }
    steps.push({
      step: 5, key: 'promote', label: 'เลื่อนขึ้นแทนตำแหน่งที่ว่าง', status: promotions.length ? 'ok' : 'warn', count: promotions.length,
      detail: promotions.length
        ? `เลื่อนตำแหน่ง ${promotions.length} คน โดยตรวจคุณสมบัติครบก่อนทุกครั้ง (ไม่ผ่าน = ไม่เลื่อน)`
        : 'ยังไม่มีผู้ผ่านเงื่อนไขครบพอจะเลื่อนขึ้นแทน — ส่งเข้าคิวอัตโนมัติ',
      items: promotions,
    });
  }

  // ── ขั้น 6: ปรับสายงาน 1:5 (เติมช่องว่างที่เหลือ) ─────────────────────
  if (mode === 'apply' && rules.fillVacancy) {
    const slotVacancies = (await findVacancies(members.filter((m) => !cutIds.includes(m.userId)), [])).filter((v) => v.kind === 'slot');
    const waiters: any[] = await (prisma.placementQueue as any).findMany({ orderBy: { queueNo: 'asc' }, take: 50 }).catch(() => []);
    let filled = 0;
    for (const w of waiters) {
      const target = await findNextPlacementSlotDB(prisma, w.sponsorId || null).catch(() => null);
      if (!target) break;
      const r = await placeMemberIntoSlot(w.userId, target, opts.actorId || null);
      if (r.ok) { filled++; placements.push({ userId: w.userId, ...target }); }
    }
    steps.push({
      step: 6, key: 'relink', label: 'ปรับสายงาน 1 แตก 5', status: 'ok', count: filled,
      detail: `ช่องว่างในผัง ${slotVacancies.length} ช่อง · เติมจากคิวรอจัดวาง ${filled} คน · ตรวจความสัมพันธ์ ผู้แนะนำ/สายงาน/ตำแหน่งว่าง ครบ`,
      items: slotVacancies.slice(0, 20),
    });
  } else {
    steps.push({
      step: 6, key: 'relink', label: 'ปรับสายงาน 1 แตก 5', status: mode === 'preview' ? 'skipped' : 'ok', count: 0,
      detail: mode === 'preview' ? 'โหมดตรวจสอบ — ยังไม่ปรับสายงาน' : 'กติกาปิดการเติมช่องว่างอัตโนมัติ',
    });
  }

  // ── ขั้น 7: Recalculate + อัปเดตโครงสร้างทุกระดับ + Log ───────────────
  let recalc: any = null;
  if (mode === 'apply') recalc = await recalculateTree(opts.actorId || null);
  const runId = mode === 'apply' ? await recordRun({ rules, steps, cut, promotions, placements, actorId: opts.actorId || null, idempotencyKey: opts.idempotencyKey }) : null;
  steps.push({
    step: 7, key: 'recalc', label: 'อัปเดตโครงสร้างทุกระดับ + เก็บ Log', status: 'ok', count: recalc?.fixedLevels || 0,
    detail: mode === 'apply'
      ? `Recalculate แล้ว: แก้ระดับ ${recalc?.fixedLevels || 0} · ปรับจำนวนลูกตรง ${recalc?.fixedCounts || 0} · โหนดกำพร้า ${recalc?.orphans || 0} · บันทึก Log ครบทุกรายการ (ตรวจสอบย้อนหลังได้)`
      : 'โหมดตรวจสอบ — ยังไม่เขียนข้อมูลจริง (ไม่มี Log ใหม่)',
  });

  const summary = {
    // โครงสร้างนับจากจุดในผังจริง (TreeNode) — ให้ตรงกับตารางจริงและตรงกับหน้าแดชบอร์ด
    total: members.filter((m) => m.inTree).length,
    active: members.filter((m) => m.inTree && m.isActive && m.status === 'ACTIVE').length,
    nonActive: members.filter((m) => m.inTree && !m.isActive).length,
    passed: checks.length - failed.length,
    failed: failed.length,
    failedActionable: failed.filter((c) => !isAlreadyCut(members, c.userId)).length,
    alreadyOut: failed.filter((c) => isAlreadyCut(members, c.userId)).length,
    outOfTree: members.filter((m) => !m.inTree).length,
    pendingReview: checks.filter((c) => c.pendingReview).length,
    vacancies: vacancies.length,
    emptySlots: vacancies.filter((v) => v.kind === 'slot').length,
    candidates: candidates.length,
    readyCandidates: ready.length,
    promotedLast: promotions.length,
    cutLast: cut.length,
  };

  return { runId, mode, period: rules.period, rules, deadline, steps, summary, failed: cuttable, cut, promotions, placements, vacancies, candidates, warnings };
}

function priorityLabel(p: PriorityMode) {
  return p === 'performance' ? 'ผลงานรับรองสูงสุดก่อน' : p === 'seniority' ? 'อาวุโส (สมัครก่อน) ก่อน' : 'ใกล้ตำแหน่งว่างที่สุดก่อน แล้วค่อยดูผลงาน';
}

function isGrace(members: NetMember[], userId: string, rules: Net1x5Rules, now: Date) {
  const m = members.find((x) => x.userId === userId);
  if (!m) return false;
  const ageDays = Math.floor((now.getTime() - new Date(m.joinDate).getTime()) / 86400000);
  return ageDays < rules.graceDays && m.rankLevel <= 1;
}

/** ถูกนำออกจากโครงสร้างไปแล้ว (SUSPENDED/RESIGNED) — ห้ามตัดซ้ำ/ห้ามรายงานเป็นรายการใหม่ทุกรอบ */
function isAlreadyCut(members: NetMember[], userId: string) {
  const m = members.find((x) => x.userId === userId);
  if (!m) return true;
  // ออกจากผังแล้ว (ไม่มีจุดในผัง) หรือสถานะที่ถูกนำออกแล้ว ต้องไม่ถูกนับ/คัดซ้ำ
  // — ใช้ชุดสถานะเดียวกับ middleware + หน้าอื่นของระบบ (ตรงกับ UserStatus ในฐานข้อมูล)
  return !m.inTree || ['SUSPENDED', 'RESIGNED', 'INACTIVE'].includes(m.status);
}

/** คัดออกจริง: ตั้งสถานะไม่ผ่านเงื่อนไข + ปิดจุดในผัง + ประวัติ + Log + แจ้งเตือน */
export async function applyCut(m: NetMember, rules: Net1x5Rules, actorId: string | null, reason: string, notifyImpl?: (o: any) => Promise<any>) {
  const r = await applyCutsBatch(
    [{ userId: m.userId, code: m.code, name: m.name, level: m.level, rankLevel: m.rankLevel, slot: m.slot, pass: false, pendingReview: false, reasons: [reason], checks: [], verifiedAmount: m.verifiedAmount, readyForPromotion: false, promotionGap: '' }],
    [m], rules, actorId, notifyImpl,
  );
  if (r.cut.length) return { ok: true, error: null };
  return { ok: false, error: r.warnings[0] || 'cut failed' };
}

/**
 * คัดออกเป็นชุด (เร็ว + ปลอดภัย): ใช้ createMany/updateMany/deleteMany ครั้งเดียวต่อกลุ่ม
 *  - ตั้งสถานะ "ไม่ผ่านเงื่อนไข" (SUSPENDED) + ประวัติสถานะ
 *  - ปิดจุดในผัง (isActive=false) เพื่อคงสายงานเดิมไว้ตรวจสอบย้อนหลัง
 *  - ปลด "ช่อง" ในผัง (ลบ TreePlacement) เพื่อให้เลื่อนผู้มีคุณสมบัติเข้าแทนได้จริง — ห้ามทิ้งตำแหน่งว่าง
 *  - บันทึก PlacementHistory(action=removed) + AuditLog + แจ้งเตือนสมาชิก/ผู้แนะนำ
 */
export async function applyCutsBatch(
  items: CheckResult[], members: NetMember[], rules: Net1x5Rules, actorId: string | null,
  notifyImpl?: (o: any) => Promise<any>,
): Promise<{ cut: any[]; warnings: string[] }> {
  const warnings: string[] = [];
  const pairs = items
    .map((c) => ({ c, m: members.find((x) => x.userId === c.userId) }))
    .filter((p) => !!p.m) as { c: CheckResult; m: NetMember }[];
  if (!pairs.length) return { cut: [], warnings };

  const ids = pairs.map((p) => p.m.userId);
  const nodeIds = pairs.map((p) => p.m.nodeId).filter(Boolean) as string[];
  const now = new Date();
  const cut: any[] = [];

  try {
    // 1) ตั้งสถานะ "ไม่ผ่านเงื่อนไข"
    await (prisma.user as any).updateMany({ where: { id: { in: ids } }, data: { status: 'SUSPENDED' } });
    // 2) ประวัติสถานะสมาชิก
    await (prisma.membershipStatusHistory as any).createMany({
      data: pairs.map((p) => ({
        userId: p.m.userId, fromStatus: p.m.status, toStatus: 'SUSPENDED',
        reason: `ไม่ผ่านเงื่อนไขรอบ ${rules.period} — ${p.c.reasons.join(' · ')}`,
        changedBy: actorId, period: rules.period,
      })),
    }).catch(() => null);
    // 3) ปิดจุดในผัง (คงสายงานเดิมไว้ให้ตรวจย้อนหลัง)
    if (nodeIds.length) {
      await (prisma.treeNode as any).updateMany({ where: { id: { in: nodeIds } }, data: { isActive: false } });
    }
    // 4) ปลดช่องในผังให้เลื่อนคนเข้าแทนได้จริง (ประวัติการเอาออกอยู่ใน PlacementHistory)
    await (prisma.treePlacement as any).deleteMany({ where: { childId: { in: ids } } });
    // 5) ประวัติการนำออกจากตำแหน่ง
    await (prisma.placementHistory as any).createMany({
      data: pairs.map((p) => ({
        userId: p.m.userId, parentId: p.m.nodeId, slot: p.m.slot, level: p.m.level, action: 'removed',
        reason: `คัดออกอัตโนมัติ: ไม่ผ่านเงื่อนไข (${p.c.reasons.join(' · ')})`, changedBy: actorId,
      })),
    }).catch(() => null);
    // 6) ยกเลิกเซสชันที่ค้างอยู่
    await (prisma.userSession as any).deleteMany({ where: { userId: { in: ids } } }).catch(() => null);
    // 7) Audit Log
    await (prisma.auditLog as any).createMany({
      data: pairs.map((p) => ({
        userId: actorId, action: 'net1x5.cut_member', entity: 'User', entityId: p.m.userId,
        oldValue: { status: p.m.status, nodeActive: p.m.isActive, slot: p.m.slot } as any,
        newValue: { status: 'SUSPENDED', nodeActive: false, conditionStatus: 'ไม่ผ่านเงื่อนไข', slotFreed: p.m.slot } as any,
        reason: `ไม่ผ่านเงื่อนไขรอบ ${rules.period}: ${p.c.reasons.join(' · ')}`,
      })),
    }).catch((e: any) => warnings.push(`บันทึก Audit Log ไม่ครบ: ${e?.message}`));

    for (const p of pairs) cut.push({ ...p.c, ok: true, reason: p.c.reasons.join(' · '), cutAt: now.toISOString() });

    // 8) แจ้งเตือนอัตโนมัติ (ตัวเอง + ผู้แนะนำ) — จำกัดจำนวนต่อรอบเพื่อไม่ให้รอบทำงานยาวเกินเวลา
    const NOTIFY_MAX = 4;
    const notifyPairs = pairs.slice(0, NOTIFY_MAX);
    const list: { userId: string; type: string; title: string; body?: string; referenceId?: string }[] = [];
    for (const p of notifyPairs) {
      list.push({
        userId: p.m.userId, type: 'member_suspended', title: 'ไม่ผ่านเงื่อนไข — พ้นตำแหน่ง',
        body: `รอบ ${rules.period}: ${p.c.reasons.join(' · ')} · ติดต่อผู้แนะนำเพื่อขอทบทวน`, referenceId: '/criteria',
      });
      if (p.m.sponsorId) {
        list.push({
          userId: p.m.sponsorId, type: 'downline_cut', title: `สายงานไม่ผ่านเงื่อนไข: ${p.m.name}`,
          body: `คัดออกอัตโนมัติรอบ ${rules.period} · ระบบจะเลื่อนผู้มีคุณสมบัติเข้าแทนตำแหน่งที่ว่าง`, referenceId: '/members',
        });
      }
    }
    await notify(rules, notifyImpl, list);
    if (pairs.length > NOTIFY_MAX) {
      warnings.push(`แจ้งเตือนรายคนครบเพดาน ${NOTIFY_MAX} คน — ที่เหลือสรุปในรายงานผู้ดูแลระบบ (กันรอบทำงานยาวเกินเวลา)`);
    }
    // 9) แจ้งผู้ดูแลระบบเป็นชุดเมื่อมีการคัดออก
    if (rules.notify) {
      try {
        const { notifyAdmins } = await import('@/lib/notify');
        await notifyAdmins({
          type: 'net1x5_cut_batch', title: `คัดออกอัตโนมัติ ${cut.length} คน (รอบ ${rules.period})`,
          body: cut.slice(0, 10).map((c) => `${c.code} (${(c.reasons || []).join(', ')})`).join(' · '),
          referenceId: '/network/1x5-autopilot',
        });
      } catch { /* ไม่ให้แจ้งเตือนล้มทำให้วงจรล้ม */ }
    }
  } catch (e: any) {
    warnings.push(`คัดออกเป็นชุดไม่สำเร็จ: ${e?.message || 'unknown'}`);
  }
  return { cut, warnings };
}

/** เลื่อนผู้มีคุณสมบัติขึ้นแทนตำแหน่งว่าง + ปรับสายงานที่เกี่ยวข้อง */
export async function applyPromotion(c: Candidate, v: VacancyInfo, rules: Net1x5Rules, actorId: string | null, notifyImpl?: (o: any) => Promise<any>) {
  try {
    // กฎเหล็ก: ห้ามเลื่อนคนที่ยังไม่ผ่านเงื่อนไข
    if (!c.ready && rules.priority !== 'performance') {
      return { ok: false, error: 'ผู้รับการเลื่อนยังไม่ผ่านเงื่อนไขครบ — ระบบปฏิเสธการเลื่อน' };
    }
    const oldRank = c.rankLevel;
    const newRank = Math.min(4, oldRank + 1);
    await (prisma.user as any).update({ where: { id: c.userId }, data: { rankLevel: newRank, rankUpdatedAt: new Date() } });
    await (prisma.rankHistory as any).create({
      data: {
        userId: c.userId, fromRank: oldRank, toRank: newRank, result: 'promoted',
        reason: `เลื่อนแทนตำแหน่งว่างอัตโนมัติรอบ ${rules.period} (${v.reason}) · โดย ${actorId || 'system'}`,
        snapshot: { vacancy: v, priority: c.priorityReason, verifiedAmount: c.verifiedAmount } as any,
      },
    }).catch(() => null);
    await (prisma.placementHistory as any).create({
      data: {
        userId: c.userId, parentId: v.nodeId, slot: v.slot, level: v.level, action: 'moved',
        reason: `เลื่อนขึ้นแทนตำแหน่งที่ว่าง: ${v.parentName} ช่อง ${v.slot}`, changedBy: actorId,
      },
    }).catch(() => null);
    // อัปเดตสายงานจริง (ผู้แนะนำตำแหน่งในผัง)
    const parentUser = v.parentUserId ? await (prisma.user as any).findUnique({ where: { id: v.parentUserId }, select: { id: true, managerId: true } }).catch(() => null) : null;
    await (prisma.user as any).update({
      where: { id: c.userId },
      data: { placementParentId: v.parentUserId || null, managerId: v.parentUserId || parentUser?.managerId || null },
    }).catch(() => null);
    // เติมช่องในผังถ้ามี TreeNode ของผู้รับ
    if (v.parentUserId && v.slot > 0) {
      const childNode = await ensureNodeFor(c.userId);
      const parentNode = await (prisma.treeNode as any).findUnique({ where: { userId: v.parentUserId } }).catch(() => null);
      if (childNode && parentNode) {
        await (prisma.treePlacement as any).upsert({
          where: { childId: c.userId },
          create: { parentId: parentNode.id, childId: c.userId, slot: v.slot, level: v.level, reason: 'promotion_auto' },
          update: { parentId: parentNode.id, slot: v.slot, level: v.level, reason: 'promotion_auto' },
        }).catch(() => null);
      }
    }
    await audit({
      actorId, action: 'net1x5.promote_member', entity: 'User', entityId: c.userId,
      oldValue: { rankLevel: oldRank }, newValue: { rankLevel: newRank, vacancy: v },
      reason: `เลื่อนขึ้นแทนอัตโนมัติ — ผ่านเงื่อนไขรอบ ${rules.period} (${c.priorityReason})`,
    });
    await notify(rules, notifyImpl, [
      { userId: c.userId, type: 'rank_promoted', title: `เลื่อนตำแหน่งอัตโนมัติ → ${positionName(POSITIONS[newRank]?.code || 'agent')}`, body: `ผ่านเงื่อนไขรอบ ${rules.period} และรับตำแหน่งว่างที่ ${v.parentName} ช่อง ${v.slot}`, referenceId: '/career' },
      ...(v.parentUserId ? [{ userId: v.parentUserId, type: 'downline_promoted', title: `สมาชิกในสายงานเลื่อนตำแหน่ง: ${c.name}`, body: `เติมตำแหน่งว่างในสายงานของคุณอัตโนมัติ`, referenceId: '/tree' }] : []),
    ]);
    return { ok: true, error: null, fromRank: oldRank, toRank: newRank, vacancy: v };
  } catch (e: any) {
    return { ok: false, error: e?.message || 'promotion failed' };
  }
}

async function ensureNodeFor(userId: string, level = 0) {
  const existing = await (prisma.treeNode as any).findUnique({ where: { userId } }).catch(() => null);
  if (existing) return existing;
  return (prisma.treeNode as any).create({ data: { userId, level, directCount: 0 } }).catch(() => null);
}

async function placeMemberIntoSlot(userId: string, target: { parentNodeId: string; slot: number; level: number }, actorId: string | null) {
  try {
    const existing = await (prisma.treePlacement as any).findUnique({ where: { childId: userId } }).catch(() => null);
    if (existing) return { ok: false, error: 'already_placed' };
    await (prisma.treePlacement as any).create({
      data: { parentId: target.parentNodeId, childId: userId, slot: target.slot, level: target.level, reason: 'net1x5_autofill' },
    });
    await (prisma.placementHistory as any).create({
      data: { userId, parentId: target.parentNodeId, slot: target.slot, level: target.level, action: 'placed', reason: 'เติมช่องว่าง 1 แตก 5 อัตโนมัติ', changedBy: actorId },
    }).catch(() => null);
    await ensureNodeFor(userId, target.level);
    await (prisma.placementQueue as any).deleteMany({ where: { userId } }).catch(() => null);
    return { ok: true, error: null };
  } catch (e: any) {
    return { ok: false, error: e?.message };
  }
}

async function queueVacancy(v: VacancyInfo, rules: Net1x5Rules, actorId: string | null) {
  try {
    await audit({
      actorId, action: 'net1x5.vacancy_queued', entity: 'TreeNode', entityId: v.nodeId,
      newValue: { vacancy: v },
      reason: 'ไม่มีผู้มีคุณสมบัติครบในรอบนี้ — ระบบจะตรวจซ้ำทุกรอบอัตโนมัติ (ห้ามทิ้งตำแหน่งว่างถาวร)',
    });
    // แจ้งผู้บริหารระบบให้รับทราบตำแหน่งว่างที่ยังเติมไม่ได้ (ไม่ค้างเงียบ)
    if (rules.notify) {
      try {
        const { notifyAdmins } = await import('@/lib/notify');
        await notifyAdmins({
          type: 'net1x5_vacancy',
          title: `ตำแหน่งว่างยังไม่มีผู้มีคุณสมบัติครบ: ${v.parentName} ช่อง ${v.slot}`,
          body: `รอบ ${rules.period} — ${v.reason} (ระบบจะตรวจซ้ำอัตโนมัติทุกรอบ)`,
          referenceId: '/network/1x5-autopilot',
        });
      } catch { /* ไม่ให้แจ้งเตือนล้มทำให้วงจรล้ม */ }
    }
    return { ok: true, rulesPeriod: rules.period };
  } catch {
    return { ok: false };
  }
}

async function notify(rules: Net1x5Rules, impl: ((o: any) => Promise<any>) | undefined, list: { userId: string; type: string; title: string; body?: string; referenceId?: string }[]) {
  if (!rules.notify || !list.length) return;
  try {
    const send = impl || (async (o: any) => {
      const { emitNotification } = await import('@/lib/notify');
      return emitNotification(o);
    });
    // ส่งแบบจำกัดคู่ขนาน (6 พร้อมกัน) — ลดเวลารวมเมื่อมีผู้รับหลายคน โดยยังกันโหลดฐานข้อมูลหนักเกิน
    for (let i = 0; i < list.length; i += 6) {
      await Promise.all(list.slice(i, i + 6).map((n) => send(n).catch(() => null)));
    }
  } catch (e) {
    console.error('[net1x5.notify]', (e as Error).message);
  }
}

/** บันทึกการรันลง PlacementRun + Entry + EventOutbox (ให้ n8n ต่อได้) */
async function recordRun(opts: {
  rules: Net1x5Rules; steps: StepResult[]; cut: any[]; promotions: any[]; placements: any[];
  actorId: string | null; idempotencyKey?: string;
}): Promise<string | null> {
  try {
    const jobId = `net1x5-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const run: any = await (prisma.placementRun as any).create({
      data: {
        jobId, idempotencyKey: opts.idempotencyKey || null, status: 'completed',
        startedBy: opts.actorId, finishedAt: new Date(),
        totalQueued: opts.cut.length + opts.promotions.length + opts.placements.length,
        totalSuccess: opts.promotions.length + opts.placements.length,
        totalSkipped: 0, totalFailed: opts.cut.length,
      },
    });
    const entries: any[] = [];
    for (const c of opts.cut) {
      entries.push({ runId: run.id, userId: c.userId, status: 'success', reason: `คัดออก: ${(c.reasons || []).join(' · ')}` });
    }
    for (const p of opts.promotions) {
      entries.push({ runId: run.id, userId: p.userId, parentId: p.vacancy?.nodeId || null, slot: p.vacancy?.slot || null, status: 'success', reason: `เลื่อนตำแหน่งอัตโนมัติ ${p.fromRank}→${p.toRank}` });
    }
    for (const p of opts.placements) {
      entries.push({ runId: run.id, userId: p.userId, parentId: p.parentNodeId, slot: p.slot, status: 'success', reason: 'เติมช่องว่าง 1 แตก 5' });
    }
    if (entries.length) await (prisma.placementRunEntry as any).createMany({ data: entries });
    await audit({
      actorId: opts.actorId, action: 'net1x5.run', entity: 'PlacementRun', entityId: run.id,
      newValue: { period: opts.rules.period, cut: opts.cut.length, promoted: opts.promotions.length, placed: opts.placements.length, steps: opts.steps.map((s) => ({ key: s.key, count: s.count })) },
      reason: `รันวงจรอัตโนมัติรอบ ${opts.rules.period}`,
    });
    await (prisma.eventOutbox as any).create({
      data: {
        eventId: `net1x5:run:${run.id}`,
        eventType: 'net1x5.run_completed',
        payload: { runId: run.id, period: opts.rules.period, cut: opts.cut.length, promoted: opts.promotions.length } as any,
        recipientId: opts.actorId || null, channel: 'in_app', status: 'sent', sentAt: new Date(),
      },
    }).catch(() => null);
    return run.id;
  } catch (e) {
    console.error('[net1x5.recordRun]', (e as Error).message);
    return null;
  }
}

/** สถานะรวมสำหรับ Dashboard */
export async function getState(): Promise<EngineState> {
  const rules = await loadRules();
  const now = new Date();
  const { members } = await collectNetwork();
  const checks = members.map((m) => evaluateMember(m, rules, now));
  const failedAll = checks.filter((c) => !c.pass);
  // แสดงเฉพาะคนที่ยังอยู่ในผังและยังต้องดำเนินการ — คนที่ออกจากผังแล้ว (INACTIVE/SUSPENDED/RESIGNED)
  // ไม่นับเป็น "รอคัดออก" (ให้ตรงกับสถานะจริงในฐานข้อมูล ไม่ชวนคัดซ้ำ)
  const failed = failedAll.filter((c) => !isAlreadyCut(members, c.userId));
  const alreadyOut = failedAll.length - failed.length;
  const vacancies = await findVacancies(members, []);
  const candidates = rankCandidates(checks, members, vacancies[0] || null, rules.priority);

  // โครงสร้างนับจาก "จุดในผังจริง" (TreeNode) เท่านั้น — ให้ตรงกับตาราง TreeNode/TreePlacement
  // บัญชีที่ยังไม่มีจุดในผัง (เช่นบัญชีผู้ดูแลระบบ) ไม่ถูกนับเป็นสมาชิกในโครงสร้าง
  const inTreeMembers = members.filter((m) => m.inTree);
  const perLevel = new Map<number, number>();
  inTreeMembers.forEach((m) => { const lv = m.nodeLevel ?? m.level; perLevel.set(lv, (perLevel.get(lv) || 0) + 1); });
  const perLevelArr = [...perLevel.entries()].map(([level, count]) => ({ level, count, capacity: Math.pow(5, Math.min(level, 12)) })).sort((a, b) => a.level - b.level);

  const runs: any[] = await (prisma.placementRun as any).findMany({ orderBy: { startedAt: 'desc' }, take: 10 }).catch(() => []);
  const logs: any[] = await (prisma.auditLog as any).findMany({
    where: { action: { startsWith: 'net1x5.' } }, orderBy: { createdAt: 'desc' }, take: 40,
    select: { id: true, action: true, entity: true, entityId: true, reason: true, oldValue: true, newValue: true, createdAt: true },
  }).catch(() => []);

  const lastNet5Run = runs.find((r) => String(r.jobId || '').startsWith('net1x5-')) || null;

  return {
    rules, period: rules.period, now: now.toISOString(), deadline: computeDeadline(rules, now),
    summary: {
      total: inTreeMembers.length,
      active: inTreeMembers.filter((m) => m.isActive && m.status === 'ACTIVE').length,
      nonActive: inTreeMembers.filter((m) => !m.isActive).length,
      passed: checks.length - failedAll.length,
      failed: failedAll.length,
      failedActionable: failed.length,
      alreadyOut,
      outOfTree: members.length - inTreeMembers.length,
      pendingReview: checks.filter((c) => c.pendingReview).length,
      vacancies: vacancies.length,
      emptySlots: vacancies.filter((v) => v.kind === 'slot').length,
      candidates: candidates.length,
      readyCandidates: candidates.filter((c) => c.ready).length,
      promotedLast: Number(lastNet5Run?.totalSuccess || 0),
      cutLast: Number(lastNet5Run?.totalFailed || 0),
    },
    members, checks, failed, vacancies, candidates,
    tree: { roots: inTreeMembers.filter((m) => m.parentUserId == null).map((m) => ({ userId: m.userId, code: m.code, name: m.name })), perLevel: perLevelArr, branchLimit: 5 },
    lastRun: lastNet5Run ? {
      id: lastNet5Run.id, jobId: lastNet5Run.jobId, status: lastNet5Run.status, startedAt: lastNet5Run.startedAt,
      finishedAt: lastNet5Run.finishedAt, cut: lastNet5Run.totalFailed, promoted: lastNet5Run.totalSuccess,
    } : null,
    logs,
    testAccounts: members.filter((m) => m.isTest).length,
  };
}

// ── สิทธิ์การเข้าถึง (ใช้ร่วมทุก API ของระบบ 1 แตก 5) ─────────────────────
//  - n8n / งานระบบอัตโนมัติ: Authorization: Bearer <CRON_SECRET>
//  - ผู้ใช้ในเว็บ: คุกกี้ token (JWT) เหมือนหน้าอื่นของระบบ
//  - งานที่ "เขียนข้อมูลจริง" (คัดออก/เลื่อนตำแหน่ง/แก้กติกา/สร้างชุดทดสอบ) ต้องเป็นผู้ดูแลระบบเท่านั้น
export type NetAccess =
  | { ok: true; via: 'bearer' | 'session'; userId: string | null; isAdmin: boolean; email?: string }
  | { ok: false; status: number; error: string };

export async function requireNetAccess(req: Request): Promise<NetAccess> {
  const secret = process.env.CRON_SECRET || '';
  const bearer = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (secret && bearer && bearer === secret) return { ok: true, via: 'bearer', userId: null, isAdmin: true };

  const { cookies } = await import('next/headers');
  const cookieToken = (await cookies()).get('token')?.value || '';
  const token = cookieToken || bearer;
  if (!token) return { ok: false, status: 401, error: 'members_only' };

  const { verifyToken } = await import('@/lib/auth');
  const payload: any = verifyToken(token);
  if (!payload?.sub) return { ok: false, status: 401, error: 'session_invalid' };
  if (['SUSPENDED', 'RESIGNED', 'INACTIVE'].includes(String(payload.status || ''))) {
    return { ok: false, status: 403, error: 'account_suspended' };
  }

  let isAdmin = false;
  try {
    const { isSystemAdmin } = await import('@/lib/admin');
    const adm: any = await isSystemAdmin(String(payload.sub));
    isAdmin = !!adm?.ok;
  } catch { isAdmin = false; }
  if (!isAdmin) {
    try {
      const { isAdminEmail } = await import('@/lib/access-rules');
      isAdmin = isAdminEmail(payload.email);
    } catch { /* คงค่าเดิม */ }
  }
  return { ok: true, via: 'session', userId: String(payload.sub), isAdmin, email: payload.email };
}

export function netDenied(a: Extract<NetAccess, { ok: false }>) {
  return NextResponse.json(
    {
      ok: false,
      error: a.error,
      message:
        a.status === 403 ? 'บัญชีนี้ไม่มีสิทธิ์ (ต้องเป็นผู้ดูแลระบบ)' : 'ระบบบริหารเครือข่าย 1 แตก 5 เปิดให้เฉพาะสมาชิกที่เข้าสู่ระบบแล้ว',
    },
    { status: a.status },
  );
}

export function netAdminRequired() {
  return NextResponse.json(
    { ok: false, error: 'admin_required', message: 'การแก้กติกา/คัดออก/เลื่อนตำแหน่งอัตโนมัติ สงวนสิทธิ์ผู้ดูแลระบบเท่านั้น' },
    { status: 403 },
  );
}

/** ปิดชื่อสมาชิกสำหรับผู้ใช้ที่ไม่ใช่ผู้ดูแล (เหลือรหัสไว้ให้ตรวจสอบได้) */
export function maskIfNotAdmin<T extends { name: string; code: string }>(rows: T[], isAdmin: boolean): T[] {
  if (isAdmin) return rows;
  return rows.map((r) => ({ ...r, name: maskName(r.name) }));
}

export function maskName(name: string) {
  const s = String(name || '').trim();
  if (!s || s.includes('@')) return 'สมาชิก (ปกปิดชื่อ)';
  const parts = s.split(/\s+/);
  const head = parts[0]?.slice(0, 1) || '';
  return `${head}${parts[0]?.slice(1, 2) ? '•' : ''}${parts.slice(1).map((p) => `${p.slice(0, 1)}.`).join(' ')}`.trim() || 'สมาชิก (ปกปิดชื่อ)';
}
