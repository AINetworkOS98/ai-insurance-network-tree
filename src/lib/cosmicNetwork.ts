/**
 * cosmicNetwork — โมเดลเครือข่าย "1 แตก 5" สำหรับภาพจักรวาลเครือข่าย 3 มิติ
 *
 * ● ข้อมูลทั้งหมดในไฟล์นี้เป็น **ข้อมูลจำลองเพื่อสาธิตโครงสร้างเครือข่าย** เท่านั้น
 *   ไม่ใช่ข้อมูลสมาชิกจริง และไม่สื่อถึงรายได้ ค่าคอมมิชชั่น ผลตอบแทน หรือผลลัพธ์ใด ๆ
 * ● ตำแหน่งทุกโหนดเป็น deterministic (คำนวณจาก seed + ดัชนีลูก) จึงไม่กระโดดเมื่อ re-render
 * ● ไฟล์นี้ไม่มี dependency กับ three.js / React — ใช้ได้ทั้งฝั่ง client และการทดสอบ
 */

export type Rng = () => number;

/** PRNG แบบ deterministic (mulberry32) — ใช้ให้ตำแหน่ง/ชื่อคงที่ทุกครั้งที่โหลด */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Vec3 = [number, number, number];

export type CosmicNode = {
  id: number;
  code: string;
  name: string;
  level: number;
  parentId: number | null;
  childIds: number[];
  childCount: number;
  /** จำนวนสมาชิกทั้งหมดในสายใต้โหนดนี้ (รวมตัวเอง) */
  subtreeSize: number;
  /** ความลึกของสายใต้โหนดนี้ (ชั้น) */
  depthBelow: number;
  position: Vec3;
  /** ทิศทางการเติบโต (ใช้คำนวณตำแหน่งลูกแบบต่อเนื่อง) */
  dir: Vec3;
  size: number;
  phase: number;
  joinedAt: number;
  /** 0 = มีอยู่ตั้งแต่ฉากเริ่มต้น · > 0 = เพิ่มเข้ามาใหม่ (epoch ms) */
  bornAt: number;
};

export type CosmicEdge = {
  id: number;
  parentId: number;
  childId: number;
};

export type CosmicNetworkModel = {
  nodes: CosmicNode[];
  edges: CosmicEdge[];
  /** edgeOfChild[nodeId] = id ของเส้นที่เชื่อมจากพ่อแม่ · โหนดราก = -1 */
  edgeOfChild: number[];
  rootId: number;
  byLevel: number[];
  total: number;
  depth: number;
  /** true = ถูกตัดจำนวนเพื่อประสิทธิภาพ (แสดงไม่ครบ) */
  truncated: boolean;
  branchFactor: number;
};

/** รูปแบบของแต่ละชั้น: สี (0-255) · ขนาดทรงกลม (หน่วยโลก) · ความยาวเส้นไปยังชั้นถัดไป */
export type LevelStyle = { color: Vec3; size: number; edge: number };

export const LEVEL_STYLE: LevelStyle[] = [
  { color: [232, 251, 255], size: 4.6, edge: 15.0 }, // 0 · ROOT — ขาว-ฟ้า
  { color: [142, 240, 255], size: 2.0, edge: 11.0 }, // 1 · cyan
  { color: [87, 199, 255], size: 1.45, edge: 8.0 }, // 2 · electric blue
  { color: [123, 125, 255], size: 1.05, edge: 5.8 }, // 3 · deep indigo
  { color: [169, 123, 255], size: 0.85, edge: 4.4 }, // 4 · violet
  { color: [192, 132, 252], size: 0.78, edge: 3.6 }, // 5+ · ขยายไม่จำกัด
];

export function levelStyle(level: number): LevelStyle {
  return LEVEL_STYLE[Math.min(level, LEVEL_STYLE.length - 1)];
}

