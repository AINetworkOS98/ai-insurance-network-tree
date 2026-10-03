'use client';

/**
 * CosmicNetworkScene — ฉากจักรวาลเครือข่าย 3 มิติ (three.js + @react-three/fiber)
 *
 * ● ข้อมูลในฉากเป็น **ข้อมูลจำลองเพื่อสาธิตโครงสร้างเครือข่าย 1 แตก 5** เท่านั้น
 *   ไม่ใช่ข้อมูลสมาชิกจริง ไม่มีตัวเลขรายได้/ค่าคอมมิชชั่น/ผลตอบแทนใด ๆ
 * ● คอมโพเนนต์นี้รับ props เข้ามาเท่านั้น (ไม่ fetch API) และไม่เขียนข้อมูลลงฐานข้อมูล
 * ● ประสิทธิภาพ: THREE.Points + InstancedMesh + shader บน GPU (ไม่สร้าง Mesh แยกต่อโหนด)
 *   ค่าเริ่มต้น 781 โหนด ≈ 25,000 จุด · กาแล็กซี/ดาว/ฝุ่น สร้างครั้งเดียวแล้วอยู่นิ่ง
 */

import { useEffect, useMemo, useRef } from 'react';
import type { ComponentRef, MutableRefObject } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { levelStyle, mulberry32, type CosmicNetworkModel, type CosmicNode, type Rng } from '@/lib/cosmicNetwork';

/* ─────────────────────────── Types ─────────────────────────── */

export type SceneStats = { activeEnergy: number; fps: number; quality: 'high' | 'low' };

export type SceneApi = {
  resetView: () => void;
  focusRoot: () => void;
  focusNode: (id: number) => void;
  zoom: (factor: number) => void;
  spawnBurst: (id: number) => void;
};

export type LabelState = {
  root: { x: number; y: number; visible: boolean };
  sel: { x: number; y: number; visible: boolean };
  ready: boolean;
};

export type CosmicSceneProps = {
  model: CosmicNetworkModel;
  selectedId: number | null;
  paused: boolean;
  autoRotate: boolean;
  addMode: boolean;
  quality: 'high' | 'low';
  onSelect: (id: number | null) => void;
  onFocus: (id: number) => void;
  onStats: (s: SceneStats) => void;
  onCometPass: () => void;
  onUserInteract: () => void;
  apiRef: MutableRefObject<SceneApi | null>;
  labelRef: MutableRefObject<LabelState>;
};

/* ─────────────────────────── Constants ─────────────────────────── */

const DEFAULT_DIST = 76;
const DEFAULT_PHI = 1.15;
const DEFAULT_THETA = 0.6;
const MAX_DIST = 1400;
const MIN_DIST = 4;
const ADDITIVE = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending } as const;

type FxRef = MutableRefObject<{ target: THREE.Vector3; from: THREE.Vector3; start: number; active: number }>;
type OrbitControlsRef = ComponentRef<typeof OrbitControls>;

/* ─────────────────────────── Textures ─────────────────────────── */

function softGlowTexture(): THREE.Texture {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(224,246,255,0.7)');
  g.addColorStop(0.48, 'rgba(140,200,255,0.2)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function nebulaTexture(): THREE.Texture {
  const s = 256;
  const c = document.createElement('canvas');
  c.width = s;
  c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, s, s);
  ctx.globalCompositeOperation = 'lighter';
  const rng = mulberry32(778811);
  for (let i = 0; i < 26; i++) {
    const r = 26 + rng() * 74;
    const x = s / 2 + (rng() - 0.5) * 120;
    const y = s / 2 + (rng() - 0.5) * 120;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255,255,255,${(0.1 + rng() * 0.1).toFixed(3)})`);
    g.addColorStop(0.55, `rgba(255,255,255,${(0.03 + rng() * 0.05).toFixed(3)})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function gauss(rng: Rng): number {
  return (rng() + rng() + rng() - 1.5) * 1.1547;
}

/* ─────────────────────────── Shaders ─────────────────────────── */

const NODE_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aPhase;
attribute float aBirth;
attribute float aId;
uniform float uTime;
uniform float uScale;
uniform float uHover;
uniform float uSel;
uniform float uBoost;
varying vec3 vColor;
varying float vPulse;
varying float vHi;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float age = uTime - aBirth;
  float appear = aBirth < -100.0 ? 1.0 : clamp(age / 1.7, 0.0, 1.0);
  appear = appear * appear * (3.0 - 2.0 * appear);
  float isHi = step(abs(aId - uHover), 0.5);
  float isSel = step(abs(aId - uSel), 0.5);
  float pulse = 0.86 + 0.14 * sin(uTime * 1.7 + aPhase);
  float grow = 1.0 + 1.25 * isSel + 0.45 * isHi;
  gl_PointSize = clamp(aSize * uBoost * pulse * appear * grow * uScale / max(-mv.z, 0.001), 2.4, 170.0);
  gl_Position = projectionMatrix * mv;
  vColor = aColor * (1.0 + 1.35 * isSel + 0.55 * isHi);
  vPulse = pulse;
  vHi = max(isSel, isHi * 0.75);
}`;

const NODE_FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vColor;
varying float vPulse;
varying float vHi;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float core = smoothstep(0.5, 0.0, d);
  float hot = pow(core, 6.0);
  float halo = pow(core, 1.7) * 0.42;
  float ring = smoothstep(0.10, 0.0, abs(d - 0.36)) * (0.15 + 0.12 * sin(uTime * 1.6));
  float a = hot * 1.45 + halo + ring + vHi * (halo * 1.7 + 0.22);
  vec3 col = vColor * (0.80 + 0.50 * vPulse) + vec3(1.0) * hot * 1.5;
  col += vec3(0.70, 0.90, 1.0) * vHi * 0.45;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}`;

const EDGE_VERT = /* glsl */ `
attribute float aT;
attribute float aPhase;
attribute vec3 aColor;
attribute float aHi;
attribute float aBirth;
attribute float aLevel;
uniform float uTime;
uniform float uFlowSpeed;
uniform float uIntensity;
varying vec3 vColor;
varying float vA;
void main() {
  float age = uTime - aBirth;
  float vis = aBirth < -100.0 ? 1.0 : clamp(age / 1.2, 0.0, 1.0);
  float p = fract(uTime * uFlowSpeed + aPhase);
  float d = p - aT;
  float pulse = exp(-(d * d) / 0.0072);
  float base = 0.05 + 0.28 * aHi;
  float a = (base + (0.40 + 0.50 * aHi) * pulse) * vis * uIntensity;
  a *= aLevel >= 4.0 ? 0.72 : 1.0;
  vA = a;
  vColor = aColor + vec3(0.55) * aHi;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const EDGE_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vA;
void main() {
  gl_FragColor = vec4(vColor, clamp(vA, 0.0, 1.0));
}`;

const FLOW_VERT = /* glsl */ `
attribute vec3 aEnd;
attribute vec3 aColor;
attribute float aOffset;
attribute float aSpeed;
attribute float aHi;
uniform float uTime;
uniform float uScale;
uniform float uSpeedScale;
varying vec3 vColor;
varying float vA;
void main() {
  float t = fract(aOffset + uTime * aSpeed * uSpeedScale);
  vec3 p = mix(position, aEnd, t);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float sz = (1.9 + 3.4 * aHi) * (0.7 + 0.6 * t);
  gl_PointSize = clamp(sz * uScale / max(-mv.z, 0.001), 1.4, 28.0);
  gl_Position = projectionMatrix * mv;
  float fade = smoothstep(0.0, 0.12, t) * (1.0 - smoothstep(0.86, 1.0, t));
  vA = (0.30 + 0.70 * aHi) * (0.3 + 0.7 * fade);
  vColor = mix(aColor, vec3(1.0), 0.30 + 0.35 * aHi);
}`;

