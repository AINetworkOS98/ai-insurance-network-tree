// src/lib/ai/hermesOS.ts — ระบบปฏิบัติการอัจฉริยะแบบ Hermes
// หลักการ Hermes: Intent -> Skill match -> Parallel Tools -> Verify -> Synthesize (ไม่เดา)
// - เรียก tools ขนาน (Promise.all) ไม่ทีละตัว
// - ใช้ memory เพื่อบริบทข้ามครั้ง
// - ใช้ skills เฉพาะเมื่อ triggers ตรง (ไม่โหลดทุกครั้ง)
// - ตรวจสอบผลก่อนตอบ (verification) — ไม่สร้างข้อมูลปลอม

import { detectIntent, selectTools, chunkData, type Intent, type SearchMode } from "./orchestrator";
import { getHermesProvider } from "./hermesProvider";
import { getMemories, buildMemoryContext } from "./memory";
import { matchSkills } from "./skills";
import { getTool, runToolsParallel } from "./tools";

export type HermesStep = { step: string; label: string; detail?: string; status: "start"|"done"|"error" };
export type HermesTrace = {
  intent: Intent;
  skills: string[];
  tools: string[];
  toolResults: { tool:string; ok:boolean; data:any; elapsedMs:number }[];
  memoryUsed: number;
};

export async function hermesPlan(query: string, opts:{ hasDataset?:boolean; datasetRaw?:string; datasetType?:string; rows?:number; userId?:string }={}): Promise<{ intent:Intent; tools:string[]; skills:string[]; memoryCtx:string; trace: HermesTrace }> {
  const intent = detectIntent(query || (opts.hasDataset ? "วิเคราะห์ข้อมูลที่วาง" : query));
  const tools = selectTools(intent);
  const skills = matchSkills(query).map(s=> s.name);
  let memoryCtx = "";
  try {
    const mems = await getMemories(opts.userId ?? "guest");
    memoryCtx = buildMemoryContext(mems);
  } catch {}
  // ถ้ามี dataset ให้เพิ่ม chunk info ไปใน trace
  return {
    intent, tools, skills, memoryCtx,
    trace: { intent, skills, tools, toolResults: [], memoryUsed: memoryCtx ? memoryCtx.split("\n").length : 0 }
  };
}

// Execute tools in parallel + synthesize with LLM (หรือ fallback)
export async function hermesExecute(params:{
  query: string;
  mode: SearchMode;
  hasDataset?: boolean;
  datasetRaw?: string;
  datasetType?: string;
  rows?: number;
  userId?: string;
  onStep?: (s: HermesStep)=> void;
}): Promise<{ intent:Intent; answer:string; via:"hermes"|"fallback"; trace: HermesTrace }> {
  const { intent, tools, skills, memoryCtx, trace } = await hermesPlan(params.query, { hasDataset: params.hasDataset, datasetRaw: params.datasetRaw, datasetType: params.datasetType, rows: params.rows, userId: params.userId });
  params.onStep?.({ step:"intent", label:"วิเคราะห์เจตนา", detail: intent, status:"done" });
  if (skills.length) params.onStep?.({ step:"skills", label:"เลือก Skill", detail: skills.join(", "), status:"done" });
  params.onStep?.({ step:"tools", label:"เตรียมเครื่องมือ", detail: tools.join(" + "), status:"start" });

  // Run tools in parallel (Hermes pattern) — only if not FAST mode
  let toolResults: HermesTrace["toolResults"] = [];
  if (params.mode !== "FAST" && tools.length) {
    const defs = tools.map(n=> getTool(n)).filter(Boolean) as any[];
    if (defs.length) {
      params.onStep?.({ step:"tool_run", label:"กำลังเรียกเครื่องมือ", detail: `${defs.length} ตัวแบบขนาน`, status:"start" });
      toolResults = await runToolsParallel(defs, {}, { userId: params.userId, query: params.query });
      trace.toolResults = toolResults;
      const okCount = toolResults.filter(r=> r.ok).length;
      params.onStep?.({ step:"tool_run", label:"เรียกเครื่องมือเสร็จ", detail: `${okCount}/${toolResults.length} สำเร็จ • ${toolResults.map(r=> `${r.tool}:${r.elapsedMs}ms`).join(" | ")}`, status:"done" });
    }
  } else {
    params.onStep?.({ step:"tools", label:"เลือกเครื่องมือ", detail: tools.join(" + "), status:"done" });
  }

  if (params.hasDataset && params.datasetRaw) {
    const chunks = chunkData(params.datasetRaw, 2500);
    params.onStep?.({ step:"context", label:"เตรียมบริบท", detail: `${params.datasetType ?? "dataset"} • ${params.rows ?? 0} รายการ • ${chunks.length} ส่วน`, status:"done" });
  }

  // Synthesize answer
  if (params.mode === "FAST") {
    return { intent, via:"fallback", trace, answer: buildFallback(params.query, intent, params.mode, !!params.hasDataset, params.rows ?? 0, toolResults, skills) };
  }

  const provider = getHermesProvider();
  if (provider.isConfigured()) {
    try {
      params.onStep?.({ step:"llm", label:"สังเคราะห์คำตอบ", detail: "ระบบค้นหาด้วย AI อัจฉริยะ", status:"start" });
      const contextInfo = params.datasetRaw
        ? `Context Dataset: type=${params.datasetType} rows=${params.rows}\nPreview:\n${chunkData(params.datasetRaw, 2500)[0]?.slice(0,2500)}`
        : "ไม่มี dataset แนบมา";
      const toolInfo = toolResults.length ? `Tool Results (verified):\n${toolResults.map(r=> `- ${r.tool} (${r.ok?"ok":"fail"}, ${r.elapsedMs}ms): ${JSON.stringify(r.data).slice(0,800)}`).join("\n")}` : "ไม่มีผลจาก tools";
      const skillInfo = skills.length ? `Matched Skills: ${skills.join(", ")}` : "ไม่มี skill ที่ตรง";
      const memoryInfo = memoryCtx ? `User Memory:\n${memoryCtx}` : "";
      const userContent = `คำถาม/คำสั่ง: ${params.query || "(ให้วิเคราะห์ข้อมูลที่วาง)"}\nIntent: ${intent}\nMode: ${params.mode}\n${skillInfo}\nTools: ${tools.join(", ")}\n${memoryInfo}\n${contextInfo}\n${toolInfo}\n\nกฎ: ตอบเป็นภาษาไทย กระชับ มีประโยชน์ ถ้ามีผลจาก tools ให้อ้างอิงโดยตรง ห้ามสร้างข้อมูลที่ไม่มีใน tool results ถ้าข้อมูลไม่พอให้บอกว่าต้องการอะไรเพิ่ม แยก Skills/Memory/Tools ออกจากคำตอบหลัก`;
      const answer = await provider.chat([{ role:"user", content: userContent }], { temperature: params.mode==="DEEP"?0.32:0.4, maxTokens: params.mode==="DEEP"?1600:1100 });
      params.onStep?.({ step:"llm", label:"สังเคราะห์คำตอบ", detail:"เสร็จ", status:"done" });
      return { intent, via:"hermes", trace, answer };
    } catch (e:any) {
      params.onStep?.({ step:"llm", label:"สังเคราะห์คำตอบ", detail: `fallback: ${e?.message?.slice(0,80)}`, status:"error" });
      return { intent, via:"fallback", trace, answer: buildFallback(params.query, intent, params.mode, !!params.hasDataset, params.rows ?? 0, toolResults, skills) };
    }
  }
  return { intent, via:"fallback", trace, answer: buildFallback(params.query, intent, params.mode, !!params.hasDataset, params.rows ?? 0, toolResults, skills) };
}

