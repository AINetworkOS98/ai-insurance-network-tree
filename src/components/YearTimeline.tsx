'use client';

/**
 * YearTimeline — Timeline ปีพุทธศักราช (นาฬิกาของธุรกิจ)
 *
 * - คำนวณจากเวลาจริงของเครื่องเสมอ ไม่ hard-code ปี
 * - ปีอนาคตอยู่ด้านบน · ปีปัจจุบันอยู่กลาง (เด่นสุด) · ปีที่ผ่านมาอยู่ด้านล่าง
 * - นับถอยหลังวัน/ชั่วโมง/นาที/วินาที + แถบความคืบหน้าของปี (อัปเดตทุกวินาที)
 * - คลิกปีใดก็เปิดรายละเอียดของปีนั้น · ปุ่ม "วันนี้" เลื่อนกลับไปปีปัจจุบัน
 * - รองรับปีอธิกสุรทิน · เขตเวลา Asia/Bangkok · ไม่มี horizontal overflow
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BangkokParts,
  THAI_MONTHS,
  THAI_WEEKDAYS_SHORT,
  YearStats,
  YearStatus,
  bangkokParts,
  daysInMonth,
  formatNumber,
  formatPercent,
  pad2,
  splitDuration,
  thaiDateFullLabel,
  thaiDateLabel,
  yearStats,
  yearWindow,
} from '@/lib/thaiTime';

/* ────────────────────────────── สไตล์เฉพาะคอมโพเนนต์ ────────────────────────────── */
const YL_STYLES = `
@keyframes yl-ring { 0%{transform:scale(.9);opacity:.55} 70%{transform:scale(1.7);opacity:0} 100%{transform:scale(1.7);opacity:0} }
@keyframes yl-travel { 0%{top:0%;opacity:0} 8%{opacity:1} 92%{opacity:1} 100%{top:100%;opacity:0} }
@keyframes yl-shimmer { 0%{transform:translateX(-120%)} 100%{transform:translateX(320%)} }
@keyframes yl-glow { 0%,100%{box-shadow:0 0 22px 0 rgba(96,165,250,.28)} 50%{box-shadow:0 0 34px 6px rgba(96,165,250,.5)} }
@keyframes yl-fade { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
@keyframes yl-tick { 0%{opacity:.35} 100%{opacity:1} }
.yl-ring{ animation:yl-ring 2.6s cubic-bezier(.22,.61,.36,1) infinite; }
.yl-ring-2{ animation:yl-ring 2.6s cubic-bezier(.22,.61,.36,1) infinite; animation-delay:1.3s; }
.yl-travel{ animation:yl-travel 6.5s linear infinite; }
.yl-shimmer{ animation:yl-shimmer 2.8s ease-in-out infinite; }
.yl-glow{ animation:yl-glow 3.4s ease-in-out infinite; }
.yl-fade{ animation:yl-fade .28s ease-out both; }
.yl-sec{ animation:yl-tick .9s ease-out; }
@media (prefers-reduced-motion: reduce){
  .yl-ring,.yl-ring-2,.yl-travel,.yl-shimmer,.yl-glow,.yl-fade,.yl-sec{ animation:none !important; }
}
`;

const STATUS_META: Record<YearStatus, { label: string; badge: string; ring: string; dot: string }> = {
  current: {
    label: 'CURRENT YEAR',
    badge: 'bg-sky-400/15 text-sky-200 border-sky-300/40',
    ring: 'border-sky-300/40',
    dot: 'bg-sky-300',
  },
  future: {
    label: 'UPCOMING',
    badge: 'bg-indigo-400/10 text-indigo-200 border-indigo-300/25',
    ring: 'border-indigo-300/25',
    dot: 'bg-indigo-300/70',
  },
  past: {
    label: 'COMPLETED',
    badge: 'bg-white/5 text-slate-300 border-white/15',
    ring: 'border-white/15',
    dot: 'bg-slate-400/70',
  },
};

