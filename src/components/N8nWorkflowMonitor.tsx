'use client';

/**
 * N8nWorkflowMonitor — "ตัวโชว์ระบบ": แสดง workflow ทั้งหมดที่ตัวตรวจจับ (n8n-workflow-watch.mjs)
 * เก็บได้จาก n8n แบบสด ๆ
 *
 * ● ดึงข้อมูลจาก /api/n8n/workflows ทุก 10 วินาที (ไม่ต้องรีเฟรชหน้า)
 * ● ทันทีที่มี workflow ใหม่ขึ้นในระบบ → ขึ้นป้าย "ใหม่" + ข้อความแจ้งเตือนในหน้านี้เอง
 * ● ถ้าตัวตรวจจับไม่ส่งข้อมูลเกิน 3 นาที ระบบจะบอกว่า "ตัวตรวจจับออฟไลน์" (ไม่หลอกว่าสด)
 * ● อ่านอย่างเดียว ไม่มีข้อมูลส่วนบุคคล
 */

import { useCallback, useEffect, useRef, useState } from 'react';

type Wf = {
  id: string;
  name: string;
  active: boolean;
  nodeCount: number;
  isNew: boolean;
  firstSeenAt: string;
  n8nUpdatedAt: string | null;
};

type Snapshot = {
  ok: boolean;
  count?: number;
  active?: number;
  newCount?: number;
  lastSeenAt?: string | null;
  ageSeconds?: number | null;
  watcherOnline?: boolean;
  workflows?: Wf[];
  error?: string;
  at?: string;
};

const POLL_MS = 10000;

function ago(iso?: string | null) {
  if (!iso) return '—';
  const ms = Date.now() - new Date(iso).getTime();
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} วินาทีที่แล้ว`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ชั่วโมงที่แล้ว`;
  return `${Math.round(h / 24)} วันก่อน`;
}

