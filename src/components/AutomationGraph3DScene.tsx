'use client';

/**
 * AutomationGraph3DScene — “ผังงานอัตโนมัติ (n8n)” แบบ 3 มิติ
 * แปลงภาพต้นแบบ (ภาพที่ 2 · แคปเจอร์หน้าจอเวิร์กโฟลว์ n8n) เป็นฉาก 3 มิติ:
 *   ● โหนดทั้ง 9 ตัวตามภาพ (Start · Webhook · Google Sheets · IF · Set · Function · HTTP Request · Email · Slack)
 *     กลายเป็นกล่องเหลี่ยมมน 3 มิติ สีตรงตามภาพ พร้อมไอคอนบนหน้าโหนดและป้ายชื่อด้านล่าง
 *   ● เส้นเชื่อมต่อแบบท่อ 3 มิติ + ลูกไฟวิ่งตามทิศทางงาน + ลูกศรปลายทาง
 *   ● หัวฉาก “n8n · Execute Workflow · main” ตามภาพต้นแบบ
 *   ● คลิกโหนดเพื่อดูคำอธิบายภาษาไทย · ลากเพื่อหมุน · สกรอลล์เพื่อซูม
 * โครงสร้างผังในฉากนี้จำลองจากภาพต้นแบบเพื่อการสาธิต (ไม่ใช่เวิร์กโฟลว์ที่กำลังรันอยู่จริง)
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { GRAPH_EDGES, GRAPH_NODES, type GraphNode } from '@/lib/financialFreedom3d';

export { GRAPH_EDGES, GRAPH_NODES };
export type { GraphNode };

/* ───────────────────────── ไอคอนโหนด (วาดด้วย canvas) ───────────────────────── */

