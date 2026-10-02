'use client';
import { useEffect, useRef, useState, useCallback, useMemo } from 'react';

/* ================================================================
   AutomationNetwork — Radial Network / n8n Workflow Flow
   แสดงโครงสร้างทีมแบบวงกลมหลายชั้น พร้อม Connection 선ที่มี Animation
   ================================================================ */

/* ---------- Node type (Automation Node แบบ n8n Block) ---------- */
interface AutoNode {
  id: string;
  label: string;       // 🌐 Lead, 🟢 สมาชิกใหม่, etc.
  subtitle: string;    // Member #102, Level 2
  level: number;       // 0 = root (ฉัน), 1 = L1, 2 = L2...
  slot: number;        // ตำแหน่งใน ring
  status: 'active' | 'processing' | 'waiting' | 'attention' | 'automated';
  memberId?: string;
  children?: string[]; // IDs ของลูก
  parentId?: string;
}

/* ---------- Connection (Edge) ---------- */
interface AutoEdge {
  id: string;
  from: string;
  to: string;
  status: 'active' | 'processing' | 'automated' | 'waiting' | 'attention';
}

/* ---------- Automation Flow steps (Panel ด้านข้าง) ---------- */
interface FlowStep {
  label: string;
  status: 'done' | 'active' | 'pending' | 'processing';
  icon: string;
}

type SimulationSpeed = 1 | 2 | 5 | 10;
type ViewMode = 'view' | 'simulating' | 'live';

interface AutomationNetworkProps {
  mode: ViewMode;
  speed: SimulationSpeed;
  showAutomation: boolean;
  showArchitecture: boolean;
  onKpiUpdate: (kpis: KPIData) => void;
  onSimulationDone: () => void;
  onSimulationProgress: (kpis: KPIData) => void;
}

interface KPIData {
  total: number;
  active: number;
  onboarding: number;
  following: number;
  automation: number;
  connections: number;
}

const STATUS_COLOR: Record<AutoNode['status'], { node: string; edge: string; particle: string; glow: string }> = {
  active:      { node: '#10b981', edge: '#10b981', particle: '#34d399', glow: 'rgba(16,185,129,0.4)' },
  processing:  { node: '#f59e0b', edge: '#f59e0b', particle: '#fbbf24', glow: 'rgba(245,158,11,0.4)' },
  waiting:     { node: '#94a3b8', edge: '#cbd5e1', particle: '#94a3b8', glow: 'rgba(148,163,176,0.2)' },
  attention:   { node: '#ef4444', edge: '#ef4444', particle: '#f87171', glow: 'rgba(239,68,68,0.5)' },
  automated:   { node: '#3b82f6', edge: '#3b82f6', particle: '#60a5fa', glow: 'rgba(59,130,246,0.4)' },
};

const FLOW_STEPS: FlowStep[] = [
  { label: 'Lead ใหม่',             status: 'pending',  icon: '📋' },
  { label: 'ระบบสร้าง Follow-up',   status: 'pending',  icon: '🔄' },
  { label: 'แจ้งเตือนสมาชิก',       status: 'pending',  icon: '🔔' },
  { label: 'รอการตอบกลับ',         status: 'pending',  icon: '⏳' },
  { label: 'Onboarding',           status: 'pending',  icon: '🎓' },
  { label: 'เพิ่มเข้า Network',      status: 'pending',  icon: '🌱' },
  { label: 'เริ่มสร้างทีม',         status: 'pending',  icon: '🌐' },
];

/* ---------- Demo members ---------- */
const DEMO_MEMBERS: AutoNode[] = [
  { id: 'me', label: '👤 ฉัน', subtitle: 'ROOT', level: 0, slot: 0, status: 'active', children: [] },
];

function makeDemoL1(): AutoNode[] {
  const names = ['สมาชิก #01', 'สมาชิก #02', 'สมาชิก #03', 'สมาชิก #04', 'สมาชิก #05'];
  return names.map((n, i) => ({
    id: `l1-${i}`, label: '🟢 ' + n, subtitle: `Level 1 · Slot ${i+1}`, level: 1, slot: i,
    status: i < 3 ? 'active' : i === 3 ? 'processing' : 'waiting',
    memberId: `MEM${String(100+i).padStart(6,'0')}`,
    children: [],
    parentId: 'me',
  }));
}

