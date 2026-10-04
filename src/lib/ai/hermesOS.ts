// src/lib/ai/hermesOS.ts — ระบบปฏิบัติการอัจฉริยะแบบ Hermes (v2: streaming-first)
// หลักการ Hermes: Intent -> Skill match -> Parallel Tools -> Verify -> Synthesize (ไม่เดา)
// v2 ปรับเพื่อ "ความเร็วที่รู้สึกได้":
//  - สตรีมคำตอบจากโมเดลจริง (token ทยอยออก) ไม่ต้องรอคำตอบครบก่อนแสดง
//  - memory + tools ทำงานขนานกัน (Promise.all) ไม่ต่อคิว
//  - งานที่เครื่องมือตอบได้ตรงๆ (คำนวณ/ผัง/ใบเสร็จ/ทักทาย) ตอบทันที ไม่เรียก LLM
//  - แคชคำตอบซ้ำ (TTL 90 วิ) + แคชคำตอบที่สตรีมแล้ว
//  - ข้ามการเรียกเครื่องมือที่ไม่ให้ข้อมูลจริง (mock) และคำถามทักทายสั้นๆ

import { detectIntent, selectTools, chunkData, type Intent, type SearchMode } from "./orchestrator";
import { providerChain, HermesProvider } from "./hermesProvider";
import { getMemories, buildMemoryContext } from "./memory";
import { matchSkills } from "./skills";
import { getTool, runToolsParallel } from "./tools";

export type HermesStep = { step: string; label: string; detail?: string; status: "start" | "done" | "error" };
export type HermesTrace = {
  intent: Intent;
  skills: string[];
  tools: string[];
  toolResults: { tool: string; ok: boolean; data: any; elapsedMs: number }[];
  memoryUsed: number;
};

export type HermesEvent =
  | { type: "step"; step: string; label: string; detail?: string; status: "start" | "done" | "error" }
  | { type: "meta"; intent: Intent; tools: string[]; skills: string[]; memoryUsed: number; mode: SearchMode }
  | { type: "tool_result"; tool: string; ok: boolean; elapsedMs: number; data: any }
  | { type: "token"; text: string }
  | { type: "start"; via: "hermes" | "fallback"; trace: HermesTrace }
  | { type: "done"; via: "hermes" | "fallback"; answer: string; trace: HermesTrace };

type PlanOpts = { hasDataset?: boolean; datasetRaw?: string; datasetType?: string; rows?: number; userId?: string };

/** คำถามที่ไม่ต้องใช้เครื่องมือเลย (ทักทาย/สั้นมาก/คำถามความรู้ทั่วไป) */
function skipTools(q: string, intent: Intent): boolean {
  const s = (q || '').toLowerCase().trim();
  if (!s) return true;
  if (intent === 'GENERAL_QUERY') {
    if (/^(สวัสดี|หวัดดี|ดีครับ|ดีค่ะ|hello|hi|hey|thanks|ขอบคุณ|ทดสอบ|test)/.test(s) && s.length <= 30) return true;
    if (!/(ค้นหา|หา|สมาชิก|ตัวแทน|ทีม|ผัง|ยอด|รายได้|ใบเสร็จ|report|member)/.test(s) && s.length <= 40) return true;
  }
  return false;
}

export async function hermesPlan(query: string, opts: PlanOpts = {}) {
  const effective = query || (opts.hasDataset ? "วิเคราะห์ข้อมูลที่วาง" : query);
  const intent = detectIntent(effective);
  const tools = selectTools(intent);
  const skills = matchSkills(query).map(s => s.name);

  // memory + tool defs เตรียมพร้อมกัน (ไม่ต่อคิว)
  const defs = skipTools(query, intent) ? [] : (tools.map(n => getTool(n)).filter(Boolean) as any[]);
  const [memCtx] = await Promise.all([
    getMemories(opts.userId ?? "guest").then(m => buildMemoryContext(m)).catch(() => ""),
  ]);
  const memoryCtx = memCtx || "";
  const trace: HermesTrace = { intent, skills, tools, toolResults: [], memoryUsed: memoryCtx ? memoryCtx.split("\n").length : 0 };
  return { intent, tools, skills, memoryCtx, defs, trace };
}

// ---------- แคชคำตอบ ----------
const CACHE_TTL_MS = 90_000;
const CACHE_MAX = 200;
const llmCache = new Map<string, { answer: string; at: number }>();

