'use client';

/**
 * NetworkUniverse3D — จักรวาลเครือข่ายสมาชิกแบบ 3 มิติ (three.js + @react-three/fiber)
 *
 * ● แสดงผล "เครือข่ายจำลอง" เพื่อการสาธิตเท่านั้น — ไม่มีการสื่อถึงรายได้จริง กำไร
 *   ค่าคอมมิชชั่นที่ได้รับจริง หรือผลตอบแทนใด ๆ และไม่มีแอนิเมชันสื่อถึงเงินไหลเข้าบัญชี
 * ● คอมโพเนนต์นี้รับ props เท่านั้น — ไม่เรียก API / fetch ใด ๆ
 * ● โครงสร้างตำแหน่งเป็น deterministic ทั้งหมด (คำนวณจาก index ของพี่น้อง + parentCode)
 *   จึงไม่กระโดดเมื่อ re-render
 */

import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { JSX, ReactNode } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';

/* ─────────────────────────── Public types ─────────────────────────── */

export type UniverseNode = {
  code: string;
  level: number;
  parentCode: string | null;
  status: string;
  qualified: boolean;
  paymentVerified: boolean;
  promotionStatus: string;
  childrenCount?: number;
  simulation: boolean;
};

type NetworkUniverse3DProps = {
  nodes: UniverseNode[];
  selected?: string | null;
  onSelect?: (code: string | null) => void;
  maxNodes?: number;
  simulation?: boolean;
  className?: string;
};

/* ─────────────────────────── Constants ─────────────────────────── */

const SPAWN_MS = 1200; // ระยะเวลาบินออกจาก parent ของสมาชิกใหม่
const INSTANCED_THRESHOLD = 300; // เกินนี้ใช้ instancedMesh
const R0 = 4.2; // รัศมีชั้นตื้นสุด (ชั้นแรก)
const RSTEP = 6.4; // ระยะห่างต่อชั้น
const MAX_FX = 40; // จำกัดจำนวน effect โคม่าเพื่อไม่ให้ค้าง

const DIM = new THREE.Color('#5b6b82'); // สีหม่นสำหรับ paymentVerified=false
const HIGHLIGHT = new THREE.Color('#ffffff');

// ไม่รับ raycast (ของประดับไม่ควรบังการคลิก)
const NO_RAYCAST = (): null => null;

/* ─────────────────────────── Helpers ─────────────────────────── */

