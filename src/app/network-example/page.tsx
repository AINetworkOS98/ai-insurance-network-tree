'use client';
import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';

/* ---------- Helpers ---------- */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/* ---------- Types ---------- */
type Status = 'ACTIVE' | 'PASS' | 'WARNING' | 'FAIL' | 'SUSPENDED' | 'REMOVED' | 'PROMOTED' | 'VACANT';
type Member = {
  id: string; memberId: string; name: string; level: number;
  parentId: string | null; slot: number; kpi: number; status: Status;
  children: Member[]; avatarUrl?: string;
};

/* ---------- Demo generators ---------- */
const NAMES = [
  'สมชาย','สมหญิง','วิชัย','นารี','ประเสริฐ','อนันต์','กมล','สุรีย์','พงษ์','ดา',
  'เล็ก','ใหญ่','จอย','บอย','มิ้น','ต้น','น้ำ','ฟ้า','เบส','มายด์','กิ๊ก','เอ๋','โอ๋','เปิ้ล',
  'นิด','หน่อย','เอก','บี','ซี','ดี','เอฟ','จี','เอช','ไอ','เจ','แอล','เอ็ม','เอ็น','โอเมก้า','ไพรเมิร์ฟ'
];
function randName(i: number) { return NAMES[i % NAMES.length] + (i >= NAMES.length ? ` ${Math.floor(i / NAMES.length) + 1}` : ''); }
const STATUS_POOL: Status[] = ['PASS', 'PASS', 'PASS', 'WARNING', 'FAIL', 'ACTIVE'];
function makeMembers(levels: number): Member[] {
  let counter = 1;
  const all: Member[] = [];
  const root: Member = {
    id: '1', memberId: 'MEM000001', name: 'ROOT · ประธาน', level: 0,
    parentId: null, slot: 0, kpi: 96, status: 'ACTIVE', children: [],
  };
  all.push(root);
  const q: Member[] = [root];
  for (let lv = 1; lv <= levels; lv++) {
    const next: Member[] = [];
    for (const p of q) {
      for (let s = 1; s <= 5; s++) {
        if (all.length >= 600) break;
        counter++;
        const mid = `MEM${String(counter).padStart(6, '0')}`;
        const kpi = 45 + Math.floor(Math.random() * 55);
        let st: Status = STATUS_POOL[Math.floor(Math.random() * STATUS_POOL.length)];
        if (kpi >= 80) st = 'PASS';
        else if (kpi >= 60) st = 'WARNING';
        else st = 'FAIL';
        if (Math.random() < 0.04) st = 'REMOVED';
        if (Math.random() < 0.03) st = 'PROMOTED';
        const m: Member = {
          id: String(counter), memberId: mid, name: randName(counter),
          level: lv, parentId: p.id, slot: s, kpi, status: st, children: [],
        };
        p.children.push(m);
        all.push(m);
        next.push(m);
      }
    }
    q.splice(0, q.length, ...next);
    if (q.length === 0) break;
  }
  return all;
}

/* ---------- Status colors ---------- */
function statusBg(s: Status): string {
  switch (s) {
    case 'PASS': return 'bg-emerald-50 border-emerald-200 text-emerald-700';
    case 'ACTIVE': return 'bg-emerald-50 border-emerald-200 text-emerald-700';
    case 'PROMOTED': return 'bg-sky-50 border-sky-200 text-sky-700';
    case 'WARNING': return 'bg-amber-50 border-amber-200 text-amber-700';
    case 'FAIL': return 'bg-orange-50 border-orange-200 text-orange-700';
    case 'SUSPENDED': return 'bg-slate-100 border-slate-200 text-slate-600';
    case 'REMOVED': return 'bg-red-50 border-red-200 text-red-600';
    default: return 'bg-white border-slate-200 text-slate-600';
  }
}
function statusDot(s: Status): string {
  switch (s) {
    case 'PASS': case 'ACTIVE': return 'bg-emerald-500';
    case 'PROMOTED': return 'bg-sky-500';
    case 'WARNING': return 'bg-amber-400';
    case 'FAIL': return 'bg-orange-400';
    case 'REMOVED': return 'bg-red-500';
    default: return 'bg-slate-400';
  }
}

