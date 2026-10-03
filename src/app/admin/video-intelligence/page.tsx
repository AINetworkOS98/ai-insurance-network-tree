'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';

// ─────────────────────────────────────────────────────────────────────────────
// AI Video Intelligence — แดชบอร์ดผู้ดูแลแบบเรียลไทม์ (Thai UI)
// ข้อมูลจาก GET /api/video-intel/stats?window=1h|24h|7d&limit=30
// ทุกฟิลด์อาจเป็น null/หายได้ — เรนเดอร์แบบป้องกันไว้เสมอ
// ─────────────────────────────────────────────────────────────────────────────

type WindowKey = '1h' | '24h' | '7d';

interface WatchProgressMark { mark?: number | null; count?: number | null; }
interface Engagement { cold?: number | null; warm?: number | null; hot?: number | null; veryHot?: number | null; }
interface HotVisitor {
  visitorId?: string | null;
  label?: string | null;
  score?: number | null;
  level?: string | null;
  watchPercent?: number | null;
  watchSeconds?: number | null;
  lastSeen?: string | null;
}
interface RecentEvent {
  at?: string | null;
  visitorLabel?: string | null;
  event?: string | null;
  progressPercent?: number | null;
  videoId?: string | null;
  page?: string | null;
}
interface HourlyPoint { hour?: string | null; visitors?: number | null; views?: number | null; avgWatchPercent?: number | null; }
interface AiInsight { summary?: string | null; insight?: string | null; recommendedActions?: string[] | null; generatedAt?: string | null; }

interface Stats {
  ok?: boolean;
  window?: string | null;
  generatedAt?: string | null;
  currentVisitors?: number | null;
  activeVideoSessions?: number | null;
  totalVisitors?: number | null;
  totalSessions?: number | null;
  totalEvents?: number | null;
  totalVideoViews?: number | null;
  videoCompletes?: number | null;
  avgWatchSeconds?: number | null;
  avgWatchPercent?: number | null;
  completionRate?: number | null;
  returningVisitors?: number | null;
  peakHour?: string | null;
  watchProgress?: WatchProgressMark[] | null;
  engagement?: Engagement | null;
  hotVisitors?: HotVisitor[] | null;
  recentEvents?: RecentEvent[] | null;
  hourly?: HourlyPoint[] | null;
  aiInsight?: AiInsight | null;
  error?: string | null;
}

const WINDOWS: { key: WindowKey; label: string }[] = [
  { key: '1h', label: '1 ชั่วโมง' },
  { key: '24h', label: '24 ชั่วโมง' },
  { key: '7d', label: '7 วัน' },
];

const MARK_ORDER = [10, 25, 50, 75, 90, 100];

const EVENT_LABELS: Record<string, string> = {
  video_play: '▶️ เริ่มเล่นวิดีโอ',
  video_progress: '⏩ กำลังดูต่อ',
  video_pause: '⏸️ หยุดชั่วคราว',
  video_complete: '✅ ดูจบ',
  video_seek: '🔀 เลื่อนตำแหน่ง',
  video_view: '🎬 เข้าชมวิดีโอ',
  page_view: '📄 เปิดหน้า',
  session_start: '🚪 เริ่มเซสชัน',
  session_end: '🚶 จบเซสชัน',
};

const ENGAGEMENT_ROWS: { key: keyof Engagement; label: string; bar: string; text: string }[] = [
  { key: 'cold', label: 'เย็น (Cold)', bar: 'bg-slate-400', text: 'text-slate-600' },
  { key: 'warm', label: 'อุ่น (Warm)', bar: 'bg-sky-400', text: 'text-sky-600' },
  { key: 'hot', label: 'ร้อน (Hot)', bar: 'bg-amber-400', text: 'text-amber-600' },
  { key: 'veryHot', label: 'ร้อนมาก (Very Hot)', bar: 'bg-rose-500', text: 'text-rose-600' },
];

const LEVEL_STYLE: Record<string, string> = {
  VERY_HOT: 'bg-rose-100 text-rose-700 border-rose-200',
  HOT: 'bg-amber-100 text-amber-700 border-amber-200',
  WARM: 'bg-sky-100 text-sky-700 border-sky-200',
  COLD: 'bg-slate-100 text-slate-600 border-slate-200',
};
const LEVEL_LABEL: Record<string, string> = {
  VERY_HOT: 'ร้อนมาก',
  HOT: 'ร้อน',
  WARM: 'อุ่น',
  COLD: 'เย็น',
};

