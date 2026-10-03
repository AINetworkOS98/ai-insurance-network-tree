'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * TikTokChannel — ช่องดูวีดีโอ TikTok แบบสุ่มต่อเนื่อง (@aka989._)
 *
 * ตามสเปกที่สั่ง:
 *  1) เน้นวีดีโอเครือข่าย 90% — เรียก /api/videos/next?net=0.9 (ถ่วงน้ำหนักฝั่งเซิร์ฟเวอร์:
 *     เลน "เครือข่าย" 90% / คลิปหมวดอื่น 10% · ถ้าคลังไม่มีหมวดอื่นจะเล่นเครือข่าย 100% โดยไม่ล้ม)
 *  2) AI ตรวจจับการเข้าชม (คำนวณในเบราว์เซอร์) — ให้คะแนน 0-100 จากสัญญาณจริง:
 *     ดูต่อเนื่อง · ดูจนจบ · แท็บโฟกัสอยู่ · มีปฏิสัมพันธ์กับหน้า · ดูหลายคลิป · เวลาดูรวม · ไม่เลื่อนหนี
 *     ถึงเกณฑ์ = "ตรวจพบว่าตั้งใจสนใจ" แล้วระบบทำงานต่อเองทันที
 *  3) เมื่อตรวจพบ: (ก) ส่งลิงก์คลิปไปที่ TikTok ทันที (เปิดแท็บใหม่ · ถ้าเบราว์เซอร์บล็อก popup
 *     จะติดอาวุธไว้ให้เปิดทันทีที่ผู้ชมแตะหน้าจอครั้งถัดไป ไม่เงียบหาย)
 *     (ข) เปิดเสียงให้เองและตรึงให้เสียงต่อเนื่องทุคคลิป — ถ้าผู้ชมกดปิดเสียงเอง ระบบจะไม่เปิดซ้ำ
 *     (ค) บันทึกเหตุการณ์ไว้ตรวจย้อนหลังที่ /api/videos/interest
 */

type Video = {
  id: string;
  title: string | null;
  url: string;
  tiktokId: string | null;
  embedUrl: string | null;
  durationSec: number;
  topic: string | null;
  cta: string | null;
  ctaUrl: string | null;
};
type Pool = { active: number; network?: number; other?: number; ratio?: number | null; lane?: string };
type NextResp = { ok: boolean; video: Video | null; reason?: string; pool?: Pool };

const NET_TOPIC = 'เครือข่าย';
const NET_RATIO = 0.9;
const PLAYER_PARAMS =
  'autoplay=1&loop=0&controls=1&progress_bar=1&play_button=1&volume_control=1&fullscreen_button=1&timestamp=1&music_info=0&description=1&rel=0&native_context_menu=0&closed_caption=1';
const FALLBACK_SEC = 60;
const INTEREST_THRESHOLD = 60;
const MIN_WATCH_SEC = 8;
const TRIGGER_COOLDOWN_MS = 90_000;

function sid() {
  try {
    const k = 'tt_channel_sid';
    let v = sessionStorage.getItem(k);
    if (!v) {
      v = 'tt-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      sessionStorage.setItem(k, v);
    }
    return v;
  } catch {
    return 'tt-anon';
  }
}

/** ตัวตนผู้เข้าชมตัวเดียวกับ public/track.js → event ผูกกับ Visitor เดิม (ต้องยินยอมก่อน) */
function visitorId(): string {
  try {
    const k = 'ain_visitor_id';
    let v = localStorage.getItem(k);
    if (!v) {
      v = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
      localStorage.setItem(k, v);
    }
    return v;
  } catch {
    return '';
  }
}

type Snapshot = {
  watchRatio: number;
  completed: boolean;
  visibleRatio: number;
  activity: number;
  clips: number;
  sessionSec: number;
  scrolledAway: boolean;
};
type Part = { label: string; pts: number };

