// ─────────────────────────────────────────────────────────────────────────────
// lineOaAi.ts — "ตอบกลับอัตโนมัติด้วย AI" ของ LINE OA
//   ใช้ Hermes + โมเดล DeepSeek (ผ่าน src/lib/ai/hermesProvider.ts ตัวเดิมของระบบ)
//   หลักการ:
//    1) ตอบด้วย reply token เสมอ → ไม่กินโควตาข้อความ push
//    2) ใช้ฐานความรู้ (aiKnowledge) + ประวัติแชทล่าสุดเป็นบริบท → ตอบตรงเรื่องของทีม
//    3) จำกัดจำนวนคำตอบต่อผู้ใช้/ชั่วโมง + timeout 25 วิ + ถ้าพลาดส่งข้อความสำรอง (ไม่ปล่อยเงียบ)
//    4) คำที่แปลว่า "ขอคุยกับคน" → ส่งข้อความ handoff และติดป้ายผู้ติดตามให้ทีมงานเห็น
// ─────────────────────────────────────────────────────────────────────────────
import { HermesProvider, getHermesProvider, providerChain } from '@/lib/ai/hermesProvider';
import { prisma } from '@/lib/prisma';
import { normalizeMessages } from '@/lib/lineOa';

export const DEFAULT_AI_PROMPT = `คุณคือ "ผู้ช่วยทีมงาน" ของ AI INSURANCE NETWORK TREE (ทีมตัวแทนประกันชีวิต)
ตอบเป็นภาษาไทยสุภาพ กระชับ ตรงประเด็น ไม่เกิน 3 ย่อหน้าสั้น
กฎเหล็ก: ห้ามใช้สัญลักษณ์ markdown (* # _) เพราะ LINE แสดงเป็นตัวอักษรดิบ — ใช้บรรทัดใหม่และตัวเลข 1) 2) แทน
ใช้ข้อมูลจาก "ฐานความรู้ของทีม" ด้านล่างเป็นหลัก ถ้าฐานความรู้ไม่มีคำตอบ ให้บอกตรง ๆ ว่าไม่พบข้อมูลในระบบ แล้วเสนอให้ทีมงานติดต่อกลับ (แนะนำให้ลูกค้าพิมพ์ "คุยกับเจ้าหน้าที่")
ห้ามเดา/แต่งข้อมูลรายได้ ค่าคอม ยอดเงิน กำหนดเวลา หรือเงื่อนไขกรมธรรม์
ห้ามเปิดเผยข้อมูลส่วนบุคคลของสมาชิกคนอื่น และห้ามขอเลขบัตรประชาชน/เลขบัญชี/รหัสผ่านในแชท
ไม่ต้องเกริ่นนำซ้ำคำถาม ไม่ต้องสรุปซ้ำท้ายข้อความ
ถ้าลูกค้าถามเรื่องอื่นนอกธุรกิจ (เช่น เขียนโปรแกรม ทำการบ้าน) ให้ตอบสั้น ๆ ว่าไม่ถนัดเรื่องนี้ และพากลับมาที่เรื่องประกัน/ระบบของทีม`;

