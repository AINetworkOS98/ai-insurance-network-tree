'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';

/* ─────────────────────────────────────────────────────────────
   หน้าตัวอย่างเครือข่าย 1 แตก 5 (สาธิต)
   - ศูนย์กลาง = รูปผู้ใช้ที่ล็อกอินอยู่ (อักษรย่อถ้าไม่มีรูป)
   - ปุ่ม "เพิ่มสมาชิกอัตโนมัติ" → เติมสมาชิกไล่จากชั้นในออกชั้นนอกต่อเนื่อง
     พร้อมแสดงผลลัพธ์และรายได้ (ประมาณการตัวอย่าง) เหมือน n8n ที่ทำงานอยู่ตลอด
   - กดที่วงกลมใดก็ได้ = ขยายชั้นถัดไปของกิ่งนั้น (เป็นชั้น ๆ วงกว้างออกไป)
   - มีแสงวิ่งบนเส้นเชื่อมตลอดเวลา

   หน้าสาธารณะ: ข้อมูลสมมติทั้งหมด — ไม่ดึงข้อมูลสมาชิกจริง
   ตัวเลขความจุ = จำนวนช่องในผัง ไม่ใช่จำนวนสมาชิก/ผลงาน/รายได้จริง
   ───────────────────────────────────────────────────────────── */

const FANOUT = 5;
const BRANCH_COLORS = ['#38bdf8', '#34d399', '#a78bfa', '#fbbf24', '#f472b6'];

/** อัตราค่าจัดงานตัวอย่าง (บาท/คน/เดือน) — สมมติฐานสาธิต ไม่ใช่ตัวเลขรับประกัน */
const LEVEL_INCOME = [0, 2000, 500, 150];

const NAMES = [
  'สมชาย', 'สมหญิง', 'วิชัย', 'นารี', 'ประเสริฐ', 'อนันต์', 'กมล', 'สุรีย์', 'พงษ์', 'ดารา',
  'เล็ก', 'ใหญ่', 'จอย', 'บอย', 'มิ้น', 'ต้น', 'น้ำ', 'ฟ้า', 'เบส', 'มายด์',
  'กิ๊ก', 'เอ๋', 'โอ๋', 'เปิ้ล', 'นิด', 'หน่อย', 'เอก', 'บี', 'ซี', 'ดี',
];
const SURNAMES = ['ใจดี', 'รักงาน', 'มั่นคง', 'สุขสันต์', 'ก้าวหน้า', 'ตั้งใจ', 'เมตตา', 'อดทน'];

type Node = {
  id: string;
  level: number;
  branch: number;
  slot: number;
  angle: number;
  x: number;
  y: number;
  parent: Node | null;
  children: Node[];
};

type Assignment = { name: string; memberId: string; avatarUrl?: string; isViewer?: boolean };

function radiusOf(level: number) {
  // รัศมีต้องโตเร็วกว่าเชิงเส้น ไม่งั้นชั้นลึกจะทับกันจนอ่านไม่ออก
  return level === 0 ? 0 : 118 * Math.pow(level, 1.32);
}

/** สร้างโครง 5-ary tree + แบ่งมุมแบบ wedge (แต่ละกิ่งได้เสี้ยวของตัวเอง ไม่ทับกัน) */
function buildSkeleton(maxDepth: number) {
  const make = (
    level: number, branch: number, a0: number, a1: number,
    parent: Node | null, slot: number, id: string,
  ): Node => {
    const node: Node = {
      id, level, branch, slot, angle: (a0 + a1) / 2,
      x: 0, y: 0, parent, children: [],
    };
    if (level < maxDepth) {
      const w = (a1 - a0) / FANOUT;
      for (let i = 0; i < FANOUT; i++) {
        node.children.push(
          make(level + 1, level === 0 ? i : branch, a0 + i * w, a0 + (i + 1) * w, node, i + 1, `${id}.${i + 1}`),
        );
      }
    }
    return node;
  };
  const a0 = -Math.PI / 2 - Math.PI / FANOUT;   // ให้กิ่งแรกชี้ขึ้น
  const root = make(0, 0, a0, a0 + Math.PI * 2, null, 0, 'root');
  const ordered: Node[] = [];
  const q: Node[] = [root];
  while (q.length) { const n = q.shift()!; ordered.push(n); for (const c of n.children) q.push(c); }
  return { root, ordered };
}

