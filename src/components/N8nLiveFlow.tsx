'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

/* ============================================================================
   N8nLiveFlow — แสดง "ระบบอัตโนมัติ n8n" ที่ทำงานอยู่จริง ให้สมาชิกทุกระดับเห็น
   ----------------------------------------------------------------------------
   • ผังโหนด + เส้นเชื่อมสไตล์ n8n canvas พร้อม "แสงไฟวิ่ง" ตามเส้นเชื่อมตลอดเวลา
   • ตัวเลขทุกตัวมาจาก /api/automation/flow ซึ่งอ่านจากฐานข้อมูลจริง (ไม่มีการสุ่ม)
   • แสงวิ่ง = จังหวะการไหลของงานตามลำดับที่ระบบใช้จริง (ภาพเคลื่อนไหวเพื่อสื่อสาร)
   • อ่านอย่างเดียว ไม่มีข้อมูลส่วนบุคคลของสมาชิกในส่วนนี้
============================================================================ */

type Tone = 'sky' | 'emerald' | 'amber' | 'violet' | 'rose';
type FlowNode = { id: string; icon: string; label: string; sub: string; value: number; unit: string; tone: Tone };
type Flow = { id: string; name: string; engine: string; schedule: string; summary: string; nodes: FlowNode[]; edges: [string, string][] };
type Recent = { at: string; event: string; page: string };
type FlowData = {
  ok: boolean;
  at?: string;
  online?: boolean;
  lastEventAt?: string | null;
  live?: { events1h: number; events24h: number; agentLogs: number };
  flows?: Flow[];
  recent?: Recent[];
  note?: string;
};

const TONE: Record<Tone, { line: string; glow: string; chip: string; text: string }> = {
  sky: { line: '#38bdf8', glow: 'rgba(56,189,248,0.55)', chip: 'bg-sky-500/15 border-sky-400/40 text-sky-200', text: '#7dd3fc' },
  emerald: { line: '#34d399', glow: 'rgba(52,211,153,0.55)', chip: 'bg-emerald-500/15 border-emerald-400/40 text-emerald-200', text: '#6ee7b7' },
  amber: { line: '#fbbf24', glow: 'rgba(251,191,36,0.55)', chip: 'bg-amber-500/15 border-amber-400/40 text-amber-200', text: '#fcd34d' },
  violet: { line: '#a78bfa', glow: 'rgba(167,139,250,0.55)', chip: 'bg-violet-500/15 border-violet-400/40 text-violet-200', text: '#c4b5fd' },
  rose: { line: '#fb7185', glow: 'rgba(251,113,133,0.55)', chip: 'bg-rose-500/15 border-rose-400/40 text-rose-200', text: '#fda4af' },
};

// ── ผังวาด: 2 แถวแบบ serpentine ให้อ่านง่ายบนทุกจอ ─────────────────────────
const NODE_W = 168;
const NODE_H = 112;
const COL_W = 232;
const ROW_Y = [86, 352];
const MARGIN_X = 56;

function layout(n: number) {
  const cols = Math.ceil(n / 2);
  return (i: number) => {
    const row = i < cols ? 0 : 1;
    const col = i < cols ? i : i - cols;
    return { x: MARGIN_X + col * COL_W, y: ROW_Y[row], row, col, cols };
  };
}

