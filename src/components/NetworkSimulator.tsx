'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { UniverseAudio } from '@/lib/universeAudio';

const NetworkUniverse3D = dynamic(() => import('./NetworkUniverse3D'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-sky-400/30 border-t-sky-400" />
        <p className="text-sm text-slate-400">กำลังโหลดจักรวาลเครือข่าย…</p>
      </div>
    </div>
  ),
});

const DISCLAIMER =
  'ตัวเลขทั้งหมดในระบบนี้เป็นการจำลอง/สมมติเพื่อวางแผนเท่านั้น ไม่ใช่การรับประกันรายได้ ผลตอบแทน หรือผลลัพธ์จริง';

type Node3D = {
  code: string;
  parentCode: string | null;
  level: number;
  position: number;
  status: string;
  childrenCount: number;
  qualified: boolean;
  promotionStatus: string;
  paymentVerified: boolean;
  receiptId: string | null;
  simulation: boolean;
  position3d: { x: number; y: number; z: number } | null;
};

type SimInfo = {
  id: string;
  name: string;
  initMembers: number;
  branchFactor: number;
  layers: number;
  growthRate: number;
  months: number;
  commission: number;
  status: string;
};

type SimEvent = {
  eventId: string;
  eventType: string;
  memberCode: string | null;
  source: string;
  simulation: boolean;
  payload: unknown;
  createdAt: string;
};

type Stats = {
  real: { members: number | null; treeNodes: number | null; prospects: number | null };
  simulation: {
    sims: number | null;
    members: number | null;
    events: number | null;
    payments: number | null;
    promotionEligible: number | null;
    promotionApproved: number | null;
    activeRules: number | null;
    perLayer: { level: number; count: number }[];
    lastSim: { id: string; name: string; branchFactor: number; layers: number; status: string; commission: number } | null;
  };
};


const EVENT_LABEL: Record<string, string> = {
  SIMULATION_STARTED: 'เริ่มการจำลอง',
  SIMULATION_RESET: 'ล้างการจำลอง',
  SIMULATION_UPDATED: 'ปรับค่าการจำลอง',
  NETWORK_UPDATED: 'โครงข่ายอัปเดต',
  MEMBER_CREATED: 'New Node Created',
  MEMBER_UPDATED: 'อัปเดตสมาชิก',
  LEVEL_COMPLETED: 'Layer Updated — ครบตามเกณฑ์',
  QUALIFICATION_COMPLETED: 'Qualification Checked',
  PROMOTION_ELIGIBLE: 'Promotion Rule Evaluated — เข้าเงื่อนไข',
  PROMOTION_APPROVED: 'อนุมัติการเลื่อนตำแหน่ง (จำลอง)',
  PAYMENT_SUBMITTED: 'ส่งข้อมูลการชำระเงิน',
  PAYMENT_VERIFIED: 'ตรวจสอบการชำระเงิน (จำลอง)',
  COMMISSION_CREATED: 'สร้างค่าคอมมิชชั่น (จำลอง)',
};

function fmtNum(n: number | null | undefined) {
  if (n === null || n === undefined) return '—';
  return n.toLocaleString('th-TH');
}