/* ---------- Radial tree renderer ---------- */
function RadialTree({
  members,
  selectedId,
  setSelected,
  levels,
  disclosed,
  lastPlacedConn,
  particleSpeed,
  particleCount,
  particleColor,
  showParticles,
  highlightDuration,
}: {
  members: Member[];
  selectedId: string | null;
  setSelected: (id: string | null) => void;
  levels: number;
  disclosed: boolean;
  lastPlacedConn: { parentId: string; childId: string } | null;
  particleSpeed: number;
  particleCount: number;
  particleColor: string;
  showParticles: boolean;
  highlightDuration: number;
}) {
  const root = members[0];
  if (!root) return <div className="text-sm text-slate-500 py-8 text-center">กำลังโหลด...</div>;

  /* จัดวางแบบ radial: root กลางสุด, ลูกแต่ละชั้นกระจายรอบ */
  const nodePos = useMemo(() => {
    const pos = new Map<string, { x: number; y: number; level: number; angle: number }>();
    const CX = 0, CY = 0;
    pos.set(root.id, { x: CX, y: CY, level: 0, angle: 0 });

    function walk(node: Member, px: number, py: number, parentAngle: number) {
      const n = node.children.length || 1;
      const span = (Math.PI * 2) / n;
      const radius = 56 + node.level * 72; // ระยะห่างจากแม่เพิ่มขึ้นตามชั้น
      node.children.forEach((c, i) => {
        const angle = parentAngle + i * span - (Math.PI * 2) / 2 + span / 2;
        const x = px + radius * Math.cos(angle);
        const y = py + radius * Math.sin(angle);
        pos.set(c.id, { x, y, level: c.level, angle });
        walk(c, x, y, angle);
      });
    }
    walk(root, CX, CY, 0);
    return pos;
  }, [members, root]);

  const SCALE = 1.4;
  const transform = useMemo(() => {
    const xs = [...nodePos.values()].map(p => p.x);
    const ys = [...nodePos.values()].map(p => p.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;
    const scale = Math.min(SCALE / (rangeX / 100), SCALE / (rangeY / 100), 2.2);
    const offX = - (minX + maxX) / 2 * scale;
    const offY = - (minY + maxY) / 2 * scale;
    return { scale, offX, offY };
  }, [nodePos]);

  const T = transform;

  return (
    <div className="relative w-full h-[calc(100vh-56px)] overflow-hidden bg-gradient-to-br from-[#f0f7ff] via-[#f8fafc] to-[#fcfdff] flex items-center justify-center">
      <svg
        viewBox="-500 -400 1000 800"
        className="w-full h-full p-4"
        style={{ background: 'transparent' }}
      >
        <defs>
          <filter id="nodeShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#475569" floodOpacity="0.15" />
          </filter>
          <filter id="nodeGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <marker id="arrowHead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#93c5fd" />
          </marker>
          <style>{`
            @keyframes flowParticle {
              0% { transform: translate(0,0); opacity: 0; }
              10% { opacity: 1; }
              90% { opacity: 1; }
              100% { transform: translate(var(--dx), var(--dy)); opacity: 0; }
            }
            .particle {
              animation: flowParticle var(--duration) linear infinite;
              animation-delay: var(--delay);
              transform-box: fill-box;
              transform-origin: center;
            }
          `}</style>
        </defs>

        <g transform={`translate(${T.offX},${T.offY}) scale(${T.scale})`}>
          {/* เส้นเชื่อม + flow particles n8n-style */}
          {members.map(m => {
            const p = nodePos.get(m.id);
            if (!p) return null;
            return m.children.map((c, ci) => {
              const cp = nodePos.get(c.id);
              if (!cp) return null;
              const dx = cp.x - p.x;
              const dy = cp.y - p.y;
              const isNew = disclosed && /* ระบุเส้นใหม่ */ false;
              const lineColor = isNew ? '#fcd34d' : (m.children.length < 5 ? '#93c5fd' : '#60a5fa');
              const lineWidth = isNew ? 2.5 : 1.5;
              const dash = isNew ? 'none' : (m.children.length < 5 ? '4 3' : 'none');
              const lineOpacity = isNew ? 1 : (m.children.length < 5 ? 0.4 : 0.7);
              const glow = isNew ? '#fcd34d' : 'none';

              return (
                <g key={`e-${m.id}-${c.id}`}>
                  {/* เส้นหลัก */}
                  <line
                    x1={p.x} y1={p.y}
                    x2={cp.x} y2={cp.y}
                    stroke={lineColor}
                    strokeWidth={lineWidth}
                    strokeDasharray={dash}
                    markerEnd={m.children.length < 5 ? 'url(#arrowHead)' : 'none'}
                    opacity={lineOpacity}
                    className="transition-all duration-300"
                  />
                  {/* เส้น glow (เฉพาะเส้นใหม่ — highlight นานกว่าเดิม) */}
                  {isNew && (
                    <line
                      x1={p.x} y1={p.y}
                      x2={cp.x} y2={cp.y}
                      stroke={glow}
                      strokeWidth={8}
                      opacity={0.35}
                      filter="url(#nodeGlow)"
                      className="transition-all duration-300"
                    />
                  )}
                  {/* Flow particles — {particleCount} อนุภาค วิ่งจากพ่อไปลูก ไหลตลอดเวลา */}
                  {showParticles && (
                    <>
                      {Array.from({ length: particleCount }, (_, i) => {
                        const particleStyle = {
                          '--dx': `${dx}px`,
                          '--dy': `${dy}px`,
                          '--duration': `${Math.max(800, particleSpeed * (1 + i * 0.35))}ms`,
                          '--delay': `${(i * (particleSpeed * 0.25))}ms`,
                          filter: i === 0 ? 'url(#nodeShadow)' : undefined,
                        } as any;
                        return (
                          <circle
                            key={i}
                            cx={p.x} cy={p.y}
                            r={1.6 - i * 0.25}
                            fill={particleColor}
                            opacity={(0.9) - i * 0.12}
                            className="particle"
                            style={particleStyle}
                          />
                        );
                      })}
                    </>
                  )}
                </g>
              );
            });
          })}

          {/* โหนด */}
          {members.map(m => {
            const p = nodePos.get(m.id);
            if (!p) return null;
            const isSelected = m.id === selectedId;
            const isVacant = m.status === 'VACANT';
            // ซ่อนโหนดที่ยังไม่ถูกเปิดเผยถ้ากำลังรันจำลอง
            if (!disclosed && m.level > 0) return null;
            const r = m.level === 0 ? 28 : m.children.length === 0 ? 14 : 18;

            return (
              <g
                key={m.id}
                onClick={() => setSelected(isSelected ? null : m.id)}
                className="cursor-pointer"
                style={{
                  transform: `translate(${p.x}px,${p.y}px)`,
                  transition: 'transform 0.2s ease',
                }}
              >
                {/* วงกลมพื้นหลัง */}
                <circle
                  r={r + (isSelected ? 8 : 0)}
                  fill={isSelected ? 'rgba(71,85,105,0.08)' : 'transparent'}
                  className="transition-all duration-200"
                />

                {/* วงกลมโหนด */}
                <circle
                  r={r}
                  fill={isVacant ? '#f1f5f9' : '#ffffff'}
                  stroke={isVacant ? '#cbd5e1' : isSelected ? '#475569' : statusDot(m.status)}
                  strokeWidth={isSelected ? 3.5 : isVacant ? 2 : 2.5}
                  filter="url(#nodeShadow)"
                  className="transition-all duration-200 hover:scale-105"
                  style={{ transformOrigin: 'center' }}
                />

                {/* ไอคอนพิเศษ */}
                {m.status === 'REMOVED' && (
                  <text textAnchor="middle" dominantBaseline="central"
                    fontSize={r * 0.7} fill="#ef4444" fontWeight="bold">✕</text>
                )}
                {m.status === 'PROMOTED' && (
                  <text textAnchor="middle" dominantBaseline="central"
                    fontSize={r * 0.6} fill="#3b82f6" fontWeight="bold">★</text>
                )}
                {isVacant && (
                  <text textAnchor="middle" dominantBaseline="central"
                    fontSize={r * 0.8} fill="#94a3b8" fontWeight="bold">+</text>
                )}

                {/* Initials (เฉพาะไม่ใช่ VACANT/REMOVED) */}
                {!isVacant && m.status !== 'REMOVED' && (
                  <text textAnchor="middle" dominantBaseline="central"
                    fontSize={r * (m.level === 0 ? 0.55 : 0.5)}
                    fill="#475569" fontWeight="700">
                    {m.name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                  </text>
                )}

                {/* ป้ายระดับ (root เท่านั้น) */}
                {m.level === 0 && (
                  <text textAnchor="middle" dominantBaseline="hanging"
                    y={r + 8} fontSize={10} fill="#475569" fontWeight="600">
                    ROOT
                  </text>
                )}

                {/* หมายเลข slot */}
                {m.level > 0 && m.status !== 'VACANT' && (
                  <text textAnchor="middle" dominantBaseline="hanging"
                    y={r + 4} fontSize={7} fill="#94a3b8" fontWeight="500">
                    S{m.slot}
                  </text>
                )}

                {/* ว่าง/เต็ม ในวงกลมเล็ก */}
                {m.level > 0 && (
                  <text textAnchor="middle" dominantBaseline="hanging"
                    y={-r - 6} fontSize={7} fill="#94a3b8" fontWeight="500">
                    {m.children.length}/5
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* ปุ่ม_zoom รูปスピード */}
      <div className="absolute bottom-4 right-4 flex gap-2 z-10">
        <button onClick={() => { const s = nodePos; const vals = [...s.values()]; const xs = vals.map(v => v.x); const ys = vals.map(v => v.y); const minX = Math.min(...xs), maxX = Math.max(...xs); const minY = Math.min(...ys), maxY = Math.max(...ys); }} className="w-9 h-9 rounded-full bg-white/80 backdrop-blur border border-slate-200 shadow flex items-center justify-center text-lg font-bold text-slate-600 hover:bg-white hover:shadow-xl transition">
          ＋
        </button>
        <button className="w-9 h-9 rounded-full bg-white/80 backdrop-blur border border-slate-200 shadow flex items-center justify-center text-lg font-bold text-slate-600 hover:bg-white hover:shadow-xl transition">
          −
        </button>
        <button onClick={() => setSelected(null)} className="px-3 py-1.5 rounded-full bg-white/80 backdrop-blur border border-slate-200 shadow text-xs text-slate-600 hover:bg-white hover:shadow-xl transition">
          รีเซ็ต
        </button>
      </div>

      {/* ตำนานสี */}
      <div className="absolute top-3 left-3 z-10 flex flex-wrap gap-1.5 text-[10px]">
        <span className="px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200">● PASS/ACTIVE</span>
        <span className="px-2 py-1 rounded-full bg-sky-50 border border-sky-200">● PROMOTED</span>
        <span className="px-2 py-1 rounded-full bg-amber-50 border border-amber-200">● WARNING</span>
        <span className="px-2 py-1 rounded-full bg-orange-50 border border-orange-200">● FAIL</span>
        <span className="px-2 py-1 rounded-full bg-red-50 border border-red-200">● REMOVED</span>
        <span className="px-2 py-1 rounded-full bg-slate-50 border border-dashed">◌ VACANT</span>
      </div>

      {/* ปุ่มดูผลงาน */}
      <div className="absolute top-3 right-3 z-10">
        <Link href="/income" className="px-4 py-2 rounded-full bg-[#475569] text-white text-xs font-semibold shadow-lg hover:bg-slate-800 hover:shadow-xl transition flex items-center gap-1.5">
          <span>📊</span> ดูผลงาน
        </Link>
      </div>

      {/* ชั้นนำหน้า */}
      <div className="absolute bottom-4 left-4 z-10 text-[10px] text-slate-400 bg-white/70 backdrop-blur px-2.5 py-1 rounded-lg">
        ชั้น 0 · 1 · 2 · 3 · 4 · ... ขยายไม่จำกัด
      </div>
    </div>
  );
}

/* ---------- หน้าหลัก ---------- */
export default function NetworkExamplePage() {
  const [levels, setLevels] = useState(4);
  const [selected, setSelected] = useState<string | null>('1');
  const [showCommission, setShowCommission] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [running, setRunning] = useState(false);
  const [runMsg, setRunMsg] = useState('');
  const [disclosed, setDisclosed] = useState(false);
  const [runSpeed, setRunSpeed] = useState(300);
  const [particleSpeed, setParticleSpeed] = useState(1000);
  const [particleCount, setParticleCount] = useState(5);
  const [particleColor, setParticleColor] = useState('#ffffff');
  const [showParticles, setShowParticles] = useState(true);
  const [highlightDuration, setHighlightDuration] = useState(4000);
  const [lastPlacedConn, setLastPlacedConn] = useState<{ parentId: string; childId: string } | null>(null);

  // สร้าง members เมื่อ levels เปลี่ยน
  useEffect(() => {
    setMembers(makeMembers(levels));
    setSelected('1');
    setDisclosed(false);
    setRunning(false);
    setRunMsg('');
  }, [levels]);

  // เรียกดูรายการสมาชิก (ใช้โดยปุ่มดูผลงาน)
  const navigateToIncome = useCallback(() => {
    setShowCommission(true);
    setTimeout(() => {
      window.location.href = '/income';
    }, 200);
  }, []);

  // รันจำลองการวางตำแหน่ง 1→5→25→125...
  const runSimulation = useCallback(async () => {
    if (running) return;
    setRunning(true);
    setDisclosed(false);
    setRunMsg('เริ่มสร้างผัง 1 แตก 5...');

    const all = members;
    const root = all[0];
    if (!root) { setRunning(false); return; }

    // เริ่มจาก root ก่อน
    setDisclosed(true);
    setRunMsg(`🔧 วาง ROOT — ${root.memberId} (${root.name})`);

    // BFS queue: ทำทีละระดับ
    const queue: Member[] = [root];
    let placed = 0;

    while (queue.length > 0 && running) {
      const parent = queue.shift()!;
      const children = parent.children;
      for (let i = 0; i < children.length; i++) {
        if (!running) break;
        const child = children[i];
        placed++;
        // ติดตามเส้นที่วางล่าสุด (สำหรับ highlight สีทอง)
        setLastPlacedConn({ parentId: parent.id, childId: child.id });
        // เปิดเผยโหนดทีละช่อง
        setDisclosed(true);
        if (parent.level === 0) {
          setRunMsg(`🌱 ระดับ 1 · Slot ${child.slot}/5 — วาง ${child.name} (${child.memberId})`);
        } else {
          setRunMsg(`🔹 ระดับ ${parent.level + 1} · Slot ${child.slot}/5 ของ ${parent.name} — วาง ${child.name} (${child.memberId})`);
        }
        await sleep(runSpeed);
        queue.push(child);
      }
    }

    if (running) {
      setRunMsg(`✅ เสร็จสิ้น — วางทั้งหมด ${placed} รายการ (ระดับ ${levels})`);
      setRunning(false);
    }
    // ล้างเส้นที่วางล่าสุดหลังจาก 1.5 วินาที
    setTimeout(() => setLastPlacedConn(null), 1500);
  }, [members, levels, running, runSpeed]);

  const cancelSimulation = useCallback(() => {
    setRunning(false);
    setRunMsg('หยุดการรัน');
  }, []);

  // ตรวจโครงสร้าง 1:5 — ตรวจสอบ over-capacity, slot ซ้ำ, สมาชิกซ้ำ
  const [structResult, setStructResult] = useState<any>(null);
  const checkStructure = useCallback(() => {
    const placements: any[] = [];
    const nodes: any[] = [];
    // สร้าง placement จาก members
    members.forEach(m => {
      nodes.push({ id: m.id, userId: m.memberId, name: m.name, level: m.level, status: m.status });
      m.children.forEach((c, slot) => {
        placements.push({ parentId: m.id, childId: c.id, slot: slot + 1, parentName: m.name, childName: c.name });
      });
    });

    // 1) นับ parent -> slots หา over-capacity (>5)
    const byParent = new Map<string, number[]>();
    const invalidSlot: any[] = [];
    for (const p of placements) {
      if (!byParent.has(p.parentId)) byParent.set(p.parentId, []);
      byParent.get(p.parentId)!.push(p.slot);
      if (typeof p.slot !== 'number' || p.slot < 1 || p.slot > 5) invalidSlot.push(p);
    }
    const overCapacity = [...byParent.entries()].filter(([, slots]) => slots.length > 5).map(([parentId, slots]) => ({
      parentId, count: slots.length, slots, parentName: nodes.find(n => n.id === parentId)?.name
    }));
    // 2) slot ซ้ำ
    const duplicateSlots = [...byParent.entries()].filter(([, slots]) => new Set(slots).size !== slots.length);
    // 3) สมาชิกซ้ำหลายตำแหน่ง
    const childCounts = new Map<string, number>();
    for (const p of placements) childCounts.set(p.childId, (childCounts.get(p.childId) || 0) + 1);
    const duplicateChild = [...childCounts.entries()].filter(([, c]) => c > 1);

    const ok = overCapacity.length === 0 && duplicateSlots.length === 0 && duplicateChild.length === 0 && invalidSlot.length === 0;
    const summary = ok
      ? `โครงสร้างปกติ — placements ${placements.length} รายการ, nodes ${nodes.length} รายการ, ไม่เกิน 5 ช่อง/parent`
      : `พบปัญหา — เกิน 5 ช่อง ${overCapacity.length} • slot ซ้ำ ${duplicateSlots.length} • สมาชิกซ้ำ ${duplicateChild.length} • slot นอกช่วง ${invalidSlot.length}`;

    setStructResult({
      ok, summary,
      totalPlacements: placements.length,
      totalNodes: nodes.length,
      overCapacity,
      duplicateSlots: duplicateSlots.map(([k, v]) => ({ parentId: k, slots: v, parentName: nodes.find(n => n.id === k)?.name })),
      duplicateChild,
      invalidSlot: invalidSlot.length,
      cycles: 0,
      crossOrg: 0,
    });
    setRunMsg(summary);
  }, [members]);

  const stats = useMemo(() => {
    const all = members;
    const c = (s: Status) => all.filter(x => x.status === s).length;
    return {
      total: all.length,
      active: c('ACTIVE') + c('PASS'),
      pass: c('PASS'),
      warning: c('WARNING'),
      fail: c('FAIL'),
      removed: c('REMOVED'),
      promoted: c('PROMOTED'),
      vacant: all.reduce((acc, m) => acc + (5 - m.children.length), 0),
      levels: Math.max(...all.map(x => x.level)),
    };
  }, [members]);

  const selectedMember = useMemo(() => {
    if (!selected) return members[0];
    return members.find(m => m.id === selected) || members[0];
  }, [selected, members]);

  return (
    <div>
      <Header />
      <div className="flex w-full">
        <Sidebar />
        <main className="flex-1 p-0">
          {/* Header แถมบน */}
          <div className="absolute top-0 left-0 right-0 z-20 flex flex-wrap items-center gap-3 px-4 py-2 bg-white/80 backdrop-blur border-b border-slate-200">
            <h1 className="text-lg font-bold text-[#475569]">ตัวอย่างเครือข่าย — 1 แตก 5</h1>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#f0f7ff] border border-[#dbeafe] text-[#2563eb]">🌐 สร้างเครือข่าย</span>
            <div className="ml-auto flex items-center gap-2">
              {/* ควบคุมชั้น */}
              <div className="flex items-center gap-2">
                <select value={levels} onChange={e => setLevels(Number(e.target.value))}
                  className="border rounded-lg px-2.5 py-1.5 text-xs bg-white font-medium">
                  <option value={2}>2 ชั้น · 31 คน</option>
                  <option value={3}>3 ชั้น · 156 คน</option>
                  <option value={4}>4 ชั้น · 781 คน</option>
                  <option value={5}>5 ชั้น · 3,906 คน</option>
                  <option value={6}>6 ชั้น · 19,531 คน</option>
                </select>
              </div>
              {/* ตัวเร็วในการรัน */}
              <div className="flex items-center gap-1 ml-2">
                <span className="text-[10px] text-slate-500">ความเร็ว:</span>
                <button onClick={() => setRunSpeed(100)} className={`px-2 py-1 rounded text-[10px] ${runSpeed===100?'bg-emerald-100 text-emerald-700':'bg-slate-50 text-slate-600 border'}`}>เร็ว</button>
                <button onClick={() => setRunSpeed(300)} className={`px-2 py-1 rounded text-[10px] ${runSpeed===300?'bg-amber-100 text-amber-700':'bg-slate-50 text-slate-600 border'}`}>ปกติ</button>
                <button onClick={() => setRunSpeed(700)} className={`px-2 py-1 rounded text-[10px] ${runSpeed===700?'bg-blue-100 text-blue-700':'bg-slate-50 text-slate-600 border'}`}>ช้า</button>
              </div>
              {/* ปุ่มรัน / หยุด / ทดลองโครงสร้าง */}
              <div className="flex items-center gap-1.5 ml-2">
                {running ? (
                  <button onClick={cancelSimulation}
                    className="px-3 py-1.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold border border-red-200 hover:bg-red-200 shadow flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500 inline-block"/> หยุด
                  </button>
                ) : (
                  <button onClick={runSimulation}
                    className="px-3 py-1.5 rounded-full bg-[#475569] text-white text-xs font-semibold hover:bg-slate-800 shadow flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-white inline-block animate-pulse"/>
                    รันจำลอง
                  </button>
                )}
                <button onClick={checkStructure}
                  className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 shadow flex items-center gap-1.5">
                  <span className="text-sm">✅</span> ทดลองโครงสร้าง
                </button>
              </div>
            </div>
              <span className="text-[10px] text-slate-500">
                Lv.{stats.levels} · {stats.total} คน · {stats.vacant} ว่าง
              </span>
            </div>
          </main>

          {/* Tree canvas เต็มจอ */}
          <RadialTree
            members={members}
            selectedId={selected}
            setSelected={setSelected}
            levels={levels}
            disclosed={disclosed}
            lastPlacedConn={lastPlacedConn}
            particleSpeed={particleSpeed}
            particleCount={particleCount}
            particleColor={particleColor}
            showParticles={showParticles}
            highlightDuration={highlightDuration}
          />

          {/* ผลตรวจโครงสร้าง */}
          {structResult && (
            <div className="absolute top-14 left-4 z-15 max-w-md card p-3 bg-white/95 backdrop-blur border shadow-lg rounded-2xl">
              <div className="text-xs font-semibold text-navy mb-1">ผลตรวจโครงสร้าง 1:5</div>
              <div className="text-[11px] text-slate-600 space-y-1">
                <div className="flex justify-between"><span>Over-capacity</span><span className="font-mono">{structResult.overCapacity?.length ?? 0} รายการ</span></div>
                <div className="flex justify-between"><span>Slot ซ้ำ</span><span className="font-mono">{structResult.duplicateSlots?.length ?? 0}</span></div>
                <div className="flex justify-between"><span>สมาชิกซ้ำ</span><span className="font-mono">{structResult.duplicateChild?.length ?? 0}</span></div>
                <div className="flex justify-between"><span>Slot นอกช่วง</span><span className="font-mono">{structResult.invalidSlot ?? 0}</span></div>
              </div>
              {structResult.ok ? (
                <div className="mt-2 text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full">✓ {structResult.summary}</div>
              ) : (
                <div className="mt-2 text-[11px] text-rose-700 bg-rose-50 px-2 py-1 rounded-full">⚠ {structResult.summary}</div>
              )}
              {structResult.overCapacity?.length > 0 && (
                <div className="mt-2 text-[10px] text-slate-600 space-y-1 max-h-[120px] overflow-auto">
                  {structResult.overCapacity.map((oc: any) => (
                    <div key={oc.parentId} className="flex justify-between">
                      <span>{oc.parentName} — {oc.count} ช่อง (เกิน 5)</span>
                      <span className="font-mono">{oc.slots.join(', ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Panel ข้อมูลสมาชิกที่เลือก (ลอยขวา) */}
          {selectedMember && (
            <div className="absolute right-4 top-20 z-20 w-72 card p-4 bg-white/95 backdrop-blur border shadow-xl rounded-2xl">
              <div className="text-xs font-semibold text-slate-500 mb-2">รายละเอียด</div>
              {/* Avatar วงกลม */}
              <div className="flex flex-col items-center mb-3">
                <div className="w-14 h-14 rounded-full bg-white border-2 border-[#dbeafe] shadow flex items-center justify-center overflow-hidden" style={{ borderRadius: '50%' }}>
                  {selectedMember.status === 'REMOVED' ? (
                    <span className="text-xl">✕</span>
                  ) : selectedMember.status === 'PROMOTED' ? (
                    <span className="text-xl">★</span>
                  ) : (
                    <span className="text-xl font-bold text-[#475569]">
                      {selectedMember.name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                    </span>
                  )}
                </div>
                <div className="mt-2 font-bold text-sm">{selectedMember.name}</div>
                <div className="font-mono text-xs px-2 py-0.5 rounded-full bg-white border inline-block mt-1">
                  {selectedMember.memberId}
                </div>
              </div>
              <div className={`inline-flex px-2.5 py-1 rounded-full border text-xs font-semibold mb-3 ${statusBg(selectedMember.status)}`}>
                {selectedMember.status} · KPI {selectedMember.kpi}/100
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                <div className="p-2 rounded-xl bg-white border"><div className="text-slate-400">Level</div><div className="font-bold">{selectedMember.level}</div></div>
                <div className="p-2 rounded-xl bg-white border"><div className="text-slate-400">Slot</div><div className="font-bold">{selectedMember.slot || '-'}</div></div>
                <div className="p-2 rounded-xl bg-white border"><div className="text-slate-400">ทีมตรง</div><div className="font-bold">{selectedMember.children.length}/5</div></div>
                <div className="p-2 rounded-xl bg-white border"><div className="text-slate-400">Parent</div><div className="font-mono text-[10px]">{selectedMember.parentId ? selectedMember.parentId.slice(0, 8) : '-'}</div></div>
              </div>
              <div className="text-[11px] text-slate-500 space-y-1 mb-3">
                <div>• Sponsor / Placement แยกกัน</div>
                <div>• Transaction + Lock Slot</div>
                <div>• ป้องกัน Cycle + Audit Log</div>
              </div>
              {/* ปุ่มดูผลงานจากตรงนี้ด้วย */}
              <button
                onClick={() => setShowCommission(true)}
                className="w-full px-3 py-2 rounded-xl bg-[#475569] text-white text-xs font-semibold hover:bg-slate-800 shadow"
              >
                📊 ดูผลงานของสมาชิกนี้
              </button>
              {showCommission && (
                <div className="mt-2 p-2 rounded-xl bg-sky-50 border border-sky-200 text-[10px] text-sky-700">
                  เปิดหน้า รายได้/ผลงาน ในอีก 2 วินาที...
                </div>
              )}
            </div>
          )}

          {/* ฟุตเตอร์ */}
          <div className="absolute bottom-0 left-0 right-0 z-10 text-center text-[10px] text-slate-400 bg-gradient-to-t from-white/60 to-transparent py-2">
            Demo • ข้อมูลจำลอง • ใช้ข้อมูลจริงเมื่อเชื่อม API • กฎ 1 แตก 5 • KPI 80/60
          </div>
        </div>
      </div>
  );
}