function makeIconTexture(node: GraphNode) {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 16;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  switch (node.id) {
    case 'start': {
      ctx.beginPath();
      ctx.moveTo(92, 66);
      ctx.lineTo(190, 128);
      ctx.lineTo(92, 190);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'webhook': {
      // จุดต่อ 3 จุด + เส้นโค้ง (สัญลักษณ์ webhook)
      ctx.beginPath();
      ctx.arc(86, 150, 26, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(176, 104, 24, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(150, 186, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(86, 150);
      ctx.bezierCurveTo(60, 96, 120, 60, 176, 104);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(150, 186);
      ctx.bezierCurveTo(206, 150, 190, 96, 176, 104);
      ctx.stroke();
      break;
    }
    case 'sheets': {
      ctx.beginPath();
      ctx.rect(64, 52, 128, 152);
      ctx.lineWidth = 14;
      ctx.stroke();
      for (let i = 1; i <= 3; i++) {
        ctx.beginPath();
        ctx.moveTo(64, 52 + i * 38);
        ctx.lineTo(192, 52 + i * 38);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(128, 52);
      ctx.lineTo(128, 204);
      ctx.stroke();
      break;
    }
    case 'if': {
      // ลูกศรแยกทาง 2 ทาง
      ctx.beginPath();
      ctx.moveTo(52, 128);
      ctx.lineTo(120, 128);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(120, 128);
      ctx.lineTo(160, 74);
      ctx.lineTo(204, 74);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(120, 128);
      ctx.lineTo(160, 182);
      ctx.lineTo(204, 182);
      ctx.stroke();
      [74, 182].forEach((y) => {
        ctx.beginPath();
        ctx.moveTo(204, y);
        ctx.lineTo(178, y - 18);
        ctx.lineTo(178, y + 18);
        ctx.closePath();
        ctx.fill();
      });
      break;
    }
    case 'set': {
      for (let i = 0; i < 3; i++) {
        const w = 130 - i * 18;
        ctx.beginPath();
        ctx.rect(62 + i * 9, 70 + i * 44, w, 26);
        ctx.lineWidth = 0;
        ctx.fill();
      }
      ctx.lineWidth = 0;
      break;
    }
    case 'func': {
      ctx.font = 'bold 150px "Consolas","Segoe UI",monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 0;
      ctx.fillText('{ }', 128, 132);
      break;
    }
    case 'http': {
      ctx.beginPath();
      ctx.moveTo(128, 56);
      ctx.lineTo(128, 168);
      ctx.lineWidth = 18;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(70, 118);
      ctx.lineTo(128, 178);
      ctx.lineTo(186, 118);
      ctx.stroke();
      ctx.beginPath();
      ctx.rect(56, 190, 144, 16);
      ctx.fill();
      break;
    }
    case 'email': {
      ctx.beginPath();
      ctx.rect(52, 76, 152, 108);
      ctx.lineWidth = 16;
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(56, 84);
      ctx.lineTo(128, 142);
      ctx.lineTo(200, 84);
      ctx.stroke();
      break;
    }
    case 'slack': {
      const bars: Array<[number, number, number, number, string]> = [
        [96, 46, 26, 96, '#f87171'],
        [140, 46, 26, 96, '#60a5fa'],
        [46, 140, 96, 26, '#fbbf24'],
        [46, 96, 96, 26, '#4ade80'],
      ];
      bars.forEach(([x, y, w, h, col]) => {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 12);
        ctx.fill();
      });
      break;
    }
    default:
      break;
  }
  const t = new THREE.CanvasTexture(c);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function makeLabelSprite(text: string, sub?: string) {
  const w = 640, h = sub ? 200 : 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 68px "Segoe UI",Tahoma,sans-serif';
  ctx.fillText(text, w / 2, sub ? 66 : h / 2);
  if (sub) {
    ctx.fillStyle = 'rgba(203,213,225,0.9)';
    ctx.font = '40px "Sarabun","Segoe UI",Tahoma,sans-serif';
    ctx.fillText(sub, w / 2, 138);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  // depthTest: false → ป้ายชื่อไม่ถูกกล่องโหนดด้านหน้าบัง (ทำหน้าที่เหมือนป้าย HUD ในฉาก)
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false }));
  sprite.renderOrder = 20;
  sprite.scale.set(3.6, (3.6 * h) / w, 1);
  return sprite;
}

function makeHeaderSprite() {
  const w = 1024, h = 260;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, w, h);
  // โลโก้ n8n
  ctx.fillStyle = '#ff6d5a';
  [[86, 150, 26], [150, 96, 22], [150, 204, 22]].forEach(([x, y, r]) => {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.strokeStyle = '#ff6d5a';
  ctx.lineWidth = 13;
  ctx.beginPath();
  ctx.moveTo(86, 150);
  ctx.bezierCurveTo(60, 96, 116, 74, 150, 96);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(86, 150);
  ctx.bezierCurveTo(64, 204, 116, 226, 150, 204);
  ctx.stroke();
  // ชื่อ
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 96px "Segoe UI",Tahoma,sans-serif';
  ctx.textBaseline = 'middle';
  ctx.fillText('n8n', 196, 152);

  // ปุ่ม Execute Workflow
  ctx.fillStyle = 'rgba(255,255,255,0.08)';
  ctx.beginPath();
  ctx.roundRect(420, 74, 470, 108, 22);
  ctx.fill();
  ctx.strokeStyle = 'rgba(148,163,184,0.6)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(420, 74, 470, 108, 22);
  ctx.stroke();
  ctx.fillStyle = '#f1f5f9';
  ctx.font = 'bold 58px "Segoe UI",Tahoma,sans-serif';
  ctx.fillText('Execute Workflow', 470, 130);
  ctx.fillStyle = '#94a3b8';
  ctx.font = '44px "Segoe UI",Tahoma,sans-serif';
  ctx.fillText('▾', 836, 130);

  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(20, (20 * h) / w, 1);
  return sprite;
}

/* ───────────────────────── โหนด 3 มิติ ───────────────────────── */

function Node3D({
  node, selected, hovered, onSelect, onHover, paused,
}: {
  node: GraphNode;
  selected: boolean;
  hovered: boolean;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  paused: boolean;
}) {
  const icon = useMemo(() => makeIconTexture(node), [node]);
  const label = useMemo(() => makeLabelSprite(node.label), [node.label]);
  const ring = useRef<THREE.Mesh>(null);
  const group = useRef<THREE.Group>(null);
  const active = selected || hovered;

  useEffect(() => () => {
    icon.dispose();
    label.material.map?.dispose();
    label.material.dispose();
  }, [icon, label]);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;
    if (!paused && group.current) {
      group.current.position.y = node.pos[1] + Math.sin(t * 0.9 + node.pos[0] * 0.3) * 0.14;
    }
    if (ring.current && !paused) ring.current.rotation.z += dt * (node.kind === 'trigger' ? 0.9 : 0.35);
  });

  return (
    <group ref={group} position={node.pos} rotation={[0, -0.42, 0]}>
      <mesh
        onClick={(e) => { e.stopPropagation(); onSelect(selected ? null : node.id); }}
        onPointerOver={(e) => { e.stopPropagation(); onHover(node.id); document.body.style.cursor = 'pointer'; }}
        onPointerOut={() => { onHover(null); document.body.style.cursor = 'auto'; }}
      >
        <boxGeometry args={[2.4, 2.4, 0.6]} />
        <meshStandardMaterial
          color={node.color}
          emissive={node.color}
          emissiveIntensity={active ? 0.75 : 0.28}
          roughness={0.35}
          metalness={0.25}
        />
      </mesh>

      {/* กรอบเรืองแสง */}
      <mesh position={[0, 0, -0.02]} scale={active ? 1.16 : 1.06}>
        <boxGeometry args={[2.4, 2.4, 0.56]} />
        <meshBasicMaterial color={node.color} transparent opacity={active ? 0.34 : 0.14} blending={THREE.AdditiveBlending} depthWrite={false} />
      </mesh>

      {/* ไอคอนบนหน้าโหนด */}
      <mesh position={[0, 0, 0.33]}>
        <planeGeometry args={[1.35, 1.35]} />
        <meshBasicMaterial map={icon} transparent toneMapped={false} />
      </mesh>

      {/* ป้ายชื่อใต้โหนด */}
      <primitive object={label} position={[-0.45, -1.85, 0.55]} />

      {/* วงแหวนสำหรับโหนดเริ่มงาน */}
      {node.kind === 'trigger' && (
        <mesh ref={ring} rotation={[0, 0, 0]}>
          <torusGeometry args={[1.95, 0.055, 8, 64]} />
          <meshBasicMaterial color="#fef3c7" transparent opacity={0.7} />
        </mesh>
      )}
    </group>
  );
}

/* ───────────────────────── เส้นเชื่อม 3 มิติ + ลูกไฟวิ่ง ───────────────────────── */

function Edge3D({
  from, to, paused, dim,
}: {
  from: [number, number, number];
  to: [number, number, number];
  paused: boolean;
  dim: boolean;
}) {
  const { curve, tube, dot, arrow } = useMemo(() => {
    // ตัดหัว-ท้ายให้เส้นออกจาก "ขอบกล่อง" ไม่ใช่ใจกลางโหนด (จะได้เห็นลูกศรชี้เข้าโหนด)
    const a0 = new THREE.Vector3(...from);
    const b0 = new THREE.Vector3(...to);
    const dirV = b0.clone().sub(a0).normalize();
    const a = a0.clone().add(dirV.clone().multiplyScalar(1.45));
    const b = b0.clone().sub(dirV.clone().multiplyScalar(1.45));
    const mid = a.clone().lerp(b, 0.5);
    // ยกโค้งขึ้นเล็กน้อยให้เห็นมิติความลึก
    mid.y += Math.abs(b.x - a.x) * 0.16 + 0.6;
    mid.z += 1.6;
    const cv = new THREE.QuadraticBezierCurve3(a, mid, b);
    const geo = new THREE.TubeGeometry(cv, 40, 0.075, 8, false);
    const d = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 12), new THREE.MeshBasicMaterial({ color: '#e0f2fe' }));
    const dir = cv.getTangentAt(0.99).normalize();
    const ar = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 12), new THREE.MeshBasicMaterial({ color: '#cbd5e1' }));
    ar.position.copy(cv.getPointAt(0.995));
    ar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    return { curve: cv, tube: geo, dot: d, arrow: ar };
  }, [from, to]);

  useEffect(() => () => {
    tube.dispose();
    dot.geometry.dispose();
    (dot.material as THREE.Material).dispose();
    arrow.geometry.dispose();
    (arrow.material as THREE.Material).dispose();
  }, [tube, dot, arrow]);

  const t = useRef(Math.random());
  useFrame((_, dt) => {
    if (paused) return;
    t.current = (t.current + dt * 0.28) % 1;
    const p = curve.getPointAt(t.current);
    dot.position.copy(p);
  });

  return (
    <group>
      <mesh geometry={tube}>
        <meshBasicMaterial color="#94a3b8" transparent opacity={dim ? 0.12 : 0.42} depthWrite={false} />
      </mesh>
      <primitive object={dot} />
      <primitive object={arrow} />
    </group>
  );
}

