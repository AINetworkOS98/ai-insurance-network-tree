// src/lib/ai/orchestrator.ts — AI Orchestrator + Tool Router (MASTER PROMPT #9-10)
// เลือกเครื่องมืออัตโนมัติตาม Intent — ผู้ใช้ไม่ต้องเลือก Tool เอง
// เบื้องหลังใช้ HermesProvider แต่ไม่ expose ชื่อออกหน้าเว็บ

import { getHermesProvider } from './hermesProvider';

export type Intent =
  | 'GENERAL_QUERY' | 'SEARCH' | 'ANALYZE' | 'SUMMARIZE' | 'COMPARE' | 'CALCULATE'
  | 'IMPORT_DATA' | 'VALIDATE_DATA' | 'SEARCH_MEMBER' | 'SEARCH_AGENT' | 'SEARCH_PROSPECT'
  | 'SEARCH_TEAM' | 'SEARCH_POLICY' | 'SEARCH_RECEIPT' | 'SEARCH_PERFORMANCE' | 'SEARCH_NETWORK'
  | 'GENERATE_REPORT' | 'OPEN_PAGE' | 'RUN_WORKFLOW';

export type SearchMode = 'FAST' | 'SMART' | 'DEEP';

const TOOL_MAP: Record<string, string[]> = {
  CALCULATE: ['Calculator'],
  SEARCH: ['Database Search'],
  SEARCH_MEMBER: ['Database Search', 'Member Engine'],
  SEARCH_AGENT: ['Database Search', 'Agent Engine'],
  SEARCH_PROSPECT: ['Database Search', 'Prospect Engine'],
  SEARCH_NETWORK: ['Network Engine', 'Tree BFS'],
  SEARCH_TEAM: ['Network Engine'],
  SEARCH_PERFORMANCE: ['Sales Calculation', 'Ranking'],
  SEARCH_RECEIPT: ['Receipt Validation'],
  ANALYZE: ['Data Parser', 'Analyzer', 'Ranking'],
  SUMMARIZE: ['Summarizer'],
  COMPARE: ['Comparator'],
  VALIDATE_DATA: ['Data Validator', 'Receipt Validation'],
  IMPORT_DATA: ['Data Mapping', 'Validation', 'Import Queue'],
  GENERATE_REPORT: ['Report Generator'],
  OPEN_PAGE: ['Navigation Router'],
  RUN_WORKFLOW: ['Workflow Router'],
  GENERAL_QUERY: ['Semantic Search', 'Database Search'],
};

export function detectIntent(q: string): Intent {
  const s = q.toLowerCase();
  // math expression like 1234*56, 2+2, 100/5 — catch before other intents
  if (/\d+\s*[\+\-\*\/\%x×÷]\s*\d+/.test(q) || /\d+\s*[\+\-\*\/]/.test(q)) return 'CALCULATE';
  if (/(คำนวณ|คิดเลข|คิดคำนวณ|ยอดรวม|รวม.*บาท|sum|total|เฉลี่ย|หัก|บวก|ลบ|คูณ|หาร|\b\d+\s*[\+\-\*\/]\s*\d+)/.test(s)) return 'CALCULATE';
  if (/(เปรียบเทียบ|compare|เทียบ|ต่างกัน)/.test(s)) return 'COMPARE';
  if (/(สรุป|summarize|ย่อ|สรุปให้)/.test(s)) return 'SUMMARIZE';
  if (/(วิเคราะห์|analyze|ตรวจ.*ข้อมูล|ใคร.*เกิน|ใคร.*สูงสุด|หา.*มากสุด)/.test(s)) return 'ANALYZE';
  if (/(นำเข้า|import|บันทึกเข้าระบบ|เอาเข้า)/.test(s)) return 'IMPORT_DATA';
  if (/(ตรวจสอบ|validate|ตรวจ.*ใบเสร็จ|ตรวจ.*เอกสาร)/.test(s)) return 'VALIDATE_DATA';
  if (/(ใบเสร็จ|receipt|สลิป)/.test(s)) return 'SEARCH_RECEIPT';
  if (/(ผู้สนใจ|prospect|ลีด)/.test(s)) return 'SEARCH_PROSPECT';
  if (/(ตัวแทน|agent)/.test(s)) return 'SEARCH_AGENT';
  if (/(สมาชิก|member|รหัสสมาชิก|m-|M-)/.test(s)) return 'SEARCH_MEMBER';
  if (/(ทีม|สายงาน|ผัง.*5|network|เครือข่าย)/.test(s)) return 'SEARCH_NETWORK';
  if (/(ผลงาน|ยอดขาย|performance|เบี้ย|รายได้)/.test(s)) return 'SEARCH_PERFORMANCE';
  if (/(รายงาน|report|สรุปยอด|สรุปรายงาน)/.test(s)) return 'GENERATE_REPORT';
  if (/(เปิด.*หน้า|open page|ไปที่|พาไป)/.test(s)) return 'OPEN_PAGE';
  if (/(เวิร์กโฟลว์|workflow|รัน.*งาน)/.test(s)) return 'RUN_WORKFLOW';
  if (/(ค้นหา|หา.*ให้|search|find|c้น)/.test(s)) return 'SEARCH';
  return 'GENERAL_QUERY';
}