function cacheKeyOf(mode: SearchMode, intent: string, query: string, hasDataset: boolean) {
  return `${mode}|${intent}|${hasDataset ? 'd' : 'q'}|${(query || '').slice(0, 160)}`;
}
function cacheGet(k: string): string | null {
  const hit = llmCache.get(k);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) { llmCache.delete(k); return null; }
  // ย้ายไปท้ายสุด = ใช้ล่าสุด (LRU)
  llmCache.delete(k); llmCache.set(k, hit);
  return hit.answer;
}
function cacheSet(k: string, answer: string) {
  llmCache.set(k, { answer, at: Date.now() });
  while (llmCache.size > CACHE_MAX) { const first = llmCache.keys().next().value; if (first) llmCache.delete(first); }
}

/** เวอร์ชันสตรีม: yield event ทุกชนิดให้ route ส่งต่อเป็น SSE ได้ทันที */
export async function* hermesStream(params: {
  query: string;
  mode: SearchMode;
  hasDataset?: boolean;
  datasetRaw?: string;
  datasetType?: string;
  rows?: number;
  userId?: string;
  signal?: AbortSignal;
}): AsyncGenerator<HermesEvent, void, unknown> {
  const { intent, skills, memoryCtx, defs, trace } = await hermesPlan(params.query, params);
  yield { type: "step", step: "intent", label: "วิเคราะห์เจตนา", detail: intent, status: "done" };
  if (skills.length) yield { type: "step", step: "skills", label: "เลือก Skill", detail: skills.join(", "), status: "done" };
  yield { type: "step", step: "tools", label: "เตรียมเครื่องมือ", detail: defs.length ? defs.map((d: any) => d.name).join(" + ") : "ไม่ต้องใช้ (ตอบตรง)", status: "done" };

  // ---- รันเครื่องมือขนาน (ยกเว้น FAST) ----
  let toolResults: HermesTrace["toolResults"] = [];
  if (params.mode !== "FAST" && defs.length) {
    yield { type: "step", step: "tool_run", label: "กำลังเรียกเครื่องมือ", detail: `${defs.length} ตัวแบบขนาน`, status: "start" };
    toolResults = await runToolsParallel(defs, {}, { userId: params.userId, query: params.query });
    trace.toolResults = toolResults;
    const okCount = toolResults.filter(r => r.ok).length;
    yield { type: "step", step: "tool_run", label: "เรียกเครื่องมือเสร็จ", detail: `${okCount}/${toolResults.length} สำเร็จ • ${toolResults.map(r => `${r.tool}:${r.elapsedMs}ms`).join(" | ")}`, status: "done" };
    for (const r of toolResults) yield { type: "tool_result", tool: r.tool, ok: r.ok, elapsedMs: r.elapsedMs, data: r.data };
  }

  if (params.hasDataset && params.datasetRaw) {
    const chunks = chunkData(params.datasetRaw, 2500);
    yield { type: "step", step: "context", label: "เตรียมบริบท", detail: `${params.datasetType ?? "dataset"} • ${params.rows ?? 0} รายการ • ${chunks.length} ส่วน`, status: "done" };
  }

  yield { type: "meta", intent, tools: trace.tools, skills, memoryUsed: trace.memoryUsed, mode: params.mode };

  const emitText = function* (text: string): Generator<HermesEvent> {
    const chars = Array.from(text);
    const CHUNK = 6;
    for (let i = 0; i < chars.length; i += CHUNK) yield { type: "token", text: chars.slice(i, i + CHUNK).join("") };
  };

  // ---- FAST: ไม่เรียก LLM ----
  if (params.mode === "FAST") {
    const ans = buildFallback(params.query, intent, params.mode, !!params.hasDataset, params.rows ?? 0, toolResults, skills);
    yield { type: "start", via: "fallback", trace };
    yield* emitText(ans);
    yield { type: "done", via: "fallback", answer: ans, trace };
    return;
  }

  // ---- เครื่องมือตอบได้ตรงๆ ----
  if (!params.hasDataset) {
    const direct = tryDirectAnswer(params.query, intent, toolResults, skills);
    if (direct) {
      yield { type: "step", step: "llm", label: "ตอบทันที", detail: "ได้ผลจากเครื่องมือโดยตรง — ไม่ต้องเรียก AI", status: "done" };
      yield { type: "start", via: "fallback", trace };
      yield* emitText(direct);
      yield { type: "done", via: "fallback", answer: direct, trace };
      return;
    }
  }

  // ---- แคช ----
  const key = cacheKeyOf(params.mode, intent, params.query, !!params.hasDataset);
  const cached = cacheGet(key);
  if (cached) {
    yield { type: "step", step: "llm", label: "ตอบจากแคช", detail: "คำถามเดิม — ตอบทันที", status: "done" };
    yield { type: "start", via: "hermes", trace };
    yield* emitText(cached);
    yield { type: "done", via: "hermes", answer: cached, trace };
    return;
  }

  const chain = providerChain();
  if (chain.length) {
    const maxTokens = params.mode === "DEEP" ? 2000 : 900;
    let userContent: string;
    if (params.hasDataset) {
      const ctx = chunkData(params.datasetRaw!, 2500)[0]?.slice(0, 2500) || "";
      userContent = `ถาม: ${params.query || "วิเคราะห์ข้อมูล"}\nข้อมูล:\n${ctx}\nตอบไทย กระชับ มีประโยชน์`;
    } else if (toolResults.length) {
      const tr = toolResults.map(r => `${r.tool}: ${JSON.stringify(r.data).slice(0, 300)}`).join("\n");
      userContent = `ถาม: ${params.query}\nผลลัพธ์จากระบบ: ${tr}\nตอบไทย กระชับ อ้างอิงผลลัพธ์จริง`;
    } else {
      userContent = `ถาม: ${params.query}\nตอบไทย กระชับ`;
    }
    if (memoryCtx) userContent = `${memoryCtx}\n${userContent}`;

    const messages = [{ role: "user" as const, content: userContent }];
    const temperature = params.mode === "DEEP" ? 0.3 : 0.4;

    // ลองค่ายหลักก่อน — ล่ม/โควตาหมดสลับค่ายสำรองอัตโนมัติ (ผู้ใช้ไม่เห็นความล้มเหลว)
    for (let i = 0; i < chain.length; i++) {
      const cand = chain[i];
      const p = new HermesProvider(cand);
      if (!p.isConfigured()) continue;
      yield { type: "step", step: "llm", label: i === 0 ? "กำลังคิด" : "สลับค่ายสำรอง", detail: cand.model, status: "start" };
      let answer = ""; let started = false;
      try {
        for await (const delta of p.chatStream(messages, { temperature, maxTokens, signal: params.signal })) {
          if (params.signal?.aborted) break;
          if (!started) { started = true; yield { type: "start", via: "hermes", trace }; }
          answer += delta;
          yield { type: "token", text: delta };
        }
      } catch (e: any) {
        if (answer.trim()) {
          // ได้ข้อความมาแล้วบางส่วน — ส่งต่อให้จบ ดีกว่าทิ้ง
          cacheSet(key, answer);
          yield { type: "step", step: "llm", label: "สังเคราะห์คำตอบ", detail: `ได้บางส่วนจาก ${cand.provider}`, status: "error" };
          yield { type: "done", via: "hermes", answer, trace };
          return;
        }
        yield { type: "step", step: "llm", label: "ค่ายนี้ไม่ตอบสนอง", detail: `${cand.provider}: ${String(e?.message ?? e).slice(0, 90)}`, status: "error" };
        continue;
      }
      if (answer.trim()) {
        cacheSet(key, answer);
        yield { type: "step", step: "llm", label: "สังเคราะห์คำตอบ", detail: `เสร็จ • ${cand.provider}`, status: "done" };
        yield { type: "done", via: "hermes", answer, trace };
        return;
      }
      yield { type: "step", step: "llm", label: "ค่ายนี้ไม่ตอบสนอง", detail: `${cand.provider}: คำตอบว่าง`, status: "error" };
    }
  }

  const ans = buildFallback(params.query, intent, params.mode, !!params.hasDataset, params.rows ?? 0, toolResults, skills);
  yield { type: "start", via: "fallback", trace };
  yield* emitText(ans);
  yield { type: "done", via: "fallback", answer: ans, trace };
}