/* ───────────────────────── พื้นหลัง ───────────────────────── */

function Backdrop() {
  const glow = useMemo(() => {
    const c = document.createElement('canvas');
    c.width = 512;
    c.height = 512;
    const ctx = c.getContext('2d')!;
    const g = ctx.createRadialGradient(256, 256, 0, 256, 256, 256);
    g.addColorStop(0, 'rgba(56,189,248,0.5)');
    g.addColorStop(0.45, 'rgba(139,92,246,0.22)');
    g.addColorStop(1, 'rgba(2,6,23,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 512, 512);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, []);
  return (
    <mesh position={[0, 2, -22]} scale={2.6}>
      <planeGeometry args={[26, 26]} />
      <meshBasicMaterial map={glow} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </mesh>
  );
}

function Dust({ paused }: { paused: boolean }) {
  const N = 190;
  const geo = useMemo(() => {
    const arr = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 60;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 28;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 30 - 6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    return g;
  }, []);
  const ref = useRef<THREE.Points>(null);
  useFrame((state) => {
    if (!ref.current || paused) return;
    ref.current.rotation.y = state.clock.elapsedTime * 0.015;
  });
  return (
    <points ref={ref} geometry={geo}>
      <pointsMaterial size={0.1} color="#7dd3fc" transparent opacity={0.45} sizeAttenuation depthWrite={false} />
    </points>
  );
}

/* ───────────────────────── ฉากหลัก ───────────────────────── */

export type AutomationGraph3DSceneProps = {
  selected: string | null;
  onSelect: (id: string | null) => void;
  paused: boolean;
  autoRotate: boolean;
};

function Scene({ selected, onSelect, paused, autoRotate }: AutomationGraph3DSceneProps) {
  const [hovered, setHovered] = useState<string | null>(null);
  const header = useMemo(() => makeHeaderSprite(), []);
  useEffect(() => () => {
    header.material.map?.dispose();
    header.material.dispose();
  }, [header]);

  const byId = useMemo(() => {
    const m = new Map<string, GraphNode>();
    GRAPH_NODES.forEach((n) => m.set(n.id, n));
    return m;
  }, []);

  const highlights = useMemo(() => {
    if (!selected) return new Set<string>();
    const s = new Set<string>([selected]);
    GRAPH_EDGES.forEach(([a, b]) => {
      if (a === selected) s.add(b);
      if (b === selected) s.add(a);
    });
    return s;
  }, [selected]);

  return (
    <>
      <color attach="background" args={['#050b18']} />
      <fog attach="fog" args={['#050b18', 40, 120]} />
      <ambientLight intensity={0.85} />
      <directionalLight position={[12, 22, 18]} intensity={1.5} />
      <pointLight position={[-16, -10, 14]} intensity={180} color="#8b5cf6" distance={90} />
      <pointLight position={[16, 12, -10]} intensity={150} color="#38bdf8" distance={90} />

      <Backdrop />
      <Dust paused={paused} />

      {GRAPH_EDGES.map(([a, b]) => (
        <Edge3D
          key={`${a}-${b}`}
          from={byId.get(a)!.pos}
          to={byId.get(b)!.pos}
          paused={paused}
          dim={!!selected && !(highlights.has(a) && highlights.has(b))}
        />
      ))}

      {GRAPH_NODES.map((n) => (
        <Node3D
          key={n.id}
          node={n}
          selected={selected === n.id}
          hovered={hovered === n.id}
          onSelect={onSelect}
          onHover={setHovered}
          paused={paused}
        />
      ))}

      <primitive object={header} position={[0, 13.8, -4]} />

      <OrbitControls
        enableDamping
        dampingFactor={0.08}
        enablePan
        autoRotate={autoRotate && !paused}
        autoRotateSpeed={0.5}
        minDistance={14}
        maxDistance={78}
        target={[0, 2, 0]}
      />
    </>
  );
}

export default function AutomationGraph3DScene(props: AutomationGraph3DSceneProps) {
  return (
    <Canvas
      camera={{ fov: 50, near: 0.1, far: 800, position: [6, 13, 33] }}
      gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', stencil: false }}
      dpr={[1, 1.7]}
      onCreated={({ gl }) => gl.setClearColor(new THREE.Color('#050b18'), 1)}
      onPointerMissed={() => props.onSelect(null)}
      style={{ touchAction: 'none' }}
      className="h-full w-full"
    >
      <Scene {...props} />
    </Canvas>
  );
}
