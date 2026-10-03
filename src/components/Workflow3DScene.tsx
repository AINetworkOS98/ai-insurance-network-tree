'use client';

/**
 * Workflow3DScene — ฉาก 3 มิติแสดง "กระบวนการทำงาน" ของระบบ (three.js + @react-three/fiber)
 *
 * ● ใช้ข้อมูลขั้นตอนจริงจาก src/lib/workflow3d.ts (อ่านจากโค้ดในโปรเจกต์: API/Worker/EventOutbox)
 * ● กดที่โหนดเพื่อดูรายละเอียด · ลากเพื่อหมุน · สกรอลล์เพื่อซูม
 * ● ไม่เรียก API และไม่เขียนข้อมูลใด ๆ — เป็นฉากอธิบายเพื่อให้สมาชิกนำไปทำตาม
 */

import { useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { WorkflowStep } from '@/lib/workflow3d';

const RADIUS = 9.5;
const Y_STEP = 2.35;

function nodePosition(i: number, total: number): [number, number, number] {
  const t = total > 1 ? i / (total - 1) : 0;
  const angle = -0.75 + t * Math.PI * 2.05;
  const y = (i - (total - 1) / 2) * Y_STEP;
  return [Math.cos(angle) * RADIUS, y, Math.sin(angle) * RADIUS];
}

/* ── ป้ายชื่อโหนด (วาดด้วย canvas → sprite: ไม่ต้องโหลดฟอนต์จากภายนอก) ── */
function makeLabelSprite(step: WorkflowStep) {
  const w = 1024, h = 200;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  const r = 34;
  ctx.beginPath();
  ctx.moveTo(r, 6);
  ctx.lineTo(w - r, 6);
  ctx.quadraticCurveTo(w - 6, 6, w - 6, r + 6);
  ctx.lineTo(w - 6, h - r - 6);
  ctx.quadraticCurveTo(w - 6, h - 6, w - r, h - 6);
  ctx.lineTo(r, h - 6);
  ctx.quadraticCurveTo(6, h - 6, 6, h - r - 6);
  ctx.lineTo(6, r + 6);
  ctx.quadraticCurveTo(6, 6, r, 6);
  ctx.closePath();
  ctx.fillStyle = 'rgba(2,6,23,0.82)';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.strokeStyle = step.color;
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 62px "Segoe UI", Tahoma, sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${step.n}. ${step.title}`, 34, h / 2 - 12);
  ctx.fillStyle = step.color;
  ctx.font = '38px "Segoe UI", Tahoma, sans-serif';
  ctx.fillText(step.actor.slice(0, 52), 34, h / 2 + 54);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(7.4, 1.45, 1);
  return sprite;
}

/* ── ดาวพื้นหลัง ── */
function Stars() {
  const geo = useMemo(() => {
    const N = 900;
    const arr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 60 + Math.random() * 190;
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
  useFrame((_, d) => { if (ref.current) ref.current.rotation.y += d * 0.012; });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={1.1} color="#93c5fd" sizeAttenuation transparent opacity={0.75} depthWrite={false} />
    </points>
  );
}

/* ── โหนดหนึ่งขั้นตอน ── */
function Node3D({
  step, index, total, selected, onSelect,
}: {
  step: WorkflowStep; index: number; total: number; selected: boolean;
  onSelect: (n: number) => void;
}) {
  const pos = useMemo(() => nodePosition(index, total), [index, total]);
  const mesh = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const [hover, setHover] = useState(false);
  const label = useMemo(() => makeLabelSprite(step), [step]);
  const col = useMemo(() => new THREE.Color(step.color), [step.color]);

  useFrame((state, d) => {
    const t = state.clock.elapsedTime;
    const pulse = 1 + Math.sin(t * 1.6 + index) * 0.06;
    const target = (selected ? 1.55 : hover ? 1.32 : 1) * pulse;
    if (mesh.current) {
      mesh.current.scale.lerp(new THREE.Vector3(target, target, target), Math.min(1, d * 6));
      mesh.current.rotation.y += d * 0.35;
      mesh.current.rotation.x += d * 0.12;
    }
    if (ring.current) ring.current.rotation.z += d * (selected ? 1.1 : 0.4);
  });

  return (
    <group position={pos}>
      <mesh
        ref={mesh}
        onClick={(e) => { e.stopPropagation(); onSelect(step.n); }}
        onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { setHover(false); document.body.style.cursor = 'auto'; }}
      >
        <icosahedronGeometry args={[1.5, 2]} />
        <meshStandardMaterial
          color={col}
          emissive={col}
          emissiveIntensity={selected ? 1.5 : hover ? 1.1 : 0.55}
          roughness={0.25}
          metalness={0.35}
          flatShading
        />
      </mesh>

      <mesh ref={ring} rotation={[1.25, 0.2, 0]}>
        <torusGeometry args={[2.55, 0.035, 8, 72]} />
        <meshBasicMaterial color={col} transparent opacity={selected ? 0.95 : 0.45} />
      </mesh>

      <mesh position={[0, -2.9, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.55, 0.72, 32]} />
        <meshBasicMaterial color={col} transparent opacity={0.22} side={THREE.DoubleSide} />
      </mesh>

      <primitive object={label} position={[0, 2.75, 0]} />
    </group>
  );
}

/* ── เส้นทาง + หัวพลังงานวิ่งไปตามขั้นตอน ── */
function FlowPath({ total, paused }: { total: number; paused: boolean }) {
  const curve = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < total; i++) pts.push(new THREE.Vector3(...nodePosition(i, total)));
    return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.35);
  }, [total]);

  const tube = useMemo(() => new THREE.TubeGeometry(curve, 400, 0.075, 10, false), [curve]);
  const p1 = useRef<THREE.Mesh>(null);
  const p2 = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    if (paused) return;
    const t = (state.clock.elapsedTime * 0.11) % 1;
    const t2 = (t + 0.5) % 1;
    if (p1.current) p1.current.position.copy(curve.getPointAt(t));
    if (p2.current) p2.current.position.copy(curve.getPointAt(t2));
  });

  return (
    <group>
      <mesh geometry={tube}>
        <meshBasicMaterial color="#1d4ed8" transparent opacity={0.5} />
      </mesh>
      <mesh ref={p1}>
        <sphereGeometry args={[0.34, 16, 16]} />
        <meshBasicMaterial color="#e0f2fe" />
      </mesh>
      <mesh ref={p2}>
        <sphereGeometry args={[0.24, 16, 16]} />
        <meshBasicMaterial color="#7dd3fc" transparent opacity={0.85} />
      </mesh>
    </group>
  );
}

export type Workflow3DSceneProps = {
  steps: WorkflowStep[];
  selected: number | null;
  onSelect: (n: number | null) => void;
  paused: boolean;
  autoRotate: boolean;
};

export default function Workflow3DScene({ steps, selected, onSelect, paused, autoRotate }: Workflow3DSceneProps) {
  return (
    <Canvas
      camera={{ fov: 50, near: 0.1, far: 4000, position: [2, 7, 36] }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
      dpr={[1, 1.5]}
      onCreated={({ gl }) => gl.setClearColor(new THREE.Color('#020617'), 1)}
      onPointerMissed={() => onSelect(null)}
      style={{ touchAction: 'none' }}
      className="h-full w-full"
    >
      <ambientLight intensity={0.75} />
      <directionalLight position={[16, 26, 18]} intensity={1.5} />
      <pointLight position={[-18, -6, 14]} intensity={140} color="#38bdf8" distance={90} />
      <pointLight position={[14, 12, -18]} intensity={120} color="#f472b6" distance={90} />
      <fog attach="fog" args={['#020617', 52, 130]} />

      <Stars />
      <FlowPath total={steps.length} paused={paused} />
      {steps.map((s, i) => (
        <Node3D
          key={s.n}
          step={s}
          index={i}
          total={steps.length}
          selected={selected === s.n}
          onSelect={onSelect}
        />
      ))}
      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        enablePan={false}
        autoRotate={autoRotate && !paused}
        autoRotateSpeed={0.75}
        minDistance={14}
        maxDistance={72}
        minPolarAngle={0.35}
        maxPolarAngle={Math.PI - 0.35}
        target={[0, 0, 0]}
      />
    </Canvas>
  );
}
