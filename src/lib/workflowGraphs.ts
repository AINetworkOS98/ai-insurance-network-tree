/**
 * workflowGraphs — โมเดลกราฟของเวิร์กโฟลว์ n8n "ทั้งหมด" สำหรับฉาก 3D
 *
 * ● ข้อมูลมาจาก public/n8n/workflows.json ซึ่ง export จากฐานข้อมูล n8n จริง (workflow_entity)
 *   — เก็บเฉพาะชื่อโหนด/ชนิดโหนด/พิกัด/เส้นเชื่อม และ "ไม่เก็บพารามิเตอร์ของโหนด"
 *   ⇒ ไม่มีคีย์ API, URL ลับ หรือข้อมูลส่วนบุคคลติดออกมาจากระบบ n8n
 * ● ใช้ทั้งหน้า /n8n/workflow-3d (ฉาก 3D) — อ่านอย่างเดียว ไม่เรียก n8n และไม่เขียนข้อมูล
 */

export type WfNode = {
  name: string;
  type: string;
  disabled: boolean;
  x: number;
  y: number;
  cred: boolean;
};

export type WfEdge = { from: string; to: string; out: number };

export type WorkflowGraph = {
  id: string;
  name: string;
  active: boolean;
  updatedAt?: string;
  nodes: WfNode[];
  edges: WfEdge[];
};

export type WorkflowPayload = {
  generatedAt: string;
  count: number;
  workflows: WorkflowGraph[];
};

/* ───────────────────────── หมวดของโหนด (สี/ความหมาย) ───────────────────────── */

export type CategoryKey =
  | 'trigger'
  | 'http'
  | 'code'
  | 'ai'
  | 'data'
  | 'notify'
  | 'logic'
  | 'file'
  | 'note'
  | 'other';

export type Category = { key: CategoryKey; label: string; short: string; color: string; icon: string };

export const CATEGORIES: Record<CategoryKey, Category> = {
  trigger: { key: 'trigger', label: 'ตัวเริ่มงาน (Trigger)', short: 'Trigger', color: '#f59e0b', icon: '⚡' },
  http: { key: 'http', label: 'เรียก API ภายนอก (HTTP)', short: 'HTTP', color: '#38bdf8', icon: '🌐' },
  code: { key: 'code', label: 'โค้ด/แปลงข้อมูล (Code)', short: 'Code', color: '#a78bfa', icon: '🔧' },
  ai: { key: 'ai', label: 'AI / LangChain', short: 'AI', color: '#f472b6', icon: '🧠' },
  data: { key: 'data', label: 'ฐานข้อมูล/ชีต', short: 'Data', color: '#34d399', icon: '🗄️' },
  notify: { key: 'notify', label: 'แจ้งเตือน/อีเมล', short: 'Notify', color: '#22d3ee', icon: '✉️' },
  logic: { key: 'logic', label: 'เงื่อนไข/จัดเส้นทาง', short: 'Logic', color: '#818cf8', icon: '🔀' },
  file: { key: 'file', label: 'ไฟล์/ไดรฟ์', short: 'File', color: '#2dd4bf', icon: '📁' },
  note: { key: 'note', label: 'บันทึกในผัง (Sticky Note)', short: 'Note', color: '#64748b', icon: '📝' },
  other: { key: 'other', label: 'อื่น ๆ', short: 'Other', color: '#94a3b8', icon: '⚙️' },
};

const MATCH: Array<[CategoryKey, RegExp]> = [
  ['note', /stickyNote|sticky/i],
  ['trigger', /trigger|webhook|cron|schedule|interval/i],
  ['ai', /^ai:|langchain|openai|anthropic|gemini|chain|agent|lmChat|tool|memory|vector/i],
  ['http', /httpRequest|graphql|grpc/i],
  ['data', /postgres|mysql|mongo|supabase|redis|airtable|googleSheets|spreadsheet|sqlite|snowflake|baserow/i],
  ['notify', /gmail|email|smtp|telegram|slack|discord|twilio|whatsapp|line|sms|pushover|mattermost|sendmail/i],
  ['file', /readWriteFile|googleDrive|dropbox|s3|ftp|box|oneDrive|file/i],
  ['code', /^code$|function|functionItem|executeWorkflow|httpRequestTool/i],
  ['logic', /if$|switch$|merge|filter|splitInBatches|set$|noOp|wait|itemLists|compareDatasets|sort|limit|removeDuplicates|aggregate|summarize|renameKeys|stopAndError|respondToWebhook/i],
];