/** PRNG แบบ deterministic (mulberry32) */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashString(value: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function hash01(value: string): number {
  return hashString(value) / 4294967296;
}

function easeOutCubic(t: number): number {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return 1 - Math.pow(1 - c, 3);
}

/** ไล่เฉดสีตามชั้น: ฟ้า → ชมพู → เขียว */
function levelColor(tier: number, maxTier: number): THREE.Color {
  const t = maxTier <= 0 ? 0 : Math.max(0, Math.min(1, tier / maxTier));
  const blue = new THREE.Color('#38bdf8');
  const pink = new THREE.Color('#f472b6');
  const green = new THREE.Color('#34d399');
  return t < 0.5 ? blue.lerp(pink, t * 2) : pink.lerp(green, (t - 0.5) * 2);
}

/* ─────────────────────────── Layout ─────────────────────────── */

type Spawn = { start: number; from: THREE.Vector3 };

type Placed = {
  code: string;
  level: number;
  pos: THREE.Vector3;
  parentPos: THREE.Vector3 | null;
  color: THREE.Color;
  radius: number;
  qualified: boolean;
  verified: boolean;
};

/** จัดตำแหน่งเป็นทรงกลมซ้อนกันตามชั้น — deterministic จาก sibling index + parentCode */
function buildLayout(nodes: UniverseNode[]): { placed: Placed[]; outerRadius: number } {
  if (nodes.length === 0) return { placed: [], outerRadius: 12 };

  let minLevel = nodes[0].level;
  let maxLevel = nodes[0].level;
  for (const n of nodes) {
    if (n.level < minLevel) minLevel = n.level;
    if (n.level > maxLevel) maxLevel = n.level;
  }
  const maxTier = Math.max(0, maxLevel - minLevel);

  // จัดกลุ่มพี่น้องตาม parentCode
  const groups = new Map<string, UniverseNode[]>();
  for (const n of nodes) {
    const key = n.parentCode ?? '__ROOT__';
    const arr = groups.get(key);
    if (arr) arr.push(n);
    else groups.set(key, [n]);
  }

  const posMap = new Map<string, THREE.Vector3>();
  const golden = Math.PI * (3 - Math.sqrt(5));

  for (const [key, arr] of groups) {
    // เรียงแบบ deterministic เพื่อให้ index ของพี่น้องนิ่ง
    arr.sort((a, b) => a.code.localeCompare(b.code));
    const count = arr.length;
    const rot = key === '__ROOT__' ? 0 : hash01(key) * Math.PI * 2;

    for (let s = 0; s < count; s++) {
      const node = arr[s];
      const tier = Math.max(0, node.level - minLevel);
      const radius = tier === 0 ? (count > 1 ? 2.6 : 0) : R0 + (tier - 1) * RSTEP;

      // กระจายบนเปลือกทรงกลมด้วย fibonacci sphere (phi) + golden angle (theta)
      const phi = Math.acos(1 - 2 * ((s + 0.5) / count));
      const theta = golden * s + rot + tier * 0.7;
      const sp = Math.sin(phi);
      const jitter = tier <= 1 ? 0 : (hash01(node.code) - 0.5) * 0.36;
      const rr = radius * (1 + jitter);

      posMap.set(
        node.code,
        new THREE.Vector3(sp * Math.cos(theta) * rr, Math.cos(phi) * rr, sp * Math.sin(theta) * rr),
      );
    }
  }

  const placed: Placed[] = nodes.map((node) => {
    const tier = Math.max(0, node.level - minLevel);
    const base = levelColor(tier, maxTier);
    const color = node.paymentVerified ? base : base.clone().lerp(DIM, 0.62);
    const parentPos = node.parentCode ? posMap.get(node.parentCode) ?? null : null;
    return {
      code: node.code,
      level: node.level,
      pos: posMap.get(node.code) ?? new THREE.Vector3(),
      parentPos: parentPos ? parentPos.clone() : null,
      color,
      radius: Math.max(0.16, 0.62 - tier * 0.06),
      qualified: node.qualified,
      verified: node.paymentVerified,
    };
  });

  const outerTierRadius = maxTier === 0 ? R0 : R0 + (maxTier - 1) * RSTEP;
  return { placed, outerRadius: outerTierRadius + 1.5 };
}

/* ─────────────────────────── Starfield ─────────────────────────── */

function Starfield({ seed, innerRadius }: { seed: number; innerRadius: number }) {
  const pointsRef = useRef<THREE.Points>(null);

  const geometry = useMemo(() => {
    const rng = mulberry32(seed >>> 0 || 0x9e3779b9);
    const count = 2200;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const cBlue = new THREE.Color('#bae6fd');
    const cWhite = new THREE.Color('#ffffff');
    const cDeep = new THREE.Color('#7dd3fc');

    for (let i = 0; i < count; i++) {
      const u = rng() * 2 - 1;
      const theta = rng() * Math.PI * 2;
      const rxy = Math.sqrt(Math.max(0, 1 - u * u));
      const r = innerRadius + rng() * innerRadius * 3.2;
      positions[i * 3] = rxy * Math.cos(theta) * r;
      positions[i * 3 + 1] = u * r;
      positions[i * 3 + 2] = rxy * Math.sin(theta) * r;

      const pick = rng();
      const c = pick < 0.55 ? cBlue : pick < 0.85 ? cWhite : cDeep;
      const bright = 0.5 + rng() * 0.5;
      colors[i * 3] = c.r * bright;
      colors[i * 3 + 1] = c.g * bright;
      colors[i * 3 + 2] = c.b * bright;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
  }, [seed, innerRadius]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((_state, delta) => {
    const p = pointsRef.current;
    if (!p) return;
    p.rotation.y += delta * 0.006;
    p.rotation.x += delta * 0.0015;
  });

  return (
    <points ref={pointsRef} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        size={1.35}
        sizeAttenuation
        vertexColors
        transparent
        opacity={0.9}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

/* ─────────────────────────── Lines (parent → child) ─────────────────────────── */

function LineWeb({ placed }: { placed: Placed[] }) {
  const built = useMemo(() => {
    const segs = placed.filter((p) => p.parentPos !== null);
    const n = segs.length;
    const positions = new Float32Array(n * 6);
    const colors = new Float32Array(n * 6);

    segs.forEach((p, i) => {
      const a = p.parentPos as THREE.Vector3;
      const o = i * 6;
      positions[o] = a.x;
      positions[o + 1] = a.y;
      positions[o + 2] = a.z;
      positions[o + 3] = p.pos.x;
      positions[o + 4] = p.pos.y;
      positions[o + 5] = p.pos.z;

      // สีจางลงตามความลึกของชั้น
      const fade = p.verified ? 0.16 + 0.84 / (1 + p.level * 0.55) : 0.08;
      const r = p.color.r * fade;
      const g = p.color.g * fade;
      const b = p.color.b * fade;
      colors[o] = r;
      colors[o + 1] = g;
      colors[o + 2] = b;
      colors[o + 3] = r;
      colors[o + 4] = g;
      colors[o + 5] = b;
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return { geo, count: n };
  }, [placed]);

  useEffect(() => () => built.geo.dispose(), [built]);

  if (built.count === 0) return null;

  return (
    <lineSegments geometry={built.geo} frustumCulled={false} raycast={NO_RAYCAST}>
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={0.4}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </lineSegments>
  );
}

/* ─────────────────────────── Individual node ─────────────────────────── */

function QualifiedRing({ radius, color, spin = 0.6 }: { radius: number; color: string; spin?: number }) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame((_state, delta) => {
    if (ref.current) ref.current.rotation.z += delta * spin;
  });
  return (
    <mesh ref={ref} rotation={[Math.PI / 2, 0, 0]} raycast={NO_RAYCAST}>
      <torusGeometry args={[radius * 2.25, radius * 0.12, 8, 40]} />
      <meshBasicMaterial
        color={color}
        transparent
        opacity={0.7}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

type NodeCallbacks = {
  onHoverNode: (code: string, level: number, x: number, y: number) => void;
  onLeaveNode: () => void;
  onPick: (code: string | null) => void;
};

function NodeMesh({
  p,
  spawnRef,
  selected,
  onHoverNode,
  onLeaveNode,
  onPick,
}: { p: Placed; spawnRef: SpawnMapRef; selected: string | null } & NodeCallbacks) {
  const groupRef = useRef<THREE.Group>(null);
  const isSel = selected === p.code;

  useFrame(() => {
    const g = groupRef.current;
    if (!g) return;
    const sp = spawnRef.current.get(p.code);
    if (sp) {
      const t = Math.min(1, (performance.now() - sp.start) / SPAWN_MS);
      const e = easeOutCubic(t);
      g.position.copy(sp.from).lerp(p.pos, e);
      g.scale.setScalar(0.12 + 0.88 * e);
    } else {
      g.position.copy(p.pos);
      g.scale.setScalar(1);
    }
  });

  const handleMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      onHoverNode(p.code, p.level, event.nativeEvent.clientX, event.nativeEvent.clientY);
    },
    [p.code, p.level, onHoverNode],
  );
  const handleOut = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      onLeaveNode();
    },
    [onLeaveNode],
  );
  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      onPick(p.code);
    },
    [p.code, onPick],
  );

  return (
    <group ref={groupRef} position={p.pos.toArray()}>
      <mesh
        onPointerOver={handleMove}
        onPointerMove={handleMove}
        onPointerOut={handleOut}
        onClick={handleClick}
      >
        <sphereGeometry args={[p.radius, 18, 18]} />
        <meshStandardMaterial
          color={isSel ? HIGHLIGHT : p.color}
          emissive={isSel ? HIGHLIGHT : p.color}
          emissiveIntensity={isSel ? 1.9 : p.verified ? 1.15 : 0.4}
          roughness={0.32}
          metalness={0.15}
          toneMapped={false}
        />
      </mesh>

      {/* Aura เปลือกโปร่งแสง */}
      <mesh raycast={NO_RAYCAST}>
        <sphereGeometry args={[p.radius * 2.1, 16, 16]} />
        <meshBasicMaterial
          color={p.color}
          transparent
          opacity={p.verified ? 0.16 : 0.06}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {p.qualified && <QualifiedRing radius={p.radius} color="#fde68a" />}
      {isSel && <QualifiedRing radius={p.radius * 1.5} color="#ffffff" spin={0} />}
    </group>
  );
}

/* ─────────────────────────── Instanced nodes (LOD > 300) ─────────────────────────── */

function InstancedNodes({
  placed,
  spawnRef,
  selected,
  onHoverNode,
  onLeaveNode,
  onPick,
}: { placed: Placed[]; spawnRef: SpawnMapRef; selected: string | null } & NodeCallbacks) {
  const coreRef = useRef<THREE.InstancedMesh>(null);
  const auraRef = useRef<THREE.InstancedMesh>(null);
  const ringRef = useRef<THREE.InstancedMesh>(null);

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const qualified = useMemo(() => placed.filter((p) => p.qualified), [placed]);
  const count = placed.length;

  // ตั้งสี + ตำแหน่งเริ่มต้น (สี/ไฮไลต์เปลี่ยนตาม selection)
  useEffect(() => {
    const core = coreRef.current;
    if (core) {
      placed.forEach((p, i) => {
        core.setColorAt(i, p.code === selected ? HIGHLIGHT : p.color);
        dummy.position.copy(p.pos);
        dummy.scale.setScalar(p.radius);
        dummy.updateMatrix();
        core.setMatrixAt(i, dummy.matrix);
      });
      core.instanceMatrix.needsUpdate = true;
      if (core.instanceColor) core.instanceColor.needsUpdate = true;
    }
    const aura = auraRef.current;
    if (aura) {
      placed.forEach((p, i) => {
        aura.setColorAt(i, p.color);
        dummy.position.copy(p.pos);
        dummy.scale.setScalar(p.radius * 2.1);
        dummy.updateMatrix();
        aura.setMatrixAt(i, dummy.matrix);
      });
      aura.instanceMatrix.needsUpdate = true;
      if (aura.instanceColor) aura.instanceColor.needsUpdate = true;
    }
  }, [placed, selected, dummy]);

  useFrame(() => {
    const now = performance.now();
    const core = coreRef.current;
    const aura = auraRef.current;

    for (let i = 0; i < count; i++) {
      const p = placed[i];
      const sp = spawnRef.current.get(p.code);
      const e = sp ? easeOutCubic(Math.min(1, (now - sp.start) / SPAWN_MS)) : 1;
      const s = e >= 1 ? 1 : 0.12 + 0.88 * e;

      const x = sp && e < 1 ? sp.from.x + (p.pos.x - sp.from.x) * e : p.pos.x;
      const y = sp && e < 1 ? sp.from.y + (p.pos.y - sp.from.y) * e : p.pos.y;
      const z = sp && e < 1 ? sp.from.z + (p.pos.z - sp.from.z) * e : p.pos.z;

      dummy.position.set(x, y, z);
      if (core) {
        dummy.scale.setScalar(p.radius * s);
        dummy.updateMatrix();
        core.setMatrixAt(i, dummy.matrix);
      }
      if (aura) {
        dummy.scale.setScalar(p.radius * 2.1 * s);
        dummy.updateMatrix();
        aura.setMatrixAt(i, dummy.matrix);
      }
    }
    if (core) core.instanceMatrix.needsUpdate = true;
    if (aura) aura.instanceMatrix.needsUpdate = true;

    const ring = ringRef.current;
    if (ring) {
      const qn = qualified.length;
      for (let j = 0; j < qn; j++) {
        const p = qualified[j];
        dummy.position.copy(p.pos);
        dummy.rotation.set(Math.PI / 2, now * 0.0004 + j * 0.7, 0);
        dummy.scale.setScalar(p.radius * 2.25);
        dummy.updateMatrix();
        ring.setMatrixAt(j, dummy.matrix);
      }
      ring.instanceMatrix.needsUpdate = true;
    }
  });

  const handleMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      const id = event.instanceId;
      if (id === undefined || id < 0 || id >= placed.length) return;
      event.stopPropagation();
      const p = placed[id];
      onHoverNode(p.code, p.level, event.nativeEvent.clientX, event.nativeEvent.clientY);
    },
    [placed, onHoverNode],
  );
  const handleOut = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      event.stopPropagation();
      onLeaveNode();
    },
    [onLeaveNode],
  );
  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation();
      const id = event.instanceId;
      if (id === undefined || id < 0 || id >= placed.length) {
        onPick(null);
        return;
      }
      onPick(placed[id].code);
    },
    [placed, onPick],
  );

  return (
    <>
      <instancedMesh
        ref={coreRef}
        args={[undefined, undefined, count]}
        frustumCulled={false}
        onPointerOver={handleMove}
        onPointerMove={handleMove}
        onPointerOut={handleOut}
        onClick={handleClick}
      >
        <sphereGeometry args={[1, 14, 14]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>

      <instancedMesh ref={auraRef} args={[undefined, undefined, count]} frustumCulled={false} raycast={NO_RAYCAST}>
        <sphereGeometry args={[1, 12, 12]} />
        <meshBasicMaterial
          transparent
          opacity={0.14}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </instancedMesh>

      {qualified.length > 0 && (
        <instancedMesh
          ref={ringRef}
          args={[undefined, undefined, qualified.length]}
          frustumCulled={false}
          raycast={NO_RAYCAST}
        >
          <torusGeometry args={[1, 0.055, 8, 36]} />
          <meshBasicMaterial
            color="#fde68a"
            transparent
            opacity={0.6}
            blending={THREE.AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </instancedMesh>
      )}
    </>
  );
}

/* ─────────────────────────── Newborn FX (trail + burst) ─────────────────────────── */

function NewbornFx({ p, spawnRef }: { p: Placed; spawnRef: SpawnMapRef }) {
  // จับข้อมูลการเกิดครั้งเดียวตอน mount เพื่อไม่ให้หายไปเมื่อ spawn map ถูกล้าง
  const data = useRef<Spawn | null>(spawnRef.current.get(p.code) ?? null);

  const trailGeom = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
    return g;
  }, []);

  const burst = useMemo(() => {
    const n = 14;
    const positions = new Float32Array(n * 3);
    const dirs = new Float32Array(n * 3);
    const rng = mulberry32(hashString(p.code) || 1);
    for (let i = 0; i < n; i++) {
      const u = rng() * 2 - 1;
      const th = rng() * Math.PI * 2;
      const rxy = Math.sqrt(Math.max(0, 1 - u * u));
      dirs[i * 3] = rxy * Math.cos(th);
      dirs[i * 3 + 1] = u;
      dirs[i * 3 + 2] = rxy * Math.sin(th);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return { g, dirs, n };
  }, [p.code]);

  const burstRef = useRef<THREE.Points>(null);
  const trailMatRef = useRef<THREE.LineBasicMaterial>(null);

  useEffect(
    () => () => {
      trailGeom.dispose();
      burst.g.dispose();
    },
    [trailGeom, burst],
  );

  useFrame(() => {
    const d = data.current;
    const now = performance.now();
    const start = d ? d.start : now;
    const from = d ? d.from : p.pos;
    const t = Math.min(1, (now - start) / SPAWN_MS);
    const e = easeOutCubic(t);

    const hx = from.x + (p.pos.x - from.x) * e;
    const hy = from.y + (p.pos.y - from.y) * e;
    const hz = from.z + (p.pos.z - from.z) * e;

    const attr = trailGeom.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (attr) {
      attr.setXYZ(0, from.x, from.y, from.z);
      attr.setXYZ(1, hx, hy, hz);
      attr.needsUpdate = true;
    }
    if (trailMatRef.current) trailMatRef.current.opacity = Math.max(0, 0.65 * (1 - t));

    const pts = burstRef.current;
    if (pts) {
      const posAttr = pts.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
      if (posAttr) {
        const spread = 0.5 + e * 1.9;
        for (let i = 0; i < burst.n; i++) {
          posAttr.setXYZ(
            i,
            hx + burst.dirs[i * 3] * spread,
            hy + burst.dirs[i * 3 + 1] * spread,
            hz + burst.dirs[i * 3 + 2] * spread,
          );
        }
        posAttr.needsUpdate = true;
      }
      const mat = pts.material as THREE.PointsMaterial;
      mat.opacity = Math.max(0, 0.95 * (1 - t));
    }
  });

  return (
    <group>
      <lineSegments geometry={trailGeom} frustumCulled={false} raycast={NO_RAYCAST}>
        <lineBasicMaterial
          ref={trailMatRef}
          color={p.color}
          transparent
          opacity={0.65}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </lineSegments>
      <points ref={burstRef} geometry={burst.g} frustumCulled={false} raycast={NO_RAYCAST}>
        <pointsMaterial
          color={p.color}
          size={0.9}
          sizeAttenuation
          transparent
          opacity={0.95}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          toneMapped={false}
        />
      </points>
    </group>
  );
}

