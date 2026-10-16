// ─────────────────────────────────────────────────────────────────────────────
// lineOa.ts — แกนกลางของ "LINE OA Studio"
//   ข้อความต้อนรับ · ตอบกลับอัตโนมัติ · ริชเมนู · ผู้ติดตาม · บันทึกข้อความ
//
// หลักการ:
//  1) ใช้ "ข้อความตอบกลับ" (reply token) เป็นหลัก — ไม่กินโควตาข้อความ push (แพ็กฟรี 300/เดือน)
//     push ใช้เฉพาะข้อความที่ริเริ่มเอง (บรอดแคสต์/ทดสอบ) และจะรายงานการใช้งานให้เห็นในหน้าเว็บ
//  2) เก็บเฉพาะข้อมูลที่ LINE ส่งมา (userId / ชื่อที่แสดง / รูปโปรไฟล์) — ไม่เก็บข้อมูลอ่อนไหว
//  3) ข้อความทุกครั้งที่เข้า-ออกถูกบันทึกใน LineMessageLog เพื่อทำสถิติและตรวจย้อนหลัง
// ─────────────────────────────────────────────────────────────────────────────
import crypto from 'crypto';
import { prisma } from '@/lib/prisma';

export const LINE_API = 'https://api.line.me';
export const LINE_DATA_API = 'https://api-data.line.me';

export type OaMessage =
  | { type: 'text'; text: string }
  | { type: 'image'; originalContentUrl: string; previewImageUrl: string }
  | { type: 'sticker'; packageId: string; stickerId: string };

export type MatchKind = 'welcome' | 'greet' | 'menu' | 'offline' | 'rule' | 'fallback' | 'broadcast' | 'test';

export interface LineRuleLike {
  id: string;
  name: string;
  enabled: boolean;
  priority: number;
  matchType: string;
  keywords: string[];
  messages: any;
  richMenuId: string | null;
  tag: string | null;
}

export interface LineConfigLike {
  welcomeEnabled: boolean;
  welcomeMessages: any;
  greetEnabled: boolean;
  greetMessages: any;
  greetEveryHours: number;
  autoReplyEnabled: boolean;
  fallbackEnabled: boolean;
  fallbackMessages: any;
  menuKeywords: string[];
  menuMessages: any;
  offlineEnabled: boolean;
  offlineStart: string;
  offlineEnd: string;
  offlineMessages: any;
}

export const DEFAULT_WELCOME: OaMessage[] = [
  { type: 'text', text: 'สวัสดีครับ 🙏 ยินดีต้อนรับสู่ AI INSURANCE NETWORK TREE' },
  { type: 'text', text: 'ผมคือผู้ช่วยอัตโนมัติของทีม — พิมพ์คำถามได้เลย หรือแตะเมนูด้านล่างเพื่อเลือกเรื่องที่ต้องการ\n\n• สอบถามรายได้/ค่าคอม\n• สมัครเป็นตัวแทน\n• แจ้งปัญหาการใช้ระบบ' },
];

export const DEFAULT_MENU: OaMessage[] = [
  { type: 'text', text: 'เมนูหลักของทีม 📋\n\n1️⃣ สอบถามรายได้ / ค่าคอม → พิมพ์ "รายได้"\n2️⃣ สมัครเป็นตัวแทน → พิมพ์ "สมัคร"\n3️⃣ แจ้งปัญหาการใช้ระบบ → พิมพ์ "ปัญหา"\n4️⃣ ดูการ์ด LINE OA + ลิงก์แนะนำ → พิมพ์ "ลิงก์"' },
];

export const DEFAULT_OFFLINE: OaMessage[] = [
  { type: 'text', text: 'ขณะนี้อยู่นอกเวลาทำการ 🌙\nทีมงานจะตอบกลับภายใน 09:00–18:00 น.\n\nทิ้งข้อความไว้ได้เลยครับ ระบบบันทึกไว้ให้แล้ว' },
];

