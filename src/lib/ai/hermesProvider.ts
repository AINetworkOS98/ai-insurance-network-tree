// src/lib/ai/hermesProvider.ts — Hermes Agent Provider Adapter (DeepSeek-first)
// หลักการ:
//  - ใช้ DeepSeek เป็นผู้ให้บริการหลัก (deepseek-chat) — เร็ว ถูก เสถียร
//  - ถ้าไม่มี key ของ DeepSeek ค่อยไล่ต่อ gemini → openai → openrouter → opencode-free
//  - ค่าที่เป็น placeholder ([SENSITIVE], ***, ว่าง) ถือว่า "ไม่มี key" — กัน 401 หลอก
//  - ทุกคำสั่ง LLM มี timeout + retry (429/5xx) — ไม่ค้างทั้งคำขอ
//  - รองรับ streaming จริง (token ทยอยออกจากโมเดล) ไม่ต้องรอคำตอบครบ
import type { AIProvider } from './provider';

const HERMES_SYSTEM_PROMPT = `คุณคือระบบค้นหาด้วย AI อัจฉริยะ ของ AI INSURANCE NETWORK TREE
กฎ: ถามสั้นตอบสั้น ถามลึกตอบลึก — เข้าประเด็นทันที ไม่มีคำฟุ่มเฟือย ไม่สรุปซ้ำ — ไม่แน่ใจบอกตรงๆ — อ้างอิงผลจาก tools จริงเท่านั้น — ตอบไทย กระชับ — ห้ามเปิดเผยชื่อ provider/model/key
ตอบเป็นข้อความล้วน ไม่ต้องมีหัวข้อ "คำตอบ:" หรือลอกคำถามมาวางซ้ำ`;

/** โมเดลเริ่มต้นของแต่ละค่าย */
const DEFAULT_MODELS: Record<string, string> = {
  deepseek: 'deepseek-chat',
  gemini: 'gemini-3.5-flash-lite',
  openai: 'gpt-4o-mini',
  openrouter: 'deepseek/deepseek-chat-v3.1',
  'opencode-free': 'muse-spark-1.2-contributor-free',
};

const DEFAULT_BASE: Record<string, string> = {
  deepseek: 'https://api.deepseek.com',
  gemini: 'https://generativelanguage.googleapis.com/v1beta/openai',
  openai: 'https://api.openai.com/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  'opencode-free': 'https://opencode.ai/zen/v1',
};

const KEY_ENV: Record<string, string[]> = {
  deepseek: ['DEEPSEEK_API_KEY'],
  gemini: ['GEMINI_API_KEY'],
  openai: ['OPENAI_API_KEY'],
  openrouter: ['OPENROUTER_API_KEY'],
  'opencode-free': ['HERMES_API_KEY', 'AI_API_KEY'],
};

/** ค่าที่ vercel env pull / ตัวอย่าง เขียนไว้เป็นที่หมาย — ใช้ไม่ได้จริง */
function isPlaceholder(v: string | undefined): boolean {
  if (!v) return true;
  const t = v.trim();
  if (!t) return true;
  return /^\[(sensitive|hidden)\]$/i.test(t) || t === '***' || t === '...' || /^<.*>$/.test(t) || t.includes('«redacted');
}

function env(key: string): string | undefined {
  const v = process.env[key];
  return isPlaceholder(v) ? undefined : v;
}

function firstEnv(keys: string[]): string | undefined {
  for (const k of keys) { const v = env(k); if (v) return v; }
  return undefined;
}

export type ProviderConfig = { provider: string; model: string; apiKey: string; baseUrl: string; configured: boolean };

