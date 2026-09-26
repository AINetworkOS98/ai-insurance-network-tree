'use client';
import { useRef, useEffect, useState } from 'react';

interface AutomationPanelProps {
  mode: 'view' | 'simulating' | 'live';
  kpis: {
    total: number;
    active: number;
    onboarding: number;
    following: number;
    automation: number;
    connections: number;
  };
}

const STATUS_COLOR: Record<string, { node: string; edge: string; particle: string }> = {
  active:      { node: '#10b981', edge: '#10b981', particle: '#34d399' },
  processing:  { node: '#f59e0b', edge: '#f59e0b', particle: '#fbbf24' },
  waiting:     { node: '#94a3b8', edge: '#cbd5e1', particle: '#94a3b8' },
  attention:   { node: '#ef4444', edge: '#ef4444', particle: '#f87171' },
  automated:   { node: '#3b82f6', edge: '#3b82f6', particle: '#60a5fa' },
};

const FLOW_STEPS = [
  { label: 'Lead ใหม่',           icon: '📋', statusKey: 'pending' as const },
  { label: 'ระบบสร้าง Follow-up', icon: '🔄', statusKey: 'pending' as const },
  { label: 'แจ้งเตือนสมาชิก',      icon: '🔔', statusKey: 'pending' as const },
  { label: 'รอการตอบกลับ',        icon: '⏳', statusKey: 'pending' as const },
  { label: 'Onboarding',         icon: '🎓', statusKey: 'pending' as const },
  { label: 'เพิ่มเข้า Network',     icon: '🌱', statusKey: 'pending' as const },
  { label: 'เริ่มสร้างทีม',        icon: '🌐', statusKey: 'pending' as const },
];

const ACTIVITIES = [
  { text: 'สมาชิกใหม่ถูกเพิ่มใน Level 1',                     color: 'text-emerald-600' },
  { text: 'ระบบสร้าง Workflow ติดตาม',                       color: 'text-blue-600' },
  { text: 'สร้าง Connection ใหม่',                            color: 'text-emerald-600' },
  { text: 'Member 01 เริ่มสร้างทีม',                          color: 'text-emerald-600' },
  { text: 'ระบบจำลองสมาชิกใหม่ 5 คน',                        color: 'text-blue-600' },
  { text: 'Onboarding เสร็จสิ้น — เพิ่มเข้า Network',          color: 'text-emerald-600' },
  { text: 'Lead ใหม่เข้าสู่ระบบ',                              color: 'text-emerald-600' },
  { text: 'ระบบสร้าง Follow-up อัตโนมัติ',                   color: 'text-blue-600' },
  { text: 'แจ้งเตือนสมาชิก Level 1',                          color: 'text-amber-600' },
  { text: 'สมาชิกตอบกลับ — เริ่ม Onboarding',                 color: 'text-emerald-600' },
  { text: 'สมาชิกใหม่เริ่มสร้างทีม',                           color: 'text-emerald-600' },
  { text: 'สร้าง Connection ใหม่ — Team Flow เริ่มทำงาน',     color: 'text-emerald-600' },
  { text: 'Network ขยายตัว — 1 แตก 5 เริ่มต้น',              color: 'text-emerald-600' },
];

