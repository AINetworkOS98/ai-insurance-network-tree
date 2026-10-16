'use client';

/**
 * Net1x5MemberLayers — แท็บ “สมาชิก 1 แตก 5” ของหน้า /network/1x5-autopilot (ข้อมูลจริงเท่านั้น)
 *
 * ● วาดผังผู้แนะนำ 1 → 5 “เป็นชั้น ๆ” แบบเดียวกับวีดีโอโปรโมตของระบบ (ชั้น 0 = ราก → ชั้น 1 = 5 ช่อง →
 *   ชั้น 2 = 25 · ชั้น 3 = 125) แต่ทุกโหนดคือ “สมาชิกจริงที่สมัครเข้ามา” ในตารางจริง
 *   (parentUserId + slot จาก TreePlacement) ไม่ใช่ตัวอย่าง ไม่มีการสุ่มตัวเลข
 * ● โหนดสมาชิกจริง = วงกลม + รูปคน + ป้าย “รหัส · ชื่อ” · ช่องที่ยังว่าง = วงเส้นประ (รอสมาชิกใหม่)
 *   · ชั้นลึกที่ยังไม่มีสมาชิก = จุดจาง ๆ ให้เห็นขนาดของผัง (capacity ของกติกา ไม่ใช่จำนวนสมาชิก)
 * ● เส้นเชื่อม = เส้นโค้งผู้แนะนำ → สมาชิกใหม่ พร้อม “แสงวิ่ง” ตามทิศทางการขยายสายงาน
 * ● ข้อมูลทั้งหมดมาจาก /api/net/1x5/state (อ่านเท่านั้น) · อัปเดตเองทุก 8 วินาที · ชื่อถูกเซิร์ฟเวอร์ปกปิดตาม PDPA
 * ● ตัวเลขทุกตัวประเมินสดจากฐานข้อมูล — สมาชิกที่ยังไม่ถูกจัดเข้าผังแสดงในส่วน “รอจัดเข้าช่องว่าง 1:5” ด้านล่าง
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

const REFRESH_MS = 8000;
const LAYER_Y = 200;      // ระยะห่างแนวตั้งระหว่างชั้น (หน่วยในกรอบ SVG)
const GUTTER = 250;       // คอลัมน์ซ้ายสำหรับป้ายชื่อชั้น
const MAX_NODES = 420;    // เพดานจำนวนโหนดที่วาด (กันผังใหญ่เกินจนเบราว์เซอร์หน่วง)
const W_MEMBER = 172;     // ความกว้างที่โหนดสมาชิกจริงจองในชั้น
const W_SLOT = 96;        // ช่องว่างที่ยังไม่มีสมาชิก (ชั้นตื้น)
const W_DOT = 50;         // ช่องว่างชั้นลึก (จุดจาง)

type Check = {
  userId: string;
  code: string;
  name: string;
  pass: boolean;
  pendingReview?: boolean;
  reasons?: string[];
  verifiedAmount?: number;
  promotionGap?: string;
};

type Member = {
  userId: string;
  code: string;
  name: string;
  rankLevel?: number;
  positionName?: string;
  status: string;
  isActive: boolean;
  inTree: boolean;
  nodeLevel?: number | null;
  level?: number;
  slot?: number | null;
  parentUserId?: string | null;
  joinDate?: string | null;
  childrenCount?: number;
  emptySlots?: number[];
  isTest?: boolean;
  isAdminAccount?: boolean;
  verifiedAmount?: number;
  receiptCount?: number;
  pendingReceipts?: number;
};

type Level = { level: number; count: number; capacity: number };

type State = {
  ok: boolean;
  canAdmin: boolean;
  period: string;
  now: string;
  summary: any;
  tree: { perLevel: Level[]; branchLimit: number; roots: any[] };
  members: Member[];
  checks: Check[];
  testAccounts?: number;
  disclaimer?: string;
  error?: string;
  message?: string;
};

type TNode = {
  key: string;
  depth: number;
  slot: number | null;
  m: Member | null;
  kind: 'member' | 'slot' | 'dot';
  w: number;
  x: number;
  y: number;
  parent: TNode | null;
  children: TNode[];
};

function th(n: any) {
  return Number(n || 0).toLocaleString('th-TH');
}
function thDate(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('th-TH', { day: '2-digit', month: 'short', year: 'numeric' });
}
function thDateTime(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('th-TH', { hour12: false });
}
function clip(s: string, n: number) {
  const t = String(s || '');
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

/** สี/สถานะของโหนด — มาจากผลประเมินจริง (checks[].pass / pendingReview) */
function nodeTone(m: Member, c: Check | null) {
  if (m.isAdminAccount) return { stroke: '#c8a84e', fill: 'rgba(200,168,78,0.10)', label: 'บัญชีผู้ดูแลระบบ', text: '#f2e3b0' };
  if (!m.isActive) return { stroke: '#fb7185', fill: 'rgba(251,113,133,0.10)', label: 'ปิดจุดในผัง', text: '#ffd6dd' };
  if (c?.pendingReview) return { stroke: '#78e6ff', fill: 'rgba(120,230,255,0.10)', label: 'รอตรวจใบเสร็จ', text: '#d8f6ff' };
  if (c?.pass) return { stroke: '#f2c15a', fill: 'rgba(242,193,90,0.14)', label: 'ผ่านเงื่อนไข', text: '#ffe9b8' };
  if (c && !c.pass) return { stroke: '#f59e0b', fill: 'rgba(245,158,11,0.10)', label: 'ไม่ผ่านเงื่อนไข', text: '#ffe0b0' };
  return { stroke: '#94a3b8', fill: 'rgba(148,163,184,0.10)', label: 'ยังไม่ประเมิน', text: '#e2e8f0' };
}