export const DEFAULT_AI_KNOWLEDGE = `ระบบของทีม: "AI INSURANCE NETWORK TREE" (เว็บ https://ai-insurance-network-tree.vercel.app)
- สมาชิกเข้าสู่ระบบที่หน้าเว็บ แล้วใช้เมนู "รายได้" ดูค่าคอม/รายได้ของตัวเอง (อัปเดตทุกครั้งที่ปิดรอบ)
- รายได้โอนเข้าบัญชีที่สมาชิกแจ้งไว้ ภายใน 7 วันทำการหลังปิดรอบ
- ใบเสร็จ/สลิปเบี้ยอ้างอิงใบเสร็จ บมจ.ไทยประกันชีวิต: ต้องมีเลขใบเสร็จ เลขอ้างอิงรายการ ยอดเงิน วันที่ และรหัสตัวแทน — ถ้าไม่ครบ ระบบจะไม่รับเข้ากระบวนการ
- สมัครเป็นตัวแทน: กรอกใบสมัครออนไลน์ที่ https://ai-insurance-network-tree.vercel.app/recruit (ใช้เวลา ~5 นาที) → ทีมงานนัดสัมภาษณ์ → อบรม + สอบใบอนุญาต (มีพี่เลี้ยงดูแล)
- ลิงก์แนะนำ/QR สำหรับชวนเพื่อน: https://ai-insurance-network-tree.vercel.app/expand-team
- รายงานปัญหา/ร้องเรียน: หน้า "ช่วยเหลือ/ร้องเรียน" ในระบบ (ทีมงานตอบกลับภายใน 24 ชม.)
- ระบบมีโครงข่ายตำแหน่งแบบ 1 แตก 5 (1 คนแนะนำได้ 5 คน) ดูแผนตำแหน่งได้ในเมนูเครือข่าย
- ถ้าลูกค้าต้องการคุยกับเจ้าหน้าที่ตัวจริง ให้บอกว่า "พิมพ์ว่า คุยกับเจ้าหน้าที่" ระบบจะส่งเรื่องให้ทีมงาน`;

export const DEFAULT_HANDOFF_MESSAGES = [
  { type: 'text', text: 'ได้ครับ 🙏 ส่งเรื่องให้ทีมงานตัวจริงแล้ว ทีมงานจะตอบกลับในแชทนี้ภายใน 24 ชม. (ปกติเร็วกว่านั้น)\n\nถ้าต้องการให้เร็วขึ้น บอกชื่อ + เบอร์โทรไว้ได้เลยครับ' },
];

export const DEFAULT_AI_FAIL_MESSAGES = [
  { type: 'text', text: 'ขออภัยครับ ตอนนี้ผู้ช่วยอัตโนมัติตอบไม่ได้ชั่วคราว 🙏\nทีมงานได้รับข้อความของคุณแล้ว และจะรีบตอบกลับครับ' },
];

export interface AiSettingsShape {
  enabled: boolean;
  mode: 'fallback' | 'all';
  systemPrompt: string;
  knowledge: string;
  provider?: string;
  model?: string;
  maxChars: number;
  temperature: number;
  perHour: number;
  handoffKeywords: string[];
  handoffMessages: any[];
  failMessages: any[];
}

export function aiSettings(cfg: any): AiSettingsShape {
  return {
    enabled: !!cfg?.aiEnabled,
    mode: cfg?.aiMode === 'all' ? 'all' : 'fallback',
    systemPrompt: String(cfg?.aiSystemPrompt || '').trim() || DEFAULT_AI_PROMPT,
    knowledge: String(cfg?.aiKnowledge ?? DEFAULT_AI_KNOWLEDGE),
    provider: cfg?.aiProvider || undefined,
    model: cfg?.aiModel || undefined,
    maxChars: Math.max(120, Math.min(3000, Number(cfg?.aiMaxChars) || 900)),
    temperature: Math.max(0, Math.min(1, Number(cfg?.aiTemperature ?? 0.3))),
    perHour: Math.max(1, Math.min(200, Number(cfg?.aiPerHour) || 20)),
    handoffKeywords: Array.isArray(cfg?.aiHandoffKeywords) && cfg.aiHandoffKeywords.length ? cfg.aiHandoffKeywords : ['คุยกับเจ้าหน้าที่', 'เจ้าหน้าที่', 'คนจริง'],
    handoffMessages: normalizeMessages(cfg?.aiHandoffMessage).length ? normalizeMessages(cfg.aiHandoffMessage) : (DEFAULT_HANDOFF_MESSAGES as any),
    failMessages: normalizeMessages(cfg?.aiFailMessage).length ? normalizeMessages(cfg.aiFailMessage) : (DEFAULT_AI_FAIL_MESSAGES as any),
  };
}

