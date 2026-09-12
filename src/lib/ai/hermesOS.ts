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
  // Hermes style: สั้น ตรง ตรวจสอบแล้ว ไม่ฟุ่มเฟือย
  // ถ้ามี Calculator result ให้ตอบด้วยผลคำนวณที่ตรวจสอบแล้ว
  const calc = toolResults.find(r=> r.tool==="Calculator" && r.ok)?.data;
  if (calc?.result !== undefined && !calc?.error) {
    return `${calc.expression} = ${calc.result}`;
  }
  const sales = toolResults.find(r=> r.tool==="Sales Calculation" && r.ok)?.data;
  if (sales && sales.numbers?.length >= 2 && intent==="CALCULATE") {
    return `${sales.numbers.join(" + ")} = ${sales.sum} • เฉลี่ย ${sales.avg?.toFixed?.(2) ?? sales.avg} • สูงสุด ${sales.max} • ต่ำสุด ${sales.min}`;
  }
  if (!q && hasDataset) return `วิเคราะห์ ${rows} รายการ — พร้อมสรุป/เปรียบเทียบ/คำนวณ บอกได้เลยว่าต้องการอะไร`;
  if (/ผัง|เครือข่าย|1 แตก 5/i.test(q)) {
    const net = toolResults.find(r=> r.tool==="Network Engine")?.data;
    if (net?.root) return `ผัง ${net.root.memberCode} — ${net.root.firstName} ${net.root.lastName} • สายตรง ${net.children?.length ?? net.placements ?? 0} คน`;
    if (net?.mode==="sample") return `ตัวอย่างผัง ${net.nodes?.length ?? 0} โหนด — พิมพ์รหัสสมาชิกเพื่อดูผังเฉพาะคน`;
    return `ผัง 1 แตก 5 — พิมพ์รหัสสมาชิก (เช่น M-000123) เพื่อดู`;
  }
  if (/ใบเสร็จ|receipt/i.test(q)) {
    const rc = toolResults.find(r=> r.tool==="Receipt Validation")?.data;
    if (rc?.count !== undefined) return `ใบเสร็จ ${rc.count} รายการล่าสุด — แนบไฟล์เพื่อตรวจ OCR/ซ้ำ`;
    return `แนบไฟล์ใบเสร็จเพื่อตรวจ (รองรับ PDF/รูป)`;
  }
  if (hasDataset) return `${rows} รายการ — บอกได้เลย: สรุป / เทียบ / หาค่าสูงสุด / คำนวณ`;
  const hits = toolResults.find(r=> r.tool==="Database Search")?.data?.hits;
  if (hits?.length) return `พบ ${hits.length} รายการ:\n${hits.slice(0,5).map((h:any)=> `• ${h.type}: ${h.firstName ?? h.name ?? h.email ?? h.memberCode ?? JSON.stringify(h).slice(0,60)}`).join("\n")}`;
  if (intent==="CALCULATE" && /\d/.test(q)) return `ไม่พบนิพจน์คำนวณที่ชัด — พิมพ์เช่น 1234*56 หรือ 15000+2500`;
  if (!q.trim()) return `พิมพ์คำถามหรือวางข้อมูลได้เลย`;

  // Hermes fallback: ตอบให้ตรงคำถาม ไม่วนลูป "รับทราบ"
  const ql = q.toLowerCase();
  if (/ai\s*คือ.*อะไร|คือ.*ai|what.*is.*ai/i.test(q)) {
    return `AI คือระบบอัจฉริยะที่ช่วยค้นหา วิเคราะห์ คำนวณ และจัดการข้อมูลเครือข่าย 1 แตก 5\n\n• พิมพ์คำถาม เช่น "สรุปยอดเดือนนี้" / "ดูผัง M-000123" / "คำนวณ 15000*12%"\n• วางตาราง/CSV แล้วบอก "วิเคราะห์" หรือ "สรุป"\n• แนบไฟล์ใบเสร็จเพื่อตรวจ OCR`;
  }
  if (/เขียน.*โค้ด|เขียน.*โปรแกรม|code|สร้าง.*ฟังก์ชัน/i.test(q)) {
    // ถ้าถามเขียนโค้ดทั่วไป — ให้ตัวอย่างตามที่ขอ หรือถามเพิ่ม
    if (/กล่อง.*รับ.*ข้อมูล|input.*box|ช่อง.*กรอก/i.test(q)) {
      return `กล่องรับข้อมูล (React + Tailwind) — ก็อปไปใช้ได้เลย:\n\n\`\`\`tsx
<input
  type="text"
  placeholder="พิมพ์ที่นี่..."
  className="w-full px-4 py-3 rounded-2xl border border-blue-100 bg-white focus:outline-none focus:border-sky-300 focus:ring-2 focus:ring-sky-100"
  onChange={e => console.log(e.target.value)}
/>
\`\`\`\n\nบอกได้เลยว่าอยากได้แบบไหน: ช่องค้นหา / ฟอร์มหลายช่อง / กล่องแชต`;
    }
    return `บอกได้เลยว่าอยากให้เขียนโค้ดอะไร เช่น "กล่องรับข้อมูล", "ตาราง", "กราฟ" — จะส่งโค้ดพร้อมก็อปให้ทันที`;
  }
  if (/สวัสดี|หวัดดี|hello|hi\b/i.test(ql)) return `สวัสดีครับ 👋 — ถามได้เลย เช่น "AI คืออะไร" / "คำนวณ 1234*56" / วางข้อมูลแล้วบอก "วิเคราะห์"`;
  if (/อาว|อ้าว|ห๊ะ|งง/i.test(ql)) return `ว่าไงครับ 😊 — พิมพ์คำถามมาได้เลย หรือวางข้อมูลแล้วบอกว่าอยากให้ทำอะไร`;
  if (ql.length <= 8) return `"${q}" — หมายถึงอะไรครับ? ลองพิมพ์เต็มๆ เช่น "สรุปยอด" / "ค้นหา M-000123" / "คำนวณ 100*5"`;
  // default: ไม่วนลูป — ตอบสั้น ตรง
  return `"${q.slice(0,80)}" — บอกเพิ่มนิดนึงว่าต้องการอะไร เช่น ค้นหา / วิเคราะห์ / คำนวณ / เขียนโค้ด`;
}