/* ─────────────────────────── Controls ─────────────────────────── */

type ControlsApi = { reset: () => void; zoom: (factor: number) => void };

type SpawnMapRef = { current: Map<string, Spawn> };
type ApiRef = { current: ControlsApi | null };

type OrbitControlsRef = React.ComponentRef<typeof OrbitControls>;

function Controls({
  apiRef,
  autoRotate,
  minDistance,
  maxDistance,
}: {
  apiRef: ApiRef;
  autoRotate: boolean;
  minDistance: number;
  maxDistance: number;
}) {
  const controlsRef = useRef<OrbitControlsRef | null>(null);
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    apiRef.current = {
      reset: () => {
        controlsRef.current?.reset();
      },
      zoom: (factor: number) => {
        const c = controlsRef.current;
        if (!c) return;
        const dir = camera.position.clone().sub(c.target).multiplyScalar(factor);
        camera.position.copy(c.target).add(dir);
        c.update();
      },
    };
    return () => {
      apiRef.current = null;
    };
  }, [apiRef, camera]);

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan
      autoRotate={autoRotate}
      autoRotateSpeed={0.4}
      minDistance={minDistance}
      maxDistance={maxDistance}
    />
  );
}

/* ─────────────────────────── Scene contents (inside Canvas) ─────────────────────────── */