/** จำนวนโหนดสูงสุดที่สร้าง/แสดง (เกินกว่านี้ตัดเพื่อประสิทธิภาพ) */
export const MAX_NODES = 4000;
/** เพดานสายตรงต่อคน (แนวคิด 1 แตก 5) */
export const BRANCH_FACTOR = 5;

const BASE_JOIN_MS = Date.UTC(2025, 5, 1); // 2025-06-01
const DAY_MS = 86_400_000;

/** หน้าต่างเวลาการเข้าร่วมตามชั้น (วันนับจากฐาน) — ทำให้ไทม์ไลน์ดูสมเหตุสมผล */
const JOIN_WINDOW: Array<[number, number]> = [
  [0, 0], // 0
  [0, 40], // 1
  [45, 190], // 2
  [190, 330], // 3
  [330, 450], // 4
  [450, 520], // 5+
];

const FIRST_NAMES = [
  'มีว', 'ปอ', 'เบลล์', 'โอ๊ต', 'กัน', 'แนน', 'ตูน', 'บีม', 'ฟ้า', 'เจมส์',
  'มายด์', 'ปาล์ม', 'บาส', 'นัท', 'ออย', 'แพร', 'วิน', 'มิ้นท์', 'โฟร์', 'อาร์ม',
  'เจน', 'ภูมิ', 'ไอซ์', 'ตาล', 'ป๊อป', 'นุ่น', 'ก้อง', 'เอิร์ธ', 'สกาย', 'ใบเฟิร์น',
  'พีช', 'ไตเติ้ล', 'ออม', 'ข้าวหอม', 'น้ำ', 'เนย', 'หมี', 'เตย', 'จูน', 'พริม',
];
const LAST_INITIALS = ['ก.', 'จ.', 'ช.', 'ณ.', 'ด.', 'ท.', 'ธ.', 'น.', 'บ.', 'ป.', 'พ.', 'ภ.', 'ม.', 'ร.', 'ว.', 'ศ.', 'ส.', 'อ.'];

function normalized(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/** คำนวณทิศทางของลูกคนที่ i จาก k คน รอบทิศทางเติบโตของพ่อแม่ */
function childDirection(parentDir: Vec3, parentIsRoot: boolean, parentLevel: number, i: number, k: number, id: number): Vec3 {
  const pd = normalized(parentDir);
  const up: Vec3 = Math.abs(pd[1]) > 0.92 ? [1, 0, 0] : [0, 1, 0];
  const u = normalized(cross(pd, up));
  const v = cross(pd, u);
  const azim = i * GOLDEN_ANGLE + (id % 11) * 0.27;
  let polar: number;
  if (parentIsRoot) {
    // ราก: กระจายลูกให้ทั่วทรงกลม (ตามพื้นที่)
    polar = Math.acos(Math.max(-1, Math.min(1, 1 - (2 * (i + 0.5)) / k)));
  } else {
    const spread = parentLevel === 1 ? 1.18 : parentLevel === 2 ? 1.02 : 0.86;
    const t = k > 1 ? i / (k - 1) : 0.5;
    polar = spread * (t - 0.5) * 2;
  }
  const cp = Math.cos(polar);
  const sp = Math.sin(polar);
  return normalized([
    pd[0] * cp + (u[0] * Math.cos(azim) + v[0] * Math.sin(azim)) * sp,
    pd[1] * cp + (u[1] * Math.cos(azim) + v[1] * Math.sin(azim)) * sp,
    pd[2] * cp + (u[2] * Math.cos(azim) + v[2] * Math.sin(azim)) * sp,
  ]);
}

function makeChild(parent: CosmicNode, siblingsIndex: number, siblingsTotal: number, rng: Rng, bornAt: number): CosmicNode {
  const level = parent.level + 1;
  const style = levelStyle(level);
  const dir = childDirection(parent.dir, parent.parentId === null, parent.level, siblingsIndex, siblingsTotal, parent.id);
  const len = style.edge * (0.9 + rng() * 0.22);
  const position: Vec3 = [
    parent.position[0] + dir[0] * len,
    parent.position[1] + dir[1] * len,
    parent.position[2] + dir[2] * len,
  ];
  const win = JOIN_WINDOW[Math.min(level, JOIN_WINDOW.length - 1)];
  const joinedAt = bornAt > 0 ? bornAt : BASE_JOIN_MS + (win[0] + rng() * (win[1] - win[0])) * DAY_MS;
  const nm = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
  const ini = LAST_INITIALS[Math.floor(rng() * LAST_INITIALS.length)];
  return {
    id: -1, // เติมเมื่อ push
    code: '',
    name: `${nm} ${ini}`,
    level,
    parentId: parent.id,
    childIds: [],
    childCount: 0,
    subtreeSize: 1,
    depthBelow: 0,
    position,
    dir,
    size: style.size,
    phase: rng() * Math.PI * 2,
    joinedAt,
    bornAt: 0,
  };
}

function recomputeTotals(nodes: CosmicNode[]): void {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    let size = 1;
    let depth = 0;
    for (const c of n.childIds) {
      size += nodes[c].subtreeSize;
      depth = Math.max(depth, nodes[c].depthBelow + 1);
    }
    n.subtreeSize = size;
    n.depthBelow = depth;
  }
}

