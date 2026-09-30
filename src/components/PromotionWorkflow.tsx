'use client';
import { useEffect, useState } from 'react';
import { RANK_CATALOG } from '@/lib/rankCatalog';

/* ─────────────────────────────────────────────────────────────
   Workflow เส้นทางตำแหน่ง สไตล์ n8n (canvas มืด + สายไฟวิ่ง)
   - ตำแหน่งที่ขึ้นแล้ว  → สายไฟ "วิ่ง" ตลอดเวลา (animation ไม่สิ้นสุด)
   - ตำแหน่งถัดไป        → แสดงเป็นเป้าหมาย แต่ "ไม่มีแสงไฟ" (เส้นประนิ่ง)
   - ตำแหน่งที่ยังไม่ถึง → แสดงจาง ๆ ไม่มีแสงไฟ
   ───────────────────────────────────────────────────────────── */

const CELL_W = 210;   // ความกว้างช่องละ 1 ระดับ (แนวนอน)
const CELL_H = 146;   // ความสูงช่องละ 1 ระดับ (แนวตั้ง)
const NODE_W = 172;
const NODE_H = 96;

const ICONS = ['👤', '🧑‍💼', '👥', '🏢', '🌏'];
const ACCENT = ['#64748b', '#38bdf8', '#34d399', '#a78bfa', '#fbbf24'];
// ชื่อสั้นสำหรับแสดงบนกล่อง (ชื่อเต็มจาก rankCatalog ยาวเกินไปและตัดบรรทัดน่าเกลียด)
const SHORT_NAME: Record<number, string> = {
  0: 'สมาชิกทั่วไป',
  1: 'ตัวแทน',
  2: 'หัวหน้าหน่วย',
  3: 'ผู้จัดการศูนย์',
  4: 'ผู้จัดการภาค',
};

export type PromotionWorkflowProps = {
  currentRank: number;
  achievedAt?: Record<string, string | undefined>;
  nextRequirement?: string;
  nextRankName?: string;
  compact?: boolean;
  title?: string;
};

function stateOf(level: number, currentRank: number) {
  if (level <= currentRank) return 'passed' as const;
  if (level === currentRank + 1) return 'next' as const;
  return 'locked' as const;
}

/** แถบเล็ก สำหรับการ์ดรายชื่อผู้เลื่อนตำแหน่ง */
function CompactChain({ toRank, ringLevel }: { toRank: number; ringLevel: number }) {
  return (
    <span className="inline-flex items-center gap-1 align-middle">
      {RANK_CATALOG.map((r) => {
        const st = stateOf(r.level, toRank);
        const isRing = r.level === ringLevel;
        return (
          <span key={r.level} className="inline-flex items-center">
            {r.level > 0 && (
              <span
                className={`pw-mini-wire ${r.level <= toRank ? 'on' : 'off'}`}
                title={r.level <= toRank ? 'ขึ้นตำแหน่งแล้ว' : 'ยังไม่ขึ้นตำแหน่ง'}
              />
            )}
            <span
              title={`${r.nameTh}${st === 'passed' ? ' • ขึ้นแล้ว' : st === 'next' ? ' • เป้าหมายถัดไป' : ' • ยังไม่ถึง'}`}
              className={`px-1.5 py-0.5 rounded-md text-[10px] leading-none border ${
                st === 'passed'
                  ? 'bg-sky-500/15 border-sky-400/60 text-sky-200'
                  : st === 'next'
                    ? 'bg-amber-500/10 border-amber-400/60 border-dashed text-amber-200'
                    : 'bg-slate-800/40 border-slate-600/50 text-slate-400'
              } ${isRing ? 'ring-1 ring-white/40' : ''}`}
            >
              {ICONS[r.level]} {r.nameTh.length > 14 ? r.nameTh.slice(0, 14) + '…' : r.nameTh}
            </span>
          </span>
        );
      })}
    </span>
  );
}