/** AI ให้คะแนนความสนใจ — กติกาโปร่งใส ตรวจย้อนหลังได้ (ไม่ใช่กล่องดำ) */
function scoreInterest(s: Snapshot): { score: number; parts: Part[] } {
  const parts: Part[] = [];
  const add = (label: string, pts: number) => {
    if (pts > 0) parts.push({ label, pts });
  };

  const w = s.watchRatio;
  add('ดูต่อเนื่องเกิน 60% ของคลิป', w >= 0.6 ? 22 : 0);
  add('ดูเกือบครบทั้งคลิป', w >= 0.85 ? 8 : 0);
  add('ดูจนจบคลิป', s.completed ? 18 : 0);
  add('อยู่กับคลิป ไม่สลับแท็บ', s.visibleRatio >= 0.9 ? 14 : s.visibleRatio >= 0.6 ? 7 : 0);
  add('มีปฏิสัมพันธ์กับหน้าเว็บ', s.activity >= 3 ? 8 : 0);
  add('ดูหลายคลิปต่อเนื่อง', s.clips >= 4 ? 10 : s.clips >= 2 ? 6 : 0);
  add('เวลาดูรวมเกิน 1 นาที', s.sessionSec >= 60 ? 8 : 0);
  add('ไม่เลื่อนหนีจากคลิป', s.scrolledAway ? 0 : 10);

  const score = Math.max(0, Math.min(100, parts.reduce((a, p) => a + p.pts, 0)));
  return { score, parts };
}