function refreshMeta(model: CosmicNetworkModel): void {
  const byLevel: number[] = [];
  for (const n of model.nodes) {
    byLevel[n.level] = (byLevel[n.level] ?? 0) + 1;
  }
  model.byLevel = byLevel;
  model.total = model.nodes.length;
  model.depth = model.nodes[model.rootId]?.depthBelow ?? 0;
}

/**
 * สร้างเครือข่ายเริ่มต้น (ค่าเริ่มต้น = ROOT → 5 → 25 → 125 → 625 = 781 โหนด)
 */
export function buildInitialNetwork(opts: { levels?: number; branch?: number; seed?: number; maxNodes?: number } = {}): CosmicNetworkModel {
  const levels = opts.levels ?? 4;
  const branch = opts.branch ?? BRANCH_FACTOR;
  const maxNodes = opts.maxNodes ?? MAX_NODES;
  const rng = mulberry32(opts.seed ?? 20261003);

  const root: CosmicNode = {
    id: 0,
    code: 'ROOT',
    name: 'AI INSURANCE NETWORK',
    level: 0,
    parentId: null,
    childIds: [],
    childCount: 0,
    subtreeSize: 1,
    depthBelow: 0,
    position: [0, 0, 0],
    dir: [0, 1, 0],
    size: LEVEL_STYLE[0].size,
    phase: 0,
    joinedAt: BASE_JOIN_MS,
    bornAt: 0,
  };

  const nodes: CosmicNode[] = [root];
  const edges: CosmicEdge[] = [];
  const edgeOfChild: number[] = [-1];
  let truncated = false;

  for (let cursor = 0; cursor < nodes.length; cursor++) {
    const parent = nodes[cursor];
    if (parent.level >= levels) continue;
    for (let i = 0; i < branch; i++) {
      if (nodes.length >= maxNodes) {
        truncated = true;
        break;
      }
      const child = makeChild(parent, i, branch, rng, 0);
      const id = nodes.length;
      child.id = id;
      child.code = `AIN-${String(id).padStart(4, '0')}`;
      nodes.push(child);
      parent.childIds.push(id);
      parent.childCount = parent.childIds.length;
      const eid = edges.length;
      edges.push({ id: eid, parentId: parent.id, childId: id });
      edgeOfChild.push(eid);
    }
    if (truncated) break;
  }

  recomputeTotals(nodes);
  const model: CosmicNetworkModel = { nodes, edges, edgeOfChild, rootId: 0, byLevel: [], total: nodes.length, depth: 0, truncated, branchFactor: branch };
  refreshMeta(model);
  return model;
}

