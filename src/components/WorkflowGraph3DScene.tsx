'use client';

/**
 * WorkflowGraph3DScene — ฉาก 3 มิติของ "เวิร์กโฟลว์ n8n หนึ่งตัว" (three.js + @react-three/fiber)
 *
 * ● โหนดทุกตัวในเวิร์กโฟลว์กลายเป็นทรงกลมพลังงาน สีตามชนิดโหนด (Trigger / HTTP / Code / AI / Data / Notify / Logic)
 * ● แกน z = ชั้นการไหลของงาน (คำนวณจากเส้นเชื่อมจริง) → เห็น "ความลึก" ของกระบวนการ
 * ● จุดพลังงานวิ่งไปตามเส้นเชื่อม = งานที่ไหลจากโหนดหนึ่งไปอีกโหนดหนึ่ง
 * ● อ่านอย่างเดียว: ไม่เรียก API, ไม่เขียนข้อมูล, ไม่แตะ n8n
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { CATEGORIES, categoryOf, computeLayout, prettyType, type WorkflowGraph } from '@/lib/workflowGraphs';

/* ── ป้ายชื่อโหนด: วาดบน canvas แล้วใช้เป็น sprite (ไม่ต้องโหลดฟอนต์ภายนอก) ── */
function makeLabel(text: string, sub: string, color: string) {
  const w = 1024, h = 176;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  const r = 30;
  ctx.beginPath();
  ctx.moveTo(r, 6); ctx.lineTo(w - r, 6);
  ctx.quadraticCurveTo(w - 6, 6, w - 6, r + 6);
  ctx.lineTo(w - 6, h - r - 6);
  ctx.quadraticCurveTo(w - 6, h - 6, w - r, h - 6);
  ctx.lineTo(r, h - 6);
  ctx.quadraticCurveTo(6, h - 6, 6, h - r - 6);
  ctx.lineTo(6, r + 6);
  ctx.quadraticCurveTo(6, 6, r, 6);
  ctx.closePath();
  ctx.fillStyle = 'rgba(2,6,23,0.84)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = color;
  ctx.stroke();

  const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max - 1)}…` : s);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 54px "Segoe UI", Tahoma, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(cut(text, 30), 30, h / 2 - 20);
  ctx.fillStyle = color;
  ctx.font = '36px "Segoe UI", Tahoma, sans-serif';
  ctx.fillText(cut(sub, 40), 30, h / 2 + 34);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(7.6, 1.3, 1);
  return sprite;
}

function Stars() {
  const geo = useMemo(() => {
    const N = 1100;
    const arr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 70 + Math.random() * 260;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      arr[i * 3] = r * Math.sin(ph) * Math.cos(th);
      arr[i * 3 + 1] = r * Math.cos(ph);
      arr[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  }, []);
  const ref = useRef<THREE.Points>(null);
  useFrame((_, d) => { if (ref.current) ref.current.rotation.y += d * 0.01; });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={1.15} color="#93c5fd" sizeAttenuation transparent opacity={0.7} depthWrite={false} />
    </points>
  );
}

/* ── โหนดในเวิร์กโฟลว์ ── */
function Node3D({
  node, pos, isTrigger, deg, selected, hovered, showLabel,
  onSelect, onHover,
}: {
  node: WorkflowGraph['nodes'][number];
  pos: [number, number, number];
  isTrigger: boolean;
  deg: number;
  selected: boolean;
  hovered: boolean;
  showLabel: boolean;
  onSelect: (name: string) => void;
  onHover: (name: string | null) => void;
}) {
  const cat = categoryOf(node.type);
  const base = Math.max(0.85, Math.min(2.3, 1.0 + deg * 0.13));
  const mesh = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const label = useMemo(
    () => (showLabel ? makeLabel(node.name, `${cat.icon} ${prettyType(node.type)}`, cat.color) : null),
    [node.name, node.type, cat.color, cat.icon, showLabel],
  );
  useEffect(() => () => { label?.material.map?.dispose(); label?.material.dispose(); }, [label]);

  useFrame((state, d) => {
    const t = state.clock.elapsedTime;
    const active = selected || hovered;
    const pulse = 1 + Math.sin(t * (isTrigger ? 3.2 : 1.6) + pos[0] * 0.1) * 0.07;
    const target = (selected ? 1.75 : hovered ? 1.4 : 1) * base * pulse;
    if (mesh.current) {
      const s = mesh.current.scale;
      s.lerp(new THREE.Vector3(target, target, target), Math.min(1, d * 6));
      mesh.current.rotation.y += d * 0.3;
    }
    if (halo.current) {
      const hs = (active ? 1.55 : 1.2) + Math.sin(t * 2 + pos[1]) * 0.06;
      halo.current.scale.setScalar(hs * base);
      (halo.current.material as THREE.MeshBasicMaterial).opacity = active ? 0.3 : 0.12;
    }
    if (ring.current) ring.current.rotation.z += d * (selected ? 1.2 : 0.35);
  });

  return (
    <group position={pos}>
      <mesh
        ref={mesh}
        onClick={(e) => { e.stopPropagation(); onSelect(node.name); }}
        onPointerOver={(e) => { e.stopPropagation(); onHover(node.name); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { onHover(null); document.body.style.cursor = 'auto'; }}
      >
        <icosahedronGeometry args={[1.15, cat.key === 'note' ? 0 : 2]} />
        <meshStandardMaterial
          color={cat.color}
          emissive={cat.color}
          emissiveIntensity={selected ? 1.6 : hovered ? 1.15 : node.disabled ? 0.25 : 0.6}
          roughness={0.28}
          metalness={0.3}
          flatShading
          transparent={node.disabled}
          opacity={node.disabled ? 0.45 : 1}
        />
      </mesh>

      <mesh ref={halo}>
        <sphereGeometry args={[1.15, 16, 16]} />
        <meshBasicMaterial color={cat.color} transparent opacity={0.12} depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>

      {(isTrigger || selected) && (
        <mesh ref={ring} rotation={[1.3, 0.15, 0]}>
          <torusGeometry args={[2.1, 0.035, 8, 72]} />
          <meshBasicMaterial color={cat.color} transparent opacity={selected ? 0.95 : 0.5} />
        </mesh>
      )}

      {label && <primitive object={label} position={[0, 2.55, 0]} />}
    </group>
  );
}

/* ── เส้นเชื่อม + จุดพลังงานวิ่ง ── */
function Edges({
  wf, layout, paused, selected,
}: {
  wf: WorkflowGraph;
  layout: ReturnType<typeof computeLayout>;
  paused: boolean;
  selected: string | null;
}) {
  const idx = useMemo(() => {
    const m = new Map<string, number>();
    wf.nodes.forEach((n, i) => m.set(n.name, i));
    return m;
  }, [wf]);

  const line = useMemo(() => {
    const segs: number[] = [];
    const cols: number[] = [];
    for (const e of wf.edges) {
      const a = idx.get(e.from); const b = idx.get(e.to);
      if (a == null || b == null) continue;
      const p1 = layout.pos[a]; const p2 = layout.pos[b];
      segs.push(...p1, ...p2);
      const c = new THREE.Color(categoryOf(wf.nodes[a].type).color);
      cols.push(c.r, c.g, c.b, c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs), 3));
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(cols), 3));
    return g;
  }, [wf, idx, layout]);

  const flow = useMemo(() => {
    const pairs: Array<[number[], number[]]> = [];
    for (const e of wf.edges) {
      const a = idx.get(e.from); const b = idx.get(e.to);
      if (a == null || b == null) continue;
      pairs.push([layout.pos[a], layout.pos[b]]);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pairs.length * 3), 3));
    return { pairs, geo: g };
  }, [wf, idx, layout]);

  const pts = useRef<THREE.Points>(null);
  const offsets = useMemo(() => flow.pairs.map((_, i) => ((i * 37) % 100) / 100), [flow]);

  useFrame((state) => {
    if (paused || !pts.current || !flow.pairs.length) return;
    const attr = pts.current.geometry.getAttribute('position') as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const base = state.clock.elapsedTime * 0.32;
    for (let i = 0; i < flow.pairs.length; i++) {
      const [p1, p2] = flow.pairs[i];
      const t = (base + offsets[i]) % 1;
      arr[i * 3] = p1[0] + (p2[0] - p1[0]) * t;
      arr[i * 3 + 1] = p1[1] + (p2[1] - p1[1]) * t;
      arr[i * 3 + 2] = p1[2] + (p2[2] - p1[2]) * t;
    }
    attr.needsUpdate = true;
  });

  return (
    <group>
      <lineSegments geometry={line}>
        <lineBasicMaterial vertexColors transparent opacity={selected ? 0.42 : 0.62} blending={THREE.AdditiveBlending} depthWrite={false} />
      </lineSegments>
      <points ref={pts} geometry={flow.geo}>
        <pointsMaterial size={0.55} color="#e0f2fe" transparent opacity={0.95} sizeAttenuation depthWrite={false} />
      </points>
    </group>
  );
}

/* ── จัดกล้องให้พอดีเมื่อเปลี่ยนเวิร์กโฟลว์ ── */
function CamRig({ radius }: { radius: number }) {
  const { camera } = useThree();
  useEffect(() => {
    const d = THREE.MathUtils.clamp(radius * 2.3 + 16, 34, 320);
    camera.position.set(d * 0.32, d * 0.52, d * 0.86);
    camera.lookAt(0, 0, 0);
  }, [radius, camera]);
  return null;
}

export type WorkflowGraph3DSceneProps = {
  wf: WorkflowGraph;
  selected: string | null;
  onSelect: (name: string | null) => void;
  paused: boolean;
  autoRotate: boolean;
  showLabels: boolean;
};

export default function WorkflowGraph3DScene({
  wf, selected, onSelect, paused, autoRotate, showLabels,
}: WorkflowGraph3DSceneProps) {
  const layout = useMemo(() => computeLayout(wf), [wf]);
  const [hovered, setHovered] = useState<string | null>(null);

  const deg = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of wf.edges) {
      m.set(e.from, (m.get(e.from) || 0) + 1);
      m.set(e.to, (m.get(e.to) || 0) + 1);
    }
    return m;
  }, [wf]);

  const triggers = useMemo(
    () => new Set(wf.nodes.filter((n) => categoryOf(n.type).key === 'trigger').map((n) => n.name)),
    [wf],
  );

  const camDist = useMemo(() => THREE.MathUtils.clamp(layout.radius * 2.3 + 16, 34, 320), [layout.radius]);

  return (
    <Canvas
      camera={{ fov: 50, near: 0.1, far: 6000, position: [camDist * 0.32, camDist * 0.52, camDist * 0.86] }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
      dpr={[1, 1.6]}
      onCreated={({ gl }) => gl.setClearColor(new THREE.Color('#020617'), 1)}
      onPointerMissed={() => onSelect(null)}
      style={{ touchAction: 'none' }}
      className="h-full w-full"
    >
      <ambientLight intensity={0.8} />
      <directionalLight position={[18, 28, 20]} intensity={1.4} />
      <pointLight position={[-20, -8, 16]} intensity={160} color="#38bdf8" distance={120} />
      <pointLight position={[16, 14, -20]} intensity={130} color="#f472b6" distance={120} />
      <fog attach="fog" args={['#020617', 80, 300]} />

      <CamRig radius={layout.radius} />
      <Stars />
      <Edges wf={wf} layout={layout} paused={paused} selected={selected} />

      {wf.nodes.map((n, i) => (
        <Node3D
          key={n.name}
          node={n}
          pos={layout.pos[i]}
          isTrigger={triggers.has(n.name)}
          deg={deg.get(n.name) || 0}
          selected={selected === n.name}
          hovered={hovered === n.name}
          showLabel={showLabels}
          onSelect={onSelect}
          onHover={setHovered}
        />
      ))}

      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        enablePan
        autoRotate={autoRotate && !paused}
        autoRotateSpeed={0.7}
        minDistance={10}
        maxDistance={420}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}