function Tile({ label, value, sub, tone }: { label: string; value: any; sub?: string; tone?: string }) {
  return (
    <div className={`rounded-2xl border px-3 py-2.5 ${tone || 'bg-white/5 border-sky-400/20'}`}>
      <div className="text-[11px] text-sky-200/70">{label}</div>
      <div className="text-lg font-bold text-sky-50 leading-tight tabular-nums">{value}</div>
      {sub && <div className="text-[11px] text-sky-200/60 mt-0.5 leading-snug">{sub}</div>}
    </div>
  );
}

export default function Net1x5MemberLayers() {
  const [state, setState] = useState<State | null>(null);
  const [err, setErr] = useState('');
  const [auto, setAuto] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [showSlots, setShowSlots] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/net/1x5/state', { credentials: 'include', cache: 'no-store' });
      const j = (await r.json()) as State;
      if (!j?.ok) { setErr(j?.message || j?.error || 'อ่านสถานะเครือข่ายไม่สำเร็จ'); return; }
      setState(j); setErr('');
    } catch {
      setErr('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — กำลังลองใหม่');
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [auto, load]);

  const members = useMemo(() => state?.members || [], [state]);
  const checks = useMemo(() => state?.checks || [], [state]);
  const perLevel = useMemo<Level[]>(() => state?.tree?.perLevel || [], [state]);
  const branchLimit = state?.tree?.branchLimit || 5;
  const summary = state?.summary || {};

  const checkByUser = useMemo(() => {
    const mp = new Map<string, Check>();
    for (const c of checks) mp.set(String(c.userId), c);
    return mp;
  }, [checks]);

  const inTree = useMemo(() => members.filter((m) => m.inTree), [members]);
  const outOfTree = useMemo(() => members.filter((m) => !m.inTree), [members]);

  /** ลูกของแต่ละคน แยกตามช่อง 1:5 จากค่าจริง parentUserId + slot */
  const childMap = useMemo(() => {
    const mp = new Map<string, Map<number, Member>>();
    for (const m of inTree) {
      if (!m.parentUserId || m.slot == null) continue;
      const k = String(m.parentUserId);
      if (!mp.has(k)) mp.set(k, new Map());
      mp.get(k)!.set(Number(m.slot), m);
    }
    return mp;
  }, [inTree]);

  /** ── สร้างผัง “เป็นชั้น ๆ”: สมาชิกจริง + ช่องว่างที่ต้องเติม (ไม่มีข้อมูลปลอม) ── */
  const tree = useMemo(() => {
    const byId = new Map(inTree.map((m) => [String(m.userId), m]));
    const isEmptyTree = inTree.length === 0;
    let count = 0;
    const mk = (m: Member | null, slot: number | null, depth: number, parent: TNode | null): TNode | null => {
      if (count >= MAX_NODES) return null;
      count += 1;
      const kind: TNode['kind'] = m ? 'member' : depth <= 1 ? 'slot' : 'dot';
      const node: TNode = {
        key: m ? String(m.userId) : `void-${depth}-${slot ?? 'x'}-${count}`,
        depth, slot, m, kind,
        w: kind === 'member' ? W_MEMBER : kind === 'slot' ? W_SLOT : W_DOT,
        x: 0, y: depth * LAYER_Y, parent, children: [],
      };
      if (m) {
        const kids = childMap.get(String(m.userId)) || new Map<number, Member>();
        for (let s = 1; s <= branchLimit; s++) {
          const c = kids.get(s);
          if (c) {
            const cn = mk(c, s, depth + 1, node);
            if (cn) node.children.push(cn);
          } else if (showSlots && depth + 1 <= 2) {
            const cn = mk(null, s, depth + 1, node);
            if (cn) node.children.push(cn);
          }
        }
      } else if (isEmptyTree && depth < 2) {
        // ผังยังว่าง: วาด “โครงสร้างตามกติกา” ชั้น 1 → 5 → 25 ให้เห็นขนาดจริงของแบบ 1 แตก 5
        for (let s = 1; s <= branchLimit; s++) {
          const cn = mk(null, s, depth + 1, node);
          if (cn) node.children.push(cn);
        }
      }
      return node;
    };

    const roots: TNode[] = [];
    if (isEmptyTree) {
      const root = mk(null, null, 0, null);
      if (root) roots.push(root);
    } else {
      for (const r of inTree) {
        const p = r.parentUserId ? byId.get(String(r.parentUserId)) : null;
        if (p) continue; // ไม่ใช่ราก — วาดผ่านพ่อแม่อยู่แล้ว
        const n = mk(r, r.slot ?? null, 0, null);
        if (n) roots.push(n);
      }
      // กันสมาชิกหายจากผัง: ถ้ามีพ่อแม่อยู่นอกผัง/ข้อมูลเป็นวงจร ให้ถือเป็นรากเพิ่ม
      const drawn = new Set<string>();
      const walkDrawn = (n: TNode) => { if (n.m) drawn.add(String(n.m.userId)); n.children.forEach(walkDrawn); };
      roots.forEach(walkDrawn);
      for (const r of inTree) {
        if (drawn.has(String(r.userId))) continue;
        const n = mk(r, r.slot ?? null, 0, null);
        if (n) roots.push(n);
      }
    }

    // จัดตำแหน่ง: ใบไม้เรียงซ้าย→ขวา · พ่อแม่กึ่งกลางลูก
    let cursor = 0;
    const place = (n: TNode) => {
      if (!n.children.length) { n.x = cursor + n.w / 2; cursor += n.w + 26; return; }
      n.children.forEach(place);
      const first = n.children[0].x, last = n.children[n.children.length - 1].x;
      n.x = (first + last) / 2;
    };
    roots.forEach(place);

    const all: TNode[] = [];
    const levelCount = new Map<number, number>();
    const walkAll = (n: TNode) => {
      all.push(n);
      if (n.m) levelCount.set(n.depth, (levelCount.get(n.depth) || 0) + 1);
      n.children.forEach(walkAll);
    };
    roots.forEach(walkAll);

    const width = Math.max(cursor, 400);
    const maxDepth = all.reduce((a, n) => Math.max(a, n.depth), 0);
    return { all, width, maxDepth, levelCount, truncated: count >= MAX_NODES };
  }, [inTree, childMap, branchLimit, showSlots]);

  const layers = useMemo(() => {
    const rows: { depth: number; real: number; capacity: number; vacant: number }[] = [];
    for (let d = 0; d <= tree.maxDepth; d++) {
      const real = tree.levelCount.get(d) || 0;
      const capacity = d === 0 ? 1 : Math.pow(branchLimit, d);
      rows.push({ depth: d, real, capacity, vacant: Math.max(0, capacity - real) });
    }
    return rows;
  }, [tree, branchLimit]);

  const selectedNode = useMemo(
    () => (selected ? tree.all.find((n) => n.key === selected && n.m) || null : null),
    [selected, tree],
  );
  const selectedCheck = selectedNode?.m ? checkByUser.get(String(selectedNode.m.userId)) || null : null;

  const viewW = tree.width + GUTTER + 140;
  const viewH = (tree.maxDepth + 1) * LAYER_Y + 260;
  const inTreeCount = inTree.length;
  const openSlots = inTree.reduce((a, m) => a + (m.emptySlots?.length || 0), 0);
  const realDepth = layers.filter((l) => l.real > 0).reduce((a, l) => Math.max(a, l.depth), 0);

  /** ป้ายใต้โหนด — ใช้ค่าจริง (รหัส/ชื่อที่เซิร์ฟเวอร์ปกปิดแล้ว/ตำแหน่ง) */
  function MemberLabel({ n }: { n: TNode }) {
    const m = n.m!;
    const c = checkByUser.get(String(m.userId)) || null;
    const tone = nodeTone(m, c);
    const line1 = `${m.code} · ${clip(m.name, 20)}`;
    const line2 = `${m.positionName ? clip(m.positionName, 14) : `ระดับ ${th(m.rankLevel)}`} · ชั้น ${n.depth}${n.slot ? ` · ช่อง ${n.slot}` : ''}`;
    const w = Math.max(Math.min(300, 22 + line1.length * 13.6), Math.min(300, 16 + line2.length * 9.4), 100);
    return (
      <g>
        <rect x={n.x - w / 2} y={n.y + 46} width={w} height={54} rx={16} fill="rgba(5,14,30,0.92)" stroke={`${tone.stroke}66`} strokeWidth={1.2} />
        <text x={n.x} y={n.y + 72} textAnchor="middle" fontSize={25} fontWeight={700} fill="#eff6ff">{clip(line1, 22)}</text>
        <text x={n.x} y={n.y + 94} textAnchor="middle" fontSize={18} fill="rgba(186,215,255,0.75)">{clip(line2, 34)}</text>
      </g>
    );
  }

  function PersonGlyph({ x, y, r, rgb }: { x: number; y: number; r: number; rgb: string }) {
    return (
      <g transform={`translate(${x},${y})`} fill={rgb}>
        <circle cy={-r * 0.32} r={r * 0.30} />
        <path d={`M ${-r * 0.52} ${r * 0.52} Q 0 ${-r * 0.20} ${r * 0.52} ${r * 0.52} Z`} />
      </g>
    );
  }

  function MemberNode({ n }: { n: TNode }) {
    const m = n.m!;
    const c = checkByUser.get(String(m.userId)) || null;
    const tone = nodeTone(m, c);
    const r = 34;
    const on = selected === n.key;
    const kids = childMap.get(String(m.userId));
    const filled = kids ? kids.size : 0;
    return (
      <g className="cursor-pointer" onClick={() => setSelected(on ? null : n.key)} style={{ opacity: m.isActive ? 1 : 0.72 }}>
        <title>{`${m.code} · ${m.name} — ${tone.label} · ช่อง 1:${branchLimit} ที่มีสมาชิก ${filled}/${branchLimit}`}</title>
        <circle cx={n.x} cy={n.y} r={r} fill={tone.fill} />
        <circle cx={n.x} cy={n.y} r={r} fill="#071427" stroke={tone.stroke} strokeWidth={on ? 5 : 3} />
        {on && <circle cx={n.x} cy={n.y} r={r + 11} fill="none" stroke="#ffe296" strokeWidth={2} strokeDasharray="6 6" />}
        <PersonGlyph x={n.x} y={n.y} r={r} rgb={tone.text} />
        {c?.pass ? <circle cx={n.x + r * 0.82} cy={n.y - r * 0.82} r={7} fill="#f2c15a" /> : null}
        {!m.isActive ? <circle cx={n.x + r * 0.82} cy={n.y - r * 0.82} r={7} fill="#fb7185" /> : null}
      </g>
    );
  }

  const edges: { d: string; key: string; real: boolean }[] = [];
  for (const n of tree.all) {
    for (const c of n.children) {
      const y1 = n.y + (n.kind === 'member' ? 36 : 24);
      const y2 = c.y - (c.kind === 'member' ? 40 : c.kind === 'slot' ? 26 : 12);
      edges.push({
        key: `${n.key}->${c.key}`,
        d: `M ${n.x} ${y1} C ${n.x} ${y1 + 74}, ${c.x} ${y2 - 74}, ${c.x} ${y2}`,
        real: n.kind === 'member' && c.kind === 'member',
      });
    }
  }

  return (
    <section className="min-h-screen bg-[#020617] text-sky-50">
      {/* pb-24: เว้นที่ให้แถบล่างติดจอ (VisitorCounter) — ไม่งั้นข้อความท้ายส่วนถูกบัง */}
      <div className="max-w-[1400px] mx-auto px-3 sm:px-5 pt-5 pb-24">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <div className="text-[11px] font-semibold tracking-wide text-sky-300/80">MEMBER 1×5 LAYERS · ข้อมูลจริงในฐานข้อมูล</div>
            <h2 className="text-xl sm:text-2xl font-bold leading-tight">👥 สมาชิก 1 แตก 5 — ผังผู้แนะนำเป็นชั้น ๆ (ชั้น 0 → ชั้น {Math.max(1, tree.maxDepth)})</h2>
            <p className="text-xs text-sky-200/70 mt-1 max-w-3xl leading-relaxed">
              ทุกโหนดคือสมาชิกจริงที่สมัครเข้ามาและถูกจัดเข้าผังแล้ว (สายผู้แนะนำ + ช่อง 1:{branchLimit} จากฐานข้อมูล) ·
              เส้นโค้ง = ผู้แนะนำ → สมาชิกใหม่ พร้อมแสงวิ่งตามทิศทางการขยาย · วงเส้นประ = ช่องว่างที่รอสมาชิกใหม่ ·
              ชั้นลึกที่ยังไม่มีสมาชิกแสดงเป็นจุดจาง ๆ ตามความจุกติกา (ชั้น 1 = {th(branchLimit)} · ชั้น 2 = {th(Math.pow(branchLimit, 2))} ·
              ชั้น 3 = {th(Math.pow(branchLimit, 3))}) · คลิกที่โหนดเพื่อดูข้อมูลสมาชิกคนนั้น · ตัวเลขทั้งหมดประเมินสดและอัปเดตเองทุก 8 วินาที
            </p>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-sky-200/80 shrink-0">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> อัปเดตอัตโนมัติทุก 8 วินาที
          </label>
        </div>

        {err && <div className="mt-3 rounded-xl border border-rose-400/40 bg-rose-500/10 text-rose-100 text-sm px-3 py-2">{err}</div>}

        <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          <Tile label="สมาชิกในผัง 1:5" value={th(inTreeCount)} sub={`ใช้งาน ${th(summary.active)} · ปิดจุด ${th(summary.nonActive)}${summary.outOfTree ? ` · นอกผัง ${th(summary.outOfTree)}` : ''}`} tone="bg-sky-500/10 border-sky-400/30" />
          <Tile label="ชั้นที่มีสมาชิกจริง" value={th(layers.filter((l) => l.real > 0).length)} sub={inTreeCount ? `ลึกสุด ชั้น ${realDepth}` : 'ยังไม่มีสมาชิกในผัง'} tone="bg-white/5 border-sky-400/20" />
          <Tile label="ช่อง 1:5 ที่ยังว่าง" value={th(summary.emptySlots ?? openSlots)} sub={`ตำแหน่งว่างที่รอเติม ${th(summary.vacancies)} ตำแหน่ง`} tone="bg-indigo-500/10 border-indigo-400/30" />
          <Tile label="ผ่านเงื่อนไข (แหวนทอง)" value={th(summary.passed)} sub="พร้อมขึ้นตำแหน่งตามกติกา" tone="bg-emerald-500/10 border-emerald-400/30" />
          <Tile label="ไม่ผ่านเงื่อนไข" value={th(summary.failed)} sub={`ต้องดำเนินการ ${th(summary.failedActionable)} · รอตรวจ ${th(summary.pendingReview)}`} tone="bg-amber-500/10 border-amber-400/30" />
          <Tile label="รอจัดเข้าผัง" value={th(outOfTree.length)} sub="สมัครแล้ว รอช่องว่างตามกติกา 1:5" tone="bg-white/5 border-sky-400/20" />
        </div>

        {/* ── แถบเครื่องมือ: ซูม / แสดงช่องว่าง / คำอธิบายสี ── */}
        <div className="mt-3 rounded-2xl border border-sky-400/20 bg-white/5 p-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-sky-200/80 font-semibold">มุมมองผัง</span>
          <button onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.25).toFixed(2)))} className="px-2.5 py-1 rounded-full border border-sky-400/30 bg-white/5">−</button>
          <span className="tabular-nums text-sky-100/90 w-14 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))} className="px-2.5 py-1 rounded-full border border-sky-400/30 bg-white/5">＋</button>
          <button onClick={() => setZoom(1)} className="px-2.5 py-1 rounded-full border border-sky-400/30 bg-white/5">พอดีจอ</button>
          <label className="flex items-center gap-1.5 ml-1">
            <input type="checkbox" checked={showSlots} onChange={(e) => setShowSlots(e.target.checked)} /> แสดงช่องว่างที่รอสมาชิกใหม่
          </label>
          <span className="mx-1 h-5 w-px bg-sky-400/20" />
          {[
            ['ผ่านเงื่อนไข', '#f2c15a'],
            ['รอตรวจใบเสร็จ', '#78e6ff'],
            ['ไม่ผ่านเงื่อนไข', '#f59e0b'],
            ['ปิดจุด/ระงับ', '#fb7185'],
            ['ยังไม่ประเมิน', '#94a3b8'],
          ].map(([label, color]) => (
            <span key={label} className="inline-flex items-center gap-1.5 text-sky-200/80">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: color }} />{label}
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5 text-sky-200/80">
            <span className="inline-block h-2.5 w-2.5 rounded-full border border-dashed border-[#c8a84e]" />ช่องว่าง 1:5
          </span>
        </div>

        {inTreeCount === 0 && (
          <div className="mt-3 rounded-2xl border border-[#c8a84e]/40 bg-[#c8a84e]/10 px-3 py-2 text-[11px] text-[#f2e3b0] leading-relaxed">
            🌱 ผังนี้ยังว่าง (ยังไม่มีสมาชิกถูกจัดเข้าผัง) — สิ่งที่เห็นคือ <b>โครงสร้างตามกติกา 1:{branchLimit}</b> ชั้น 1 = {th(branchLimit)} ช่อง ·
            ชั้น 2 = {th(Math.pow(branchLimit, 2))} · ชั้น 3 = {th(Math.pow(branchLimit, 3))} ตำแหน่ง (ยังไม่มีสมาชิกจริงในช่องใด) ·
            เมื่อสมาชิกสมัครและถูกอนุมัติเป็นตัวแทน วงจรอัตโนมัติจะจัดเข้าช่องว่างตามลำดับ แล้วชื่อสมาชิกจริงจะขึ้นในผังนี้ทันที
          </div>
        )}

        {/* ── ผังเป็นชั้น ๆ (SVG) ── */}
        <div className="mt-3 rounded-2xl border border-sky-400/20 bg-[#040b16] overflow-hidden">
          <div className="overflow-auto max-h-[78vh]">
            <svg viewBox={`${-GUTTER} -140 ${viewW} ${viewH}`} style={{ width: `${zoom * 100}%`, height: 'auto', minWidth: zoom >= 1 ? `${Math.round(Math.min(viewW, 6000) * 0.5)}px` : undefined }} role="img" aria-label="ผังสมาชิก 1 แตก 5 เป็นชั้น ๆ (ข้อมูลจริง)">
              <defs>
                <linearGradient id="n1x5Edge" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f2c15a" stopOpacity="0.85" />
                  <stop offset="100%" stopColor="#78e6ff" stopOpacity="0.5" />
                </linearGradient>
                <radialGradient id="n1x5Bg" cx="50%" cy="0%" r="80%">
                  <stop offset="0%" stopColor="#0b2138" />
                  <stop offset="100%" stopColor="#040b16" />
                </radialGradient>
              </defs>
              <rect x={-GUTTER} y={-140} width={viewW} height={viewH} fill="url(#n1x5Bg)" />

              {/* ชั้น (layer bands) + ป้ายชื่อชั้นด้านซ้าย */}
              {layers.map((l) => (
                <g key={`band-${l.depth}`}>
                  <rect x={-GUTTER} y={l.depth * LAYER_Y - LAYER_Y / 2} width={viewW} height={LAYER_Y} fill={l.depth % 2 ? 'rgba(255,255,255,0.018)' : 'rgba(255,255,255,0.038)'} />
                  <line x1={-GUTTER} y1={l.depth * LAYER_Y - LAYER_Y / 2} x2={viewW - GUTTER} y2={l.depth * LAYER_Y - LAYER_Y / 2} stroke="rgba(120,190,255,0.10)" strokeWidth={1} />
                  <text x={-GUTTER + 26} y={l.depth * LAYER_Y - 12} fontSize={30} fontWeight={700} fill="#dceeff">
                    {l.depth === 0 ? 'ชั้น 0 · ราก' : `ชั้น ${l.depth}`}
                  </text>
                  <text x={-GUTTER + 26} y={l.depth * LAYER_Y + 22} fontSize={22} fill="rgba(160,200,240,0.8)">
                    สมาชิกจริง {th(l.real)} / {th(l.capacity)}
                  </text>
                  <text x={-GUTTER + 26} y={l.depth * LAYER_Y + 48} fontSize={20} fill="rgba(160,200,240,0.55)">
                    {l.depth === 0 ? '1 ตำแหน่ง' : `${th(branchLimit)} ช่องต่อคน · ว่าง ${th(l.vacant)}`}
                  </text>
                </g>
              ))}

              {/* เส้นเชื่อมผู้แนะนำ → สมาชิก + แสงวิ่ง */}
              {edges.map((e) => (
                <g key={e.key}>
                  <path d={e.d} fill="none" stroke={e.real ? 'url(#n1x5Edge)' : 'rgba(120,190,255,0.35)'} strokeWidth={e.real ? 2.6 : 1.6} strokeDasharray={e.real ? undefined : '7 9'} />
                  {e.real && (
                    <>
                      <path d={e.d} fill="none" stroke="#ffe296" strokeWidth={3} strokeLinecap="round" strokeDasharray="14 96" opacity={0.9}>
                        <animate attributeName="stroke-dashoffset" values="0;-110" dur="2.6s" repeatCount="indefinite" />
                      </path>
                      <circle r={5} fill="#fff6d8">
                        <animateMotion dur="3.4s" repeatCount="indefinite" path={e.d} />
                      </circle>
                    </>
                  )}
                </g>
              ))}

              {/* โหนด */}
              {tree.all.map((n) => {
                if (n.m) {
                  return (
                    <g key={n.key}>
                      <MemberNode n={n} />
                      <MemberLabel n={n} />
                    </g>
                  );
                }
                if (n.kind === 'slot') {
                  return (
                    <g key={n.key}>
                      <title>{`ช่อง ${n.slot} · ชั้น ${n.depth} — ยังว่าง รอสมาชิกใหม่ที่สมัครเข้ามา`}</title>
                      <circle cx={n.x} cy={n.y} r={22} fill="rgba(200,168,78,0.06)" stroke="#c8a84e" strokeWidth={2} strokeDasharray="8 7" />
                      <text x={n.x} y={n.y + 7} textAnchor="middle" fontSize={18} fill="rgba(226,196,120,0.9)">ว่าง</text>
                      <text x={n.x} y={n.y + 48} textAnchor="middle" fontSize={17} fill="rgba(200,214,235,0.7)">ช่อง {n.slot}</text>
                    </g>
                  );
                }
                return <circle key={n.key} cx={n.x} cy={n.y} r={7} fill="rgba(150,214,255,0.35)" />;
              })}

              {tree.truncated && (
                <text x={-GUTTER + 26} y={viewH - 40} fontSize={24} fill="rgba(255,190,120,0.9)">
                  ⚠ แสดงบางส่วนเพื่อประสิทธิภาพ (เพดาน {th(MAX_NODES)} โหนด) — ตัวเลขบนการ์ดด้านบนยังเป็นค่าจริงทั้งหมด
                </text>
              )}
            </svg>
          </div>
          <div className="px-3 py-2 text-[11px] text-sky-200/70 border-t border-sky-400/15 flex flex-wrap gap-x-3 gap-y-1">
            <span>โหนดสมาชิกจริง: <b className="text-sky-100">{th(inTreeCount)}</b></span>
            <span>เส้นเชื่อมผู้แนะนำ: <b className="text-sky-100">{th(edges.length)}</b></span>
            <span>ช่องว่างที่วาด: <b className="text-sky-100">{th(tree.all.filter((n) => !n.m).length)}</b></span>
            <span>ชั้นที่วาด: <b className="text-sky-100">{th(tree.maxDepth + 1)}</b></span>
            <span className="text-sky-300/70">ผังเป็น “ชั้น ๆ” ตามกติกา 1:{branchLimit} · ชั้นถัดไปจะเปิดเมื่อชั้นบนเต็ม</span>
          </div>
        </div>

        {/* ── รายละเอียดสมาชิกที่คลิก + ช่อง 1:5 ของคนนั้น ── */}
        {selectedNode?.m && (
          <div className="mt-3 rounded-2xl border border-[#c8a84e]/40 bg-white/5 p-3">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="rounded-full bg-[#c8a84e] px-2.5 py-0.5 text-[11px] font-semibold text-[#3f3a2e]">สมาชิกที่เลือก</span>
              <span className="font-mono text-sky-100">{selectedNode.m.code}</span>
              <span className="font-semibold text-sky-50">{selectedNode.m.name}</span>
              <button onClick={() => setSelected(null)} className="ml-auto px-2.5 py-1 rounded-full border border-sky-400/30 bg-white/5">ปิด</button>
            </div>
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 text-[11px]">
              <div className="rounded-xl border border-sky-400/20 p-2"><div className="text-sky-200/70">ชั้น / ช่อง</div><div className="font-bold text-sky-50">ชั้น {selectedNode.depth}{selectedNode.slot ? ` · ช่อง ${selectedNode.slot}` : ' (ราก)'}</div></div>
              <div className="rounded-xl border border-sky-400/20 p-2"><div className="text-sky-200/70">ผู้แนะนำ (ชั้นบน)</div><div className="font-bold text-sky-50 truncate">{selectedNode.parent?.m ? `${selectedNode.parent.m.code} · ${selectedNode.parent.m.name}` : '— (รากของผัง)'}</div></div>
              <div className="rounded-xl border border-sky-400/20 p-2"><div className="text-sky-200/70">ตำแหน่ง / ระดับ</div><div className="font-bold text-sky-50">{selectedNode.m.positionName || '—'} · {th(selectedNode.m.rankLevel)}</div></div>
              <div className="rounded-xl border border-sky-400/20 p-2"><div className="text-sky-200/70">สถานะระบบ</div><div className="font-bold text-sky-50">{selectedNode.m.status}{selectedNode.m.isActive ? '' : ' · ปิดจุดในผัง'}</div></div>
              <div className="rounded-xl border border-sky-400/20 p-2"><div className="text-sky-200/70">วันสมัคร</div><div className="font-bold text-sky-50">{thDate(selectedNode.m.joinDate)}</div></div>
              <div className="rounded-xl border border-sky-400/20 p-2"><div className="text-sky-200/70">ยอดรับรอง / ใบเสร็จ</div><div className="font-bold text-sky-50">฿{th(selectedNode.m.verifiedAmount)} · {th(selectedNode.m.receiptCount)} ใบ{Number(selectedNode.m.pendingReceipts || 0) > 0 ? ` (รอตรวจ ${th(selectedNode.m.pendingReceipts)})` : ''}</div></div>
            </div>
            <div className="mt-2 text-[11px]">
              <span className={`rounded-full border px-2 py-0.5 ${selectedCheck?.pass ? 'border-emerald-400/40 bg-emerald-500/10 text-emerald-100' : selectedCheck?.pendingReview ? 'border-sky-400/40 bg-sky-500/10 text-sky-100' : 'border-amber-400/40 bg-amber-500/10 text-amber-100'}`}>
                {selectedCheck ? (selectedCheck.pendingReview ? '⏳ รอตรวจใบเสร็จ (กันการคัดออก)' : selectedCheck.pass ? '✅ ผ่านเงื่อนไขรอบนี้' : '⚠️ ไม่ผ่านเงื่อนไข') : '— ยังไม่ประเมิน'}
              </span>
              {selectedCheck?.promotionGap ? <span className="ml-2 text-sky-200/75">{selectedCheck.promotionGap}</span> : null}
              {selectedCheck?.reasons?.length ? <span className="ml-2 text-amber-200/85">เหตุผล: {selectedCheck.reasons.join(' · ')}</span> : null}
            </div>
            <div className="mt-2">
              <div className="text-xs font-semibold text-sky-100 mb-1.5">ช่อง 1:{branchLimit} ของสมาชิกคนนี้ (จากผังจริง)</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5">
                {Array.from({ length: branchLimit }, (_, i) => i + 1).map((slot) => {
                  const child = childMap.get(String(selectedNode.m!.userId))?.get(slot) || null;
                  if (!child) {
                    return (
                      <div key={slot} className="rounded-xl border border-dashed border-[#c8a84e]/60 bg-white/[0.03] px-2 py-1.5">
                        <div className="text-[10px] text-[#e2c478]">ช่อง {slot}</div>
                        <div className="text-[11px] text-sky-200/60">ว่าง — รอสมาชิกใหม่</div>
                      </div>
                    );
                  }
                  const cc = checkByUser.get(String(child.userId)) || null;
                  return (
                    <div key={slot} className="rounded-xl border border-sky-400/30 bg-sky-500/10 px-2 py-1.5">
                      <div className="text-[10px] text-sky-200/80">ช่อง {slot}{cc?.pass ? ' · ผ่าน' : cc?.pendingReview ? ' · รอตรวจ' : ''}</div>
                      <div className="font-mono text-[10px] text-sky-100 truncate">{child.code}</div>
                      <div className="text-[11px] font-semibold text-sky-50 truncate">{child.name}</div>
                      <div className="text-[10px] text-sky-200/60">ชั้น {Number(child.level ?? 0)} · ลูกในผัง {th(child.childrenCount)}/{branchLimit}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ── สรุปต่อชั้น + คิวรอจัดเข้าผัง ── */}
        <div className="mt-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="lg:col-span-2 rounded-2xl border border-sky-400/20 bg-white/5 p-3">
            <div className="text-sm font-semibold text-sky-100 mb-2">ความจุและสมาชิกจริงต่อชั้น (ชั้นละ {th(branchLimit)} เท่า)</div>
            <table className="w-full text-xs">
              <thead className="text-sky-200/60">
                <tr>
                  <th className="text-left py-1">ชั้น</th>
                  <th className="text-right">สมาชิกจริง</th>
                  <th className="text-right">ความจุตามกติกา</th>
                  <th className="text-right">ช่องว่าง</th>
                  <th className="text-left pl-2">สัดส่วนที่เติมแล้ว</th>
                </tr>
              </thead>
              <tbody>
                {layers.map((l) => (
                  <tr key={l.depth} className="border-t border-white/10">
                    <td className="py-1.5">{l.depth === 0 ? 'ชั้น 0 (ราก)' : `ชั้น ${l.depth}`}</td>
                    <td className="text-right font-semibold tabular-nums">{th(l.real)}</td>
                    <td className="text-right tabular-nums">{th(l.capacity)}</td>
                    <td className="text-right tabular-nums">{th(l.vacant)}</td>
                    <td className="pl-2">
                      <div className="h-2 w-full max-w-[220px] rounded-full bg-white/10 overflow-hidden">
                        <div className="h-full rounded-full bg-gradient-to-r from-sky-400 to-emerald-400" style={{ width: `${Math.min(100, (l.real / Math.max(1, l.capacity)) * 100)}%` }} />
                      </div>
                    </td>
                  </tr>
                ))}
                {!layers.length && <tr><td colSpan={5} className="py-6 text-center text-sky-200/60">ยังไม่มีข้อมูลชั้น</td></tr>}
              </tbody>
            </table>
            {perLevel.length > 0 && (
              <div className="mt-2 text-[11px] text-sky-200/60">
                ความจุที่ระบบคำนวณจริงจากกติกาในฐานข้อมูล: {perLevel.map((r) => `ชั้น ${r.level} = ${th(r.count)}/${th(r.capacity)}`).join(' · ')}
              </div>
            )}
            <div className="mt-2 text-[11px] text-sky-200/60">
              หมายเหตุ: ช่องว่างที่แสดงเป็น “ความจุตามกติกา 1:{branchLimit}” ไม่ใช่จำนวนสมาชิก — ระบบจะเปิดชั้นถัดไปเมื่อชั้นบนเต็มตามกติกา
            </div>
          </div>

          <div className="rounded-2xl border border-sky-400/20 bg-white/5 p-3">
            <div className="text-sm font-semibold text-sky-100 mb-2">รอจัดเข้าช่องว่าง 1:{branchLimit} ({th(outOfTree.length)} คน)</div>
            <div className="text-[11px] text-sky-200/60 leading-relaxed">
              เส้นทางของสมาชิกจริง: สมัคร → อนุมัติเป็นตัวแทน (ACTIVE) → วงจรอัตโนมัติจัดเข้าช่องว่างตามกติกา 1:{branchLimit}
              · ระหว่างนี้ยังไม่นับเป็นสมาชิกในผัง
            </div>
            <div className="mt-2 space-y-1.5 max-h-[280px] overflow-auto">
              {outOfTree.map((m) => {
                const c = checkByUser.get(String(m.userId)) || null;
                return (
                  <div key={m.userId} className="text-[11px] border-b border-white/10 pb-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sky-100">{m.code}</span>
                      <span className="text-sky-50 font-semibold">{m.name}</span>
                      <span className="rounded-full border border-sky-400/30 px-2 py-0.5 text-[10px]">{m.status}</span>
                      {m.isAdminAccount ? <span className="rounded-full border border-[#c8a84e]/50 px-2 py-0.5 text-[10px] text-[#f2e3b0]">บัญชีผู้ดูแล</span> : null}
                    </div>
                    <div className="text-sky-200/60">
                      สมัคร {thDate(m.joinDate)} · {m.positionName || 'ยังไม่มีตำแหน่ง'} · {c ? (c.pendingReview ? 'รอตรวจใบเสร็จ' : c.pass ? 'ผ่านเงื่อนไข' : 'ยังไม่ผ่านเงื่อนไข') : 'ยังไม่ประเมิน'}
                      {Number(m.pendingReceipts || 0) > 0 ? ` · ใบเสร็จรอตรวจ ${th(m.pendingReceipts)} ใบ` : ''}
                    </div>
                  </div>
                );
              })}
              {!outOfTree.length && <div className="text-xs text-sky-200/60">สมาชิกทุกคนอยู่ในผังแล้ว</div>}
            </div>
          </div>
        </div>

        <div className="mt-3 rounded-2xl border border-sky-400/20 bg-white/5 p-3 text-[11px] text-sky-200/70 leading-relaxed">
          {state?.disclaimer ||
            'ข้อมูลชุดนี้เป็นข้อมูลจริงในฐานข้อมูลของระบบ (ไม่ใช่ข้อมูลจำลอง) — ชื่อที่แสดงถูกปกปิดบางส่วนตาม PDPA สำหรับผู้ที่ไม่ใช่ผู้ดูแลระบบ และทุกการเปลี่ยนแปลงถูกบันทึกไว้ตรวจสอบย้อนหลังได้'}
          {state?.now ? ` · ประเมินล่าสุด ${thDateTime(state.now)}` : ''}
          {state?.period ? ` · รอบที่ประเมิน ${state.period}` : ''}
          {state?.testAccounts ? ` · มีสมาชิกทดสอบในฐานข้อมูล ${th(state.testAccounts)} คน` : ''}
        </div>
      </div>
    </section>
  );
}