const FLOW_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float g = pow(smoothstep(0.5, 0.0, d), 2.0);
  gl_FragColor = vec4(vColor, g * vA);
}`;

const CORE_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aPhase;
uniform float uTime;
varying vec3 vC;
varying vec3 vN;
varying vec3 vV;
varying float vP;
void main() {
  float pulse = 0.92 + 0.08 * sin(uTime * 1.9 + aPhase);
  vec4 world = modelMatrix * instanceMatrix * vec4(position * pulse, 1.0);
  vC = aColor;
  vN = normalize(mat3(instanceMatrix) * normal);
  vV = normalize(cameraPosition - world.xyz);
  vP = pulse;
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const CORE_FRAG = /* glsl */ `
varying vec3 vC;
varying vec3 vN;
varying vec3 vV;
varying float vP;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
  float a = (0.14 + 0.9 * f) * vP;
  vec3 col = vC * (0.55 + 1.7 * f) * vP;
  gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));
}`;

const STAR_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uScale;
uniform float uBright;
varying vec3 vColor;
varying float vTw;
void main() {
  float tw = 0.55 + 0.45 * sin(uTime * (0.55 + aPhase * 0.5) + aPhase * 6.2831);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.001), 0.7, 7.0);
  gl_Position = projectionMatrix * mv;
  vColor = aColor;
  vTw = tw * uBright;
}`;