function UniverseContents({
  placed,
  outerRadius,
  seed,
  selected,
  apiRef,
  autoRotate,
  spawning,
  spawnRef,
  onHoverNode,
  onLeaveNode,
  onPick,
}: {
  placed: Placed[];
  outerRadius: number;
  seed: number;
  selected: string | null;
  apiRef: ApiRef;
  autoRotate: boolean;
  spawning: string[];
  spawnRef: SpawnMapRef;
} & NodeCallbacks) {
  const useInstanced = placed.length > INSTANCED_THRESHOLD;
  const placedByCode = useMemo(() => new Map(placed.map((p) => [p.code, p])), [placed]);
  const fx = spawning.slice(0, MAX_FX);

  return (
    <>
      <ambientLight intensity={0.4} />
      <hemisphereLight args={['#bfe3ff', '#0b1220', 0.5]} />
      <pointLight position={[0, 0, 0]} intensity={2.2} distance={outerRadius * 12} decay={1.2} color="#7dd3fc" />

      <Starfield seed={seed} innerRadius={Math.max(60, outerRadius * 2.4)} />

      <Controls
        apiRef={apiRef}
        autoRotate={autoRotate}
        minDistance={Math.max(2, outerRadius * 0.25)}
        maxDistance={Math.max(40, outerRadius * 9)}
      />

      <LineWeb placed={placed} />

      {useInstanced ? (
        <InstancedNodes
          placed={placed}
          spawnRef={spawnRef}
          selected={selected}
          onHoverNode={onHoverNode}
          onLeaveNode={onLeaveNode}
          onPick={onPick}
        />
      ) : (
        <group>
          {placed.map((p) => (
            <NodeMesh
              key={p.code}
              p={p}
              spawnRef={spawnRef}
              selected={selected}
              onHoverNode={onHoverNode}
              onLeaveNode={onLeaveNode}
              onPick={onPick}
            />
          ))}
        </group>
      )}

      {fx.map((code) => {
        const p = placedByCode.get(code);
        return p ? <NewbornFx key={`fx-${code}`} p={p} spawnRef={spawnRef} /> : null;
      })}
    </>
  );
}

