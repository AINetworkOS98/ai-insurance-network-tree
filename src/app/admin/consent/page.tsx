'use client';
import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

interface Rec {
  id: string;
  type: string;
  version: string;
  granted: boolean;
  source?: string | null;
  consentedAt: string;
  ip?: string | null;
  user?: {
    id: string; email: string; username?: string | null;
    displayName?: string; memberCode?: string | null; status?: string | null;
  } | null;
}

function fmt(d?: string) {
  if (!d) return '-';
  try { return new Date(d).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }); }
  catch { return d; }
}

export default function AdminConsentPage() {
  const [records, setRecords] = useState<Rec[]>([]);
  const [total, setTotal] = useState(0);
  const [grantedCount, setGrantedCount] = useState(0);
  const [declinedCount, setDeclinedCount] = useState(0);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [testInfo, setTestInfo] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const qs = new URLSearchParams();
      if (q.trim()) qs.set('email', q.trim());
      if (type) qs.set('type', type);
      const res = await fetch(`/api/admin/consent?${qs.toString()}`, { cache: 'no-store' });
      const j = await res.json();
      if (!j.ok) { setError(j.error || 'อ่านข้อมูลไม่สำเร็จ'); setRecords([]); return; }
      setRecords(j.records || []);
      setTotal(j.total || 0);
      setGrantedCount(j.grantedCount || 0);
      setDeclinedCount(j.declinedCount || 0);
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, [q, type]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <Header />
      <div className="flex w-full min-h-screen">
        <Sidebar />
        <main className="flex-1 p-4 md:p-6 bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h1 className="text-xl font-bold text-slate-800">🔐 บันทึกความยินยอม (PDPA)</h1>
            <button onClick={load} className="px-4 py-2 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">รีเฟรช</button>
          </div>

          <p className="text-xs text-slate-500 mb-4">
            บันทึกทุกครั้งที่สมาชิกให้หรือปฏิเสธความยินยอม พร้อมเวอร์ชันประกาศ วันเวลา ที่มาของการบันทึก และ IP — ใช้ตรวจสอบย้อนหลังได้
          </p>

          <div className="grid sm:grid-cols-3 gap-3 mb-4">
            <div className="rounded-xl border border-slate-100 bg-[#f8fafc] p-4">
              <div className="text-xs text-slate-500">บันทึกทั้งหมด</div>
              <div className="text-2xl font-bold text-slate-800">{total}</div>
            </div>
            <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4">
              <div className="text-xs text-emerald-700">ยินยอม</div>
              <div className="text-2xl font-bold text-emerald-800">{grantedCount}</div>
            </div>
            <div className="rounded-xl border border-amber-100 bg-amber-50 p-4">
              <div className="text-xs text-amber-700">ไม่ยินยอม</div>
              <div className="text-2xl font-bold text-amber-800">{declinedCount}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') load(); }}
              placeholder="ค้นหาด้วยอีเมล / ชื่อผู้ใช้ / รหัสสมาชิก"
              className="flex-1 min-w-[220px] px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm"
            />
            <select value={type} onChange={(e) => setType(e.target.value)} className="px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm">
              <option value="">ทุกประเภท</option>
              <option value="PDPA">PDPA</option>
              <option value="MARKETING">การตลาด</option>
            </select>
            <button onClick={load} className="px-5 py-2.5 rounded-xl bg-[#475569] text-white text-sm font-semibold">ค้นหา</button>
          </div>

          {error && (
            <div className="mb-4 px-4 py-3 rounded-xl border border-red-100 bg-red-50 text-sm text-red-700">{error}</div>
          )}

          {loading ? (
            <div className="text-sm text-slate-500 p-6">กำลังโหลด...</div>
          ) : records.length === 0 ? (
            <div className="text-sm text-slate-500 p-6">ไม่พบบันทึกความยินยอมตามเงื่อนไขที่ค้นหา</div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-xs">
                <thead className="bg-[#f8fafc] text-slate-600">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold">วันเวลา</th>
                    <th className="text-left px-3 py-2 font-semibold">สมาชิก</th>
                    <th className="text-left px-3 py-2 font-semibold">ประเภท</th>
                    <th className="text-left px-3 py-2 font-semibold">ผล</th>
                    <th className="text-left px-3 py-2 font-semibold">เวอร์ชัน</th>
                    <th className="text-left px-3 py-2 font-semibold">ที่มา</th>
                    <th className="text-left px-3 py-2 font-semibold">IP</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 whitespace-nowrap text-slate-600">{fmt(r.consentedAt)}</td>
                      <td className="px-3 py-2">
                        <div className="font-semibold text-slate-800">{r.user?.displayName || '-'}</div>
                        <div className="text-slate-500">{r.user?.email || '-'}</div>
                        {r.user?.username && <div className="text-slate-400">@{r.user.username}</div>}
                        {r.user?.memberCode && <div className="text-slate-400 font-mono">{r.user.memberCode}</div>}
                      </td>
                      <td className="px-3 py-2">{r.type === 'MARKETING' ? 'การตลาด' : r.type}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded-full font-semibold ${r.granted ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                          {r.granted ? 'ยินยอม' : 'ไม่ยินยอม'}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono">{r.version}</td>
                      <td className="px-3 py-2 text-slate-500">{r.source || '-'}</td>
                      <td className="px-3 py-2 text-slate-400 font-mono">{r.ip || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* เครื่องมือผู้ดูแลระบบ — ลบบัญชีทดสอบ (จำกัดโดเมน @ai-insurance-test.local เท่านั้น) */}
          <div className="mt-6 rounded-xl border border-slate-100 bg-[#f8fafc] p-4">
            <div className="text-sm font-semibold text-slate-700">🧹 เครื่องมือ: บัญชีทดสอบ</div>
            <p className="text-[11px] text-slate-500 mt-1">
              ลบบัญชีที่สร้างเพื่อทดสอบระบบเท่านั้น (อีเมลลงท้าย @ai-insurance-test.local) — ลบสมาชิกจริงไม่ได้โดยการออกแบบ
            </p>
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                onClick={async () => {
                  setTestInfo('กำลังตรวจ...');
                  try {
                    const r = await fetch('/api/admin/test-accounts', { cache:'no-store' });
                    const j = await r.json();
                    setTestInfo(j.ok ? `พบบัญชีทดสอบ ${j.count} บัญชี` : (j.error || 'ตรวจไม่สำเร็จ'));
                  } catch { setTestInfo('ตรวจไม่สำเร็จ'); }
                }}
                className="px-4 py-2 rounded-full bg-white border border-slate-200 text-xs font-semibold text-slate-700"
              >
                ตรวจรายการ
              </button>
              <button
                onClick={async () => {
                  if (!confirm('ยืนยันลบบัญชีทดสอบทั้งหมด (@ai-insurance-test.local)?')) return;
                  setTestInfo('กำลังลบ...');
                  try {
                    const r = await fetch('/api/admin/test-accounts', { method:'DELETE' });
                    const j = await r.json();
                    setTestInfo(j.ok ? `ลบแล้ว ${j.deleted} บัญชี` : (j.error || 'ลบไม่สำเร็จ'));
                    if (j.ok) load();
                  } catch { setTestInfo('ลบไม่สำเร็จ'); }
                }}
                className="px-4 py-2 rounded-full bg-red-50 border border-red-200 text-xs font-semibold text-red-700"
              >
                ลบบัญชีทดสอบ
              </button>
            </div>
            {testInfo && <div className="mt-2 text-[11px] text-slate-600">{testInfo}</div>}
          </div>
        </main>
      </div>
    </div>
  );
}