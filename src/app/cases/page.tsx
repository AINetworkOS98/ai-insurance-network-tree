'use client';
// รายการเคสทำประกันที่บันทึกไว้ — เห็นของตัวเอง (ตัวแทน) หรือทั้งหมด (หัวหน้าหน่วยขึ้นไป)
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

const fmt = (n: number) => Number(n || 0).toLocaleString('th-TH');
const PAGE_SIZE = 10;
const STATUS: Record<string, { label: string; cls: string }> = {
  DRAFT: { label: 'ฉบับร่าง', cls: 'bg-slate-100 text-slate-700' },
  SENT: { label: 'ส่งใบเสนอขายแล้ว', cls: 'bg-sky-100 text-sky-800' },
  ISSUED: { label: 'ออกกรมธรรม์แล้ว', cls: 'bg-emerald-100 text-emerald-800' },
  CANCELLED: { label: 'ยกเลิก', cls: 'bg-red-100 text-red-700' },
};

export default function CasesPage() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [rows, setRows] = useState<any[]>([]);
  const [rank, setRank] = useState<number | null>(null);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  async function load(query = q, st = status) {
    setLoading(true); setMsg('');
    try {
      const r = await fetch(`/api/insurance-cases?q=${encodeURIComponent(query)}&status=${encodeURIComponent(st)}`, { credentials: 'include' });
      const j = await r.json();
      if (j.ok) { setRows(j.cases || []); setRank(j.rank); } else setMsg(j.error || 'โหลดรายการไม่สำเร็จ');
    } catch { setMsg('โหลดรายการไม่สำเร็จ'); }
    setLoading(false);
  }
  useEffect(() => { load('', ''); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(() => rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE), [rows, safePage]);

  return (
    <div>
      <Header />
      <div className="flex w-full">
        <Sidebar />
        <main className="flex-1 p-6 space-y-4 w-full min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold text-navy">เคสทำประกันที่บันทึกไว้</h1>
              <p className="text-xs text-slate-500 mt-1">
                ข้อมูลผู้เอาประกันถูกเข้ารหัส (AES-256-GCM) · เก็บ 180 วันแล้วลบ · ทุกครั้งที่เปิดเคสมีการบันทึก log
                {rank !== null && ` · สิทธิ์ของคุณ: ${rank >= 2 ? 'เห็นทุกเคสในหน่วย' : 'เห็นเฉพาะเคสของตัวเอง'}`}
              </p>
            </div>
            <Link href="/apply" className="px-4 py-2 rounded-full bg-emerald-600 text-white text-xs font-semibold">+ สร้างเคสใหม่</Link>
          </div>

          {msg && <div className="p-2 rounded-xl bg-amber-50 border text-xs">{msg}</div>}

          <div className="card p-3 grid md:grid-cols-4 gap-2">
            <input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="ค้นหาเลขเคส / รหัสแบบ / ชื่อ (ปิดบางส่วน)"
              className="md:col-span-2 px-3 py-2 rounded-xl border text-sm" />
            <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }} className="px-3 py-2 rounded-xl border text-sm">
              <option value="">ทุกสถานะ</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <button type="button" onClick={() => { setPage(1); load(); }} className="px-4 py-2 rounded-full bg-navy text-white text-xs">ค้นหา</button>
          </div>

          <div className="card p-2 text-[11px] text-slate-600">
            พบ {rows.length} เคส · หน้า {safePage}/{totalPages} (ทีละ {PAGE_SIZE})
          </div>

          <div className="card p-0 overflow-auto">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left py-2 px-3">เลขเคส</th>
                  <th className="text-left py-2 px-3">สัญญาหลัก</th>
                  <th className="text-right py-2 px-3">ทุน</th>
                  <th className="text-left py-2 px-3">ผู้เอาประกัน (ปิดข้อมูล)</th>
                  <th className="text-center py-2 px-3">เพิ่มเติม</th>
                  <th className="text-center py-2 px-3">สถานะ</th>
                  <th className="text-left py-2 px-3">วันที่</th>
                  <th className="text-center py-2 px-3">เปิด</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={8} className="py-4 text-center text-slate-400">กำลังโหลด…</td></tr>}
                {!loading && paged.length === 0 && <tr><td colSpan={8} className="py-4 text-center text-slate-400">ยังไม่มีเคส</td></tr>}
                {paged.map(r => (
                  <tr key={r.caseNo} className="border-t">
                    <td className="py-2 px-3 font-mono font-semibold">{r.caseNo}</td>
                    <td className="py-2 px-3">{r.productCode} {r.productName}</td>
                    <td className="py-2 px-3 text-right font-mono">฿{fmt(r.cover)}</td>
                    <td className="py-2 px-3 text-slate-600">{r.nameMasked}</td>
                    <td className="py-2 px-3 text-center">{r.riders || 0}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full ${STATUS[r.status]?.cls || 'bg-slate-100'}`}>{STATUS[r.status]?.label || r.status}</span>
                    </td>
                    <td className="py-2 px-3">{new Date(r.createdAt).toLocaleDateString('th-TH')}</td>
                    <td className="py-2 px-3 text-center"><Link className="underline text-navy" href={`/cases/${r.caseNo}`}>ดู</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card p-2 flex items-center justify-center gap-2 text-[11px]">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={safePage === 1} className="px-3 py-1 rounded-full border disabled:opacity-40">‹ ก่อนหน้า</button>
            <span className="text-slate-600">หน้า {safePage}/{totalPages}</span>
            <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages} className="px-3 py-1 rounded-full bg-navy text-white disabled:opacity-40">ถัดไป ›</button>
          </div>
        </main>
      </div>
    </div>
  );
}
