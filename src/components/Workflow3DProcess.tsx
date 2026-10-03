'use client';

/**
 * Workflow3DProcess — หน้า "กระบวนการทำงาน 3D" (คำสั่งเจ้าของระบบ)
 *
 * จุดประสงค์: ให้สมาชิกเห็นกระบวนการทำงานจริงของระบบแบบ 3 มิติ แล้วนำไปสร้างระบบของตัวเองต่อ
 * ● ฉาก 3D โหลดแบบ ssr:false (เฉพาะเบราว์เซอร์ที่ไม่ต้องรอเซิร์ฟเวอร์)
 * ● ข้อมูลขั้นตอนทั้งหมดมาจาก src/lib/workflow3d.ts (อ่านจากโค้ดจริงของโปรเจกต์)
 * ● มีปุ่มคัดลอกกระบวนการทั้งหมด เพื่อเอาไปวางในแผน/แชต AI แล้วสร้างระบบของตัวเอง
 */

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { WORKFLOW_STEPS, workflowPlainText } from '@/lib/workflow3d';

const Workflow3DScene = dynamic(() => import('./Workflow3DScene'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center">
      <div className="text-center">
        <div className="mx-auto mb-3 h-10 w-10 animate-spin rounded-full border-2 border-sky-400/30 border-t-sky-400" />
        <p className="text-sm text-slate-400">กำลังประกอบฉากกระบวนการทำงาน 3 มิติ…</p>
      </div>
    </div>
  ),
});