/** ข้อมูลค่าย/รุ่นที่กำลังใช้จริง (ไม่คืนค่า key) */
export function aiProviderInfo(override?: { provider?: string; model?: string }) {
  try {
    const p = new HermesProvider(override);
    const i = p.getInfo();
    return { provider: i.provider, model: i.model, configured: i.configured };
  } catch (e: any) {
    return { provider: 'unknown', model: '', configured: false, error: e?.message };
  }
}

export function isHandoff(text: string, keywords: string[]): boolean {
  const t = (text || '').trim().toLowerCase();
  if (!t) return false;
  return (keywords || []).some((k) => k && t.includes(String(k).toLowerCase()));
}

/** ประวัติแชทล่าสุดของผู้ใช้ (สร้างบริบทให้ AI จำบทสนทนาได้) */
export async function loadHistory(lineUserId: string, limit = 8): Promise<{ role: 'user' | 'assistant'; content: string }[]> {
  try {
    const rows: any[] = await (prisma as any).lineMessageLog.findMany({
      where: { lineUserId, type: 'text', text: { not: null } },
      orderBy: { createdAt: 'desc' }, take: limit * 2,
    });
    const out: { role: 'user' | 'assistant'; content: string }[] = [];
    for (const r of rows.reverse()) {
      const content = String(r.text || '').slice(0, 600);
      if (!content) continue;
      if (r.direction === 'IN' && /^\[postback\]/.test(content)) continue;
      out.push({ role: r.direction === 'IN' ? 'user' : 'assistant', content });
    }
    return out.slice(-limit);
  } catch { return []; }
}

/** นับคำตอบ AI ของผู้ใช้รายนี้ใน 1 ชั่วโมงล่าสุด (กันการใช้งานผิดปกติ) */
export async function aiRepliesThisHour(lineUserId: string): Promise<number> {
  try {
    return await (prisma as any).lineMessageLog.count({
      where: { lineUserId, direction: 'OUT', matchKind: 'ai', createdAt: { gte: new Date(Date.now() - 3600 * 1000) } },
    });
  } catch { return 0; }
}

/** ── ข้อมูลสดจากฐานข้อมูลของระบบ (เฉพาะภาพรวมทีม ไม่มีข้อมูลส่วนบุคคล) ──
 *  ใช้เดิมทุกครั้งที่ AI ตอบ → คำตอบอ้างตัวเลขจริงได้ ไม่ใช่ข้อมูลนิ่งในฐานความรู้
 */