function num(n: number | null | undefined): string {
  return typeof n === 'number' && isFinite(n) ? n.toLocaleString('th-TH') : '—';
}
function pct(n: number | null | undefined): string {
  return typeof n === 'number' && isFinite(n) ? `${Math.round(n)}%` : '—';
}
function seconds(n: number | null | undefined): string {
  if (typeof n !== 'number' || !isFinite(n) || n < 0) return '—';
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return `${m} นาที ${s} วินาที`;
}
function fmtDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'short', timeStyle: 'medium' });
  } catch {
    return d;
  }
}

export default function VideoIntelligencePage() {
  const [windowKey, setWindowKey] = useState<WindowKey>('24h');
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);
  const [authRequired, setAuthRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const reqRef = useRef(0);

  const fetchStats = useCallback(async (w: WindowKey) => {
    const id = ++reqRef.current;
    setBusy(true);
    try {
      const r = await fetch(`/api/video-intel/stats?window=${w}&limit=30`, {
        credentials: 'include',
        cache: 'no-store',
      });
      if (id !== reqRef.current) return;

      if (r.status === 401) {
        setAuthRequired(true);
        setError(null);
        return;
      }

      const j = (await r.json().catch(() => null)) as Stats | null;
      if (id !== reqRef.current) return;

      if (r.status === 403) {
        setAuthRequired(false);
        setError('บัญชีที่เข้าสู่ระบบไม่มีสิทธิ์เข้าถึงข้อมูลผู้ดูแลระบบ');
        return;
      }
      if (!j || j.ok !== true) {
        setAuthRequired(false);
        setError((j && j.error) || `ดึงข้อมูลไม่สำเร็จ (HTTP ${r.status})`);
        return;
      }

      setAuthRequired(false);
      setError(null);
      setStats(j);
      setLastUpdated(new Date());
    } catch (e) {
      if (id !== reqRef.current) return;
      setAuthRequired(false);
      setError(e instanceof Error ? e.message : 'เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ');
    } finally {
      if (id === reqRef.current) setBusy(false);
    }
  }, []);

  // ดึงข้อมูลใหม่เมื่อสลับช่วงเวลา
  useEffect(() => {
    fetchStats(windowKey);
  }, [windowKey, fetchStats]);

  // รีเฟรชอัตโนมัติทุก 10 วินาที + ล้าง interval เมื่อออกจากหน้า
  useEffect(() => {
    if (authRequired) return;
    const timer = setInterval(() => fetchStats(windowKey), 10000);
    return () => clearInterval(timer);
  }, [windowKey, authRequired, fetchStats]);

  const showInitialLoading = stats === null && busy;

  return (
    <div>
      <Header />
      <div className="flex w-full min-h-screen">
        <Sidebar />
        <main className="flex-1 p-4 md:p-6 bg-white">
          {/* ── หัวเรื่อง + ตัวสลับช่วงเวลา + ปุ่มรีเฟรช ─────────────────── */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h1 className="text-xl font-bold text-slate-800">🎥 AI Video Intelligence</h1>
              <p className="text-xs text-slate-500 mt-0.5">
                ภาพรวมผู้ชมวิดีโอแบบเรียลไทม์ · รีเฟรชอัตโนมัติทุก 10 วินาที
                {lastUpdated && ` · อัปเดตล่าสุด ${lastUpdated.toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' })}`}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {WINDOWS.map((w) => (
                <button
                  key={w.key}
                  onClick={() => setWindowKey(w.key)}
                  className={`px-4 py-2 rounded-full text-sm font-medium border ${
                    windowKey === w.key
                      ? 'bg-sky-400 text-white border-sky-400'
                      : 'bg-white border-blue-100 text-slate-600 hover:bg-[#f0f7ff]'
                  }`}
                >
                  {w.label}
                </button>
              ))}
              <button
                onClick={() => fetchStats(windowKey)}
                disabled={busy}
                className={`px-4 py-2 rounded-full border border-sky-400 text-sky-600 text-sm font-medium bg-white hover:bg-[#f0f7ff] ${
                  busy ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {busy ? '⏳ กำลังโหลด' : '🔄 รีเฟรช'}
              </button>
            </div>
          </div>

          {/* ── ยังไม่เข้าสู่ระบบ (401) ─────────────────────────────────── */}
          {authRequired && (
            <div className="card p-6 border-amber-200 bg-amber-50">
              <div className="text-base font-semibold text-amber-800">🔒 ต้องเข้าสู่ระบบผู้ดูแลก่อน</div>
              <p className="text-sm text-amber-700 mt-1">
                เซสชันหมดอายุหรือยังไม่ได้เข้าสู่ระบบ — กรุณาเข้าสู่ระบบเพื่อดูข้อมูลผู้ชมวิดีโอ
              </p>
              <Link
                href="/login"
                className="inline-block mt-3 px-5 py-2 rounded-full bg-sky-500 text-white text-sm font-semibold hover:bg-sky-600"
              >
                ไปหน้าเข้าสู่ระบบ (/login)
              </Link>
            </div>
          )}

          {/* ── ข้อผิดพลาดอื่น ๆ ─────────────────────────────────────────── */}
          {!authRequired && error && (
            <div className="card p-5 border-rose-200 bg-rose-50 text-sm text-rose-700 mb-4">
              ⚠️ {error}
            </div>
          )}

          {/* ── กำลังโหลดครั้งแรก ───────────────────────────────────────── */}
          {!authRequired && showInitialLoading && (
            <div className="card p-6 text-center">
              <div className="loading-spinner mx-auto mb-3" />
              <p className="text-sm text-slate-500">กำลังโหลดข้อมูลผู้ชมวิดีโอ...</p>
            </div>
          )}

          {/* ── เนื้อหาหลัก ─────────────────────────────────────────────── */}
          {!authRequired && stats && (
            <>
              {/* การ์ดสถิติหลัก */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                <div className="card p-4">
                  <div className="text-xs text-slate-500">ผู้ชมขณะนี้ (Current Visitors)</div>
                  <div className="text-3xl font-bold mt-1 text-sky-600">{num(stats.currentVisitors)}</div>
                  <div className="text-[11px] text-slate-400 mt-1">นับผู้ชมที่ยังออนไลน์อยู่ในช่วงเวลานี้</div>
                </div>
                <div className="card p-4">
                  <div className="text-xs text-slate-500">เซสชันวิดีโอที่กำลังดูอยู่</div>
                  <div className="text-3xl font-bold mt-1 text-emerald-600">{num(stats.activeVideoSessions)}</div>
                  <div className="text-[11px] text-slate-400 mt-1">จำนวนผู้ที่กำลังเล่นวิดีโออยู่</div>
                </div>
                <div className="card p-4">
                  <div className="text-xs text-slate-500">ผู้ชมที่กลับมา (Returning)</div>
                  <div className="text-3xl font-bold mt-1 text-amber-600">{num(stats.returningVisitors)}</div>
                  <div className="text-[11px] text-slate-400 mt-1">ผู้ชมที่เคยเข้ามาแล้วกลับมาอีกครั้ง</div>
                </div>
              </div>

              {/* สถิติรวมย่อย */}
              <div className="card p-5 mb-6">
                <h2 className="text-lg font-bold text-slate-800">📈 ภาพรวมช่วงเวลาที่เลือก</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div>
                    <div className="text-xs text-slate-500">ผู้ชมทั้งหมด</div>
                    <div className="text-xl font-bold text-slate-800 mt-1">{num(stats.totalVisitors)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">เซสชันทั้งหมด</div>
                    <div className="text-xl font-bold text-slate-800 mt-1">{num(stats.totalSessions)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">ยอดชมวิดีโอ</div>
                    <div className="text-xl font-bold text-slate-800 mt-1">{num(stats.totalVideoViews)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">อีเวนต์ทั้งหมด</div>
                    <div className="text-xl font-bold text-slate-800 mt-1">{num(stats.totalEvents)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">เวลาเฉลี่ยในการรับชม</div>
                    <div className="text-xl font-bold text-slate-800 mt-1">{seconds(stats.avgWatchSeconds)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">เปอร์เซ็นต์การดูเฉลี่ย</div>
                    <div className="text-xl font-bold text-slate-800 mt-1">{pct(stats.avgWatchPercent)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">อัตราการดูจบ</div>
                    <div className="text-xl font-bold text-slate-800 mt-1">
                      {pct(stats.completionRate)}
                      <span className="text-xs font-normal text-slate-400 ml-1">({num(stats.videoCompletes)} ครั้ง)</span>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">ชั่วโมงที่มีผู้ชมสูงสุด</div>
                    <div className="text-xl font-bold text-slate-800 mt-1">{stats.peakHour || '—'}</div>
                  </div>
                </div>
              </div>

              {/* ── ความคืบหน้าการรับชม (Watch Progress) ─────────────────── */}
              <div className="card p-5 mb-6">
                <h2 className="text-lg font-bold text-slate-800">📊 ความคืบหน้าการรับชม</h2>
                <p className="text-xs text-slate-500 mt-0.5">จำนวนผู้ชมที่ดูวิดีโอผ่านแต่ละจุด (10% – 100%)</p>
                <WatchProgressChart data={stats.watchProgress} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* ── การกระจายระดับการมีส่วนร่วม ────────────────────────── */}
                <div className="card p-5">
                  <h2 className="text-lg font-bold text-slate-800">🎯 ระดับการมีส่วนร่วม</h2>
                  <EngagementChart data={stats.engagement} />
                </div>

                {/* ── ผู้ชมกลุ่ม Hot & Very Hot ──────────────────────────── */}
                <div className="card p-5">
                  <h2 className="text-lg font-bold text-slate-800">🔥 ผู้ชมที่น่าสนใจ (Hot &amp; Very Hot)</h2>
                  <HotVisitorsList data={stats.hotVisitors} />
                </div>
              </div>

              {/* ── แนวโน้มรายชั่วโมง ─────────────────────────────────────── */}
              <div className="card p-5 mb-6">
                <h2 className="text-lg font-bold text-slate-800">🕒 แนวโน้มผู้ชมรายชั่วโมง</h2>
                <p className="text-xs text-slate-500 mt-0.5">จำนวนผู้ชม · ยอดชม · เปอร์เซ็นต์การดูเฉลี่ย</p>
                <HourlyChart data={stats.hourly} />
              </div>

              {/* ── ฟีดอีเวนต์ล่าสุด ──────────────────────────────────────── */}
              <div className="card p-5 mb-6">
                <h2 className="text-lg font-bold text-slate-800">📡 อีเวนต์ล่าสุด</h2>
                <RecentEventsFeed data={stats.recentEvents} />
              </div>

              {/* ── สรุปจาก AI ───────────────────────────────────────────── */}
              <div className="card p-5 mb-6">
                <h2 className="text-lg font-bold text-slate-800">🤖 สรุปเชิงวิเคราะห์จาก AI</h2>
                <AiInsightCard data={stats.aiInsight} />
              </div>
            </>
          )}

          {/* ── หมายเหตุความเป็นส่วนตัว ─────────────────────────────────── */}
          <div className="mt-2 mb-4 px-4 py-3 rounded-xl border border-blue-100 bg-[#f0f7ff] text-[11px] leading-relaxed text-slate-500">
            🔐 <b>ความเป็นส่วนตัว:</b> ระบบนี้ใช้ Anonymous Visitor ID เท่านั้น ไม่ระบุตัวตนผู้ใช้ และไม่เก็บข้อมูลส่วนบุคคล
          </div>
        </main>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ส่วนประกอบย่อย (เรนเดอร์แบบป้องกันเมื่อค่าเป็น null/หาย)
// ─────────────────────────────────────────────────────────────────────────────

function WatchProgressChart({ data }: { data?: WatchProgressMark[] | null }) {
  const list = Array.isArray(data) ? data : [];
  const byMark = new Map<number, number>();
  for (const d of list) {
    if (typeof d?.mark === 'number') byMark.set(d.mark, typeof d.count === 'number' ? d.count : 0);
  }
  const rows = MARK_ORDER.map((m) => ({ mark: m, count: byMark.get(m) ?? 0 }));
  const max = Math.max(1, ...rows.map((r) => r.count));
  const hasData = rows.some((r) => r.count > 0);

  if (!hasData) {
    return <p className="text-sm text-slate-500 mt-3">ยังไม่มีข้อมูลความคืบหน้าการรับชมในช่วงเวลานี้</p>;
  }

  const color = (mark: number) =>
    mark >= 90 ? 'bg-emerald-500' : mark >= 75 ? 'bg-sky-500' : mark >= 50 ? 'bg-sky-400' : mark >= 25 ? 'bg-sky-300' : 'bg-sky-200';

  return (
    <div className="mt-4 space-y-3">
      {rows.map((r) => (
        <div key={r.mark} className="flex items-center gap-3">
          <div className="w-14 shrink-0 text-xs font-semibold text-slate-600 text-right">{r.mark}%</div>
          <div className="flex-1 h-4 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full ${color(r.mark)} transition-all`}
              style={{ width: `${r.count > 0 ? Math.max(3, (r.count / max) * 100) : 0}%` }}
            />
          </div>
          <div className="w-12 shrink-0 text-xs font-medium text-slate-700 text-right">{r.count}</div>
        </div>
      ))}
    </div>
  );
}

