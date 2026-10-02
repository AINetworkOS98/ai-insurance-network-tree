'use client';

import React, { useEffect, useMemo, useState } from 'react';

const DISCLAIMER =
  'ตัวเลขทั้งหมดในส่วนนี้เป็นการจำลอง/สมมติเพื่อวางแผนเท่านั้น ไม่ใช่การรับประกันรายได้ ผลตอบแทน หรือผลลัพธ์จริง และไม่ใช่ข้อมูลสมาชิกจริงในระบบ';

/**
 * ส่วน "1 แตก 5 – Future Network Simulator" (แบบย่อ) สำหรับต่อท้ายหน้า /financial-freedom
 * - ปรับค่าแบบ real-time ได้ (จำนวนชั้น / แตกต่อกี่คน) แล้วเห็นตัวเลขเปลี่ยนทันที
 * - ปุ่มเปิดหน้า Dashboard 3D เต็มรูปแบบที่ /network-simulator
 */
export default function FutureNetworkTeaser() {
  const [branch, setBranch] = useState(5);
  const [layers, setLayers] = useState(6);
  const [allowed, setAllowed] = useState<boolean | null>(null);

  // ส่วนนี้เปิดให้เฉพาะสมาชิกที่เข้าสู่ระบบ — ผู้ที่ยังไม่ล็อกอินจะไม่เห็นเลย
  useEffect(() => {
    fetch('/api/sim/stats', { cache: 'no-store' })
      .then((r) => setAllowed(r.ok))
      .catch(() => setAllowed(false));
  }, []);

  const plan = useMemo(() => {
    const rows: { level: number; count: number; cumulative: number }[] = [];
    let count = 1;
    let cumulative = 0;
    for (let l = 1; l <= layers; l++) {
      const n = Math.round(count);
      cumulative += n;
      rows.push({ level: l, count: n, cumulative });
      count = n * branch;
    }
    return rows;
  }, [branch, layers]);

  if (allowed !== true) return null;

  return (
    <section className="border-t border-slate-800 bg-slate-950 py-12 text-slate-100">
      <div className="mx-auto max-w-5xl px-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-sky-400">Future Network Simulator</p>
        <h2 className="text-2xl font-bold sm:text-3xl">1 แตก {branch} – จำลองอนาคตเครือข่ายของทีม</h2>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          ทดลองว่าโครงสร้างทีมแบบ <span className="font-semibold text-sky-300">1 แตก {branch}</span> จะขยายออกไปได้กี่ชั้น กี่คน — เพื่อใช้ <span className="font-semibold text-slate-200">วางแผนและทดลองสมมติฐาน</span> เท่านั้น
        </p>

        {/* ── ปรับค่า real-time ── */}
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <span className="flex items-center justify-between text-sm text-slate-300">
              <span>แตกต่อกี่คน (1 → N)</span>
              <span className="text-lg font-bold text-sky-300">{branch}</span>
            </span>
            <input type="range" min={2} max={9} value={branch} onChange={(e) => setBranch(Number(e.target.value))} className="mt-3 w-full accent-sky-400" />
            <span className="mt-1 flex justify-between text-[10px] text-slate-500"><span>2</span><span>9</span></span>
          </label>
          <label className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            <span className="flex items-center justify-between text-sm text-slate-300">
              <span>จำนวนชั้นที่จำลอง</span>
              <span className="text-lg font-bold text-sky-300">{layers}</span>
            </span>
            <input type="range" min={2} max={10} value={layers} onChange={(e) => setLayers(Number(e.target.value))} className="mt-3 w-full accent-sky-400" />
            <span className="mt-1 flex justify-between text-[10px] text-slate-500"><span>2</span><span>10</span></span>
          </label>
        </div>

        {/* ── ตารางชั้น (จำลอง) ── */}
        <div className="mt-6 overflow-hidden rounded-2xl border border-slate-800">
          <table className="w-full text-sm">
            <thead className="bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th className="px-4 py-2 text-left">Layer</th>
                <th className="px-4 py-2 text-right">สมาชิกในชั้น (จำลอง)</th>
                <th className="px-4 py-2 text-right">สะสม</th>
              </tr>
            </thead>
            <tbody>
              {plan.map((r) => (
                <tr key={r.level} className="border-t border-slate-800/70">
                  <td className="px-4 py-2 text-slate-300">Layer {r.level}</td>
                  <td className="px-4 py-2 text-right font-semibold text-sky-300">{r.count.toLocaleString('th-TH')}</td>
                  <td className="px-4 py-2 text-right text-slate-400">{r.cumulative.toLocaleString('th-TH')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <a href="/network-simulator" className="rounded-xl bg-sky-500 px-5 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-sky-400">
            🌌 เปิด Future Network Simulator (จักรวาล 3D)
          </a>
          <span className="text-xs text-slate-500">🔒 สำหรับสมาชิกที่เข้าสู่ระบบ — ทดลองสร้างสมาชิกทีละคน ดูการขยายตัว ตรวจเงื่อนไขเลื่อนตำแหน่ง และ Timeline เหตุการณ์</span>
        </div>

        <p className="mt-4 rounded-xl border border-slate-800 bg-slate-900/40 p-3 text-[11px] leading-relaxed text-slate-400">
          <strong className="text-slate-300">หมายเหตุ:</strong> {DISCLAIMER} · ตัวเลขในตารางนี้คำนวณจากสมมติฐานที่คุณตั้ง ไม่ได้มาจากจำนวนสมาชิกจริงในระบบ
        </p>
      </div>
    </section>
  );
}