export async function buildLiveFacts(scope: 'public' | 'admin' = 'public'): Promise<string> {
  const lines: string[] = [];
  try {
    const [members, activeMembers, followers, ticketsOpen, periods] = await Promise.all([
      (prisma as any).user.count().catch(() => 0),
      (prisma as any).user.count({ where: { status: 'ACTIVE' } }).catch(() => 0),
      (prisma as any).lineFollower.count({ where: { followed: true } }).catch(() => 0),
      (prisma as any).supportTicket.count({ where: { status: { in: ['NEW', 'IN_PROGRESS'] } } }).catch(() => 0),
      (prisma as any).calendarPeriod?.findMany?.({ orderBy: { createdAt: 'desc' }, take: 1 }).catch?.(() => []) ?? [],
    ]);
    lines.push(`- สมาชิกในระบบทั้งหมด ${members} คน (ใช้งานอยู่ ${activeMembers} คน)`);
    lines.push(`- ผู้ติดตาม LINE OA ปัจจุบัน ${followers} คน`);
    const p: any = Array.isArray(periods) ? periods[0] : null;
    if (p) lines.push(`- รอบค่าคอมล่าสุดในระบบ: ${p.name || p.code || '—'} (สถานะ ${p.status || '—'})`);
    lines.push(`- เวลาทำการทีมงาน: จันทร์–เสาร์ 09:00–18:00 น. (ตอบแชทนอกเวลาในวันทำการถัดไป)`);

    if (scope === 'admin') {
      const [pending, incomeSum, ranks] = await Promise.all([
        (prisma as any).prospect?.count?.({ where: { status: 'PENDING' } }).catch?.(() => 0) ?? 0,
        (prisma as any).incomeTransaction?.aggregate?.({ _sum: { amount: true }, where: { createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } } }).catch?.(() => null) ?? null,
        (prisma as any).membership?.groupBy?.({ by: ['positionId'], _count: { _all: true } }).catch?.(() => []) ?? [],
      ]);
      lines.push(`- ผู้มุ่งหวังรออนุมัติ ${pending} ราย · ใบร้องเรียน/สอบถามที่ยังไม่ปิด ${ticketsOpen} เรื่อง`);
      if (incomeSum?._sum?.amount != null) lines.push(`- ค่าคอมรวมที่บันทึกไว้เดือนนี้ ${Number(incomeSum._sum.amount).toLocaleString('th-TH')} บาท (ภาพรวมทั้งทีม)`);
      if (Array.isArray(ranks) && ranks.length) lines.push(`- จำนวนสมาชิกแยกตามตำแหน่ง: ${ranks.map((r: any) => `${r.positionId || 'ไม่ระบุ'}=${r._count?._all ?? 0}`).join(', ')}`);
    }
  } catch { /* ข้อมูลสดเป็นส่วนเสริม — ถ้าดึงไม่ได้ก็ตอบจากฐานความรู้เดิม */ }
  if (!lines.length) return '';
  const ts = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'short' });
  return `── ข้อมูลสดจากระบบ (ณ ${ts}) ──\n${lines.join('\n')}\n(ข้อมูลนี้เป็นภาพรวมทั้งทีม ห้ามเปิดเผยข้อมูลรายบุคคล)`;
}

export function buildSystemPrompt(s: AiSettingsShape, facts?: string): string {
  return [
    s.systemPrompt,
    '',
    '── ฐานความรู้ของทีม (ใช้ตอบเท่านั้น ห้ามคิดขึ้นเอง) ──',
    s.knowledge || '(ไม่มี)',
    ...(facts ? ['', facts] : []),
    '',
    '── รูปแบบคำตอบ ──',
    `ความยาวไม่เกิน ${s.maxChars} ตัวอักษร · ภาษาไทย · ไม่ใช้ markdown · ไม่ต้องมีหัวข้อ "คำตอบ:"`,
  ].join('\n');
}

export interface AiReplyResult {
  ok: boolean;
  text: string;
  messages: any[];
  provider: string;
  model: string;
  ms: number;
  error?: string;
  limited?: boolean;
  source: 'ai' | 'handoff' | 'limit' | 'error' | 'off';
}

