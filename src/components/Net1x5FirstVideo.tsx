'use client';

import { useEffect, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// Net1x5FirstVideo — "วีดีโอแรก" ของระบบ 1 แตก 5 · สร้างเครือข่าย
// วางไว้บนสุดของหน้า /financial-freedom ถัดจากจักรวาลของเครือข่าย
//
// หลักการของระบบนี้:
//   • วีดีโอแรก = คลิป TikTok ที่ถูก "ตรึง" ไว้ (Video.priority สูงสุด) ผ่าน POST /api/videos/add {action:"pin"}
//   • ดึงข้อมูลจริงจาก /api/videos/first เท่านั้น — ไม่มีการแต่งตัวเลข/ไม่มีการสุ่ม
//   • หน้าอ่านอย่างเดียว: ไม่บันทึกการดู ไม่ยิง /api/videos/next (ช่องสุ่มด้านล่างมีของตัวเองอยู่แล้ว)
//   • iframe ของ TikTok จะโหลดเมื่อผู้ใช้กดเล่นเท่านั้น (ไม่โหลดเองตอนเปิดหน้า)
// ─────────────────────────────────────────────────────────────────────────────

const PLAYER_PARAMS =
  'autoplay=1&loop=0&controls=1&progress_bar=1&play_button=1&volume_control=1&fullscreen_button=1&timestamp=1&music_info=0&description=1&rel=0&native_context_menu=0&muted=0';

const LEVELS = [1, 5, 25, 125, 625];

type FirstVideo = {
  id: string;
  title: string;
  url: string;
  tiktokId: string | null;
  thumbnailUrl: string | null;
  embedUrl: string | null;
  durationSec: number | null;
  topic: string | null;
  cta: string | null;
  ctaUrl: string | null;
  priority: number;
};

type Resp = {
  ok: boolean;
  pinned?: boolean;
  first?: FirstVideo | null;
  queue?: Array<{ id: string; title: string; priority: number }>;
  pool?: { active: number; network: number; other: number; topic?: string };
};

export default function Net1x5FirstVideo() {
  const [data, setData] = useState<Resp | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch('/api/videos/first', { cache: 'no-store' })
      .then((r) => r.json())
      .then((j: Resp) => {
        if (!alive) return;
        setData(j);
        setState(j.ok ? 'ready' : 'error');
      })
      .catch(() => {
        if (alive) setState('error');
      });
    return () => {
      alive = false;
    };
  }, []);

  const v = data?.first || null;
  const embedSrc = v?.embedUrl && playing ? `${v.embedUrl}?${PLAYER_PARAMS}` : null;

  return (
    <div className="mb-14">
      <div className="mb-3">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-rose-50 text-rose-700 text-sm font-semibold border border-rose-200">
          <span>🎬</span> วีดีโอแรก · 1 แตก 5 สร้างเครือข่าย
        </div>
        <h2 className="mt-4 text-2xl md:text-3xl font-bold text-slate-900">
          เริ่มจากคลิปนี้ แล้วสร้างเครือข่ายของคุณด้วยระบบ 1 แตก 5
        </h2>
        <p className="mt-2 text-slate-600 leading-relaxed">
          คลิปแรกคือจุดเริ่มของเส้นทางนี้ — ดูให้จบ แล้วกดเข้าสู่ระบบ <strong>1 แตก 5</strong> เพื่อดูว่า
          สายงานของคุณกำลังโตอยู่ชั้นไหน และช่องใดยังว่างให้เติมคนได้จริง
        </p>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-4 md:p-6 shadow-sm">
        <div className="grid md:grid-cols-[320px_1fr] gap-6">
          {/* ── เครื่องเล่นคลิปแรก ── */}
          <div className="mx-auto w-full max-w-[320px]">
            <div className="relative rounded-[26px] border border-slate-900/10 bg-black shadow-xl overflow-hidden" style={{ aspectRatio: '9 / 16' }}>
              {embedSrc ? (
                <iframe
                  key={v?.id}
                  src={embedSrc}
                  className="absolute inset-0 w-full h-full"
                  allow="autoplay; encrypted-media; fullscreen; picture-in-picture"
                  allowFullScreen
                  title={v?.title || 'วีดีโอแรก 1 แตก 5'}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => v?.embedUrl && setPlaying(true)}
                  className="absolute inset-0 w-full h-full flex flex-col items-center justify-center text-center p-5"
                  style={
                    v?.thumbnailUrl
                      ? { backgroundImage: `url(${v.thumbnailUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                      : undefined
                  }
                >
                  <span className="absolute inset-0 bg-gradient-to-b from-slate-900/70 via-slate-900/40 to-slate-900/80" />
                  <span className="relative text-4xl">{state === 'loading' ? '⏳' : state === 'error' ? '⚠️' : '▶️'}</span>
                  <span className="relative mt-3 text-white text-sm font-bold">
                    {state === 'loading'
                      ? 'กำลังโหลดวีดีโอแรก…'
                      : state === 'error'
                        ? 'เชื่อมต่อระบบวีดีโอไม่ได้'
                        : v
                          ? 'กดเล่นวีดีโอแรก'
                          : 'ยังไม่มีคลิปในคลัง'}
                  </span>
                  {v ? (
                    <span className="relative mt-2 px-3 py-1 rounded-full bg-white/15 text-white text-[11px] font-semibold border border-white/25">
                      {v.id} · {v.topic || 'ไม่ระบุหมวด'}
                    </span>
                  ) : null}
                </button>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
              <span
                className={`px-2.5 py-1 rounded-full border font-semibold ${
                  data?.pinned ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
              >
                {data?.pinned ? '📌 ตรึงเป็นวีดีโอแรกแล้ว' : 'ยังไม่ตรึงวีดีโอแรก (ระบบสุ่มอยู่)'}
              </span>
              {v?.durationSec ? (
                <span className="px-2.5 py-1 rounded-full bg-slate-50 text-slate-600 border border-slate-200">ความยาว {v.durationSec} วิ</span>
              ) : null}
              {v?.url ? (
                <a href={v.url} target="_blank" rel="noopener noreferrer" className="px-2.5 py-1 rounded-full bg-slate-900 text-white border border-slate-900 font-semibold">
                  เปิดดูบน TikTok ↗
                </a>
              ) : null}
            </div>
          </div>

          {/* ── คำอธิบายระบบ 1 แตก 5 ── */}
          <div>
            <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-50 to-white p-5">
              <div className="text-sm font-bold text-slate-800">คลิปแรกนี้คือประตูเข้าสู่ระบบ 1 แตก 5</div>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                หนึ่งคนวางสายงานได้ 5 ช่อง เมื่อครบ 5 คนที่มีคุณสมบัติ ระบบจะเปิดชั้นถัดไปให้อัตโนมัติ —
                คนที่ทำงานจริงได้เลื่อนขึ้นรับตำแหน่งแทน และสมาชิกที่ไม่ผ่านเกณฑ์จะถูกคัดออกพร้อมเปิดช่องว่างให้เติมคนใหม่
                ทั้งหมดตรวจจากใบเสร็จเบี้ยจริง ไม่ใช่การนับมือ
              </p>

              <div className="mt-4 grid grid-cols-5 gap-2">
                {LEVELS.map((n, i) => (
                  <div
                    key={n}
                    className={`rounded-xl border px-2 py-2 text-center ${i === 0 ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white'}`}
                  >
                    <div className={`text-base font-bold ${i === 0 ? 'text-rose-700' : 'text-slate-800'}`}>{n}</div>
                    <div className="text-[10px] text-slate-500">ชั้น {i + 1}</div>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                โครงสร้าง 1 → 5 → 25 → 125 → 625 = แบบแผนของระบบ 5 ชั้น · ไม่ใช่จำนวนสมาชิกจริง
                {data?.pool ? ` (คลังคลิปจริงตอนนี้ ${data.pool.active} คลิป · หมวดเครือข่าย ${data.pool.network})` : ''}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-3">
              <a
                href="/network/1x5-autopilot"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-[#475569] text-white text-sm font-semibold hover:bg-slate-800 transition shadow-sm"
              >
                เข้าสู่ระบบ 1 แตก 5 →
              </a>
              <a
                href="#tiktok-channel"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition"
              >
                ดูคลิปเครือข่ายต่อเนื่อง
              </a>
              <a
                href="/recruit"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-full border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition"
              >
                สมัครเป็นตัวแทน
              </a>
            </div>

            {data?.queue?.length ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-[11px] font-semibold tracking-[0.18em] text-slate-500">คิวคลิปหมวดเครือข่าย</div>
                <ol className="mt-2 space-y-1">
                  {data.queue.slice(0, 5).map((q, i) => (
                    <li key={q.id} className="flex items-center gap-2 text-xs text-slate-600">
                      <span className="w-5 text-slate-400">{i === 0 ? '🥇' : i + 1}</span>
                      <span className="font-semibold text-slate-700">{q.id}</span>
                      <span className="truncate">{q.title}</span>
                      {q.priority > 0 ? <span className="ml-auto text-[10px] text-emerald-700 font-semibold">ตรึงไว้</span> : null}
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