/** เลือก provider/model/key — override ใช้สำหรับทดสอบรายค่ายโดยไม่ต้องสลับ env */
export function resolveConfig(override?: { provider?: string; model?: string }): ProviderConfig {
  let provider = (override?.provider || env('AI_PROVIDER') || env('HERMES_PROVIDER') || '').trim().toLowerCase();

  // ไม่ได้ระบุ → เลือกอัตโนมัติ: DeepSeek ก่อนเสมอ แล้วค่อยไล่ค่ายอื่น
  if (!provider) {
    if (firstEnv(KEY_ENV.deepseek)) provider = 'deepseek';
    else if (firstEnv(KEY_ENV.gemini)) provider = 'gemini';
    else if (firstEnv(KEY_ENV.openrouter)) provider = 'openrouter';
    else if (firstEnv(KEY_ENV.openai)) provider = 'openai';
    else provider = 'opencode-free';
  }
  // เซิร์ฟเวอร์ไม่มีสิทธิ์ใช้ opencode-free (ต้องผ่าน Hermes Desktop) → ถอยไปค่ายที่มี key
  if (provider === 'opencode-free' && !firstEnv(KEY_ENV['opencode-free'])) {
    if (firstEnv(KEY_ENV.deepseek)) provider = 'deepseek';
    else if (firstEnv(KEY_ENV.gemini)) provider = 'gemini';
  }

  let apiKey = firstEnv(KEY_ENV[provider] ?? []) || '';
  // ค่ายที่ไม่มี key เลย → ถอยไปค่ายที่มี (DeepSeek ก่อน)
  if (!apiKey && provider !== 'opencode-free') {
    for (const alt of ['deepseek', 'gemini', 'openrouter', 'openai']) {
      const k = firstEnv(KEY_ENV[alt]);
      if (k) { provider = alt; apiKey = k; break; }
    }
  }

  const modelEnv = env('AI_MODEL') || env('HERMES_MODEL') || env('DEEPSEEK_MODEL') || env('GEMINI_MODEL');
  const model = override?.model || modelEnv || DEFAULT_MODELS[provider] || 'deepseek-chat';
  const baseUrl = (env('AI_BASE_URL') || env('HERMES_BASE_URL') || env('DEEPSEEK_BASE_URL') || DEFAULT_BASE[provider] || '').replace(/\/+$/, '');
  const configured = provider === 'opencode-free' ? true : !!apiKey;
  return { provider, model, apiKey, baseUrl, configured };
}

/** ค่ายที่มี key พร้อมใช้จริงในระบบตอนนี้ */
export function providerKeyAvailable(p: string): boolean {
  return !!firstEnv(KEY_ENV[p] ?? []);
}

/**
 * ลำดับค่ายที่จะลองตอบ — ค่ายที่ตั้งไว้ก่อน แล้วไล่ค่ายที่มี key อื่นต่อ
 * ใช้เพื่อสลับอัตโนมัติเมื่อค่ายหลักล่ม/โควตาหมด (ผู้ใช้ไม่เห็นความล้มเหลว)
 */
export function providerChain(): { provider: string; model: string }[] {
  const active = resolveConfig();
  const chain: { provider: string; model: string }[] = [{ provider: active.provider, model: active.model }];
  if (active.provider === 'opencode-free') return chain;
  const modelEnv = env('AI_MODEL') || env('HERMES_MODEL') || env('DEEPSEEK_MODEL');
  for (const p of ['deepseek', 'gemini', 'openrouter', 'openai']) {
    if (p === active.provider) continue;
    if (!providerKeyAvailable(p)) continue;
    chain.push({ provider: p, model: (p === active.provider ? active.model : modelEnv) || DEFAULT_MODELS[p] });
  }
  return chain;
}

type Msg = { role: 'system' | 'user' | 'assistant'; content: string };
type ChatOpts = { model?: string; temperature?: number; maxTokens?: number; timeoutMs?: number; signal?: AbortSignal };

const RETRY_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function timeoutSignal(ms: number, outer?: AbortSignal): AbortSignal {
  const t = AbortSignal.timeout(ms);
  if (!outer) return t;
  const ctl = new AbortController();
  const onAbort = () => ctl.abort(outer.reason);
  outer.addEventListener('abort', onAbort, { once: true });
  t.addEventListener('abort', () => ctl.abort(new Error('timeout')), { once: true });
  return ctl.signal;
}

/** ค่าของ thinking model — ต้องปิด reasoning ไม่ให้ token หมดไปกับการคิดแล้วคำตอบถูกตัด */
function applyReasoningGuard(payload: any, provider: string, model: string) {
  if (provider === 'gemini' && /gemini-3\.(6|7|8|9)|thinking|2\.5-pro|-pro\b/i.test(model)) payload.reasoning_effort = 'none';
  return payload;
}

function sanitize(text: string): string {
  return text.replace(/Hermes Agent/gi, 'ระบบค้นหาด้วย AI อัจฉริยะ').replace(/Hermes/gi, 'ระบบค้นหาด้วย AI อัจฉริยะ');
}