/** สร้างคำตอบด้วย AI (เรียกโมเดลจริง) — ใช้ทั้ง webhook จริงและหน้าทดสอบ */
export async function generateAiReply(o: {
  lineUserId?: string; text: string; cfg: any; draft?: Partial<AiSettingsShape>; skipLimit?: boolean;
  scope?: 'public' | 'admin'; facts?: string;
}): Promise<AiReplyResult> {
  const base = aiSettings(o.cfg);
  const s: AiSettingsShape = { ...base, ...(o.draft || {}) };
  const empty = { text: '', messages: [], provider: '', model: '', ms: 0 };

  if (!s.enabled && !o.draft) return { ...empty, ok: false, error: 'AI ยังไม่เปิดใช้งาน', source: 'off' };
  if (!o.text || !o.text.trim()) return { ...empty, ok: false, error: 'ไม่มีข้อความ', source: 'error' };

  if (o.lineUserId && !o.skipLimit && s.perHour > 0) {
    const used = await aiRepliesThisHour(o.lineUserId);
    if (used >= s.perHour) {
      return { ...empty, ok: false, limited: true, error: `ผู้ใช้รายนี้ได้รับคำตอบ AI ครบ ${s.perHour} ครั้งใน 1 ชั่วโมง`, source: 'limit', messages: s.failMessages };
    }
  }

  const t0 = Date.now();
  const primary = new HermesProvider({ provider: s.provider, model: s.model });
  const info = primary.getInfo();
  if (!info.configured) {
    return { ...empty, ok: false, provider: info.provider, model: info.model, error: 'ยังไม่มี API key ของค่าย AI (ตรวจ AI_PROVIDER / DEEPSEEK_API_KEY)', source: 'error', messages: s.failMessages };
  }

  // ลำดับค่ายที่จะลอง: ค่ายที่ตั้งไว้ (เช่น deepseek) ก่อน → แล้วไล่ค่ายอื่นที่มี key
  const candidates: { provider: string; model: string }[] = [{ provider: info.provider, model: info.model }];
  try {
    for (const c of providerChain()) {
      if (candidates.some((x) => x.provider === c.provider && x.model === c.model)) continue;
      candidates.push(c);
      if (candidates.length >= 3) break;
    }
  } catch { /* ใช้ค่ายหลักตัวเดียวก็พอ */ }

  const errors: string[] = [];
  try {
    const history = o.lineUserId ? await loadHistory(o.lineUserId, 8) : [];
    const facts = o.facts ?? await buildLiveFacts(o.scope === 'admin' ? 'admin' : 'public');
    const base: any[] = [
      { role: 'system', content: buildSystemPrompt(s, facts) },
      ...history,
      { role: 'user', content: o.text.slice(0, 2000) },
    ];
    for (const c of candidates) {
      try {
        const p = new HermesProvider({ provider: c.provider, model: c.model });
        if (!p.isConfigured()) continue;
        let out = await p.chat(base, { temperature: s.temperature, maxTokens: 800, timeoutMs: 25000 });
        out = String(out || '')
          .replace(/\*\*(.+?)\*\*/g, '$1')     // ตัด markdown หนา
          .replace(/^[#>\s]*[-*]\s+/gm, '• ')  // bullet ธรรมดา
          .trim();
        if (!out) { errors.push(`${c.provider}: ไม่ตอบกลับ`); continue; }
        const text = out.slice(0, s.maxChars);
        return { ok: true, text, messages: [{ type: 'text', text }], provider: c.provider, model: c.model, ms: Date.now() - t0, source: 'ai' };
      } catch (e: any) {
        errors.push(`${c.provider}: ${String(e?.message || e).slice(0, 120)}`);
      }
    }
    return {
      ...empty, ok: false, provider: info.provider, model: info.model, ms: Date.now() - t0,
      error: `AI ตอบไม่สำเร็จ (${errors.join(' | ') || 'ไม่มีค่ายที่พร้อมใช้'})`, source: 'error', messages: s.failMessages,
    };
  } catch (e: any) {
    return {
      ...empty, ok: false, provider: info.provider, model: info.model, ms: Date.now() - t0,
      error: `AI ตอบไม่สำเร็จ: ${String(e?.message || e).slice(0, 200)}`, source: 'error', messages: s.failMessages,
    };
  }
}

/** สถิติการใช้งาน AI (ให้หน้าเว็บแสดง) */
export async function aiUsageStats() {
  const since = new Date(Date.now() - 24 * 3600 * 1000);
  try {
    const [day24, hour1, users] = await Promise.all([
      (prisma as any).lineMessageLog.count({ where: { direction: 'OUT', matchKind: 'ai', createdAt: { gte: since } } }),
      (prisma as any).lineMessageLog.count({ where: { direction: 'OUT', matchKind: 'ai', createdAt: { gte: new Date(Date.now() - 3600 * 1000) } } }),
      (prisma as any).lineMessageLog.findMany({
        where: { direction: 'OUT', matchKind: 'ai', createdAt: { gte: since } },
        select: { lineUserId: true, createdAt: true },
      }),
    ]);
    return { last24h: day24, lastHour: hour1, users24h: new Set((users as any[]).map((u) => u.lineUserId)).size };
  } catch {
    return { last24h: 0, lastHour: 0, users24h: 0 };
  }
}