export default function NetworkSimulator() {
  const [config, setConfig] = useState({ initMembers: 1, branchFactor: 5, layers: 5, growthRate: 1, months: 12, incomePlan: 'แผนรายได้มาตรฐาน', commission: 20000 });
  const [sim, setSim] = useState<SimInfo | null>(null);
  const [nodes, setNodes] = useState<Node3D[]>([]);
  const [perLayer, setPerLayer] = useState<{ level: number; count: number }[]>([]);
  const [events, setEvents] = useState<SimEvent[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState('');
  const [receipt, setReceipt] = useState<{ receiptId: string; watermark: string; memberCode: string | null } | null>(null);
  const [mode, setMode] = useState<'simulation' | 'real'>('simulation');
  const [msg, setMsg] = useState<string>('');
  const [total, setTotal] = useState(0);
  const [soundOn, setSoundOn] = useState(false);
  const [volume, setVolume] = useState(0.32);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [autoTick, setAutoTick] = useState(true);
  const playRef = useRef<number | null>(null);
  const audioRef = useRef<UniverseAudio | null>(null);
  const simIdRef = useRef<string | null>(null);

  const refresh = useCallback(async (simId?: string) => {
    const id = simId || simIdRef.current || '';
    const q = id ? `?id=${encodeURIComponent(id)}` : '';
    const [st, ev, ss] = await Promise.all([
      fetch(`/api/sim/state${q}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      fetch(`/api/sim/events${q}`, { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
      fetch('/api/sim/stats', { cache: 'no-store' }).then((r) => r.json()).catch(() => null),
    ]);
    if (st?.ok) {
      setSim(st.sim);
      if (st.sim?.id) simIdRef.current = st.sim.id;
      setNodes(st.nodes || []);
      setPerLayer(st.perLayer || []);
      setTotal(st.total || 0);
      setEvents(st.events || []);
      setLastUpdated(new Date());
    }
    if (ev?.events) {
      setEvents(ev.events);
      setLastUpdated(new Date());
    }
    if (ss?.ok) setStats(ss);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // ตัวเฝ้าให้ข้อมูลเป็นปัจจุบันเสมอ: ดึงใหม่ทุก 30 วิ + ทันทีเมื่อกลับเข้าหน้า/แท็บถูกเปิดใช้
  // (ไม่ให้ตัวเลขค้างอยู่ที่ค่าเก่าจนต้องกดรีเฟรชเอง)
  useEffect(() => {
    if (!autoTick) return;
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 30_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const onFocus = () => void refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
    };
  }, [autoTick, refresh]);


  const stopPlay = useCallback(() => {
    if (playRef.current !== null) {
      window.clearInterval(playRef.current);
      playRef.current = null;
    }
    setRunning(false);
  }, []);

  /** เปิด/ปิดเสียงจักรวาล (สังเคราะห์เองด้วย Web Audio — ต้องกดปุ่มก่อนเสมอ) */
  const toggleSound = useCallback(async () => {
    if (!audioRef.current) audioRef.current = new UniverseAudio();
    const audio = audioRef.current;
    if (soundOn) {
      audio.stop();
      setSoundOn(false);
      setMsg('ปิดเสียงจักรวาลแล้ว');
      return;
    }
    const started = await audio.start();
    if (started) {
      audio.setVolume(volume);
      setSoundOn(true);
      setMsg('เปิดเสียงจักรวาลแล้ว 🎧 (ปรับความดังได้ที่แถบด้านล่าง)');
    } else {
      setMsg('เปิดเสียงไม่สำเร็จ — เบราว์เซอร์นี้ไม่รองรับเสียง');
    }
  }, [soundOn, volume]);

  const changeVolume = useCallback(
    (v: number) => {
      setVolume(v);
      audioRef.current?.setVolume(v);
    },
    [],
  );

  // ปิดเสียงอัตโนมัติเมื่อออกจากหน้า
  useEffect(
    () => () => {
      audioRef.current?.stop();
      audioRef.current = null;
    },
    [],
  );

  const startSim = async () => {
    setBusy('start');
    setMsg('');
    setReceipt(null);
    try {
      const res = await fetch('/api/sim/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, name: `จำลอง 1 แตก ${config.branchFactor} · ${config.layers} ชั้น` }),
      }).then((r) => r.json());
      if (res?.ok) {
        setMsg(`สร้างการจำลองแล้ว: ${fmtNum(res.totalMembers)} โหนด ใน ${config.layers} ชั้น`);
        audioRef.current?.chime();
        await refresh(res.simId);
      } else {
        setMsg(res?.error || 'เริ่มการจำลองไม่สำเร็จ');
      }
    } finally {
      setBusy('');
    }
  };

  const addMember = useCallback(async () => {
    const capacity = sim?.branchFactor || 5;
    const candidates = nodes.filter((n) => n.level >= 0 && n.childrenCount < capacity).sort((a, b) => b.level - a.level);
    const parent = candidates[0];
    if (!parent) {
      stopPlay();
      setMsg('ไม่มีตำแหน่งว่างให้สร้างสมาชิกต่อแล้ว (เต็มทุกโหนดตามกติกา)');
      return;
    }
    const res = await fetch('/api/sim/member', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ simId: sim?.id, parentCode: parent.code, count: 1 }),
    }).then((r) => r.json());
    if (res?.ok) {
      setSelected(res.created?.[0] || parent.code);
      audioRef.current?.ping(0.09);
      if (res.levelCompleted) setMsg(`${parent.code} ครบ ${res.threshold} คน → สร้าง event LEVEL_COMPLETED`);
      await refresh(sim?.id);
    }
  }, [nodes, sim, refresh, stopPlay]);

  const startPlay = () => {
    stopPlay();
    setRunning(true);
    playRef.current = window.setInterval(() => {
      void addMember();
    }, 1100);
  };

  const resetSim = async () => {
    stopPlay();
    if (!sim) return;
    setBusy('reset');
    try {
      await fetch('/api/sim/run', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ simId: sim.id, reset: true }) });
      setSelected(null);
      setMsg('ล้างข้อมูลการจำลองแล้ว');
      await refresh();
    } finally {
      setBusy('');
    }
  };

  const promote = async (approve: boolean) => {
    setBusy(approve ? 'approve' : 'check');
    try {
      const res = await fetch('/api/sim/promotion-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simId: sim?.id, approve, code: approve && selected ? selected : undefined }),
      }).then((r) => r.json());
      if (res?.ok) {
        setMsg(approve ? `อนุมัติการเลื่อนตำแหน่ง (จำลอง) ${res.approved} รายการ` : `ประเมิน ${res.checked} โหนด · เข้าเงื่อนไข ${res.eligible}`);
        if ((approve ? res.approved : res.eligible) > 0) audioRef.current?.chime();
      }
      await refresh(sim?.id);
    } finally {
      setBusy('');
    }
  };

  const demoReceipt = async () => {
    setBusy('pay');
    try {
      const res = await fetch('/api/sim/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ simId: sim?.id, memberCode: selected || 'ROOT', amount: config.commission, mode: 'demo' }),
      }).then((r) => r.json());
      if (res?.ok) {
        setReceipt({ receiptId: res.receiptId, watermark: res.watermark, memberCode: res.memberCode });
        setMsg('ออกใบเสร็จ DEMO แล้ว — ไม่ได้ตั้งสถานะชำระเงินจริงให้');
      }
      await refresh(sim?.id);
    } finally {
      setBusy('');
    }
  };

  useEffect(() => () => stopPlay(), [stopPlay]);

  const selectedNode = useMemo(() => nodes.find((n) => n.code === selected) || null, [nodes, selected]);
  const renderNodes = useMemo(() => nodes.filter((n) => n.level > 0), [nodes]);
  // นับจากชุดจำลองที่กำลังแสดงอยู่เท่านั้น (เดิมนับรวมทุกชุดจำลอง ทำให้การ์ดขัดกับ Timeline)
  const qualifiedNow = useMemo(() => nodes.filter((n) => n.qualified || n.promotionStatus === 'eligible' || n.promotionStatus === 'approved').length, [nodes]);

  const statCards = mode === 'simulation'
    ? [
        { label: 'สมาชิกจำลองทั้งหมด', value: fmtNum(total), tone: 'text-sky-300' },
        { label: 'จำนวน Layer', value: fmtNum(perLayer.filter((p) => p.level > 0).length), tone: 'text-sky-300' },
        { label: 'สมาชิกใน Layer ปัจจุบัน', value: fmtNum(perLayer.filter((p) => p.level > 0).slice(-1)[0]?.count || 0), tone: 'text-sky-300' },
        { label: 'ผ่าน Qualification (จำลอง)', value: fmtNum(qualifiedNow), tone: 'text-emerald-300' },
        { label: 'Promotion Events', value: fmtNum(events.filter((e) => e.eventType.startsWith('PROMOTION')).length), tone: 'text-amber-300' },
        { label: 'Commission Events', value: fmtNum(events.filter((e) => e.eventType === 'COMMISSION_CREATED').length), tone: 'text-amber-300' },
      ]
    : [
        { label: 'สมาชิกจริง', value: fmtNum(stats?.real.members ?? null), tone: 'text-emerald-300' },
        { label: 'โหนดในสายงานจริง', value: fmtNum(stats?.real.treeNodes ?? null), tone: 'text-emerald-300' },
        { label: 'ลีด (Prospect)', value: fmtNum(stats?.real.prospects ?? null), tone: 'text-emerald-300' },
        { label: 'ข้อมูลจำลอง (แยกไว้)', value: fmtNum(stats?.simulation.members ?? null), tone: 'text-slate-400' },
        { label: 'Payment (จำลอง)', value: fmtNum(stats?.simulation.payments ?? null), tone: 'text-slate-400' },
        { label: 'กฎที่ใช้งาน', value: fmtNum(stats?.simulation.activeRules ?? null), tone: 'text-slate-400' },
      ];

  return (
    <section className="border-t border-slate-800 bg-slate-950 pt-10 pb-32 text-slate-100">
      <div className="mx-auto max-w-7xl px-4">
        {/* ── Header ── */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-sky-400">Future Network Simulator</p>
            <h2 className="text-2xl font-bold sm:text-3xl">1 แตก {config.branchFactor} – Future Network Simulator</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-400">ทดลองโครงสร้างเครือข่ายและแผนรายได้แบบไม่มีจำนวนชั้นตายตัว — ทุกอย่างที่เห็นเป็น <span className="font-semibold text-sky-300">ข้อมูลจำลอง (SIMULATION)</span> แยกจากข้อมูลจริงเสมอ</p>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            <div className="flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900 p-1 text-xs font-semibold">
              <button onClick={() => setMode('simulation')} className={`rounded-full px-3 py-1.5 ${mode === 'simulation' ? 'bg-sky-500 text-slate-950' : 'text-slate-300'}`}>SIMULATION</button>
              <button onClick={() => setMode('real')} className={`rounded-full px-3 py-1.5 ${mode === 'real' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'}`}>REAL DATA</button>
            </div>
            {/* ป้ายบอกความสดของข้อมูล — ให้รู้เสมอว่าตัวเลข ณ เวลาใด */}
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-slate-300" title={lastUpdated ? lastUpdated.toLocaleString('th-TH') : ''}>
                🕒 ข้อมูล ณ <span className="font-bold text-sky-300">{lastUpdated ? lastUpdated.toLocaleTimeString('th-TH') : '…'}</span>
                {lastUpdated ? ` น. · ${lastUpdated.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}` : ''}
              </span>
              <button onClick={() => setAutoTick((v) => !v)} className={`rounded-full border px-3 py-1 font-semibold ${autoTick ? 'border-emerald-600/60 bg-emerald-950/40 text-emerald-300' : 'border-slate-700 bg-slate-900 text-slate-400'}`}>
                {autoTick ? '⟳ อัปเดตอัตโนมัติทุก 30 วิ' : '⏸ หยุดอัปเดตอัตโนมัติ'}
              </button>
              <button onClick={() => void refresh()} className="rounded-full border border-sky-600/60 bg-sky-950/40 px-3 py-1 font-semibold text-sky-300 hover:border-sky-400">⟳ ดึงใหม่</button>
            </div>
          </div>
        </div>

        {/* ── Stats bar ── */}
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {statCards.map((c) => (
            <div key={c.label} className="rounded-xl border border-slate-800 bg-slate-900/60 p-3">
              <p className="text-[11px] leading-tight text-slate-400">{c.label}</p>
              <p className={`mt-1 text-xl font-bold ${c.tone}`}>{c.value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)_320px]">
          {/* ── ซ้าย: Simulation Controls ── */}
          <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="text-sm font-bold text-slate-200">🎛 Simulation Controls</h3>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {([
                ['initMembers', 'สมาชิกเริ่มต้น', 1, 50],
                ['branchFactor', 'แตกต่อ (คน)', 1, 12],
                ['layers', 'จำนวนชั้น', 1, 12],
                ['months', 'ระยะเวลา (เดือน)', 1, 120],
              ] as const).map(([key, label, min, max]) => (
                <label key={key} className="flex flex-col gap-1">
                  <span className="text-slate-400">{label}</span>
                  <input
                    type="number"
                    min={min}
                    max={max}
                    value={config[key]}
                    onChange={(e) => setConfig((c) => ({ ...c, [key]: Number(e.target.value) }))}
                    className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100 outline-none focus:border-sky-500"
                  />
                </label>
              ))}
              <label className="flex flex-col gap-1">
                <span className="text-slate-400">อัตราการเติบโต</span>
                <input type="number" step="0.05" min="0.1" max="1" value={config.growthRate} onChange={(e) => setConfig((c) => ({ ...c, growthRate: Number(e.target.value) }))} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100 outline-none focus:border-sky-500" />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-slate-400">ค่าคอมฯ ต่อเหตุการณ์ (บาท)</span>
                <input type="number" step="1000" min="0" value={config.commission} onChange={(e) => setConfig((c) => ({ ...c, commission: Number(e.target.value) }))} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100 outline-none focus:border-sky-500" />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-slate-400">แผนรายได้</span>
              <input value={config.incomePlan} onChange={(e) => setConfig((c) => ({ ...c, incomePlan: e.target.value }))} className="rounded-lg border border-slate-700 bg-slate-950 px-2 py-1.5 text-slate-100 outline-none focus:border-sky-500" />
            </label>

            <button onClick={startSim} disabled={busy === 'start'} className="w-full rounded-xl bg-sky-500 px-3 py-2 text-sm font-bold text-slate-950 hover:bg-sky-400 disabled:opacity-50">
              {busy === 'start' ? '⏳ กำลังสร้าง…' : '▶ เริ่ม Simulation (สร้างโครงสร้าง)'}
            </button>
            <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
              <button onClick={running ? stopPlay : startPlay} className={`rounded-lg px-3 py-2 ${running ? 'bg-amber-500 text-slate-950' : 'bg-emerald-500 text-slate-950'}`}>{running ? '⏸ หยุด' : '⏵ เติบโตทีละคน'}</button>
              <button onClick={() => void addMember()} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 hover:border-sky-500">＋ เพิ่ม 1 คน</button>
              <button onClick={() => void promote(false)} disabled={busy === 'check'} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 hover:border-sky-500">🔍 ตรวจเงื่อนไข</button>
              <button onClick={() => void promote(true)} disabled={busy === 'approve'} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 hover:border-sky-500">✅ อนุมัติ (จำลอง)</button>
              <button onClick={() => void demoReceipt()} disabled={busy === 'pay'} className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-slate-200 hover:border-sky-500">🧾 ใบเสร็จ DEMO</button>
              <button onClick={() => void resetSim()} disabled={busy === 'reset'} className="rounded-lg border border-rose-900/60 bg-rose-950/40 px-3 py-2 text-rose-200 hover:border-rose-500">🧹 ล้าง Simulation</button>
            </div>

            {/* ── เสียงจักรวาล (สังเคราะห์เอง ต้องกดเองจึงดัง — ไม่มีไฟล์เสียงจากภายนอก) ── */}
            <div className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 p-2">
              <button
                onClick={() => void toggleSound()}
                className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-bold transition ${soundOn ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-100 hover:bg-slate-700'}`}
              >
                {soundOn ? '🔇 ปิดเสียงจักรวาล' : '🔊 เปิดเสียงจักรวาล'}
              </button>
              <input type="range" min={0} max={1} step={0.05} value={volume} onChange={(e) => changeVolume(Number(e.target.value))} className="w-full accent-sky-400" aria-label="ความดังเสียงจักรวาล" />
              <span className="w-9 text-right text-[11px] text-slate-400">{Math.round(volume * 100)}%</span>
            </div>
            <p className="text-[11px] leading-snug text-slate-500">เสียงจักรวาลสังเคราะห์สดในเบราว์เซอร์ (ไม่โหลดไฟล์จากภายนอก) — จะมีเสียงติ๊งเบา ๆ เมื่อเกิดสมาชิกใหม่</p>
            {msg && <p className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-[11px] text-sky-200">{msg}</p>}
            <p className="text-xs leading-relaxed text-slate-400">ปุ่ม &quot;เติบโตทีละคน&quot; จะสร้างสมาชิกจำลองใต้โหนดที่มีที่ว่าง แล้วสร้าง event MEMBER_CREATED / LEVEL_COMPLETED ให้เห็นใน Timeline</p>
          </div>

          {/* ── กลาง: จักรวาล 3D ── */}
          <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-black">
            <div className="h-[420px] w-full sm:h-[560px]">
              {mode === 'simulation' ? (
                <NetworkUniverse3D nodes={renderNodes} selected={selected} onSelect={(c) => setSelected(c)} simulation maxNodes={2500} />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                  <p className="text-sm font-semibold text-emerald-300">REAL DATA — ไม่แสดงตำแหน่งสมาชิกจริงบนจักรวาล</p>
                  <p className="max-w-md text-xs text-slate-400">เพื่อความเป็นส่วนตัว (PDPA) ระบบไม่นำข้อมูลสมาชิกจริงมาวาดเป็นโหนด 3D — แสดงเฉพาะจำนวนจริงในแดชบอร์ดด้านบน โดยแยกจากตัวเลขจำลองเสมอ</p>
                  <p className="text-xs text-slate-500">สมาชิกจริง {fmtNum(stats?.real.members ?? null)} คน · โหนดสายงานจริง {fmtNum(stats?.real.treeNodes ?? null)} โหนด</p>
                </div>
              )}
            </div>
            <div className="pointer-events-none absolute left-3 top-3 rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-1 text-[11px] font-bold text-sky-300">
              {mode === 'simulation' ? 'SIMULATION MODE — ข้อมูลจำลอง' : 'REAL DATA'}
            </div>
            <div className="pointer-events-none absolute bottom-3 left-3 right-3 rounded-lg bg-black/60 px-3 py-2 text-[11px] leading-snug text-slate-300">🔒 ลาก = หมุน · สกอลล์ = ซูม · คลิกโหนด = ดูรายละเอียด</div>
            <div className="pointer-events-none absolute bottom-14 left-3 right-3 rounded-lg bg-black/60 px-3 py-2 text-[10px] leading-snug text-slate-400">Animation สื่อ &quot;การขยายตัวของเครือข่าย&quot; — ไม่ได้หมายถึงเงินที่ไหลเข้าบัญชี</div>
          </div>

          {/* ── ขวา: Member Details ── */}
          <div className="space-y-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="text-sm font-bold text-slate-200">👤 Member Details</h3>
            {selectedNode ? (
              <dl className="space-y-1.5 text-xs">
                {([
                  ['Member ID', selectedNode.code],
                  ['Level', String(selectedNode.level)],
                  ['Parent', selectedNode.parentCode || '—'],
                  ['Children', `${selectedNode.childrenCount} / ${sim?.branchFactor ?? 5}`],
                  ['Status', selectedNode.status],
                  ['Qualification', selectedNode.qualified ? 'ผ่าน' : 'ยังไม่ผ่าน'],
                  ['Payment Status', selectedNode.paymentVerified ? 'ยืนยันแล้ว (จริง)' : selectedNode.receiptId ? 'มีใบเสร็จ DEMO' : 'ยังไม่มี'],
                  ['Promotion Status', selectedNode.promotionStatus],
                  ['Receipt', selectedNode.receiptId || '—'],
                  ['Simulation', 'true'],
                ] as const).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-slate-800/70 pb-1">
                    <dt className="text-slate-400">{k}</dt>
                    <dd className="text-right font-medium text-slate-100">{v}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-xs text-slate-500">คลิกโหนดในจักรวาลเพื่อดูข้อมูลสมาชิก</p>
            )}

            {receipt && (
              <div className="rounded-xl border border-amber-600/40 bg-amber-950/30 p-3">
                <p className="text-xs font-bold text-amber-300">🧾 {receipt.watermark}</p>
                <p className="mt-1 text-[11px] text-amber-100/80">เลขที่: {receipt.receiptId} · สมาชิก: {receipt.memberCode || 'ROOT'}</p>
                <p className="mt-1 text-[10px] text-amber-200/70">ใบเสร็จนี้เป็นเอกสารสาธิต ไม่ใช่หลักฐานการชำระเงินจริง และระบบไม่ได้ตั้งสถานะ &quot;ชำระเงินจริง&quot; ให้</p>
              </div>
            )}

          </div>
        </div>

        {/* ── ล่าง: Event Timeline + Layer breakdown ── */}
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="mb-3 text-sm font-bold text-slate-200">🕒 Event Timeline</h3>
            <ul className="max-h-72 space-y-1.5 overflow-auto pr-1 text-xs">
              {events.length === 0 && <li className="text-slate-500">ยังไม่มี event — เริ่ม Simulation เพื่อดูเหตุการณ์</li>}
              {[...events].reverse().map((e) => (
                <li key={e.eventId} className="flex items-start gap-2 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2">
                  <span className="mt-0.5 rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-bold text-sky-300">{e.eventType}</span>
                  <span className="flex-1 text-slate-300">{EVENT_LABEL[e.eventType] || e.eventType}{e.memberCode ? ` · ${e.memberCode}` : ''}</span>
                  <span className="whitespace-nowrap text-[10px] text-slate-500">{new Date(e.createdAt).toLocaleTimeString('th-TH')}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="mb-3 text-sm font-bold text-slate-200">🌌 Layer Breakdown (จำลอง)</h3>
            <ul className="max-h-72 space-y-1.5 overflow-auto text-xs">
              {perLayer.filter((p) => p.level > 0).map((p) => (
                <li key={p.level} className="flex items-center justify-between rounded-lg border border-slate-800 px-3 py-1.5">
                  <span className="text-slate-300">Layer {p.level}</span>
                  <span className="font-bold text-sky-300">{fmtNum(p.count)}</span>
                </li>
              ))}
              {perLayer.length === 0 && <li className="text-slate-500">ยังไม่มีข้อมูล</li>}
            </ul>
            <p className="mt-3 text-[10px] leading-relaxed text-slate-500">{DISCLAIMER}</p>
          </div>
        </div>

        <p className="mt-4 rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-[11px] leading-relaxed text-slate-400">
          <strong className="text-slate-300">ข้อกำหนดสำคัญ:</strong> {DISCLAIMER} · ข้อมูลจำลองถูกเก็บแยกในตาราง <code className="text-sky-300">sim_*</code> และติด <code className="text-sky-300">simulation = true</code> ทุกแถว · ไม่มีการสร้างธุรกรรมเงินจริง ใบเสร็จจริง ค่าคอมมิชชั่นจริง หรือเปลี่ยนสถานะสมาชิกจริงจากโหมดนี้ · เงื่อนไขการเลื่อนตำแหน่งอ่านจากตาราง <code className="text-sky-300">promotion_rules</code> (แก้ไขได้โดยไม่ต้องแก้โค้ด)
        </p>
      </div>
    </section>
  );
}