function genSessionId(): string {
  return 'hermes-' + Math.random().toString(36).slice(2, 10) + '-' + Date.now().toString(36);
}

function opencodeHeaders(): Record<string, string> {
  return {
    'Authorization': '',
    'HTTP-Referer': 'https://hermes-agent.nousresearch.com',
    'X-Title': 'Hermes Agent',
    'User-Agent': 'HermesAgent/0.20.5',
    'x-opencode-session': genSessionId(),
  };
}

export class HermesProvider implements AIProvider {
  private cfg: ProviderConfig;

  constructor(override?: { provider?: string; model?: string }) {
    this.cfg = resolveConfig(override);
  }

  isConfigured(): boolean {
    return this.cfg.configured;
  }

  getInfo(): { provider: string; model: string; configured: boolean; baseUrl: string } {
    return { provider: this.cfg.provider, model: this.cfg.model, configured: this.isConfigured(), baseUrl: this.cfg.baseUrl };
  }

  /** ตรวจว่าค่ายนี้ตอบจริง — ใช้ในหน้า health/self-test (ไม่คืนค่า key ออกไป) */
  async probe(opts?: { provider?: string; model?: string; timeoutMs?: number }): Promise<{ ok: boolean; provider: string; model: string; ms: number; error?: string; status?: number }> {
    const t0 = Date.now();
    try {
      const p = new HermesProvider({ provider: opts?.provider ?? this.cfg.provider, model: opts?.model ?? this.cfg.model });
      if (!p.isConfigured()) return { ok: false, provider: p.cfg.provider, model: p.cfg.model, ms: 0, error: 'no api key' };
      const out = await p.chat([{ role: 'user', content: 'ตอบด้วยตัวอักษรเดียว: ok' }], { maxTokens: 8, temperature: 0, timeoutMs: opts?.timeoutMs ?? 20000 });
      return { ok: !!out, provider: p.cfg.provider, model: p.cfg.model, ms: Date.now() - t0 };
    } catch (e: any) {
      const m = String(e?.message ?? e);
      const st = Number((m.match(/error (\d{3})/) || [])[1]) || undefined;
      return { ok: false, provider: opts?.provider ?? this.cfg.provider, model: opts?.model ?? this.cfg.model, ms: Date.now() - t0, error: m.slice(0, 200), status: st };
    }
  }

  // ---------- payload builders ----------
  private buildEndpoint(model: string) {
    const { provider, baseUrl } = this.cfg;
    if (provider === 'opencode-free') {
      const base = (baseUrl || DEFAULT_BASE['opencode-free']).replace(/\/+$/, '');
      const isResponses = /muse-spark|gpt-5|grok-4|codex/i.test(model);
      return { url: `${base}/${isResponses ? 'responses' : 'chat/completions'}`, isResponses, headers: opencodeHeaders() };
    }
    const base = (baseUrl || DEFAULT_BASE[provider] || DEFAULT_BASE.deepseek).replace(/\/+$/, '');
    return { url: `${base}/chat/completions`, isResponses: false, headers: { 'Authorization': `Bearer ${this.cfg.apiKey}` } };
  }

  private buildPayload(messages: Msg[], model: string, opts: ChatOpts | undefined, stream: boolean) {
    const { provider } = this.cfg;
    if (provider === 'opencode-free') {
      const input = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
      return { model, input, max_output_tokens: opts?.maxTokens ?? 1200, ...(stream ? { stream: true } : {}) };
    }
    const payload: any = applyReasoningGuard({
      model,
      messages: [{ role: 'system', content: HERMES_SYSTEM_PROMPT }, ...messages],
      temperature: opts?.temperature ?? 0.4,
      max_tokens: opts?.maxTokens ?? 1200,
      ...(stream ? { stream: true } : {}),
    }, provider, model);
    // DeepSeek: ปิด thinking ให้คำตอบเร็ว/ไม่ถูกตัด เมื่อใช้รุ่น chat
    if (provider === 'deepseek' && /reasoner/i.test(model) === false) delete payload.reasoning_effort;
    return payload;
  }