const STAR_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vTw;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = pow(smoothstep(0.5, 0.0, d), 2.3) * vTw;
  gl_FragColor = vec4(vColor, a);
}`;

const DUST_VERT = /* glsl */ `
attribute vec3 aColor;
attribute float aSize;
attribute float aPhase;
attribute float aDrift;
uniform float uTime;
uniform float uScale;
varying vec3 vColor;
varying float vA;
void main() {
  vec3 p = position;
  p.x += sin(uTime * 0.05 + aPhase * 9.0) * aDrift;
  p.y += cos(uTime * 0.042 + aPhase * 7.0) * aDrift;
  p.z += sin(uTime * 0.037 + aPhase * 5.0) * aDrift;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.001), 1.0, 14.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.5 + 0.5 * sin(uTime * 0.4 + aPhase * 12.0);
  vColor = aColor;
  vA = 0.09 + 0.2 * tw;
}`;

const DUST_FRAG = /* glsl */ `
varying vec3 vColor;
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = pow(smoothstep(0.5, 0.0, d), 1.8) * vA;
  gl_FragColor = vec4(vColor, a);
}`;

const WAVE_VERT = /* glsl */ `
varying float vR;
void main() {
  vR = length(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const WAVE_FRAG = /* glsl */ `
uniform float uR;
uniform float uOpacity;
varying float vR;
void main() {
  float band = smoothstep(0.055, 0.0, abs(vR - uR));
  float a = band * uOpacity;
  if (a <= 0.001) discard;
  gl_FragColor = vec4(vec3(0.52, 0.84, 1.0), a);
}`;

const BEAM_VERT = /* glsl */ `
attribute float aT;
uniform vec3 uFrom;
uniform vec3 uTo;
uniform float uTime;
uniform float uStart;
uniform float uActive;
varying vec3 vColor;
varying float vA;
void main() {
  vec3 p = mix(uFrom, uTo, aT);
  float age = max(uTime - uStart, 0.0);
  float fade = clamp(age / 1.6, 0.0, 1.0);
  float pulse = exp(-pow((fract(age * 0.85) - aT) / 0.16, 2.0));
  vA = uActive * (1.0 - fade) * (0.22 + 0.78 * pulse);
  vColor = vec3(0.70, 0.94, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;

const BURST_VERT = /* glsl */ `
attribute vec3 aDir;
attribute float aR;
attribute float aPhase;
uniform vec3 uTarget;
uniform float uTime;
uniform float uStart;
uniform float uActive;
uniform float uScale;
varying float vA;
void main() {
  float age = max(uTime - uStart, 0.0);
  float p = clamp(age / 1.7, 0.0, 1.0);
  float e = 1.0 - p;
  vec4 mv = modelViewMatrix * vec4(uTarget + aDir * (aR * e * e), 1.0);
  gl_PointSize = clamp((2.2 + 2.8 * aPhase) * uScale / max(-mv.z, 0.001), 1.2, 22.0);
  gl_Position = projectionMatrix * mv;
  vA = uActive * e * (0.3 + 0.7 * aPhase);
}`;

const BURST_FRAG = /* glsl */ `
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float g = pow(smoothstep(0.5, 0.0, d), 2.0);
  gl_FragColor = vec4(mix(vec3(0.55, 0.85, 1.0), vec3(1.0), g), g * vA);
}`;

const SEL_VERT = /* glsl */ `
uniform float uTime;
uniform float uRadius;
varying vec3 vN;
varying vec3 vV;
void main() {
  float pulse = 0.94 + 0.06 * sin(uTime * 2.2);
  vec4 world = modelMatrix * vec4(position * pulse * uRadius, 1.0);
  vN = normalize(normal);
  vV = normalize(cameraPosition - world.xyz);
  gl_Position = projectionMatrix * viewMatrix * world;
}`;

const SEL_FRAG = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
void main() {
  float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.9);
  vec3 col = mix(vec3(0.55, 0.85, 1.0), vec3(1.0), f);
  gl_FragColor = vec4(col, clamp(0.12 + 0.85 * f, 0.0, 1.0));
}`;

const COMET_VERT = /* glsl */ `
attribute float aSize;
uniform float uScale;
varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = clamp(aSize * uScale / max(-mv.z, 0.001), 3.0, 60.0);
  gl_Position = projectionMatrix * mv;
  vA = 1.0;
}`;

const COMET_FRAG = /* glsl */ `
varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float core = pow(smoothstep(0.5, 0.0, d), 3.0);
  float halo = pow(smoothstep(0.5, 0.0, d), 1.2) * 0.4;
  gl_FragColor = vec4(mix(vec3(0.7, 0.9, 1.0), vec3(1.0), core), (core + halo) * vA);
}`;

/* ─────────────────────────── Geometry builders ─────────────────────────── */

function buildNodeGeometry(model: CosmicNetworkModel, epochMs: number): THREE.BufferGeometry {
  const n = model.nodes.length;
  const pos = new Float32Array(n * 3);
  const col = new Float32Array(n * 3);
  const size = new Float32Array(n);
  const phase = new Float32Array(n);
  const birth = new Float32Array(n);
  const id = new Float32Array(n);
  model.nodes.forEach((node, i) => {
    pos[i * 3] = node.position[0];
    pos[i * 3 + 1] = node.position[1];
    pos[i * 3 + 2] = node.position[2];
    const st = levelStyle(node.level);
    col[i * 3] = st.color[0] / 255;
    col[i * 3 + 1] = st.color[1] / 255;
    col[i * 3 + 2] = st.color[2] / 255;
    size[i] = node.size;
    phase[i] = node.phase;
    birth[i] = node.bornAt > 0 ? (node.bornAt - epochMs) / 1000 : -1000;
    id[i] = node.id;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  g.setAttribute('aBirth', new THREE.BufferAttribute(birth, 1));
  g.setAttribute('aId', new THREE.BufferAttribute(id, 1));
  return g;
}

function buildEdgeGeometry(model: CosmicNetworkModel, epochMs: number): THREE.BufferGeometry {
  const e = model.edges.length;
  const pos = new Float32Array(e * 6);
  const t = new Float32Array(e * 2);
  const col = new Float32Array(e * 6);
  const phase = new Float32Array(e * 2);
  const hi = new Float32Array(e * 2);
  const birth = new Float32Array(e * 2);
  const level = new Float32Array(e * 2);
  model.edges.forEach((edge, i) => {
    const p = model.nodes[edge.parentId];
    const c = model.nodes[edge.childId];
    pos[i * 6] = p.position[0];
    pos[i * 6 + 1] = p.position[1];
    pos[i * 6 + 2] = p.position[2];
    pos[i * 6 + 3] = c.position[0];
    pos[i * 6 + 4] = c.position[1];
    pos[i * 6 + 5] = c.position[2];
    t[i * 2] = 0;
    t[i * 2 + 1] = 1;
    const st = levelStyle(c.level);
    for (let k = 0; k < 2; k++) {
      col[i * 6 + k * 3] = st.color[0] / 255;
      col[i * 6 + k * 3 + 1] = st.color[1] / 255;
      col[i * 6 + k * 3 + 2] = st.color[2] / 255;
      phase[i * 2 + k] = ((c.id * 37 + k * 11) % 1000) / 1000;
      birth[i * 2 + k] = c.bornAt > 0 ? (c.bornAt - epochMs) / 1000 : -1000;
      level[i * 2 + k] = c.level;
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aT', new THREE.BufferAttribute(t, 1));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  g.setAttribute('aHi', new THREE.BufferAttribute(hi, 1));
  g.setAttribute('aBirth', new THREE.BufferAttribute(birth, 1));
  g.setAttribute('aLevel', new THREE.BufferAttribute(level, 1));
  return g;
}

function buildFlowGeometry(model: CosmicNetworkModel): THREE.BufferGeometry {
  const e = model.edges.length;
  const per = 2;
  const count = e * per;
  const pos = new Float32Array(count * 3);
  const end = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const off = new Float32Array(count);
  const spd = new Float32Array(count);
  const hi = new Float32Array(count);
  let k = 0;
  model.edges.forEach((edge) => {
    const p = model.nodes[edge.parentId];
    const c = model.nodes[edge.childId];
    const st = levelStyle(c.level);
    for (let j = 0; j < per; j++) {
      pos[k * 3] = p.position[0];
      pos[k * 3 + 1] = p.position[1];
      pos[k * 3 + 2] = p.position[2];
      end[k * 3] = c.position[0];
      end[k * 3 + 1] = c.position[1];
      end[k * 3 + 2] = c.position[2];
      col[k * 3] = st.color[0] / 255;
      col[k * 3 + 1] = st.color[1] / 255;
      col[k * 3 + 2] = st.color[2] / 255;
      off[k] = (j / per + ((c.id * 53) % 97) / 97) % 1;
      spd[k] = 0.1 + ((c.id * 29) % 13) / 60;
      hi[k] = 0;
      k++;
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aEnd', new THREE.BufferAttribute(end, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aOffset', new THREE.BufferAttribute(off, 1));
  g.setAttribute('aSpeed', new THREE.BufferAttribute(spd, 1));
  g.setAttribute('aHi', new THREE.BufferAttribute(hi, 1));
  return g;
}

function buildStarGeometry(count: number, rMin: number, rMax: number, sizeMin: number, sizeMax: number, palette: number[][], seed: number) {
  const rng = mulberry32(seed);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const u = rng() * 2 - 1;
    const th = rng() * Math.PI * 2;
    const r = rMin + Math.pow(rng(), 0.65) * (rMax - rMin);
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    pos[i * 3] = Math.cos(th) * s * r;
    pos[i * 3 + 1] = u * r * 0.82;
    pos[i * 3 + 2] = Math.sin(th) * s * r;
    const c = palette[Math.floor(rng() * palette.length)];
    col[i * 3] = c[0];
    col[i * 3 + 1] = c[1];
    col[i * 3 + 2] = c[2];
    size[i] = sizeMin + rng() * (sizeMax - sizeMin);
    phase[i] = rng();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  return g;
}

function buildDustGeometry(count: number, seed: number) {
  const rng = mulberry32(seed);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  const drift = new Float32Array(count);
  const palette = [
    [0.42, 0.72, 1.0],
    [0.62, 0.55, 1.0],
    [0.85, 0.92, 1.0],
    [0.35, 0.85, 0.95],
  ];
  for (let i = 0; i < count; i++) {
    const u = rng() * 2 - 1;
    const th = rng() * Math.PI * 2;
    const r = 40 + Math.pow(rng(), 0.55) * 620;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    pos[i * 3] = Math.cos(th) * s * r;
    pos[i * 3 + 1] = u * r;
    pos[i * 3 + 2] = Math.sin(th) * s * r;
    const c = palette[Math.floor(rng() * palette.length)];
    col[i * 3] = c[0];
    col[i * 3 + 1] = c[1];
    col[i * 3 + 2] = c[2];
    size[i] = 2.5 + rng() * 7.5;
    phase[i] = rng();
    drift[i] = 3 + rng() * 16;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  g.setAttribute('aDrift', new THREE.BufferAttribute(drift, 1));
  return g;
}

function buildGalaxyGeometry(count: number, seed: number) {
  const rng = mulberry32(seed);
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const phase = new Float32Array(count);
  const R = 320;
  for (let i = 0; i < count; i++) {
    const t = Math.pow(rng(), 0.52);
    const r = 10 + t * R;
    const arm = i % 2;
    const ang = arm * Math.PI + r * 0.013 + gauss(rng) * 0.22;
    const spread = 8 + 26 * t;
    pos[i * 3] = Math.cos(ang) * r + gauss(rng) * spread;
    pos[i * 3 + 2] = Math.sin(ang) * r + gauss(rng) * spread;
    pos[i * 3 + 1] = gauss(rng) * (9 + 30 * (1 - t));
    const core = Math.max(0, 1 - r / 90);
    col[i * 3] = 0.55 + core * 0.42 + rng() * 0.1;
    col[i * 3 + 1] = 0.62 + core * 0.32 + rng() * 0.08;
    col[i * 3 + 2] = 0.82 + core * 0.18;
    size[i] = (core > 0.35 ? 2.4 : 1.4) + rng() * 1.8;
    phase[i] = rng();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
  g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
  return g;
}

function pointMaterial(vert: string, frag: string, uniforms: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms, ...ADDITIVE });
}

/* ─────────────────────────── Scene parts ─────────────────────────── */

/** ดาว · ฝุ่นจักรวาล · เนบิวลา · กาแล็กซี (Deep Space) */
function SpaceLayers({ uTime, uScale, quality }: { uTime: THREE.IUniform<number>; uScale: THREE.IUniform<number>; quality: 'high' | 'low' }) {
  const k = quality === 'high' ? 1 : 0.42;
  const starMat = useMemo(() => pointMaterial(STAR_VERT, STAR_FRAG, { uTime, uScale, uBright: { value: 1.0 } }), [uTime, uScale]);
  const starMatDim = useMemo(() => pointMaterial(STAR_VERT, STAR_FRAG, { uTime, uScale, uBright: { value: 0.72 } }), [uTime, uScale]);
  const dustMat = useMemo(() => pointMaterial(DUST_VERT, DUST_FRAG, { uTime, uScale }), [uTime, uScale]);
  const glowMat = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: softGlowTexture(),
        color: new THREE.Color('#cfe4ff'),
        transparent: true,
        opacity: 0.45,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: false,
      }),
    [],
  );
  const nebulaMats = useMemo(() => {
    const tex = nebulaTexture();
    const defs = [
      { color: '#3b82f6', opacity: 0.26 },
      { color: '#7c3aed', opacity: 0.22 },
      { color: '#06b6d4', opacity: 0.2 },
      { color: '#1d4ed8', opacity: 0.24 },
      { color: '#a855f7', opacity: 0.16 },
      { color: '#22d3ee', opacity: 0.14 },
    ];
    return defs.map(
      (d) =>
        new THREE.SpriteMaterial({
          map: tex,
          color: new THREE.Color(d.color),
          transparent: true,
          opacity: d.opacity,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          depthTest: false,
        }),
    );
  }, []);

  const far = useMemo(
    () =>
      buildStarGeometry(Math.round(6200 * k), 900, 2100, 1.5, 4.4, [
        [0.72, 0.84, 1.0],
        [0.9, 0.94, 1.0],
        [0.78, 0.72, 1.0],
        [0.62, 0.86, 1.0],
      ], 4242),
    [k],
  );
  const mid = useMemo(
    () =>
      buildStarGeometry(Math.round(3000 * k), 420, 900, 1.9, 5.2, [
        [0.68, 0.86, 1.0],
        [0.95, 0.97, 1.0],
        [0.8, 0.74, 1.0],
      ], 9911),
    [k],
  );
  const dust = useMemo(() => buildDustGeometry(Math.round(1800 * k), 5150), [k]);
  const galaxy = useMemo(() => buildGalaxyGeometry(Math.round(5200 * k), 77123), [k]);

  const nebula: Array<[number, number, number, number]> = [
    [-760, 300, -1180, 1500],
    [880, -220, -1400, 1650],
    [180, 620, -1560, 1300],
    [-520, -520, -900, 1150],
    [1150, 420, -960, 1000],
    [-1200, -260, -1420, 1350],
  ];

  return (
    <>
      <points geometry={far} material={starMatDim} frustumCulled={false} />
      <points geometry={mid} material={starMat} frustumCulled={false} />
      <points geometry={dust} material={dustMat} frustumCulled={false} />
      <group position={[-980, 180, -1720]} rotation={[0.62, 0.9, -0.28]}>
        <points geometry={galaxy} material={starMat} frustumCulled={false} />
      </group>
      <sprite material={glowMat} position={[-980, 180, -1720]} scale={[520, 520, 1]} />
      {nebulaMats.map((m, i) => (
        <sprite key={i} material={m} position={[nebula[i][0], nebula[i][1], nebula[i][2]]} scale={[nebula[i][3], nebula[i][3], 1]} />
      ))}
    </>
  );
}

/** ทรงกลมพลังงานของสมาชิกทุกคน */
function NodeField({ model, epochMs, uTime, uScale, uHover, uSel }: { model: CosmicNetworkModel; epochMs: number; uTime: THREE.IUniform<number>; uScale: THREE.IUniform<number>; uHover: THREE.IUniform<number>; uSel: THREE.IUniform<number> }) {
  const geom = useMemo(() => buildNodeGeometry(model, epochMs), [model, epochMs]);
  const mat = useMemo(() => pointMaterial(NODE_VERT, NODE_FRAG, { uTime, uScale, uHover, uSel, uBoost: { value: 2.05 } }), [uTime, uScale, uHover, uSel]);
  useEffect(() => () => geom.dispose(), [geom]);
  return <points geometry={geom} material={mat} frustumCulled={false} />;
}

/** เส้นพลังงานเชื่อมสมาชิก + ไฮไลต์เส้นทางจาก ROOT ถึงโหนดที่เลือก */
function EdgeField({ model, epochMs, uTime, highlight }: { model: CosmicNetworkModel; epochMs: number; uTime: THREE.IUniform<number>; highlight: Set<number> }) {
  const geom = useMemo(() => buildEdgeGeometry(model, epochMs), [model, epochMs]);
  const mat = useMemo(() => pointMaterial(EDGE_VERT, EDGE_FRAG, { uTime, uFlowSpeed: { value: 0.16 }, uIntensity: { value: 1.4 } }), [uTime]);
  useEffect(() => {
    const attr = geom.getAttribute('aHi') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    model.edges.forEach((e, i) => {
      const v = highlight.has(e.id) ? 1 : 0;
      arr[i * 2] = v;
      arr[i * 2 + 1] = v;
    });
    attr.needsUpdate = true;
  }, [geom, model, highlight]);
  useEffect(() => () => geom.dispose(), [geom]);
  return <lineSegments geometry={geom} material={mat} frustumCulled={false} />;
}

/** Particle พลังงานวิ่งจากพ่อแม่ → ลูก ตามเส้นเชื่อม */
function FlowField({ model, uTime, uScale, highlight }: { model: CosmicNetworkModel; uTime: THREE.IUniform<number>; uScale: THREE.IUniform<number>; highlight: Set<number> }) {
  const geom = useMemo(() => buildFlowGeometry(model), [model]);
  const mat = useMemo(() => pointMaterial(FLOW_VERT, FLOW_FRAG, { uTime, uScale, uSpeedScale: { value: 1 } }), [uTime, uScale]);
  useEffect(() => {
    const attr = geom.getAttribute('aHi') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    let idx = 0;
    model.edges.forEach((e) => {
      const v = highlight.has(e.id) ? 1 : 0;
      arr[idx++] = v;
      arr[idx++] = v;
    });
    attr.needsUpdate = true;
  }, [geom, model, highlight]);
  useEffect(() => () => geom.dispose(), [geom]);
  return <points geometry={geom} material={mat} frustumCulled={false} />;
}

/** ทรงกลมทึบจริง (InstancedMesh) เฉพาะชั้นบน — ชั้นลึกใช้แสงจาก Points (LOD) */
function NodeCores({ model, uTime }: { model: CosmicNetworkModel; uTime: THREE.IUniform<number> }) {
  const { geom, cores } = useMemo(() => {
    const list = model.nodes.filter((n) => n.level <= 2);
    const g = new THREE.IcosahedronGeometry(1, 2);
    const colArr = new Float32Array(list.length * 3);
    const phArr = new Float32Array(list.length);
    list.forEach((n, i) => {
      const st = levelStyle(n.level);
      colArr[i * 3] = st.color[0] / 255;
      colArr[i * 3 + 1] = st.color[1] / 255;
      colArr[i * 3 + 2] = st.color[2] / 255;
      phArr[i] = n.phase;
    });
    g.setAttribute('aColor', new THREE.InstancedBufferAttribute(colArr, 3));
    g.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phArr, 1));
    return { geom: g, cores: list };
  }, [model]);
  const mat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: CORE_VERT, fragmentShader: CORE_FRAG, uniforms: { uTime }, ...ADDITIVE }), [uTime]);
  const ref = useRef<THREE.InstancedMesh>(null);
  const listRef = useRef(cores);
  listRef.current = cores;

  useEffect(() => {
    const mesh = ref.current;
    const list = listRef.current;
    if (!mesh || !list.length) return;
    const m = new THREE.Matrix4();
    list.forEach((n, i) => {
      m.makeScale(n.size * 0.95, n.size * 0.95, n.size * 0.95);
      m.setPosition(n.position[0], n.position[1], n.position[2]);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [geom]);

  if (!cores.length) return null;
  return <instancedMesh key={cores.length} ref={ref} args={[geom, mat, cores.length]} frustumCulled={false} />;
}

/** ทรงกลมพลังงานของโหนดที่ถูกเลือก + วงแหวนพลังงาน */
function SelectedOrb({ model, selectedId, uTime }: { model: CosmicNetworkModel; selectedId: number | null; uTime: THREE.IUniform<number> }) {
  const node: CosmicNode | null = selectedId !== null ? model.nodes[selectedId] ?? null : null;
  const geom = useMemo(() => new THREE.IcosahedronGeometry(1, 3), []);
  const mat = useMemo(
    () => new THREE.ShaderMaterial({ vertexShader: SEL_VERT, fragmentShader: SEL_FRAG, uniforms: { uTime, uRadius: { value: 1.9 } }, ...ADDITIVE }),
    [uTime],
  );
  const ringGeom = useMemo(() => new THREE.TorusGeometry(1, 0.012, 3, 96), []);
  const ringMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: new THREE.Color('#9fe4ff'), transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }),
    [],
  );
  const g1 = useRef<THREE.Mesh>(null);
  const g2 = useRef<THREE.Mesh>(null);
  useFrame((_, delta) => {
    const d = Math.min(delta, 0.05);
    if (g1.current) {
      g1.current.rotation.z += d * 0.7;
      g1.current.rotation.x += d * 0.27;
    }
    if (g2.current) {
      g2.current.rotation.y -= d * 0.5;
      g2.current.rotation.z -= d * 0.33;
    }
  });
  if (!node) return null;
  const s = Math.max(node.size, 0.9);
  return (
    <group position={node.position}>
      <mesh geometry={geom} material={mat} scale={[s, s, s]} />
      <mesh ref={g1} geometry={ringGeom} material={ringMat} scale={[s * 3.1, s * 3.1, s * 3.1]} rotation={[1.1, 0.2, 0]} />
      <mesh ref={g2} geometry={ringGeom} material={ringMat} scale={[s * 4.4, s * 4.4, s * 4.4]} rotation={[-0.6, 0.9, 0.4]} />
    </group>
  );
}