/* ─────────────────────────── Fallback + error boundary ─────────────────────────── */

function FallbackBox() {
  return (
    <div className="flex h-full w-full items-center justify-center p-6">
      <div className="max-w-md rounded-xl border border-sky-500/25 bg-slate-950/80 p-5 text-center text-sm text-slate-300">
        <div className="mb-2 text-base font-semibold text-sky-200">ไม่สามารถแสดงภาพ 3 มิติได้</div>
        <p className="leading-relaxed">
          อุปกรณ์หรือเบราว์เซอร์นี้ไม่รองรับ WebGL — ภาพเครือข่ายจำลองจะแสดงเป็นข้อความแทน
          (ข้อมูลทั้งหมดเป็นข้อมูลจำลองเพื่อสาธิต ไม่ใช่ตัวเลขรายได้จริง)
        </p>
      </div>
    </div>
  );
}

type BoundaryState = { failed: boolean };

class GLBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, BoundaryState> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(): void {
    // กลืน error ของ WebGL ไว้ แล้วแสดง fallback แทนการ throw
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function ControlButton({ onClick, label, children }: { onClick: () => void; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-9 w-9 items-center justify-center rounded-full border border-sky-500/30 bg-slate-950/70 text-sm text-sky-100 backdrop-blur transition hover:border-sky-400/60 hover:bg-sky-500/20"
    >
      {children}
    </button>
  );
}

/* ─────────────────────────── Main component ─────────────────────────── */

export default function NetworkUniverse3D({
  nodes,
  selected = null,
  onSelect,
  maxNodes = 4000,
  simulation = true,
  className,
}: NetworkUniverse3DProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<ControlsApi | null>(null);
  const spawnRef = useRef<Map<string, Spawn>>(new Map());
  const prevCodesRef = useRef<Set<string> | null>(null);
  const timersRef = useRef<number[]>([]);

  const [hover, setHover] = useState<{ code: string; level: number; x: number; y: number } | null>(null);
  const [spawning, setSpawning] = useState<string[]>([]);
  const [glOk, setGlOk] = useState<boolean | null>(null);
  const [autoRotate, setAutoRotate] = useState(true);

  // ตรวจ WebGL — ถ้าใช้ไม่ได้ให้ fallback (ไม่ throw)
  useEffect(() => {
    let ok = false;
    try {
      const canvas = document.createElement('canvas');
      ok = !!(
        canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl')
      );
    } catch {
      ok = false;
    }
    setGlOk(ok);
  }, []);

  useEffect(
    () => () => {
      timersRef.current.forEach((id) => window.clearTimeout(id));
      timersRef.current = [];
    },
    [],
  );

  // เลือกโหนดที่จะแสดง (ชั้นตื้นก่อนถ้าเกิน maxNodes) + จัดผังตำแหน่ง
  const { placed, outerRadius, total, truncated } = useMemo(() => {
    const seen = new Set<string>();
    const unique: UniverseNode[] = [];
    for (const n of nodes) {
      if (!seen.has(n.code)) {
        seen.add(n.code);
        unique.push(n);
      }
    }

    const limit = Math.max(1, Math.floor(maxNodes));
    let visible = unique;
    let isTruncated = false;
    if (unique.length > limit) {
      visible = [...unique]
        .sort((a, b) => a.level - b.level || a.code.localeCompare(b.code))
        .slice(0, limit);
      isTruncated = true;
    }

    const built = buildLayout(visible);
    return { placed: built.placed, outerRadius: built.outerRadius, total: unique.length, truncated: isTruncated };
  }, [nodes, maxNodes]);

  // seed ของดาว — อิงจากรหัสสมาชิกที่เล็กสุด (นิ่งพอ แม้สมาชิกเพิ่ม)
  const seed = useMemo(() => {
    if (placed.length === 0) return 0x9e3779b9;
    let minCode = placed[0].code;
    for (const p of placed) if (p.code < minCode) minCode = p.code;
    return (hashString(minCode) ^ (simulation ? 0x51ed2701 : 0)) >>> 0;
  }, [placed, simulation]);

  // ตรวจสมาชิกใหม่ด้วยการเทียบชุดรหัสเก่า/ใหม่
  useEffect(() => {
    const codes = new Set(placed.map((p) => p.code));
    if (prevCodesRef.current === null) {
      prevCodesRef.current = codes; // รอบแรกไม่ต้องอนิเมชัน
      return;
    }
    const prev = prevCodesRef.current;
    const added = placed.filter((p) => !prev.has(p.code));
    prevCodesRef.current = codes;
    if (added.length === 0) return;

    const now = performance.now();
    for (const p of added) {
      spawnRef.current.set(p.code, {
        start: now,
        from: p.parentPos ? p.parentPos.clone() : new THREE.Vector3(0, 0, 0),
      });
    }
    setSpawning((s) => [...s, ...added.map((p) => p.code)]);

    for (const p of added) {
      const id = window.setTimeout(() => {
        spawnRef.current.delete(p.code);
        setSpawning((s) => s.filter((c) => c !== p.code));
      }, SPAWN_MS + 80);
      timersRef.current.push(id);
    }
  }, [placed]);

  const handleHoverNode = useCallback((code: string, level: number, x: number, y: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    setHover({ code, level, x: rect ? x - rect.left : x, y: rect ? y - rect.top : y });
  }, []);
  const handleLeaveNode = useCallback(() => setHover(null), []);
  const handlePick = useCallback(
    (code: string | null) => {
      setHover(null);
      onSelect?.(code);
    },
    [onSelect],
  );

  const resetView = useCallback(() => {
    apiRef.current?.reset();
    setAutoRotate(true);
  }, []);
  const zoomIn = useCallback(() => apiRef.current?.zoom(0.8), []);
  const zoomOut = useCallback(() => apiRef.current?.zoom(1.25), []);
  const toggleRotate = useCallback(() => setAutoRotate((v) => !v), []);

  const wrapperClass = ['relative w-full h-full overflow-hidden bg-slate-950', className]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={containerRef} className={wrapperClass}>
      {glOk === false ? (
        <FallbackBox />
      ) : glOk === null ? (
        <div className="flex h-full w-full items-center justify-center text-sm text-slate-400">
          กำลังเตรียมพื้นที่จำลอง…
        </div>
      ) : (
        <GLBoundary fallback={<FallbackBox />}>
          <Canvas
            camera={{
              position: [outerRadius * 0.3, outerRadius * 0.85, outerRadius * 1.9],
              fov: 55,
              near: 0.1,
              far: outerRadius * 60 + 4000,
            }}
            gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
            dpr={[1, 2]}
            onCreated={({ gl }) => {
              gl.setClearColor(new THREE.Color('#020617'), 1);
            }}
            onPointerMissed={() => handlePick(null)}
          >
            <UniverseContents
              placed={placed}
              outerRadius={outerRadius}
              seed={seed}
              selected={selected}
              apiRef={apiRef}
              autoRotate={autoRotate}
              spawning={spawning}
              spawnRef={spawnRef}
              onHoverNode={handleHoverNode}
              onLeaveNode={handleLeaveNode}
              onPick={handlePick}
            />
          </Canvas>
        </GLBoundary>
      )}

      {/* ── Badge ซ้ายบน: จำนวนโหนด ── */}
      <div className="pointer-events-none absolute left-3 top-3 flex flex-col gap-1">
        <div className="rounded-md border border-sky-500/30 bg-slate-950/70 px-3 py-1.5 text-xs text-sky-100 backdrop-blur">
          แสดง {placed.length.toLocaleString('th-TH')} / {total.toLocaleString('th-TH')} {simulation ? 'โหนด' : 'สมาชิกในผัง'}
        </div>
        {truncated && (
          <div className="rounded-md border border-amber-500/30 bg-slate-950/70 px-3 py-1.5 text-[11px] text-amber-200 backdrop-blur">
            {simulation ? 'แสดงไม่ครบเพื่อประสิทธิภาพ (จำลอง)' : 'แสดงไม่ครบเพื่อประสิทธิภาพ — เลือกดูเป็นรอบชั้น'}
          </div>
        )}
      </div>

      {/* ── Badge ขวาบน: SIMULATION ── */}
      {simulation && (
        <div className="pointer-events-none absolute right-3 top-3 rounded-md border border-amber-400/50 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold tracking-wide text-amber-200 backdrop-blur">
          SIMULATION · จำลอง
        </div>
      )}

      {/* ── ปุ่มควบคุม ── */}
      {glOk && (
        <div className="absolute bottom-3 right-3 flex items-center gap-2">
          <ControlButton onClick={zoomOut} label="ซูมออก">
            −
          </ControlButton>
          <ControlButton onClick={zoomIn} label="ซูมเข้า">
            ＋
          </ControlButton>
          <ControlButton onClick={toggleRotate} label="หมุนอัตโนมัติ">
            {autoRotate ? '❙❙' : '▶'}
          </ControlButton>
          <ControlButton onClick={resetView} label="รีเซ็ตมุมมอง">
            ⟳
          </ControlButton>
        </div>
      )}

      {/* ── Tooltip ตอน hover ── */}
      {hover && glOk && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-md border border-sky-400/30 bg-slate-950/90 px-2.5 py-1.5 text-[11px] leading-tight text-sky-50 shadow-lg backdrop-blur"
          style={{ left: hover.x, top: hover.y - 12 }}
        >
          <div className="font-mono">{hover.code}</div>
          <div className="text-sky-300/80">ชั้นที่ {hover.level} {simulation ? '· ข้อมูลจำลอง' : '· สมาชิกจริงในผัง 1 แตก 5'}</div>
        </div>
      )}

      {/* ── หมายเหตุท้าย: ย้ายไปรวมในแถบข้อจำกัดของกรอบแม่ (เดิมลอยทับแถบของ NetworkSimulator) ── */}
    </div>
  );
}
