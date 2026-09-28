'use client';
import { useEffect, useMemo, useState } from 'react';
import { DEMO_MEMBERS } from '@/lib/demo-data';

/* ─────────────────────────────────────────────────────────────
   ผังเครือข่าย 1:5 แบบ "แตก 5 ทิศ" (radial) + แสงวิ่งสไตล์ n8n
   - รากอยู่ศูนย์กลาง → แตกออก 5 ทิศ → แต่ละกิ่งแตกต่อ 5 ไม่สิ้นสุดตามชั้นที่เลือก
   - ใช้ข้อมูลสมาชิกจริงจาก /api/members เท่านั้น (ช่องว่าง = "ตำแหน่งว่าง" ไม่นับเป็นสมาชิก)
   - ลำดับการวางตรงกับ BFS ของระบบ: ชั้นตื้นสุดก่อน ซ้าย→ขวา
   ───────────────────────────────────────────────────────────── */

type Status = 'active' | 'pending' | 'inactive' | 'vacant';

type RNode = {
  id: string;
  name: string;
  memberId: string;
  status: Status;
  rankName?: string;
  avatarUrl?: string;
  level: number;
  branch: number;
  slot: number;
  angle: number;
  x: number;
  y: number;
  parent: RNode | null;
  children: RNode[];
};

type MemberLike = {
  memberId?: string; memberCode?: string; name?: string; displayName?: string;
  email?: string; status?: string; rankName?: string; avatarUrl?: string;
  province?: string; branch?: string; district?: string;
  subdistrict?: string; tambon?: string; zipCode?: string;
};

const BRANCH_COLORS = ['#38bdf8', '#34d399', '#a78bfa', '#fbbf24', '#f472b6'];
const FANOUT = 5;

function radiusOf(level: number) {
  return level === 0 ? 0 : 118 * Math.pow(level, 1.32);
}