/** ROOT: ทรงกลมพลังงานใหญ่สุด + วงแหวนพลังงาน + อนุภาคโคจร + ฮาโล */
function RootSystem({ uTime, uScale, paused }: { uTime: THREE.IUniform<number>; uScale: THREE.IUniform<number>; paused: boolean }) {
  const auraMat = useMemo(
    () =>
      new THREE.SpriteMaterial({
        map: softGlowTexture(),
        color: new THREE.Color('#7fe3ff'),
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  );
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#6fd8ff'), transparent: true, opacity: 0.38, blending: THREE.AdditiveBlending, depthWrite: false }), []);
  const ringMat2 = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color('#a78bfa'), transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false }), []);
  const r1 = useMemo(() => new THREE.TorusGeometry(8.2, 0.05, 3, 192), []);
  const r2 = useMemo(() => new THREE.TorusGeometry(10.6, 0.035, 3, 192), []);
  const r3 = useMemo(() => new THREE.TorusGeometry(13.4, 0.022, 3, 192), []);

  const orbitParams = useMemo(() => {
    const rng = mulberry32(8181);
    return Array.from({ length: 160 }, (_, i) => ({
      r: i < 60 ? 9.6 + rng() * 2.6 : i < 120 ? 7.4 + rng() * 1.6 : 12.4 + rng() * 3.4,
      inc: (rng() - 0.5) * 1.6,
      speed: 0.12 + rng() * 0.5,
      phase: rng() * Math.PI * 2,
      tilt: rng() * Math.PI * 2,
    }));
  }, []);
  const orbitGeom = useMemo(() => {
    const n = 160;
    const pos = new Float32Array(n * 3);
    const col = new Float32Array(n * 3);
    const size = new Float32Array(n);
    const phase = new Float32Array(n);
    const rng = mulberry32(31337);
    for (let i = 0; i < n; i++) {
      const c = i % 3 === 0 ? [0.62, 0.88, 1.0] : i % 3 === 1 ? [0.72, 0.7, 1.0] : [0.95, 0.98, 1.0];
      col[i * 3] = c[0];
      col[i * 3 + 1] = c[1];
      col[i * 3 + 2] = c[2];
      size[i] = 1.6 + rng() * 3.4;
      phase[i] = rng();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    return g;
  }, []);
  const orbitMat = useMemo(() => pointMaterial(STAR_VERT, STAR_FRAG, { uTime, uScale, uBright: { value: 1.5 } }), [uTime, uScale]);
  const orbitRef = useRef<THREE.Points>(null);
  const ringsRef = useRef<THREE.Group>(null);

  useFrame(() => {
    const t = uTime.value;
    const pts = orbitRef.current;
    if (!paused && pts) {
      const attr = pts.geometry.getAttribute('position') as THREE.BufferAttribute;
      const arr = attr.array as Float32Array;
      for (let i = 0; i < orbitParams.length; i++) {
        const p = orbitParams[i];
        const a = p.phase + t * p.speed;
        const x = Math.cos(a) * p.r;
        const z = Math.sin(a) * p.r * Math.cos(p.inc);
        const y = Math.sin(a) * p.r * Math.sin(p.inc);
        arr[i * 3] = x * Math.cos(p.tilt) - z * Math.sin(p.tilt);
        arr[i * 3 + 1] = y;
        arr[i * 3 + 2] = x * Math.sin(p.tilt) + z * Math.cos(p.tilt);
      }
      attr.needsUpdate = true;
    }
    auraMat.opacity = 0.4 + 0.16 * Math.sin(t * 1.1);
    if (ringsRef.current && !paused) ringsRef.current.rotation.y += 0.0016;
  });

  return (
    <group>
      <sprite material={auraMat} scale={[46, 46, 1]} />
      <group ref={ringsRef} rotation={[0.5, 0, 0.2]}>
        <mesh geometry={r1} material={ringMat} rotation={[1.2, 0.3, 0]} />
        <mesh geometry={r2} material={ringMat2} rotation={[-0.7, 0.5, 0.6]} />
        <mesh geometry={r3} material={ringMat} rotation={[0.2, -0.9, 1.1]} />
      </group>
      <points ref={orbitRef} geometry={orbitGeom} material={orbitMat} frustumCulled={false} />
    </group>
  );
}

