// src/lib/ai/hermesProvider.ts — Hermes Agent Provider Adapter
// เบื้องหลังใช้ Hermes (opencode-free / Muse Spark 1.2) แต่ Frontend ใช้ชื่อกลาง "ระบบค้นหาด้วย AI อัจฉริยะ"
import type { AIProvider } from './provider';

const HERMES_SYSTEM_PROMPT = `คุณคือระบบค้นหาด้วย AI อัจฉริยะ ของ AI INSURANCE NETWORK TREE
กฎ: ถามสั้นตอบสั้น ถามลึกตอบลึก — เข้าประเด็นทันที ไม่มีคำฟุ่มเฟือย ไม่สรุปซ้ำ — ไม่แน่ใจบอกตรงๆ — อ้างอิงผลจาก tools จริงเท่านั้น — ตอบไทย กระชับ — ห้ามเปิดเผยชื่อ provider/model/key`;

function getEnv(key: string): string | undefined {
  return process.env[key];
}

// โมเดล Gemini ที่ใช้จริง — รุ่น lite ให้คำตอบครบถ้วนและเร็ว
// (gemini-3.6-flash ขึ้นไปเป็น "thinking model" — กิน token ประมาณการจนคำตอบถูกตัดกลางคำ)
const GEMINI_DEFAULT_MODEL = 'gemini-3.5-flash-lite';
// รุ่นที่เป็น thinking model — ต้องปิด reasoning ไม่เช่นนั้น token หมดไปกับการคิดแล้วคำตอบขาด
const isThinkingModel = (m: string) => /gemini-3\.(6|7|8|9)|thinking|2\.5-pro|-pro\b/i.test(m);

/** ปิด reasoning สำหรับ thinking model (Gemini OpenAI-compat) เพื่อไม่ให้คำตอบถูกตัด */
function applyReasoningGuard(payload: any, provider: string, model: string) {
  if (provider === 'gemini' && isThinkingModel(model)) payload.reasoning_effort = 'none';
  return payload;
}

function resolveConfig() {
  const rawProvider = (getEnv('AI_PROVIDER') || getEnv('HERMES_PROVIDER') || (getEnv('DEEPSEEK_API_KEY') ? 'deepseek' : getEnv('GEMINI_API_KEY') ? 'gemini' : '')).toLowerCase();
  const modelEnv = getEnv('HERMES_MODEL') || getEnv('AI_MODEL') || getEnv('DEEPSEEK_MODEL') || '';
  let provider = rawProvider;
  // บนเซิร์ฟเวอร์ (Vercel) ให้優先 gemini ถ้ามี key — opencode-free ใช้ได้เฉพาะใน Hermes Desktop
  if (provider === 'opencode-free' && getEnv('GEMINI_API_KEY')) provider = 'gemini';
  if (!provider && modelEnv.includes('muse-spark') && !getEnv('GEMINI_API_KEY')) provider = 'opencode-free';
  if (!provider) provider = getEnv('GEMINI_API_KEY') ? 'gemini' : 'opencode-free';

  // เลือก API key ตาม provider ที่เลือก (ไม่ใช่ตามลำดับ env ทั่วไป — กันใช้ key ผิด provider)
  let apiKey = '';
  if (provider === 'gemini') apiKey = getEnv('GEMINI_API_KEY') || getEnv('HERMES_API_KEY') || getEnv('AI_API_KEY') || '';
  else if (provider === 'deepseek') apiKey = getEnv('DEEPSEEK_API_KEY') || getEnv('HERMES_API_KEY') || getEnv('AI_API_KEY') || '';
  else apiKey = getEnv('HERMES_API_KEY') || getEnv('AI_API_KEY') || getEnv('OPENAI_API_KEY') || getEnv('DEEPSEEK_API_KEY') || getEnv('GEMINI_API_KEY') || '';

  const baseUrl = getEnv('HERMES_BASE_URL') || getEnv('AI_BASE_URL') || (provider === 'deepseek' ? getEnv('DEEPSEEK_BASE_URL') : undefined) || (provider === 'gemini' ? 'https://generativelanguage.googleapis.com/v1beta/openai' : undefined);
  let model = modelEnv;
  if (!model) model = provider === 'gemini' ? GEMINI_DEFAULT_MODEL : provider === 'deepseek' ? 'deepseek-chat' : 'muse-spark-1.2-contributor-free';
  // ถ้า provider เป็น gemini แต่ model ยังเป็น muse-spark ให้แก้เป็น gemini
  if (provider === 'gemini' && /muse-spark/i.test(model)) model = GEMINI_DEFAULT_MODEL;
  return { apiKey, baseUrl, provider, model };
}

