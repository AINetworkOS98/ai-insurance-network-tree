'use client';

/**
 * FinancialFreedom3DScenes — ส่วน “ภาพ 3 มิติ 2 ภาพ” ที่ต่อลงด้านล่างของหน้า /financial-freedom
 *
 * ภาพต้นแบบ 2 ภาพ → ฉาก 3 มิติ 2 ฉาก (โหลดแบบ ssr:false เพราะต้องใช้ WebGL ในเบราว์เซอร์เท่านั้น)
 *   1) อิสรภาพทางการเงินท่ามกลางธรรมชาติ  → FinancialFreedomNature3DScene
 *   2) ผังงานอัตโนมัติ (n8n)              → AutomationGraph3DScene
 * ทุกฉาก: ลาก = หมุน · สกรอลล์ = ซูม · คลิกวัตถุ/โหนด = ดูคำอธิบาย · ปุ่ม ⛶ = ขยายเต็มจอ (Esc ย่อกลับ)
 */

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FREEDOM_CARDS, GRAPH_NODES } from '@/lib/financialFreedom3d';

const NatureScene = dynamic(() => import('./FinancialFreedomNature3DScene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-amber-400/30 border-t-amber-400" />
        <p className="text-sm text-amber-100/70">กำลังประกอบฉากธรรมชาติ 3 มิติ…</p>
      </div>
    </div>
  ),
});

const GraphScene = dynamic(() => import('./AutomationGraph3DScene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-sky-400/30 border-t-sky-400" />
        <p className="text-sm text-sky-100/70">กำลังประกอบผังงาน 3 มิติ…</p>
      </div>
    </div>
  ),
});

