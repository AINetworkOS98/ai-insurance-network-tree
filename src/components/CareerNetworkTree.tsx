/**
 * CareerNetworkTree — ภาพเส้นทางอาชีพ 4 ระดับ (ตัวแทน → ผู้บริหารหน่วย → ผู้บริหารศูนย์ → ผู้บริหารภาค)
 * วาดด้วย SVG ล้วน: เส้นแสงไหล + อนุภาควิ่ง + จุดเชื่อมเต้นเป็นจังหวะ
 * ไม่มีข้อความ/ตัวอักษร/โลโก้/watermark ใด ๆ · สัดส่วนแนวตั้ง 4:5 · ธีม navy–electric blue–gold
 * ไม่ใช้ JavaScript (ใช้ CSS animation + SMIL animateMotion) จึงเป็น server component ได้
 */

const LEVELS = {
  agent: { x: 400, y: 902, r: 30, label: 'agent' },
  unit: { x: 400, y: 672, r: 36, label: 'unit' },
  center: { x: 400, y: 442, r: 42, label: 'center' },
  region: { x: 400, y: 186, r: 50, label: 'region' },
};

/** สมาชิกในทีมของผู้บริหารหน่วย (ทีมเล็ก) */
const UNIT_TEAM = [
  { x: 268, y: 704, r: 15 },
  { x: 300, y: 612, r: 14 },
  { x: 500, y: 612, r: 14 },
  { x: 534, y: 704, r: 15 },
  { x: 400, y: 786, r: 16 },
  { x: 232, y: 800, r: 13 },
  { x: 570, y: 800, r: 13 },
];

/** ผู้บริหารหน่วยในเครือข่ายของผู้บริหารศูนย์ */
const CENTER_UNITS = [
  { x: 222, y: 486, r: 21 },
  { x: 578, y: 486, r: 21 },
  { x: 276, y: 362, r: 20 },
  { x: 524, y: 362, r: 20 },
  { x: 400, y: 552, r: 23 },
];

/** เครือข่ายขนาดใหญ่ใต้ผู้บริหารภาค */
const REGION_WEB = [
  { x: 148, y: 236, r: 17 },
  { x: 252, y: 128, r: 19 },
  { x: 400, y: 92, r: 21 },
  { x: 548, y: 128, r: 19 },
  { x: 652, y: 236, r: 17 },
  { x: 96, y: 336, r: 14 },
  { x: 704, y: 336, r: 14 },
  { x: 330, y: 268, r: 16 },
  { x: 470, y: 268, r: 16 },
];

const curve = (from: { x: number; y: number }, to: { x: number; y: number }, bend = 0) => {
  const mx = (from.x + to.x) / 2 + bend;
  const my = (from.y + to.y) / 2;
  return `M ${from.x} ${from.y} Q ${mx} ${my} ${to.x} ${to.y}`;
};

/** เส้นลำแสงจากล่างขึ้นบน (เส้นเดียวจากตัวแทน → แยกเป็นหลายสาย → รวมเป็นเครือข่ายใหญ่) */
const TRUNK = [
  curve(LEVELS.agent, LEVELS.unit, 0),
  curve(LEVELS.unit, LEVELS.center, 0),
  curve(LEVELS.center, LEVELS.region, 0),
];

const UNIT_LINKS = UNIT_TEAM.map((n, i) => curve(LEVELS.unit, n, (i % 2 ? 1 : -1) * 26));
const UNIT_TO_CENTER = UNIT_TEAM.filter((_, i) => i % 2 === 0).map((n) => curve(n, LEVELS.center, n.x < 400 ? 40 : -40));
const CENTER_LINKS = CENTER_UNITS.map((n, i) => curve(LEVELS.center, n, (i % 2 ? 1 : -1) * 34));
const CENTER_TO_REGION = CENTER_UNITS.map((n) => curve(n, LEVELS.region, n.x < 400 ? 34 : -34));
const REGION_LINKS = REGION_WEB.map((n, i) => curve(LEVELS.region, n, (i % 2 ? 1 : -1) * 40));
const REGION_CROSS = [
  curve(REGION_WEB[0], REGION_WEB[7], 20),
  curve(REGION_WEB[1], REGION_WEB[7], -20),
  curve(REGION_WEB[2], REGION_WEB[8], 0),
  curve(REGION_WEB[3], REGION_WEB[8], 20),
  curve(REGION_WEB[4], REGION_WEB[8], -20),
  curve(REGION_WEB[5], REGION_WEB[0], 14),
  curve(REGION_WEB[6], REGION_WEB[4], -14),
  curve(REGION_WEB[7], REGION_WEB[8], 0),
];

const ALL_LINKS = [...TRUNK, ...UNIT_LINKS, ...UNIT_TO_CENTER, ...CENTER_LINKS, ...CENTER_TO_REGION, ...REGION_LINKS, ...REGION_CROSS];