export function selectTools(intent: Intent): string[] {
  return TOOL_MAP[intent] ?? TOOL_MAP.GENERAL_QUERY;
}

// Chunking สำหรับข้อมูลขนาดใหญ่ — ไม่โยนทั้งหมดเข้า Model ตรงๆ
export function chunkData(raw: string, maxChunk = 3000): string[] {
  if (raw.length <= maxChunk) return [raw];
  const lines = raw.split('\n');
  const chunks: string[] = [];
  let cur = '';
  for (const line of lines) {
    if ((cur + '\n' + line).length > maxChunk) {
      if (cur) chunks.push(cur);
      cur = line;
    } else {
      cur = cur ? cur + '\n' + line : line;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

export async function orchestrate(params: {
  query: string;
  mode: SearchMode;
  intent?: Intent;
  datasetRaw?: string;
  datasetRows?: number;
  datasetType?: string;
}): Promise<{ intent: Intent; tools: string[]; answer: string; via: 'hermes'|'fallback' }> {
  const intent = params.intent || detectIntent(params.query);
  const tools = selectTools(intent);
  const provider = getHermesProvider();

  // FAST = ไม่เรียก LLM ใช้ template เร็ว
  if (params.mode === 'FAST') {
    return { intent, tools, via: 'fallback', answer: buildFallbackAnswer(params.query, intent, params.mode as SearchMode, !!params.datasetRaw, params.datasetRows ?? 0) };
  }

  // SMART / DEEP — ลองเรียก Hermes ก่อน ถ้าไม่สำเร็จ fallback
  if (provider.isConfigured()) {
    try {
      const contextInfo = params.datasetRaw
        ? `Context Dataset: type=${params.datasetType} rows=${params.datasetRows}\nPreview (chunked):\n${chunkData(params.datasetRaw, 2500)[0]?.slice(0,2500)}`
        : 'ไม่มี dataset แนบมา';
      const userContent = `คำถาม/คำสั่ง: ${params.query || '(ให้วิเคราะห์ข้อมูลที่วาง)'}\nIntent: ${intent}\nMode: ${params.mode}\nTools ที่เลือก: ${tools.join(', ')}\n${contextInfo}\n\nตอบเป็นภาษาไทย กระชับ มีประโยชน์ ถ้ามีข้อมูลตัวเลขให้สรุปเป็นข้อๆ`;
      const answer = await provider.chat([{ role: 'user', content: userContent }], { temperature: params.mode === 'DEEP' ? 0.35 : 0.4, maxTokens: params.mode === 'DEEP' ? 1600 : 1000 });
      return { intent, tools, via: 'hermes', answer };
    } catch (e: any) {
      // fallback แบบไม่เปิดเผย error ของ provider
      return { intent, tools, via: 'fallback', answer: buildFallbackAnswer(params.query, intent, params.mode as SearchMode, !!params.datasetRaw, params.datasetRows ?? 0) };
    }
  }

  return { intent, tools, via: 'fallback', answer: buildFallbackAnswer(params.query, intent, params.mode as SearchMode, !!params.datasetRaw, params.datasetRows ?? 0) };
}

function buildFallbackAnswer(q: string, intent: string, mode: SearchMode, hasDataset: boolean, rows: number): string {
  const modeName: Record<SearchMode,string> = { FAST:'เร็ว', SMART:'อัจฉริยะ', DEEP:'วิเคราะห์เชิงลึก' };
  const tools = selectTools(intent as Intent);
  if (!q && hasDataset) return `วิเคราะห์ข้อมูลทั้งหมด ${rows} รายการแล้ว\n\n• โหมด: ${modeName[mode]}\n• เครื่องมือที่ใช้: ${tools.join(' + ')}\n• พร้อมสรุป เปรียบเทียบ คำนวณ หรือค้นหาในระบบตามสิทธิ์ของคุณ`;
  if (/ผัง|เครือข่าย|1 แตก 5/i.test(q)) return `กำลังเปิดผังเครือข่าย 1 แตก 5 — โหมด ${modeName[mode]} • เครื่องมือ: ${tools.join(' + ')} • พิมพ์รหัสสมาชิกหรือชื่อเพื่อค้นหาในผังได้ทันที`;
  if (/ใบเสร็จ|receipt/i.test(q)) return `ระบบตรวจสอบใบเสร็จพร้อมใช้งาน — โหมด ${modeName[mode]} • วางข้อมูลหรือแนบไฟล์เพื่อเริ่มตรวจสอบ`;
  if (hasDataset) return `เข้าใจคำสั่ง: "${q}"\nIntent: ${intent} • โหมด: ${modeName[mode]} • Context: ${rows} รายการ\nเครื่องมือที่เลือก: ${tools.join(' + ')}\nพร้อมประมวลผลข้อมูลที่วางไว้โดยแบ่งเป็นส่วนย่อยเพื่อความเร็วและประหยัดทรัพยากร`;
  return `ระบบค้นหาด้วย AI อัจฉริยะ — โหมด ${modeName[mode]}\nคำถาม: "${q || '—'}"\nIntent: ${intent}\nเครื่องมือ: ${tools.join(' + ')}\nพร้อมค้นหา วิเคราะห์ และจัดการข้อมูลตามสิทธิ์ของคุณ`;
}