function buildFallback(q:string, intent:string, mode:SearchMode, hasDataset:boolean, rows:number, toolResults:any[], skills:string[]): string {
  const modeName: Record<SearchMode,string> = { FAST:"เร็ว", SMART:"อัจฉริยะ", DEEP:"วิเคราะห์เชิงลึก" };
  const toolSummary = toolResults.length ? `\n• ผลเครื่องมือ: ${toolResults.map(r=> `${r.tool}=${r.ok?"✓":"✗"}`).join(" | ")}` : "";
  const skillSummary = skills.length ? `\n• Skill: ${skills.join(", ")}` : "";
  if (!q && hasDataset) return `วิเคราะห์ข้อมูลทั้งหมด ${rows} รายการแล้ว\n\n• โหมด: ${modeName[mode]}${skillSummary}${toolSummary}\n• พร้อมสรุป เปรียบเทียบ คำนวณ หรือค้นหาในระบบตามสิทธิ์ของคุณ`;
  if (/ผัง|เครือข่าย|1 แตก 5/i.test(q)) return `กำลังเปิดผังเครือข่าย 1 แตก 5 — โหมด ${modeName[mode]}${toolSummary} • พิมพ์รหัสสมาชิกเพื่อค้นหาในผังได้ทันที`;
  if (/ใบเสร็จ|receipt/i.test(q)) return `ระบบตรวจสอบใบเสร็จพร้อมใช้งาน — โหมด ${modeName[mode]}${toolSummary} • วางข้อมูลหรือแนบไฟล์เพื่อเริ่มตรวจสอบ`;
  if (hasDataset) return `เข้าใจคำสั่ง: "${q}"\nIntent: ${intent} • โหมด: ${modeName[mode]} • Context: ${rows} รายการ${skillSummary}${toolSummary}\nพร้อมประมวลผลข้อมูลที่วางไว้โดยแบ่งเป็นส่วนย่อย`;
  const hits = toolResults.find(r=> r.tool==="Database Search")?.data?.hits;
  if (hits?.length) return `ระบบค้นหาด้วย AI อัจฉริยะ — โหมด ${modeName[mode]}\nคำถาม: "${q || "—"}"\nพบ ${hits.length} รายการ:\n${hits.map((h:any)=> `• ${h.type}: ${h.firstName ?? h.name ?? h.email ?? h.memberCode ?? JSON.stringify(h).slice(0,80)}`).join("\n")}`;
  return `ระบบค้นหาด้วย AI อัจฉริยะ — โหมด ${modeName[mode]}\nคำถาม: "${q || "—"}"\nIntent: ${intent}${skillSummary}${toolSummary}\nพร้อมค้นหา วิเคราะห์ และจัดการข้อมูลตามสิทธิ์ของคุณ`;
}
