'use client';

/**
 * NetworkEnergyMini — ภาพ Network Tree ขนาดเล็กสำหรับใช้ประดับใน hero
 * 4 ระดับ: ตัวแทน → ผู้บริหารหน่วย → ผู้บริหารศูนย์ → ผู้บริหารภาค
 * มีอนุภาคแสงไหลจากล่างขึ้นบน (SMIL) · ปิดอนุภาคอัตโนมัติถ้าเครื่องตั้ง reduced-motion
 */

import { useEffect, useState } from 'react';

const NODES = [
  { x: 120, y: 142, r: 4.5, level: 0 },
  { x: 66, y: 104, r: 4, level: 1 },
  { x: 176, y: 100, r: 4, level: 1 },
  { x: 44, y: 60, r: 4.5, level: 2 },
  { x: 196, y: 56, r: 4.5, level: 2 },
  { x: 120, y: 22, r: 6.5, level: 3 },
];

const LINKS = [
  { d: 'M120 142 C110 128 88 120 66 104', id: 'l1' },
  { d: 'M120 142 C132 128 156 116 176 100', id: 'l2' },
  { d: 'M66 104 C56 88 50 74 44 60', id: 'l3' },
  { d: 'M176 100 C184 84 190 70 196 56', id: 'l4' },
  { d: 'M44 60 C64 40 92 30 120 22', id: 'l5' },
  { d: 'M196 56 C176 38 148 28 120 22', id: 'l6' },
];

export default function NetworkEnergyMini({ className = '' }: { className?: string }) {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener?.('change', on);
    return () => m.removeEventListener?.('change', on);
  }, []);

  return (
    <svg viewBox="0 0 240 160" className={className} role="img" aria-label="โครงข่ายการเติบโต 4 ระดับ">
      <defs>
        <linearGradient id="bmn-line" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor="#38bdf8" />
          <stop offset="55%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#fbbf24" />
        </linearGradient>
        <radialGradient id="bmn-node" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="60%" stopColor="#7dd3fc" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#38bdf8" stopOpacity="0" />
        </radialGradient>
        <filter id="bmn-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="1.6" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* เส้นเชื่อม */}
      <g filter="url(#bmn-glow)" opacity="0.9">
        {LINKS.map((l) => (
          <path key={l.id} id={`bmn-${l.id}`} d={l.d} fill="none" stroke="url(#bmn-line)" strokeWidth="1.25" strokeLinecap="round" />
        ))}
      </g>

      {/* อนุภาคแสงไหลขึ้นบน */}
      {!reduced && (
        <g filter="url(#bmn-glow)">
          {LINKS.map((l, i) => (
            <circle key={`p-${l.id}`} r={i % 2 === 0 ? 1.5 : 1.1} fill={i % 2 === 0 ? '#fde68a' : '#bae6fd'}>
              <animateMotion dur={`${3 + (i % 3) * 0.7}s`} begin={`${i * 0.35}s`} repeatCount="indefinite" rotate="auto">
                <mpath href={`#bmn-${l.id}`} />
              </animateMotion>
            </circle>
          ))}
        </g>
      )}

      {/* จุดเชื่อม */}
      <g>
        {NODES.map((n, i) => (
          <g key={`${n.x}-${n.y}`}>
            <circle cx={n.x} cy={n.y} r={n.r * 3.2} fill="url(#bmn-node)" opacity={n.level === 3 ? 0.5 : 0.3} />
            <circle cx={n.x} cy={n.y} r={n.r} fill={n.level === 3 ? '#fbbf24' : '#7dd3fc'} stroke="#04122a" strokeWidth="0.6">
              {!reduced && (
                <animate attributeName="r" values={`${n.r};${n.r * 1.22};${n.r}`} dur={`${2.2 + i * 0.25}s`} repeatCount="indefinite" />
              )}
            </circle>
          </g>
        ))}
      </g>
    </svg>
  );
}