/** เวอร์ชันไม่สตรีม (ใช้กับ /api/ai/query) — เก็บคำตอบจากสตรีมให้ครบ */
export async function hermesExecute(params: {
  query: string;
  mode: SearchMode;
  hasDataset?: boolean;
  datasetRaw?: string;
  datasetType?: string;
  rows?: number;
  userId?: string;
  onStep?: (s: HermesStep) => void;
}): Promise<{ intent: Intent; answer: string; via: "hermes" | "fallback"; trace: HermesTrace }> {
  let answer = ""; let via: "hermes" | "fallback" = "fallback"; let trace: HermesTrace | null = null;
  let intent: Intent = "GENERAL_QUERY";
  for await (const ev of hermesStream(params)) {
    if (ev.type === "step") params.onStep?.(ev);
    else if (ev.type === "meta") intent = ev.intent;
    else if (ev.type === "token") answer += ev.text;
    else if (ev.type === "done") { via = ev.via; trace = ev.trace; if (ev.answer) answer = ev.answer; }
    else if (ev.type === "start") trace = ev.trace;
  }
  if (!trace) trace = { intent, skills: [], tools: [], toolResults: [], memoryUsed: 0 };
  if (!answer) answer = buildFallback(params.query, intent, params.mode, !!params.hasDataset, params.rows ?? 0, trace.toolResults, []);
  return { intent, answer, via, trace };
}