/**
 * เพิ่มสมาชิกใหม่ใต้โหนดที่กำหนด (คืน model ใหม่ — ไม่แก้ของเดิม)
 * @returns null เมื่อพ่อแม่มีสายตรงครบ 5 คนแล้ว
 */
export function addChildNode(model: CosmicNetworkModel, parentId: number, nowMs: number): { model: CosmicNetworkModel; nodeId: number } | null {
  const parent = model.nodes[parentId];
  if (!parent) return null;
  if (parent.childCount >= model.branchFactor) return null;
  if (model.nodes.length >= MAX_NODES) return null;

  const rng = mulberry32(parentId * 7919 + parent.childCount * 104729 + 17);
  const nodes: CosmicNode[] = model.nodes.map((c) => (c.bornAt > 0 ? { ...c } : c));
  const edges = model.edges.slice();
  const edgeOfChild = model.edgeOfChild.slice();

  const p = { ...parent, childIds: parent.childIds.slice() };
  nodes[parentId] = p;
  const child = makeChild(p, p.childCount, model.branchFactor, rng, nowMs);
  const id = nodes.length;
  child.id = id;
  child.code = `AIN-${String(id).padStart(4, '0')}`;
  child.bornAt = nowMs;
  child.joinedAt = nowMs;
  nodes.push(child);
  p.childIds.push(id);
  p.childCount = p.childIds.length;

  const eid = edges.length;
  edges.push({ id: eid, parentId, childId: id });
  edgeOfChild.push(eid);

  // อัปเดตยอดรวมของสายที่อยู่เหนือขึ้นไป
  let walk: number | null = parentId;
  while (walk !== null) {
    const n: CosmicNode = nodes[walk];
    let size = 1;
    let depth = 0;
    for (const c of n.childIds) {
      size += nodes[c].subtreeSize;
      depth = Math.max(depth, nodes[c].depthBelow + 1);
    }
    n.subtreeSize = size;
    n.depthBelow = depth;
    walk = n.parentId;
  }

  const next: CosmicNetworkModel = { ...model, nodes, edges, edgeOfChild };
  refreshMeta(next);
  return { model: next, nodeId: id };
}

/** รหัสโหนดจากรากลงมาถึงโหนดนี้ (รวมโหนดปลายทาง) */
export function nodePath(model: CosmicNetworkModel, id: number): number[] {
  const out: number[] = [];
  let cur: number | null = id;
  let guard = 0;
  while (cur !== null && guard++ < 64) {
    out.push(cur);
    cur = model.nodes[cur]?.parentId ?? null;
  }
  return out.reverse();
}

/** รหัสเส้น (edge) ทั้งหมดบนเส้นทางจากรากถึงโหนดนี้ */
export function pathEdgeIds(model: CosmicNetworkModel, id: number): number[] {
  const ids: number[] = [];
  for (const nid of nodePath(model, id)) {
    const e = model.edgeOfChild[nid];
    if (e >= 0) ids.push(e);
  }
  return ids;
}

/** ค้นหาโหนดแบบกว้าง (ใช้กับช่องค้นหา / เลือกโหนดถัดไป) */
export function findNodeByCode(model: CosmicNetworkModel, code: string): CosmicNode | null {
  const q = code.trim().toUpperCase();
  if (!q) return null;
  return model.nodes.find((n) => n.code.toUpperCase() === q || n.name.toUpperCase().includes(q)) ?? null;
}

/** โหนดที่ยังเพิ่มลูกได้ (ใช้เป็นตัวเลือกในโหมดเพิ่มสมาชิก) */
export function availableParentIds(model: CosmicNetworkModel): number[] {
  return model.nodes.filter((n) => n.childCount < model.branchFactor).map((n) => n.id);
}

/** ตัวเลขสรุปสำหรับ HUD */
export function summarize(model: CosmicNetworkModel): { total: number; direct: number; depth: number; byLevel: number[] } {
  return { total: model.total, direct: model.edges.length, depth: model.depth, byLevel: model.byLevel };
}