/* ────────────────────────────── Countdown ────────────────────────────── */
export function Countdown({ remainingMs }: { remainingMs: number }) {
  const d = splitDuration(remainingMs);
  const tiles: Array<{ k: string; v: number; accent?: boolean }> = [
    { k: 'วัน', v: d.days },
    { k: 'ชั่วโมง', v: d.hours },
    { k: 'นาที', v: d.minutes },
    { k: 'วินาที', v: d.seconds, accent: true },
  ];
  return (
    <div className="space-y-2">
      <div className="text-[11px] text-sky-200/80">เหลือเวลาอีก</div>
      <div className="grid grid-cols-4 gap-2">
        {tiles.map((t) => (
          <div
            key={t.k}
            className="rounded-2xl border border-white/10 bg-white/[0.06] px-1 py-3 text-center backdrop-blur-md"
          >
            <div
              className={`font-mono text-xl font-bold tabular-nums sm:text-2xl ${
                t.accent ? 'text-sky-300 yl-sec' : 'text-white'
              }`}
              key={t.k === 'วินาที' ? t.v : undefined}
            >
              {t.k === 'วัน' ? formatNumber(t.v) : pad2(t.v)}
            </div>
            <div className="mt-0.5 text-[10px] text-slate-300/80">{t.k}</div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-300/80">
        {formatNumber(d.days)} วัน {pad2(d.hours)} ชั่วโมง {pad2(d.minutes)} นาที {pad2(d.seconds)} วินาที
      </p>
    </div>
  );
}

/* ────────────────────────────── ProgressYear ────────────────────────────── */
export function ProgressYear({ stats }: { stats: YearStats }) {
  const elapsed = Math.min(100, Math.max(0, stats.percentElapsed));
  const remaining = Math.min(100, Math.max(0, stats.percentRemaining));
  return (
    <div className="space-y-2">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="text-[11px] text-sky-200/80">ผ่านมาแล้ว</div>
          <div className="font-mono text-lg font-bold text-white tabular-nums">
            {formatPercent(elapsed)}
          </div>
          <div className="text-[10px] text-slate-300/70">{formatNumber(stats.elapsedDays)} วัน</div>
        </div>
        <div className="text-right">
          <div className="text-[11px] text-sky-200/80">เวลาที่เหลือ</div>
          <div className="font-mono text-lg font-bold text-sky-300 tabular-nums">
            {formatPercent(remaining)}
          </div>
          <div className="text-[10px] text-slate-300/70">{formatNumber(stats.remainingDays)} วัน</div>
        </div>
      </div>

      <div className="relative h-3 w-full overflow-hidden rounded-full border border-white/10 bg-slate-900/60">
        <div
          className="h-full rounded-full bg-gradient-to-r from-sky-500 via-sky-400 to-indigo-400 transition-[width] duration-1000 ease-linear"
          style={{ width: `${elapsed}%` }}
        />
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="yl-shimmer h-full w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
        </div>
      </div>

      <div className="flex justify-between text-[10px] text-slate-300/70">
        <span>1 ม.ค. {stats.thaiYear}</span>
        <span>
          รวม {formatNumber(stats.totalDays)} วัน{stats.leap ? ' · ปีอธิกสุรทิน' : ''}
        </span>
        <span>31 ธ.ค. {stats.thaiYear}</span>
      </div>
    </div>
  );
}

/* ────────────────────────────── YearNode ────────────────────────────── */
export function YearNode({
  thaiYear,
  status,
  leap,
  selected,
  flashing,
  side = 'left',
  markerRef,
  onSelect,
  children,
}: {
  thaiYear: number;
  status: YearStatus;
  leap?: boolean;
  selected?: boolean;
  flashing?: boolean;
  side?: 'left' | 'right';
  markerRef?: React.Ref<HTMLDivElement>;
  onSelect?: () => void;
  children?: React.ReactNode;
}) {
  const meta = STATUS_META[status];
  const isCurrent = status === 'current';
  return (
    <div className="relative flex flex-col md:flex-row md:items-start">
      {/* ตัวเส้น + จุด marker (อยู่กลางเส้น timeline) */}
      <div
        ref={markerRef}
        className="absolute left-[13px] top-3 z-10 -translate-x-1/2 md:left-1/2 md:top-6"
      >
        <div className="relative flex items-center justify-center">
          {isCurrent && (
            <>
              <span className={`absolute h-6 w-6 rounded-full border ${meta.ring} yl-ring`} />
              <span className={`absolute h-6 w-6 rounded-full border ${meta.ring} yl-ring-2`} />
            </>
          )}
          <span
            className={`block rounded-full transition-all ${
              isCurrent
                ? `h-6 w-6 border-2 border-sky-200 bg-sky-400 yl-glow ${flashing ? 'ring-4 ring-sky-300/60' : ''}`
                : status === 'future'
                  ? 'h-3.5 w-3.5 border border-indigo-200/60 bg-indigo-400/30'
                  : 'h-3.5 w-3.5 border border-white/30 bg-slate-400/50'
            }`}
          />
        </div>
      </div>

      {/* การ์ด — สลับซ้าย/ขวารอบเส้นกลาง */}
      <div
        className={`ml-9 min-w-0 md:ml-0 md:w-[calc(50%-2.5rem)] md:flex-none ${
          side === 'left' ? 'md:mr-auto' : 'md:ml-auto'
        }`}
      >
        <button
          type="button"
          onClick={onSelect}
          className={`w-full rounded-2xl border px-3 py-2.5 text-left backdrop-blur-md transition-all hover:border-sky-300/50 ${
            isCurrent
              ? `border-sky-300/40 bg-white/[0.09] ${flashing ? 'ring-2 ring-sky-300/60' : ''}`
              : 'border-white/10 bg-white/[0.05] hover:bg-white/[0.08]'
          }`}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className={`font-mono font-bold tabular-nums ${isCurrent ? 'text-xl text-white' : 'text-sm text-slate-200'}`}>
              {thaiYear}
            </span>
            <span className={`rounded-full border px-2 py-0.5 text-[9px] tracking-wide ${meta.badge}`}>
              {meta.label}
            </span>
            {leap && (
              <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2 py-0.5 text-[9px] text-emerald-200">
                366 วัน
              </span>
            )}
            <span className="ml-auto text-[10px] text-slate-400">{selected ? '▾' : '▸'}</span>
          </div>
          {!isCurrent && (
            <div className="mt-0.5 text-[10px] text-slate-400">
              {status === 'future' ? 'ปีถัดไป · ยังไม่เริ่ม' : 'ปีที่ผ่านมา · สรุปแล้ว'}
            </div>
          )}
        </button>

        {selected && children ? (
          <div className="yl-fade mt-2 rounded-2xl border border-white/10 bg-slate-950/40 p-3">{children}</div>
        ) : null}
      </div>
    </div>
  );
}

/* ────────────────────────────── CurrentYearCard ────────────────────────────── */
export function CurrentYearCard({
  parts,
  stats,
  thaiYear,
}: {
  parts: BangkokParts;
  stats: YearStats;
  thaiYear: number;
}) {
  const monthDays = daysInMonth(parts.year, parts.month);
  const firstWeekday = new Date(Date.UTC(parts.year, parts.month - 1, 1)).getUTCDay();
  const cells: Array<number | null> = [
    ...Array<number | null>(firstWeekday).fill(null),
    ...Array.from({ length: monthDays }, (_, i) => i + 1),
  ];
  const daysLeftInMonth = monthDays - parts.day;
  const daysLeftInYear = stats.remainingDays;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-sky-300/25 bg-[linear-gradient(155deg,rgba(14,42,80,.95)_0%,rgba(9,24,48,.95)_60%,rgba(12,32,64,.95)_100%)] p-4 shadow-[0_10px_40px_-12px_rgba(56,189,248,.35)] backdrop-blur-xl sm:p-5">
      <div className="pointer-events-none absolute -right-16 -top-16 h-40 w-40 rounded-full bg-sky-400/15 blur-3xl" />

      <div className="relative space-y-4">
        {/* หัวการ์ด */}
        <div className="flex flex-wrap items-start gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] tracking-wide text-sky-200/80">ปีปัจจุบัน</span>
              <span className="rounded-full border border-sky-300/40 bg-sky-400/15 px-2 py-0.5 text-[9px] tracking-wide text-sky-200">
                CURRENT YEAR
              </span>
            </div>
            <div className="font-mono text-4xl font-black leading-none text-white tabular-nums sm:text-5xl">
              {thaiYear}
            </div>
            <div className="mt-1 text-[11px] text-slate-300/80">เวลาของปีนี้กำลังเดินหน้า...</div>
          </div>
          <div className="ml-auto text-right">
            <div className="flex items-center justify-end gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
              </span>
              <span className="text-[10px] text-emerald-200">เดินเวลาจริง · Asia/Bangkok</span>
            </div>
            <div className="mt-1 text-xs text-white">{thaiDateFullLabel(parts)}</div>
            <div className="font-mono text-[11px] text-slate-300/80 tabular-nums">
              {pad2(parts.hour)}:{pad2(parts.minute)}:{pad2(parts.second)}
            </div>
          </div>
        </div>

        {/* นับถอยหลัง + ความคืบหน้า */}
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="text-[11px] text-sky-200/80">เหลืออีก</div>
              <div className="font-mono text-2xl font-bold text-white tabular-nums">
                {formatNumber(stats.remainingDays)} วัน
              </div>
              <div className="text-[10px] text-slate-300/70">
                = {formatPercent(stats.percentRemaining)} ของปีที่เหลือ
              </div>
            </div>
            <Countdown remainingMs={stats.remainingMs} />
          </div>

          <div className="space-y-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <ProgressYear stats={stats} />
            </div>

            {/* Mini Calendar */}
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center justify-between">
                <div className="text-[11px] font-semibold text-white">
                  {THAI_MONTHS[parts.month - 1]} {thaiYear}
                </div>
                <div className="text-[10px] text-slate-300/80">
                  เหลือในเดือน {formatNumber(daysLeftInMonth)} วัน · ในปี {formatNumber(daysLeftInYear)} วัน
                </div>
              </div>
              <div className="mt-2 grid grid-cols-7 gap-1 text-center">
                {THAI_WEEKDAYS_SHORT.map((w) => (
                  <div key={w} className="text-[9px] text-slate-400">
                    {w}
                  </div>
                ))}
                {cells.map((c, i) => (
                  <div
                    key={`${c ?? 'x'}-${i}`}
                    className={`rounded-md py-0.5 text-[10px] tabular-nums ${
                      c === parts.day
                        ? 'bg-sky-400 font-bold text-slate-900'
                        : c
                          ? 'text-slate-300'
                          : 'text-transparent'
                    }`}
                  >
                    {c ?? '·'}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ข้อความสร้างแรงกระตุ้น */}
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-white/10 pt-3 text-[11px] text-slate-300/80">
          <span>“ทุกวันคือช่วงเวลาที่มีค่า”</span>
          <span>“ติดตามช่วงเวลา เพื่อวางแผนเป้าหมายของคุณ”</span>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── YearTimeline ────────────────────────────── */
export default function YearTimeline({
  pastYears = 3,
  futureYears = 3,
  title = 'Timeline เวลา — นาฬิกาของธุรกิจ',
}: {
  pastYears?: number;
  futureYears?: number;
  title?: string;
}) {
  const [now, setNow] = useState<Date | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [flash, setFlash] = useState(false);
  const currentRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const didInitialScroll = useRef(false);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** เลื่อน "ในกรอบ timeline" ให้การ์ดปีปัจจุบันอยู่กลาง (ไม่แตะการเลื่อนของหน้าเว็บ) */
  const centerOnCurrent = useCallback((behavior: ScrollBehavior = 'auto') => {
    const sc = scrollerRef.current;
    const el = cardRef.current ?? currentRef.current;
    if (!sc || !el) return;
    const scRect = sc.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();
    const maxTop = Math.max(0, sc.scrollHeight - sc.clientHeight);
    const target = sc.scrollTop + (elRect.top - scRect.top) + elRect.height / 2 - sc.clientHeight / 2;
    sc.scrollTo({ top: Math.min(Math.max(0, target), maxTop), behavior });
  }, []);

  // เดินเวลาทุกวินาที + cleanup ตอน unmount
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearInterval(id);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, []);

  const parts = useMemo(() => (now ? bangkokParts(now) : null), [now]);
  const currentYear = parts?.year ?? null;

  const years = useMemo(() => (now ? yearWindow(now, pastYears, futureYears) : []), [now, pastYears, futureYears]);

  const statsOf = useCallback(
    (year: number): YearStats => yearStats(year, now ?? new Date()),
    [now],
  );

  const currentStats = currentYear ? statsOf(currentYear) : null;

  // เลื่อนไปปีปัจจุบันครั้งแรกที่พร้อม (ไม่ให้ผู้ใช้ต้องหาเอง)
  useEffect(() => {
    if (!currentYear || didInitialScroll.current) return;
    didInitialScroll.current = true;
    const raf = requestAnimationFrame(() => centerOnCurrent('auto'));
    return () => cancelAnimationFrame(raf);
  }, [currentYear, centerOnCurrent]);

  const goToday = useCallback(() => {
    setSelectedYear(null);
    centerOnCurrent('smooth');
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 1600);
  }, [centerOnCurrent]);

  // ก่อน mount เสร็จ — แสดงโครงร่างความสูงเท่ากันเพื่อกัน layout shift / hydration mismatch
  if (!now || !parts || !currentYear || !currentStats) {
    return (
      <div>
        <style>{YL_STYLES}</style>
        <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-white/10 bg-[linear-gradient(160deg,#0a1730_0%,#0d2445_50%,#0a1a33_100%)]">
          <div className="text-center">
            <div className="yl-travel mx-auto h-1.5 w-1.5 rounded-full bg-sky-300" />
            <div className="mt-3 text-xs text-sky-200/70">กำลังอ่านเวลาปัจจุบัน (Asia/Bangkok)...</div>
          </div>
        </div>
      </div>
    );
  }

  // อนาคต: ปีใกล้สุด (เช่น 2570) อยู่บนสุด แล้วไล่ลงมา 2571, 2572
  const futureList = years.filter((y) => y > currentYear).sort((a, b) => a - b);
  // อดีต: ปีใกล้ปัจจุบันสุดอยู่บนสุด แล้วไล่ลงมา
  const pastList = years.filter((y) => y < currentYear).sort((a, b) => b - a);

  const renderNode = (year: number, index: number, group: 'future' | 'past') => {
    const st = statsOf(year);
    const isCurrent = st.status === 'current';
    const thaiYear = st.thaiYear;
    // สลับซ้าย/ขวา — อนาคตเริ่มซ้าย, อดีตเริ่มขวา เพื่อไม่ให้เอียงข้างเดียว
    const side: 'left' | 'right' = index % 2 === 0 ? (group === 'future' ? 'left' : 'right') : (group === 'future' ? 'right' : 'left');
    const startLabel = thaiDateLabel(bangkokParts(new Date(st.startMs)));
    const endLabel = thaiDateLabel(bangkokParts(new Date(st.endMs - 1)));
    return (
      <YearNode
        key={year}
        thaiYear={thaiYear}
        status={st.status}
        leap={st.leap}
        side={side}
        selected={selectedYear === year}
        flashing={isCurrent && flash}
        markerRef={isCurrent ? currentRef : undefined}
        onSelect={() => setSelectedYear((cur) => (cur === year ? null : year))}
      >
        <div className="space-y-1.5 text-[11px] text-slate-200">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full border px-2 py-0.5 text-[9px] ${
                st.status === 'past'
                  ? 'border-white/15 bg-white/5 text-slate-300'
                  : st.status === 'current'
                    ? 'border-sky-300/40 bg-sky-400/15 text-sky-200'
                    : 'border-indigo-300/25 bg-indigo-400/10 text-indigo-200'
              }`}
            >
              {st.status === 'past' ? 'อดีต · ปิดรอบแล้ว' : st.status === 'current' ? 'ปัจจุบัน · กำลังดำเนินอยู่' : 'อนาคต · ยังไม่เริ่ม'}
            </span>
            {st.leap && <span className="text-emerald-200/90">ปีอธิกสุรทิน (366 วัน)</span>}
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
            <div>
              <span className="text-slate-400">วันทั้งหมดของปี</span>
              <div className="font-mono text-white">{formatNumber(st.totalDays)} วัน</div>
            </div>
            <div>
              <span className="text-slate-400">ผ่านไปแล้ว</span>
              <div className="font-mono text-white">
                {formatNumber(st.elapsedDays)} วัน ({formatPercent(st.percentElapsed, 0)})
              </div>
            </div>
            <div>
              <span className="text-slate-400">เหลือ</span>
              <div className="font-mono text-sky-200">
                {formatNumber(st.remainingDays)} วัน ({formatPercent(st.percentRemaining, 0)})
              </div>
            </div>
            <div className="col-span-2 sm:col-span-3">
              <span className="text-slate-400">ช่วงเวลา (Bangkok)</span>
              <div className="font-mono text-slate-200">
                {startLabel} → {endLabel}
              </div>
            </div>
          </div>
        </div>
      </YearNode>
    );
  };

  return (
    <section aria-label="Timeline ปีพุทธศักราช" className="space-y-3">
      <style>{YL_STYLES}</style>

      <div className="overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(160deg,#0a1730_0%,#0d2445_50%,#0a1a33_100%)] shadow-[0_18px_60px_-24px_rgba(2,12,32,.9)]">
        {/* หัวแผง */}
        <div className="flex flex-wrap items-center gap-2 border-b border-white/10 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-bold text-white sm:text-base">{title}</h2>
            <p className="text-[10px] text-sky-200/70">
              ปีอนาคตอยู่ด้านบน · ปีปัจจุบันอยู่กลาง · ปีที่ผ่านมาอยู่ด้านล่าง · อัปเดตทุกวินาที
            </p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[10px] text-slate-200">
              วันนี้: <span className="font-semibold text-white">{thaiDateLabel(parts)}</span>
            </span>
            <button
              type="button"
              onClick={goToday}
              className="rounded-full border border-sky-300/40 bg-sky-400/15 px-3 py-1 text-[10px] font-semibold text-sky-100 transition-colors hover:bg-sky-400/25"
            >
              วันนี้
            </button>
          </div>
        </div>

        {/* ตัว timeline */}
        <div
          ref={scrollerRef}
          className="relative max-h-[720px] overflow-y-auto overflow-x-hidden overscroll-contain scrollbar-none px-3 py-5 sm:px-5"
        >
          {/* เส้นกลาง + ไฟวิ่ง (สื่อว่าเวลาเดินอยู่ตลอด) */}
          <div className="pointer-events-none absolute bottom-4 left-[13px] top-4 w-px bg-gradient-to-b from-indigo-300/10 via-sky-300/40 to-slate-400/10 md:left-1/2" />
          <div className="pointer-events-none absolute bottom-4 left-[13px] top-4 w-px md:left-1/2">
            <span className="yl-travel absolute left-1/2 h-10 w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-sky-300 to-transparent shadow-[0_0_10px_2px_rgba(125,211,252,.6)]" />
          </div>

          <div className="space-y-3">
            {/* อนาคต — ไกลสุดอยู่บนสุด */}
            {futureList.map((y, i) => renderNode(y, i, 'future'))}

            {/* ปีปัจจุบัน — node ใหญ่สุด มีวงแหวน animation + การ์ดเต็มความกว้าง */}
            <div className="relative flex flex-col md:flex-row md:items-start">
              <div
                ref={currentRef}
                className="absolute left-[13px] top-3 z-10 -translate-x-1/2 md:left-1/2 md:top-6"
                aria-hidden="true"
              >
                <div className="relative flex items-center justify-center">
                  <span className="yl-ring absolute h-6 w-6 rounded-full border border-sky-300/40" />
                  <span className="yl-ring-2 absolute h-6 w-6 rounded-full border border-sky-300/40" />
                  <span
                    className={`yl-glow block h-6 w-6 rounded-full border-2 border-sky-200 bg-sky-400 transition-all ${
                      flash ? 'ring-4 ring-sky-300/60' : ''
                    }`}
                  />
                </div>
              </div>
              <div ref={cardRef} className="ml-9 min-w-0 flex-1 md:ml-0 md:w-full">
                <CurrentYearCard parts={parts} stats={currentStats} thaiYear={currentStats.thaiYear} />
              </div>
            </div>

            {/* อดีต */}
            {pastList.map((y, i) => renderNode(y, i, 'past'))}
          </div>
        </div>

        <div className="border-t border-white/10 px-4 py-2 text-[10px] text-slate-400 sm:px-5">
          อ้างอิงเขตเวลา {`Asia/Bangkok`} · ใช้ปีพุทธศักราชในหน้าจอ คำนวณภายในด้วยปี ค.ศ. · รองรับปีอธิกสุรทิน ·
          ระบบเลื่อนปีอัตโนมัติเมื่อขึ้นปีใหม่โดยไม่ต้องแก้โค้ด
        </div>
      </div>
    </section>
  );
}