/* ── env / ความพร้อมใช้งาน ─────────────────────────────────────────────── */
export function lineToken(): string {
  return process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
}
export function lineSecret(): string {
  return process.env.LINE_CHANNEL_SECRET || '';
}
export function lineEnvStatus() {
  const missing: string[] = [];
  if (!lineToken()) missing.push('LINE_CHANNEL_ACCESS_TOKEN');
  if (!lineSecret()) missing.push('LINE_CHANNEL_SECRET');
  return {
    ready: missing.length === 0,
    missing,
    tokenConfigured: !!lineToken(),
    secretConfigured: !!lineSecret(),
  };
}
export function appBaseUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || process.env.APP_BASE_URL || 'https://ai-insurance-network-tree.vercel.app').replace(/\/+$/, '');
}

/* ── เรียก Messaging API ───────────────────────────────────────────────── */
export async function lineFetch(
  path: string,
  init: RequestInit & { raw?: boolean } = {},
): Promise<{ status: number; ok: boolean; data: any; text: string }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${lineToken()}`,
    ...((init.headers as Record<string, string>) || {}),
  };
  if (init.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const res = await fetch(path.startsWith('http') ? path : LINE_API + path, { ...init, headers, cache: 'no-store' });
  const text = await res.text().catch(() => '');
  let data: any = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  return { status: res.status, ok: res.ok, data, text };
}

/* ── ตรวจลายเซ็นจาก LINE (X-Line-Signature) ────────────────────────────── */
export function verifyLineSignature(rawBody: string, signature: string | null): boolean {
  const secret = lineSecret();
  if (!secret || !signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64');
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(a, b); } catch { return false; }
}

/* ── แปลงข้อความ ──────────────────────────────────────────────────────── */
export function normalizeMessages(input: any): OaMessage[] {
  const arr = Array.isArray(input) ? input : [];
  const out: OaMessage[] = [];
  for (const raw of arr) {
    if (typeof raw === 'string') {
      const text = raw.trim();
      if (text) out.push({ type: 'text', text });
      continue;
    }
    if (!raw || typeof raw !== 'object') continue;
    if (raw.type === 'text' && String(raw.text || '').trim()) out.push({ type: 'text', text: String(raw.text).slice(0, 4900) });
    else if (raw.type === 'image' && raw.originalContentUrl && raw.previewImageUrl) out.push({ type: 'image', originalContentUrl: String(raw.originalContentUrl), previewImageUrl: String(raw.previewImageUrl) });
    else if (raw.type === 'sticker' && raw.packageId && raw.stickerId) out.push({ type: 'sticker', packageId: String(raw.packageId), stickerId: String(raw.stickerId) });
  }
  return out.slice(0, 5); // LINE จำกัด 5 ข้อความต่อการส่งหนึ่งครั้ง
}
export function toLineMessages(list: OaMessage[]): any[] {
  return normalizeMessages(list as any).map((m) => ({ ...m }));
}
export function previewText(list: any): string {
  const n = normalizeMessages(list);
  return n.map((m) => (m.type === 'text' ? m.text : m.type === 'image' ? '[รูปภาพ]' : '[สติกเกอร์]')).join(' | ').slice(0, 400);
}

/* ── ตั้งค่า (singleton) ───────────────────────────────────────────────── */
export async function loadConfig(): Promise<LineConfigLike & { id: string; defaultRichMenuId: string | null }> {
  const existing: any = await (prisma as any).lineOaConfig.findUnique({ where: { id: 'default' } }).catch(() => null);
  if (existing) return existing;
  const created: any = await (prisma as any).lineOaConfig.create({
    data: {
      id: 'default',
      welcomeMessages: DEFAULT_WELCOME as any,
      menuMessages: DEFAULT_MENU as any,
      offlineMessages: DEFAULT_OFFLINE as any,
      fallbackMessages: DEFAULT_MENU as any,
    },
  }).catch(() => null);
  return created || ({
    id: 'default', welcomeEnabled: true, welcomeMessages: DEFAULT_WELCOME,
    greetEnabled: false, greetMessages: [], greetEveryHours: 24,
    autoReplyEnabled: true, fallbackEnabled: false, fallbackMessages: DEFAULT_MENU,
    menuKeywords: ['เมนู', 'menu'], menuMessages: DEFAULT_MENU,
    offlineEnabled: false, offlineStart: '18:00', offlineEnd: '08:30', offlineMessages: DEFAULT_OFFLINE,
    defaultRichMenuId: null,
  } as any);
}

export async function saveConfig(patch: Record<string, any>, updatedBy?: string | null) {
  await loadConfig(); // ให้แน่ใจว่ามีแถวอยู่
  const data: any = { updatedAt: new Date() };
  const textKeys = ['offlineStart', 'offlineEnd'];
  const numKeys = ['greetEveryHours'];
  const boolKeys = ['welcomeEnabled', 'greetEnabled', 'autoReplyEnabled', 'fallbackEnabled', 'offlineEnabled'];
  const jsonKeys = ['welcomeMessages', 'greetMessages', 'fallbackMessages', 'menuMessages', 'offlineMessages'];
  const strArrKeys = ['menuKeywords'];
  for (const k of boolKeys) if (typeof patch[k] === 'boolean') data[k] = patch[k];
  for (const k of textKeys) if (typeof patch[k] === 'string') data[k] = patch[k].slice(0, 5);
  for (const k of numKeys) if (patch[k] !== undefined) data[k] = Math.max(1, Math.min(720, Number(patch[k]) || 24));
  for (const k of jsonKeys) if (patch[k] !== undefined) data[k] = normalizeMessages(patch[k]) as any;
  for (const k of strArrKeys) if (Array.isArray(patch[k])) data[k] = patch[k].map((s: any) => String(s).trim()).filter(Boolean).slice(0, 20);
  // ── AI ตอบกลับอัตโนมัติ (Hermes + DeepSeek) ──
  if (typeof patch.aiEnabled === 'boolean') data.aiEnabled = patch.aiEnabled;
  if (patch.aiMode === 'all' || patch.aiMode === 'fallback') data.aiMode = patch.aiMode;
  if (typeof patch.aiSystemPrompt === 'string') data.aiSystemPrompt = patch.aiSystemPrompt.slice(0, 8000);
  if (typeof patch.aiKnowledge === 'string') data.aiKnowledge = patch.aiKnowledge.slice(0, 20000);
  if (typeof patch.aiProvider === 'string') data.aiProvider = patch.aiProvider.trim().slice(0, 40) || null;
  if (typeof patch.aiModel === 'string') data.aiModel = patch.aiModel.trim().slice(0, 80) || null;
  if (patch.aiMaxChars !== undefined) data.aiMaxChars = Math.max(120, Math.min(3000, Number(patch.aiMaxChars) || 900));
  if (patch.aiTemperature !== undefined) data.aiTemperature = Math.max(0, Math.min(1, Number(patch.aiTemperature) || 0));
  if (patch.aiPerHour !== undefined) data.aiPerHour = Math.max(1, Math.min(200, Number(patch.aiPerHour) || 20));
  if (Array.isArray(patch.aiHandoffKeywords)) data.aiHandoffKeywords = patch.aiHandoffKeywords.map((s: any) => String(s).trim()).filter(Boolean).slice(0, 20);
  if (patch.aiHandoffMessage !== undefined) data.aiHandoffMessage = normalizeMessages(patch.aiHandoffMessage) as any;
  if (patch.aiFailMessage !== undefined) data.aiFailMessage = normalizeMessages(patch.aiFailMessage) as any;
  if (typeof patch.defaultRichMenuId === 'string' || patch.defaultRichMenuId === null) data.defaultRichMenuId = patch.defaultRichMenuId || null;
  if (updatedBy) data.updatedBy = updatedBy;
  return (prisma as any).lineOaConfig.update({ where: { id: 'default' }, data });
}

/* ── กฎตอบกลับอัตโนมัติ ────────────────────────────────────────────────── */
function hhmm(v: string): number {
  const m = String(v || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}
export function isOfflineNow(cfg: LineConfigLike, now = new Date()): boolean {
  if (!cfg.offlineEnabled) return false;
  const bkk = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Bangkok' }));
  const cur = bkk.getHours() * 60 + bkk.getMinutes();
  const s = hhmm(cfg.offlineStart);
  const e = hhmm(cfg.offlineEnd);
  if (s < 0 || e < 0) return false;
  if (s === e) return false;
  return s < e ? cur >= s && cur < e : cur >= s || cur < e; // คร่อมเที่ยงคืนได้
}

export function ruleMatches(text: string, rule: LineRuleLike): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  const lower = t.toLowerCase();
  for (const raw of rule.keywords || []) {
    const k = String(raw || '').trim();
    if (!k) continue;
    const kl = k.toLowerCase();
    switch (rule.matchType) {
      case 'EXACT': if (lower === kl) return true; break;
      case 'STARTS_WITH': if (lower.startsWith(kl)) return true; break;
      case 'REGEX': try { if (new RegExp(k, 'i').test(t)) return true; } catch { /* regex เสีย → ข้าม */ } break;
      default: if (lower.includes(kl)) return true; // CONTAINS
    }
  }
  return false;
}

export interface ReplyDecision {
  kind: MatchKind | 'none';
  rule?: LineRuleLike;
  messages: OaMessage[];
  note?: string;
}

/** เลือกข้อความที่จะตอบ — ใช้ร่วมกันทั้ง webhook จริงและกล่องทดลองบนหน้าเว็บ */
export function decideReply(
  text: string,
  rules: LineRuleLike[],
  cfg: LineConfigLike,
  opts: { now?: Date; firstEver?: boolean; lastSeenAt?: Date | null } = {},
): ReplyDecision {
  const now = opts.now || new Date();
  const t = (text || '').trim();

  // 1) นอกเวลาทำการ (ถ้าเปิดใช้) — แจ้งก่อน แล้วยังตอบด้วยกฎได้ถ้ามี
  const offline = isOfflineNow(cfg, now);
  if (offline) {
    const msgs = normalizeMessages(cfg.offlineMessages);
    if (msgs.length) return { kind: 'offline', messages: msgs, note: 'นอกเวลาทำการ' };
  }

  if (!t) return { kind: 'none', messages: [] };

  // 2) คำลัด "เมนู"
  if (cfg.autoReplyEnabled) {
    const lower = t.toLowerCase();
    if ((cfg.menuKeywords || []).some((k) => k && lower.includes(String(k).toLowerCase()))) {
      const msgs = normalizeMessages(cfg.menuMessages);
      if (msgs.length) return { kind: 'menu', messages: msgs };
    }
  }

  // 3) กฎตอบกลับอัตโนมัติ (priority น้อยก่อน)
  if (cfg.autoReplyEnabled) {
    const ordered = [...rules].filter((r) => r.enabled).sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
    for (const r of ordered) {
      if (ruleMatches(t, r)) {
        const msgs = normalizeMessages(r.messages);
        if (msgs.length) return { kind: 'rule', rule: r, messages: msgs };
      }
    }
  }

  // 4) ข้อความสำรอง (เมื่อไม่มีกฎไหนเข้าเงื่อนไข)
  if (cfg.fallbackEnabled) {
    const msgs = normalizeMessages(cfg.fallbackMessages);
    if (msgs.length) return { kind: 'fallback', messages: msgs, note: 'ไม่เข้าเงื่อนไขใด' };
  }
  return { kind: 'none', messages: [] };
}

/* ── ส่งข้อความ ───────────────────────────────────────────────────────── */
export async function replyToLine(replyToken: string, messages: OaMessage[]) {
  const payload = toLineMessages(messages);
  if (!payload.length) return { ok: false, error: 'ไม่มีข้อความ' };
  const r = await lineFetch('/v2/bot/message/reply', { method: 'POST', body: JSON.stringify({ replyToken, messages: payload }) });
  return { ok: r.ok, error: r.ok ? undefined : `LINE ${r.status}: ${r.text.slice(0, 200)}` };
}
export async function pushToLine(to: string, messages: OaMessage[]) {
  const payload = toLineMessages(messages);
  if (!payload.length) return { ok: false, error: 'ไม่มีข้อความ' };
  const r = await lineFetch('/v2/bot/message/push', { method: 'POST', body: JSON.stringify({ to, messages: payload }) });
  return { ok: r.ok, error: r.ok ? undefined : `LINE ${r.status}: ${r.text.slice(0, 200)}` };
}
export async function getLineProfile(userId: string) {
  const r = await lineFetch(`/v2/bot/profile/${encodeURIComponent(userId)}`);
  return r.ok ? (r.data as { userId: string; displayName?: string; pictureUrl?: string; statusMessage?: string }) : null;
}
export async function getQuota() {
  const [q, c] = await Promise.all([lineFetch('/v2/bot/message/quota'), lineFetch('/v2/bot/message/quota/consumption')]);
  return {
    type: q.data?.type || null,
    limit: q.data?.type === 'limited' ? Number(q.data?.value || 0) : null,
    used: Number(c.data?.totalUsage ?? 0),
  };
}

/* ── บันทึก + ผู้ติดตาม ────────────────────────────────────────────────── */
export async function logLine(entry: {
  direction: 'IN' | 'OUT';
  lineUserId?: string | null;
  type?: string;
  text?: string | null;
  matchKind?: string | null;
  ruleId?: string | null;
  ruleName?: string | null;
  ok?: boolean;
  error?: string | null;
}) {
  try {
    await (prisma as any).lineMessageLog.create({
      data: {
        direction: entry.direction,
        lineUserId: entry.lineUserId || null,
        type: entry.type || 'text',
        text: (entry.text || '').slice(0, 4000) || null,
        matchKind: entry.matchKind || null,
        ruleId: entry.ruleId || null,
        ruleName: entry.ruleName || null,
        ok: entry.ok !== false,
        error: entry.error ? String(entry.error).slice(0, 400) : null,
      },
    });
  } catch { /* การบันทึกห้ามทำให้การตอบลูกค้าล้มเหลว */ }
}

export async function upsertFollower(userId: string, patch: Record<string, any> = {}) {
  if (!userId) return null;
  try {
    return await (prisma as any).lineFollower.upsert({
      where: { lineUserId: userId },
      create: { lineUserId: userId, ...patch },
      update: { ...patch },
    });
  } catch { return null; }
}

export async function touchFollowerMessage(userId: string, profile?: { displayName?: string; pictureUrl?: string } | null) {
  const patch: any = {
    followed: true,
    lastMessageAt: new Date(),
    ...(profile?.displayName ? { displayName: profile.displayName } : {}),
    ...(profile?.pictureUrl ? { pictureUrl: profile.pictureUrl } : {}),
  };
  try {
    await (prisma as any).lineFollower.upsert({
      where: { lineUserId: userId },
      create: { lineUserId: userId, source: 'message', ...patch },
      update: patch,
    });
    await (prisma as any).lineFollower.update({ where: { lineUserId: userId }, data: { messageCount: { increment: 1 } } });
  } catch { /* ไม่สำคัญพอให้ล้ม */ }
}

/* ── ริชเมนู ──────────────────────────────────────────────────────────── */
export const RICHMENU_SIZES: Record<string, { width: number; height: number; label: string }> = {
  '2500x1686': { width: 2500, height: 1686, label: 'ใหญ่ 2500×1686 (เต็มจอ · 3-6 ช่อง)' },
  '2500x843': { width: 2500, height: 843, label: 'ใหญ่ 2500×843 (ครึ่งจอ · 2-4 ช่อง)' },
  '1200x810': { width: 1200, height: 810, label: 'กลาง 1200×810' },
  '1200x405': { width: 1200, height: 405, label: 'กลาง 1200×405' },
  '800x540': { width: 800, height: 540, label: 'เล็ก 800×540' },
  '800x270': { width: 800, height: 270, label: 'เล็ก 800×270' },
};

export async function richMenuList() {
  const r = await lineFetch('/v2/bot/richmenu/list');
  return r.ok ? (r.data?.richmenus || []) : [];
}
export async function getDefaultRichMenuId() {
  const r = await lineFetch('/v2/bot/user/all/richmenu');
  return r.ok ? (r.data?.richMenuId || null) : null;
}
export async function createRichMenu(body: any) {
  const r = await lineFetch('/v2/bot/richmenu', { method: 'POST', body: JSON.stringify(body) });
  return { ok: r.ok, id: r.data?.richMenuId as string | undefined, error: r.ok ? undefined : `LINE ${r.status}: ${r.text.slice(0, 300)}` };
}
export async function uploadRichMenuImage(richMenuId: string, bytes: ArrayBuffer | Buffer, contentType: string) {
  const res = await fetch(`${LINE_DATA_API}/v2/bot/richmenu/${richMenuId}/content`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${lineToken()}`, 'Content-Type': contentType },
    body: bytes as any,
  });
  const text = await res.text().catch(() => '');
  return { ok: res.ok, error: res.ok ? undefined : `LINE ${res.status}: ${text.slice(0, 300)}` };
}
export async function setDefaultRichMenu(richMenuId: string) {
  const r = await lineFetch(`/v2/bot/user/all/richmenu/${richMenuId}`, { method: 'POST' });
  return { ok: r.ok, error: r.ok ? undefined : `LINE ${r.status}: ${r.text.slice(0, 300)}` };
}
export async function clearDefaultRichMenu() {
  const r = await lineFetch('/v2/bot/user/all/richmenu', { method: 'DELETE' });
  return { ok: r.ok, error: r.ok ? undefined : `LINE ${r.status}: ${r.text.slice(0, 300)}` };
}
export async function deleteRichMenu(richMenuId: string) {
  const r = await lineFetch(`/v2/bot/richmenu/${richMenuId}`, { method: 'DELETE' });
  return { ok: r.ok, error: r.ok ? undefined : `LINE ${r.status}: ${r.text.slice(0, 300)}` };
}
export async function setUserRichMenu(userId: string, richMenuId: string | null) {
  const r = richMenuId
    ? await lineFetch(`/v2/bot/user/${userId}/richmenu/${richMenuId}`, { method: 'POST' })
    : await lineFetch(`/v2/bot/user/${userId}/richmenu`, { method: 'DELETE' });
  return { ok: r.ok, error: r.ok ? undefined : `LINE ${r.status}: ${r.text.slice(0, 200)}` };
}

/* ── Webhook ──────────────────────────────────────────────────────────── */
export function webhookUrl() {
  return `${appBaseUrl()}/api/line/webhook`;
}
export async function webhookInfo() {
  const r = await lineFetch('/v2/bot/channel/webhook/endpoint');
  return {
    endpoint: (r.data?.endpoint as string) || null,
    active: r.data?.active === true,
    status: r.status,
  };
}
export async function setWebhookEndpoint(endpoint: string) {
  const r = await lineFetch('/v2/bot/channel/webhook/endpoint', { method: 'PUT', body: JSON.stringify({ endpoint }) });
  return { ok: r.ok, error: r.ok ? undefined : `LINE ${r.status}: ${r.text.slice(0, 300)}` };
}
export async function testWebhookEndpoint(endpoint?: string) {
  const r = await lineFetch('/v2/bot/channel/webhook/test', { method: 'POST', body: JSON.stringify(endpoint ? { endpoint } : {}) });
  return { ok: r.ok && r.data?.success === true, detail: r.data || { status: r.status, text: r.text.slice(0, 300) } };
}