const THB = (n: number) => n.toLocaleString('th-TH', { maximumFractionDigits: 0 });

export default function NetworkExamplePage() {
  const [depth, setDepth] = useState(3);
  const [zoom, setZoom] = useState(1);
  const [flowOn, setFlowOn] = useState(true);
  const [speed, setSpeed] = useState(700);            // ms ต่อ 1 คน (700 = ปกติ)
  const [running, setRunning] = useState(false);
  const [viewer, setViewer] = useState<Assignment | null>(null);
  const [assigned, setAssigned] = useState<Record<string, Assignment>>({});
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const seq = useRef(0);

  const { root, ordered } = useMemo(() => buildSkeleton(depth), [depth]);

  const layout = useMemo(() => {
    const maxR = radiusOf(depth);
    const pad = 92;
    const size = (maxR + pad) * 2;
    const center = maxR + pad;
    for (const n of ordered) {
      const r = radiusOf(n.level);
      n.x = center + Math.cos(n.angle) * r;
      n.y = center + Math.sin(n.angle) * r;
    }
    const edges: { from: Node; to: Node; key: string }[] = [];
    for (const n of ordered) for (const c of n.children) edges.push({ from: n, to: c, key: c.id });
    return { size, center, edges };
  }, [ordered, depth]);

  const capacity = ordered.length;
  const filledNodes = ordered.filter((n) => assigned[n.id]);
  const filled = filledNodes.length;

  const income = useMemo(() => {
    const byLevel: number[] = [];
    let total = 0;
    for (const n of filledNodes) {
      if (n.level === 0) continue;
      const rate = LEVEL_INCOME[Math.min(n.level, LEVEL_INCOME.length - 1)] || 0;
      byLevel[n.level] = (byLevel[n.level] || 0) + rate;
      total += rate;
    }
    return { total, byLevel };
  }, [filledNodes]);

  /* ── ผู้ใช้ที่ล็อกอิน (ศูนย์กลางใช้รูปจริง) ── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let a: Assignment | null = null;
      try {
        const r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
        const j = await r.json();
        if (j?.ok && j?.user) {
          const u = j.user;
          a = {
            name: u.displayName || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.nickname || 'คุณ',
            memberId: u.memberCode || u.referralCode || 'ME',
            avatarUrl: u.avatarUrl || undefined,
            isViewer: true,
          };
        }
      } catch { /* ไม่ได้ล็อกอิน → ใช้ตัวอย่าง */ }
      if (cancelled) return;
      if (!a) a = { name: 'คุณ (ตัวอย่าง)', memberId: 'DEMO-000000', isViewer: true };
      setViewer(a);
      setAssigned({ [root.id]: a });
    })();
    return () => { cancelled = true; };
  }, [root]);

  /* ── เปลี่ยนชั้น → รีเซ็ต (คงศูนย์กลางไว้) ── */
  useEffect(() => {
    setRunning(false);
    setLastAdded(null);
    setLog([]);
    seq.current = 0;
    setAssigned((prev) => {
      const v = prev[root.id] || viewer;
      return v ? { [root.id]: v } : {};
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depth]);

  const newAssignment = useCallback((): Assignment => {
    seq.current += 1;
    const i = seq.current;
    return {
      name: `${NAMES[i % NAMES.length]} ${SURNAMES[i % SURNAMES.length]}`,
      memberId: `M-${String(200000 + i * 7).padStart(6, '0')}`,
    };
  }, []);

  /** เติมสมาชิกถัดไปตามลำดับชั้น (BFS) — ชั้นตื้นสุดก่อน ซ้าย→ขวา */
  const addNext = useCallback((): string | null => {
    let target: Node | null = null;
    for (const n of ordered) {
      if (assigned[n.id]) continue;
      if (!n.parent || assigned[n.parent.id]) { target = n; break; }
    }
    if (!target) return null;
    const t = target;
    const a = newAssignment();
    setAssigned((prev) => ({ ...prev, [t.id]: a }));
    setLastAdded(t.id);
    setLog((prev) => [`+ ${a.name} → ชั้น ${t.level} ทิศ ${t.branch + 1} ช่อง ${t.slot}`, ...prev].slice(0, 6));
    return t.id;
  }, [ordered, assigned, newAssignment]);

  /** กดที่วงกลม = เติมตำแหน่งนั้น / ขยายชั้นถัดไปของกิ่งนั้น */
  const expandNode = useCallback((n: Node) => {
    if (!assigned[n.id]) {
      const a = newAssignment();
      setAssigned((prev) => ({ ...prev, [n.id]: a }));
      setLastAdded(n.id);
      setLog((prev) => [`+ ${a.name} → ชั้น ${n.level} ทิศ ${n.branch + 1}`, ...prev].slice(0, 6));
      return;
    }
    const kids = n.children.filter((c) => !assigned[c.id]);
    if (!kids.length) return;
    setAssigned((prev) => {
      const next = { ...prev };
      for (const c of kids) next[c.id] = newAssignment();
      return next;
    });
    setLastAdded(kids[0].id);
    setLog((prev) => [`↳ ขยาย${n.level === 0 ? 'จากศูนย์กลาง' : `ชั้น ${n.level}`} ออก ${kids.length} ตำแหน่ง`, ...prev].slice(0, 6));
  }, [assigned, newAssignment]);

  /* ── ทำงานอัตโนมัติต่อเนื่อง (เหมือน n8n ที่รันอยู่ตลอด) ── */
  useEffect(() => {
    if (!running) return;
    if (filled >= capacity) { setRunning(false); return; }
    const t = setTimeout(() => { addNext(); }, speed);
    return () => clearTimeout(t);
  }, [running, filled, capacity, speed, addNext]);

  useEffect(() => {
    if (!lastAdded) return;
    const t = setTimeout(() => setLastAdded(null), 1400);
    return () => clearTimeout(t);
  }, [lastAdded]);

  const reset = () => {
    setRunning(false);
    seq.current = 0;
    setLog([]);
    setLastAdded(null);
    setAssigned(viewer ? { [root.id]: viewer } : {});
  };

  const initials = (s: string) =>
    (s || '')
      .replace(/[^\u0E00-\u0E7F A-Za-z]/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  const safeId = (id: string) => id.replace(/\./g, '-');
  const nodeR = (level: number) => (level === 0 ? 34 : level === 1 ? 21 : level === 2 ? 13 : 8);

  const reachLevel = filledNodes.reduce((mx, n) => Math.max(mx, n.level), 0);
  const isFull = capacity > 1 && filled >= capacity;

  return (
    <div>
      <Header />
      <div className="flex w-full">
        <Sidebar />
        <main className="flex-1 p-5 space-y-4 min-w-0">

          {/* ── หัวเรื่อง + สถานะสด ── */}
          <div className="flex flex-wrap items-center gap-3">
            <div>
              <h1 className="text-xl font-bold text-navy">ตัวอย่างเครือข่าย — 1 แตก 5</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                ดูการขยายเครือข่ายเป็นชั้น ๆ จากรูปของคุณเอง — กดปุ่มแล้วระบบเติมสมาชิกและคิดรายได้ให้ดูต่อเนื่อง
              </p>
            </div>
            <span className={`ml-auto flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${running ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
              <span className={`w-2 h-2 rounded-full ${running ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
              {running ? 'กำลังทำงานอัตโนมัติ' : 'หยุดอยู่'}
            </span>
          </div>

          {/* ── แถบควบคุม ── */}
          <div className="card p-3 flex flex-wrap items-center gap-2 text-xs">
            {running ? (
              <button onClick={() => setRunning(false)}
                className="px-4 py-2 rounded-full bg-rose-600 text-white font-semibold shadow-sm hover:bg-rose-700 flex items-center gap-2">
                ⏸ หยุด
              </button>
            ) : (
              <button onClick={() => setRunning(true)} disabled={isFull}
                className="px-4 py-2 rounded-full bg-navy text-white font-semibold shadow-sm hover:opacity-90 disabled:opacity-40 flex items-center gap-2">
                ▶ เพิ่มสมาชิกอัตโนมัติ
              </button>
            )}
            <button onClick={() => addNext()} disabled={isFull}
              className="px-3 py-2 rounded-full bg-white border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
              ⏭ เพิ่มทีละคน
            </button>
            <button onClick={reset}
              className="px-3 py-2 rounded-full bg-white border border-slate-200 font-semibold text-slate-600 hover:bg-slate-50">
              ↺ เริ่มใหม่
            </button>

            <span className="text-slate-300">|</span>

            <span className="text-slate-500">ความเร็ว</span>
            {([['เร็ว', 260], ['ปกติ', 700], ['ช้า', 1400]] as [string, number][]).map(([label, ms]) => (
              <button key={label} onClick={() => setSpeed(ms)}
                className={`px-3 py-1.5 rounded-lg border font-semibold ${speed === ms ? 'bg-sky-50 border-sky-200 text-sky-700' : 'bg-white text-slate-600'}`}>
                {label}
              </button>
            ))}

            <span className="text-slate-300">|</span>

            <span className="text-slate-500">ชั้นการขยาย</span>
            {[2, 3, 4].map((d) => (
              <button key={d} onClick={() => setDepth(d)}
                className={`px-3 py-1.5 rounded-lg border font-semibold ${depth === d ? 'bg-[#eff6ff] border-[#dbeafe] text-sky-700' : 'bg-white text-slate-600'}`}>
                {d} ชั้น
              </button>
            ))}

            <button onClick={() => setFlowOn((v) => !v)}
              className={`px-3 py-1.5 rounded-lg border font-semibold ${flowOn ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white text-slate-500'}`}>
              แสงวิ่ง {flowOn ? 'เปิด' : 'ปิด'}
            </button>

            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.15).toFixed(2)))} className="w-8 h-8 rounded-lg border bg-white font-bold text-slate-600">−</button>
              <span className="tabular-nums w-12 text-center">{Math.round(zoom * 100)}%</span>
              <button onClick={() => setZoom((z) => Math.min(2.2, +(z + 0.15).toFixed(2)))} className="w-8 h-8 rounded-lg border bg-white font-bold text-slate-600">＋</button>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-4 items-start">

            {/* ── ผังวงกลม ── */}
            <div className="overflow-auto border border-slate-800 rounded-2xl bg-[#0b1020] p-4">
              <style>{`
                @keyframes nxFlow { to { stroke-dashoffset: -80; } }
                @keyframes nxBreathe { 0%,100% { opacity:.30; } 50% { opacity:1; } }
                @keyframes nxPop { 0% { opacity:0; } 60% { opacity:1; } 100% { opacity:1; } }
                .nx-flow { stroke-dasharray: 7 17; animation: nxFlow 1.1s linear infinite; }
                .nx-ring { animation: nxBreathe 2.6s ease-in-out infinite; }
                .nx-pop { animation: nxPop .6s ease-out; }
                .nx-label { paint-order: stroke; stroke: #0b1020; stroke-width: 3px; stroke-linejoin: round; }
              `}</style>

              {/* ต้องระบุขนาด CSS ชัดเจน ไม่งั้น svg จะย่อเหลือ 300x150 แล้วมองไม่เห็น */}
              <div style={{ width: '100%', maxWidth: layout.size * zoom, aspectRatio: '1 / 1', margin: '0 auto' }}>
                <svg viewBox={`0 0 ${layout.size} ${layout.size}`} width="100%" height="100%"
                     role="img" aria-label="ผังเครือข่าย 1 แตก 5">
                  <defs>
                    <radialGradient id="nxBG" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#121b38" />
                      <stop offset="100%" stopColor="#070b16" />
                    </radialGradient>
                    {BRANCH_COLORS.map((c, i) => (
                      <linearGradient key={i} id={`nxG${i}`} x1="0" y1="0" x2="1" y2="1">
                        <stop offset="0%" stopColor={c} stopOpacity="0.95" />
                        <stop offset="100%" stopColor={c} stopOpacity="0.32" />
                      </linearGradient>
                    ))}
                  </defs>

                  <rect x="0" y="0" width={layout.size} height={layout.size} fill="url(#nxBG)" />

                  {/* วงแหวนแต่ละชั้น */}
                  {Array.from({ length: depth }, (_, i) => (
                    <circle key={i} cx={layout.center} cy={layout.center} r={radiusOf(i + 1)}
                      fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="3 9" />
                  ))}

                  {/* เส้นเชื่อม + แสงวิ่ง */}
                  <g fill="none">
                    {layout.edges.map((e) => {
                      const col = BRANCH_COLORS[e.to.branch % FANOUT];
                      const d = `M ${e.from.x} ${e.from.y} L ${e.to.x} ${e.to.y}`;
                      const live = !!assigned[e.to.id];
                      return (
                        <g key={e.key}>
                          <path d={d} stroke={col} strokeOpacity={live ? 0.22 : 0.07} strokeWidth={Math.max(1.2, 5 - e.to.level)} />
                          {live && <path d={d} stroke={`url(#nxG${e.to.branch % FANOUT})`} strokeWidth="1.5" />}
                          {flowOn && live && (
                            <path d={d} className="nx-flow" stroke="#e2f4ff" strokeWidth="1.6"
                                  strokeLinecap="round" strokeOpacity="0.85" />
                          )}
                          {flowOn && live && e.to.level <= 2 && (
                            <circle r={e.to.level === 1 ? 3.6 : 2.6} fill={col}>
                              <animateMotion dur={`${2 + (e.to.branch % FANOUT) * 0.3}s`} repeatCount="indefinite"
                                begin={`${(e.to.slot % FANOUT) * 0.35}s`} path={d} />
                            </circle>
                          )}
                        </g>
                      );
                    })}
                  </g>

                  {/* โหนด */}
                  {ordered.map((n) => {
                    const a = assigned[n.id];
                    const r = nodeR(n.level);
                    const col = a ? BRANCH_COLORS[n.branch % FANOUT] : '#475569';
                    const isNew = lastAdded === n.id;
                    return (
                      <g key={n.id} onClick={() => expandNode(n)} style={{ cursor: 'pointer' }}
                         className={isNew ? 'nx-pop' : ''}>
                        <title>
                          {a ? `${a.name} — ${a.memberId} (ชั้น ${n.level})` : `ตำแหน่งว่าง ชั้น ${n.level} — กดเพื่อเพิ่มสมาชิก`}
                        </title>

                        {/* พื้นที่กดแบบโปร่งใส — โหนดชั้นลึกวงเล็กมาก ต้องมีไว้ให้กดง่าย */}
                        <circle cx={n.x} cy={n.y} r={r + 9} fill="transparent" />

                        {/* รูปผู้ใช้ที่ล็อกอิน = ศูนย์กลาง (ทรงกลม) */}
                        {n.level === 0 && a?.avatarUrl && (
                          <>
                            <clipPath id={`nxClip-${safeId(n.id)}`}><circle cx={n.x} cy={n.y} r={r - 2} /></clipPath>
                            <image href={a.avatarUrl} x={n.x - r} y={n.y - r} width={r * 2} height={r * 2}
                                   clipPath={`url(#nxClip-${safeId(n.id)})`} preserveAspectRatio="xMidYMid slice" />
                          </>
                        )}

                        {a && <circle cx={n.x} cy={n.y} r={r + 7} fill="none" stroke={col} strokeWidth="1.4" className="nx-ring" />}

                        <circle cx={n.x} cy={n.y} r={r}
                          fill={a ? `${col}22` : '#0f172a'}
                          stroke={isNew ? '#fde68a' : col}
                          strokeWidth={a ? (n.level === 0 ? 3 : 2) : 1}
                          strokeDasharray={a ? undefined : '3 3'} />

                        {a && !(n.level === 0 && a.avatarUrl) && n.level <= 2 && (
                          <text x={n.x} y={n.y + (n.level === 0 ? 6 : n.level === 1 ? 4.5 : 3.5)} textAnchor="middle"
                                fontSize={n.level === 0 ? 19 : n.level === 1 ? 13 : 10} fontWeight={700} fill="#e2e8f0">
                            {initials(a.name)}
                          </text>
                        )}
                        {!a && n.level <= 2 && (
                          <text x={n.x} y={n.y + (n.level === 0 ? 6 : 4)} textAnchor="middle"
                                fontSize={n.level === 0 ? 18 : 11} fill="#64748b" fontWeight={700}>＋</text>
                        )}

                        {a && n.level <= 1 && (
                          <text x={n.x} y={n.y + r + 15} textAnchor="middle" fontSize="11" fontWeight={600}
                                fill="#cbd5e1" className="nx-label">
                            {n.level === 0 ? a.name.slice(0, 18) : a.name.split(' ')[0]}
                          </text>
                        )}
                        {a && n.level >= 1 && n.children.length > 0 && (
                          <text x={n.x} y={n.y - r - 5} textAnchor="middle" fontSize="9" fill="#94a3b8">
                            {n.children.filter((c) => assigned[c.id]).length}/{FANOUT}
                          </text>
                        )}
                      </g>
                    );
                  })}

                  <text x={layout.center} y={layout.center - 54} textAnchor="middle" fontSize="12" fontWeight={700} fill="#93c5fd">
                    คุณคือศูนย์กลาง
                  </text>
                  <text x={layout.center} y={layout.center + 64} textAnchor="middle" fontSize="10" fill="#64748b">
                    แตก 5 ทิศ · กดวงกลมเพื่อขยายชั้นถัดไป
                  </text>
                </svg>
              </div>
            </div>

            {/* ── แผงผลลัพธ์ + รายได้ ── */}
            <div className="space-y-3">
              <div className="card p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-sm">ผลลัพธ์การขยาย</h3>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-bold">ตัวอย่างสาธิต</span>
                </div>
                <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 border">
                    <div className="text-slate-400">สมาชิกในผัง</div>
                    <div className="text-lg font-bold tabular-nums">
                      {filled}<span className="text-xs font-normal text-slate-400"> / {capacity}</span>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 border">
                    <div className="text-slate-400">ขยายถึงชั้น</div>
                    <div className="text-lg font-bold tabular-nums">{reachLevel}</div>
                  </div>
                </div>
                {isFull && (
                  <div className="mt-2 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    ผังเต็มที่ {depth} ชั้นแล้ว — เลือก &ldquo;4 ชั้น&rdquo; เพื่อขยายต่อ
                  </div>
                )}
                <div className="mt-3">
                  <div className="text-[11px] text-slate-500 mb-1">บันทึกล่าสุด</div>
                  {log.length ? (
                    <ul className="space-y-1">
                      {log.map((l, i) => (
                        <li key={i} className={`text-[11px] px-2 py-1 rounded-lg border ${i === 0 ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-slate-50 text-slate-600'}`}>
                          {l}
                        </li>
                      ))}
                    </ul>
                  ) : <div className="text-[11px] text-slate-400">ยังไม่มีการเพิ่มสมาชิก</div>}
                </div>
              </div>

              <div className="card p-4">
                <h3 className="font-semibold text-sm">รายได้จากเครือข่าย <span className="text-[11px] font-normal text-slate-400">(ประมาณการตัวอย่าง)</span></h3>
                <div className="mt-2 text-3xl font-bold text-emerald-600 tabular-nums">
                  ฿{THB(income.total)}
                  <span className="text-xs font-normal text-slate-400 ml-1">/เดือน</span>
                </div>
                <div className="mt-3 space-y-1 text-[11px]">
                  {LEVEL_INCOME.slice(1).map((rate, i) => {
                    const lv = i + 1;
                    const cnt = filledNodes.filter((n) => n.level === lv).length;
                    return (
                      <div key={lv} className="flex items-center justify-between px-2 py-1 rounded-lg bg-slate-50 border">
                        <span className="text-slate-600">ชั้น {lv} · {cnt} คน × ฿{THB(rate)}</span>
                        <span className="font-semibold tabular-nums">฿{THB(income.byLevel[lv] || 0)}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 text-[10px] text-slate-500 leading-relaxed">
                  สมมติฐานสาธิต: ชั้น 1 = ฿2,000/คน (ค่าแยกหน่วยตามเกณฑ์ขึ้นตำแหน่ง) • ชั้น 2 = ฿500 • ชั้น 3 = ฿150
                  — เป็น <b>ตัวอย่างเพื่อดูแนวโน้ม ไม่ใช่รายได้จริง</b> รายได้จริงคำนวณจากผลงานที่ยืนยันแล้วเท่านั้น
                </div>
                <Link href="/income" className="mt-3 block text-center px-3 py-2 rounded-xl bg-navy text-white text-xs font-semibold">
                  ดูรายได้จริงของฉัน
                </Link>
              </div>

              <div className="card p-4">
                <h3 className="font-semibold text-sm">เกณฑ์ขึ้นตำแหน่ง (อ้างอิง)</h3>
                <ul className="mt-2 space-y-1.5 text-[11px] text-slate-600">
                  <li className="px-2 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200">
                    <b>ชั้น 1 · ผู้บริหารหน่วย</b> — บำเหน็จ 20,000 • ค่าจัดงานหน่วย 25–40% + ค่าแยกหน่วย 2,000/หน่วย
                  </li>
                  <li className="px-2 py-1.5 rounded-lg bg-slate-50 border">
                    <b>ชั้น 2 · ผู้บริหารศูนย์</b> — บำเหน็จ 75,000 • แยกหน่วย 2 หน่วย
                  </li>
                  <li className="px-2 py-1.5 rounded-lg bg-slate-50 border">
                    <b>ชั้น 3 · ผู้บริหารภาค</b> — บำเหน็จ 1,200,000 • แยกศูนย์ 4 ศูนย์
                  </li>
                </ul>
                <Link href="/career" className="mt-2 block text-[11px] text-sky-700 font-semibold">ดูบันไดตำแหน่งทั้งหมด →</Link>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-[11px]">
            {BRANCH_COLORS.map((c, i) => (
              <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl border bg-white">
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
                <span className="text-slate-600">ทิศที่ {i + 1}</span>
              </div>
            ))}
          </div>

          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
            <b>ข้อควรทราบ:</b> หน้านี้เป็น <b>ตัวอย่างสาธิต</b> ใช้ข้อมูลสมมติทั้งหมด (ไม่ดึงข้อมูลสมาชิกจริง)
            • ตำแหน่งว่าง (เส้นประ) ไม่นับเป็นสมาชิก/ผลงาน/รายได้ • ตัวเลข {FANOUT}<sup>{depth}</sup> = {capacity} คือ <b>ความจุของผัง</b> ไม่ใช่จำนวนสมาชิกหรือรายได้จริง
            • ลำดับการเติมใช้ชั้นตื้นสุดก่อน ซ้าย→ขวา ตรงกับระบบจัดวางจริง
          </div>
          <div className="text-[11px] text-slate-400">
            รูปและชื่อที่ศูนย์กลางคือบัญชีที่คุณล็อกอินอยู่ • สมาชิกที่เพิ่มเข้ามาเป็นข้อมูลตัวอย่างสำหรับดูการขยายเครือข่าย
          </div>
        </main>
      </div>
    </div>
  );
}