/** สร้างโครงสร้าง 5-ary tree ตามจำนวนชั้น + คืนลำดับ level-order (BFS) */
function buildSkeleton(maxDepth: number) {
  const make = (
    level: number, branch: number, a0: number, a1: number,
    parent: RNode | null, slot: number, id: string,
  ): RNode => {
    const node: RNode = {
      id, name: '', memberId: '', status: 'vacant',
      level, branch, slot, angle: (a0 + a1) / 2,
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
  const a0 = -Math.PI / 2 - Math.PI / FANOUT;
  const root = make(0, 0, a0, a0 + Math.PI * 2, null, 0, 'root');
  // level-order (BFS)
  const ordered: RNode[] = [];
  const q: RNode[] = [root];
  while (q.length) { const n = q.shift()!; ordered.push(n); for (const c of n.children) q.push(c); }
  return { root, ordered };
}

export default function RadialNetworkTree({ filter, demoOnly = false }: {
  filter?: { q?: string; status?: string; province?: string; district?: string; tambon?: string; zipCode?: string };
  demoOnly?: boolean;
}) {
  const [depth, setDepth] = useState(3);
  const [zoom, setZoom] = useState(1);
  const [flowOn, setFlowOn] = useState(true);
  const [members, setMembers] = useState<MemberLike[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [usedDemo, setUsedDemo] = useState(false);

  // ── โหลดสมาชิกจริง (fallback: demo data เหมือน TreeView เดิม) ──
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const f = filter || {};
      const apply = (ms: MemberLike[]) => {
        let list = ms;
        if (f.q) {
          const s = String(f.q).toLowerCase();
          list = list.filter((m) => String(m.memberId || m.memberCode || '').toLowerCase().includes(s)
            || String(m.name || m.displayName || '').toLowerCase().includes(s)
            || String(m.email || '').toLowerCase().includes(s));
        }
        if (f.status) list = list.filter((m) => String(m.status || '').toUpperCase() === String(f.status).toUpperCase());
        if (f.province) list = list.filter((m) => String(m.province || m.branch || '') === f.province);
        if (f.district) list = list.filter((m) => String(m.district || '') === f.district);
        if (f.tambon) list = list.filter((m) => String(m.subdistrict || m.tambon || '') === f.tambon);
        if (f.zipCode) list = list.filter((m) => String(m.zipCode || '').includes(String(f.zipCode)));
        return list;
      };
      // โหมดสาธิต (หน้าสาธารณะ): ใช้ข้อมูลตัวอย่างเท่านั้น — ห้ามดึงข้อมูลสมาชิกจริงมาแสดง
      if (demoOnly) {
        setUsedDemo(true);
        setMembers(apply(DEMO_MEMBERS as any));
        setLoading(false);
        return;
      }
      try {
        const r = await fetch('/api/members', { cache: 'no-store' });
        const j = await r.json();
        if (cancelled) return;
        const raw: MemberLike[] = j?.members && Array.isArray(j.members) && j.members.length > 0 ? j.members : (DEMO_MEMBERS as any);
        setUsedDemo(!(j?.members && Array.isArray(j.members) && j.members.length > 0));
        setMembers(apply(raw));
      } catch {
        if (cancelled) return;
        setUsedDemo(true);
        setMembers(apply(DEMO_MEMBERS as any));
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [demoOnly, filter?.q, filter?.status, filter?.province, filter?.district, filter?.tambon, filter?.zipCode]);

  // ── ประกอบผัง: โครงสร้าง + ข้อมูลจริง + พิกัด ──
  const layout = useMemo(() => {
    const { root, ordered } = buildSkeleton(depth);
    const pool = members || [];
    ordered.forEach((n, i) => {
      const m = i === 0 ? pool[0] : pool[i];   // BFS: คนแรกเป็นราก ที่เหลือไล่ลงชั้นตื้นก่อน
      if (m) {
        n.name = String(m.name || m.displayName || 'ไม่ระบุชื่อ');
        n.memberId = String(m.memberId || m.memberCode || '-');
        n.rankName = m.rankName;
        n.avatarUrl = m.avatarUrl;
        const st = String(m.status || '').toUpperCase();
        n.status = st === 'ACTIVE' ? 'active' : st === 'PENDING' ? 'pending' : 'inactive';
      } else {
        n.name = 'ตำแหน่งว่าง';
        n.memberId = '-';
        n.status = 'vacant';
      }
    });
    // พิกัดขั้วโลก → คาร์ทีเซียน
    const maxR = radiusOf(depth);
    const pad = 90;
    const size = (maxR + pad) * 2;
    const c = maxR + pad;
    for (const n of ordered) {
      const r = radiusOf(n.level);
      n.x = c + Math.cos(n.angle) * r;
      n.y = c + Math.sin(n.angle) * r;
    }
    const edges: { from: RNode; to: RNode; key: string }[] = [];
    for (const n of ordered) for (const ch of n.children) edges.push({ from: n, to: ch, key: ch.id });
    const filled = ordered.filter((n) => n.status !== 'vacant').length;
    return { root, ordered, edges, size, center: c, capacity: ordered.length, filled };
  }, [members, depth]);

  const { ordered, edges, size, center, capacity, filled } = layout;

  if (loading) return <div className="text-xs text-slate-500 py-6 text-center">กำลังโหลดผังเครือข่าย...</div>;

  return (
    <div>
      {/* แถบควบคุม */}
      <div className="flex flex-wrap items-center gap-2 mb-3 text-xs">
        <span className="text-slate-500">ชั้นการขยาย:</span>
        {[2, 3, 4].map((d) => (
          <button key={d} onClick={() => setDepth(d)}
            className={`px-3 py-1.5 rounded-lg border ${depth === d ? 'bg-[#eff6ff] border-[#dbeafe] text-sky-700 font-semibold' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
            {d} ชั้น
          </button>
        ))}
        <button onClick={() => setFlowOn((v) => !v)}
          className={`px-3 py-1.5 rounded-lg border ${flowOn ? 'bg-emerald-50 border-emerald-200 text-emerald-700 font-semibold' : 'bg-white text-slate-600'}`}>
          แสงวิ่ง {flowOn ? 'เปิด' : 'ปิด'}
        </button>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setZoom((z) => Math.max(0.35, +(z - 0.15).toFixed(2)))} className="px-3 py-1.5 rounded-lg border bg-white">−</button>
          <span className="px-1 tabular-nums">{Math.round(zoom * 100)}%</span>
          <button onClick={() => setZoom((z) => Math.min(2.5, +(z + 0.15).toFixed(2)))} className="px-3 py-1.5 rounded-lg border bg-white">+</button>
          <button onClick={() => setZoom(1)} className="px-3 py-1.5 rounded-lg border bg-white text-slate-600">รีเซ็ต</button>
        </div>
      </div>

      <div className="text-xs text-slate-500 mb-2">
        {demoOnly ? 'สมาชิกตัวอย่าง' : 'สมาชิกจริง'} <b className="text-slate-700">{filled}</b> คน • ตำแหน่งว่าง <b className="text-slate-700">{capacity - filled}</b> • ความจุผัง 5<sup>{depth}</sup> = <b className="text-slate-700">{capacity}</b> ตำแหน่ง
        {demoOnly
          ? <span className="ml-2 px-2 py-0.5 rounded-full bg-slate-200 text-slate-600 text-[10px] font-semibold">ตัวอย่างสาธิต — ไม่ใช่ข้อมูลสมาชิกจริง</span>
          : usedDemo && <span className="ml-2 text-amber-700">(ยังไม่มีข้อมูลจริง — แสดงข้อมูลตัวอย่าง)</span>}
      </div>

      <div className="overflow-auto border rounded-2xl bg-[#0b1020] p-4">
        <style>{`
          @keyframes rnFlow { to { stroke-dashoffset: -80; } }
          @keyframes rnBreathe { 0%,100% { opacity:.35 } 50% { opacity:1 } }
          .rn-flow { stroke-dasharray: 7 17; animation: rnFlow 1.1s linear infinite; }
          .rn-node-ring { animation: rnBreathe 2.6s ease-in-out infinite; }
          .rn-label { paint-order: stroke; stroke: #0b1020; stroke-width: 3px; stroke-linejoin: round; }
        `}</style>

        <div style={{ width: '100%', maxWidth: size * zoom, aspectRatio: '1 / 1', margin: '0 auto' }}>
          <svg viewBox={`0 0 ${size} ${size}`} width="100%" height="100%" role="img"
               aria-label="ผังเครือข่าย 1 ต่อ 5 แตกออก 5 ทิศ">
            <defs>
              <radialGradient id="rnBG" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#111a35" />
                <stop offset="100%" stopColor="#080c18" />
              </radialGradient>
              {BRANCH_COLORS.map((c, i) => (
                <linearGradient key={i} id={`rnG${i}`} x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={c} stopOpacity="0.95" />
                  <stop offset="100%" stopColor={c} stopOpacity="0.35" />
                </linearGradient>
              ))}
            </defs>

            <rect x="0" y="0" width={size} height={size} fill="url(#rnBG)" />

            {/* วงแหวนชั้น */}
            {Array.from({ length: depth }, (_, i) => (
              <circle key={i} cx={center} cy={center} r={radiusOf(i + 1)}
                fill="none" stroke="#1e293b" strokeWidth="1" strokeDasharray="3 9" />
            ))}

            {/* เส้นเชื่อม + แสงวิ่ง */}
            <g fill="none">
              {edges.map((e) => {
                const col = BRANCH_COLORS[e.to.branch % FANOUT];
                const d = `M ${e.from.x} ${e.from.y} L ${e.to.x} ${e.to.y}`;
                return (
                  <g key={e.key}>
                    <path d={d} stroke={col} strokeOpacity="0.18" strokeWidth={Math.max(1.5, 5 - e.to.level)} />
                    <path d={d} stroke={`url(#rnG${e.to.branch % FANOUT})`} strokeWidth="1.6" />
                    {flowOn && (
                      <path d={d} className="rn-flow" stroke="#e2f4ff" strokeWidth="1.8"
                            strokeLinecap="round" strokeOpacity="0.9" />
                    )}
                    {/* จุดพลังงานไหลออกจากศูนย์กลาง (ชั้นตื้น = เห็นชัด) */}
                    {flowOn && e.to.level <= 2 && (
                      <circle r={e.to.level === 1 ? 4 : 3} fill={col}>
                        <animateMotion dur={`${2.2 + (e.to.branch % FANOUT) * 0.35}s`} repeatCount="indefinite"
                          begin={`${(e.to.slot % FANOUT) * 0.4}s`} path={d} />
                      </circle>
                    )}
                  </g>
                );
              })}
            </g>

            {/* โหนด */}
            {ordered.map((n) => {
              const r = n.level === 0 ? 34 : n.level === 1 ? 22 : n.level === 2 ? 14 : 9;
              const col = n.status === 'vacant' ? '#475569' : BRANCH_COLORS[n.branch % FANOUT];
              const initials = (n.name || '').split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
              return (
                <g key={n.id}>
                  <title>{`${n.memberId} — ${n.name}${n.rankName ? ' • ' + n.rankName : ''} (ชั้น ${n.level}, ช่อง ${n.slot})`}</title>
                  {n.status !== 'vacant' && (
                    <circle cx={n.x} cy={n.y} r={r + 7} fill="none" stroke={col} strokeWidth="1.5"
                            className="rn-node-ring" />
                  )}
                  <circle cx={n.x} cy={n.y} r={r} fill={n.status === 'vacant' ? '#0f172a' : `${col}22`}
                          stroke={col} strokeWidth={n.status === 'vacant' ? 1 : 2}
                          strokeDasharray={n.status === 'vacant' ? '3 3' : undefined} />
                  {n.status !== 'vacant' && n.avatarUrl && n.level <= 1 ? (
                    <>
                      <clipPath id={`rnClip${n.id.replace(/\./g, '-')}`}><circle cx={n.x} cy={n.y} r={r - 2} /></clipPath>
                      <image href={n.avatarUrl} x={n.x - r} y={n.y - r} width={r * 2} height={r * 2}
                             clipPath={`url(#rnClip${n.id.replace(/\./g, '-')})`} preserveAspectRatio="xMidYMid slice" />
                    </>
                  ) : (
                    n.level <= 2 && (
                      <text x={n.x} y={n.y + (n.level === 0 ? 6 : n.level === 1 ? 4.5 : 3.5)} textAnchor="middle"
                            fontSize={n.level === 0 ? 20 : n.level === 1 ? 14 : 10}
                            fontWeight={700} fill={n.status === 'vacant' ? '#64748b' : '#e2e8f0'}>
                        {n.status === 'vacant' ? '·' : initials}
                      </text>
                    )
                  )}
                  {n.level === 1 && (
                    <text x={n.x} y={n.y + r + 15} textAnchor="middle" fontSize="11" fontWeight={600}
                          fill="#cbd5e1" className="rn-label">
                      {n.status === 'vacant' ? `ทิศ ${n.slot} · ว่าง` : n.name.slice(0, 16)}
                    </text>
                  )}
                </g>
              );
            })}

            {/* ป้ายกลาง */}
            <text x={center} y={center - 52} textAnchor="middle" fontSize="13" fontWeight={700} fill="#93c5fd">
              ศูนย์กลาง 1 คน
            </text>
            <text x={center} y={center + 62} textAnchor="middle" fontSize="11" fill="#64748b">
              แตก 5 ทิศ · ขยายต่อไม่สิ้นสุด
            </text>
          </svg>
        </div>
      </div>

      {/* คำอธิบาย 5 ทิศ */}
      <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2 text-[11px]">
        {BRANCH_COLORS.map((c, i) => (
          <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-xl border bg-white">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: c }} />
            <span className="text-slate-600">ทิศที่ {i + 1}</span>
          </div>
        ))}
      </div>

      <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
        <b>หลักประกันความถูกต้อง:</b> ตำแหน่งว่าง (เส้นประ) ไม่นับเป็นสมาชิก/ผลงาน/รายได้ • ตัวเลข 5<sup>{depth}</sup> = {capacity} เป็น <b>ความจุผัง</b> ไม่ใช่จำนวนสมาชิกหรือรายได้จริง • ลำดับการวางใช้ BFS ชั้นตื้นสุดก่อน ซ้าย→ขวา ตรงกับระบบจัดวางจริง
      </div>

      <div className="mt-2 text-[11px] text-slate-400">
        แสดงชื่อ/รูปเฉพาะชั้น 0-1 • ชั้น 2 แสดงอักษรย่อ • ชั้น 3 ขึ้นไปแสดงจุด (hover ดูรายละเอียด)
      </div>
    </div>
  );
}