export default function Workflow3DProcess() {
  const [selected, setSelected] = useState<number | null>(1);
  const [paused, setPaused] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [copied, setCopied] = useState('');

  const step = useMemo(() => WORKFLOW_STEPS.find(s => s.n === selected) || null, [selected]);

  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(''), 2500);
    } catch {
      setCopied('error');
      setTimeout(() => setCopied(''), 2500);
    }
  };

  return (
    <div className="bg-soft-white pb-24">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        {/* ── หัวเรื่อง ── */}
        <div className="mb-5 rounded-3xl border border-[#dbeafe] bg-gradient-to-r from-[#0b1220] via-[#111c33] to-[#0b1220] p-6 text-white shadow-lg">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[11px] font-semibold tracking-widest text-sky-300">
                <span>กระบวนการทำงาน 3 มิติ</span>
                <span className="text-white/40">•</span>
                <span>n8n Workflow Automation</span>
              </div>
              <h1 className="mt-1 text-2xl font-black sm:text-3xl">🧊 ดูกระบวนการทำงาน แล้วเอาไปสร้างระบบของคุณเอง</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/75">
                ฉากนี้แสดง <strong className="text-white">เส้นทางงานจริง</strong> ของระบบนี้ทีละขั้น ตั้งแต่ผู้สนใจกรอกฟอร์ม
                → บันทึกพร้อมกันในธุรกรรมเดียว → คิวทนทาน <code className="rounded bg-white/10 px-1">EventOutbox</code> → Worker ตามเวลา
                → n8n ทำงานต่อ → แจ้งเตือน → ตำแหน่ง/รายได้ → Audit Log · กดที่ลูกบอลแต่ละลูกเพื่ออ่านรายละเอียดและสิ่งที่ต้องทำเพื่อสร้างระบบของคุณเอง
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => copy(workflowPlainText(), 'all')}
                className="rounded-full bg-white px-4 py-2 text-xs font-bold text-[#0b1220] shadow hover:bg-white/90"
              >
                {copied === 'all' ? '✓ คัดลอกแล้ว' : '⧉ คัดลอกกระบวนการทั้งหมด'}
              </button>
              <Link
                href="/n8n_automation"
                className="rounded-full border border-white/25 px-4 py-2 text-xs font-bold text-white hover:bg-white/10"
              >
                ⚙️ หน้า n8n Automation
              </Link>
            </div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
          {/* ── ฉาก 3D ── */}
          <div className="overflow-hidden rounded-3xl border border-[#dbeafe] bg-[#020617] shadow-sm">
            <div className="relative h-[520px] w-full sm:h-[580px]">
              <Workflow3DScene
                steps={WORKFLOW_STEPS}
                selected={selected}
                onSelect={setSelected}
                paused={paused}
                autoRotate={autoRotate}
              />

              {/* ปุ่มควบคุมมุมมอง */}
              <div className="absolute right-3 top-3 flex flex-wrap gap-1.5">
                <button
                  onClick={() => setAutoRotate(v => !v)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold backdrop-blur ${autoRotate ? 'bg-sky-500/90 text-white' : 'bg-white/10 text-white/80 hover:bg-white/20'}`}
                >
                  {autoRotate ? '↻ หมุนอัตโนมัติ: เปิด' : '↻ หมุนอัตโนมัติ: ปิด'}
                </button>
                <button
                  onClick={() => setPaused(v => !v)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold backdrop-blur ${paused ? 'bg-white/10 text-white/80 hover:bg-white/20' : 'bg-emerald-500/85 text-white'}`}
                >
                  {paused ? '▶ เล่นการไหล' : '⏸ หยุดชั่วคราว'}
                </button>
              </div>

              {/* คำอธิบายท้ายฉาก */}
              <div className="pointer-events-none absolute bottom-3 left-3 max-w-[70%] text-[11px] leading-5 text-white/60">
                ลาก = หมุนฉาก · สกรอลล์ = ซูม · คลิกโหนด = ดูรายละเอียด
                {' · '}
                <span className="text-sky-300">จุดวิ่ง = งานที่ไหลผ่านแต่ละขั้น</span>
              </div>
            </div>

            {/* แถบขั้นตอนด้านล่างฉาก */}
            <div className="flex flex-wrap gap-1.5 border-t border-white/10 bg-[#050b18] p-3">
              {WORKFLOW_STEPS.map(s => (
                <button
                  key={s.n}
                  onClick={() => setSelected(s.n)}
                  className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition ${selected === s.n ? 'text-[#0b1220]' : 'text-white/70 hover:text-white'}`}
                  style={selected === s.n ? { background: s.color } : { background: 'rgba(255,255,255,0.08)' }}
                >
                  {s.n}. {s.title}
                </button>
              ))}
            </div>
          </div>

          {/* ── รายละเอียดขั้นตอน ── */}
          <div className="space-y-3">
            <div className="rounded-3xl border border-[#dbeafe] bg-white p-5 shadow-sm">
              {step ? (
                <>
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-2xl text-lg" style={{ background: `${step.color}22` }}>
                      {step.icon}
                    </span>
                    <div>
                      <div className="text-[11px] font-bold tracking-widest text-slate-400">ขั้นตอนที่ {step.n} / {WORKFLOW_STEPS.length}</div>
                      <h2 className="text-base font-black text-[#0f172a]">{step.title}</h2>
                    </div>
                  </div>

                  <div className="mt-3 space-y-2 text-xs">
                    <div className="rounded-xl bg-[#f8fafc] p-3">
                      <div className="font-bold text-slate-500">ผู้ทำงาน</div>
                      <div className="text-slate-700">{step.actor}</div>
                    </div>
                    <div className="rounded-xl bg-[#f8fafc] p-3">
                      <div className="font-bold text-slate-500">อยู่ตรงไหนของระบบ</div>
                      <div className="text-slate-700">{step.where}</div>
                    </div>
                    {step.api && (
                      <div className="rounded-xl bg-[#f8fafc] p-3">
                        <div className="font-bold text-slate-500">API / ข้อมูลที่เกี่ยวข้อง</div>
                        <code className="break-words text-[11px] text-sky-700">{step.api}</code>
                      </div>
                    )}
                  </div>

                  <ul className="mt-3 space-y-1.5">
                    {step.detail.map((d, i) => (
                      <li key={i} className="flex gap-2 text-[13px] leading-6 text-slate-700">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: step.color }} />
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/60 p-3">
                    <div className="text-xs font-black text-emerald-800">🛠 ทำตามเพื่อสร้างระบบของคุณ</div>
                    <ul className="mt-1.5 space-y-1">
                      {step.repeat.map((r, i) => (
                        <li key={i} className="text-[12px] leading-6 text-emerald-900">• {r}</li>
                      ))}
                    </ul>
                  </div>

                  <button
                    onClick={() => copy(
                      [`${step.n}. ${step.title}`, `ผู้ทำงาน: ${step.actor}`, `อยู่ที่: ${step.where}`, step.api ? `API: ${step.api}` : '',
                        ...step.detail.map(d => `• ${d}`), 'ทำตาม:', ...step.repeat.map(r => `  - ${r}`)].filter(Boolean).join('\n'),
                      `s${step.n}`,
                    )}
                    className="mt-3 w-full rounded-full bg-[#0b1220] px-4 py-2 text-xs font-bold text-white hover:bg-[#16233d]"
                  >
                    {copied === `s${step.n}` ? '✓ คัดลอกขั้นตอนนี้แล้ว' : '⧉ คัดลอกขั้นตอนนี้ไปใช้'}
                  </button>
                </>
              ) : (
                <p className="text-sm text-slate-500">คลิกที่โหนดในฉาก 3 มิติ เพื่อดูรายละเอียดของขั้นตอนนั้น</p>
              )}
            </div>

            {/* สรุปเส้นทางงาน */}
            <div className="rounded-3xl border border-[#dbeafe] bg-white p-5 shadow-sm">
              <h3 className="text-sm font-black text-[#0f172a]">เส้นทางงานแบบบรรทัดเดียว</h3>
              <p className="mt-2 text-[12px] leading-6 text-slate-600">
                ฟอร์มบนเว็บ → <span className="text-sky-700">API</span> →{' '}
                <span className="text-sky-700">Transaction เดียว</span> (บัญชี + PDPA + ตำแหน่ง + log) →{' '}
                <span className="text-amber-600">EventOutbox</span> (idempotent) →{' '}
                <span className="text-emerald-600">Worker 1 นาที</span> (Bearer CRON_SECRET) →{' '}
                <span className="text-pink-600">n8n Workflow</span> → แจ้งเตือนผู้แนะนำ/ผู้ดูแล →{' '}
                ตำแหน่ง 1:5 + รายได้ (มีเวอร์ชันกติกา) → <span className="text-slate-500">Audit Log</span>
              </p>
              <div className="mt-3 rounded-2xl bg-[#f8fafc] p-3 text-[11px] leading-5 text-slate-500">
                หลักคิด 5 ข้อที่ยกไปใช้ได้ทันที: ① อย่าเก็บข้อมูลก่อนได้ความยินยอม ② งานที่ต้องสำเร็จพร้อมกันให้อยู่ในธุรกรรมเดียว
                ③ งานปลายทางให้ฝากคิว (อย่าทำในคำขอของผู้ใช้) ④ ให้ทุกงานรันซ้ำได้ (idempotent) ⑤ ทุกการแก้ข้อมูลต้องมี log
              </div>
            </div>

            <div className="rounded-3xl border border-[#dbeafe] bg-white p-5 shadow-sm">
              <h3 className="text-sm font-black text-[#0f172a]">หน้าอื่นที่เกี่ยวข้อง</h3>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <Link href="/n8n_automation" className="rounded-full bg-[#eff6ff] px-3 py-1.5 font-bold text-sky-700 hover:bg-[#dbeafe]">⚙️ n8n Automation</Link>
                <Link href="/n8n/workflows" className="rounded-full bg-[#eff6ff] px-3 py-1.5 font-bold text-sky-700 hover:bg-[#dbeafe]">🔗 Webhook URLs</Link>
                <Link href="/network/1x5-autopilot" className="rounded-full bg-[#eff6ff] px-3 py-1.5 font-bold text-sky-700 hover:bg-[#dbeafe]">🌐 ผัง 1 แตก 5 อัตโนมัติ</Link>
                <Link href="/financial-freedom" className="rounded-full bg-[#eff6ff] px-3 py-1.5 font-bold text-sky-700 hover:bg-[#dbeafe]">🌟 อิสรภาพทางการเงิน</Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