/** คลื่นพลังงานขยายจาก ROOT (และทุกครั้งที่มีสมาชิกใหม่) */
function EnergyWaves({ uTime, spawnRef }: { uTime: THREE.IUniform<number>; spawnRef: MutableRefObject<((delay?: number) => void) | null> }) {
  const COUNT = 5;
  const waves = useRef<Array<{ start: number; active: boolean }>>(Array.from({ length: COUNT }, () => ({ start: -999, active: false })));
  const meshes = useRef<Array<THREE.Mesh | null>>([]);
  const geom = useMemo(() => new THREE.IcosahedronGeometry(1, 4), []);
  const mats = useMemo(
    () =>
      Array.from({ length: COUNT }, () =>
        new THREE.ShaderMaterial({ vertexShader: WAVE_VERT, fragmentShader: WAVE_FRAG, uniforms: { uR: { value: 0 }, uOpacity: { value: 0 } }, side: THREE.DoubleSide, ...ADDITIVE }),
      ),
    [],
  );
  const next = useRef(0);

  useEffect(() => {
    const spawn = (delay = 0) => {
      const w = waves.current[next.current % COUNT];
      w.start = uTime.value + delay;
      w.active = true;
      next.current += 1;
    };
    spawnRef.current = spawn;
    spawn(1.2);
    spawn(2.6);
    spawn(4.2);
    const id = window.setInterval(() => spawn(), 12000);
    return () => {
      window.clearInterval(id);
      spawnRef.current = null;
    };
  }, [spawnRef, uTime]);

  useFrame(() => {
    const t = uTime.value;
    for (let i = 0; i < COUNT; i++) {
      const w = waves.current[i];
      const mesh = meshes.current[i];
      if (!mesh) continue;
      const age = t - w.start;
      const dur = 7.5;
      if (!w.active || age < 0 || age > dur) {
        if (age > dur) w.active = false;
        mesh.visible = false;
        continue;
      }
      const p = age / dur;
      mesh.visible = true;
      mesh.scale.setScalar(1.5 + p * 78);
      const m = mesh.material as THREE.ShaderMaterial;
      m.uniforms.uR.value = 0.02 + p * 0.98;
      m.uniforms.uOpacity.value = Math.sin(Math.PI * Math.min(1, p * 1.15)) * 0.85;
    }
  });

  return (
    <>
      {mats.map((m, i) => (
        <mesh
          key={i}
          ref={(el) => {
            meshes.current[i] = el;
          }}
          geometry={geom}
          material={m}
          visible={false}
          frustumCulled={false}
        />
      ))}
    </>
  );
}

type Comet = {
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  speed: number;
  life: number;
  maxLife: number;
  trail: Float32Array;
};