export default function AutomationPanel({ mode, kpis }: AutomationPanelProps) {
  const logEndRef = useRef<HTMLDivElement>(null);
  const [flowSteps, setFlowSteps] = useState(FLOW_STEPS.map(s => ({ ...s, status: 'pending' as const })));
  const [activities, setActivities] = useState<{ time: string; text: string; status: string }[]>([]);
  const [simStep, setSimStep] = useState(0);

  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [activities]);

  /* ---- Live simulation ---- */
  useEffect(() => {
    if (mode !== 'simulating') return;
    let cancelled = false;
    const stepDelay = 600;
    let idx = 0;
    const totalSteps = 12;

    const run = async () => {
      while (idx < totalSteps && !cancelled) {
        const now = new Date();
        const time = now.toTimeString().slice(0, 8);
        const item = ACTIVITIES[idx % ACTIVITIES.length];
        setActivities(prev => [...prev, { time, text: item.text, status: item.color }]);
        if (idx < FLOW_STEPS.length) {
          setFlowSteps(prev => prev.map((s, i) =>
            i <= idx ? { ...s, status: i === idx ? 'active' as const : 'done' as const } : s
          ));
        }
        idx++;
        setSimStep(idx);
        await new Promise(r => setTimeout(r, stepDelay));
      }
    };
    run();
    return () => { cancelled = true; };
  }, [mode]);

  /* ---- Reset when mode changes back to view ---- */
  useEffect(() => {
    if (mode === 'view') {
      setFlowSteps(FLOW_STEPS.map(s => ({ ...s, status: 'pending' as const })));
      setActivities([]);
      setSimStep(0);
    }
  }, [mode]);

  const statusLabel = (status: string) => {
    switch (status) {
      case 'active': return 'กำลังทำงาน';
      case 'processing': return 'กำลังดำเนินการ';
      case 'waiting': return 'รอ';
      case 'attention': return 'ต้องติดตาม';
      case 'automated': return 'อัตโนมัติ';
      default: return '-';
    }
  };

  return (
    <div className="flex flex-col h-full p-4 overflow-hidden">
      {/* ===== Header ===== */}
      <div className="mb-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">⚙️</span>
          <h2 className="text-sm font-bold text-slate-800">Automation Flow</h2>
        </div>
        <p className="text-[10px] text-slate-500">
          {mode === 'simulating' ? 'กำลังจำลองการทำงานอัตโนมัติ...' : mode === 'live' ? 'ระบบอัตโนมัติกำลังทำงาน' : 'แสดงภาพรวมระบบอัตโนมัติ'}
        </p>
      </div>

      {/* ===== KPI mini cards ===== */}
      <div className="bg-gradient-to-br from-[#f8fafc] to-white rounded-xl border border-slate-100 p-3 mb-3 shadow-sm">
        <div className="text-[10px] text-slate-500 font-medium mb-2">ตัวชี้วัด Live</div>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'สมาชิกทั้งหมด',    value: kpis.total,       color: 'text-slate-700' },
            { label: 'Active',          value: kpis.active,      color: 'text-emerald-600' },
            { label: 'กำลัง Onboarding', value: kpis.onboarding, color: 'text-amber-600' },
            { label: 'กำลังติดตาม',     value: kpis.following,  color: 'text-rose-600' },
            { label: 'Automation ทำงาน', value: kpis.automation, color: 'text-blue-600' },
            { label: 'Connections',    value: kpis.connections, color: 'text-indigo-600' },
          ].map(k => (
            <div key={k.label} className="bg-white rounded-lg border border-slate-100 p-2">
              <div className="text-[9px] text-slate-400">{k.label}</div>
              <div className={`text-sm font-bold tabular-nums ${k.color}`}>
                {k.value.toLocaleString('th-TH')}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ===== Automation Flow Steps ===== */}
      <div className="bg-gradient-to-br from-[#f8fafc] to-white rounded-xl border border-slate-100 p-3 mb-3 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-xs">🔄</span>
            <span className="text-xs font-semibold text-slate-700">Workflow Steps</span>
          </div>
          <span className="text-[9px] text-slate-400">{simStep} ขั้นตอน</span>
        </div>
        <div className="space-y-1.5">
          {flowSteps.map((step, i) => {
            const sc = step.status === 'active' ? STATUS_COLOR.active :
                       step.status === 'done' ? STATUS_COLOR.automated :
                       step.status === 'processing' ? STATUS_COLOR.processing :
                       step.status === 'pending' ? STATUS_COLOR.waiting : STATUS_COLOR.waiting;
            const isActive = step.status === 'active';
            const isDone = step.status === 'done';
            const isProcessing = step.status === 'processing';
            return (
              <div key={i} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg transition-all ${
                isActive ? 'bg-emerald-50 border border-emerald-100' :
                isDone ? 'bg-slate-50' :
                isProcessing ? 'bg-amber-50 border border-amber-100' :
                'bg-slate-50/50'
              }`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs shrink-0 ${
                  isActive ? 'bg-emerald-100 text-emerald-700' :
                  isDone ? 'bg-blue-100 text-blue-700' :
                  isProcessing ? 'bg-amber-100 text-amber-700' :
                  'bg-slate-100 text-slate-400'
                }`}>
                  {isActive ? '▶' : isDone ? '✓' : isProcessing ? '⏳' : '○'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium text-slate-700 truncate">{step.label}</div>
                  <div className="text-[9px] text-slate-400">
                    {isActive ? 'กำลังทำงาน...' : isDone ? 'เสร็จสิ้น' : isProcessing ? 'กำลังดำเนินการ' : 'รอ'}
                  </div>
                </div>
                {isActive && (
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== Activity Log ===== */}
      <div className="flex-1 bg-gradient-to-br from-[#f8fafc] to-white rounded-xl border border-slate-100 p-3 shadow-sm overflow-hidden flex flex-col min-h-0">
        <div className="flex items-center justify-between mb-2 shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs">📋</span>
            <span className="text-xs font-semibold text-slate-700">Live Activity</span>
          </div>
          <span className="text-[9px] text-slate-400">Real-time</span>
        </div>
        <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 scrollbar-none">
          {activities.length === 0 ? (
            <div className="text-[10px] text-slate-400 text-center py-4">
              {mode === 'simulating' ? 'กำลังบันทึก...' : 'ยังไม่มีกิจกรรม'}
            </div>
          ) : (
            activities.map((act, i) => (
              <div key={i} className={`flex gap-2 text-xs py-1.5 px-2 rounded-lg bg-white/60 border border-slate-100 ${act.status}`}>
                <div className="text-[9px] text-slate-400 font-mono w-14 shrink-0">{act.time}</div>
                <div className="flex-1 min-w-0">
                  <div className={`truncate ${act.status}`}>{act.text}</div>
                </div>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      </div>

      {/* ========================================
          Network Status Legend
          ======================================== */}
      <div className="mt-3 pt-3 border-t border-slate-100">
        <div className="text-[10px] text-slate-500 font-medium mb-2">Network Status</div>
        <div className="grid grid-cols-2 gap-1.5">
          {[
            { label: 'Active',         color: '#10b981', dot: 'bg-emerald-500' },
            { label: 'Processing',     color: '#f59e0b', dot: 'bg-amber-400' },
            { label: 'Automated',      color: '#3b82f6', dot: 'bg-blue-500' },
            { label: 'Waiting',        color: '#94a3b8', dot: 'bg-slate-400' },
            { label: 'Attention',      color: '#ef4444', dot: 'bg-red-500' },
          ].map(s => (
            <div key={s.label} className="flex items-center gap-1.5 bg-white rounded-lg border border-slate-100 px-2 py-1">
              <div className={`w-2 h-2 rounded-full ${s.dot}`} />
              <span className="text-[9px] text-slate-500">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ========================================
          Flow Toggle
          ======================================== */}
      <div className="mt-3 pt-3 border-t border-slate-100">
        <div className="text-[10px] text-slate-500 font-medium mb-2">สายงาน Automation</div>
        <div className="space-y-1">
          {[
            { id: 'lead',   label: 'Lead Flow',       icon: '📋', color: 'border-l-emerald-400' },
            { id: 'member', label: 'Member Flow',     icon: '👤', color: 'border-l-sky-400' },
            { id: 'team',   label: 'Team Flow',       icon: '🌐', color: 'border-l-violet-400' },
            { id: 'mgmt',   label: 'Management Flow', icon: '⚡', color: 'border-l-amber-400' },
          ].map(f => (
            <button key={f.id} className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-lg border-l-2 text-xs font-medium transition-all border-l-transparent ${
              'bg-white/60 text-slate-600 hover:bg-white/80'
            }`}>
              <span>{f.icon}</span>
              <span>{f.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ========================================
          Simulation Controls
          ======================================== */}
      <div className="mt-3 pt-3 border-t border-slate-100">
        <div className="text-[10px] text-slate-500 font-medium mb-2">Simulation Controls</div>
        <div className="space-y-1.5">
          <button className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 shadow transition">
            ▶ เริ่มจำลอง
          </button>
          <div className="flex gap-1.5">
            {(['1x', '2x', '5x', '10x'] as const).map(s => (
              <button key={s} className="flex-1 px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 shadow transition">
                {s}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <button className="flex-1 px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 shadow transition">
              ⏸ หยุด
            </button>
            <button className="flex-1 px-2 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-600 hover:bg-slate-50 shadow transition">
              🔄 เริ่มใหม่
            </button>
          </div>
        </div>
      </div>

      {/* ========================================
          Simulation vs Live Badge
          ======================================== */}
      <div className={`mt-3 pt-3 border-t border-slate-100 rounded-lg p-2 text-center text-[10px] font-bold ${
        mode === 'simulating' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
        mode === 'live' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
        'bg-slate-50 text-slate-500 border border-slate-200'
      }`}>
        <span className="inline-flex items-center gap-1">
          {mode === 'simulating' ? '🟡 SIMULATION' : mode === 'live' ? '🟢 LIVE' : '⚪ VIEW'}
        </span>
        <div className="text-[9px] opacity-70">
          {mode === 'simulating' ? 'กำลังทดลองอนาคต — ไม่สร้างข้อมูลจริง' : mode === 'live' ? 'ระบบอัตโนมัติทำงานกับข้อมูลจริง' : 'แสดงโครงสร้างเครือข่าย'}
        </div>
      </div>

      {/* Footer */}
      <div className="mt-3 pt-2 text-[9px] text-slate-400 text-center shrink-0">
        n8n Workflow Style · ระบบอัตโนมัติ
      </div>
    </div>
  );
}