function Ctrl({ children, active, onClick, title }: { children: React.ReactNode; active?: boolean; onClick: () => void; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-[11px] font-bold backdrop-blur transition ${
        active ? 'bg-sky-500/90 text-white' : 'bg-white/10 text-white/85 hover:bg-white/20'
      }`}
    >
      {children}
    </button>
  );
}

/** ทำให้การ์ดฉากขยายเต็มจอได้ (พร้อมปุ่ม Esc / ออกจาก fullscreen) */
function useFullscreen() {
  const ref = useRef<HTMLDivElement | null>(null);
  const [full, setFull] = useState(false);

  const toggle = useCallback(() => {
    const el = ref.current;
    const next = !full;
    setFull(next);
    try {
      if (next) {
        const p = el?.requestFullscreen?.();
        if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
      } else if (document.fullscreenElement) {
        const p = document.exitFullscreen?.();
        if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => {});
      }
    } catch {
      /* เบราว์เซอร์ไม่อนุญาต fullscreen — ใช้ขนาดปกติ */
    }
  }, [full]);

  useEffect(() => {
    const onFs = () => { if (!document.fullscreenElement) setFull(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !document.fullscreenElement) setFull(false); };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  return { ref, full, toggle };
}

export default function FinancialFreedom3DScenes() {
  /* ── ฉากที่ 1: ธรรมชาติ + การ์ด 5 ใบ ── */
  const [card, setCard] = useState<number | null>(null);
  const [pausedA, setPausedA] = useState(false);
  const [rotateA, setRotateA] = useState(true);
  const [daylight, setDaylight] = useState(false);
  const fsA = useFullscreen();

  /* ── ฉากที่ 2: ผังงาน n8n ── */
  const [nodeId, setNodeId] = useState<string | null>(null);
  const [pausedB, setPausedB] = useState(false);
  const [rotateB, setRotateB] = useState(true);
  const fsB = useFullscreen();

  const selectedCard = card === null ? null : FREEDOM_CARDS[card];
  const selectedNode = nodeId === null ? null : GRAPH_NODES.find((n) => n.id === nodeId) ?? null;

  return (
    <div className="mt-6 mb-10">
      {/* ── หัวเรื่องของส่วนนี้ ── */}
      <div className="text-center mb-6">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-indigo-50 text-indigo-700 text-sm font-semibold border border-indigo-200">
          <span>🧊</span> ภาพ 3 มิติ 2 ภาพ · จากภาพต้นแบบที่ส่งมา
        </div>
        <h2 className="mt-4 text-2xl md:text-3xl font-bold text-slate-900">ต่อลงมา — ภาพต้นแบบ 2 ภาพ กลายเป็นฉาก 3 มิติหมุนได้</h2>
        <p className="mt-2 text-slate-600 leading-relaxed max-w-3xl mx-auto text-sm md:text-base">
          ทั้งสองฉากเป็น <strong>ภาพ 3 มิติที่สร้างขึ้นในเบราว์เซอร์ (three.js)</strong> โดยใช้โครงสร้าง สี และข้อความ
          จากภาพต้นแบบทั้ง 2 ภาพ — ลากเพื่อหมุน · สกรอลล์เพื่อซูม · คลิกวัตถุหรือโหนดเพื่อดูคำอธิบาย
          และกด <strong>⛶ เต็มจอ</strong> เพื่อชมแบบเต็มหน้าจอ (Esc เพื่อย่อกลับ)
        </p>
      </div>

      {/* ═══════════ ฉากที่ 1 ═══════════ */}
      <div className="max-w-4xl mx-auto mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <img
            src="/3d-src/financial-freedom-nature.png"
            alt="ภาพต้นแบบ อิสรภาพทางการเงินท่ามกลางธรรมชาติ"
            className="h-14 w-14 rounded-xl object-cover border border-slate-200 shadow-sm"
          />
          <div>
            <div className="text-[11px] font-bold tracking-[0.2em] text-amber-600">ภาพต้นแบบที่ 1 · 3 มิติ</div>
            <h3 className="text-xl md:text-2xl font-bold text-slate-900">🌅 อิสรภาพทางการเงินท่ามกลางธรรมชาติ</h3>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-600 leading-relaxed">
          ทะเลสาบยามพระอาทิตย์ตก · ภูเขาและเกาะกลางน้ำ · ป้ายไม้ 4 ป้าย <em>More Time · More Choices · Better Life · Financial Freedom</em> ·
          มุมพักผ่อนบนดาดฟ้าไม้ (คนนั่งหันหลังสวมหมวกฟาง โต๊ะไม้ แล็ปท็อป แก้วกาแฟ <em>“Good Choices = Freedom”</em> สมุด <em>Plan · Save · Invest · Live Freely</em>)
          และการ์ด 5 ใบที่ลอยอยู่เหนือน้ำ — กดที่การ์ดเพื่ออ่านความหมาย
        </p>
      </div>

      <div ref={fsA.ref} className={`overflow-hidden rounded-3xl border border-amber-300/40 bg-[#0d2740] shadow-sm ${fsA.full ? 'fixed inset-0 z-[2147483647] rounded-none border-0' : ''}`}>
        <div className={`relative w-full ${fsA.full ? 'h-[100dvh]' : 'h-[62vh] min-h-[460px]'}`}>
          <NatureScene
            cards={FREEDOM_CARDS}
            selected={card}
            onSelect={setCard}
            paused={pausedA}
            autoRotate={rotateA}
            daylight={daylight ? 1 : 0}
          />
          <div className="absolute right-3 top-3 flex flex-wrap justify-end gap-1.5">
            <Ctrl active={rotateA} onClick={() => setRotateA((v) => !v)} title="หมุนฉากอัตโนมัติ">
              {rotateA ? '↻ หมุนอัตโนมัติ: เปิด' : '↻ หมุนอัตโนมัติ: ปิด'}
            </Ctrl>
            <Ctrl active={pausedA} onClick={() => setPausedA((v) => !v)} title="หยุด/เล่นแอนิเมชัน">
              {pausedA ? '▶ เล่นแอนิเมชัน' : '⏸ หยุดแอนิเมชัน'}
            </Ctrl>
            <Ctrl active={daylight} onClick={() => setDaylight((v) => !v)} title="สลับแสงพระอาทิตย์ตก / กลางวัน">
              {daylight ? '☀️ กลางวัน' : '🌅 พระอาทิตย์ตก'}
            </Ctrl>
            <Ctrl active={fsA.full} onClick={fsA.toggle} title="ขยายเต็มจอ (Esc เพื่อย่อกลับ)">
              {fsA.full ? '⤡ ย่อกลับ' : '⛶ เต็มจอ'}
            </Ctrl>
          </div>
          <div className="pointer-events-none absolute left-3 top-3 max-w-[44%] rounded-2xl border border-amber-300/40 bg-[#08243c]/70 px-4 py-3 backdrop-blur-sm">
            <div className="text-[13px] font-bold leading-6 text-amber-300">“อิสรภาพทางการเงิน ไม่ใช่แค่การมีเงินมากมาย —</div>
            <div className="text-[13px] font-bold leading-6 text-amber-100">
              แต่คือการมี <span className="text-amber-300">ทางเลือก</span> ที่จะใช้เวลาของคุณอย่างที่คุณต้องการ”
            </div>
            <div className="mt-1 text-[10px] font-semibold tracking-[0.2em] text-amber-200/80">FINANCIAL FREEDOM · MORE TIME · MORE CHOICES · BETTER LIFE</div>
          </div>
          <div className="pointer-events-none absolute bottom-3 left-3 max-w-[75%] text-[11px] leading-5 text-white/70">
            ลาก = หมุนฉาก · สกรอลล์ = ซูม · คลิกการ์ด 5 ใบ = อ่านความหมาย · ป้ายไม้คือทางเลือก 4 ข้อจากภาพต้นแบบ
          </div>
        </div>
      </div>

      {/* การ์ด 5 ใบของฉากที่ 1 (กดแล้วเลือกในฉาก 3 มิติด้วย) */}
      <div className="max-w-4xl mx-auto mt-4">
        <div className="flex flex-wrap gap-1.5">
          {FREEDOM_CARDS.map((c, i) => (
            <button
              key={c.th}
              type="button"
              onClick={() => setCard(card === i ? null : i)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                card === i ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {c.icon} {c.th}
            </button>
          ))}
        </div>
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 min-h-[86px]">
          {selectedCard ? (
            <>
              <div className="text-sm font-black text-amber-900">
                {selectedCard.icon} {selectedCard.th} · <span className="text-amber-700">{selectedCard.en}</span>
              </div>
              <p className="mt-1.5 text-[13px] leading-6 text-amber-900/90">{selectedCard.detail}</p>
            </>
          ) : (
            <p className="text-[13px] leading-6 text-amber-900/70">
              กดการ์ดด้านบน (หรือคลิกการ์ดที่ลอยอยู่ในฉาก 3 มิติ) เพื่ออ่านความหมายของแต่ละข้อ
            </p>
          )}
        </div>
      </div>

      {/* ═══════════ ฉากที่ 2 ═══════════ */}
      <div className="max-w-4xl mx-auto mt-12 mb-6">
        <div className="flex flex-wrap items-center gap-3">
          <img
            src="/3d-src/n8n-workflow-source.jpg"
            alt="ภาพต้นแบบ ผังงานอัตโนมัติ n8n"
            className="h-14 w-14 rounded-xl object-cover border border-slate-200 shadow-sm"
          />
          <div>
            <div className="text-[11px] font-bold tracking-[0.2em] text-sky-600">ภาพต้นแบบที่ 2 · 3 มิติ</div>
            <h3 className="text-xl md:text-2xl font-bold text-slate-900">⚙️ ผังงานอัตโนมัติ (n8n) แบบ 3 มิติ</h3>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-600 leading-relaxed">
          โหนดทั้ง 9 ตัวจากภาพต้นแบบ (<em>Start · Webhook · Google Sheets · IF · Set · Function · HTTP Request · Email · Slack</em>)
          ยกขึ้นเป็นกล่อง 3 มิติ สีตามภาพ พร้อมไอคอนบนหน้าโหนด ป้ายชื่อใต้โหนด และ
          <strong> ลูกไฟที่วิ่งตามท่อเชื่อม</strong> ให้เห็นว่างานไหลจากโหนดหนึ่งไปอีกโหนดหนึ่งอย่างไร —
          กดที่โหนดเพื่ออ่านว่าขั้นนั้นทำงานอะไรในระบบจริง
        </p>
      </div>

      <div ref={fsB.ref} className={`overflow-hidden rounded-3xl border border-sky-400/30 bg-[#050b18] shadow-sm ${fsB.full ? 'fixed inset-0 z-[2147483647] rounded-none border-0' : ''}`}>
        <div className={`relative w-full ${fsB.full ? 'h-[100dvh]' : 'h-[62vh] min-h-[460px]'}`}>
          <GraphScene selected={nodeId} onSelect={setNodeId} paused={pausedB} autoRotate={rotateB} />
          <div className="absolute right-3 top-3 flex flex-wrap justify-end gap-1.5">
            <Ctrl active={rotateB} onClick={() => setRotateB((v) => !v)} title="หมุนฉากอัตโนมัติ">
              {rotateB ? '↻ หมุนอัตโนมัติ: เปิด' : '↻ หมุนอัตโนมัติ: ปิด'}
            </Ctrl>
            <Ctrl active={pausedB} onClick={() => setPausedB((v) => !v)} title="หยุด/เล่นแอนิเมชัน">
              {pausedB ? '▶ เล่นการไหล' : '⏸ หยุดการไหล'}
            </Ctrl>
            <Ctrl active={fsB.full} onClick={fsB.toggle} title="ขยายเต็มจอ (Esc เพื่อย่อกลับ)">
              {fsB.full ? '⤡ ย่อกลับ' : '⛶ เต็มจอ'}
            </Ctrl>
          </div>
          <div className="pointer-events-none absolute bottom-3 left-3 max-w-[75%] text-[11px] leading-5 text-white/60">
            ลาก = หมุน · สกรอลล์ = ซูม · คลิกโหนด = ดูคำอธิบาย · ลูกไฟที่วิ่ง = งานที่ไหลผ่านแต่ละขั้น
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto mt-4">
        <div className="flex flex-wrap gap-1.5">
          {GRAPH_NODES.map((n) => (
            <button
              key={n.id}
              type="button"
              onClick={() => setNodeId(nodeId === n.id ? null : n.id)}
              className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                nodeId === n.id ? 'text-[#050b18]' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              style={nodeId === n.id ? { background: n.color } : undefined}
            >
              {n.label}
            </button>
          ))}
        </div>
        <div className="mt-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-4 min-h-[86px]">
          {selectedNode ? (
            <>
              <div className="text-sm font-black text-sky-900">
                {selectedNode.label}
                <span className="ml-2 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-sky-700">
                  {selectedNode.kind === 'trigger' ? 'ตัวเริ่มงาน' : selectedNode.kind === 'logic' ? 'แยกเงื่อนไข' : selectedNode.kind === 'data' ? 'ข้อมูล' : selectedNode.kind === 'notify' ? 'แจ้งเตือน' : 'ทำงาน'}
                </span>
              </div>
              <p className="mt-1.5 text-[13px] leading-6 text-sky-900/90">{selectedNode.th}</p>
            </>
          ) : (
            <p className="text-[13px] leading-6 text-sky-900/70">
              กดชื่อโหนดด้านบน (หรือคลิกโหนดในฉาก 3 มิติ) เพื่ออ่านคำอธิบายของขั้นนั้น ·
              ผังนี้จำลองจากภาพต้นแบบเพื่อการสาธิต ไม่ได้เชื่อมกับเวิร์กโฟลว์ที่รันอยู่จริง —
              ดูเวิร์กโฟลว์จริงของระบบได้ที่ <Link href="/n8n/workflow-3d" className="font-bold underline">หน้า “กระบวนการทำงาน 3D”</Link>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