/** ดาวหาง: หัวสว่าง + หางพลังงานยาว วิ่งผ่านระยะต่าง ๆ (หน้า/หลัง/ใกล้/ไกล) */
function CometSystem({ paused, onPass, quality, uScale }: { paused: boolean; onPass: () => void; quality: 'high' | 'low'; uScale: THREE.IUniform<number> }) {
  const COUNT = quality === 'high' ? 8 : 5;
  const SEG = quality === 'high' ? 44 : 30;
  const rng = useMemo(() => mulberry32(606060), []);
  const state = useMemo<Comet[]>(() => [], []);
  const headGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * 3), 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(new Float32Array(COUNT), 1));
    return g;
  }, [COUNT]);
  const headMat = useMemo(() => new THREE.ShaderMaterial({ vertexShader: COMET_VERT, fragmentShader: COMET_FRAG, uniforms: { uScale }, ...ADDITIVE }), [uScale]);
  const tailGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(COUNT * (SEG - 1) * 2 * 3), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(COUNT * (SEG - 1) * 2 * 3), 3));
    return g;
  }, [COUNT, SEG]);
  const tailMat = useMemo(() => new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }), []);
  const headRef = useRef<THREE.Points>(null);
  const tailRef = useRef<THREE.LineSegments>(null);
  const cooldown = useRef(0);
  const initialized = useRef(false);

  const respawn = (c: Comet, i: number) => {
    const r = 850 + rng() * 750;
    const u = rng() * 2 - 1;
    const th = rng() * Math.PI * 2;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    c.pos.set(Math.cos(th) * s * r, u * r * 0.7, Math.sin(th) * s * r);
    const tx = (rng() - 0.5) * 240;
    const ty = (rng() - 0.5) * 180;
    const tz = (rng() - 0.5) * 240;
    c.dir.set(tx - c.pos.x, ty - c.pos.y, tz - c.pos.z).normalize();
    c.speed = 70 + rng() * (i % 3 === 0 ? 170 : 80);
    c.maxLife = (r * 2.4) / c.speed;
    c.life = 0;
    const sizeAttr = headGeom.getAttribute('aSize') as THREE.BufferAttribute;
    (sizeAttr.array as Float32Array)[i] = i % 3 === 0 ? 5 + rng() * 6 : 2.2 + rng() * 3;
    sizeAttr.needsUpdate = true;
    for (let k = 0; k < SEG; k++) {
      c.trail[k * 3] = c.pos.x - c.dir.x * c.speed * 0.045 * k;
      c.trail[k * 3 + 1] = c.pos.y - c.dir.y * c.speed * 0.045 * k;
      c.trail[k * 3 + 2] = c.pos.z - c.dir.z * c.speed * 0.045 * k;
    }
  };

  if (!initialized.current) {
    initialized.current = true;
    for (let i = 0; i < COUNT; i++) {
      const c: Comet = { pos: new THREE.Vector3(), dir: new THREE.Vector3(1, 0, 0), speed: 90, life: 0, maxLife: 20, trail: new Float32Array(SEG * 3) };
      respawn(c, i);
      c.life = rng() * c.maxLife * 0.75;
      state.push(c);
    }
  }

  useFrame((frame, delta) => {
    if (paused || !state.length) return;
    const dt = Math.min(delta, 0.05);
    const headAttr = headRef.current?.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    const tailPosAttr = tailRef.current?.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    const tailColAttr = tailRef.current?.geometry.getAttribute('color') as THREE.BufferAttribute | undefined;
    if (!headAttr || !tailPosAttr || !tailColAttr) return;
    const heads = headAttr.array as Float32Array;
    const tailPos = tailPosAttr.array as Float32Array;
    const tailCol = tailColAttr.array as Float32Array;

    for (let i = 0; i < COUNT; i++) {
      const c = state[i];
      if (!c) continue;
      c.life += dt;
      if (c.life > c.maxLife) respawn(c, i);
      c.pos.addScaledVector(c.dir, c.speed * dt);
      for (let k = SEG - 1; k > 0; k--) {
        c.trail[k * 3] = c.trail[(k - 1) * 3];
        c.trail[k * 3 + 1] = c.trail[(k - 1) * 3 + 1];
        c.trail[k * 3 + 2] = c.trail[(k - 1) * 3 + 2];
      }
      c.trail[0] = c.pos.x;
      c.trail[1] = c.pos.y;
      c.trail[2] = c.pos.z;
      heads[i * 3] = c.pos.x;
      heads[i * 3 + 1] = c.pos.y;
      heads[i * 3 + 2] = c.pos.z;

      let w = i * (SEG - 1) * 6;
      for (let k = 0; k < SEG - 1; k++) {
        const a = k * 3;
        const b = (k + 1) * 3;
        tailPos[w] = c.trail[a];
        tailPos[w + 1] = c.trail[a + 1];
        tailPos[w + 2] = c.trail[a + 2];
        tailPos[w + 3] = c.trail[b];
        tailPos[w + 4] = c.trail[b + 1];
        tailPos[w + 5] = c.trail[b + 2];
        const f0 = Math.pow(1 - k / SEG, 2.2) * 0.8;
        const f1 = Math.pow(1 - (k + 1) / SEG, 2.2) * 0.8;
        tailCol[w] = 0.6 * f0;
        tailCol[w + 1] = 0.85 * f0;
        tailCol[w + 2] = 1.0 * f0;
        tailCol[w + 3] = 0.6 * f1;
        tailCol[w + 4] = 0.85 * f1;
        tailCol[w + 5] = 1.0 * f1;
        w += 6;
      }

      cooldown.current -= dt;
      if (cooldown.current <= 0) {
        const dist = c.pos.distanceTo(frame.camera.position);
        if (dist < 130 && dist > 15) {
          cooldown.current = 9;
          onPass();
        }
      }
    }
    headAttr.needsUpdate = true;
    tailPosAttr.needsUpdate = true;
    tailColAttr.needsUpdate = true;
  });

  return (
    <>
      <points ref={headRef} geometry={headGeom} material={headMat} frustumCulled={false} />
      <lineSegments ref={tailRef} geometry={tailGeom} material={tailMat} frustumCulled={false} />
    </>
  );
}

/** ลำแสงพ่อแม่ → สมาชิกใหม่ + อนุภาครวมตัวเป็นทรงกลม (materialize) */
function AddFx({ uTime, uScale, fxRef }: { uTime: THREE.IUniform<number>; uScale: THREE.IUniform<number>; fxRef: FxRef }) {
  const beamGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 0, 0, 0, 0]), 3));
    g.setAttribute('aT', new THREE.BufferAttribute(new Float32Array([0, 1]), 1));
    return g;
  }, []);
  const beamMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: BEAM_VERT,
        fragmentShader: EDGE_FRAG,
        uniforms: { uFrom: { value: new THREE.Vector3() }, uTo: { value: new THREE.Vector3() }, uTime, uStart: { value: -999 }, uActive: { value: 0 } },
        ...ADDITIVE,
      }),
    [uTime],
  );
  const burstGeom = useMemo(() => {
    const n = 240;
    const dir = new Float32Array(n * 3);
    const r = new Float32Array(n);
    const ph = new Float32Array(n);
    const rng = mulberry32(24680);
    for (let i = 0; i < n; i++) {
      const u = rng() * 2 - 1;
      const th = rng() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      dir[i * 3] = Math.cos(th) * s;
      dir[i * 3 + 1] = u;
      dir[i * 3 + 2] = Math.sin(th) * s;
      r[i] = 2.5 + Math.pow(rng(), 0.6) * 9;
      ph[i] = rng();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    g.setAttribute('aR', new THREE.BufferAttribute(r, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    return g;
  }, []);
  const burstMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: BURST_VERT,
        fragmentShader: BURST_FRAG,
        uniforms: { uTarget: { value: new THREE.Vector3() }, uTime, uStart: { value: -999 }, uActive: { value: 0 }, uScale },
        ...ADDITIVE,
      }),
    [uTime, uScale],
  );
  const beamObj = useMemo(() => new THREE.Line(beamGeom, beamMat), [beamGeom, beamMat]);
  const burstObj = useMemo(() => new THREE.Points(burstGeom, burstMat), [burstGeom, burstMat]);

  useFrame(() => {
    const fx = fxRef.current;
    const t = uTime.value;
    if (fx.active > 0 && t - fx.start >= 2.4) fx.active = 0;
    const active = fx.active > 0 ? 1 : 0;
    beamMat.uniforms.uFrom.value.copy(fx.from);
    beamMat.uniforms.uTo.value.copy(fx.target);
    beamMat.uniforms.uStart.value = fx.start;
    beamMat.uniforms.uActive.value = active;
    burstMat.uniforms.uTarget.value.copy(fx.target);
    burstMat.uniforms.uStart.value = fx.start;
    burstMat.uniforms.uActive.value = active;
    beamObj.visible = active > 0;
    burstObj.visible = active > 0;
  });

  return (
    <>
      <primitive object={beamObj} />
      <primitive object={burstObj} />
    </>
  );
}

/* ─────────────────────────── Camera + picking + labels ─────────────────────────── */

type Anim = { from: THREE.Vector3; to: THREE.Vector3; tFrom: THREE.Vector3; tTo: THREE.Vector3; t: number; dur: number };

