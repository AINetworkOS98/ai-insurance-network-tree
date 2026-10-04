'use client';

/**
 * CosmicNetwork — จักรวาลเครือข่ายสมาชิกแบบ 3 มิติ (Interactive Cosmic Network)
 *
 * ● ส่วนนี้เป็น **ภาพจำลองเพื่อสาธิตโครงสร้างเครือข่าย 1 แตก 5** (ROOT → 5 → 25 → 125 → 625)
 *   ตัวเลขและชื่อสมาชิกในฉากเป็นข้อมูลตัวอย่างที่สร้างขึ้น ไม่ใช่ข้อมูลสมาชิกจริง
 *   และไม่สื่อถึงรายได้ ค่าคอมมิชชั่น หรือผลตอบแทนใด ๆ
 * ● ไม่เรียก API และไม่เขียนข้อมูลลงฐานข้อมูล — ทุกอย่างอยู่ในหน่วยความจำของเบราว์เซอร์
 * ● ปุ่มเสียงใช้ Web Audio สังเคราะห์สด (เริ่มเมื่อผู้ใช้กดเท่านั้น ตามข้อกำหนดของเบราว์เซอร์)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { addChildNode, availableParentIds, buildInitialNetwork, nodeColor, type CosmicNetworkModel, type CosmicNode } from '@/lib/cosmicNetwork';
import { DEFAULT_UNIVERSE_VOLUME, clampVolume, readUniverseSoundPref, writeUniverseSoundPref } from '@/lib/universeSoundPref';
import type { SceneApi, SceneStats, LabelState } from './CosmicNetworkScene';

const CosmicNetworkScene = dynamic(() => import('./CosmicNetworkScene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-sky-400/30 border-t-sky-400" />
        <p className="text-sm text-slate-400">กำลังประกอบจักรวาลเครือข่าย…</p>
      </div>
    </div>
  ),
});

const BASELINE_TOTAL = 781; // 1 + 5 + 25 + 125 + 625

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

function formatThaiDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${d.getFullYear() + 543}`;
}

function num(n: number): string {
  return n.toLocaleString('en-US');
}

export function Chip({ label, value, sub, tone = 'sky' }: { label: string; value: string; sub?: string; tone?: 'sky' | 'violet' | 'emerald' | 'gold' }) {
  const ring = tone === 'violet' ? 'border-violet-400/25' : tone === 'emerald' ? 'border-emerald-400/25' : tone === 'gold' ? 'border-amber-300/35' : 'border-sky-400/25';
  const text = tone === 'violet' ? 'text-violet-200' : tone === 'emerald' ? 'text-emerald-200' : tone === 'gold' ? 'text-amber-200' : 'text-sky-200';
  return (
    <div className={`rounded-xl border ${ring} bg-slate-950/55 px-3 py-1.5 backdrop-blur-sm`}>
      <div className="text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className={`text-sm font-bold tabular-nums ${text}`}>{value}</div>
      {sub ? <div className="text-[10px] text-slate-400">{sub}</div> : null}
    </div>
  );
}

export function GlassButton({
  children,
  onClick,
  active,
  title,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold backdrop-blur-sm transition disabled:opacity-40 ${
        active
          ? 'border-sky-400/60 bg-sky-500/25 text-sky-50'
          : 'border-slate-600/40 bg-slate-900/60 text-slate-200 hover:border-sky-400/40 hover:text-sky-100'
      }`}
    >
      {children}
    </button>
  );
}

export default function CosmicNetwork({
  className = '',
  heightClass = 'h-[78vh] min-h-[540px]',
  model: liveModel,
  badge,
  chips,
  panel,
  onSelectCode,
  rootLabel = 'AI INSURANCE NETWORK',
  nodeLabel,
}: {
  className?: string;
  /** ความสูงของฉาก 3 มิติ — หน้าแรกใช้เวอร์ชันเตี้ยกว่าเพื่อไม่ให้ล้นจอ */
  heightClass?: string;
  /** ส่งโมเดลจากข้อมูลจริงเข้ามา = โหมดข้อมูลจริง (อ่านเท่านั้น) — ซ่อนปุ่มเพิ่มสมาชิก/รีเซ็ตตัวอย่าง */
  model?: CosmicNetworkModel;
  /** ป้ายมุมขวาบนของฉาก (โหมดข้อมูลจริง) */
  badge?: { label: string; sub?: string };
  /** แทนชุดการ์ดสถิติมุมซ้ายบนด้วยของหน้าเจ้าบ้าน (โหมดข้อมูลจริง) */
  chips?: React.ReactNode;
  /** แทนแผงรายละเอียดด้านขวาด้วยของหน้าเจ้าบ้าน (โหมดข้อมูลจริง) */
  panel?: React.ReactNode;
  /** แจ้งรหัสสมาชิกที่ผู้ใช้คลิก/ปิดการเลือก (โหมดข้อมูลจริง) */
  onSelectCode?: (code: string | null) => void;
  /** ข้อความใต้ป้าย ROOT */
  rootLabel?: string;
  /** ข้อความบนป้ายโหนดที่เลือก */
  nodeLabel?: (node: CosmicNode) => string;
}) {
  const [simModel, setSimModel] = useState<CosmicNetworkModel>(() => buildInitialNetwork());
  const live = !!liveModel;
  const model = liveModel ?? simModel;
  const setModel = setSimModel;
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [paused, setPaused] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [addMode, setAddMode] = useState(false);
  const [confirmParent, setConfirmParent] = useState<number | null>(null);
  const [soundOn, setSoundOn] = useState(false);
  const [soundLive, setSoundLive] = useState(false); // เสียงดังจริงแล้ว (ผ่านการแตะจอครั้งแรก) หรือยัง
  const [volume, setVolume] = useState(DEFAULT_UNIVERSE_VOLUME);
  const [quality, setQuality] = useState<'high' | 'low'>('high');
  const [glOk, setGlOk] = useState<boolean | null>(null);
  const [stats, setStats] = useState<SceneStats>({ activeEnergy: 62, fps: 60, quality: 'high' });
  const [toast, setToast] = useState<{ msg: string; tone: 'ok' | 'warn' } | null>(null);
  const [hintOpen, setHintOpen] = useState(true);
  const [full, setFull] = useState(false);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const apiRef = useRef<SceneApi | null>(null);
  const labelRef = useRef<LabelState>({ root: { x: 0, y: 0, visible: false }, sel: { x: 0, y: 0, visible: false }, ready: false });
  const selLabelDom = useRef<HTMLDivElement>(null);
  const audioRef = useRef<{ running: boolean; setVolume: (v: number) => void; start: () => Promise<boolean>; stop: () => void; energyPulse: (i?: number, n?: number) => void; whoosh: (i?: number) => void; activation: () => void } | null>(null);
  const slowFrames = useRef(0);
  const volumeRef = useRef(DEFAULT_UNIVERSE_VOLUME);
  const toastTimer = useRef<number | null>(null);

  const total = model.total;
  const growth = ((total - BASELINE_TOTAL) / BASELINE_TOTAL) * 100;
  /** แถวคำอธิบายสีตามชั้น — นับจำนวนโหนดจริงในโมเดล */
  const levelRows = useMemo(
    () => Array.from({ length: Math.max(2, Math.min(7, model.byLevel.length)) }, (_, i) => i),
    [model.byLevel.length],
  );
  const goldColor = useMemo(() => nodeColor({ level: 1, accent: 'gold' } as CosmicNode), []);
  const available = useMemo(() => availableParentIds(model).length, [model]);
  const selected = selectedId !== null ? model.nodes[selectedId] ?? null : null;
  const parentOfSelected = selected?.parentId != null ? model.nodes[selected.parentId] : null;

  const say = useCallback((msg: string, tone: 'ok' | 'warn' = 'ok') => {
    setToast({ msg, tone });
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4200);
  }, []);

  /* ── ตรวจ WebGL + ตั้งค่าคุณภาพเริ่มต้นตามอุปกรณ์ ── */
  useEffect(() => {
    let ok = false;
    try {
      const c = document.createElement('canvas');
      ok = !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      ok = false;
    }
    setGlOk(ok);
    const small = window.innerWidth < 820 || (navigator.hardwareConcurrency ?? 8) <= 4;
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    if (small || reduced) setQuality('low');
    if (reduced) setAutoRotate(false);
  }, []);

  /* ── ป้ายชื่อ ROOT / โหนดที่เลือก (วาดนอก Canvas แต่ตามพิกัด 3D) ── */
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      raf = window.requestAnimationFrame(tick);
      const l = labelRef.current;
      const s = selLabelDom.current;
      if (s) {
        if (l.sel.visible && selectedId !== null) {
          s.style.transform = `translate(-50%, -100%) translate(${l.sel.x}px, ${l.sel.y - 14}px)`;
          s.style.opacity = '1';
        } else {
          s.style.opacity = '0';
        }
      }
    };
    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [selectedId]);

  /* ── ลดคุณภาพอัตโนมัติเมื่อเฟรมเรตตก ── */
  const onStats = useCallback((s: SceneStats) => {
    setStats(s);
    if (s.fps < 38) {
      slowFrames.current += 1;
      if (slowFrames.current >= 4) {
        slowFrames.current = 0;
        setQuality((q) => (q === 'high' ? 'low' : q));
      }
    } else {
      slowFrames.current = 0;
    }
  }, []);

  /* ── เสียง: เปิด/ปิด + ระดับความดัง ที่ตั้งไว้ใช้ร่วมกันทุกหน้า (จำค่าใน localStorage) ── */
  useEffect(() => {
    const pref = readUniverseSoundPref();
    volumeRef.current = pref.volume;
    setVolume(pref.volume);
    setSoundOn(pref.on);
  }, []);

  /* ── เสียง (สังเคราะห์สด · ต้องมีการแตะ/คลิกของผู้ใช้ก่อนจึงดัง) ── */
  useEffect(() => {
    if (!soundOn) return;
    let cancelled = false;
    (async () => {
      const { UniverseAudio } = await import('@/lib/universeAudio');
      if (cancelled) return;
      const a = new UniverseAudio();
      a.setVolume(volumeRef.current);
      audioRef.current = a;
      await a.start();
      a.setVolume(volumeRef.current);
      if (a.running) setSoundLive(true);
    })();
    return () => {
      cancelled = true;
      audioRef.current?.stop();
      audioRef.current = null;
    };
  }, [soundOn]);

  /* ผู้ใช้เคยเปิดเสียงไว้ (รวมค่าที่ตั้งจากหน้าอื่น) → เริ่มให้เองเมื่อแตะจอครั้งแรก
     เพราะเบราว์เซอร์อนุญาตให้เล่นเสียงจาก gesture ของผู้ใช้เท่านั้น
     (ข้ามการแตะที่ "ปุ่ม/แถบเสียง" เอง เพื่อไม่ให้ชนกับการกดเปิด-ปิดของผู้ใช้) */
  useEffect(() => {
    if (!soundOn) return;
    const kick = (e: Event) => {
      const el = e.target as Element | null;
      if (el && typeof el.closest === 'function' && el.closest('[data-sound-toggle]')) return;
      void audioRef.current?.start().then(() => {
        if (audioRef.current?.running) setSoundLive(true);
      });
    };
    window.addEventListener('pointerdown', kick, { once: true, capture: true });
    window.addEventListener('keydown', kick, { once: true });
    return () => {
      window.removeEventListener('pointerdown', kick, true);
      window.removeEventListener('keydown', kick);
    };
  }, [soundOn]);

  const changeVolume = useCallback(
    (v: number) => {
      const next = clampVolume(v);
      volumeRef.current = next;
      setVolume(next);
      if (next > 0) setSoundOn(true); // ขยับแถบเสียง = ต้องการให้มีเสียง
      audioRef.current?.setVolume(next);
      writeUniverseSoundPref({ volume: next });
    },
    [],
  );

  const toggleSound = useCallback(() => {
    if (soundOn) {
      setSoundOn(false);
      setSoundLive(false);
      writeUniverseSoundPref({ on: false });
      return;
    }
    // กันเคส "เปิดแล้วเงียบ": ถ้าระดับเสียงถูกตั้งไว้ต่ำมาก ให้กลับไปค่าเริ่มต้นที่ได้ยินชัด
    if (volumeRef.current < 0.05) {
      volumeRef.current = DEFAULT_UNIVERSE_VOLUME;
      setVolume(DEFAULT_UNIVERSE_VOLUME);
      audioRef.current?.setVolume(DEFAULT_UNIVERSE_VOLUME);
      writeUniverseSoundPref({ volume: DEFAULT_UNIVERSE_VOLUME });
    }
    setSoundOn(true);
    writeUniverseSoundPref({ on: true });
  }, [soundOn]);

  useEffect(() => {
    if (!soundOn) return;
    if (paused) return;
    let timer = 0;
    const loop = () => {
      timer = window.setTimeout(() => {
        audioRef.current?.energyPulse(0.045 + Math.random() * 0.035);
        loop();
      }, 900 + Math.random() * 1400);
    };
    loop();
    return () => window.clearTimeout(timer);
  }, [soundOn, paused]);

  const onCometPass = useCallback(() => {
    audioRef.current?.whoosh(0.13);
  }, []);

  const onUserInteract = useCallback(() => {
    setHintOpen(false);
  }, []);

  /* ── เลือกสมาชิก / โหมดเพิ่มสมาชิก ── */
  const onSelect = useCallback(
    (id: number | null) => {
      if (addMode && id !== null) {
        setConfirmParent(id);
        return;
      }
      setSelectedId(id);
      onSelectCode?.(id === null ? null : model.nodes[id]?.code ?? null);
      if (id !== null && soundOn) audioRef.current?.energyPulse(0.055, 560 + Math.random() * 280);
    },
    [addMode, soundOn, onSelectCode, model],
  );

  const onFocus = useCallback((id: number) => {
    apiRef.current?.focusNode(id);
  }, []);

  const confirmAdd = useCallback(() => {
    const parentId = confirmParent;
    if (parentId === null) return;
    const parent = model.nodes[parentId];
    if (!parent) return;
    if (parent.childCount >= model.branchFactor) {
      say(`สมาชิก ${parent.name} มีสายตรงครบ 5 คนแล้ว — เลือกโหนดอื่น`, 'warn');
      setConfirmParent(null);
      return;
    }
    const res = addChildNode(model, parentId, Date.now());
    if (!res) {
      say('เพิ่มสมาชิกไม่สำเร็จ (ถึงเพดานที่แสดงได้)', 'warn');
      setConfirmParent(null);
      return;
    }
    setModel(res.model);
    setSelectedId(res.nodeId);
    setAddMode(false);
    setConfirmParent(null);
    apiRef.current?.spawnBurst(res.nodeId);
    window.setTimeout(() => apiRef.current?.focusNode(res.nodeId), 420);
    audioRef.current?.activation();
    say(`สมาชิกใหม่ ${res.model.nodes[res.nodeId].code} เข้าร่วมใต้ ${parent.name} — เครือข่ายขยายอีกหนึ่งระดับ`);
  }, [confirmParent, model, say]);

  const cancelAdd = useCallback(() => {
    setAddMode(false);
    setConfirmParent(null);
  }, []);

  const resetAll = useCallback(() => {
    setModel(buildInitialNetwork());
    setSelectedId(null);
    setAddMode(false);
    setConfirmParent(null);
    say('รีเซ็ตจักรวาลกลับสู่ 781 โหนดเริ่มต้น');
  }, [say]);

  /* ── ขยายเต็มจอ (Fullscreen) ── */
  const toggleFull = useCallback(() => {
    const next = !full;
    setFull(next);
    const el = wrapRef.current;
    try {
      if (next) {
        const p = el?.requestFullscreen?.();
        if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
      } else if (document.fullscreenElement) {
        const p = document.exitFullscreen?.();
        if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
      }
    } catch {
      /* เบราว์เซอร์ไม่อนุญาต fullscreen — ใช้โหมด fixed เต็มจอแทน */
    }
  }, [full]);

  /* ปุ่ม Esc / ออกจาก fullscreen ของเบราว์เซอร์ → ย่อกลับให้ตรงกัน */
  useEffect(() => {
    const onFsChange = () => {
      if (!document.fullscreenElement) setFull(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) setFull(false);
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const wrapperClass = [
    'relative w-full overflow-hidden rounded-3xl border border-sky-500/20 bg-slate-950',
    full ? 'fixed inset-0 z-[2147483647] rounded-none border-0' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  /** ความสูงฉาก — โหมดเต็มจอใช้เต็มพื้นที่หน้าจอจริง */
  const sceneHeight = full ? 'h-[100dvh] min-h-[320px]' : heightClass;

  return (
    <div className={wrapperClass} ref={wrapRef}>
      <div className={`relative w-full ${sceneHeight}`}>
        {glOk === false ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 p-8 text-center">
            <p className="text-sm font-semibold text-sky-200">อุปกรณ์นี้ไม่รองรับ WebGL</p>
            <p className="max-w-md text-xs text-slate-400">
              {live
                ? 'ภาพจักรวาลเครือข่ายต้องใช้ WebGL — ตารางและตัวเลขสถานะจริงด้านข้างยังใช้งานได้ตามปกติ'
                : 'ภาพจักรวาลเครือข่ายต้องใช้ WebGL — ดูโครงสร้างเครือข่ายแบบข้อความได้ที่หน้า /network/1x5-autopilot'}
            </p>
          </div>
        ) : glOk === null ? (
          <div className="flex h-full w-full items-center justify-center">
            <p className="text-sm text-slate-400">กำลังเตรียมพื้นที่จักรวาล…</p>
          </div>
        ) : (
          <CosmicNetworkScene
            model={model}
            selectedId={selectedId}
            paused={paused}
            autoRotate={autoRotate}
            addMode={addMode}
            quality={quality}
            onSelect={onSelect}
            onFocus={onFocus}
            onStats={onStats}
            onCometPass={onCometPass}
            onUserInteract={onUserInteract}
            apiRef={apiRef}
            labelRef={labelRef}
          />
        )}

        {/* ── HUD: สถิติเครือข่าย (เรียลไทม์) + ป้ายชื่อ ROOT ── */}
        <div className="pointer-events-none absolute left-3 top-3 flex max-w-[70%] flex-wrap gap-2">
          {/* ป้ายชื่อเครือข่ายราก — ย้ายจากกลางจักรวาล (เดิมลอยทับกลุ่มดาว บังเครือข่ายดาว) มาอยู่หัวมุมซ้ายคู่กับชุดสถิติ */}
          <div className="whitespace-nowrap rounded-md border border-sky-400/40 bg-slate-950/70 px-2.5 py-1 text-[10px] font-semibold tracking-[0.18em] text-sky-100 backdrop-blur-sm">
            ROOT · {rootLabel}
          </div>
          {chips ?? (
            <>
              <Chip label="Total Members" value={num(total)} sub={`${model.byLevel.length} ชั้น`} />
              <Chip label="Direct Connections" value={num(model.edges.length)} sub="เส้นพลังงาน" />
              <Chip label="Network Depth" value={`${model.depth + 1} ชั้น`} sub={`ลึกสุด ${model.depth} ต่อ`} tone="violet" />
              <Chip label="Active Energy" value={`${stats.activeEnergy}%`} sub={`${stats.fps.toFixed(0)} fps`} tone="emerald" />
              <Chip label="Network Growth" value={`${growth >= 0 ? '+' : ''}${growth.toFixed(2)}%`} sub={`ฐาน ${num(BASELINE_TOTAL)} โหนด`} tone="violet" />
            </>
          )}
        </div>

        {/* ── ป้าย: โหมดข้อมูลจริง / SIMULATION + คุณภาพ ── */}
        <div className="pointer-events-none absolute right-3 top-3 flex flex-col items-end gap-1.5">
          {live ? (
            <>
              <div className="rounded-md border border-emerald-400/50 bg-emerald-500/15 px-3 py-1 text-[11px] font-semibold tracking-wide text-emerald-100 backdrop-blur-sm">
                {badge?.label ?? 'LIVE · ข้อมูลจริงในฐานข้อมูล'}
              </div>
              {badge?.sub ? (
                <div className="rounded-md border border-slate-600/40 bg-slate-950/60 px-2.5 py-1 text-[10px] text-slate-300 backdrop-blur-sm">
                  {badge.sub}
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-md border border-amber-400/50 bg-amber-500/15 px-3 py-1 text-[11px] font-semibold tracking-wide text-amber-200 backdrop-blur-sm">
              SIMULATION · ตัวอย่างจำลอง
            </div>
          )}
          <div className="rounded-md border border-slate-600/40 bg-slate-950/60 px-2.5 py-1 text-[10px] text-slate-300 backdrop-blur-sm">
            คุณภาพ {quality === 'high' ? 'สูง' : 'ลดอัตโนมัติ'} · {stats.fps.toFixed(0)} fps
          </div>
          <button
            type="button"
            onClick={toggleFull}
            title={full ? 'ย่อกลับขนาดปกติ (Esc)' : 'ขยายจักรวาลเต็มจอ'}
            aria-label={full ? 'ย่อกลับขนาดปกติ' : 'ขยายจักรวาลเต็มจอ'}
            className="pointer-events-auto rounded-md border border-sky-400/45 bg-slate-950/75 px-3 py-1.5 text-[11px] font-semibold text-sky-100 backdrop-blur-sm transition hover:border-sky-300/70 hover:bg-sky-500/25 hover:text-white"
          >
            {full ? '⤡ ย่อกลับ' : '⛶ ขยายเต็มจอ'}
          </button>
        </div>

        {/* ── ป้ายชื่อ ROOT: ย้ายออกจากกลางจักรวาลไปมุมซ้ายล่าง (เดิมลอยทับกลุ่มดาวและบังเครือข่ายดาว) ── */}

        {/* ── ป้าย 3D: โหนดที่เลือก ── */}
        <div
          ref={selLabelDom}
          className="pointer-events-none absolute left-0 top-0 whitespace-nowrap rounded-md border border-violet-400/40 bg-slate-950/75 px-2 py-0.5 text-[10px] text-violet-100 backdrop-blur-sm transition-none"
          style={{ opacity: 0 }}
        >
          {selected ? nodeLabel?.(selected) ?? `${selected.name} · ชั้น ${selected.level} · ${selected.code}` : ''}
        </div>

        {/* ── แผงข้อมูลสมาชิก (ด้านขวา) — โหมดข้อมูลจริงใช้ panel ที่หน้าเจ้าบ้านส่งมา ── */}
        {panel ? (
          <div className="absolute right-3 top-28 max-h-[62%] w-[248px] max-w-[72vw] overflow-y-auto rounded-2xl border border-sky-400/25 bg-slate-950/70 p-3.5 backdrop-blur-md">
            {panel}
          </div>
        ) : selected ? (
          <div className="absolute right-3 top-28 w-[248px] max-w-[72vw] rounded-2xl border border-sky-400/25 bg-slate-950/70 p-3.5 backdrop-blur-md">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-[0.2em] text-sky-300/80">Member</div>
                <div className="text-sm font-bold text-sky-50">{selected.name}</div>
                <div className="font-mono text-[10px] text-slate-400">{selected.code}</div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="rounded-md border border-slate-600/40 px-1.5 py-0.5 text-[10px] text-slate-300 hover:text-white"
              >
                ✕
              </button>
            </div>
            <dl className="mt-3 space-y-1.5 text-[11px]">
              {[
                ['Level', `ชั้น ${selected.level}`],
                ['Parent', parentOfSelected ? `${parentOfSelected.name} (${parentOfSelected.code})` : '— (ROOT)'],
                ['Direct Members', `${selected.childCount} / ${model.branchFactor}`],
                ['Total Network', num(selected.subtreeSize)],
                ['Network Depth', `${selected.depthBelow} ชั้นใต้สาย`],
                ['Created Date', formatThaiDate(selected.joinedAt)],
                ['Status', selected.bornAt > 0 ? 'NEW · เพิ่งเข้าร่วม' : 'ACTIVE'],
              ].map(([k, v]) => (
                <div key={k} className="flex items-baseline justify-between gap-3 border-b border-slate-700/40 pb-1 last:border-0">
                  <dt className="shrink-0 text-[10px] uppercase tracking-wide text-slate-400">{k}</dt>
                  <dd className="text-right text-slate-100">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-3 flex gap-2">
              <button
                type="button"
                onClick={() => apiRef.current?.focusNode(selected.id)}
                className="flex-1 rounded-lg border border-sky-400/40 bg-sky-500/15 px-2 py-1.5 text-[11px] font-semibold text-sky-100 hover:bg-sky-500/25"
              >
                โฟกัสโหนดนี้
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddMode(true);
                  setConfirmParent(selected.id);
                }}
                className="flex-1 rounded-lg border border-emerald-400/40 bg-emerald-500/15 px-2 py-1.5 text-[11px] font-semibold text-emerald-100 hover:bg-emerald-500/25"
              >
                + ต่อใต้คนนี้
              </button>
            </div>
          </div>
        ) : null}

        {/* ── โหมดเพิ่มสมาชิก + ยืนยัน (โหมดจำลองเท่านั้น) ── */}
        {!live && addMode ? (
          <div className="absolute left-1/2 top-20 w-[300px] max-w-[86vw] -translate-x-1/2 rounded-2xl border border-emerald-400/35 bg-slate-950/80 p-3 text-center backdrop-blur-md">
            {confirmParent === null ? (
              <>
                <p className="text-[12px] font-semibold text-emerald-100">เลือกสมาชิกที่จะเป็นผู้แนะนำ</p>
                <p className="mt-1 text-[11px] text-slate-300">
                  แตะที่ทรงกลมพลังงานในฉาก · เพิ่มได้เฉพาะโหนดที่มีสายตรงไม่ครบ 5 คน
                </p>
                <p className="mt-1 text-[10px] text-emerald-200/80">โหนดที่รับสมาชิกใหม่ได้ตอนนี้: {num(available)}</p>
              </>
            ) : (
              <>
                <p className="text-[12px] font-semibold text-emerald-100">
                  เพิ่มสมาชิกใหม่ใต้ {model.nodes[confirmParent]?.name}?
                </p>
                <p className="mt-1 text-[10px] text-slate-300">
                  {model.nodes[confirmParent]?.code} · สายตรง {model.nodes[confirmParent]?.childCount}/
                  {model.branchFactor} · เครือข่ายใต้สาย {num(model.nodes[confirmParent]?.subtreeSize ?? 1)}
                </p>
                <div className="mt-2.5 flex justify-center gap-2">
                  <button
                    type="button"
                    onClick={confirmAdd}
                    className="rounded-lg border border-emerald-400/50 bg-emerald-500/25 px-3 py-1.5 text-[11px] font-semibold text-emerald-50 hover:bg-emerald-500/35"
                  >
                    ยืนยันเพิ่มสมาชิก
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmParent(null)}
                    className="rounded-lg border border-slate-600/50 bg-slate-900/70 px-3 py-1.5 text-[11px] text-slate-200 hover:text-white"
                  >
                    เลือกใหม่
                  </button>
                </div>
              </>
            )}
            <button type="button" onClick={cancelAdd} className="mt-2 text-[10px] text-slate-400 underline hover:text-slate-200">
              ยกเลิกโหมดเพิ่มสมาชิก
            </button>
          </div>
        ) : null}

        {/* ── คำใบ้การใช้งาน ── */}
        {hintOpen ? (
          <div className="pointer-events-none absolute bottom-20 left-1/2 -translate-x-1/2 rounded-full border border-slate-600/40 bg-slate-950/70 px-3 py-1 text-[10px] text-slate-300 backdrop-blur-sm">
            ลากเพื่อหมุนจักรวาล · ล้อเมาส์/หุบนิ้วเพื่อซูม · คลิกสมาชิกเพื่อดูข้อมูล · ดับเบิลคลิกเพื่อโฟกัส
          </div>
        ) : null}

        {/* ── แถบควบคุม ── */}
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap items-center justify-center gap-1.5">
          <GlassButton active={full} onClick={toggleFull} title={full ? 'ย่อกลับขนาดปกติ (Esc)' : 'ขยายจักรวาลเต็มจอ'}>
            {full ? '⤡ ย่อกลับ' : '⛶ เต็มจอ'}
          </GlassButton>
          <GlassButton onClick={() => apiRef.current?.resetView()} title="กลับมุมมองมาตรฐาน">
            รีเซ็ตมุมมอง
          </GlassButton>
          <GlassButton onClick={() => apiRef.current?.focusRoot()} title="โฟกัส ROOT">
            โฟกัส ROOT
          </GlassButton>
          <GlassButton onClick={() => apiRef.current?.zoom(0.78)} title="ซูมเข้า">
            ＋
          </GlassButton>
          <GlassButton onClick={() => apiRef.current?.zoom(1.28)} title="ซูมออก">
            －
          </GlassButton>
          <GlassButton active={autoRotate} onClick={() => setAutoRotate((v) => !v)} title="หมุนอัตโนมัติ 360°">
            {autoRotate ? 'หมุนอัตโนมัติ: เปิด' : 'หมุนอัตโนมัติ: ปิด'}
          </GlassButton>
          <GlassButton active={paused} onClick={() => setPaused((v) => !v)} title="หยุด/เล่นแอนิเมชันทั้งหมด">
            {paused ? 'เล่นแอนิเมชัน' : 'หยุดแอนิเมชัน'}
          </GlassButton>
          <span data-sound-toggle className="contents">
            <GlassButton active={soundOn} onClick={toggleSound} title="เสียงบรรยากาศอวกาศ (สังเคราะห์สดในเบราว์เซอร์)">
              {soundOn ? (soundLive ? '🔊 เสียง: เปิด' : '🔊 เสียง: เปิด · แตะจอ 1 ครั้ง') : '🔇 เสียง: ปิด'}
            </GlassButton>
          </span>
          {/* ── แถบปรับระดับเสียง — ค่าที่ตั้งไว้ใช้ร่วมกันทุกหน้าที่ฝังจักรวาลนี้ ── */}
          <label data-sound-toggle className="flex items-center gap-1.5 rounded-lg border border-slate-600/40 bg-slate-900/60 px-2 py-1 text-[10px] text-slate-200 backdrop-blur-sm">
            <span>ระดับเสียง</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => changeVolume(Number(e.target.value))}
              className="h-1 w-20 accent-sky-400"
              aria-label="ระดับความดังเสียงจักรวาล"
            />
            <span className="w-8 text-right tabular-nums text-slate-300">{Math.round(volume * 100)}%</span>
          </label>
          {!live ? (
            <>
              <GlassButton
                active={addMode}
                onClick={() => {
                  setAddMode((v) => !v);
                  setConfirmParent(null);
                }}
                title="เพิ่มสมาชิกใหม่แบบอินเทอร์แอกทีฟ"
              >
                {addMode ? 'กำลังเพิ่มสมาชิก…' : '+ ADD MEMBER'}
              </GlassButton>
              <GlassButton onClick={resetAll} title="กลับสู่เครือข่ายตัวอย่าง 781 โหนด">
                ↺ รีเซ็ตตัวอย่าง
              </GlassButton>
            </>
          ) : null}
        </div>

        {/* ── Legend ── */}
        <div className="pointer-events-none absolute bottom-16 left-3 hidden flex-col gap-1 text-[10px] text-slate-400 md:flex">
          {levelRows.map((lv) => {
            const c = nodeColor({ level: lv } as CosmicNode);
            return (
              <div key={lv} className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: `rgb(${c[0]},${c[1]},${c[2]})`, boxShadow: `0 0 6px rgb(${c[0]},${c[1]},${c[2]})` }}
                />
                ชั้น {lv} · {num(model.byLevel[lv] ?? 0)} โหนด
              </div>
            );
          })}
          {live ? (
            <>
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-block h-2 w-2 rounded-full"
                  style={{ background: `rgb(${goldColor[0]},${goldColor[1]},${goldColor[2]})`, boxShadow: `0 0 7px rgb(${goldColor[0]},${goldColor[1]},${goldColor[2]})` }}
                />
                ผ่านเงื่อนไขรอบนี้ (แหวนทอง)
              </div>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-full bg-slate-600" />
                ยังไม่ยืนยันผลงาน/ปิดจุด (หม่น)
              </div>
            </>
          ) : null}
        </div>

        {/* ── Toast ── */}
        {toast ? (
          <div
            className={`absolute bottom-28 left-1/2 z-10 w-[320px] max-w-[88vw] -translate-x-1/2 rounded-xl border px-3 py-2 text-center text-[11px] backdrop-blur-md ${
              toast.tone === 'warn' ? 'border-amber-400/50 bg-amber-500/15 text-amber-100' : 'border-sky-400/40 bg-sky-500/15 text-sky-50'
            }`}
          >
            {toast.msg}
          </div>
        ) : null}
      </div>
    </div>
  );
}
