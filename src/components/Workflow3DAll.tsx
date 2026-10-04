'use client';

/**
 * Workflow3DAll — "กระบวนการทำงาน 3D · ทุกเวิร์กโฟลว์" (หน้า /n8n/workflow-3d)
 *
 * เป้าหมาย (คำสั่งเจ้าของระบบ): สร้างฉาก 3 มิติของเวิร์กโฟลว์ n8n "ทั้งหมด" ให้สมาชิกเปิดดูได้ทุกตัว
 * จากเมนูในหน้านี้ แล้วนำโครงสร้างไปสร้างระบบของตัวเอง
 *
 * ● เมนูซ้าย = เวิร์กโฟลว์ทั้งหมดจาก public/n8n/workflows.json (export จากฐานข้อมูล n8n จริง ไม่มีพารามิเตอร์/คีย์ติดมา)
 * ● เลือกเวิร์กโฟลว์ → ฉาก 3D แสดงโหนดทั้งหมด + เส้นการไหล (จุดพลังงานวิ่งตามงานจริง) + ชั้นความลึกของกระบวนการ
 * ● อ่านอย่างเดียว: ไม่เรียก n8n, ไม่เขียนข้อมูล, ลิงก์แชร์ได้ (?wf=<id>)
 */

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CATEGORIES, categoryOf, familyOf, loadWorkflows, prettyType, workflowPlainText,
  type CategoryKey, type WorkflowGraph,
} from '@/lib/workflowGraphs';

const WorkflowGraph3DScene = dynamic(() => import('./WorkflowGraph3DScene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-sky-400/30 border-t-sky-400" />
        <p className="text-sm text-slate-400">กำลังประกอบฉาก 3 มิติของเวิร์กโฟลว์…</p>
      </div>
    </div>
  ),
});

type LoadState = { loading: boolean; error: string; wfs: WorkflowGraph[] };

