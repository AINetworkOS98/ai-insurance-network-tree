'use client';

import { useState } from 'react';
import Link from 'next/link';

/**
 * /admin/ai-autopilot — หน้าควบคุมท่อ "AI Content Autopilot"
 * ท่อ: ChatGPT (prompt ล่าสุด) → Google Flow (สร้างวิดีโอ) → ดาวน์โหลด → TikTok @aka989._ + คำอธิบาย + ลิงก์สมัคร
 *
 * เรียกใช้ผ่าน API ของแอปเอง (/api/admin/run-autopilot) — ฝั่งเซิร์ฟเวอร์จึงต่อไปยัง n8n ในเครื่อง
 * ผ่าน tunnel ด้วย CRON_SECRET (เบราว์เซอร์ไม่เห็นความลับ) ใช้ได้จากทุกที่ที่ล็อกอินเป็นผู้ดูแลระบบ
 */

const API = '/api/admin/run-autopilot';
const N8N_LOCAL = process.env.NEXT_PUBLIC_N8N_BASE || 'http://localhost:5679';
const WORKFLOW_ID = '2cca7ada-ca9f-4c95-94c0-7151c15574bb';
const CHATGPT_CONV = '6aca4737-38dc-83ec-a8f4-804d8115de25';
const FLOW_PROJECT = '5d5bdf40-93fb-4ff0-9d18-37839f7beb2b';

type RunResult = {
  ok?: boolean; step?: string; promptLen?: number; videoFile?: string;
  posted?: boolean; error?: string; tiktok?: any; subject?: string;
  exitCode?: number; stdoutTail?: string; stderrTail?: string;
};

export default function AiAutopilotPage() {
  const [busy, setBusy] = useState<'' | 'dry' | 'post'>('');
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState('');

  async function run(mode: 'dry' | 'post') {
    setBusy(mode); setError(''); setResult(null);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(mode === 'post'
          ? { post: true, conversation: CHATGPT_CONV, project: FLOW_PROJECT, aspect: '9:16' }
          : { post: false, skipGenerate: true, conversation: CHATGPT_CONV, project: FLOW_PROJECT, aspect: '9:16' }),
      });
      const text = await res.text();
      let data: RunResult = {};
      try { data = JSON.parse(text); } catch { data = { error: text.slice(0, 400) }; }
      setResult(data);
    } catch (e: any) {
      setError(String(e?.message || e));
    } finally { setBusy(''); }
  }

  const tt = result && result.tiktok && typeof result.tiktok === 'object' ? result.tiktok : null;

  return (
    <div className="min-h-screen bg-[#f7fbff]">
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-slate-800">🎬 AI Content Autopilot</h1>
          <Link href="/admin" className="px-4 py-2 rounded-full bg-white border border-blue-100 text-sky-700 text-sm">← กลับหน้าผู้ดูแล</Link>
        </div>

        <div className="card p-6">
          <p className="text-slate-700 text-sm leading-6">
            ท่ออัตโนมัติ: <b>ChatGPT (prompt ล่าสุด)</b> → <b>Google Flow</b> สร้างวิดีโอ 720p แนวตั้ง 8 วินาที →
            ดาวน์โหลด → <b>โพสต์ TikTok @aka989._</b> พร้อมคำอธิบายเครือข่าย + ลิงก์สมัครสมาชิก →
            ส่งรายงานผลทางเมล และบันทึก log ลงระบบ
          </p>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={() => run('dry')}
              disabled={busy !== ''}
              className="px-4 py-2 rounded-full bg-white border border-blue-200 text-sky-700 text-sm font-medium disabled:opacity-50"
            >
              {busy === 'dry' ? '⏳ กำลังตรวจ...' : '🧪 ทดสอบ (ไม่สร้างวิดีโอ/ไม่โพสต์)'}
            </button>
            <button
              onClick={() => run('post')}
              disabled={busy !== ''}
              className="px-4 py-2 rounded-full bg-sky-500 text-white text-sm font-medium disabled:opacity-50"
            >
              {busy === 'post' ? '⏳ กำลังสร้างและโพสต์... (1-3 นาที)' : '🚀 สร้างวิดีโอ + โพสต์ TikTok'}
            </button>
            <a href={`${N8N_LOCAL}/workflow/${WORKFLOW_ID}`} target="_blank" rel="noreferrer"
               className="px-4 py-2 rounded-full bg-white border border-blue-100 text-slate-600 text-sm">
              เปิด workflow ใน n8n ↗ (เครื่องนี้เท่านั้น)
            </a>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            เรียกผ่าน API ของแอป <code className="px-1 bg-slate-100 rounded">{API}</code> (ผู้ดูแลระบบเท่านั้น) →
            ฝั่งเซิร์ฟเวอร์ต่อไปยัง n8n ในเครื่องผ่าน tunnel โดยใช้ CRON_SECRET
          </p>

          {error && (
            <div className="mt-4 p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-800 text-sm">{error}</div>
          )}

          {result && (
            <div className="mt-4">
              <div className={`p-3 rounded-xl text-sm font-semibold ${result.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                {result.ok ? '✅ สำเร็จ' : '⚠️ ไม่สำเร็จ'} · ขั้นตอน: {result.step || '-'}
                {typeof result.promptLen === 'number' ? ` · พรอมต์ ${result.promptLen} ตัวอักษร` : ''}
                {result.posted ? ' · โพสต์ TikTok แล้ว' : ''}
                {result.error ? ` · ${result.error}` : ''}
              </div>
              <pre className="mt-3 p-3 rounded-xl bg-slate-900 text-slate-100 text-xs overflow-auto max-h-72">
                {JSON.stringify(result, null, 2)}
              </pre>
              {tt?.profile && (
                <a href={tt.profile} target="_blank" rel="noreferrer" className="inline-block mt-3 text-sm text-sky-700">
                  ดูโปรไฟล์ TikTok ↗
                </a>
              )}
            </div>
          )}
        </div>

        <div className="card p-6 mt-4 text-sm text-slate-600 leading-6">
          <h2 className="font-bold text-slate-800 mb-2">คำอธิบายที่ใช้โพสต์ (ค่าเริ่มต้นของท่อ)</h2>
          <p className="whitespace-pre-line">
{`🌌 1 กลายเป็น 5 → 5 กลายเป็นจักรวาล

"เครือข่ายประกัน AI" (AI Insurance Network Tree) — ระบบสร้างทีมตัวแทนแบบ 1 แตก 5 ที่ต่อยอดได้ไม่จำกัดชั้น
⭐ โครงสร้างสายงานชัดเจน ไม่ทับซ้อน ดูทีมได้ทะลุทุกชั้น
⚡ มี AI ช่วยหาลูกค้าและปิดการขาย
📊 เห็นรายได้–ค่าคอมแบบเรียลไทม์
🚀 เริ่มจากคุณ 1 คน → แตกเป็น 5 → ขยายเป็นเครือข่ายทั้งจักรวาล

👉 สมัครสมาชิกทั่วไป (ฟรี): https://ai-insurance-network-tree.vercel.app/

#ประกันชีวิต #สร้างทีม #AI #อิสรภาพทางการเงิน #ตัวแทนประกัน #Network #ลงทุน`}
          </p>
          <p className="mt-2 text-xs text-slate-500">
            แก้ข้อความได้ที่ไฟล์ <code className="px-1 bg-slate-100 rounded">n8n/flow-tiktok-autopilot/caption.txt</code> ในโปรเจกต์
          </p>
        </div>
      </div>
    </div>
  );
}