/** อนุภาคแสงที่วิ่งตามเส้น — ทำจากสำเนาเส้นในรูปแบบ path เดียวกัน */
const PARTICLES = [
  ...TRUNK.map((d, i) => ({ d, dur: 3.2 + i * 0.35, r: 3.4, color: '#ffe9a8', begin: `${i * 0.4}s` })),
  ...UNIT_LINKS.map((d, i) => ({ d, dur: 2.9 + (i % 3) * 0.3, r: 2.2, color: '#bae6fd', begin: `${i * 0.28}s` })),
  ...CENTER_TO_REGION.map((d, i) => ({ d, dur: 3.0 + (i % 3) * 0.35, r: 2.6, color: '#ffe9a8', begin: `${i * 0.33}s` })),
  ...REGION_LINKS.slice(0, 6).map((d, i) => ({ d, dur: 3.4 + (i % 3) * 0.4, r: 2.0, color: '#bae6fd', begin: `${i * 0.36}s` })),
];

const part = (p: { x: number; y: number; r: number }) => (
  <g transform={`translate(${p.x} ${p.y}) scale(${(2 * p.r) / 100}) translate(-50 -50)`}>
    <use href="#cn-person" />
  </g>
);

const node = (p: { x: number; y: number; r: number }, tier: 'top' | 'mid' | 'low' | 'leaf', i = 0) => (
  <g className={`cn-node cn-node--${tier}`} style={{ animationDelay: `${(i % 5) * 0.45}s` }}>
    <circle cx={p.x} cy={p.y} r={p.r * 2.1} fill="url(#cn-halo)" opacity={tier === 'top' ? 0.5 : 0.3} />
    <circle cx={p.x} cy={p.y} r={p.r + 4} fill="none" stroke="url(#cn-ring)" strokeWidth={tier === 'top' ? 2.6 : 1.6} opacity="0.85" />
    {tier === 'top' && (
      <circle
        className="cn-orbit"
        cx={p.x}
        cy={p.y}
        r={p.r + 11}
        fill="none"
        stroke="#fbbf24"
        strokeWidth="1.3"
        strokeDasharray="10 16"
        opacity="0.75"
      />
    )}
    <circle cx={p.x} cy={p.y} r={p.r} fill="url(#cn-face)" />
    {part(p)}
  </g>
);