/** แปลงชนิดโหนด n8n → หมวด + สี */
export function categoryOf(type: string): Category {
  for (const [k, re] of MATCH) if (re.test(type)) return CATEGORIES[k];
  return CATEGORIES.other;
}

/** ชื่อโหนดแบบอ่านง่าย (ตัด prefix ของแพ็กเกจออก) */
export function prettyType(type: string): string {
  return type
    .replace(/^ai:/, 'AI · ')
    .replace(/^n8n-nodes-[\w-]+\./, '')
    .replace(/^n8n-nodes-base\./, '')
    .replace(/^@n8n\/n8n-nodes-langchain\./, 'AI · ');
}

/* ───────────────────────── จัดกลุ่มเวิร์กโฟลว์ ───────────────────────── */

export type Family = { key: string; label: string; icon: string; color: string };

const FAMILIES: Array<[string, RegExp, string, string, string]> = [
  ['lead', /^(0?\d+ )?(Visitor Tracking|Lead Registration|Behavior Analyzer|Video Recommendation|Follow-up|Lead Escalation)/i, 'ระบบลีด 01–06', '🎯', '#38bdf8'],
  ['tiktok', /^TikTok Lead/i, 'TikTok Lead', '🎵', '#f472b6'],
  ['autopilot', /^1×5 Autopilot|^1x5 Autopilot/i, '1×5 Autopilot', '🧬', '#a78bfa'],
  ['netsim', /^Network Sim/i, 'Network Simulator', '🧪', '#f59e0b'],
  ['passive', /^Passive Income/i, 'Passive Income 01–11', '💰', '#34d399'],
  ['member', /^Member Interest/i, 'Member Interest', '👥', '#22d3ee'],
  ['core', /Registration Outbox|Hostinger|Vercel/i, 'งานระบบหลัก/ตามเวลา', '⚙️', '#94a3b8'],
];

export function familyOf(name: string): Family {
  for (const [key, re, label, icon, color] of FAMILIES) {
    if (re.test(name.trim())) return { key, label, icon, color };
  }
  return { key: 'other', label: 'อื่น ๆ / เทมเพลตตัวอย่าง', icon: '📦', color: '#64748b' };
}

/* ───────────────────────── เลย์เอาต์ 3 มิติ ───────────────────────── */

export type Layout = {
  /** ตำแหน่ง 3 มิติของแต่ละโหนด (เรียงตาม idx ของ nodes) */
  pos: Array<[number, number, number]>;
  /** ชั้นความลึก (จำนวนก้าวจากโหนดเริ่มต้น) ของแต่ละโหนด */
  depth: number[];
  radius: number;
  /** ศูนย์กลางของผัง (พิกัดดิบของ n8n) */
  center: [number, number];
  span: [number, number];
};

/**
 * แปลงพิกัด 2 มิติของ n8n (x, y) เป็นฉาก 3 มิติ:
 * ● แกน x/y ตามผังจริง (y กลับด้านเพราะ n8n วัดจากบนลงล่าง)
 * ● แกน z = ชั้นการไหลของงาน (คำนวณด้วย BFS จากโหนดเริ่มต้น) → เห็น "ความลึกของกระบวนการ"
 */
