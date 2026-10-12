'use client';

/**
 * FinancialFreedomNature3DScene — “อิสรภาพทางการเงินท่ามกลางธรรมชาติ” แบบ 3 มิติ
 * แปลงภาพต้นแบบ (ภาพที่ 1) เป็นฉาก 3 มิติที่หมุน/ซูมได้:
 *   ● ท้องฟ้ายามพระอาทิตย์ตก + พระอาทิตย์ + ทะเลสาบสะท้อนแสง + ภูเขา/เกาะไกล
 *   ● ดาดฟ้าไม้หน้าผา: เก้าอี้ผ้าใบ + คนนั่งพักผ่อนสวมหมวกฟาง · โต๊ะไม้ที่มีแล็ปท็อป แก้วกาแฟ สมุดโน้ต กล้อง
 *   ● ป้ายไม้ 4 ป้าย (More Time / More Choices / Better Life / Financial Freedom)
 *   ● แผ่นคำพูดลอย (ข้อความเดียวกับภาพต้นแบบ) + การ์ด 5 ใบ (คลิกได้)
 * สลับแสง “พระอาทิตย์ตก / กลางวัน” ได้ และปรับเป็นกลางวันแล้วสีท้องฟ้า-น้ำจะเปลี่ยนตาม
 * เป็นฉากเพื่อการสาธิตเท่านั้น (ไม่ใช่ข้อมูลจริง ไม่สื่อถึงรายได้หรือผลตอบแทนใด ๆ)
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { FREEDOM_CARDS, FREEDOM_SIGNS, type FreedomCard } from '@/lib/financialFreedom3d';

export { FREEDOM_CARDS };
export type { FreedomCard };

/* ───────────────────────── ผู้ช่วยวาดข้อความบน canvas ───────────────────────── */

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** ตัดบรรทัดให้พอดีความกว้าง (ภาษาไทยไม่มีเว้นวรรค — ตัดเป็นตัวอักษรถ้าจำเป็น) */
function wrapThai(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  const push = () => { if (cur) { lines.push(cur); cur = ''; } };
  for (const word of words) {
    const trial = cur ? `${cur} ${word}` : word;
    if (ctx.measureText(trial).width <= maxWidth) { cur = trial; continue; }
    if (cur) push();
    if (ctx.measureText(word).width <= maxWidth) { cur = word; continue; }
    let buf = '';
    for (const ch of word) {
      if (ctx.measureText(buf + ch).width > maxWidth) { lines.push(buf); buf = ch; } else buf += ch;
    }
    cur = buf;
    if (lines.length >= maxLines) break;
  }
  push();
  return lines.slice(0, maxLines);
}

function spriteFromCanvas(c: HTMLCanvasElement, width: number) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: toTexture(c), transparent: true, depthWrite: false }));
  sprite.scale.set(width, (width * c.height) / c.width, 1);
  return sprite;
}

/* ───────────────────────── ป้ายไม้บอกทาง 4 ป้าย ───────────────────────── */

const SIGNS = FREEDOM_SIGNS;

function makeSignBoard(label: string) {
  const w = 1024, h = 220;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  // แผ่นไม้
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#8a5a34');
  g.addColorStop(0.5, '#734527');
  g.addColorStop(1, '#5c351d');
  ctx.fillStyle = g;
  roundRect(ctx, 6, 10, w - 12, h - 20, 16);
  ctx.fill();
  // ลายไม้
  ctx.strokeStyle = 'rgba(0,0,0,0.16)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 7; i++) {
    const y = 26 + i * 26;
    ctx.beginPath();
    ctx.moveTo(20, y);
    ctx.bezierCurveTo(w * 0.35, y + 8, w * 0.6, y - 8, w - 20, y);
    ctx.stroke();
  }
  // หัวลูกศรด้านขวา
  ctx.fillStyle = '#5c351d';
  ctx.beginPath();
  ctx.moveTo(w - 12, 10);
  ctx.lineTo(w - 2, h / 2);
  ctx.lineTo(w - 12, h - 10);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#fdf3e3';
  ctx.font = 'bold 88px "Segoe UI",Tahoma,sans-serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(label, (w - 30) / 2, h / 2 + 4);
  return c;
}

/* ───────────────────────── การ์ด 5 ใบ (คลิกได้) ───────────────────────── */

