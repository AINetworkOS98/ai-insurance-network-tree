'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * TikTokChannel — ช่องดูวีดีโอ TikTok แบบสุ่มต่อเนื่อง (@aka989._)
 *
 * ทำงานแบบ "เปิดเว็บ → สุ่มคลิป → เล่นจนจบ → สุ่มคลิปใหม่ทันที → วนตลอดเวลา"
 *  - เรียก /api/videos/next?topic=เครือข่าย (คิวสุ่ม + กันเล่นซ้ำ 10 รายการล่าสุด + เฉพาะคลิปเครือข่าย)
 *  - ตรวจจับ "คลิปจบ" จากเหตุการณ์จริงของ TikTok Player (onStateChange value=0 / onCurrentTime ถึงท้ายคลิป)
 *    → ไม่ตัดคลิปกลางคัน และต่อคลิปใหม่ทันทีที่จบ
 *  - มีเวลาสำรอง (ความยาวจริง + 5 วิ) กันกรณีเหตุการณ์ไม่มา → รับประกันว่าวนต่อแน่นอน
 *  - บันทึกผลการดูด้วย /api/videos/played (n8n: POST /webhook/video-played)
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
type NextResp = {
  ok: boolean;
  video: Video | null;
  reason?: string;
  pool?: { active: number };
};

/** แสดงเฉพาะคลิปหมวดนี้ (ผู้ดูแลตั้งผ่าน /api/videos/add ด้วย field topic) */
const TOPIC = 'เครือข่าย';
const PLAYER_PARAMS =
  'autoplay=1&loop=0&controls=1&progress_bar=1&play_button=1&volume_control=1&fullscreen_button=1&timestamp=1&music_info=0&description=1&rel=0&native_context_menu=0&closed_caption=1';
const FALLBACK_SEC = 60;

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