function EngagementChart({ data }: { data?: Engagement | null }) {
  const counts = ENGAGEMENT_ROWS.map((row) => {
    const v = data ? data[row.key] : undefined;
    return { ...row, value: typeof v === 'number' && isFinite(v) ? v : 0 };
  });
  const total = counts.reduce((sum, c) => sum + c.value, 0);
  const max = Math.max(1, ...counts.map((c) => c.value));

  if (total === 0) {
    return <p className="text-sm text-slate-500 mt-3">ยังไม่มีข้อมูลระดับการมีส่วนร่วมในช่วงเวลานี้</p>;
  }

  return (
    <div className="mt-4 space-y-3">
      {counts.map((c) => (
        <div key={String(c.key)} className="flex items-center gap-3">
          <div className="w-32 shrink-0 text-xs font-medium text-slate-600">{c.label}</div>
          <div className="flex-1 h-5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className={`h-full rounded-full ${c.bar}`}
              style={{ width: `${c.value > 0 ? Math.max(4, (c.value / max) * 100) : 0}%` }}
            />
          </div>
          <div className="w-20 shrink-0 text-xs text-right">
            <span className={`font-bold ${c.text}`}>{c.value}</span>
            <span className="text-slate-400 ml-1">({total ? Math.round((c.value / total) * 100) : 0}%)</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function HotVisitorsList({ data }: { data?: HotVisitor[] | null }) {
  const list = Array.isArray(data) ? data : [];
  if (list.length === 0) {
    return <p className="text-sm text-slate-500 mt-3">ยังไม่มีผู้ชมกลุ่ม Hot / Very Hot ในช่วงเวลานี้</p>;
  }
  return (
    <div className="mt-3 space-y-2 max-h-[340px] overflow-y-auto pr-1">
      {list.map((v, i) => {
        const level = v.level || 'COLD';
        const style = LEVEL_STYLE[level] || LEVEL_STYLE.COLD;
        return (
          <div
            key={v.visitorId || `${v.label || 'visitor'}-${i}`}
            className="flex items-center justify-between gap-3 p-3 rounded-xl border border-blue-100 bg-[#f0f7ff]"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-800 truncate">{v.label || 'ผู้ชม'}</span>
                <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium ${style}`}>
                  {LEVEL_LABEL[level] || level}
                </span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                ดูแล้ว {pct(v.watchPercent)} · {seconds(v.watchSeconds)}
                {v.lastSeen && ` · ล่าสุด ${fmtDateTime(v.lastSeen)}`}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] text-slate-400">คะแนน</div>
              <div className="text-lg font-bold text-slate-800 leading-tight">{num(v.score)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HourlyChart({ data }: { data?: HourlyPoint[] | null }) {
  const list = Array.isArray(data) ? data : [];
  if (list.length === 0) {
    return <p className="text-sm text-slate-500 mt-3">ยังไม่มีข้อมูลแนวโน้มรายชั่วโมงในช่วงเวลานี้</p>;
  }
  const max = Math.max(1, ...list.map((h) => (typeof h.visitors === 'number' ? h.visitors : 0)));

  return (
    <div className="mt-4 overflow-x-auto pb-2">
      <div className="flex items-end gap-2 min-w-full" style={{ height: '160px' }}>
        {list.map((h, i) => {
          const visitors = typeof h.visitors === 'number' ? h.visitors : 0;
          const heightPct = visitors > 0 ? Math.max(6, (visitors / max) * 100) : 2;
          return (
            <div
              key={h.hour || i}
              className="flex flex-col items-center justify-end shrink-0"
              style={{ width: '34px', height: '100%' }}
              title={`${h.hour || ''} · ผู้ชม ${visitors} · ยอดชม ${num(h.views)} · ดูเฉลี่ย ${pct(h.avgWatchPercent)}`}
            >
              <div className="text-[10px] font-medium text-slate-600 mb-1">{visitors}</div>
              <div
                className={`w-5 rounded-t ${visitors > 0 ? 'bg-sky-400' : 'bg-slate-200'}`}
                style={{ height: `${heightPct}%` }}
              />
              <div className="text-[9px] text-slate-400 mt-1 whitespace-nowrap">{h.hour || '—'}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecentEventsFeed({ data }: { data?: RecentEvent[] | null }) {
  const list = Array.isArray(data) ? data : [];
  if (list.length === 0) {
    return <p className="text-sm text-slate-500 mt-3">ยังไม่มีอีเวนต์ในช่วงเวลานี้</p>;
  }
  return (
    <div className="mt-3 max-h-[380px] overflow-y-auto pr-1">
      <table className="w-full text-xs border border-blue-100">
        <thead className="bg-[#f0f7ff] text-slate-600 border-b border-blue-100 sticky top-0">
          <tr>
            <th className="p-2 text-left w-20">เวลา</th>
            <th className="p-2 text-left">ผู้ชม</th>
            <th className="p-2 text-left">เหตุการณ์</th>
            <th className="p-2 text-right w-16">%</th>
            <th className="p-2 text-left">หน้า</th>
          </tr>
        </thead>
        <tbody>
          {list.map((e, i) => (
            <tr key={`${e.at || ''}-${i}`} className="border-b border-blue-50">
              <td className="p-2 font-mono text-slate-500">{e.at || '—'}</td>
              <td className="p-2 font-medium text-slate-700">{e.visitorLabel || '—'}</td>
              <td className="p-2 text-slate-600">
                {e.event ? EVENT_LABELS[e.event] || e.event : '—'}
                {e.videoId && <span className="text-[10px] text-slate-400 ml-1 font-mono">({e.videoId})</span>}
              </td>
              <td className="p-2 text-right text-slate-700">{typeof e.progressPercent === 'number' ? `${Math.round(e.progressPercent)}%` : '—'}</td>
              <td className="p-2 text-slate-500 truncate max-w-[160px]">{e.page || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AiInsightCard({ data }: { data?: AiInsight | null }) {
  if (!data) {
    return (
      <p className="text-sm text-slate-500 mt-3">
        ยังไม่มีบทสรุปจาก AI — ระบบจะสร้างบทวิเคราะห์ให้เมื่อมีข้อมูลเพียงพอ
      </p>
    );
  }
  const actions = Array.isArray(data.recommendedActions) ? data.recommendedActions : [];
  return (
    <div className="mt-3">
      {data.summary && <p className="text-sm text-slate-700 leading-relaxed">{data.summary}</p>}
      {data.insight && (
        <div className="mt-3 p-3 rounded-xl border border-blue-100 bg-[#f0f7ff] text-sm text-slate-700 leading-relaxed">
          💡 {data.insight}
        </div>
      )}
      {actions.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-semibold text-slate-600 mb-1">ข้อเสนอแนะที่ควรทำ</div>
          <ul className="list-disc ml-5 space-y-1 text-sm text-slate-700">
            {actions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}
      {data.generatedAt && (
        <div className="text-[11px] text-slate-400 mt-3">สร้างเมื่อ {fmtDateTime(data.generatedAt)}</div>
      )}
    </div>
  );
}
