'use client';
import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';

interface Stats {
  total: number;
  pending: number;
  replied: number;
  today: number;
  distinctMembers: number;
  rangeCount: number | null;
  avgReplyMinutes: number;
  notificationLogCount: number;
}
interface LineStatus {
  connected: boolean;
  targetIdConfigured: boolean;
  targetIdMasked: string | null;
}

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function AdminReportsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [line, setLine] = useState<LineStatus | null>(null);
  const [emailConnected, setEmailConnected] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [range, setRange] = useState<'today' | '7d' | '30d' | 'custom'>('today');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [testingLine, setTestingLine] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      const today = new Date();
      if (range === 'today') {
        params.set('from', isoDate(today));
        params.set('to', isoDate(today));
      } else if (range === '7d') {
        const d = new Date(); d.setDate(d.getDate() - 6);
        params.set('from', isoDate(d));
        params.set('to', isoDate(today));
      } else if (range === '30d') {
        const d = new Date(); d.setDate(d.getDate() - 29);
        params.set('from', isoDate(d));
        params.set('to', isoDate(today));
      } else if (range === 'custom') {
        if (from) params.set('from', from);
        if (to) params.set('to', to);
      }
      const r = await fetch(`/api/admin/reports/stats?${params.toString()}`, { credentials: 'include' });
      const j = await r.json();
      if (j.ok) setStats(j.stats);
      else setError(j.error || 'ดึงข้อมูลไม่สำเร็จ');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'เชื่อมต่อไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [range, from, to]);

  const fetchLine = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/line', { credentials: 'include' });
      const j = await r.json();
      if (j.ok) {
        setLine(j.line);
        setEmailConnected(j.email?.connected ?? null);
      }
    } catch {}
  }, []);

  useEffect(() => { fetchStats(); fetchLine(); }, [fetchStats, fetchLine]);

  async function testLine() {
    setTestingLine(true);
    try {
      const r = await fetch('/api/admin/line', { method: 'POST', credentials: 'include' });
      const j = await r.json();
      setToast(j.ok ? '✅ ส่งข้อความทดสอบ LINE สำเร็จ' : '❌ ' + (j.error || 'ส่งไม่สำเร็จ'));
    } catch {
      setToast('❌ เชื่อมต่อไม่สำเร็จ');
    } finally {
      setTestingLine(false);
      setTimeout(() => setToast(null), 4000);
    }
  }

  const cards: { label: string; value: number | string; color: string }[] = [
    { label: 'คำถามทั้งหมด', value: stats?.total ?? 0, color: 'text-slate-800' },
    { label: 'รอตอบ', value: stats?.pending ?? 0, color: 'text-amber-600' },
    { label: 'ตอบแล้ว', value: stats?.replied ?? 0, color: 'text-green-600' },
    { label: 'คำถามวันนี้', value: stats?.today ?? 0, color: 'text-sky-600' },
    { label: 'สมาชิกที่ติดต่อ', value: stats?.distinctMembers ?? 0, color: 'text-slate-800' },
    { label: 'ช่วงวันที่เลือก', value: stats?.rangeCount ?? '—', color: 'text-sky-600' },
  ];

  return (
    <div>
      <Header />
      <div className="flex w-full min-h-screen">
        <Sidebar />
        <main className="flex-1 p-4 md:p-6 bg-white">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-bold text-slate-800">📊 รายงาน</h1>
            <Link href="/admin/messages" className="px-4 py-2 rounded-full bg-sky-400 text-white text-sm font-medium hover:bg-sky-500">
              ดูรายการคำถาม
            </Link>
          </div>

          {toast && <div className="mb-3 px-4 py-2 rounded-xl border border-blue-100 bg-[#f0f7ff] text-sm text-slate-700">{toast}</div>}
          {error && <div className="card p-5 bg-sky-50 border-blue-100 mb-4 text-sm text-sky-700">{error}</div>}

          {/* Date filter */}
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {(['today', '7d', '30d', 'custom'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-4 py-2 rounded-full text-sm font-medium border ${range === r ? 'bg-sky-400 text-white border-sky-400' : 'bg-white border-blue-100 text-slate-600 hover:bg-[#f0f7ff]'}`}
              >
                {r === 'today' ? 'วันนี้' : r === '7d' ? '7 วัน' : r === '30d' ? '30 วัน' : 'กำหนดช่วงเอง'}
              </button>
            ))}
            {range === 'custom' && (
              <div className="flex items-center gap-2">
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="px-3 py-2 rounded-xl border border-[#dbeafe] bg-[#f0f7ff] text-sm" />
                <span className="text-slate-400">ถึง</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="px-3 py-2 rounded-xl border border-[#dbeafe] bg-[#f0f7ff] text-sm" />
              </div>
            )}
          </div>

          {loading ? (
            <div className="card p-6 text-center"><div className="loading-spinner mx-auto mb-3" /><p className="text-sm text-slate-500">กำลังโหลดรายงาน...</p></div>
          ) : (
            <>
              {/* Stat cards */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                {cards.map((c) => (
                  <div key={c.label} className="card p-4">
                    <div className="text-xs text-slate-500">{c.label}</div>
                    <div className={`text-2xl font-bold mt-1 ${c.color}`}>{c.value}</div>
                  </div>
                ))}
              </div>

              {/* Reply stats */}
              <div className="card p-5 mb-6">
                <h2 className="text-lg font-bold text-slate-800">สถิติการตอบกลับ</h2>
                <div className="grid grid-cols-2 gap-4 mt-3">
                  <div>
                    <div className="text-xs text-slate-500">เวลาเฉลี่ยในการตอบ (นาที)</div>
                    <div className="text-xl font-bold text-slate-800 mt-1">{stats?.avgReplyMinutes ?? 0}</div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">จำนวน log แจ้งเตือน (Email/LINE)</div>
                    <div className="text-xl font-bold text-slate-800 mt-1">{stats?.notificationLogCount ?? 0}</div>
                  </div>
                </div>
              </div>

              {/* LINE Integration */}
              <div className="card p-5">
                <h2 className="text-lg font-bold text-slate-800">LINE Integration</h2>
                <div className="flex items-center gap-3 mt-3">
                  <span className={`w-3 h-3 rounded-full ${line?.connected ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-sm font-medium text-slate-700">
                    {line?.connected ? '🟢 Connected' : '🔴 Not Connected'}
                  </span>
                  {line?.targetIdMasked && <span className="text-xs text-slate-400">Target: {line.targetIdMasked}</span>}
                </div>
                <div className="flex items-center gap-3 mt-2">
                  <span className={`w-3 h-3 rounded-full ${emailConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="text-sm text-slate-700">Email: {emailConnected ? '🟢 Connected' : '🔴 Not Connected'}</span>
                </div>
                {!line?.connected && (
                  <p className="text-xs text-slate-500 mt-3 bg-[#f0f7ff] border border-[#dbeafe] rounded-xl p-3">
                    ยังไม่ได้ตั้งค่า LINE — ตั้ง Environment Variables <code className="font-mono">LINE_CHANNEL_ACCESS_TOKEN</code> และ <code className="font-mono">LINE_TARGET_ID</code> ใน Backend (Vercel) แล้วลองใหม่
                  </p>
                )}
                <button
                  onClick={testLine}
                  disabled={testingLine}
                  className="mt-4 px-5 py-2.5 rounded-full bg-sky-500 text-white text-sm font-semibold hover:bg-sky-600 disabled:opacity-40"
                >
                  {testingLine ? 'กำลังส่ง...' : 'ส่งข้อความทดสอบ LINE'}
                </button>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