function makeCardTexture(card: FreedomCard, index: number) {
  const w = 800, h = 1000;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, 'rgba(8,25,44,0.94)');
  g.addColorStop(1, 'rgba(12,44,66,0.9)');
  ctx.fillStyle = g;
  roundRect(ctx, 14, 14, w - 28, h - 28, 44);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(251,191,36,0.85)';
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.font = '170px "Segoe UI Emoji","Segoe UI",sans-serif';
  ctx.fillText(card.icon, w / 2, 250);

  ctx.fillStyle = '#fbbf24';
  ctx.font = 'bold 40px "Segoe UI",Tahoma,sans-serif';
  ctx.fillText(card.en.toUpperCase(), w / 2, 360);

  ctx.fillStyle = '#ffffff';
  const lines = wrapThai(ctx, card.th, w - 150, 3);
  const startY = 470;
  lines.forEach((ln, i) => {
    ctx.font = 'bold 71px "Sarabun","Segoe UI",Tahoma,sans-serif';
    ctx.fillText(ln, w / 2, startY + i * 96);
  });

  ctx.font = '34px "Sarabun","Segoe UI",Tahoma,sans-serif';
  ctx.fillStyle = 'rgba(226,232,240,0.85)';
  ctx.fillText(`การ์ดที่ ${index + 1} / ${FREEDOM_CARDS.length}`, w / 2, h - 60);

  return c;
}

/* ───────────────────────── ฉาก: ท้องฟ้า / ทะเลสาบ / ภูเขา ───────────────────────── */

type Palette = {
  top: string; mid: string; bottom: string; sun: string;
  waterDeep: string; waterNear: string; sunPower: number; light: number; fog: string;
};

const SUNSET: Palette = {
  top: '#0d2740', mid: '#ef7f38', bottom: '#ffe1a8', sun: '#fff4d1',
  waterDeep: '#0a3f5e', waterNear: '#176f8b', sunPower: 1, light: 1.05, fog: '#e2a061',
};
const DAY: Palette = {
  top: '#1450c0', mid: '#67bdf0', bottom: '#e2f3ff', sun: '#ffffff',
  waterDeep: '#0d5a8c', waterNear: '#2498c0', sunPower: 0.4, light: 1.55, fog: '#bfe3f7',
};

const SKY_VERT = /* glsl */ `
  varying vec3 vPos;
  void main(){
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SKY_FRAG = /* glsl */ `
  uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uBottom; uniform vec3 uSun;
  uniform float uTime; uniform float uSunPower;
  varying vec3 vPos;
  void main(){
    vec3 dir = normalize(vPos);
    float h = clamp(dir.y * 0.5 + 0.5, 0.0, 1.0);
    vec3 col = mix(uMid, uTop, smoothstep(0.60, 1.0, h));
    col = mix(uTop * 0.72, col, smoothstep(0.44, 0.62, h));
    col = mix(uBottom, col, smoothstep(0.30, 0.50, h));
    // แสงเรืองรอบพระอาทิตย์ (อยู่ทาง -z)
    float sunHalo = pow(max(0.0, dot(dir, normalize(vec3(0.0, 0.16, -1.0)))), 12.0);
    col += uSun * sunHalo * (0.45 * uSunPower + 0.12);
    // เมฆบาง ๆ
    float band = sin(dir.y * 26.0 + uTime * 0.08) * 0.5 + 0.5;
    col += uSun * band * 0.05 * smoothstep(0.5, 0.95, h);
    gl_FragColor = vec4(col, 1.0);
  }