  // ---------- HTTP with retry ----------
  private async request(url: string, payload: any, headers: Record<string, string>, opts: ChatOpts | undefined, accept: string) {
    const timeoutMs = opts?.timeoutMs ?? 45000;
    let lastErr: any;
    for (let attempt = 0; attempt < 2; attempt++) {
      const t0 = Date.now();
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(accept ? { Accept: accept } : {}), ...headers },
          body: JSON.stringify(payload),
          signal: timeoutSignal(timeoutMs, opts?.signal),
        });
        if (!res.ok) {
          const txt = await res.text().catch(() => '');
          const err = new Error(`AI provider error ${res.status}: ${txt.slice(0, 300)}`);
          if (RETRY_STATUS.has(res.status) && attempt === 0 && Date.now() - t0 < timeoutMs) {
            lastErr = err;
            await sleep(res.status === 429 ? 900 : 350);
            continue;
          }
          throw err;
        }
        return res;
      } catch (e: any) {
        lastErr = e;
        const msg = String(e?.message ?? e);
        const retriable = /timeout|aborted|fetch failed|ECONN|socket|AI provider error (408|409|425|429|5\d\d)/i.test(msg);
        if (attempt === 0 && retriable && !opts?.signal?.aborted) { await sleep(350); continue; }
        throw e;
      }
    }
    throw lastErr ?? new Error('AI provider failed');
  }

  private extractText(j: any, isResponses: boolean): string {
    let content = '';
    if (isResponses) {
      content = j.output_text || '';
      if (!content && Array.isArray(j.output)) {
        for (const o of j.output) {
          if (Array.isArray(o.content)) {
            for (const c of o.content) {
              if ((c.type === 'output_text' || c.type === 'text') && c.text) content += c.text;
            }
          }
        }
      }
    }
    if (!content) content = j.choices?.[0]?.message?.content || j.choices?.[0]?.text || '';
    return content;
  }

  async chat(messages: Msg[], opts?: ChatOpts): Promise<string> {
    const model = opts?.model || this.cfg.model;
    if (!this.isConfigured()) throw new Error(this.cfg.provider === 'gemini' ? 'GEMINI_API_KEY ไม่ถูกต้อง (ต้องขึ้นต้นด้วย AIza)' : 'AI provider not configured');
    const { url, isResponses, headers } = this.buildEndpoint(model);
    const res = await this.request(url, this.buildPayload(messages, model, opts, false), headers, opts, '');
    const j: any = await res.json();
    const content = this.extractText(j, isResponses);
    if (!content) throw new Error('Empty AI response');
    return sanitize(content);
  }

  async *chatStream(messages: Msg[], opts?: ChatOpts): AsyncGenerator<string, void, unknown> {
    const model = opts?.model || this.cfg.model;
    if (!this.isConfigured()) throw new Error('AI provider not configured');
    const { url, isResponses, headers } = this.buildEndpoint(model);
    const res = await this.request(url, this.buildPayload(messages, model, opts, true), headers, opts, 'text/event-stream');
    if (!res.body) throw new Error('AI stream: no body');

    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() || '';
      for (const raw of lines) {
        const line = raw.trim();
        if (!line || line.startsWith(':')) continue;
        if (line === 'data: [DONE]' || line === 'data:[DONE]') { await reader.cancel().catch(() => {}); return; }
        if (!line.startsWith('data:')) continue;
        const d = line.slice(5).trim();
        if (!d || d === '[DONE]') continue;
        try {
          const j: any = JSON.parse(d);
          let delta = j.choices?.[0]?.delta?.content
            || (typeof j.delta === 'string' ? j.delta : '')
            || j.delta?.text
            || (j.type === 'response.output_text.delta' ? (typeof j.delta === 'string' ? j.delta : '') : '')
            || j.text
            || j.output_text
            || '';
          if (delta) yield sanitize(String(delta));
        } catch {
          if (!d.startsWith('{')) yield sanitize(d);
        }
      }
    }
  }

  async analyze(text: string, instruction: string): Promise<string> {
    return this.chat([{ role: 'user', content: `${instruction}\n\nข้อมูล:\n${text.slice(0, 8000)}` }], { temperature: 0.3 });
  }
}

let _instance: HermesProvider | null = null;
export function getHermesProvider(): HermesProvider {
  if (!_instance) _instance = new HermesProvider();
  return _instance;
}
export function resetHermesProvider() { _instance = null; }