export default function CareerNetworkTree() {
  return (
    <figure className="cn-wrap" aria-label="Career progression network tree">
      <style>{CN_STYLES}</style>
      <svg viewBox="0 0 800 1000" role="img" className="cn-svg" preserveAspectRatio="xMidYMid meet">
        <defs>
          <linearGradient id="cn-bg" x1="0" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor="#04091a" />
            <stop offset="45%" stopColor="#07142c" />
            <stop offset="100%" stopColor="#020617" />
          </linearGradient>
          <radialGradient id="cn-vignette" cx="50%" cy="46%" r="62%">
            <stop offset="0%" stopColor="#0b2a5b" stopOpacity="0.75" />
            <stop offset="70%" stopColor="#04102a" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#01040f" stopOpacity="0.9" />
          </radialGradient>
          <linearGradient id="cn-line" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.6" />
            <stop offset="55%" stopColor="#7dd3fc" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#fbbf24" stopOpacity="1" />
          </linearGradient>
          <linearGradient id="cn-line-soft" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#93c5fd" stopOpacity="0.5" />
          </linearGradient>
          <linearGradient id="cn-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="60%" stopColor="#e0f2fe" />
            <stop offset="100%" stopColor="#fbbf24" />
          </linearGradient>
          <radialGradient id="cn-halo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7dd3fc" stopOpacity="0.55" />
            <stop offset="55%" stopColor="#3b82f6" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="cn-face" cx="38%" cy="28%" r="80%">
            <stop offset="0%" stopColor="#dbeafe" />
            <stop offset="55%" stopColor="#93b4dc" />
            <stop offset="100%" stopColor="#3f5f8a" />
          </radialGradient>
          <filter id="cn-glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="cn-glow-strong" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="10" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          {/* เงารูปบุคคล (หัว + ไหล่) ในกรอบ 100x100 — ใช้ซ้ำทุกโหนด */}
          <g id="cn-person">
            <circle cx="50" cy="36" r="15" fill="#f8fafc" opacity="0.94" />
            <path d="M18 84 C22 62 33 55 50 55 C67 55 78 62 82 84 Z" fill="#f8fafc" opacity="0.94" />
            <path d="M50 55 L50 84" stroke="#0b2447" strokeWidth="1.2" opacity="0.35" />
          </g>
        </defs>

        {/* พื้นหลัง + แสงห้อม */}
        <rect width="800" height="1000" fill="url(#cn-bg)" />
        <rect width="800" height="1000" fill="url(#cn-vignette)" />

        {/* เส้นนำทางแนวตั้งจาง ๆ (แกนการเติบโต) */}
        <line x1="400" y1="60" x2="400" y2="940" stroke="#1e3a8a" strokeWidth="1" opacity="0.35" strokeDasharray="4 10" />

        {/* เส้นเชื่อมทั้งหมด */}
        <g fill="none" stroke="#5b9cf8" strokeWidth="1.5" opacity="0.85">
          {UNIT_LINKS.map((d, i) => <path key={`ul${i}`} d={d} />)}
          {CENTER_LINKS.map((d, i) => <path key={`cl${i}`} d={d} />)}
          {REGION_LINKS.map((d, i) => <path key={`rl${i}`} d={d} />)}
          {REGION_CROSS.map((d, i) => <path key={`rx${i}`} d={d} />)}
        </g>

        {/* ชั้นเรืองแสงใต้เส้นหลัง (ทำให้เส้นดูเป็นลำแสง ไม่ใช่เส้นบาง) */}
        <g fill="none" stroke="url(#cn-line)" strokeLinecap="round" opacity="0.3" filter="url(#cn-glow-strong)">
          {ALL_LINKS.map((d, i) => <path key={`hw${i}`} d={d} strokeWidth="6" />)}
        </g>

        {/* เส้นหลัง (ไหลขึ้นบน) */}
        <g fill="none" stroke="url(#cn-line)" strokeLinecap="round" filter="url(#cn-glow)">
          {ALL_LINKS.map((d, i) => (
            <path key={`ln${i}`} d={d} className="cn-flow" style={{ animationDelay: `${(i % 7) * 0.22}s` }} />
          ))}
        </g>

        {/* อนุภาคแสงวิ่งตามเส้นจากล่างขึ้นบน */}
        <g>
          {PARTICLES.map((p, i) => (
            <circle key={`pt${i}`} r={p.r} fill={p.color} filter="url(#cn-glow)" opacity="0.95">
              <animateMotion dur={`${p.dur}s`} begin={p.begin} repeatCount="indefinite" path={p.d} />
            </circle>
          ))}
        </g>

        {/* จุดเชื่อมเต้นเป็นจังหวะ */}
        <g fill="#e0f2fe">
          {[...UNIT_TEAM, ...CENTER_UNITS, ...REGION_WEB].map((n, i) => (
            <circle key={`j${i}`} cx={n.x} cy={n.y} r="2.6" className="cn-pulse" style={{ animationDelay: `${(i % 6) * 0.4}s` }} />
          ))}
        </g>

        {/* โหนดสมาชิก: ล่างสุด 1 คน → ทีมเล็ก → หลายทีม → เครือข่ายใหญ่ */}
        {REGION_WEB.map((n, i) => <g key={`rw${i}`}>{node(n, i === 2 ? 'mid' : 'leaf', i)}</g>)}
        {CENTER_UNITS.map((n, i) => <g key={`cu${i}`}>{node(n, 'mid', i)}</g>)}
        {UNIT_TEAM.map((n, i) => <g key={`ut${i}`}>{node(n, 'low', i)}</g>)}
        <g filter="url(#cn-glow-strong)">{node(LEVELS.center, 'top', 0)}</g>
        <g filter="url(#cn-glow-strong)">{node(LEVELS.region, 'top', 2)}</g>
        {node(LEVELS.unit, 'top', 1)}
        {node(LEVELS.agent, 'top', 3)}

        {/* ประกายแสงเล็ก ๆ กระจายทั่วภาพ */}
        <g fill="#fde68a">
          {[
            [120, 520, 1.6], [690, 560, 1.4], [176, 640, 1.2], [640, 660, 1.5],
            [300, 880, 1.3], [508, 872, 1.4], [96, 150, 1.2], [712, 168, 1.3],
            [400, 340, 1.5], [260, 470, 1.2], [548, 452, 1.3], [400, 704, 1.4],
          ].map(([cx, cy, r], i) => (
            <circle key={`sp${i}`} cx={cx} cy={cy} r={r} className="cn-twinkle" style={{ animationDelay: `${(i % 4) * 0.7}s` }} />
          ))}
        </g>
      </svg>
    </figure>
  );
}

const CN_STYLES = `
.cn-wrap { margin: 0; }
.cn-svg { display: block; width: 100%; height: auto; }
.cn-flow { stroke-width: 2.1; stroke-dasharray: 20 14; animation: cn-flow 2.6s linear infinite; }
@keyframes cn-flow { from { stroke-dashoffset: 56; } to { stroke-dashoffset: 0; } }
.cn-node { animation: cn-breathe 4.4s ease-in-out infinite; }
@keyframes cn-breathe { 0%, 100% { opacity: 0.92; } 50% { opacity: 1; } }
.cn-orbit { transform-box: fill-box; transform-origin: center; animation: cn-spin 18s linear infinite; }
@keyframes cn-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
.cn-pulse { animation: cn-pulse 3s ease-in-out infinite; }
@keyframes cn-pulse { 0%, 100% { opacity: 0.25; r: 2.2; } 50% { opacity: 0.95; r: 4; } }
.cn-twinkle { animation: cn-twinkle 3.8s ease-in-out infinite; }
@keyframes cn-twinkle { 0%, 100% { opacity: 0.15; } 50% { opacity: 0.9; } }
@media (prefers-reduced-motion: reduce) {
  .cn-flow, .cn-node, .cn-orbit, .cn-pulse, .cn-twinkle { animation: none; }
}
`;