export default function Workflow3DAll() {
  const [state, setState] = useState<LoadState>({ loading: true, error: '', wfs: [] });
  const [groupId, setGroupId] = useState<string>('all');
  const [activeOnly, setActiveOnly] = useState(false);
  const [q, setQ] = useState('');
  const [currentId, setCurrentId] = useState<string>('');
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [paused, setPaused] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [full, setFull] = useState(false);
  const [copied, setCopied] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  /* ── โหลดรายการเวิร์กโฟลว์ทั้งหมด ── */
  useEffect(() => {
    let alive = true;
    loadWorkflows()
      .then((p) => {
        if (!alive) return;
        const wfs = [...p.workflows].sort((a, b) => a.name.localeCompare(b.name, 'th'));
        setState({ loading: false, error: '', wfs });
        const fromUrl = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('wf') : null;
        const pick = (fromUrl && wfs.find((w) => w.id === fromUrl)?.id) || wfs.find((w) => w.active)?.id || wfs[0]?.id || '';
        setCurrentId(pick);
      })
      .catch((e: Error) => { if (alive) setState({ loading: false, error: e.message, wfs: [] }); });
    return () => { alive = false; };
  }, []);

  /* ── ซิงก์ลิงก์ ?wf= (แชร์ให้คนอื่นเปิดดูตัวเดียวกันได้) ── */
  useEffect(() => {
    if (!currentId || typeof window === 'undefined') return;
    const u = new URL(window.location.href);
    u.searchParams.set('wf', currentId);
    window.history.replaceState(null, '', u.toString());
  }, [currentId]);

  /* ── เต็มจอ (Esc เพื่อย่อกลับ) ── */
  const toggleFull = useCallback(() => {
    const el = wrapRef.current;
    if (!full) {
      setFull(true);
      el?.requestFullscreen?.().catch(() => {});
    } else {
      setFull(false);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    }
  }, [full]);

  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setFull(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false); };
    document.addEventListener('fullscreenchange', onFs);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  /* ── ตัวช่วยคำนวณ ── */
  const groups = useMemo(() => {
    const m = new Map<string, { label: string; icon: string; color: string; n: number }>();
    for (const w of state.wfs) {
      const f = familyOf(w.name);
      const cur = m.get(f.key) || { label: f.label, icon: f.icon, color: f.color, n: 0 };
      cur.n += 1;
      m.set(f.key, cur);
    }
    return [...m.entries()].sort((a, b) => b[1].n - a[1].n);
  }, [state.wfs]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return state.wfs.filter((w) => {
      if (activeOnly && !w.active) return false;
      if (groupId !== 'all' && familyOf(w.name).key !== groupId) return false;
      if (needle) {
        const hay = `${w.name} ${w.nodes.map((n) => n.name).join(' ')} ${w.nodes.map((n) => n.type).join(' ')}`.toLowerCase();
        if (!hay.includes(needle)) return false;
      }
      return true;
    });
  }, [state.wfs, q, groupId, activeOnly]);

  const current = useMemo(() => state.wfs.find((w) => w.id === currentId) || null, [state.wfs, currentId]);

  const totals = useMemo(() => ({
    workflows: state.wfs.length,
    active: state.wfs.filter((w) => w.active).length,
    nodes: state.wfs.reduce((a, w) => a + w.nodes.length, 0),
    edges: state.wfs.reduce((a, w) => a + w.edges.length, 0),
  }), [state.wfs]);

  /** จำนวนโหนดต่อหมวดของเวิร์กโฟลว์ที่เลือก */
  const catCounts = useMemo(() => {
    const m = new Map<CategoryKey, number>();
    for (const n of current?.nodes || []) {
      const k = categoryOf(n.type).key;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  }, [current]);

  const nodeInfo = useMemo(() => {
    if (!current || !selectedNode) return null;
    const node = current.nodes.find((n) => n.name === selectedNode);
    if (!node) return null;
    const out = current.edges.filter((e) => e.from === selectedNode).map((e) => e.to);
    const inc = current.edges.filter((e) => e.to === selectedNode).map((e) => e.from);
    return { node, cat: categoryOf(node.type), out, inc };
  }, [current, selectedNode]);

  const copyCurrent = async () => {
    if (!current) return;
    try {
      await navigator.clipboard.writeText(workflowPlainText(current));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { setCopied(false); }
  };

  const select = (id: string) => { setCurrentId(id); setSelectedNode(null); };

  return (
    <div className="bg-soft-white pb-24">
      <div className="mx-auto max-w-[1500px] px-4 py-6 sm:px-6 lg:px-8">
        {/* ── หัวเรื่อง ── */}
        <div className="mb-5 rounded-3xl border border-[#dbeafe] bg-gradient-to-r from-[#0b1220] via-[#111c33] to-[#0b1220] p-6 text-white shadow-lg">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-semibold tracking-widest text-sky-300">
                <span>กระบวนการทำงาน 3 มิติ</span><span className="text-white/40">•</span><span>n8n Workflow Automation</span>
              </div>
              <h1 className="mt-1 text-2xl font-black sm:text-3xl">🧊 จักรวาลเวิร์กโฟลว์ n8n — ดูได้ทุกตัวในเมนูเดียว</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/75">
                เลือกเวิร์กโฟลว์จากเมนูด้านซ้าย — ฉาก 3 มิติจะแสดง <strong className="text-white">โหนดจริงทั้งหมด</strong> ของเวิร์กโฟลว์นั้น
                (สีตามชนิดโหนด) เชื่อมกันด้วย <strong className="text-white">เส้นการไหล</strong> ที่มีจุดพลังงานวิ่งตามงานจริง
                โดยแกนความลึก = ลำดับขั้นของกระบวนการ · กดที่ทรงกลมเพื่ออ่านรายละเอียด แล้วคัดลอกโครงสร้างไปสร้างระบบของคุณเอง
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-full bg-white/10 px-3 py-1 font-bold">เวิร์กโฟลว์ทั้งหมด {totals.workflows}</span>
                <span className="rounded-full bg-emerald-500/20 px-3 py-1 font-bold text-emerald-200">เปิดใช้งาน {totals.active}</span>
                <span className="rounded-full bg-sky-500/20 px-3 py-1 font-bold text-sky-200">โหนดรวม {totals.nodes.toLocaleString('th-TH')}</span>
                <span className="rounded-full bg-violet-500/20 px-3 py-1 font-bold text-violet-200">เส้นเชื่อมรวม {totals.edges.toLocaleString('th-TH')}</span>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={copyCurrent}
                disabled={!current}
                className="rounded-full bg-white px-4 py-2 text-xs font-bold text-[#0b1220] shadow hover:bg-white/90 disabled:opacity-50"
              >
                {copied ? '✓ คัดลอกแล้ว' : '⧉ คัดลอกโครงสร้างเวิร์กโฟลว์นี้'}
              </button>
              <a
                href="/n8n/workflows"
                className="rounded-full border border-white/25 px-4 py-2 text-xs font-bold text-white hover:bg-white/10"
              >
                🔗 Webhook URLs
              </a>
            </div>
          </div>
        </div>

        {state.loading && (
          <div className="rounded-3xl border border-[#dbeafe] bg-white p-8 text-center text-sm text-slate-500">กำลังอ่านรายการเวิร์กโฟลว์ทั้งหมด…</div>
        )}
        {state.error && (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">อ่านรายการเวิร์กโฟลว์ไม่สำเร็จ: {state.error}</div>
        )}

        {!state.loading && !state.error && (
          <div className="grid gap-4 lg:grid-cols-[330px_minmax(0,1fr)]">
            {/* ── เมนูเวิร์กโฟลว์ทั้งหมด ── */}
            <aside className="rounded-3xl border border-[#dbeafe] bg-white p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-black text-[#0f172a]">เมนูเวิร์กโฟลว์ ({list.length}/{state.wfs.length})</h2>
                <label className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                  <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} /> เฉพาะที่เปิดใช้
                </label>
              </div>

              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ค้นหา: ชื่อเวิร์กโฟลว์ / โหนด / ชนิดโหนด"
                className="mt-2 w-full rounded-xl border border-slate-200 bg-[#f8fafc] px-3 py-2 text-xs text-slate-700 outline-none focus:border-sky-400"
              />

              {/* ตัวกรองตามกลุ่มงาน */}
              <div className="mt-2 flex flex-wrap gap-1">
                <button
                  onClick={() => setGroupId('all')}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${groupId === 'all' ? 'bg-[#0b1220] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  ทั้งหมด
                </button>
                {groups.map(([key, g]) => (
                  <button
                    key={key}
                    onClick={() => setGroupId(key)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${groupId === key ? 'text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    style={groupId === key ? { background: g.color } : undefined}
                  >
                    {g.icon} {g.label} ({g.n})
                  </button>
                ))}
              </div>

              <div className="mt-3 max-h-[620px] space-y-1 overflow-y-auto pr-1">
                {list.map((w) => {
                  const fam = familyOf(w.name);
                  const isCur = w.id === currentId;
                  return (
                    <button
                      key={w.id}
                      onClick={() => select(w.id)}
                      className={`w-full rounded-2xl border px-3 py-2 text-left transition ${isCur ? 'border-sky-400 bg-sky-50' : 'border-slate-100 bg-[#fbfdff] hover:border-sky-200 hover:bg-sky-50/60'}`}
                    >
                      <div className="flex items-start gap-2">
                        <span className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: w.active ? '#10b981' : '#94a3b8' }} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[12px] font-bold text-[#0f172a]">{w.name}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[10px] text-slate-500">
                            <span className="rounded-full px-1.5 py-0.5 font-bold text-white" style={{ background: fam.color }}>{fam.icon} {fam.label}</span>
                            <span>{w.nodes.length} โหนด · {w.edges.length} เส้น</span>
                            {!w.active && <span className="rounded-full bg-slate-200 px-1.5 py-0.5 font-bold text-slate-600">ปิดอยู่</span>}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {!list.length && <div className="p-3 text-xs text-slate-500">ไม่พบเวิร์กโฟลว์ที่ตรงกับเงื่อนไข</div>}
              </div>
            </aside>

            {/* ── ฉาก 3D + รายละเอียด ── */}
            <div className="space-y-3">
              <div
                ref={wrapRef}
                className={`overflow-hidden rounded-3xl border border-[#dbeafe] bg-[#020617] shadow-sm ${full ? 'fixed inset-0 z-[2147483647] rounded-none' : ''}`}
              >
                <div className={`relative w-full ${full ? 'h-screen' : 'h-[560px] sm:h-[620px]'}`}>
                  {current ? (
                    <WorkflowGraph3DScene
                      wf={current}
                      selected={selectedNode}
                      onSelect={setSelectedNode}
                      paused={paused}
                      autoRotate={autoRotate}
                      showLabels={showLabels}
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-400">เลือกเวิร์กโฟลว์จากเมนูด้านซ้าย</div>
                  )}

                  {/* ป้ายชื่อเวิร์กโฟลว์ที่กำลังดู */}
                  {current && (
                    <div className="pointer-events-none absolute left-3 top-3 max-w-[62%] rounded-xl border border-sky-400/40 bg-slate-950/70 px-3 py-2 backdrop-blur">
                      <div className="flex items-center gap-2 text-[10px] font-semibold tracking-widest text-sky-300">
                        {current.active ? '● เปิดใช้งานอยู่' : '○ ปิดอยู่'}
                        <span className="text-white/40">•</span>
                        <span>{current.nodes.length} โหนด · {current.edges.length} เส้นเชื่อม</span>
                      </div>
                      <div className="mt-0.5 truncate text-sm font-bold text-white">{current.name}</div>
                    </div>
                  )}

                  {/* ปุ่มควบคุม */}
                  <div className="absolute right-3 top-3 flex flex-wrap justify-end gap-1.5">
                    <button
                      onClick={() => setAutoRotate((v) => !v)}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-bold backdrop-blur ${autoRotate ? 'bg-sky-500/90 text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'}`}
                    >
                      {autoRotate ? '↻ หมุนอัตโนมัติ: เปิด' : '↻ หมุนอัตโนมัติ: ปิด'}
                    </button>
                    <button
                      onClick={() => setPaused((v) => !v)}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-bold backdrop-blur ${paused ? 'bg-white/10 text-white/80 hover:bg-white/20' : 'bg-emerald-500/85 text-white'}`}
                    >
                      {paused ? '▶ เล่นการไหล' : '⏸ หยุดชั่วคราว'}
                    </button>
                    <button
                      onClick={() => setShowLabels((v) => !v)}
                      className={`rounded-full px-3 py-1.5 text-[11px] font-bold backdrop-blur ${showLabels ? 'bg-violet-500/85 text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'}`}
                    >
                      {showLabels ? '🏷 ป้ายชื่อ: แสดง' : '🏷 ป้ายชื่อ: ซ่อน'}
                    </button>
                    <button
                      onClick={toggleFull}
                      className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white backdrop-blur hover:bg-white/20"
                    >
                      {full ? '⤡ ย่อกลับ (Esc)' : '⛶ ขยายเต็มจอ'}
                    </button>
                  </div>

                  {/* คำอธิบายสี (นับจากเวิร์กโฟลว์ที่เลือก) */}
                  <div className="pointer-events-none absolute bottom-3 left-3 flex max-w-[70%] flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-300">
                    {(Object.keys(CATEGORIES) as CategoryKey[])
                      .filter((k) => (catCounts.get(k) || 0) > 0)
                      .map((k) => (
                        <span key={k} className="flex items-center gap-1 rounded-md bg-slate-950/60 px-2 py-0.5">
                          <span className="inline-block h-2 w-2 rounded-full" style={{ background: CATEGORIES[k].color }} />
                          {CATEGORIES[k].icon} {CATEGORIES[k].label} ({catCounts.get(k)})
                        </span>
                      ))}
                  </div>
                  <div className="pointer-events-none absolute bottom-3 right-3 text-[10px] text-white/50">
                    ลาก = หมุน · สกรอลล์ = ซูม · คลิกทรงกลม = ดูรายละเอียด
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {/* รายละเอียดโหนดที่เลือก */}
                <div className="rounded-3xl border border-[#dbeafe] bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-black text-[#0f172a]">รายละเอียดโหนดที่เลือก</h3>
                  {!nodeInfo && <p className="mt-2 text-xs text-slate-500">คลิกทรงกลมในฉาก 3 มิติ (หรือเลือกจากรายการด้านขวา) เพื่อดูรายละเอียด</p>}
                  {nodeInfo && (
                    <div className="mt-2 space-y-2 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="grid h-8 w-8 place-items-center rounded-xl text-base" style={{ background: `${nodeInfo.cat.color}22` }}>{nodeInfo.cat.icon}</span>
                        <div className="min-w-0">
                          <div className="truncate font-bold text-[#0f172a]">{nodeInfo.node.name}</div>
                          <div className="text-[11px] text-slate-500">{prettyType(nodeInfo.node.type)}</div>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-1 text-[11px]">
                        <span className="rounded-full px-2 py-0.5 font-bold text-white" style={{ background: nodeInfo.cat.color }}>{nodeInfo.cat.label}</span>
                        {nodeInfo.node.disabled && <span className="rounded-full bg-slate-200 px-2 py-0.5 font-bold text-slate-600">โหนดนี้ถูกปิด</span>}
                        {nodeInfo.node.cred && <span className="rounded-full bg-amber-100 px-2 py-0.5 font-bold text-amber-700">ใช้ข้อมูลล็อกอิน (credential)</span>}
                      </div>
                      <div className="rounded-xl bg-[#f8fafc] p-3">
                        <div className="font-bold text-slate-500">รับงานจาก ({nodeInfo.inc.length})</div>
                        <div className="text-slate-700">{nodeInfo.inc.join(' · ') || '— เป็นโหนดเริ่มต้นของกระบวนการ —'}</div>
                      </div>
                      <div className="rounded-xl bg-[#f8fafc] p-3">
                        <div className="font-bold text-slate-500">ส่งงานต่อไป ({nodeInfo.out.length})</div>
                        <div className="text-slate-700">{nodeInfo.out.join(' · ') || '— เป็นโหนดสิ้นสุด —'}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* รายการโหนดทั้งหมดของเวิร์กโฟลว์นี้ */}
                <div className="rounded-3xl border border-[#dbeafe] bg-white p-4 shadow-sm">
                  <h3 className="text-sm font-black text-[#0f172a]">โหนดทั้งหมดในเวิร์กโฟลว์นี้ ({current?.nodes.length || 0})</h3>
                  <div className="mt-2 max-h-[240px] space-y-1 overflow-y-auto pr-1">
                    {(current?.nodes || []).map((n, i) => {
                      const c = categoryOf(n.type);
                      return (
                        <button
                          key={n.name}
                          onClick={() => setSelectedNode(n.name)}
                          className={`flex w-full items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-[11px] ${selectedNode === n.name ? 'border-sky-400 bg-sky-50' : 'border-slate-100 hover:bg-slate-50'}`}
                        >
                          <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px] text-white" style={{ background: c.color }}>{i + 1}</span>
                          <span className="min-w-0 flex-1 truncate font-bold text-slate-700">{n.name}</span>
                          <span className="shrink-0 text-slate-400">{c.short}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-[#dbeafe] bg-white p-4 text-[11px] leading-6 text-slate-500 shadow-sm">
                ข้อมูลเวิร์กโฟลว์ในหน้านี้ export จากฐานข้อมูล n8n ของระบบ (ชื่อโหนด ชนิดโหนด พิกัด และเส้นเชื่อมเท่านั้น —
                <strong className="text-slate-700"> ไม่มีพารามิเตอร์ คีย์ API หรือข้อมูลส่วนบุคคลติดมาด้วย</strong>)
                หน้านี้อ่านอย่างเดียว ไม่สั่งรันเวิร์กโฟลว์ และไม่แก้ข้อมูลใด ๆ · ลิงก์ตรงของแต่ละเวิร์กโฟลว์ใช้รูปแบบ
                <code className="mx-1 rounded bg-slate-100 px-1">/n8n/workflow-3d?wf=&lt;id&gt;</code>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