export function computeLayout(wf: WorkflowGraph): Layout {
  const n = wf.nodes.length;
  if (!n) return { pos: [], depth: [], radius: 20, center: [0, 0], span: [1, 1] };

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const nd of wf.nodes) {
    if (!Number.isFinite(nd.x) || !Number.isFinite(nd.y)) continue;
    minX = Math.min(minX, nd.x); maxX = Math.max(maxX, nd.x);
    minY = Math.min(minY, nd.y); maxY = Math.max(maxY, nd.y);
  }
  if (!Number.isFinite(minX)) { minX = 0; maxX = 0; minY = 0; maxY = 0; }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const spanX = Math.max(1, maxX - minX);
  const spanY = Math.max(1, maxY - minY);
  const S = 30 / Math.max(spanX, spanY); // ย่อ/ขยายให้พอดีกรอบ ~30 หน่วย

  const index = new Map<string, number>();
  wf.nodes.forEach((nd, i) => index.set(nd.name, i));

  // ชั้นความลึก: BFS จากโหนดที่ไม่มีเส้นเข้า (root)
  const indeg = new Array(n).fill(0);
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const e of wf.edges) {
    const a = index.get(e.from); const b = index.get(e.to);
    if (a == null || b == null) continue;
    adj[a].push(b);
    indeg[b] += 1;
  }
  const depth = new Array(n).fill(-1);
  const queue: number[] = [];
  for (let i = 0; i < n; i++) if (indeg[i] === 0) { depth[i] = 0; queue.push(i); }
  if (!queue.length) { depth[0] = 0; queue.push(0); }
  for (let h = 0; h < queue.length; h++) {
    const a = queue[h];
    for (const b of adj[a]) {
      if (depth[b] === -1) { depth[b] = depth[a] + 1; queue.push(b); }
    }
  }
  for (let i = 0; i < n; i++) if (depth[i] === -1) depth[i] = 0; // วงวน/กลุ่มแยก → ชั้น 0
  const maxDepth = Math.max(...depth);
  const Z_STEP = maxDepth > 6 ? 4.2 : 6.5;

  const pos: Array<[number, number, number]> = wf.nodes.map((nd, i) => {
    const x = (nd.x - cx) * S;
    const y = -(nd.y - cy) * S;
    const z = (depth[i] - maxDepth / 2) * Z_STEP;
    return [x, y, z];
  });

  let radius = 0;
  for (const p of pos) radius = Math.max(radius, Math.hypot(p[0], p[1], p[2]));

  return { pos, depth, radius, center: [cx, cy], span: [spanX, spanY] };
}

/** สรุปเวิร์กโฟลว์เป็นข้อความล้วน (ให้สมาชิกคัดลอกไปสร้างระบบของตัวเอง) */
export function workflowPlainText(wf: WorkflowGraph): string {
  const byName = new Map(wf.nodes.map((n) => [n.name, n]));
  const lines: string[] = [
    `เวิร์กโฟลว์: ${wf.name}`,
    `สถานะ: ${wf.active ? 'เปิดใช้งานอยู่' : 'ปิดอยู่'} · โหนด ${wf.nodes.length} · เส้นเชื่อม ${wf.edges.length}`,
    '',
    'ลำดับโหนด:',
  ];
  wf.nodes.forEach((n, i) => {
    const c = categoryOf(n.type);
    lines.push(`${String(i + 1).padStart(2, '0')}. ${n.name} — ${prettyType(n.type)} [${c.short}]${n.disabled ? ' (ปิดโหนดนี้)' : ''}`);
  });
  lines.push('', 'เส้นทางการไหล:');
  for (const e of wf.edges) {
    const a = byName.get(e.from); const b = byName.get(e.to);
    lines.push(`• ${a ? a.name : e.from} → ${b ? b.name : e.to}`);
  }
  return lines.join('\n');
}

/** ดึงข้อมูลเวิร์กโฟลว์ทั้งหมด (ไฟล์นิ่งใน public/n8n/workflows.json) */
export async function loadWorkflows(): Promise<WorkflowPayload> {
  const r = await fetch('/n8n/workflows.json', { cache: 'force-cache' });
  if (!r.ok) throw new Error(`อ่านข้อมูลเวิร์กโฟลว์ไม่สำเร็จ (${r.status})`);
  return (await r.json()) as WorkflowPayload;
}
