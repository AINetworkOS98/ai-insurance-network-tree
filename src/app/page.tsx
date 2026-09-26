'use client';
import { useEffect, useRef, useState, useCallback } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import AutomationNetwork from '@/components/AutomationNetwork';

type Mode = 'view' | 'simulating' | 'live';
type Speed = 1 | 2 | 5 | 10;

interface KPIs {
  total: number;
  active: number;
  onboarding: number;
  following: number;
  automation: number;
  connections: number;
}

const KPIIMES = [
  { label: 'สมาชิกทั้งหมด', key: 'total' },
  { label: 'Active', key: 'active' },
  { label: 'กำลัง Onboarding', key: 'onboarding' },
  { label: 'กำลังติดตาม', key: 'following' },
  { label: 'Automation ที่กำลังทำงาน', key: 'automation' },
  { label: 'Connections', key: 'connections' },
];

export default function Home() {
  const [mode, setMode] = useState<Mode>('view');
  const [speed, setSpeed] = useState<Speed>(1);
  const [showAutomation, setShowAutomation] = useState(true);
  const [showArchitecture, setShowArchitecture] = useState(false);
  const [kpis, setKpis] = useState<KPIs>({
    total: 1,
    active: 1,
    onboarding: 0,
    following: 0,
    automation: 0,
    connections: 0,
  });
  const [selectedFlow, setSelectedFlow] = useState<string | null>(null);

  const handleStart = useCallback((s: Speed) => {
    setMode('simulating');
    setSpeed(s);
  }, []);

  const handleStop = useCallback(() => {
    setMode('view');
  }, []);

  const handleReset = useCallback(() => {
    setKpis({ total: 1, active: 1, onboarding: 0, following: 0, automation: 0, connections: 0 });
    setMode('view');
    setShowArchitecture(false);
  }, []);

  const handleLiveUpdate = useCallback((kpis: KPIs) => { setKpis(kpis); }, []);
  const toggleFlow = useCallback((flow: string) => { setSelectedFlow(selectedFlow === flow ? null : flow); }, [selectedFlow]);

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      <Header />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="px-4 md:px-6 pt-4 pb-2 shrink-0">
            <div className="mb-3">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <span className="text-lg">🌟</span>
                <span className="font-semibold">วิสัยทัศน์:</span>
                <span className="font-bold text-[#475569]">อิสรภาพทางการเงิน</span>
              </div>
              <div className="mt-1 text-sm leading-relaxed text-slate-600 max-w-3xl">
                <span className="font-semibold text-slate-800">“จากการสร้างทีม → สู่ระบบที่ทำงานต่อเนื่อง”</span>
                <br />
                <span className="text-slate-500">
                  เมื่อเครือข่ายเติบโต การทำงานไม่ควรเพิ่มขึ้นตามจำนวนสมาชิกแบบตรง ๆ
                  ระบบ Automation จะช่วยจัดการงานที่ทำซ้ำ เช่น การแจ้งเตือน การติดตาม การ Onboarding และการอัปเดตข้อมูล
                </span>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mb-3">
              {KPIIMES.map(k => {
                const val = kpis[k.key as keyof KPIs];
                return (
                  <div key={k.key} className="rounded-xl border bg-gradient-to-br from-[#f8fafc] to-white px-3 py-2.5 shadow-sm hover:shadow-md transition-shadow">
                    <div className="text-[10px] text-slate-500 font-medium">{k.label}</div>
                    <div className="text-xl font-bold text-[#475569] mt-0.5 tabular-nums">{val.toLocaleString('th-TH')}</div>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold shadow-sm ${
                mode === 'live' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
                mode === 'simulating' ? 'bg-amber-100 text-amber-700 border border-amber-200' :
                'bg-slate-100 text-slate-600 border border-slate-200'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${
                  mode === 'live' ? 'bg-emerald-500 animate-pulse' :
                  mode === 'simulating' ? 'bg-amber-500 animate-pulse' : 'bg-slate-400'
                }`} />
                {mode === 'live' ? 'LIVE' : mode === 'simulating' ? 'SIMULATION' : 'VIEW'}
              </span>
              {mode === 'simulating' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-medium shadow-sm">
                  🚀 กำลังจำลองการไหลของงาน
                </span>
              )}
              {showArchitecture && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-50 text-purple-700 border border-purple-200 text-[11px] font-medium shadow-sm">
                  ⚙️ Automation Architecture
                </span>
              )}
            </div>
          </div>

          <div className="flex-1 flex min-h-0 relative">
            <div className="flex-1 relative min-h-0 overflow-hidden bg-gradient-to-br from-[#f0f7ff] via-[#f8fafc] to-[#fcfdff]">
              <AutomationNetwork
                mode={mode}
                speed={speed}
                showAutomation={showAutomation}
                showArchitecture={showArchitecture}
                onKpiUpdate={handleLiveUpdate}
                onSimulationDone={() => setMode('view')}
                onSimulationProgress={(kpis) => setKpis(kpis)}
              />
              <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 max-w-[200px]">
                {[
                  { id: 'lead',   label: 'Lead Flow',        icon: '📋', color: 'border-l-emerald-400' },
                  { id: 'member', label: 'Member Flow',      icon: '👤', color: 'border-l-sky-400' },
                  { id: 'team',   label: 'Team Flow',        icon: '🌐', color: 'border-l-violet-400' },
                  { id: 'mgmt',   label: 'Management Flow',  icon: '⚡', color: 'border-l-amber-400' },
                ].map(f => (
                  <button key={f.id} onClick={() => toggleFlow(f.id)}
                    className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border-l-2 text-[11px] font-medium transition-all ${
                      selectedFlow === f.id ? 'bg-white/90 shadow-md text-slate-800 ' + f.color : 'bg-white/60 text-slate-500 hover:bg-white/80 hover:text-slate-700 border-l-transparent'
                    }`}>
                    <span>{f.icon}</span><span>{f.label}</span>
                    {selectedFlow === f.id && <span className="ml-auto text-[9px] text-slate-400">เปิด</span>}
                  </button>
                ))}
              </div>
              <div className="absolute bottom-3 left-3 right-3 z-10 flex flex-wrap items-center gap-2">
                {mode === 'simulating' ? (
                  <>
                    <button onClick={handleStop} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-100 text-red-700 text-xs font-semibold border border-red-200 hover:bg-red-200 shadow transition">
                      <span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> ⏸ หยุด
                    </button>
                    <span className="text-[10px] text-slate-400 ml-1">ความเร็ว: {speed}x</span>
                    <button onClick={() => setSpeed(2 as Speed)} className={`px-2 py-1 rounded text-[10px] ${speed===2?'bg-emerald-100 text-emerald-700':'bg-slate-50 text-slate-600 border'}`}>2x</button>
                    <button onClick={() => setSpeed(5 as Speed)} className={`px-2 py-1 rounded text-[10px] ${speed===5?'bg-emerald-100 text-emerald-700':'bg-slate-50 text-slate-600 border'}`}>5x</button>
                    <button onClick={() => setSpeed(10 as Speed)} className={`px-2 py-1 rounded text-[10px] ${speed===10?'bg-emerald-100 text-emerald-700':'bg-slate-50 text-slate-600 border'}`}>10x</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => handleStart(1)} className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 shadow transition">▶ เริ่มจำลอง</button>
                    <button onClick={() => setShowAutomation(!showAutomation)} className={`px-3 py-1.5 rounded-full text-xs font-medium border shadow transition ${showAutomation ? 'bg-sky-100 text-sky-700 border-sky-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                      👁 {showAutomation ? 'ซ่อน' : 'แสดง'} Automation
                    </button>
                  </>
                )}
                <button onClick={() => setShowArchitecture(!showArchitecture)} className={`px-3 py-1.5 rounded-full text-xs font-medium border shadow transition ${showArchitecture ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                  ⚙️ ดู Architecture
                </button>
                {mode !== 'simulating' && (
                  <button onClick={handleReset} className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-slate-500 text-xs font-medium hover:bg-slate-50 shadow transition ml-auto">🔄 รีเซ็ต</button>
                )}
                <div className="ml-auto text-[10px] text-slate-400">1 แตก 5 · Radial Network · n8n Workflow Style</div>
              </div>
              {showArchitecture && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 backdrop-blur-sm">
                  <div className="max-w-3xl w-full mx-4 rounded-2xl bg-white border border-slate-200 shadow-2xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-bold text-[#475569]">⚙️ Automation Architecture — n8n Workflow</h3>
                      <button onClick={() => setShowArchitecture(false)} className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 text-lg">✕</button>
                    </div>
                    <ArchitectureDiagram />
                  </div>
                </div>
              )}
            </div>
            <div className="w-80 shrink-0 border-l border-slate-100 bg-white/95 backdrop-blur overflow-y-auto flex flex-col">
              <AutomationPanel mode={mode} kpis={kpis} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ArchitectureDiagram() {
  const steps = [
    { label: 'Lead',         desc: 'ผู้สนใจใหม่',     colorClass: 'bg-emerald-100 border-emerald-300 text-emerald-700' },
    { label: 'Trigger',      desc: 'Webhook / Event', colorClass: 'bg-sky-100 border-sky-300 text-sky-700' },
    { label: 'n8n',          desc: 'Workflow Engine', colorClass: 'bg-amber-100 border-amber-300 text-amber-700' },
    { label: 'Condition',    desc: 'ตรวจสอบเงื่อนไข', colorClass: 'bg-violet-100 border-violet-300 text-violet-700' },
    { label: 'Action',       desc: 'ดำเนินการ',       colorClass: 'bg-blue-100 border-blue-300 text-blue-700' },
    { label: 'Notification', desc: 'LINE / Email',    colorClass: 'bg-rose-100 border-rose-300 text-rose-700' },
    { label: 'Database',     desc: 'บันทึกข้อมูล',    colorClass: 'bg-slate-100 border-slate-300 text-slate-700' },
    { label: 'Dashboard',    desc: 'อัปเดต Network', colorClass: 'bg-indigo-100 border-indigo-300 text-indigo-700' },
  ];
  const branchItems = [
    { label: 'LINE Notification', colorClass: 'text-rose-600' },
    { label: 'CRM Update',        colorClass: 'text-blue-600' },
    { label: 'Database',          colorClass: 'text-slate-600' },
    { label: 'Dashboard',         colorClass: 'text-indigo-600' },
  ];
  return (
    <div className="space-y-0">
      <div className="flex flex-col items-center gap-1">
        {steps.map((s, i) => (
          <div key={s.label} className="flex flex-col items-center">
            <div className={`rounded-xl border-2 px-4 py-2 text-sm font-bold shadow-sm ${s.colorClass}`}>
              {s.label}
              <div className="text-xs font-normal opacity-75">{s.desc}</div>
            </div>
            {i < steps.length - 1 && (
              <div className="mt-1 flex flex-col items-center"><div className="w-0.5 h-4 bg-slate-300" />
                <svg className="w-3 h-3 text-slate-400 -mt-1.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 5v14m0 0l-4-4m4 4l4-4" /></svg>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap gap-3 justify-center">
        {branchItems.map((b, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <div className="w-0.5 h-3 bg-amber-300" />
            <div className={`rounded-lg border-2 px-3 py-1.5 text-xs font-bold bg-white shadow-sm ${b.colorClass}`}>{b.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-500 text-center">
        Network Update ← Dashboard ← Database ← Notification ← Action ← n8n Workflow ← Trigger ← Lead
      </div>
    </div>
  );
}