function makeDemoInner(parentId: string, prefix: string, n: number, startIdx: number): AutoNode[] {
  const names = [
    'Member A', 'Member B', 'Member C', 'Member D', 'Member E',
  ];
  return names.slice(0, n).map((name, i) => ({
    id: `${prefix}-${startIdx+i}`,
    label: '🟢 ' + name,
    subtitle: `Level ${(parentId.match(/\d+/)?.[0] as unknown as number) + 1} · ${i+1}`,
    level: parseInt(parentId.replace(/[^0-9]/g, '')) || 2,
    slot: i,
    status: i < 2 ? 'active' : i === 2 ? 'automated' : 'waiting',
    memberId: `MEM${String(200+startIdx+i).padStart(6,'0')}`,
    children: [],
    parentId,
  }));
}

export default function AutomationNetwork({
  mode, speed, showAutomation, showArchitecture, onKpiUpdate, onSimulationDone, onSimulationProgress,
}: AutomationNetworkProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [nodes, setNodes] = useState<AutoNode[]>(() => {
    const base = [...DEMO_MEMBERS];
    const l1 = makeDemoL1();
    base[0].children = l1.map(n => n.id);
    l1.forEach(n => n.parentId = 'me');
    return [...base, ...l1];
  });
  const [edges, setEdges] = useState<AutoEdge[]>(() => {
    const me = nodes.find(n => n.id === 'me')!;
    return (me.children || []).map(id => ({
      id: `e-me-${id}`,
      from: 'me',
      to: id,
      status: 'active',
    }));
  });
  const [flowSteps, setFlowSteps] = useState<FlowStep[]>([...FLOW_STEPS]);
  const [activityLog, setActivityLog] = useState<{ time: string; text: string; color: string }[]>([]);
  const [highlightEdge, setHighlightEdge] = useState<string | null>(null);
  const [nodePulse, setNodePulse] = useState<string | null>(null);
  const [networkScale, setNetworkScale] = useState(1);
  const animRef = useRef<number>(0);
  const logRef = useRef<HTMLDivElement>(null);

  const kpiRef = useRef<KPIData>({ total: 1, active: 1, onboarding: 0, following: 0, automation: 0, connections: 0 });

  /* ---- Radial positions ---- */
  const positions = useMemo(() => {
    const pos = new Map<string, { x: number; y: number; r: number }>();
    const root = nodes.find(n => n.level === 0)!;
    pos.set(root.id, { x: 0, y: 0, r: 38 });

    const rings: Map<number, AutoNode[]> = new Map();
    for (const n of nodes) {
      if (n.level === 0) continue;
      if (!rings.has(n.level)) rings.set(n.level, []);
      rings.get(n.level)!.push(n);
    }

    let radius = 90;
    for (const [level, levelNodes] of rings.entries()) {
      const count = levelNodes.length || 1;
      const arc = (Math.PI * 2) / count;
      const startAngle = -Math.PI / 2;
      levelNodes.forEach((n, i) => {
        const angle = startAngle + i * arc;
        pos.set(n.id, {
          x: radius * Math.cos(angle),
          y: radius * Math.sin(angle),
          r: 22,
        });
      });
      radius += 72;
    }
    return pos;
  }, [nodes]);

  /* ---- KPI calculation ---- */
  const calcKpis = useCallback((): KPIData => {
    const total = nodes.length;
    const active = nodes.filter(n => n.status === 'active' || n.status === 'automated').length;
    const onboarding = nodes.filter(n => n.status === 'processing').length;
    const following = nodes.filter(n => n.status === 'attention').length;
    const automation = edges.filter(e => e.status === 'automated' || e.status === 'active').length;
    return {
      total,
      active,
      onboarding,
      following,
      automation,
      connections: edges.length,
    };
  }, [nodes, edges]);

  useEffect(() => { onKpiUpdate(calcKpis()); }, [nodes, edges, calcKpis, onKpiUpdate]);

  /* ---- Particle animation frame ---- */
  const [particlePositions, setParticlePositions] = useState<Map<string, { t: number; offset: number }>>(() => new Map());

  useEffect(() => {
    if (mode !== 'simulating' && !showAutomation) return;
    let running = true;
    const baseSpeed = mode === 'simulating' ? 800 / speed : 1200;

    const frame = () => {
      if (!running) return;
      const next = new Map<string, { t: number; offset: number }>();
      edges.forEach(e => {
        const fromPos = positions.get(e.from);
        const toPos = positions.get(e.to);
        if (!fromPos || !toPos) return;
        const key = e.id;
        const prev = particlePositions.get(key) || { t: Math.random(), offset: 0 };
        const t = (prev.t + 0.002 * speed) % 1;
        next.set(key, { t, offset: prev.offset });
      });
      setParticlePositions(next);
      animRef.current = requestAnimationFrame(frame);
    };
    animRef.current = requestAnimationFrame(frame);
    return () => { running = false; cancelAnimationFrame(animRef.current); };
  }, [edges, positions, mode, speed, showAutomation, particlePositions]);

  /* ---- Log helper ---- */
  const addLog = useCallback((text: string, color: string) => {
    const now = new Date();
    const time = now.toTimeString().slice(0, 8);
    setActivityLog(prev => [...prev, { time, text, color }]);
    setTimeout(() => {
      if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
    }, 50);
  }, []);

  /* ---- Simulation ---- */
  const runSimulation = useCallback(async () => {
    if (mode !== 'view') return;
    setFlowSteps(FLOW_STEPS.map(s => ({ ...s, status: 'pending' as const })));
    setActivityLog([]);
    kpiRef.current = { total: 1, active: 1, onboarding: 0, following: 0, automation: 0, connections: 0 };
    onSimulationProgress(kpiRef.current);

    /* Step 1: Lead */
    const stepDelay = 600 / speed;
    await new Promise(r => setTimeout(r, stepDelay));
    setFlowSteps(prev => prev.map((s, i) => i === 0 ? { ...s, status: 'active' as const } : s));
    addLog('🟢 Lead ใหม่เข้าสู่ระบบ', '#10b981');
    kpiRef.current.following = 1;
    onSimulationProgress({ ...kpiRef.current });

    await new Promise(r => setTimeout(r, stepDelay));
    setFlowSteps(prev => prev.map((s, i) => i === 1 ? { ...s, status: 'active' as const } : s));
    addLog('🔄 ระบบสร้าง Follow-up อัตโนมัติ', '#3b82f6');
    kpiRef.current.automation = 1;
    onSimulationProgress({ ...kpiRef.current });

    await new Promise(r => setTimeout(r, stepDelay));
    setFlowSteps(prev => prev.map((s, i) => i === 2 ? { ...s, status: 'active' as const } : s));
    addLog('🔔 แจ้งเตือนสมาชิก Level 1', '#f59e0b');
    onSimulationProgress({ ...kpiRef.current });

    await new Promise(r => setTimeout(r, stepDelay * 2));
    setFlowSteps(prev => prev.map((s, i) => i === 3 ? { ...s, status: 'processing' as const } : s));
    addLog('⏳ รอการตอบกลับจากสมาชิก...', '#94a3b8');
    onSimulationProgress({ ...kpiRef.current });

    /* Step 2: 新成员加入 */
    await new Promise(r => setTimeout(r, stepDelay * 2));
    setFlowSteps(prev => prev.map((s, i) => i === 3 ? { ...s, status: 'done' as const } : s));
    addLog('✅ สมาชิกตอบกลับ — เริ่ม Onboarding', '#10b981');

    setFlowSteps(prev => prev.map((s, i) => i === 4 ? { ...s, status: 'active' as const } : s));

    /* สร้างสมาชิก L1 คนใหม่ */
    const newL1: AutoNode[] = [];
    for (let i = 0; i < 2; i++) {
      const id = `l1-new-${i}`;
      const m: AutoNode = {
        id,
        label: `🟢 สมาชิกใหม่ #${100 + i}`,
        subtitle: `Level 1 · Slot ${i + 1}`,
        level: 1,
        slot: i + 3,
        status: 'active',
        memberId: `MEM${String(300 + i).padStart(6, '0')}`,
        children: [],
        parentId: 'me',
      };
      newL1.push(m);
    }

    setNodes(prev => {
      const next = [...prev];
      const me = next.find(n => n.id === 'me')!;
      me.children = [...(me.children || []), ...newL1.map(n => n.id)];
      return [...next, ...newL1];
    });

    const newEdges: AutoEdge[] = newL1.map((n, i) => ({
      id: `e-me-${n.id}`,
      from: 'me',
      to: n.id,
      status: 'active',
    }));
    setEdges(prev => [...prev, ...newEdges]);
    setHighlightEdge(newEdges[0]?.id || null);
    setNodePulse(newL1[0]?.id || null);
    kpiRef.current.total += 2;
    kpiRef.current.active += 2;
    kpiRef.current.connections += 2;
    kpiRef.current.automation += 2;
    onSimulationProgress({ ...kpiRef.current });

    await new Promise(r => setTimeout(r, stepDelay));
    setFlowSteps(prev => prev.map((s, i) => i === 4 ? { ...s, status: 'done' as const } : s));
    addLog('🎓 Onboarding เสร็จสิ้น — เพิ่มเข้า Network', '#34d399');
    setNodePulse(null);
    setHighlightEdge(null);

    await new Promise(r => setTimeout(r, stepDelay));
    setFlowSteps(prev => prev.map((s, i) => i === 5 ? { ...s, status: 'active' as const } : s));
    addLog('🌱 สมาชิกใหม่เริ่มสร้างทีม', '#10b981');

    /* สร้างลูกของสมาชิกใหม่ (L2) */
    await new Promise(r => setTimeout(r, stepDelay * 2));
    const l2Nodes: AutoNode[] = [];
    const l2Edges: AutoEdge[] = [];
    newL1.slice(0, 1).forEach((parent, pi) => {
      for (let j = 0; j < 3; j++) {
        const id = `l2-${pi}-${j}`;
        const m: AutoNode = {
          id,
          label: `🟢 ${['Member A', 'Member B', 'Member C'][j]}`,
          subtitle: `Level 2 · ${j + 1}`,
          level: 2,
          slot: j,
          status: j === 0 ? 'active' : 'waiting',
          memberId: `MEM${String(400 + pi * 10 + j).padStart(6, '0')}`,
          children: [],
          parentId: parent.id,
        };
        l2Nodes.push(m);
        l2Edges.push({ id: `e-${parent.id}-${id}`, from: parent.id, to: id, status: 'active' });
      }
    });

    setNodes(prev => {
      const next = [...prev];
      l2Nodes.forEach(n => {
        const p = next.find(x => x.id === n.parentId);
        if (p) p.children = [...(p.children || []), n.id];
      });
      return [...next, ...l2Nodes];
    });
    setEdges(prev => [...prev, ...l2Edges]);
    kpiRef.current.total += l2Nodes.length;
    kpiRef.current.connections += l2Edges.length;
    kpiRef.current.active += 1;
    setHighlightEdge(l2Edges[0]?.id || null);
    setNodePulse(l2Nodes[0]?.id || null);
    onSimulationProgress({ ...kpiRef.current });

    addLog('🌐 สร้าง Connection ใหม่ — Team Flow เริ่มทำงาน', '#34d399');
    await new Promise(r => setTimeout(r, stepDelay));
    setFlowSteps(prev => prev.map((s, i) => i === 6 ? { ...s, status: 'active' as const } : s));
    addLog('🚀 Network ขยายตัว — 1 แตก 5 เริ่มต้น', '#10b981');

    setNodePulse(null);
    setHighlightEdge(null);
    await new Promise(r => setTimeout(r, stepDelay * 2));
    setFlowSteps(prev => prev.map(s => ({ ...s, status: 'done' as const })));
    addLog('✅ การจำลองเสร็จสิ้น — Network พร้อมขยายต่อ', '#34d399');
    kpiRef.current.automation += 5;
    onSimulationProgress({ ...kpiRef.current });
    onSimulationDone();
  }, [mode, speed, addLog, onSimulationProgress, onSimulationDone]);

  /* ---- Render node block (n8n-style) ---- */
  function renderNodeSVG(m: AutoNode, pos: { x: number; y: number; r: number }) {
    const sc = STATUS_COLOR[m.status];
    const isMe = m.level === 0;
    const nodeR = isMe ? 38 : 22;
    const transform = `translate(${pos.x},${pos.y})`;

    return (
      <g key={m.id} transform={transform} className="cursor-pointer" style={{ transition: 'transform 0.4s cubic-bezier(0.34,1.56,0.64,1)' }}>
        {/* Glow */}
        {nodePulse === m.id && (
          <circle r={nodeR + 8} fill="none" stroke={sc.glow} strokeWidth={6} opacity={0.6}
            className="animate-ping" style={{ animationDuration: '1.5s', animationIterationCount: '1' }} />
        )}
        {/* Shadow */}
        <circle r={nodeR + 1} fill="rgba(0,0,0,0.08)" className="select-none" />
        {/* Node body */}
        <rect
          x={-nodeR} y={-nodeR * 0.7}
          width={nodeR * 2} height={nodeR * 1.4}
          rx={nodeR * 0.35}
          fill="white" stroke={sc.node} strokeWidth={isMe ? 3 : 2}
          filter="url(#nodeShadow)"
          className="transition-all duration-300 hover:scale-105"
          style={{ transformOrigin: `${pos.x}px ${pos.y}px` }}
        />
        {/* Status dot */}
        <circle cx={nodeR * 0.75} cy={-nodeR * 0.55} r={4} fill={sc.node}
          className={m.status === 'processing' ? 'animate-pulse' : ''}
          style={{ animationDuration: m.status === 'processing' ? '1.5s' : '' }} />
        {/* Icon / Label */}
        <text x={0} y={-4} textAnchor="middle" fontSize={isMe ? 11 : 8} fontWeight={700}
          fill="#475569" className="select-none">
          {isMe ? 'ฉัน' : m.label.replace(/[🟢👤]/g, '').trim()}
        </text>
        {/* Subtitle */}
        <text x={0} y={8} textAnchor="middle" fontSize={7} fill="#94a3b8" className="select-none">
          {m.subtitle}
        </text>
        {/* Input/Output ports */}
        <circle cx={-nodeR * 0.85} cy={0} r={3} fill="#e2e8f0" stroke="#cbd5e1" strokeWidth={1} />
        <circle cx={nodeR * 0.85} cy={0} r={3} fill={sc.node} stroke="white" strokeWidth={1} />
        {/* Level ring indicator */}
        {m.level > 0 && (
          <text x={0} y={nodeR * 0.7 + 6} textAnchor="middle" fontSize={6} fill="#cbd5e1" className="select-none">
            L{m.level}
          </text>
        )}
      </g>
    );
  }

  /* ---- Render edge with particle ---- */
  function renderEdge(e: AutoEdge) {
    const fromPos = positions.get(e.from);
    const toPos = positions.get(e.to);
    if (!fromPos || !toPos) return null;
    const sc = STATUS_COLOR[e.status];
    const dx = toPos.x - fromPos.x;
    const dy = toPos.y - fromPos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const isHighlight = highlightEdge === e.id;

    return (
      <g key={e.id}>
        {/* Base line */}
        <line
          x1={fromPos.x} y1={fromPos.y}
          x2={toPos.x} y2={toPos.y}
          stroke={isHighlight ? '#fcd34d' : sc.edge}
          strokeWidth={isHighlight ? 3 : 1.5}
          strokeDasharray={e.status === 'waiting' ? '4 3' : 'none'}
          opacity={e.status === 'waiting' ? 0.35 : e.status === 'attention' ? 0.8 : 0.7}
          className="transition-all duration-500"
          markerEnd="url(#arrowHead)"
        />
        {/* Glow line (highlight) */}
        {isHighlight && (
          <line x1={fromPos.x} y1={fromPos.y} x2={toPos.x} y2={toPos.y}
            stroke="#fcd34d" strokeWidth={6} opacity={0.3}
            filter="url(#nodeGlow)" className="transition-all duration-500" />
        )}
        {/* Particle */}
        {showAutomation && e.status !== 'waiting' && (
          <circle
            cx={fromPos.x} cy={fromPos.y}
            r={2}
            fill={sc.particle}
            opacity={0.9}
            style={{
              animation: `flowParticle ${Math.max(600, 1200 / speed)}ms linear infinite`,
              animationDelay: '0s',
              transform: `translate(${dx * 0}px, ${dy * 0}px)`,
            }}
            ref={(el) => {
              if (el) {
                el.style.transform = `translate(0px,0px)`;
              }
            }}
          />
        )}
        {/* Pulse for attention */}
        {e.status === 'attention' && (
          <line x1={fromPos.x} y1={fromPos.y} x2={toPos.x} y2={toPos.y}
            stroke={sc.edge} strokeWidth={4} opacity={0.3}
            className="animate-pulse" style={{ animationDuration: '1.2s' }} />
        )}
        {/* Processing pulse */}
        {e.status === 'processing' && (
          <line x1={fromPos.x} y1={fromPos.y} x2={toPos.x} y2={toPos.y}
            stroke={sc.edge} strokeWidth={2} opacity={0.5}
            strokeDasharray="2 6" className="animate-pulse" style={{ animationDuration: '2s' }} />
        )}
      </g>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-gradient-to-br from-[#f0f7ff] via-[#f8fafc] to-[#fcfdff]">
      <svg ref={svgRef} viewBox="-500 -400 1000 800" className="w-full h-full">
        <defs>
          <filter id="nodeShadow" x="-50%" y="-50%" width="200%" height="200%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#475569" floodOpacity="0.15" />
          </filter>
          <filter id="nodeGlow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="6" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <marker id="arrowHead" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#93c5fd" />
          </marker>
          <style>{`
            @keyframes flowParticle {
              0% { transform: translate(0,0); opacity: 0; }
              5% { opacity: 1; }
              95% { opacity: 1; }
              100% { transform: translate(var(--dx), var(--dy)); opacity: 0; }
            }
            .flow-particle { animation: flowParticle 1.2s linear infinite; }
          `}</style>
        </defs>

        {/* Ring guides (background) */}
        {(() => {
          const rings = [90, 162, 234, 306, 378];
          return rings.map((r, i) => (
            <circle key={i} cx={0} cy={0} r={r} fill="none"
              stroke="rgba(148,163,176,0.12)" strokeWidth={1} strokeDasharray="3 4" />
          ));
        })()}

        {/* Center "ฉัน" label */}
        <text x={0} y={-50} textAnchor="middle" fontSize={10} fill="#94a3b8" fontWeight={600} className="select-none">
          Level 0 · ROOT
        </text>

        {/* Edges */}
        {edges.map(renderEdge)}

        {/* Nodes */}
        {nodes.map(m => {
          const pos = positions.get(m.id);
          if (!pos) return null;
          return renderNodeSVG(m, pos);
        })}

        {/* Automation legend */}
        <g transform="translate(-460, -370)">
          <rect x={0} y={0} width={180} height={72} rx={8} fill="white" fillOpacity={0.85} stroke="#e2e8f0" strokeWidth={1} filter="url(#nodeShadow)" />
          <text x={10} y={16} fontSize={9} fontWeight={700} fill="#475569" className="select-none">⚡ Automation Status</text>
          {[
            { color: '#10b981', label: 'Active' },
            { color: '#f59e0b', label: 'Processing' },
            { color: '#3b82f6', label: 'Automated' },
            { color: '#94a3b8', label: 'Waiting' },
            { color: '#ef4444', label: 'Attention' },
          ].map((s, i) => (
            <g key={i} transform={`translate(10, ${26 + i * 10})`}>
              <circle cx={6} cy={0} r={4} fill={s.color} />
              <text x={14} y={3} fontSize={8} fill="#64748b" className="select-none">{s.label}</text>
            </g>
          ))}
        </g>
      </svg>

      {/* Simulation overlay message */}
      {mode === 'simulating' && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-10 pointer-events-none">
          <div className="bg-white/90 backdrop-blur rounded-2xl px-6 py-3 shadow-2xl border border-sky-100 text-center">
            <div className="text-sm font-bold text-sky-700">ระบบกำลังจำลองการไหลของงาน</div>
            <div className="text-[10px] text-slate-500 mt-1">Lead → Follow-up → Onboarding → Member → Team → Network</div>
          </div>
        </div>
      )}
    </div>
  );
}