function genSessionId(): string {
  return 'hermes-' + Math.random().toString(36).slice(2,10) + '-' + Date.now().toString(36);
}

function opencodeHeaders(): Record<string,string> {
  return {
    'Authorization': '',
    'HTTP-Referer': 'https://hermes-agent.nousresearch.com',
    'X-Title': 'Hermes Agent',
    'User-Agent': 'HermesAgent/0.20.5',
    'x-opencode-session': genSessionId(),
  };
}

export class HermesProvider implements AIProvider {
  private apiKey: string;
  private baseUrl?: string;
  private model: string;
  private provider: string;

  constructor() {
    const cfg = resolveConfig();
    this.apiKey = cfg.apiKey;
    this.baseUrl = cfg.baseUrl;
    this.provider = cfg.provider;
    this.model = cfg.model;
  }

  isConfigured(): boolean {
    if (this.provider === 'opencode-free') return true;
    if (this.provider === 'gemini') return !!this.apiKey; // รองรับทั้ง AIza (ฟรี) และ AQ (OAuth)
    return !!this.apiKey;
  }

  getInfo(): { provider: string; model: string; configured: boolean } {
    return { provider: this.provider, model: this.model, configured: this.isConfigured() };
  }

  async chat(messages: {role:'system'|'user'|'assistant'; content:string}[], opts?: {model?: string; temperature?: number; maxTokens?: number}): Promise<string> {
    const model = opts?.model || this.model;

    // ===== opencode-free (Muse Spark 1.2) — ใช้ /v1/responses แบบ Hermes =====
    if (this.provider === 'opencode-free') {
      const base = (this.baseUrl || 'https://opencode.ai/zen/v1').replace(/\/+$/,'');
      // Muse Spark / GPT-5 ต้องใช้ Responses API
      const isResponsesModel = /muse-spark|gpt-5|grok-4|codex/i.test(model);
      if (isResponsesModel) {
        const url = `${base}/responses`;
        // แปลง messages เป็น input สำหรับ Responses API
        const input = messages.map(m=> `${m.role}: ${m.content}`).join('\n\n');
        const payload: any = {
          model,
          input,
          max_output_tokens: opts?.maxTokens ?? 1200,
        };
        // temperature ไม่ใช่พารามิเตอร์หลักของ Responses API บางรุ่น — ใส่ได้ถ้ารองรับ
        if (opts?.temperature !== undefined) payload.temperature = opts.temperature;

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...opencodeHeaders() },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const txt = await res.text().catch(()=> '');
          throw new Error(`opencode responses error ${res.status}: ${txt.slice(0,400)}`);
        }
        const j: any = await res.json();
        // Responses API: output[].content[].text หรือ output_text
        let content = j.output_text || '';
        if (!content && Array.isArray(j.output)) {
          for (const o of j.output) {
            if (Array.isArray(o.content)) {
              for (const c of o.content) {
                if (c.type === 'output_text' && c.text) content += c.text;
                if (c.type === 'text' && c.text) content += c.text;
              }
            }
          }
        }
        if (!content) content = j.choices?.[0]?.message?.content || '';
        if (!content) throw new Error('Empty AI response (responses)');
        return content.replace(/Hermes/gi, 'ระบบค้นหาด้วย AI อัจฉริยะ');
      }
      // รุ่นอื่นใช้ chat/completions แบบ anonymous
      const url = `${base}/chat/completions`;
      const payload = {
        model,
        messages: [{ role: 'system' as const, content: HERMES_SYSTEM_PROMPT }, ...messages],
        temperature: opts?.temperature ?? 0.4,
        max_tokens: opts?.maxTokens ?? 1200,
      };
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...opencodeHeaders() },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const txt = await res.text().catch(()=> '');
        throw new Error(`opencode chat error ${res.status}: ${txt.slice(0,400)}`);
      }
      const j: any = await res.json();
      const content = j.choices?.[0]?.message?.content || '';
      if (!content) throw new Error('Empty AI response');
      return content.replace(/Hermes/gi, 'ระบบค้นหาด้วย AI อัจฉริยะ');
    }

    // ===== Providers ปกติ (OpenAI / DeepSeek / Gemini) =====
    if (!this.isConfigured()) throw new Error(this.provider==='gemini' ? 'GEMINI_API_KEY ไม่ถูกต้อง (ต้องขึ้นต้นด้วย AIza)' : 'AI provider not configured');

    const url = this.baseUrl
      ? `${this.baseUrl.replace(/\/+$/,'')}/chat/completions`
      : this.provider === 'gemini'
        ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions'
        : this.provider === 'deepseek'
          ? 'https://api.deepseek.com/chat/completions'
          : 'https://api.openai.com/v1/chat/completions';

    const payload: any = applyReasoningGuard({
      model,
      messages: [{ role: 'system' as const, content: HERMES_SYSTEM_PROMPT }, ...messages],
      temperature: opts?.temperature ?? 0.4,
      max_tokens: opts?.maxTokens ?? 1200,
    }, this.provider, model);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const txt = await res.text().catch(()=> '');
      throw new Error(`AI provider error ${res.status}: ${txt.slice(0,300)}`);
    }
    const j: any = await res.json();
    const content = j.choices?.[0]?.message?.content || j.choices?.[0]?.text || '';
    if (!content) throw new Error('Empty AI response');
    return content.replace(/Hermes/gi, 'ระบบค้นหาด้วย AI อัจฉริยะ').replace(/Hermes Agent/gi, 'ระบบค้นหาด้วย AI อัจฉริยะ');
  }

  async *chatStream(messages: {role:'system'|'user'|'assistant'; content:string}[], opts?: {model?: string; temperature?: number; maxTokens?: number}): AsyncGenerator<string, void, unknown> {
    const model = opts?.model || this.model;
    // opencode-free streaming — Responses API ใช้ stream:true → SSE
    if (this.provider === 'opencode-free') {
      const base = (this.baseUrl || 'https://opencode.ai/zen/v1').replace(/\/+$/,'');
      const isResponsesModel = /muse-spark|gpt-5|grok-4|codex/i.test(model);
      if (isResponsesModel) {
        const url = `${base}/responses`;
        const input = messages.map(m=> `${m.role}: ${m.content}`).join('\n\n');
        const payload: any = { model, input, max_output_tokens: opts?.maxTokens ?? 1200, stream: true };
        if (opts?.temperature !== undefined) payload.temperature = opts.temperature;
        const res = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json', 'Accept':'text/event-stream', ...opencodeHeaders() }, body: JSON.stringify(payload) });
        if (!res.ok || !res.body) {
          const txt = await res.text().catch(()=>''); throw new Error(`opencode responses stream ${res.status}: ${txt.slice(0,300)}`);
        }
        const reader = res.body.getReader(); const dec = new TextDecoder(); let buf='';
        while(true){
          const {done,value} = await reader.read(); if(done) break;
          buf += dec.decode(value,{stream:true});
          const lines = buf.split('\n'); buf = lines.pop() || '';
          for(const raw of lines){
            const line = raw.trim(); if(!line || line.startsWith(':')) continue;
            if(line==='data: [DONE]') return;
            // event: response.output_text.delta  data: {"delta":"..."}
            if(line.startsWith('data: ')){
              const d = line.slice(6).trim(); if(!d || d==='[DONE]') continue;
              try{
                const j:any = JSON.parse(d);
                // Responses streaming variants: delta / output_text / text
                let delta = j.delta || j.text || j.output_text || j?.choices?.[0]?.delta?.content || '';
                if(!delta && j.type==='response.output_text.delta' && typeof j.delta==='string') delta=j.delta;
                if(!delta && j.type==='response.output_text.delta' && j.delta?.text) delta=j.delta.text;
                if(!delta && typeof j.delta==='object' && j.delta?.text) delta=j.delta.text;
                if(delta) yield String(delta).replace(/Hermes/gi,'ระบบค้นหาด้วย AI อัจฉริยะ');
              }catch{
                // plain text delta without JSON (some proxies)
                if(d && !d.startsWith('{')) yield d.replace(/Hermes/gi,'ระบบค้นหาด้วย AI อัจฉริยะ');
              }
            }
          }
        }
        return;
      }
      // chat/completions streaming
      const url = `${base}/chat/completions`;
      const payload:any = { model, messages:[{role:'system',content:HERMES_SYSTEM_PROMPT},...messages], temperature: opts?.temperature??0.4, max_tokens: opts?.maxTokens??1200, stream:true };
      const res = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json','Accept':'text/event-stream', ...opencodeHeaders() }, body: JSON.stringify(payload) });
      if(!res.ok || !res.body) throw new Error(`opencode chat stream ${res.status}`);
      const reader=res.body.getReader(); const dec=new TextDecoder(); let buf='';
      while(true){
        const {done,value}=await reader.read(); if(done) break;
        buf+=dec.decode(value,{stream:true});
        const lines=buf.split('\n'); buf=lines.pop()||'';
        for(const raw of lines){
          const line=raw.trim(); if(!line||line.startsWith(':')) continue;
          if(line==='data: [DONE]') return;
          if(line.startsWith('data: ')){
            const d=line.slice(6).trim(); if(d==='[DONE]') return;
            try{ const j:any=JSON.parse(d); const delta=j.choices?.[0]?.delta?.content || j.delta || ''; if(delta) yield String(delta).replace(/Hermes/gi,'ระบบค้นหาด้วย AI อัจฉริยะ'); }catch{}
          }
        }
      }
      return;
    }
    // Providers ปกติ — OpenAI / DeepSeek / Gemini streaming
    if(!this.isConfigured()) throw new Error('AI provider not configured');
    const url = this.baseUrl ? `${this.baseUrl.replace(/\/+$/,'')}/chat/completions` : this.provider==='gemini' ? 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions' : this.provider==='deepseek' ? 'https://api.deepseek.com/chat/completions' : 'https://api.openai.com/v1/chat/completions';
    const payload:any = applyReasoningGuard({ model, messages:[{role:'system',content:HERMES_SYSTEM_PROMPT},...messages], temperature: opts?.temperature??0.4, max_tokens: opts?.maxTokens??1200, stream:true }, this.provider, model);
    const res = await fetch(url, { method:'POST', headers:{ 'Content-Type':'application/json','Accept':'text/event-stream','Authorization':`Bearer ${this.apiKey}` }, body: JSON.stringify(payload) });
    if(!res.ok || !res.body) throw new Error(`AI stream ${res.status}`);
    const reader=res.body.getReader(); const dec=new TextDecoder(); let buf='';
    while(true){
      const {done,value}=await reader.read(); if(done) break;
      buf+=dec.decode(value,{stream:true});
      const lines=buf.split('\n'); buf=lines.pop()||'';
      for(const raw of lines){
        const line=raw.trim(); if(line==='data: [DONE]') return;
        if(line.startsWith('data: ')){
          const d=line.slice(6).trim(); if(d==='[DONE]') return;
          try{ const j:any=JSON.parse(d); const delta=j.choices?.[0]?.delta?.content||''; if(delta) yield String(delta).replace(/Hermes/gi,'ระบบค้นหาด้วย AI อัจฉริยะ').replace(/Hermes Agent/gi,'ระบบค้นหาด้วย AI อัจฉริยะ'); }catch{}
        }
      }
    }
  }

  async analyze(text: string, instruction: string): Promise<string> {
    return this.chat([
      { role: 'user', content: `${instruction}\n\nข้อมูล:\n${text.slice(0, 8000)}` }
    ], { temperature: 0.3 });
  }
}

let _instance: HermesProvider | null = null;
export function getHermesProvider(): HermesProvider {
  if (!_instance) _instance = new HermesProvider();
  return _instance;
}
export function resetHermesProvider(){ _instance = null; }