// ตอบตรงจากผล tool โดยไม่เรียก LLM — สำหรับคำถามที่เครื่องมือตอบได้ชัด
function tryDirectAnswer(q: string, intent: string, toolResults: any[], skills: string[]): string | null {
  const calc = toolResults.find(r => r.tool === "Calculator" && r.ok)?.data;
  if (calc?.result !== undefined && !calc?.error) return `${calc.expression} = ${calc.result}`;
  const sales = toolResults.find(r => r.tool === "Sales Calculation" && r.ok)?.data;
  if (sales?.numbers?.length >= 2 && intent === "CALCULATE") return `${sales.numbers.join(" + ")} = ${sales.sum} • เฉลี่ย ${typeof sales.avg === "number" ? sales.avg.toFixed(2) : sales.avg} • สูงสุด ${sales.max} • ต่ำสุด ${sales.min}`;
  if (/ผัง|เครือข่าย|1 แตก 5/i.test(q)) {
    const net = toolResults.find(r => r.tool === "Network Engine")?.data;
    if (net?.root) return `ผัง ${net.root.memberCode} — ${net.root.firstName} ${net.root.lastName} • สายตรง ${net.children?.length ?? net.placements ?? 0} คน`;
    if (net?.mode === "sample") return `ตัวอย่างผัง ${net.nodes?.length ?? 0} โหนด — พิมพ์รหัสสมาชิกเพื่อดูผังเฉพาะคน`;
  }
  if (/ใบเสร็จ|receipt/i.test(q)) {
    const rc = toolResults.find(r => r.tool === "Receipt Validation")?.data;
    if (rc?.count !== undefined) return `ใบเสร็จ ${rc.count} รายการล่าสุด — แนบไฟล์เพื่อตรวจ OCR/ซ้ำ`;
  }
  const hits = toolResults.find(r => r.tool === "Database Search")?.data?.hits;
  if (hits?.length) return `พบ ${hits.length} รายการ:\n${hits.slice(0, 5).map((h: any) => `• ${h.type}: ${h.firstName ?? h.name ?? h.email ?? h.memberCode ?? JSON.stringify(h).slice(0, 60)}`).join("\n")}`;
  const ql = q.toLowerCase().trim();
  if (/^(สวัสดี|หวัดดี|hello|hi|hey)(\s|$|[ก-๙])/.test(ql)) return `สวัสดีครับ 👋 — ถามได้เลย เช่น "คำนวณ 1234*56" / "ค้นหา M-000123" / วางข้อมูลแล้วบอก "วิเคราะห์"`;
  return null;
}