export default function TikTokChannel() {
  const [video, setVideo] = useState<Video | null>(null);
  const [state, setState] = useState<'loading' | 'playing' | 'empty' | 'error'>('loading');
  const [pool, setPool] = useState<Pool>({ active: 0 });
  const [count, setCount] = useState(0);
  const [realDur, setRealDur] = useState(0);
  const [lastEnd, setLastEnd] = useState<{ at: number; waited: number } | null>(null);
  const [auto, setAuto] = useState(true);
  const [soundOn, setSoundOn] = useState(false);
  const [ai, setAi] = useState<{ score: number; parts: Part[] }>({ score: 0, parts: [] });
  const [aiHits, setAiHits] = useState(0);
  const [aiMsg, setAiMsg] = useState('');
  const [armed, setArmed] = useState(false);

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const startedAt = useRef<number>(Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advancing = useRef(false);
  const durRef = useRef<number>(0);

  // ตัวนับของ AI
  const clipSec = useRef(0);
  const visibleSec = useRef(0);
  const activity = useRef(0);
  const clipsSeen = useRef(0);
  const sessionSec = useRef(0);
  const scrolledAwaySec = useRef(0);
  const triggeredAt = useRef(0);
  const gestureAt = useRef(0);
  const soundOnRef = useRef(false);
  const userMutedRef = useRef(false);
  const videoRef = useRef<Video | null>(null);
  const stateRef = useRef<string>('loading');
  const armedUrl = useRef<string | null>(null);

  videoRef.current = video;
  stateRef.current = state;

  const cmd = useCallback((type: string) => {
    try {
      frameRef.current?.contentWindow?.postMessage(JSON.stringify({ type, 'x-tiktok-player': true }), '*');
    } catch {
      /* ignore */
    }
  }, []);

  /** เปิด/ปิดเสียง + ตรึงสถานะ (ยิงซ้ำ กันคำสั่งหลุดหลัง iframe โหลดใหม่) */
  const applySound = useCallback(
    (on: boolean) => {
      soundOnRef.current = on;
      setSoundOn(on);
      const send = () => cmd(on ? 'unmute' : 'mute');
      send();
      [250, 1000, 2500].forEach((t) =>
        setTimeout(() => {
          if (soundOnRef.current === on) send();
        }, t),
      );
    },
    [cmd],
  );

  const report = useCallback((completed: boolean, durOverride = 0) => {
    const v = videoRef.current;
    if (!v) return;
    const seconds = Math.round((Date.now() - startedAt.current) / 1000);
    const dur = Math.round(durOverride || durRef.current || v.durationSec || 0);
    const body = JSON.stringify({ videoId: v.id, sid: sid(), seconds, durationSec: dur, completed });
    try {
      navigator.sendBeacon?.('/api/videos/played', new Blob([body], { type: 'application/json' })) ||
        fetch('/api/videos/played', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
    } catch {
      /* ignore */
    }
  }, []);

  /** AI ตรวจพบความสนใจ → ส่งลิงก์ไป TikTok + เปิดเสียงต่อเนื่อง + บันทึกเหตุการณ์ */
  const onInterest = useCallback(
    (score: number, parts: Part[]) => {
      const v = videoRef.current;
      triggeredAt.current = Date.now();
      setAiHits((n) => n + 1);

      if (!userMutedRef.current) applySound(true);

      if (v?.url) {
        let opened = false;
        if (Date.now() - gestureAt.current < 5000) {
          try {
            opened = !!window.open(v.url, '_blank', 'noopener,noreferrer');
          } catch {
            opened = false;
          }
        }
        if (opened) {
          setArmed(false);
          setAiMsg('🎯 AI ตรวจพบความสนใจ — ส่งลิงก์คลิปไปที่ TikTok แล้ว (เปิดแท็บใหม่) + เปิดเสียงต่อเนื่อง');
        } else {
          armedUrl.current = v.url;
          setArmed(true);
          setAiMsg('🎯 AI ตรวจพบความสนใจ — แตะหน้าจอครั้งถัดไป ระบบจะเปิดคลิปบน TikTok ให้ทันที + เปิดเสียงต่อเนื่อง');
        }
      } else {
        setAiMsg('🎯 AI ตรวจพบความสนใจ — เปิดเสียงให้ต่อเนื่องแล้ว');
      }

      try {
        const payload = JSON.stringify({
          vid: visitorId(),
          sid: sid(),
          videoCode: v?.id || '',
          score,
          signals: Object.fromEntries(parts.map((p) => [p.label, p.pts])),
          action: 'handoff+unmute',
          seconds: Math.round(visibleSec.current),
          durationSec: Math.round(durRef.current || v?.durationSec || 0),
          eventKey: `${sid()}-${v?.id || 'na'}-${Math.floor(Date.now() / 60000)}`,
        });
        navigator.sendBeacon?.('/api/videos/interest', new Blob([payload], { type: 'application/json' })) ||
          fetch('/api/videos/interest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload, keepalive: true });
      } catch {
        /* ignore */
      }
    },
    [applySound],
  );

  const fetchNext = useCallback(async (random = false) => {
    setState('loading');
    try {
      const r = await fetch(
        `/api/videos/next?topic=${encodeURIComponent(NET_TOPIC)}&net=${NET_RATIO}&sid=${encodeURIComponent(sid())}${random ? '&r=' + Math.random() : ''}`,
        { cache: 'no-store' },
      );
      const j: NextResp = await r.json();
      if (!j.ok || !j.video) {
        setVideo(null);
        setPool(j.pool || { active: 0 });
        setState('empty');
        return;
      }
      durRef.current = Number(j.video.durationSec || 0) > 0 ? Number(j.video.durationSec) : 0;
      setRealDur(durRef.current);
      setVideo(j.video);
      setPool(j.pool || { active: 0 });
      setCount((c) => c + 1);
      setLastEnd({ at: Date.now(), waited: 0 });
      startedAt.current = Date.now();
      clipSec.current = 0;
      visibleSec.current = 0;
      activity.current = 0;
      scrolledAwaySec.current = 0;
      clipsSeen.current += 1;
      setState('playing');
    } catch {
      setState('error');
    }
  }, []);

  const advance = useCallback(
    (reason: 'ended' | 'manual' | 'timeout') => {
      if (advancing.current) return;
      advancing.current = true;
      if (timer.current) clearTimeout(timer.current);
      if (reason === 'ended') {
        const now = Date.now();
        setLastEnd((p) => ({ at: now, waited: p ? now - p.at : 0 }));
      }
      report(reason === 'ended', durRef.current);
      void fetchNext(reason === 'manual');
      setTimeout(() => {
        advancing.current = false;
      }, 900);
    },
    [fetchNext, report],
  );

  useEffect(() => {
    void fetchNext();
  }, [fetchNext]);

  // ผู้ใช้แตะ/ขยับ → นับปฏิสัมพันธ์ + ใช้สิทธิ์เปิดแท็บ TikTok ที่ติดอาวุธไว้
  useEffect(() => {
    const bump = () => {
      activity.current += 1;
      gestureAt.current = Date.now();
      const url = armedUrl.current;
      if (url) {
        armedUrl.current = null;
        try {
          if (window.open(url, '_blank', 'noopener,noreferrer')) {
            setArmed(false);
            setAiMsg('🎯 ส่งลิงก์คลิปไปที่ TikTok แล้ว (เปิดแท็บใหม่)');
          }
        } catch {
          /* ignore */
        }
      }
    };
    window.addEventListener('pointerdown', bump, { passive: true });
    window.addEventListener('touchstart', bump, { passive: true });
    window.addEventListener('mousemove', bump, { passive: true });
    window.addEventListener('keydown', bump);
    return () => {
      window.removeEventListener('pointerdown', bump);
      window.removeEventListener('touchstart', bump);
      window.removeEventListener('mousemove', bump);
      window.removeEventListener('keydown', bump);
    };
  }, []);

  // AI วัดผลทุก 1 วินาที + ตัดสินว่าผู้ชม "สนใจ"
  useEffect(() => {
    const t = setInterval(() => {
      if (stateRef.current !== 'playing') return;
      const el = wrapRef.current;
      if (el) {
        const r = el.getBoundingClientRect();
        const visiblePx = Math.max(0, Math.min(r.bottom, window.innerHeight) - Math.max(r.top, 0));
        const ratio = r.height > 0 ? visiblePx / r.height : 1;
        if (ratio < 0.5) scrolledAwaySec.current += 1;
        else {
          scrolledAwaySec.current = 0;
          if (document.hidden) return;
          visibleSec.current += 1;
        }
      } else {
        if (document.hidden) return;
        visibleSec.current += 1;
      }

      clipSec.current += 1;
      if (scrolledAwaySec.current === 0) sessionSec.current += 1;

      const dur = durRef.current || videoRef.current?.durationSec || 0;
      const snap: Snapshot = {
        watchRatio: dur > 0 ? Math.min(1, visibleSec.current / dur) : 0,
        completed: dur > 0 && visibleSec.current >= dur - 1.5,
        visibleRatio: clipSec.current > 0 ? Math.min(1, visibleSec.current / clipSec.current) : 0,
        activity: activity.current,
        clips: clipsSeen.current,
        sessionSec: sessionSec.current,
        scrolledAway: scrolledAwaySec.current >= 4,
      };
      const { score, parts } = scoreInterest(snap);
      setAi({ score, parts });

      const ready = visibleSec.current >= MIN_WATCH_SEC || sessionSec.current >= 20;
      if (ready && score >= INTEREST_THRESHOLD && Date.now() - triggeredAt.current > TRIGGER_COOLDOWN_MS) {
        onInterest(score, parts);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [onInterest]);

  // ฟังเหตุการณ์จากเครื่องเล่น TikTok (จบคลิป / เวลาปัจจุบัน + ความยาวจริง)
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const from = frameRef.current?.contentWindow;
      if (from && e.source && e.source !== from) return;
      const raw = e.data as unknown;
      let d: Record<string, unknown> | null = null;
      if (raw && typeof raw === 'object') d = raw as Record<string, unknown>;
      else if (typeof raw === 'string' && raw.trim().startsWith('{')) {
        try {
          d = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          d = null;
        }
      }
      if (!d || d['x-tiktok-player'] !== true) return;

      const type = String(d.type || '');
      const value = d.value;

      if (type === 'onCurrentTime' && value && typeof value === 'object') {
        const ct = Number((value as Record<string, unknown>).currentTime || 0);
        const du = Number((value as Record<string, unknown>).duration || 0);
        if (du > 0) {
          durRef.current = du;
          setRealDur((prev) => (Math.abs(prev - du) > 0.2 ? du : prev));
          if (auto && ct > 0 && ct >= du - 0.35) advance('ended');
        }
        return;
      }
      if (type === 'onStateChange' && value === 0 && auto) advance('ended');
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [advance, auto]);

  // เวลาสำรอง: ไม่ได้เหตุการณ์ "จบ" → ต่อคลิปใหม่หลัง (ความยาวจริง + 5 วิ)
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!auto || state !== 'playing' || !video) return;
    const dur = realDur > 0 ? realDur : video.durationSec > 0 ? video.durationSec : FALLBACK_SEC;
    const wait = Math.min(Math.max(dur + 5, 12), 15 * 60);
    timer.current = setTimeout(() => advance('timeout'), wait * 1000);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [auto, state, video, realDur, advance]);

  useEffect(() => {
    const onHide = () => report(false);
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [report]);

  /** คลิปใหม่โหลดเสร็จ: ถ้าโหมดเสียงต่อเนื่องเปิดอยู่ → สั่งเปิดเสียงซ้ำอัตโนมัติ */
  const onFrameLoad = useCallback(() => {
    if (soundOnRef.current && !userMutedRef.current) applySound(true);
  }, [applySound]);

  const toggleSound = () => {
    const next = !soundOnRef.current;
    userMutedRef.current = !next;
    applySound(next);
    setAiMsg(next ? '🔊 เปิดเสียงต่อเนื่องแล้ว (ระบบคงเสียงไว้ทุคคลิป)' : '🔇 ปิดเสียงแล้ว — ระบบจะไม่เปิดเสียงเองอีกในรอบนี้');
  };

  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.();
  };

  const openOnTikTok = () => {
    const v = video;
    if (!v?.url) return;
    gestureAt.current = Date.now();
    armedUrl.current = null;
    const w = window.open(v.url, '_blank', 'noopener,noreferrer');
    setArmed(false);
    setAiMsg(w ? 'ส่งลิงก์คลิปไปที่ TikTok แล้ว (เปิดแท็บใหม่)' : 'เบราว์เซอร์บล็อกแท็บใหม่ — ใช้ลิงก์ "ดูบน TikTok" ด้านล่างแทน');
  };

  const embedSrc = video?.embedUrl ? `${video.embedUrl}?${PLAYER_PARAMS}` : null;
  const shownDur = realDur > 0 ? Math.round(realDur) : video?.durationSec || 0;
  const detected = ai.score >= INTEREST_THRESHOLD;
  const netPct = Math.round(NET_RATIO * 100);

  return (
    <div className="mb-8">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-pink-300 text-sm font-semibold border border-slate-800">
          <span>🎬</span> ช่องดูวีดีโอ · สุ่มต่อเนื่อง
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-900/40 text-emerald-200 text-[12px] font-semibold border border-emerald-700/50">
          🎯 เน้นวีดีโอเครือข่าย {netPct}%
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-sky-900/40 text-sky-200 text-[12px] font-semibold border border-sky-700/50">
          🤖 ตรวจจับการเข้าชมด้วย AI อัตโนมัติ
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 md:p-6 shadow-[0_24px_60px_-30px_rgba(2,6,23,0.85)]">
        <div className="grid md:grid-cols-[320px_1fr] gap-5">
          <div ref={wrapRef} className="mx-auto w-full max-w-[320px]">
            <div className="relative rounded-[26px] border border-white/15 bg-black shadow-2xl overflow-hidden" style={{ aspectRatio: '9 / 16' }}>
              {embedSrc ? (
                <iframe
                  ref={frameRef}
                  key={video?.id}
                  src={embedSrc}
                  onLoad={onFrameLoad}
                  className="absolute inset-0 w-full h-full"
                  allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                  allowFullScreen
                  title={video?.title || 'TikTok video'}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                  <div className="text-4xl mb-3">{state === 'loading' ? '⏳' : state === 'error' ? '⚠️' : '📼'}</div>
                  <div className="text-slate-200 text-sm font-semibold">
                    {state === 'loading' ? 'กำลังสุ่มคลิป…' : state === 'error' ? 'เชื่อมต่อระบบไม่ได้' : `ยังไม่มีคลิปหมวด ${NET_TOPIC} ในคลัง`}
                  </div>
                  <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                    {state === 'empty'
                      ? 'เพิ่ม/ตั้งหมวดคลิปได้ที่ POST /webhook/add-video (n8n) หรือ /api/videos/add — เมื่อมีคลิปแล้วช่องนี้จะสุ่มเล่นเองทันที'
                      : state === 'error'
                        ? 'ลองรีเฟรชอีกครั้ง'
                        : ''}
                  </p>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
              <button onClick={() => cmd('play')} className="px-3 py-2 rounded-full bg-white/10 text-slate-100 text-xs font-semibold border border-white/15 hover:bg-white/20 transition" title="เล่น">▶ Play</button>
              <button onClick={() => { cmd('pause'); report(false); }} className="px-3 py-2 rounded-full bg-white/10 text-slate-100 text-xs font-semibold border border-white/15 hover:bg-white/20 transition" title="หยุดชั่วคราว">⏸ Pause</button>
              <button onClick={() => advance('manual')} className="px-3 py-2 rounded-full bg-white/10 text-slate-100 text-xs font-semibold border border-white/15 hover:bg-white/20 transition" title="คลิปถัดไป">⏭ Next</button>
              <button onClick={() => { setAuto(true); advance('manual'); }} className="px-3 py-2 rounded-full bg-pink-400/20 text-pink-200 text-xs font-semibold border border-pink-400/40 hover:bg-pink-400/30 transition" title="สุ่มใหม่">🔀 สุ่มใหม่</button>
              <button onClick={toggleFullscreen} className="px-3 py-2 rounded-full bg-white/10 text-slate-100 text-xs font-semibold border border-white/15 hover:bg-white/20 transition" title="เต็มจอ">⛶ เต็มจอ</button>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
              <div className="flex items-center gap-2 text-[11px] text-pink-300 font-semibold">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-pink-400 opacity-70 animate-ping" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-pink-400" />
                </span>
                กำลังเล่นคลิปที่ {count || 0} ของรอบนี้ · หมวด {video?.topic || NET_TOPIC}
                {pool.lane ? <span className="text-slate-400"> ({pool.lane === 'network' ? 'เลนเครือข่าย' : 'เลนอื่น ๆ'})</span> : null}
              </div>
              <div className="mt-2 text-[15px] font-bold text-white leading-snug">{video?.title || 'รอคลิปแรก…'}</div>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className="px-2.5 py-1 rounded-full bg-white/5 text-slate-300 border border-white/10">
                  คลังคลิป {pool.active} รายการ · เครือข่าย {pool.network ?? 0} / อื่น ๆ {pool.other ?? 0}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-white/5 text-slate-300 border border-white/10">
                  ความยาว {shownDur > 0 ? `${shownDur} วิ` : 'กำลังวัด…'}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-emerald-400/15 text-emerald-200 border border-emerald-400/30">
                  {auto ? '✅ เล่นจบแล้วสุ่มต่อทันที' : '⏸ หยุดสลับอัตโนมัติ'}
                </span>
                {lastEnd && lastEnd.waited > 0 ? (
                  <span className="px-2.5 py-1 rounded-full bg-white/5 text-slate-300 border border-white/10">ต่อคลิปใหม่ใน {(lastEnd.waited / 1000).toFixed(1)} วิ</span>
                ) : null}
                <button
                  onClick={toggleSound}
                  className={`px-2.5 py-1 rounded-full border transition ${soundOn ? 'bg-emerald-400/20 text-emerald-200 border-emerald-400/40' : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'}`}
                >
                  {soundOn ? '🔊 เสียงเปิดต่อเนื่อง (กดเพื่อปิด)' : '🔇 เปิดเสียง'}
                </button>
                <button
                  onClick={() => setAuto((a) => !a)}
                  className={`px-2.5 py-1 rounded-full border transition ${auto ? 'bg-white/5 text-slate-300 border-white/10' : 'bg-amber-400/20 text-amber-200 border-amber-400/40'}`}
                >
                  {auto ? 'หยุดสลับชั่วคราว' : 'เปิดสลับอัตโนมัติ'}
                </button>
              </div>
            </div>

            <div className={`rounded-2xl border p-4 transition ${detected ? 'bg-emerald-500/10 border-emerald-400/50' : 'bg-white/[0.04] border-white/10'}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-[12px] font-semibold text-sky-200">
                  <span>🤖</span> AI ตรวจจับความสนใจผู้ชม
                  {aiHits > 0 ? (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-100 border border-emerald-400/40 text-[10px]">ตรวจพบแล้ว {aiHits} ครั้ง</span>
                  ) : null}
                </div>
                <div className="text-[13px] font-bold text-white">
                  {ai.score}
                  <span className="text-slate-400 text-[11px]">/100</span>
                </div>
              </div>
              <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${detected ? 'bg-emerald-400' : ai.score >= 35 ? 'bg-sky-400' : 'bg-slate-500'}`}
                  style={{ width: `${Math.max(3, ai.score)}%` }}
                />
              </div>
              <div className="mt-2 text-[11px] text-slate-300">
                {ai.parts.length
                  ? `${detected ? 'ตรวจพบความสนใจ (เกณฑ์ ' + INTEREST_THRESHOLD + ')' : 'กำลังจับสัญญาณ…'} — ${ai.parts.map((p) => p.label).join(' · ')}`
                  : 'รอสัญญาณการดู (เวลาดู · ความโฟกัส · ปฏิสัมพันธ์)'}
              </div>
              {aiMsg ? (
                <div className={`mt-3 text-[11.5px] rounded-xl px-3 py-2 border ${armed ? 'bg-amber-400/10 border-amber-400/40 text-amber-100' : 'bg-emerald-400/10 border-emerald-400/30 text-emerald-100'}`}>
                  {aiMsg}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className="px-2.5 py-1 rounded-full bg-white/5 text-slate-300 border border-white/10">ดูไปแล้ว {clipsSeen.current} คลิปในรอบนี้</span>
                <span className="px-2.5 py-1 rounded-full bg-white/5 text-slate-300 border border-white/10">เวลาดูรวม {sessionSec.current} วิ</span>
                <button
                  onClick={openOnTikTok}
                  disabled={!video?.url}
                  className={`px-3 py-1 rounded-full border font-semibold transition ${detected ? 'bg-pink-500 text-white border-pink-400 hover:bg-pink-400' : 'bg-white/5 text-slate-300 border-white/10 hover:bg-white/10'} disabled:opacity-40`}
                >
                  📤 ส่งคลิปนี้ไป TikTok ทันที
                </button>
                {video?.url ? (
                  <a href={video.url} target="_blank" rel="noopener noreferrer" className="px-3 py-1 rounded-full bg-white/5 text-sky-300 border border-white/10 hover:bg-white/10 transition">
                    ดูบน TikTok ↗
                  </a>
                ) : null}
              </div>
              <div className="mt-2 text-[10.5px] text-slate-500 leading-relaxed">
                ระบบส่งลิงก์ไป TikTok และเปิดเสียงให้ต่อเนื่องเองทันทีเมื่อผู้ชมดูต่อเนื่องจริง · ถ้าผู้ชมกดปิดเสียงเอง ระบบจะไม่เปิดซ้ำ ·
                เหตุการณ์ถูกบันทึกไว้ตรวจย้อนหลัง (ระดับบุคคลเฉพาะเมื่อผู้ชมยินยอม)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
