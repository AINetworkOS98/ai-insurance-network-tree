// ─────────────────────────────────────────────────────────────────────────────
// ตัวช่วยกลางสำหรับเส้นทาง Lead Nurturing (dashboard/leads · agent-log · agent-tasks
// · lead/score · recommend · followup/due · followup/result)
//
// เหตุผลที่แยกไฟล์: ทุกเส้นทางต้องใช้กติกาเดียวกัน (ระดับคะแนน, การแปลงน้ำหนักความสนใจ,
// การหาว่า "prospectId" ที่ n8n ส่งมาคือ Prospect.id / Prospect.prospectId (P-XXXX) /
// Visitor.visitorId) และต้องไม่แตะไฟล์เดิมของโปรเจกต์
//
// ใช้ได้เฉพาะ Node runtime (import ... ไม่มี Edge API)
// ─────────────────────────────────────────────────────────────────────────────

export const LEVELS = ['LOW', 'WARM', 'INTERESTED', 'HIGH_INTENT'] as const;
export type EngagementLevelName = (typeof LEVELS)[number];

// ระดับคะแนนตามแผนหมวด 4: 0-19 LOW · 20-39 WARM · 40-69 INTERESTED · 70+ HIGH_INTENT
export function levelOf(score: number): EngagementLevelName {
  if (score >= 70) return 'HIGH_INTENT';
  if (score >= 40) return 'INTERESTED';
  if (score >= 20) return 'WARM';
  return 'LOW';
}

export function isLevel(v: unknown): v is EngagementLevelName {
  return typeof v === 'string' && (LEVELS as readonly string[]).includes(v);
}

// ระดับแบบที่หน้า /dashboard/leads ใช้ (HIGH แทน HIGH_INTENT)
export function levelKey(level: string): 'HIGH' | 'INTERESTED' | 'WARM' | 'LOW' {
  const u = String(level || '').toUpperCase();
  if (u === 'HIGH_INTENT' || u === 'HIGH') return 'HIGH';
  if (u === 'INTERESTED') return 'INTERESTED';
  if (u === 'WARM') return 'WARM';
  return 'LOW';
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && UUID_RE.test(v);
}

export function str(v: unknown, max = 200): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

export function num(v: unknown, min: number, max: number): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(max, Math.max(min, n));
}

// น้ำหนักความสนใจ: AI (WF03) ส่ง 0-100, สคีมาเก็บ 0-1 ⇒ แปลงให้ตรงเสมอ
export function normalizeWeight(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return 0;
  const w = n > 1 ? n / 100 : n;
  return Math.min(1, Math.max(0, w));
}

// หน้าต่างเวลาแบบสั้น: '30m' | '1h' | '24h' | '2d' | ตัวเลข (นาที)
export function parseWindowMs(v: unknown, defMs = 30 * 60 * 1000): number {
  const s = str(v, 16);
  if (!s) return defMs;
  const m = /^(\d+)\s*([mhd])?$/i.exec(s);
  if (!m) return defMs;
  const n = Number(m[1]);
  const unit = (m[2] || 'm').toLowerCase();
  const ms = unit === 'd' ? 86400000 : unit === 'h' ? 3600000 : 60000;
  const out = n * ms;
  return out > 0 ? Math.min(out, 30 * 86400000) : defMs;
}

// เพดานความถี่ (frequency cap) — แผน WF04/WF05: ≤2/วัน ≤5/สัปดาห์
export const FREQ_CAP = {
  perDay: Math.max(1, Number(process.env.NURTURE_CAP_PER_DAY || 2) || 2),
  perWeek: Math.max(1, Number(process.env.NURTURE_CAP_PER_WEEK || 5) || 5),
};

export function dayKeyBkk(d: Date = new Date()): string {
  // วันแบบ UTC+7 (Asia/Bangkok) ไม่พึ่ง Intl ของ runtime
  return new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export function startOfDayBkk(now: Date = new Date()): Date {
  const shifted = new Date(now.getTime() + 7 * 3600 * 1000);
  shifted.setUTCHours(0, 0, 0, 0);
  return new Date(shifted.getTime() - 7 * 3600 * 1000);
}

export function fmtProspectName(p: any): string {
  const full = `${p?.firstName || ''} ${p?.lastName || ''}`.trim();
  return full || p?.nickname || 'ไม่ระบุชื่อ';
}

// ── หา Prospect.id จากค่าที่ n8n/เว็บส่งมาได้ทุกรูปแบบ ────────────────────────
//   • Prospect.id (uuid)          → ใช้ตรง ๆ
//   • Prospect.prospectId (P-XXXX) → แปลงเป็น id
//   • Visitor.visitorId           → ดึง prospectId ที่ผูกไว้ (WF03 จับกลุ่มด้วย visitorId ได้)
export async function resolveProspectId(db: any, raw: unknown): Promise<string | null> {
  const key = str(raw, 64);
  if (!key) return null;
  if (isUuid(key)) {
    const byId = await db.prospect.findUnique({ where: { id: key } }).catch(() => null);
    if (byId) return byId.id;
  }
  const byCode = await db.prospect.findUnique({ where: { prospectId: key } }).catch(() => null);
  if (byCode) return byCode.id;
  const visitor = await db.visitor.findUnique({ where: { visitorId: key } }).catch(() => null);
  if (visitor?.prospectId) return visitor.prospectId;
  return null;
}

// ── ความยินยอมล่าสุดของ lead (ProspectConsent เป็น append-only) ──────────────
export function latestConsent(consents: any[], type: string): boolean {
  const rows = (consents || []).filter((c) => String(c?.type || '').toUpperCase() === type);
  if (!rows.length) return false;
  rows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return rows[0]?.granted === true;
}