function ease(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

type CamApi = Omit<SceneApi, 'spawnBurst'>;

function CameraRig({
  controlsRef,
  implRef,
  paused,
  autoRotate,
  model,
  selectedId,
}: {
  controlsRef: MutableRefObject<OrbitControlsRef | null>;
  implRef: MutableRefObject<CamApi | null>;
  paused: boolean;
  autoRotate: boolean;
  model: CosmicNetworkModel;
  selectedId: number | null;
}) {
  const { camera } = useThree();
  const anim = useRef<Anim | null>(null);
  const lastInteract = useRef(0);
  const introDone = useRef(false);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;

  const spherical = (dist: number, phi = DEFAULT_PHI, theta = DEFAULT_THETA) => new THREE.Vector3().setFromSphericalCoords(dist, phi, theta);

  const startAnim = (to: THREE.Vector3, target: THREE.Vector3, dur: number) => {
    const c = controlsRef.current;
    anim.current = { from: camera.position.clone(), to, tFrom: c ? c.target.clone() : new THREE.Vector3(), tTo: target.clone(), t: 0, dur };
  };

  useEffect(() => {
    camera.position.copy(spherical(280, 1.3, 0.95));
    lastInteract.current = performance.now();
    const t = window.setTimeout(() => {
      startAnim(spherical(DEFAULT_DIST), new THREE.Vector3(0, 0, 0), 5.6);
      introDone.current = true;
    }, 300);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  useEffect(() => {
    implRef.current = {
      resetView: () => {
        lastInteract.current = performance.now();
        startAnim(spherical(DEFAULT_DIST), new THREE.Vector3(0, 0, 0), 1.7);
      },
      focusRoot: () => {
        lastInteract.current = performance.now();
        startAnim(spherical(24, 1.05, 0.7), new THREE.Vector3(0, 0, 0), 1.9);
      },
      focusNode: (id: number) => {
        const n = model.nodes[id];
        if (!n) return;
        lastInteract.current = performance.now();
        const target = new THREE.Vector3(n.position[0], n.position[1], n.position[2]);
        const dir = camera.position.clone().sub(target);
        if (dir.lengthSq() < 1e-6) dir.set(0, 0.4, 1);
        dir.normalize();
        startAnim(target.clone().addScaledVector(dir, Math.max(9, n.size * 11)), target, 1.5);
      },
      zoom: (factor: number) => {
        lastInteract.current = performance.now();
        const c = controlsRef.current;
        const target = c ? c.target.clone() : new THREE.Vector3();
        const dir = camera.position.clone().sub(target);
        const dist = THREE.MathUtils.clamp(dir.length() * factor, MIN_DIST, MAX_DIST);
        startAnim(target.clone().addScaledVector(dir.normalize(), dist), target, 0.7);
      },
    };
    return () => {
      implRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [implRef, camera, model]);

  useEffect(() => {
    lastInteract.current = performance.now();
  }, [selectedId]);

  useFrame((_, delta) => {
    const c = controlsRef.current;
    const dt = Math.min(delta, 0.05);
    const now = performance.now();

    if (anim.current) {
      const a = anim.current;
      a.t = Math.min(1, a.t + dt / a.dur);
      const e = ease(a.t);
      camera.position.lerpVectors(a.from, a.to, e);
      if (c) {
        c.target.lerpVectors(a.tFrom, a.tTo, e);
        c.update();
      }
      if (a.t >= 1) anim.current = null;
      return;
    }

    // โหมดชมภาพยนตร์: ไม่มีปฏิสัมพันธ์นาน ๆ → ค่อย ๆ ถอยออกไปเห็นทั้งจักรวาล
    if (!pausedRef.current && introDone.current && now - lastInteract.current > 45000 && c) {
      const dist = camera.position.distanceTo(c.target);
      if (dist < 250) {
        lastInteract.current = now;
        const dir = camera.position.clone().sub(c.target).normalize();
        anim.current = { from: camera.position.clone(), to: c.target.clone().addScaledVector(dir, 290), tFrom: c.target.clone(), tTo: c.target.clone(), t: 0, dur: 26 };
      }
    }
  });

  useEffect(() => {
    const c = controlsRef.current;
    if (c) c.autoRotate = autoRotate && !paused;
  }, [autoRotate, paused, controlsRef]);

  return null;
}

function Picker({
  model,
  addMode,
  uHover,
  onSelect,
  onFocus,
  onUserInteract,
  draggingRef,
}: {
  model: CosmicNetworkModel;
  addMode: boolean;
  uHover: THREE.IUniform<number>;
  onSelect: (id: number | null) => void;
  onFocus: (id: number) => void;
  onUserInteract: () => void;
  draggingRef: MutableRefObject<boolean>;
}) {
  const { gl, camera } = useThree();
  const pointer = useRef({ x: 0, y: 0, inside: false });
  const modelRef = useRef(model);
  const addRef = useRef(addMode);
  modelRef.current = model;
  addRef.current = addMode;
  const tmp = useMemo(() => new THREE.Vector3(), []);

  const pick = (clientX: number, clientY: number): number => {
    const rect = gl.domElement.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    let best = -1;
    let bestD = Infinity;
    for (const n of modelRef.current.nodes) {
      tmp.set(n.position[0], n.position[1], n.position[2]).project(camera);
      if (tmp.z > 1 || tmp.z < -1) continue;
      const sx = (tmp.x * 0.5 + 0.5) * rect.width;
      const sy = (-tmp.y * 0.5 + 0.5) * rect.height;
      const d = Math.hypot(sx - px, sy - py);
      if (d < bestD) {
        bestD = d;
        best = n.id;
      }
    }
    const limit = Math.max(22, Math.min(rect.width, rect.height) * 0.04);
    return bestD <= limit ? best : -1;
  };

  useEffect(() => {
    const el = gl.domElement;
    let downAt = 0;
    let downX = 0;
    let downY = 0;
    let moved = false;
    let multitouch = false;
    let activePointers = 0;
    let lastTap = { id: -1, t: 0 };

    const onDown = (e: PointerEvent) => {
      activePointers += 1;
      if (activePointers > 1) multitouch = true;
      downAt = performance.now();
      downX = e.clientX;
      downY = e.clientY;
      moved = false;
      onUserInteract();
    };
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      pointer.current = { x: e.clientX - rect.left, y: e.clientY - rect.top, inside: true };
      if (activePointers > 0 && (Math.abs(e.clientX - downX) > 6 || Math.abs(e.clientY - downY) > 6)) {
        moved = true;
        draggingRef.current = true;
      }
      onUserInteract();
    };
    const onUp = (e: PointerEvent) => {
      activePointers = Math.max(0, activePointers - 1);
      const dur = performance.now() - downAt;
      draggingRef.current = false;
      if (multitouch) {
        if (activePointers === 0) multitouch = false;
        return;
      }
      if (moved || dur > 800) return;
      const id = pick(e.clientX, e.clientY);
      const now = performance.now();
      const isDouble = id >= 0 && lastTap.id === id && now - lastTap.t < 340;
      lastTap = { id, t: now };
      if (id < 0) {
        if (!addRef.current) onSelect(null);
        return;
      }
      onSelect(id);
      if (isDouble) onFocus(id);
    };
    const onLeave = () => {
      pointer.current.inside = false;
      uHover.value = -1;
      el.style.cursor = 'grab';
    };

    el.style.cursor = 'grab';
    el.addEventListener('pointerdown', onDown);
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
    el.addEventListener('pointerleave', onLeave);
    return () => {
      el.removeEventListener('pointerdown', onDown);
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
      el.removeEventListener('pointerleave', onLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gl, camera, onSelect, onFocus, onUserInteract, draggingRef, uHover]);

  const frame = useRef(0);
  useFrame(() => {
    frame.current += 1;
    if (frame.current % 2 !== 0 || !pointer.current.inside || draggingRef.current) return;
    const rect = gl.domElement.getBoundingClientRect();
    const hit = pick(pointer.current.x + rect.left, pointer.current.y + rect.top);
    if (hit !== uHover.value) {
      uHover.value = hit;
      gl.domElement.style.cursor = hit >= 0 ? 'pointer' : 'grab';
    }
  });

  return null;
}

/** ฉายพิกัด 3D → 2D เพื่อให้ UI นอก Canvas วาดป้ายชื่อ ROOT / โหนดที่เลือก */
function Labels({ model, selectedId, labelRef }: { model: CosmicNetworkModel; selectedId: number | null; labelRef: MutableRefObject<LabelState> }) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  const frame = useRef(0);
  useFrame(() => {
    frame.current += 1;
    if (frame.current % 2 !== 0) return;
    const put = (id: number) => {
      const n = model.nodes[id];
      if (!n) return { x: 0, y: 0, visible: false };
      v.set(n.position[0], n.position[1], n.position[2]).project(camera);
      return { x: (v.x * 0.5 + 0.5) * size.width, y: (-v.y * 0.5 + 0.5) * size.height, visible: v.z > -1 && v.z < 1 };
    };
    labelRef.current = {
      root: put(0),
      sel: selectedId !== null ? put(selectedId) : { x: 0, y: 0, visible: false },
      ready: true,
    };
  });
  return null;
}

/* ─────────────────────────── Scene contents ─────────────────────────── */

type InnerProps = CosmicSceneProps & {
  epochMs: number;
  uTime: THREE.IUniform<number>;
  uScale: THREE.IUniform<number>;
  draggingRef: MutableRefObject<boolean>;
  fxRef: FxRef;
  controlsRef: MutableRefObject<OrbitControlsRef | null>;
  implRef: MutableRefObject<CamApi | null>;
  waveSpawnRef: MutableRefObject<((delay?: number) => void) | null>;
};

function computeEnergy(t: number): number {
  const v = 58 + 22 * Math.sin(t * 0.23) + 11 * Math.sin(t * 0.61) + 4 * Math.sin(t * 1.7);
  return Math.max(24, Math.min(99, Math.round(v)));
}

function SceneContents(p: InnerProps) {
  const { model, selectedId, paused, autoRotate, addMode, quality, uTime, uScale } = p;
  const uHover = useMemo<THREE.IUniform<number>>(() => ({ value: -1 }), []);
  const uSel = useMemo<THREE.IUniform<number>>(() => ({ value: -1 }), []);

  const highlight = useMemo(() => {
    const set = new Set<number>();
    if (selectedId === null) return set;
    let cur: number | null = selectedId;
    let guard = 0;
    while (cur !== null && guard++ < 64) {
      const e = model.edgeOfChild[cur];
      if (e >= 0) set.add(e);
      cur = model.nodes[cur]?.parentId ?? null;
    }
    return set;
  }, [model, selectedId]);

  useEffect(() => {
    uSel.value = selectedId ?? -1;
  }, [selectedId, uSel]);

  const tRef = useRef(0);
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const acc = useRef({ frames: 0, t: 0, fps: 60 });
  const onStats = p.onStats;

  useFrame((_, delta) => {
    if (!pausedRef.current) tRef.current += Math.min(delta, 0.05);
    uTime.value = tRef.current;
    const s = acc.current;
    s.frames += 1;
    s.t += delta;
    if (s.t > 0.6) {
      s.fps = s.fps * 0.5 + (s.frames / s.t) * 0.5;
      s.frames = 0;
      s.t = 0;
      onStats({ activeEnergy: computeEnergy(tRef.current), fps: s.fps, quality });
    }
  });

  return (
    <>
      <CameraRig controlsRef={p.controlsRef} implRef={p.implRef} paused={paused} autoRotate={autoRotate} model={model} selectedId={selectedId} />
      <Labels model={model} selectedId={selectedId} labelRef={p.labelRef} />
      <Picker model={model} addMode={addMode} uHover={uHover} onSelect={p.onSelect} onFocus={p.onFocus} onUserInteract={p.onUserInteract} draggingRef={p.draggingRef} />
      <SpaceLayers uTime={uTime} uScale={uScale} quality={quality} />
      <EnergyWaves uTime={uTime} spawnRef={p.waveSpawnRef} />
      <EdgeField model={model} epochMs={p.epochMs} uTime={uTime} highlight={highlight} />
      <FlowField model={model} uTime={uTime} uScale={uScale} highlight={highlight} />
      <NodeField model={model} epochMs={p.epochMs} uTime={uTime} uScale={uScale} uHover={uHover} uSel={uSel} />
      <NodeCores model={model} uTime={uTime} />
      <RootSystem uTime={uTime} uScale={uScale} paused={paused} />
      <SelectedOrb model={model} selectedId={selectedId} uTime={uTime} />
      <CometSystem paused={paused} onPass={p.onCometPass} quality={quality} uScale={uScale} />
      <AddFx uTime={uTime} uScale={uScale} fxRef={p.fxRef} />
      <OrbitControls
        ref={p.controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.06}
        rotateSpeed={0.55}
        zoomSpeed={0.85}
        enablePan={false}
        minDistance={MIN_DIST}
        maxDistance={MAX_DIST}
        autoRotate={autoRotate && !paused}
        autoRotateSpeed={0.32}
      />
    </>
  );
}

/** ปรับ uScale (ขนาดจุดบนจอ) ตามขนาดแคนวาสและความละเอียดจอ */
function ScaleSync({ uScale }: { uScale: THREE.IUniform<number> }) {
  const { size, viewport } = useThree();
  useEffect(() => {
    uScale.value = Math.max(140, size.height * 0.5 * viewport.dpr);
  }, [uScale, size.height, size.width, viewport.dpr]);
  return null;
}

/* ─────────────────────────── Public component ─────────────────────────── */

export default function CosmicNetworkScene(props: CosmicSceneProps) {
  const { model, apiRef, quality } = props;
  const epochMs = useMemo(() => Date.now(), []);
  const uTime = useMemo<THREE.IUniform<number>>(() => ({ value: 0 }), []);
  const uScale = useMemo<THREE.IUniform<number>>(() => ({ value: 600 }), []);
  const controlsRef = useRef<OrbitControlsRef | null>(null);
  const draggingRef = useRef(false);
  const fxRef = useRef({ target: new THREE.Vector3(), from: new THREE.Vector3(), start: -999, active: 0 });
  const implRef = useRef<CamApi | null>(null);
  const waveSpawnRef = useRef<((delay?: number) => void) | null>(null);

  const api = useMemo<SceneApi>(
    () => ({
      resetView: () => implRef.current?.resetView(),
      focusRoot: () => implRef.current?.focusRoot(),
      focusNode: (id: number) => implRef.current?.focusNode(id),
      zoom: (factor: number) => implRef.current?.zoom(factor),
      spawnBurst: (id: number) => {
        const node = model.nodes[id];
        if (!node) return;
        const parent = node.parentId != null ? model.nodes[node.parentId] : null;
        fxRef.current.target.set(node.position[0], node.position[1], node.position[2]);
        fxRef.current.from.set(parent?.position[0] ?? 0, parent?.position[1] ?? 0, parent?.position[2] ?? 0);
        fxRef.current.start = uTime.value;
        fxRef.current.active = 1;
        waveSpawnRef.current?.(0.15);
      },
    }),
    [model, uTime],
  );

  useEffect(() => {
    apiRef.current = api;
    return () => {
      if (apiRef.current === api) apiRef.current = null;
    };
  }, [api, apiRef]);

  return (
    <Canvas
      camera={{ fov: 55, near: 0.1, far: 9000, position: [0, 130, 280] }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
      dpr={[1, quality === 'high' ? 1.6 : 1]}
      onCreated={({ gl }) => {
        gl.setClearColor(new THREE.Color('#01030a'), 1);
      }}
      style={{ touchAction: 'none' }}
      className="h-full w-full"
    >
      <ScaleSync uScale={uScale} />
      <SceneContents
        {...props}
        epochMs={epochMs}
        uTime={uTime}
        uScale={uScale}
        draggingRef={draggingRef}
        fxRef={fxRef}
        controlsRef={controlsRef}
        implRef={implRef}
        waveSpawnRef={waveSpawnRef}
      />
    </Canvas>
  );
}