function buildFallback(q: string, intent: string, mode: SearchMode, hasDataset: boolean, rows: number, toolResults: any[], skills: string[]): string {
  const calc = toolResults.find(r => r.tool === "Calculator" && r.ok)?.data;
  if (calc?.result !== undefined && !calc?.error) return `${calc.expression} = ${calc.result}`;
  const sales = toolResults.find(r => r.tool === "Sales Calculation" && r.ok)?.data;
  if (sales && sales.numbers?.length >= 2 && intent === "CALCULATE") {
    return `${sales.numbers.join(" + ")} = ${sales.sum} • เฉลี่ย ${sales.avg?.toFixed?.(2) ?? sales.avg} • สูงสุด ${sales.max} • ต่ำสุด ${sales.min}`;
  }
  if (!q && hasDataset) return `วิเคราะห์ ${rows} รายการ — พร้อมสรุป/เปรียบเทียบ/คำนวณ บอกได้เลยว่าต้องการอะไร`;
  if (/ผัง|เครือข่าย|1 แตก 5/i.test(q)) {
    const net = toolResults.find(r => r.tool === "Network Engine")?.data;
    if (net?.root) return `ผัง ${net.root.memberCode} — ${net.root.firstName} ${net.root.lastName} • สายตรง ${net.children?.length ?? net.placements ?? 0} คน`;
    if (net?.mode === "sample") return `ตัวอย่างผัง ${net.nodes?.length ?? 0} โหนด — พิมพ์รหัสสมาชิกเพื่อดูผังเฉพาะคน`;
    return `ผัง 1 แตก 5 — พิมพ์รหัสสมาชิก (เช่น M-000123) เพื่อดู`;
  }
  if (/ใบเสร็จ|receipt/i.test(q)) {
    const rc = toolResults.find(r => r.tool === "Receipt Validation")?.data;
    if (rc?.count !== undefined) return `ใบเสร็จ ${rc.count} รายการล่าสุด — แนบไฟล์เพื่อตรวจ OCR/ซ้ำ`;
    return `แนบไฟล์ใบเสร็จเพื่อตรวจ (รองรับ PDF/รูป)`;
  }
  if (hasDataset) return `${rows} รายการ — บอกได้เลย: สรุป / เทียบ / หาค่าสูงสุด / คำนวณ`;
  const hits = toolResults.find(r => r.tool === "Database Search")?.data?.hits;
  if (hits?.length) return `พบ ${hits.length} รายการ:\n${hits.slice(0, 5).map((h: any) => `• ${h.type}: ${h.firstName ?? h.name ?? h.email ?? h.memberCode ?? JSON.stringify(h).slice(0, 60)}`).join("\n")}`;
  if (intent === "CALCULATE" && /\d/.test(q)) return `ไม่พบนิพจน์คำนวณที่ชัด — พิมพ์เช่น 1234*56 หรือ 15000+2500`;
  if (!q.trim()) return `พิมพ์คำถามหรือวางข้อมูลได้เลย`;

  const ql = q.toLowerCase();
  if (/ai\s*คือ.*อะไร|คือ.*ai|what.*is.*ai/i.test(q)) {
    return `AI คือระบบอัจฉริยะที่ช่วยค้นหา วิเคราะห์ คำนวณ และจัดการข้อมูลเครือข่าย 1 แตก 5\n\n• พิมพ์คำถาม เช่น "สรุปยอดเดือนนี้" / "ดูผัง M-000123" / "คำนวณ 15000*12%"\n• วางตาราง/CSV แล้วบอก "วิเคราะห์" หรือ "สรุป"\n• แนบไฟล์ใบเสร็จเพื่อตรวจ OCR`;
  }
  if (/เขียน.*โค้ด|เขียน.*โปรแกรม|เขียน.*กล่อง|code|สร้าง.*ฟังก์ชัน/i.test(q)) {
    if (/กล่อง.*รับ.*ข้อมูล|input.*box|ช่อง.*กรอก/i.test(q)) {
      return `กล่องรับข้อมูล (React + Tailwind) — ก็อปไปใช้ได้เลย:\n\n\`\`\`tsx\n<input\n  type="text"\n  placeholder="พิมพ์ที่นี่..."\n  className="w-full px-4 py-3 rounded-2xl border border-blue-100 bg-white focus:outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"\n  onChange={e => console.log(e.target.value)}\n/>\n\`\`\`\n\nบอกได้เลยว่าอยากได้แบบไหน: ช่องค้นหา / ฟอร์มหลายช่อง / กล่องแชต`;
    }
    return `บอกได้เลยว่าอยากให้เขียนโค้ดอะไร เช่น "กล่องรับข้อมูล", "ตาราง", "กราฟ" — จะส่งโค้ดพร้อมก็อปให้ทันที`;
  }
  if (/สวัสดี|หวัดดี|hello|hi(\s|$|[ก-๙])/.test(ql)) return `สวัสดีครับ 👋 — ถามได้เลย เช่น "AI คืออะไร" / "คำนวณ 1234*56" / วางข้อมูลแล้วบอก "วิเคราะห์"`;
  if (/อาว|อ้าว|ห๊ะ|งง/i.test(ql)) return `ว่าไงครับ 😊 — พิมพ์คำถามมาได้เลย หรือวางข้อมูลแล้วบอกว่าอยากให้ทำอะไร`;
  if (ql.length <= 8) return `"${q}" — หมายถึงอะไรครับ? ลองพิมพ์เต็มๆ เช่น "สรุปยอด" / "ค้นหา M-000123" / "คำนวณ 100*5"`;
  if (ql.length > 12) return `ระบบ AI ยังตอบไม่ได้ในขณะนี้ — ลองอีกครั้งใน 1 นาที\n\nระหว่างนี้ใช้คำสั่งที่ระบบจัดการได้ทันที:\n• "คำนวณ 15000*12%" — คิดเลข\n• "ค้นหา M-000123" — ค้นสมาชิก/ตัวแทน\n• วางตาราง CSV แล้วบอก "วิเคราะห์" — สรุป/เทียบข้อมูล\n• "ดูผัง 1 แตก 5" — ผังเครือข่าย`;
  return `"${q.slice(0, 80)}" — บอกเพิ่มนิดนึงว่าต้องการอะไร เช่น ค้นหา / วิเคราะห์ / คำนวณ / เขียนโค้ด`;
}