`;

const WATER_VERT = /* glsl */ `
  varying vec3 vWorld;
  void main(){
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const WATER_FRAG = /* glsl */ `
  uniform float uTime; uniform vec3 uDeep; uniform vec3 uNear; uniform vec3 uSun;
  uniform float uSunPower;
  varying vec3 vWorld;
  void main(){
    float d = clamp((-vWorld.z) / 130.0, 0.0, 1.0);
    vec3 col = mix(uNear, uDeep, d);
    float w = sin(vWorld.x * 0.32 + uTime * 0.65) * sin(vWorld.z * 0.26 - uTime * 0.5);
    col += vec3(0.045, 0.07, 0.085) * w;
    // เส้นทางสะท้อนแสงพระอาทิตย์กลางน้ำ
    float path = exp(-abs(vWorld.x) * 0.16) * (1.0 - d * 0.8);
    float glit = smoothstep(0.42, 1.0, (sin(vWorld.z * 1.15 - uTime * 1.7) * 0.5 + 0.5) + w * 0.35);
    col += uSun * path * (0.08 + 0.55 * glit) * (0.45 + uSunPower);
    // ขอบฟ้าจาง
    col = mix(col, mix(uSun, uNear, 0.35), smoothstep(0.72, 1.0, d) * 0.55);
    gl_FragColor = vec4(col, 1.0);
  }
`;

function SunGlow() {
  const tex = useMemo(() => {
    const c = makeCanvas(256, 256);
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, 'rgba(255,244,214,1)');
    g.addColorStop(0.25, 'rgba(255,206,128,0.72)');
    g.addColorStop(0.6, 'rgba(255,160,80,0.22)');
    g.addColorStop(1, 'rgba(255,140,60,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return toTexture(c);
  }, []);
  return (
    <>
      <sprite position={[0, 18, -112]} scale={[30, 30, 1]}>
        <spriteMaterial map={tex} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <mesh position={[0, 18, -116]} renderOrder={-1}>
        <sphereGeometry args={[9, 28, 28]} />
        <meshBasicMaterial color="#fffdf2" toneMapped={false} />
      </mesh>
    </>
  );
}

function Mountains() {
  const peaks = useMemo(() => {
    const out: { x: number; z: number; r: number; h: number; c: string }[] = [];
    const colors = ['#12324a', '#16394f', '#1b4257', '#0f2b3f'];
    for (let i = 0; i < 16; i++) {
      const x = -110 + i * 15 + (i % 3) * 4;
      const z = -140 - (i % 4) * 22;
      out.push({ x, z, r: 16 + (i % 3) * 7, h: 15 + ((i * 7) % 5) * 5, c: colors[i % colors.length] });
    }
    // เนินใกล้กว่า
    for (let i = 0; i < 8; i++) {
      const x = -80 + i * 23;
      out.push({ x, z: -96 - (i % 3) * 12, r: 13 + (i % 2) * 5, h: 10 + ((i * 3) % 4) * 3, c: '#123a4d' });
    }
    return out;
  }, []);
  return (
    <group>
      {peaks.map((p, i) => (
        <mesh key={i} position={[p.x, p.h / 2 - 3, p.z]}>
          <coneGeometry args={[p.r, p.h, 5, 1, false]} />
          <meshStandardMaterial color={p.c} roughness={0.95} metalness={0.05} flatShading />
        </mesh>
      ))}
      {/* เกาะกลางน้ำ */}
      {[[-34, -52], [26, -60], [4, -46], [-12, -70], [44, -48]].map(([x, z], i) => (
        <mesh key={`is${i}`} position={[x, 1.2, z]}>
          <sphereGeometry args={[4 + (i % 3) * 1.4, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#134a4a" roughness={0.9} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Palm({ position, scale = 1, flip = false }: { position: [number, number, number]; scale?: number; flip?: boolean }) {
  return (
    <group position={position} scale={scale} rotation={[0, flip ? 0.6 : -0.6, 0]}>
      <mesh position={[0, 2.6, 0]}>
        <cylinderGeometry args={[0.16, 0.3, 5.2, 8]} />
        <meshStandardMaterial color="#5a3c25" roughness={0.9} />
      </mesh>
      {Array.from({ length: 7 }).map((_, i) => {
        const a = (i / 7) * Math.PI * 2;
        return (
          <mesh
            key={i}
            position={[Math.cos(a) * 1.5, 5.4, Math.sin(a) * 1.5]}
            rotation={[Math.PI * 0.32, a, 0]}
          >
            <boxGeometry args={[3.2, 0.07, 0.75]} />
            <meshStandardMaterial color={i % 2 ? '#15803d' : '#166534'} roughness={0.85} side={THREE.DoubleSide} />
          </mesh>
        );
      })}
    </group>
  );
}

function Fireflies({ paused }: { paused: boolean }) {
  const N = 170;
  const geo = useMemo(() => {
    const arr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 90;
      arr[i * 3 + 1] = 1 + Math.random() * 16;
      arr[i * 3 + 2] = -6 - Math.random() * 70;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  }, []);
  const ref = useRef<THREE.Points>(null);
  useFrame((state) => {
    if (!ref.current || paused) return;
    const t = state.clock.elapsedTime;
    ref.current.position.y = Math.sin(t * 0.35) * 0.6;
    ref.current.rotation.y = t * 0.02;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.45} color="#ffe9b0" transparent opacity={0.6} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

/* ───────────────────────── คนนั่งพักผ่อน (หันหลัง) ───────────────────────── */

function PersonRelaxing() {
  return (
    <group position={[-1.4, 0.3, 1.0]} scale={1.25} rotation={[0, 0.42, 0]}>
      {/* เก้าอี้ผ้าใบ */}
      <group position={[0, 0, 0]}>
        <mesh position={[0, 1.05, 0]}>
          <boxGeometry args={[1.5, 0.16, 1.35]} />
          <meshStandardMaterial color="#1f2937" roughness={0.8} />
        </mesh>
        <mesh position={[0, 1.75, -0.62]} rotation={[-0.22, 0, 0]}>
          <boxGeometry args={[1.5, 1.35, 0.14]} />
          <meshStandardMaterial color="#111827" roughness={0.8} />
        </mesh>
        {[[-0.62, 0.5], [0.62, 0.5], [-0.62, -0.5], [0.62, -0.5]].map(([x, z], i) => (
          <mesh key={i} position={[x, 0.28, z]}>
            <cylinderGeometry args={[0.055, 0.055, 0.9, 6]} />
            <meshStandardMaterial color="#78350f" roughness={0.8} />
          </mesh>
        ))}
      </group>
      {/* ตัวคน (หันหลังให้กล้อง) */}
      <group position={[0, 1.1, 0.05]}>
        {/* ลำตัวเสื้อขาว */}
        <mesh position={[0, 0.75, -0.12]} rotation={[-0.12, 0, 0]}>
          <boxGeometry args={[0.95, 1.2, 0.5]} />
          <meshStandardMaterial color="#f4f4f5" roughness={0.75} />
        </mesh>
        {/* ต้นขา + ขา (กางออกด้านหน้า) */}
        {[-0.28, 0.28].map((x, i) => (
          <group key={i}>
            <mesh position={[x, 0.18, 0.42]} rotation={[Math.PI / 2, 0, 0]}>
              <cylinderGeometry args={[0.19, 0.17, 0.95, 10]} />
              <meshStandardMaterial color="#334155" roughness={0.85} />
            </mesh>
            <mesh position={[x, -0.22, 0.86]}>
              <cylinderGeometry args={[0.15, 0.13, 0.85, 10]} />
              <meshStandardMaterial color="#334155" roughness={0.85} />
            </mesh>
          </group>
        ))}
        {/* แขนสองข้างชูขึ้นประสานท้ายทอย */}
        {[-0.55, 0.55].map((x, i) => (
          <group key={`a${i}`}>
            <mesh position={[x, 0.95, 0.12]} rotation={[0, 0, x > 0 ? -0.35 : 0.35]}>
              <cylinderGeometry args={[0.1, 0.12, 1.05, 8]} />
              <meshStandardMaterial color="#f4f4f5" roughness={0.8} />
            </mesh>
            <mesh position={[x * 0.55, 1.42, -0.16]} rotation={[1.35, 0, x > 0 ? 0.5 : -0.5]}>
              <cylinderGeometry args={[0.09, 0.1, 0.85, 8]} />
              <meshStandardMaterial color="#eab08a" roughness={0.7} />
            </mesh>
          </group>
        ))}
        {/* มือประสานท้ายทอย */}
        <mesh position={[0, 1.52, -0.28]}>
          <sphereGeometry args={[0.2, 12, 10]} />
          <meshStandardMaterial color="#e0a077" roughness={0.7} />
        </mesh>
        {/* คอ + ศีรษะ */}
        <mesh position={[0, 1.42, -0.1]}>
          <cylinderGeometry args={[0.13, 0.15, 0.2, 10]} />
          <meshStandardMaterial color="#e8b48c" roughness={0.7} />
        </mesh>
        <mesh position={[0, 1.6, -0.1]}>
          <sphereGeometry args={[0.26, 16, 14]} />
          <meshStandardMaterial color="#241c17" roughness={0.85} />
        </mesh>
        {/* หมวกฟาง */}
        <mesh position={[0, 1.76, -0.1]}>
          <cylinderGeometry args={[0.27, 0.29, 0.26, 16, 1, true]} />
          <meshStandardMaterial color="#d9b06a" roughness={0.9} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 1.66, -0.1]} rotation={[0.06, 0, 0]}>
          <cylinderGeometry args={[0.62, 0.66, 0.06, 24]} />
          <meshStandardMaterial color="#e3bc75" roughness={0.9} />
        </mesh>
        <mesh position={[0, 1.73, -0.1]}>
          <torusGeometry args={[0.28, 0.035, 6, 20]} />
          <meshStandardMaterial color="#1f2937" roughness={0.8} />
        </mesh>
        {/* นาฬิกาข้อมือ */}
        <mesh position={[-0.72, 1.02, 0.1]} rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[0.09, 0.09, 0.06, 12]} />
          <meshStandardMaterial color="#0f172a" metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
    </group>
  );
}

/* ───────────────────────── โต๊ะไม้ + ของบนโต๊ะ ───────────────────────── */

function DeckAndProps({ paused }: { paused: boolean }) {
  const screenGlow = useRef<THREE.PointLight>(null);
  useFrame((state) => {
    if (screenGlow.current && !paused) {
      screenGlow.current.intensity = 9 + Math.sin(state.clock.elapsedTime * 2.1) * 1.6;
    }
  });

  const noteTex = useMemo(() => {
    const c = makeCanvas(420, 300);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fdfdf7';
    ctx.fillRect(0, 0, 420, 300);
    ctx.fillStyle = '#334155';
    ctx.font = 'bold 34px "Segoe UI",Tahoma,sans-serif';
    ['Plan', 'Save', 'Invest', 'Live Freely'].forEach((t, i) => ctx.fillText(t, 34, 70 + i * 52));
    ctx.fillStyle = '#e11d48';
    ctx.font = '30px "Segoe UI",sans-serif';
    ctx.fillText('♥', 34, 282);
    return toTexture(c);
  }, []);

  const mugTex = useMemo(() => {
    const c = makeCanvas(300, 300);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, 300, 300);
    ctx.fillStyle = '#1e293b';
    ctx.font = 'bold 46px "Segoe UI",Tahoma,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Good', 150, 100);
    ctx.fillText('Choices', 150, 155);
    ctx.fillText('= Freedom', 150, 215);
    return toTexture(c);
  }, []);

  return (
    <group>
      {/* ดาดฟ้าไม้ */}
      <mesh position={[0, 0, 6.5]} receiveShadow>
        <boxGeometry args={[34, 0.6, 15]} />
        <meshStandardMaterial color="#8a5a34" roughness={0.9} />
      </mesh>
      {/* แผ่นไม้ปิดขอบ */}
      {[-0.9, -1.8].map((z, i) => (
        <mesh key={i} position={[0, 0.02, z]}>
          <boxGeometry args={[34, 0.5, 0.35]} />
          <meshStandardMaterial color={i % 2 ? '#6f4526' : '#7c4d2a'} roughness={0.9} />
        </mesh>
      ))}
      {/* โต๊ะไม้ (ด้านขวา) */}
      <mesh position={[5.4, 1.35, 3.4]}>
        <boxGeometry args={[7.6, 0.35, 3.6]} />
        <meshStandardMaterial color="#9a6b40" roughness={0.85} />
      </mesh>
      {[[3, 2], [8, 2], [3, 5], [8, 5]].map(([x, z], i) => (
        <mesh key={`tl${i}`} position={[x, 0.6, z - 1.6]}>
          <boxGeometry args={[0.3, 1.2, 0.3]} />
          <meshStandardMaterial color="#6f4526" roughness={0.9} />
        </mesh>
      ))}

      {/* แล็ปท็อป */}
      <group position={[6.6, 1.55, 3.2]} rotation={[0, -0.35, 0]}>
        <mesh position={[0, 0.07, 0]}>
          <boxGeometry args={[2.6, 0.12, 1.7]} />
          <meshStandardMaterial color="#3f4652" metalness={0.5} roughness={0.4} />
        </mesh>
        <mesh position={[0, 0.75, -0.82]} rotation={[-0.35, 0, 0]}>
          <boxGeometry args={[2.6, 1.6, 0.1]} />
          <meshStandardMaterial color="#334155" metalness={0.4} roughness={0.45} />
        </mesh>
        <mesh position={[0, 0.76, -0.77]} rotation={[-0.35, 0, 0]}>
          <planeGeometry args={[2.35, 1.4]} />
          <meshBasicMaterial color="#c7f0ff" toneMapped={false} />
        </mesh>
        <pointLight ref={screenGlow} position={[0, 0.9, -0.4]} intensity={10} distance={9} color="#bfe9ff" />
      </group>

      {/* แก้วกาแฟ */}
      <group position={[3.6, 1.55, 3.1]}>
        <mesh position={[0, 0.42, 0]}>
          <cylinderGeometry args={[0.42, 0.36, 0.84, 20, 1, true]} />
          <meshStandardMaterial map={mugTex} color="#f8fafc" roughness={0.5} side={THREE.DoubleSide} />
        </mesh>
        <mesh position={[0, 0.42, 0]}>
          <cylinderGeometry args={[0.42, 0.36, 0.84, 20]} />
          <meshStandardMaterial map={mugTex} color="#f8fafc" roughness={0.5} />
        </mesh>
        <mesh position={[0.55, 0.45, 0]} rotation={[0, 0, Math.PI / 2]}>
          <torusGeometry args={[0.24, 0.06, 8, 18]} />
          <meshStandardMaterial color="#f1f5f9" roughness={0.5} />
        </mesh>
      </group>

      {/* สมุดโน้ต */}
      <mesh position={[3.1, 1.58, 4.4]} rotation={[-Math.PI / 2, 0, 0.16]}>
        <planeGeometry args={[2.8, 2]} />
        <meshStandardMaterial map={noteTex} roughness={0.8} />
      </mesh>

      {/* กล้อง */}
      <group position={[0.4, 1.6, 4.6]} rotation={[0, 0.5, 0]}>
        <mesh>
          <boxGeometry args={[1.5, 1, 0.75]} />
          <meshStandardMaterial color="#0f172a" roughness={0.6} metalness={0.35} />
        </mesh>
        <mesh position={[0, 0, 0.5]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.34, 0.38, 0.5, 18]} />
          <meshStandardMaterial color="#1e293b" metalness={0.6} roughness={0.3} />
        </mesh>
        <mesh position={[0, 0, 0.78]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.22, 0.22, 0.06, 18]} />
          <meshStandardMaterial color="#38bdf8" metalness={0.8} roughness={0.15} />
        </mesh>
      </group>
    </group>
  );
}

/* ───────────────────────── ป้ายไม้บอกทาง + การ์ด 5 ใบ ───────────────────────── */

function SignPost() {
  const boards = useMemo(() => SIGNS.map((s) => spriteFromCanvas(makeSignBoard(s), 4.1)), []);
  useEffect(() => () => boards.forEach((b) => { b.material.map?.dispose(); b.material.dispose(); }), [boards]);
  return (
    <group position={[-9.6, 0, 3.4]}>
      {/* เสาป้าย */}
      <mesh position={[0, 3.4, 0]}>
        <cylinderGeometry args={[0.22, 0.26, 7.2, 10]} />
        <meshStandardMaterial color="#4a2f1a" roughness={0.95} />
      </mesh>
      {/* หลังคาป้าย */}
      <mesh position={[0, 7.05, 0]}>
        <boxGeometry args={[0.4, 0.3, 1.2]} />
        <meshStandardMaterial color="#3f2a16" roughness={0.95} />
      </mesh>
      {boards.map((b, i) => (
        <primitive key={i} object={b} position={[2.45, 5.5 - i * 1.3, 0.34 + (i % 2) * 0.05]} />
      ))}
      {/* กองหิน/พุ่มไม้รอบโคนเสา */}
      {[-1.1, 1.2, 0.2].map((x, i) => (
        <mesh key={`b${i}`} position={[x, 0.25, 0.55 - i * 0.45]}>
          <sphereGeometry args={[0.32 + i * 0.06, 10, 8]} />
          <meshStandardMaterial color="#274a35" roughness={0.95} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function CardsRow({
  cards, selected, onSelect, paused,
}: {
  cards: FreedomCard[];
  selected: number | null;
  onSelect: (i: number | null) => void;
  paused: boolean;
}) {
  const textures = useMemo(
    () => cards.map((card, i) => toTexture(makeCardTexture(card, i))),
    [cards],
  );
  const group = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  useFrame((state) => {
    if (!group.current) return;
    const t = state.clock.elapsedTime;
    if (!paused) {
      cards.forEach((_, i) => {
        const child = group.current!.children[i];
        if (child) child.position.y = 5.7 + Math.sin(t * 0.9 + i * 0.7) * 0.3;
      });
    }
    group.current.rotation.y = Math.sin(t * 0.12) * 0.07;
  });

  return (
    <group ref={group} position={[0, 5.7, -5]}>
      {cards.map((card, i) => {
        const x = (i - (cards.length - 1) / 2) * 5.1;
        const active = selected === i;
        return (
          <group key={card.th} position={[x, 0, active ? 1.6 : 0]}>
            <mesh
              onClick={(e) => { e.stopPropagation(); onSelect(active ? null : i); }}
              onPointerOver={(e) => { e.stopPropagation(); setHovered(i); document.body.style.cursor = 'pointer'; }}
              onPointerOut={() => { setHovered(null); document.body.style.cursor = 'auto'; }}
            >
              <planeGeometry args={[active ? 4.1 : 3.6, active ? 5.1 : 4.5]} />
              <meshBasicMaterial
                map={textures[i]}
                transparent
                opacity={selected === null || active ? 1 : 0.55}
                side={THREE.DoubleSide}
                toneMapped={false}
              />
            </mesh>
            {(hovered === i || active) && (
              <mesh position={[0, 0, -0.05]}>
                <planeGeometry args={[4.4, 5.4]} />
                <meshBasicMaterial color="#fbbf24" transparent opacity={0.22} blending={THREE.AdditiveBlending} />
              </mesh>
            )}
          </group>
        );
      })}
    </group>
  );
}

/* ───────────────────────── ฉากหลัก ───────────────────────── */

export type FinancialFreedomNature3DSceneProps = {
  cards: FreedomCard[];
  selected: number | null;
  onSelect: (i: number | null) => void;
  paused: boolean;
  autoRotate: boolean;
  /** 0 = พระอาทิตย์ตก, 1 = กลางวัน */
  daylight: number;
};

function Scene({ cards, selected, onSelect, paused, autoRotate, daylight }: FinancialFreedomNature3DSceneProps) {
  const skyMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTop: { value: new THREE.Color(SUNSET.top) },
      uMid: { value: new THREE.Color(SUNSET.mid) },
      uBottom: { value: new THREE.Color(SUNSET.bottom) },
      uSun: { value: new THREE.Color(SUNSET.sun) },
      uTime: { value: 0 },
      uSunPower: { value: SUNSET.sunPower },
    },
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
  }), []);

  const waterMat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDeep: { value: new THREE.Color(SUNSET.waterDeep) },
      uNear: { value: new THREE.Color(SUNSET.waterNear) },
      uSun: { value: new THREE.Color(SUNSET.sun) },
      uSunPower: { value: SUNSET.sunPower },
    },
    vertexShader: WATER_VERT,
    fragmentShader: WATER_FRAG,
  }), []);

  const fogRef = useRef<THREE.Fog>(null);
  const sunLight = useRef<THREE.DirectionalLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);

  // ค่าสีปัจจุบัน (ค่อย ๆ ไล่ไปหาค่าที่ต้องการ)
  const cur = useMemo(() => ({
    top: new THREE.Color(SUNSET.top), mid: new THREE.Color(SUNSET.mid), bottom: new THREE.Color(SUNSET.bottom),
    sun: new THREE.Color(SUNSET.sun), deep: new THREE.Color(SUNSET.waterDeep), near: new THREE.Color(SUNSET.waterNear),
    light: SUNSET.light, sunPower: SUNSET.sunPower, fog: new THREE.Color(SUNSET.fog),
  }), []);

  const target = useMemo(() => ({
    top: new THREE.Color(), mid: new THREE.Color(), bottom: new THREE.Color(), sun: new THREE.Color(),
    deep: new THREE.Color(), near: new THREE.Color(), fog: new THREE.Color(),
  }), []);

  useEffect(() => () => {
    skyMat.dispose();
    waterMat.dispose();
  }, [skyMat, waterMat]);

  useFrame((state, dt) => {
    const k = Math.min(1, dt * 1.6);
    const p = daylight > 0.5 ? DAY : SUNSET;
    target.top.set(p.top); target.mid.set(p.mid); target.bottom.set(p.bottom); target.sun.set(p.sun);
    target.deep.set(p.waterDeep); target.near.set(p.waterNear); target.fog.set(p.fog);

    cur.top.lerp(target.top, k); cur.mid.lerp(target.mid, k); cur.bottom.lerp(target.bottom, k);
    cur.sun.lerp(target.sun, k); cur.deep.lerp(target.deep, k); cur.near.lerp(target.near, k);
    cur.light += (p.light - cur.light) * k;
    cur.sunPower += (p.sunPower - cur.sunPower) * k;
    cur.fog.lerp(target.fog, k);

    (skyMat.uniforms.uTop.value as THREE.Color).copy(cur.top);
    (skyMat.uniforms.uMid.value as THREE.Color).copy(cur.mid);
    (skyMat.uniforms.uBottom.value as THREE.Color).copy(cur.bottom);
    (skyMat.uniforms.uSun.value as THREE.Color).copy(cur.sun);
    skyMat.uniforms.uSunPower.value = cur.sunPower;
    skyMat.uniforms.uTime.value = state.clock.elapsedTime;

    (waterMat.uniforms.uDeep.value as THREE.Color).copy(cur.deep);
    (waterMat.uniforms.uNear.value as THREE.Color).copy(cur.near);
    (waterMat.uniforms.uSun.value as THREE.Color).copy(cur.sun);
    waterMat.uniforms.uSunPower.value = cur.sunPower;
    waterMat.uniforms.uTime.value = state.clock.elapsedTime;

    if (fogRef.current) fogRef.current.color.copy(cur.fog);
    if (sunLight.current) {
      sunLight.current.intensity = cur.light * 1.35;
      sunLight.current.position.set(0, 24 + cur.sunPower * 10, -60);
    }
    if (ambient.current) ambient.current.intensity = 0.35 + cur.sunPower * 0.3;
  });

  return (
    <>
      {/* ท้องฟ้า + ทะเลสาบ */}
      <mesh>
        <sphereGeometry args={[420, 32, 24]} />
        <primitive object={skyMat} attach="material" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.6, -40]}>
        <planeGeometry args={[900, 620, 1, 1]} />
        <primitive object={waterMat} attach="material" />
      </mesh>

      <fog ref={fogRef} attach="fog" args={[SUNSET.fog, 40, 300]} />
      <ambientLight ref={ambient} intensity={0.6} />
      <directionalLight ref={sunLight} position={[0, 26, -60]} intensity={1.35} color="#ffd9a0" />
      <hemisphereLight args={['#ffd9a0', '#0b3a4a', 0.5]} />

      <SunGlow />
      <Mountains />
      <Fireflies paused={paused} />

      {/* ต้นปาล์มขอบฉาก */}
      <Palm position={[-15, 1.6, -2]} scale={1.15} />
      <Palm position={[-12.4, 1.6, -6]} scale={0.85} flip />
      <Palm position={[16, 1.6, -4]} scale={1.05} flip />
      <Palm position={[13, 1.6, 1]} scale={0.8} />

      <DeckAndProps paused={paused} />
      <PersonRelaxing />
      <SignPost />
      <CardsRow cards={cards} selected={selected} onSelect={onSelect} paused={paused} />

      {/* หมายเหตุ: ข้อความคำพูดจากภาพต้นแบบ ย้ายไปแสดงเป็นข้อความ HTML เหนือฉาก (อ่านชัด และไม่บังการ์ด 5 ใบ) */}

      <OrbitControls
        enableDamping
        dampingFactor={0.07}
        enablePan={false}
        autoRotate={autoRotate && !paused}
        autoRotateSpeed={0.45}
        minDistance={12}
        maxDistance={62}
        minPolarAngle={0.45}
        maxPolarAngle={1.53}
        target={[0, 5.6, -1]}
      />
    </>
  );
}

export default function FinancialFreedomNature3DScene(props: FinancialFreedomNature3DSceneProps) {
  return (
    <Canvas
      camera={{ fov: 46, near: 0.1, far: 2400, position: [4, 12.5, 30] }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
      dpr={[1, 1.7]}
      onCreated={({ gl }) => gl.setClearColor(new THREE.Color('#0d2740'), 1)}
      onPointerMissed={() => props.onSelect(null)}
      style={{ touchAction: 'none' }}
      className="h-full w-full"
    >
      <Scene {...props} />
    </Canvas>
  );
}