export default function PromotionWorkflow({
  currentRank, achievedAt = {}, nextRequirement, nextRankName, compact = false, title,
}: PromotionWorkflowProps) {
  const [vertical, setVertical] = useState(false);
  useEffect(() => {
    const calc = () => setVertical(window.innerWidth < 900);
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  const levels = RANK_CATALOG;
  const n = levels.length;

  if (compact) {
    return (
      <span className="pw-compact">
        <style>{`
          .pw-mini-wire { display:inline-block; width:14px; height:2px; margin:0 3px; border-radius:2px; }
          .pw-mini-wire.on { background: linear-gradient(90deg, #38bdf8, #34d399, #38bdf8); background-size: 200% 100%;
            animation: pwMiniFlow 1.3s linear infinite; }
          @keyframes pwMiniFlow { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
          .pw-mini-wire.off { background: repeating-linear-gradient(90deg, #475569 0 3px, transparent 3px 6px); }
        `}</style>
        <CompactChain toRank={currentRank} ringLevel={currentRank} />
      </span>
    );
  }

  // ── เรขาคณิต: ช่องละ CELL_W (แนวนอน) หรือ CELL_H (แนวตั้ง) ──
  const totalW = vertical ? NODE_W + 60 : n * CELL_W;
  const totalH = vertical ? n * CELL_H : CELL_H;

  const nodeXY = (i: number) => {
    const cx = vertical ? totalW / 2 : i * CELL_W + CELL_W / 2;
    const cy = vertical ? i * CELL_H + CELL_H / 2 : totalH / 2;
    return { cx, cy };
  };

  // เส้นเชื่อมระหว่างระดับ i → i+1 (เป็นเบซิเยร์แบบ n8n)
  const wire = (i: number) => {
    const a = nodeXY(i);
    const b = nodeXY(i + 1);
    if (vertical) {
      const y1 = a.cy + NODE_H / 2;
      const y2 = b.cy - NODE_H / 2;
      const k = (y2 - y1) * 0.5;
      return `M ${a.cx} ${y1} C ${a.cx} ${y1 + k}, ${b.cx} ${y2 - k}, ${b.cx} ${y2}`;
    }
    const x1 = a.cx + NODE_W / 2;
    const x2 = b.cx - NODE_W / 2;
    const k = (x2 - x1) * 0.5;
    return `M ${x1} ${a.cy} C ${x1 + k} ${a.cy}, ${x2 - k} ${b.cy}, ${x2} ${b.cy}`;
  };

  return (
    <div className="pw-wrap">
      <style>{`
        @keyframes pwFlow { to { stroke-dashoffset: -120; } }
        @keyframes pwHue { 0% { filter: hue-rotate(0deg); } 100% { filter: hue-rotate(360deg); } }
        @keyframes pwPulse { 0%,100% { opacity:.35; r:3 } 50% { opacity:1; r:4.5 } }
        .pw-canvas {
          background-color:#0b1020;
          background-image: radial-gradient(rgba(148,163,184,.16) 1px, transparent 1px);
          background-size: 18px 18px;
        }
        .pw-base { stroke: #1e293b; stroke-width: 2.5; fill: none; }
        .pw-glow { stroke: url(#pwGrad); stroke-width: 9; fill: none; opacity: .16; }
        .pw-flow {
          stroke: url(#pwGrad); stroke-width: 2.6; fill: none;
          stroke-dasharray: 12 19; animation: pwFlow 1.15s linear infinite;
          stroke-linecap: round;
        }
        .pw-flow-group { animation: pwHue 7s linear infinite; }
        .pw-off { stroke: #475569; stroke-width: 2; fill: none; stroke-dasharray: 4 7; opacity: .6; }
        .pw-port { stroke-width: 1.5; }
      `}</style>

      {title && (
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <span className="font-semibold text-sm">{title}</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
            workflow สไตล์ n8n
          </span>
          <span className="text-[11px] text-slate-500">แสงไฟวิ่ง = ตำแหน่งที่ขึ้นแล้ว • ไม่มีแสงไฟ = ตำแหน่งที่จะก้าวต่อไป</span>
        </div>
      )}

      <div className="overflow-x-auto border border-slate-800 rounded-2xl pw-canvas p-3">
        <div style={{ width: totalW, height: totalH, position: 'relative', margin: '0 auto' }}>
          <svg width={totalW} height={totalH} viewBox={`0 0 ${totalW} ${totalH}`} style={{ position: 'absolute', inset: 0 }} aria-hidden>
            <defs>
              <linearGradient id="pwGrad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="55%" stopColor="#34d399" />
                <stop offset="100%" stopColor="#a78bfa" />
              </linearGradient>
            </defs>
            {levels.slice(0, n - 1).map((_, i) => {
              const active = i + 1 <= currentRank;   // ผ่านการเลื่อนขั้นนี้แล้ว → มีแสงวิ่ง
              const d = wire(i);
              return (
                <g key={i}>
                  <path d={d} className="pw-base" />
                  {active && (
                    <g className="pw-flow-group">
                      <path d={d} className="pw-glow" />
                      <path d={d} className="pw-flow" />
                    </g>
                  )}
                  {!active && <path d={d} className="pw-off" />}
                </g>
              );
            })}
          </svg>

          {levels.map((r, i) => {
            const { cx, cy } = nodeXY(i);
            const st = stateOf(r.level, currentRank);
            const isCurrent = r.level === currentRank;
            const date = achievedAt[String(r.level)];
            return (
              <div
                key={r.level}
                style={{
                  position: 'absolute',
                  left: cx - NODE_W / 2,
                  top: cy - NODE_H / 2,
                  width: NODE_W,
                  height: NODE_H,
                }}
                className={`rounded-xl border px-3 py-2 flex flex-col justify-center ${
                  st === 'passed'
                    ? 'border-sky-400/60 bg-[#0f2033] shadow-[0_0_28px_-8px_rgba(56,189,248,0.55)]'
                    : st === 'next'
                      ? 'border-dashed border-amber-400/70 bg-[#241a08]'
                      : 'border-slate-700 bg-[#0e1526] opacity-70'
                }`}
              >
                <div className="flex items-center gap-1.5">
                  <span className="text-base leading-none" style={{ color: st === 'locked' ? '#64748b' : ACCENT[r.level] }}>{ICONS[r.level]}</span>
                  <span className={`text-[12px] font-semibold ${st === 'locked' ? 'text-slate-400' : 'text-slate-100'}`}>
                    {SHORT_NAME[r.level] || r.nameTh}
                  </span>
                  {isCurrent && (
                    <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-white text-slate-900 font-bold">ปัจจุบัน</span>
                  )}
                  {st === 'next' && !isCurrent && (
                    <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-900 font-bold">เป้าหมายถัดไป</span>
                  )}
                </div>
                <div className={`mt-1 text-[10px] leading-tight ${st === 'locked' ? 'text-slate-500' : 'text-slate-400'}`}>
                  {st === 'passed' && <span className="text-emerald-300 font-semibold">✓ ขึ้นตำแหน่งแล้ว</span>}
                  {st === 'passed' && date && <span className="ml-1 text-slate-500">· {date}</span>}
                  {(st === 'next' || (st === 'locked' && !isCurrent)) && (
                    <span>{st === 'next' ? '🔓 ขั้นต่อไป' : '🔒 ยังไม่ถึง'}</span>
                  )}
                </div>
              </div>
            );
          })}

          {/* พอร์ตเข้า/ออก แบบ n8n */}
          {levels.slice(0, n - 1).map((_, i) => {
            const a = nodeXY(i);
            const b = nodeXY(i + 1);
            const active = i + 1 <= currentRank;
            return (
              <svg key={`p${i}`} width={totalW} height={totalH} viewBox={`0 0 ${totalW} ${totalH}`}
                   style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }} aria-hidden>
                <circle cx={vertical ? a.cx : a.cx + NODE_W / 2} cy={vertical ? a.cy + NODE_H / 2 : a.cy}
                        r={4} className="pw-port" fill={active ? '#38bdf8' : '#64748b'} stroke="#0b1020" />
                <circle cx={vertical ? b.cx : b.cx - NODE_W / 2} cy={vertical ? b.cy - NODE_H / 2 : b.cy}
                        r={4} className="pw-port" fill={active ? '#34d399' : '#64748b'} stroke="#0b1020" />
                {active && (
                  <circle r="3.5" fill="#e2f4ff" style={{ animation: 'pwPulse 1.4s ease-in-out infinite' }}>
                    <animateMotion dur={`${2 + i * 0.35}s`} repeatCount="indefinite" path={wire(i)} />
                  </circle>
                )}
              </svg>
            );
          })}
        </div>
      </div>

      {nextRequirement ? (
        <div className="mt-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
          <b>ขั้นต่อไป{nextRankName ? ` (${nextRankName})` : ''}:</b> {nextRequirement}
        </div>
      ) : null}
    </div>
  );
}