export default function TikTokChannel() {
  const [video, setVideo] = useState<Video | null>(null);
  const [state, setState] = useState<'loading' | 'playing' | 'empty' | 'error'>('loading');
  const [pool, setPool] = useState(0);
  const [count, setCount] = useState(0);
  const [realDur, setRealDur] = useState(0);
  const [lastEnd, setLastEnd] = useState<{ at: number; waited: number } | null>(null);
  const [auto, setAuto] = useState(true);
  const [muted, setMuted] = useState(true);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const startedAt = useRef<number>(Date.now());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const advancing = useRef(false);
  const durRef = useRef<number>(0);

  const report = useCallback(
    (completed: boolean, durOverride = 0) => {
      const v = video;
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
    },
    [video],
  );

  const fetchNext = useCallback(async (random = false) => {
    setState('loading');
    try {
      const r = await fetch(
        `/api/videos/next?topic=${encodeURIComponent(TOPIC)}&sid=${encodeURIComponent(sid())}${random ? '&r=' + Math.random() : ''}`,
        { cache: 'no-store' },
      );
      const j: NextResp = await r.json();
      if (!j.ok || !j.video) {
        setVideo(null);
        setPool(Number(j.pool?.active || 0));
        setState('empty');
        return;
      }
      durRef.current = Number(j.video.durationSec || 0) > 0 ? Number(j.video.durationSec) : 0;
      setRealDur(durRef.current);
      setVideo(j.video);
      setPool(Number(j.pool?.active || 0));
      setCount((c) => c + 1);
      setLastEnd({ at: Date.now(), waited: 0 });
      startedAt.current = Date.now();
      setState('playing');
    } catch {
      setState('error');
    }
  }, []);

  // ── ไปคลิปถัดไป: เล่นจบ → สุ่มใหม่ทันที ──
  const advance = useCallback(
    (reason: 'ended' | 'manual' | 'timeout') => {
      if (advancing.current) return; // กันเรียกซ้ำ (เหตุการณ์มักมาหลายรอบ)
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

  // ── ฟังเหตุการณ์จากเครื่องเล่น TikTok (จบคลิป / เวลาปัจจุบัน + ความยาวจริง) ──
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const from = frameRef.current?.contentWindow;
      if (from && e.source && e.source !== from) return; // รับเฉพาะข้อความจากกรอบของเรา
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
          if (auto && ct > 0 && ct >= du - 0.35) advance('ended'); // ถึงท้ายคลิปจริง
        }
        return;
      }

      if (type === 'onStateChange' && value === 0 && auto) {
        advance('ended'); // 0 = จบคลิป → สุ่มคลิปใหม่ทันที
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [advance, auto]);

  // ── เวลาสำรอง: ถ้าไม่ได้เหตุการณ์ "จบ" → ต่อคลิปใหม่หลัง (ความยาวจริง + 5 วิ) ──
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

  // บันทึกตอนปิด/ซ่อนหน้า
  useEffect(() => {
    const onHide = () => report(false);
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, [report]);

  const cmd = (type: string) => {
    try {
      frameRef.current?.contentWindow?.postMessage(JSON.stringify({ type, 'x-tiktok-player': true }), '*');
    } catch {
      /* ignore */
    }
  };

  const toggleFullscreen = () => {
    const el = wrapRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el.requestFullscreen?.();
  };

  const embedSrc = video?.embedUrl ? `${video.embedUrl}?${PLAYER_PARAMS}` : null;
  const shownDur = realDur > 0 ? Math.round(realDur) : video?.durationSec || 0;

  return (
    <div className="mb-8">
      <div className="mb-3">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-900 text-pink-300 text-sm font-semibold border border-slate-800">
          <span>🎬</span> ช่องดูวีดีโอ · สุ่มต่อเนื่อง
        </div>
      </div>

      <div className="rounded-3xl border border-slate-800 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 md:p-6 shadow-[0_24px_60px_-30px_rgba(2,6,23,0.85)]">
        <div className="grid md:grid-cols-[320px_1fr] gap-5">
          {/* กรอบ 9:16 */}
          <div ref={wrapRef} className="mx-auto w-full max-w-[320px]">
            <div className="relative rounded-[26px] border border-white/15 bg-black shadow-2xl overflow-hidden" style={{ aspectRatio: '9 / 16' }}>
              {embedSrc ? (
                <iframe
                  ref={frameRef}
                  key={video?.id}
                  src={embedSrc}
                  className="absolute inset-0 w-full h-full"
                  allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                  allowFullScreen
                  title={video?.title || 'TikTok video'}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                  <div className="text-4xl mb-3">{state === 'loading' ? '⏳' : state === 'error' ? '⚠️' : '📼'}</div>
                  <div className="text-slate-200 text-sm font-semibold">
                    {state === 'loading' ? 'กำลังสุ่มคลิป…' : state === 'error' ? 'เชื่อมต่อระบบไม่ได้' : `ยังไม่มีคลิปหมวด ${TOPIC} ในคลัง`}
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

            {/* ปุ่มควบคุม */}
            <div className="mt-3 flex items-center justify-center gap-2 flex-wrap">
              <button onClick={() => cmd('play')} className="px-3 py-2 rounded-full bg-white/10 text-slate-100 text-xs font-semibold border border-white/15 hover:bg-white/20 transition" title="เล่น">▶ Play</button>
              <button onClick={() => { cmd('pause'); report(false); }} className="px-3 py-2 rounded-full bg-white/10 text-slate-100 text-xs font-semibold border border-white/15 hover:bg-white/20 transition" title="หยุดชั่วคราว">⏸ Pause</button>
              <button onClick={() => advance('manual')} className="px-3 py-2 rounded-full bg-white/10 text-slate-100 text-xs font-semibold border border-white/15 hover:bg-white/20 transition" title="คลิปถัดไป">⏭ Next</button>
              <button onClick={() => { setAuto(true); advance('manual'); }} className="px-3 py-2 rounded-full bg-pink-400/20 text-pink-200 text-xs font-semibold border border-pink-400/40 hover:bg-pink-400/30 transition" title="สุ่มใหม่">🔀 สุ่มใหม่</button>
              <button onClick={toggleFullscreen} className="px-3 py-2 rounded-full bg-white/10 text-slate-100 text-xs font-semibold border border-white/15 hover:bg-white/20 transition" title="เต็มจอ">⛶ เต็มจอ</button>
            </div>
          </div>

          {/* ข้อมูล + สถานะระบบ */}
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl bg-white/[0.04] border border-white/10 p-4">
              <div className="flex items-center gap-2 text-[11px] text-pink-300 font-semibold">
                <span className="relative flex w-2 h-2">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-pink-400 opacity-70 animate-ping" />
                  <span className="relative inline-flex w-2 h-2 rounded-full bg-pink-400" />
                </span>
                กำลังเล่นคลิปที่ {count || 0} ของรอบนี้ · หมวด {TOPIC}
              </div>
              <div className="mt-2 text-[15px] font-bold text-white leading-snug">{video?.title || 'รอคลิปแรก…'}</div>
              {video?.topic ? <div className="mt-1 text-[12px] text-slate-400">หมวด: {video.topic}</div> : null}
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className="px-2.5 py-1 rounded-full bg-white/5 text-slate-300 border border-white/10">คลิปหมวดนี้ {pool} รายการ</span>
                <span className="px-2.5 py-1 rounded-full bg-white/5 text-slate-300 border border-white/10">
                  ความยาว {shownDur > 0 ? `${shownDur} วิ` : 'กำลังวัด…'}
                </span>
                <span className="px-2.5 py-1 rounded-full bg-emerald-400/15 text-emerald-200 border border-emerald-400/30">
                  {auto ? '✅ เล่นจบแล้วสุ่มต่อทันที' : '⏸ หยุดสลับอัตโนมัติ'}
                </span>
                {lastEnd && lastEnd.waited > 0 ? (
                  <span className="px-2.5 py-1 rounded-full bg-white/5 text-slate-300 border border-white/10">ต่อคลิปใหม่ใน {(lastEnd.waited / 1000).toFixed(1)} วิ</span>
                ) : null}
                <button onClick={() => setMuted((m) => { cmd(m ? 'unmute' : 'mute'); return !m; })} className="px-2.5 py-1 rounded-full bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10 transition">
                  {muted ? '🔇 เปิดเสียง' : '🔊 ปิดเสียง'}
                </button>
                <button
                  onClick={() => setAuto((a) => !a)}
                  className={`px-2.5 py-1 rounded-full border transition ${auto ? 'bg-white/5 text-slate-300 border-white/10' : 'bg-amber-400/20 text-amber-200 border-amber-400/40'}`}
                >
                  {auto ? 'หยุดสลับชั่วคราว' : 'เปิดสลับอัตโนมัติ'}
                </button>
              </div>
              {video?.url ? (
                <a href={video.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 mt-3 text-[12px] text-sky-300 hover:text-sky-200">
                  ดูคลิปนี้บน TikTok ↗
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
