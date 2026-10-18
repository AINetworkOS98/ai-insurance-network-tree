'use client';

/**
 * IncomeBenefits3DSection — พรีเมียม 3D Income Benefits Infographic
 * วางเป็นส่วนแรกสุดของหน้า /progress
 *
 * หลักการ:
 *   - ข้อมูลทั้งหมดมาจาก src/lib/incomeBenefits3d.ts (แยกจาก UI) หรือ prop `data` จาก API จริง
 *   - ตัวเลข/เปอร์เซ็นต์ที่เป็นตัวอย่างมีป้ายกำกับชัดเจน (isSample) — ห้ามทำให้ดูเป็นผลงานจริง
 *   - เอฟเฟกต์ทั้งหมดใช้ CSS ล้วน (ไม่เพิ่ม dependency / ไม่ใช้ WebGL)
 *   - ปิดแอนิเมชันอัตโนมัติเมื่อ prefers-reduced-motion: reduce
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  INCOME_BENEFITS_3D,
  INCOME_TONE_COLORS,
  type IncomeBenefits3DData,
  type IncomeLevel3D,
} from '@/lib/incomeBenefits3d';
import styles from './IncomeBenefits3DSection.module.css';

type Vars = CSSProperties & Record<'--tone-from' | '--tone-to' | '--tone-glow' | '--ped' | '--i' | '--p', string>;

function toneVars(level: IncomeLevel3D, index: number, counter: { t: number }): Vars {
  const tone = INCOME_TONE_COLORS[level.tone] || INCOME_TONE_COLORS.sky;
  return {
    '--tone-from': tone.from,
    '--tone-to': tone.to,
    '--tone-glow': tone.glow,
    '--ped': `${level.pedestal}px`,
    '--i': String(index),
    '--p': String(Math.max(0, Math.min(100, Math.round(level.samplePercent * counter.t)))),
  };
}

const thb = (n: number) => n.toLocaleString('th-TH');

export default function IncomeBenefits3DSection({
  data = INCOME_BENEFITS_3D,
  className = '',
}: {
  data?: IncomeBenefits3DData;
  className?: string;
}) {
  const sectionRef = useRef<HTMLElement | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [t, setT] = useState(0);

  // เข้าสู่หน้าจอ → เริ่มนับตัวเลข (IntersectionObserver)
  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setRevealed(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setRevealed(true);
            io.disconnect();
          }
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    // ถ้า Section ถูกซ่อน/ไม่มีการเลื่อนจอ ให้ยังเริ่มนับได้ภายใน 1.5 วินาที
    const fallback = setTimeout(() => setRevealed(true), 1500);
    return () => {
      clearTimeout(fallback);
      io.disconnect();
    };
  }, []);

  // นับขึ้นแบบ easing — ถ้าผู้ใช้ปิดการเคลื่อนไหว ให้แสดงค่าสุดท้ายทันที
  useEffect(() => {
    if (!revealed) return;
    const reduce = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
    if (reduce) {
      setT(1);
      return;
    }
    // กันเหนียว: ถ้า rAF ถูก throttle/ไม่ทำงาน (เช่น แท็บไม่แสดงผล) ให้ค่าสุดท้ายขึ้นเสมอ
    const safety = setTimeout(() => setT(1), 1600);
    let raf = 0;
    const dur = 1150;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / dur);
      setT(1 - Math.pow(1 - p, 3));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      clearTimeout(safety);
      cancelAnimationFrame(raf);
    };
  }, [revealed]);

  const counter = useMemo(() => ({ t }), [t]);
  const levels = data.levels;

  return (
    <section
      ref={sectionRef}
      className={`${styles.section} ${className}`.trim()}
      data-revealed={revealed ? 'true' : 'false'}
      aria-labelledby="income-benefits-3d-title"
    >
      <span className={styles.orbA} aria-hidden="true" />
      <span className={styles.orbB} aria-hidden="true" />

      {/* เส้นกราฟแนวโน้มเติบโต (พื้นหลัง) */}
      <svg className={styles.trend} viewBox="0 0 1200 300" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="ib3dArea" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ib3dLine" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.15" />
            <stop offset="55%" stopColor="#60a5fa" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#fcd34d" stopOpacity="0.8" />
          </linearGradient>
        </defs>
        <path
          d="M0 262 L120 244 L240 258 L360 208 L480 222 L600 164 L720 178 L840 118 L960 132 L1080 66 L1200 48 L1200 300 L0 300 Z"
          fill="url(#ib3dArea)"
        />
        <path
          d="M0 262 L120 244 L240 258 L360 208 L480 222 L600 164 L720 178 L840 118 L960 132 L1080 66 L1200 48"
          fill="none"
          stroke="url(#ib3dLine)"
          strokeWidth="2"
        />
        <path
          className={styles.trendPath}
          d="M0 254 L150 236 L300 240 L450 196 L600 172 L750 150 L900 108 L1050 84 L1200 40"
          fill="none"
          stroke="#fcd34d"
          strokeOpacity="0.45"
          strokeWidth="1.6"
          strokeDasharray="10 12"
          strokeLinecap="round"
        />
      </svg>

      <header className={styles.head}>
        <span className={styles.kicker}>
          <span aria-hidden="true">◆</span>
          {data.kicker}
        </span>
        <h2 id="income-benefits-3d-title" className={styles.title}>
          {data.title}
        </h2>
        <span className={styles.titleBar} aria-hidden="true" />
        <p className={styles.subtitle}>{data.subtitle}</p>
        {data.isSample && (
          <span className={styles.sampleBadge}>
            <span aria-hidden="true">ⓘ</span> ข้อมูลตัวอย่าง — {data.sampleNote}
          </span>
        )}
      </header>

      <div className={styles.stage}>
        {/* ลูกศรเติบโตสีทอง */}
        <svg className={styles.arrow} viewBox="0 0 560 340" fill="none" aria-hidden="true">
          <defs>
            <linearGradient id="ib3dArrow" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#8a5a12" stopOpacity="0.5" />
              <stop offset="45%" stopColor="#f0b93c" />
              <stop offset="100%" stopColor="#fff3c4" />
            </linearGradient>
            <filter id="ib3dArrowGlow" x="-40%" y="-40%" width="180%" height="180%">
              <feGaussianBlur stdDeviation="12" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {/* เงาเรืองแสง */}
          <g filter="url(#ib3dArrowGlow)" opacity="0.45">
            <path d="M20 300 C 140 288, 262 232, 424 114" stroke="url(#ib3dArrow)" strokeWidth="30" strokeLinecap="round" />
            <polygon points="506,58 448,152 396,68" fill="url(#ib3dArrow)" />
          </g>
          {/* ตัวลูกศร */}
          <path d="M20 300 C 140 288, 262 232, 424 114" stroke="url(#ib3dArrow)" strokeWidth="17" strokeLinecap="round" />
          <polygon points="506,58 448,152 396,68" fill="url(#ib3dArrow)" />
          <path d="M20 300 C 140 288, 262 232, 424 114" stroke="#fff8dc" strokeOpacity="0.5" strokeWidth="4" strokeLinecap="round" />
        </svg>

        <div className={styles.grid}>
          {levels.map((lv, i) => {
            const tone = INCOME_TONE_COLORS[lv.tone] || INCOME_TONE_COLORS.sky;
            return (
              <article key={lv.level} className={styles.card} style={toneVars(lv, i, counter)}>
                <span className={styles.cardTop} aria-hidden="true" />

                <div className={styles.rankRow}>
                  <span className={styles.rankChip}>ระดับ {lv.level}</span>
                  <div
                    className={`${styles.ring} ${styles.ringPulse}`}
                    role="img"
                    aria-label={`ความก้าวหน้า ${Math.round(lv.samplePercent * counter.t)} เปอร์เซ็นต์${data.isSample ? ' (ข้อมูลตัวอย่าง)' : ''}`}
                    title={data.isSample ? 'เปอร์เซ็นต์ตัวอย่าง — ยังไม่คำนวณจากผลงานจริง' : undefined}
                  >
                    <span className={styles.ringInner} aria-hidden="true" />
                    <span className={styles.pctNum}>{Math.round(lv.samplePercent * counter.t)}%</span>
                  </div>
                </div>

                <h3 className={styles.name}>
                  {lv.nameTh}
                  <span className={styles.nameEn}>{lv.nameEn}</span>
                </h3>

                <span className={styles.period}>
                  <span aria-hidden="true" style={{ color: tone.from }}>◷</span>
                  {lv.periodLabel}
                </span>

                <ul className={styles.benefits}>
                  {lv.benefits.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>

                <div className={styles.comBox}>
                  <span className={styles.comLabel}>
                    COM อ้างอิง{data.isSample ? ' · ตัวอย่าง' : ''}
                  </span>
                  {lv.com === null ? (
                    <span className={styles.comAlt}>ตามผลงานจริง</span>
                  ) : (
                    <span className={styles.comValue}>
                      {thb(Math.round(lv.com * counter.t))}
                      <span className={styles.comUnit}>บาท</span>
                    </span>
                  )}
                </div>

                <div className={styles.pedestal} aria-hidden="true" />
              </article>
            );
          })}
        </div>
      </div>

      <footer className={styles.foot}>
        {data.conflictNote && <p className={styles.conflict}>⚠ {data.conflictNote}</p>}
        <p className={styles.disclaimer}>{data.disclaimer}</p>
      </footer>
    </section>
  );
}