function edgePath(a: { x: number; y: number; row: number; cols: number }, b: { x: number; y: number; row: number; cols: number }) {
  if (a.row === b.row) {
    const x1 = a.x + NODE_W;
    const y1 = a.y + NODE_H / 2;
    const x2 = b.x;
    const y2 = b.y + NODE_H / 2;
    const dx = Math.max(46, (x2 - x1) * 0.55);
    return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
  }
  // wrap ลงแถวล่าง — วนจากขวาล่างของแถวบน ไปเข้ากึ่งกลางด้านบนของแถวล่าง
  const x1 = a.x + NODE_W / 2;
  const y1 = a.y + NODE_H;
  const x2 = b.x + NODE_W / 2;
  const y2 = b.y;
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`;
}

export default function N8nLiveFlow() {
  const [data, setData] = useState<FlowData | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [flowIdx, setFlowIdx] = useState(0);
  const [play, setPlay] = useState(true);
  const [active, setActive] = useState(0);
  const [host, setHost] = useState('');
  const timer = useRef<any>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/automation/flow', { cache: 'no-store' });
      const j: FlowData = await r.json();
      if (!j?.ok) throw new Error('bad payload');
      setData(j);
      setErr('');
    } catch {
      setErr('ยังโหลดสถานะระบบอัตโนมัติไม่ได้ในขณะนี้');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, [load]);
  useEffect(() => { setHost(window.location.hostname); }, []);

  const flows = data?.flows || [];
  const flow = flows[Math.min(flowIdx, Math.max(flows.length - 1, 0))];
  const nodeCount = flow?.nodes?.length || 0;

  useEffect(() => { setActive(0); }, [flowIdx, nodeCount]);
  useEffect(() => {
    if (!play || nodeCount < 2) return;
    timer.current = setInterval(() => setActive((a) => (a + 1) % nodeCount), 1400);
    return () => clearInterval(timer.current);
  }, [play, nodeCount, flowIdx]);

  const pos = useMemo(() => layout(nodeCount), [nodeCount]);

  const geometry = useMemo(() => {
    if (!flow) return { W: 900, H: 560, edges: [] as { d: string; tone: Tone; from: number; to: number }[] };
    const idxOf = new Map(flow.nodes.map((n, i) => [n.id, i]));
    const edges = (flow.edges || []).map(([from, to]) => {
      const fi = idxOf.get(from) ?? -1;
      const ti = idxOf.get(to) ?? -1;
      if (fi < 0 || ti < 0) return null;
      return { d: edgePath(pos(fi), pos(ti)), tone: flow.nodes[ti].tone, from: fi, to: ti };
    }).filter(Boolean) as { d: string; tone: Tone; from: number; to: number }[];
    const cols = Math.ceil(nodeCount / 2);
    const W = MARGIN_X * 2 + (cols - 1) * COL_W + NODE_W;
    const H = ROW_Y[1] + NODE_H + 96;
    return { W, H, edges };
  }, [flow, nodeCount, pos]);

  const online = !!data?.online;
  const lastAt = data?.at ? new Date(data.at) : null;

  return (
    <section className="mt-4 mb-10">
      <style>{`
        @keyframes n8n-dash { to { stroke-dashoffset: -220; } }
        @keyframes n8n-node-pulse { 0%,100% { opacity: .25 } 50% { opacity: .85 } }
        @keyframes n8n-fade-up { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
        .n8n-dash { animation: n8n-dash 2.4s linear infinite; }
        .n8n-pulse { animation: n8n-node-pulse 1.6s ease-in-out infinite; }
        .n8n-fade { animation: n8n-fade-up .5s ease both; }
        .n8n-paused .n8n-dash { animation-play-state: paused; }
        .n8n-paused .n8n-dot { display: none; }
      `}</style>

      <div className="rounded-3xl border border-slate-800 bg-[#0b1220] shadow-[0_24px_60px_-30px_rgba(2,6,23,0.75)] overflow-hidden">
        {/* ── แถบหัว: สถานะระบบ + ตัวเลขจริง ─────────────────────────────── */}
        <div className="flex flex-wrap items-center gap-2 px-4 md:px-6 py-3 border-b border-slate-800 bg-[#0f172a]">
          <span
            className="inline-flex items-center gap-1.5 text-[11px] font-black px-2.5 py-1 rounded-lg"
            style={{ background: '#ea4b71', color: '#fff' }}
            title="ระบบอัตโนมัติทำงานบน n8n"
          >
            n8n
          </span>
          <span className="inline-flex items-center gap-2 text-[11px] font-bold px-2.5 py-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 text-emerald-300">
            <span className="relative flex w-2 h-2">
              <span className={`absolute inline-flex w-full h-full rounded-full bg-emerald-400 opacity-75 ${online ? 'animate-ping' : ''}`} />
              <span className="relative inline-flex w-2 h-2 rounded-full bg-emerald-400" />
            </span>
            {online ? 'ระบบอัตโนมัติกำลังทำงาน' : 'ระบบพร้อมทำงาน · รอรอบถัดไป'}
          </span>
          <h3 className="text-[15px] md:text-base font-bold text-slate-100">
            ระบบติดตามสมาชิกทำงานด้วย n8n อัตโนมัติ — เห็นทุกโหนดที่เชื่อมกัน
          </h3>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setPlay((p) => !p)}
              className={`text-[11px] font-semibold px-3 py-1.5 rounded-full border transition ${play ? 'bg-amber-500/15 text-amber-200 border-amber-400/40' : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'}`}
            >
              {play ? '⏸ หยุดแสงวิ่ง' : '▶ ให้แสงวิ่งต่อ'}
            </button>
            <button
              onClick={load}
              className="text-[11px] font-semibold px-3 py-1.5 rounded-full bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 transition"
            >
              ↻ อัปเดต
            </button>
          </div>
        </div>

        {/* ── ตัวเลขจริงจากฐานข้อมูล ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 px-4 md:px-6 py-3 border-b border-slate-800/70 bg-[#0d1526]">
          {[
            { label: 'กิจกรรมที่รับเข้า 24 ชม.', value: data?.live?.events24h ?? 0, unit: 'event' },
            { label: 'กิจกรรมชั่วโมงล่าสุด', value: data?.live?.events1h ?? 0, unit: 'event' },
            { label: 'บันทึกการทำงานของระบบ', value: data?.live?.agentLogs ?? 0, unit: 'ครั้ง' },
            { label: 'อัปเดตล่าสุด', value: lastAt ? lastAt.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—', unit: '' },
          ].map((m) => (
            <div key={m.label} className="rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2">
              <div className="text-[10.5px] text-slate-400">{m.label}</div>
              <div className="text-lg font-bold text-slate-100 leading-tight">
                {typeof m.value === 'number' ? m.value.toLocaleString('th-TH') : m.value}
                {m.unit ? <span className="text-[10px] font-normal text-slate-500 ml-1">{m.unit}</span> : null}
              </div>
            </div>
          ))}
        </div>

        {/* ── สลับวงจร + คำอธิบาย ────────────────────────────────────────── */}
        <div className="px-4 md:px-6 pt-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {flows.map((f, i) => (
              <button
                key={f.id}
                onClick={() => setFlowIdx(i)}
                className={`text-[11px] font-semibold px-3 py-1.5 rounded-full border transition ${i === flowIdx ? 'bg-slate-100 text-slate-900 border-slate-100' : 'bg-slate-900/60 text-slate-300 border-slate-700 hover:bg-slate-800'}`}
              >
                {i === flowIdx ? '● ' : '○ '}
                {f.name}
              </button>
            ))}
            {flows.length > 1 && (
              <button
                onClick={() => setFlowIdx((i) => (i + 1) % flows.length)}
                className="text-[11px] font-semibold px-3 py-1.5 rounded-full bg-slate-800 text-slate-200 border border-slate-700 hover:bg-slate-700 transition"
              >
                ⇄ ดูวงจรถัดไป
              </button>
            )}
            <span className="ml-auto text-[10.5px] text-slate-500">ข้อมูลจริงจากฐานระบบ · อ่านอย่างเดียว</span>
          </div>

          {flow && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-400">
              <span className="text-slate-300 font-semibold">{flow.summary}</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5">⏱ {flow.schedule}</span>
              <span className="inline-flex items-center gap-1 rounded-full border border-slate-700 bg-slate-900/60 px-2 py-0.5">🧩 {flow.engine}</span>
            </div>
          )}
        </div>

        {/* ── แคนวาส n8n: โหนด + เส้นเชื่อม + แสงไฟวิ่ง ────────────────────── */}
        <div className={`relative px-2 md:px-4 pb-2 ${play ? '' : 'n8n-paused'}`}>
          <div
            className="rounded-2xl border border-slate-800 overflow-hidden"
            style={{
              background:
                'radial-gradient(circle at 18% 12%, rgba(234,75,113,0.10), transparent 45%), radial-gradient(circle at 82% 88%, rgba(56,189,248,0.10), transparent 45%), #0a1020',
              backgroundImage:
                'radial-gradient(rgba(148,163,184,0.16) 1px, transparent 1px), radial-gradient(circle at 18% 12%, rgba(234,75,113,0.10), transparent 45%), radial-gradient(circle at 82% 88%, rgba(56,189,248,0.10), transparent 45%)',
              backgroundSize: '22px 22px, 100% 100%, 100% 100%',
            }}
          >
            {loading && !data ? (
              <div className="py-16 text-center text-sm text-slate-400">กำลังอ่านสถานะระบบอัตโนมัติจากฐานข้อมูล…</div>
            ) : !flow ? (
              <div className="py-14 text-center text-sm text-slate-400">{err || 'ยังไม่มีข้อมูลวงจรอัตโนมัติ'}</div>
            ) : (
              <svg viewBox={`0 0 ${geometry.W} ${geometry.H}`} className="w-full h-auto" role="img" aria-label={`ผังการทำงาน n8n: ${flow.name}`}>
                <defs>
                  <filter id={`glow-${flow.id}`} x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="3.4" result="b" />
                    <feMerge>
                      <feMergeNode in="b" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  {geometry.edges.map((e, i) => (
                    <linearGradient key={i} id={`grad-${flow.id}-${i}`} x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={TONE[e.tone].line} stopOpacity="0.15" />
                      <stop offset="50%" stopColor={TONE[e.tone].line} stopOpacity="0.9" />
                      <stop offset="100%" stopColor={TONE[e.tone].line} stopOpacity="0.15" />
                    </linearGradient>
                  ))}
                </defs>

                {/* เส้นเชื่อมพื้นฐาน */}
                <g fill="none" stroke="#334155" strokeWidth="2">
                  {geometry.edges.map((e, i) => (
                    <path key={i} d={e.d} />
                  ))}
                </g>

                {/* เส้นเชื่อมที่ "มีไฟวิ่ง" */}
                <g fill="none" strokeWidth="3" strokeLinecap="round">
                  {geometry.edges.map((e, i) => (
                    <path
                      key={i}
                      d={e.d}
                      className={play ? 'n8n-dash' : ''}
                      stroke={`url(#grad-${flow.id}-${i})`}
                      strokeDasharray="16 44"
                      style={{ animationDelay: `${(i % 5) * 0.35}s`, filter: `drop-shadow(0 0 4px ${TONE[e.tone].glow})` }}
                    />
                  ))}
                </g>

                {/* จุดแสงเดินทางไปตามเส้น (ภาพเคลื่อนไหว) */}
                <g>
                  {geometry.edges.map((e, i) => (
                    <circle key={i} r="4" fill="#fff" opacity="0.95" className="n8n-dot" filter={`url(#glow-${flow.id})`}>
                      <animateMotion dur={`${2.4 + (i % 3) * 0.4}s`} begin={`${(i % 4) * 0.45}s`} repeatCount="indefinite" path={e.d} />
                    </circle>
                  ))}
                </g>

                {/* ── โหนด ── */}
                {flow.nodes.map((n, i) => {
                  const p = pos(i);
                  const on = i === active;
                  const tn = TONE[n.tone];
                  return (
                    <g key={n.id} transform={`translate(${p.x} ${p.y})`}>
                      {on && (
                        <rect className="n8n-pulse" x="-6" y="-6" width={NODE_W + 12} height={NODE_H + 12} rx="20" fill={tn.glow} />
                      )}
                      <rect
                        x="0" y="0" width={NODE_W} height={NODE_H} rx="16"
                        fill={on ? '#16233c' : '#111c31'}
                        stroke={on ? tn.line : '#334155'}
                        strokeWidth={on ? 2.4 : 1.4}
                        filter={on ? `url(#glow-${flow.id})` : undefined}
                      />
                      {/* แถบสีประจำขั้น */}
                      <rect x="0" y="0" width="6" height={NODE_H} rx="3" fill={tn.line} opacity={on ? 1 : 0.65} />
                      {/* ไอคอน */}
                      <rect x="18" y="18" width="42" height="42" rx="12" fill={tn.glow} />
                      <text x="39" y="47" textAnchor="middle" fontSize="22">{n.icon}</text>
                      {/* ชื่อขั้น */}
                      <text x="70" y="36" fontSize="15" fontWeight="700" fill="#e2e8f0">{n.label.length > 22 ? n.label.slice(0, 21) + '…' : n.label}</text>
                      <text x="70" y="55" fontSize="11" fill="#94a3b8">{n.sub.length > 26 ? n.sub.slice(0, 25) + '…' : n.sub}</text>
                      {/* ตัวเลขจริง */}
                      <text x="18" y="92" fontSize="26" fontWeight="800" fill={tn.text}>{Number(n.value).toLocaleString('th-TH')}</text>
                      <text x="18" y="106" fontSize="10.5" fill="#94a3b8">{n.unit}</text>
                      {/* พอร์ตเชื่อม */}
                      <circle cx="0" cy={NODE_H / 2} r="5" fill="#0a1020" stroke={tn.line} strokeWidth="2" />
                      <circle cx={NODE_W} cy={NODE_H / 2} r="5" fill="#0a1020" stroke={tn.line} strokeWidth="2" />
                      <text x={NODE_W - 10} y={NODE_H - 10} textAnchor="end" fontSize="9.5" fill="#475569">#{i + 1}</text>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>

          {/* ── คำอธิบายสัญลักษณ์ ── */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 pt-3 text-[10.5px] text-slate-400">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400 inline-block shadow-[0_0_6px_rgba(251,191,36,0.9)]" /> แสงวิ่ง = จังหวะการไหลของงานระหว่างโหนด</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-400 inline-block" /> โหนดที่กำลังทำงานในรอบนี้</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-slate-500 inline-block" /> ตัวเลขในโหนด = ข้อมูลจริงจากฐานระบบ</span>
            {host === 'localhost' && (
              <a
                href="http://localhost:5679/home/workflows"
                target="_blank"
                rel="noopener noreferrer"
                className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/60 px-2.5 py-1 text-slate-300 hover:bg-slate-800"
              >
                ⚡ เปิดดู workflow บน n8n (เครื่องแม่ข่าย)
              </a>
            )}
          </div>
        </div>

        {/* ── กิจกรรมจริงล่าสุด (ไม่มีข้อมูลส่วนบุคคล) ──────────────────────── */}
        <div className="px-4 md:px-6 py-4 border-t border-slate-800 bg-[#0d1526]">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] font-bold text-slate-300">กิจกรรมจริงที่ระบบเพิ่งรับเข้า</span>
            <span className="text-[10.5px] text-slate-500">(ชื่อหน้า + ประเภทกิจกรรม · ไม่มีข้อมูลส่วนบุคคล)</span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            {(data?.recent || []).map((e, i) => (
              <div key={i} className="n8n-fade flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/60 px-2.5 py-1.5 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                <span className="text-slate-200 font-semibold">{e.event}</span>
                <span className="text-slate-500 truncate">· {e.page}</span>
                <span className="ml-auto text-slate-500 tabular-nums shrink-0">
                  {new Date(e.at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
            {!(data?.recent || []).length && <div className="text-[11px] text-slate-500">ยังไม่มีกิจกรรมล่าสุดให้แสดง</div>}
          </div>
          <p className="mt-3 text-[10.5px] text-slate-500 leading-relaxed">
            {data?.note || 'ตัวเลขทุกตัวเป็นข้อมูลจริงจากฐานระบบ'}
            {lastAt ? ` · อัปเดต ${lastAt.toLocaleString('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}
            {host === 'localhost' || host === '' ? '' : ` · โฮสต์ ${host}`}
          </p>
        </div>
      </div>
    </section>
  );
}