export default function N8nWorkflowMonitor() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [events, setEvents] = useState<string[]>([]);
  const [tick, setTick] = useState(0);
  const knownIds = useRef<Set<string> | null>(null);

  const load = useCallback(async (manual = false) => {
    if (manual) setBusy(true);
    try {
      const r = await fetch('/api/n8n/workflows', { credentials: 'include', cache: 'no-store' });
      const j: Snapshot = await r.json().catch(() => ({ ok: false, error: 'อ่านคำตอบไม่ได้' }));
      if (!r.ok || !j.ok) {
        setErr(j.error || `HTTP ${r.status}`);
      } else {
        setErr('');
        setSnap(j);
        const ids = new Set((j.workflows || []).map(w => w.id));
        if (knownIds.current) {
          const fresh = (j.workflows || []).filter(w => !knownIds.current!.has(w.id));
          if (fresh.length) {
            const stamp = new Date().toLocaleTimeString('th-TH');
            setEvents(prev => [
              ...fresh.slice(0, 3).map(w => `${stamp} · 🆕 ตรวจพบ workflow ใหม่: "${w.name}" (${w.nodeCount} โหนด)`),
              ...prev,
            ].slice(0, 6));
          }
        }
        knownIds.current = ids;
      }
    } catch (e: any) {
      setErr(String(e?.message || e).slice(0, 120));
    } finally {
      setBusy(false);
      setTick(t => t + 1);
    }
  }, []);

  useEffect(() => {
    load();
    const id = setInterval(() => load(), POLL_MS);
    return () => clearInterval(id);
  }, [load]);

  const online = !!snap?.watcherOnline;
  const workflows = snap?.workflows || [];

  return (
    <div className="rounded-3xl border border-[#dbeafe] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className={`absolute inline-flex h-full w-full rounded-full ${online ? 'animate-ping bg-emerald-400' : 'bg-rose-400'} opacity-75`} />
              <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${online ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            </span>
            <h2 className="text-sm font-black text-[#0f172a]">ตัวตรวจจับ workflow n8n (สด)</h2>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${online ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
              {online ? 'ตัวตรวจจับ: ทำงานอยู่' : snap ? 'ตัวตรวจจับ: ยังไม่ส่งข้อมูล' : 'กำลังเชื่อมต่อ…'}
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-5 text-slate-500">
            ระบบเฝ้าดู n8n (localhost:5679) อยู่ตลอด — มีการ<span className="font-bold text-slate-700">สร้าง workflow ใหม่</span>เมื่อไร รายการจะขึ้นที่นี่เองภายในไม่กี่วินาที · อัปเดตทุก 10 วินาที · ตรวจล่าสุด {ago(snap?.lastSeenAt)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-2 text-center">
            <div className="rounded-2xl bg-[#f8fafc] px-3 py-2">
              <div className="text-lg font-black text-[#0f172a]">{snap?.count ?? '—'}</div>
              <div className="text-[10px] text-slate-500">workflow ทั้งหมด</div>
            </div>
            <div className="rounded-2xl bg-emerald-50 px-3 py-2">
              <div className="text-lg font-black text-emerald-700">{snap?.active ?? '—'}</div>
              <div className="text-[10px] text-emerald-700/80">ใช้งานอยู่</div>
            </div>
            <div className={`rounded-2xl px-3 py-2 ${(snap?.newCount ?? 0) > 0 ? 'bg-amber-50' : 'bg-[#f8fafc]'}`}>
              <div className={`text-lg font-black ${(snap?.newCount ?? 0) > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{snap?.newCount ?? '—'}</div>
              <div className="text-[10px] text-slate-500">ใหม่ใน 24 ชม.</div>
            </div>
          </div>
          <button
            onClick={() => load(true)}
            className="rounded-full bg-[#0b1220] px-3 py-2 text-[11px] font-bold text-white hover:bg-[#16233d] disabled:opacity-50"
            disabled={busy}
          >
            {busy ? '…' : '⟳ ตรวจเดี๋ยวนี้'}
          </button>
        </div>
      </div>

      {err && (
        <div className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-[11px] leading-5 text-amber-800">
          อ่านรายการไม่ได้: {err}
          {err.includes('ยังไม่มีตาราง') && ' — ตารางจะถูกสร้างตอน deploy (migration 12_n8n_workflow_watch)'}
        </div>
      )}

      {events.length > 0 && (
        <div className="mt-3 space-y-1 rounded-2xl border border-emerald-100 bg-emerald-50/70 p-3">
          {events.map((e, i) => (
            <div key={i} className="text-[11px] leading-5 text-emerald-900">{e}</div>
          ))}
        </div>
      )}

      <div className="mt-3 max-h-72 overflow-auto rounded-2xl border border-[#eef2f7]">
        <table className="w-full text-left text-[12px]">
          <thead className="sticky top-0 bg-[#f8fafc] text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-3 py-2">workflow</th>
              <th className="px-2 py-2 text-center">โหนด</th>
              <th className="px-2 py-2 text-center">สถานะ</th>
              <th className="px-3 py-2 text-right">ตรวจพบครั้งแรก</th>
            </tr>
          </thead>
          <tbody>
            {workflows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-slate-400">
                  {snap ? 'ยังไม่พบ workflow ที่ระบบตรวจจับได้ — ตัวตรวจจับจะส่งเข้ามาเมื่อมีการสร้าง workflow ใน n8n' : 'กำลังโหลด…'}
                </td>
              </tr>
            )}
            {workflows.map(w => (
              <tr key={w.id} className={`border-t border-[#f1f5f9] ${w.isNew ? 'bg-emerald-50/40' : ''}`}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    {w.isNew && <span className="animate-pulse rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-black text-white">ใหม่</span>}
                    <span className="font-semibold text-slate-800">{w.name}</span>
                  </div>
                  <div className="mt-0.5 font-mono text-[10px] text-slate-400">{w.id.slice(0, 8)}…</div>
                </td>
                <td className="px-2 py-2 text-center text-slate-600">{w.nodeCount}</td>
                <td className="px-2 py-2 text-center">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${w.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {w.active ? 'ใช้งานอยู่' : 'ปิด'}
                  </span>
                </td>
                <td className="px-3 py-2 text-right text-[11px] text-slate-500">{ago(w.firstSeenAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="mt-3 rounded-2xl bg-[#f8fafc] p-3 text-[11px] leading-5 text-slate-600">
        <summary className="cursor-pointer font-bold text-slate-700">วิธีเปิดตัวตรวจจับไว้บนเครื่องที่รัน n8n (ทำครั้งเดียว)</summary>
        <div className="mt-2 space-y-1">
          <div>คำสั่ง: <code className="rounded bg-white px-1">node scripts/n8n-workflow-watch.mjs</code> (เฝ้าต่อเนื่อง) หรือ <code className="rounded bg-white px-1">--once</code> (ทดสอบรอบเดียว)</div>
          <div>ต้องมีค่า <code className="rounded bg-white px-1">CRON_SECRET</code> — สคริปต์ถอดจากไฟล์ Startup ของ n8n ให้เอง แล้วเก็บไว้ที่ <code className="rounded bg-white px-1">~/.hermes/n8n-watch-secret.txt</code> (ไม่พิมพ์ค่าออกจอ)</div>
          <div>ล็อกอยู่ที่ <code className="rounded bg-white px-1">~/n8n-workflow-watch.log</code> · ตั้งให้เปิดทุกครั้งที่ล็อกอิน Windows ได้โดยวางไฟล์ <code className="rounded bg-white px-1">n8n-workflow-watch.bat</code> ไว้ใน Startup</div>
        </div>
      </details>

      <div className="mt-2 text-right text-[10px] text-slate-400">อัปเดตรอบที่ {tick} · {snap?.at ? new Date(snap.at).toLocaleTimeString('th-TH') : '—'}</div>
    </div>
  );
}
