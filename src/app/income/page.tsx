'use client';

import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

interface IncomeItem {
  memberId: string;
  memberCode?: string;
  name?: string;
  positionId?: string;
  positionName?: string;
  totalIncome: number;
  breakdown?: Record<string, number>;
  summary?: {
    estimatedIncome?: number;
    approvedIncome?: number;
    paidIncome?: number;
    [key: string]: number | undefined;
  };
  metricsUsed?: Record<string, number>;
}

export default function Income() {
  const [incomes, setIncomes] = useState<IncomeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalEst, setTotalEst] = useState(0);
  const [totalApp, setTotalApp] = useState(0);
  const [totalPaid, setTotalPaid] = useState(0);

  useEffect(() => {
    let mounted = true;

    async function fetchData() {
      try {
        const token = getToken();
        const res = await fetch('/api/admin/income', {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        const data = await res.json();

        if (mounted) {
          if (data.ok && data.incomes) {
            const list = data.incomes as IncomeItem[];
            setIncomes(list);

            let est = 0,
              app = 0,
              paid = 0;
            for (const item of list) {
              if (item.summary) {
                if (typeof item.summary.estimatedIncome === 'number') est += item.summary.estimatedIncome;
                if (typeof item.summary.approvedIncome === 'number') app += item.summary.approvedIncome;
                if (typeof item.summary.paidIncome === 'number') paid += item.summary.paidIncome;
              }
            }
            setTotalEst(est);
            setTotalApp(app);
            setTotalPaid(paid);
          } else {
            setError(data.error || 'ไม่สามารถดึงข้อมูลรายได้ได้');
          }
        }
      } catch (e: any) {
        if (mounted) setError(e?.message || 'เกิดข้อผิดพลาด');
      } finally {
        if (mounted) setLoading(false);
      }
    }

    fetchData();
    return () => { mounted = false; };
  }, []);

  if (loading) {
    return (
      <div>
        <Header />
        <div className="flex w-full">
          <Sidebar />
          <main className="flex-1 p-6 space-y-4">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-[#475569]">รายได้และเอกสาร</h1>
              <span className="badge-demo animate-pulse">กำลังโหลด...</span>
            </div>
            <div className="grid md:grid-cols-3 gap-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="card p-4 animate-pulse">
                  <div className="h-3 bg-slate-200 rounded w-1/2 mb-2" />
                  <div className="h-6 bg-slate-200 rounded w-1/3" />
                </div>
              ))}
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header />
      <div className="flex w-full">
        <Sidebar />
        <main className="flex-1 p-6 space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-[#475569]">รายได้และเอกสาร</h1>
              {error ? (
                <span className="badge-demo">{error}</span>
              ) : incomes.length > 0 ? (
                <span className="text-xs text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                  ข้อมูลจริง • {incomes.length} รายการ
                </span>
              ) : (
                <span className="badge-demo">ไม่มีข้อมูล</span>
              )}
            </div>
          </div>

          {/* Disclaimer */}
          <div className="rounded-xl bg-[#eff6ff] border border-blue-100 p-3 text-xs text-sky-900">
            รายได้และผลประโยชน์ขึ้นอยู่กับผลงานจริง คุณสมบัติ เงื่อนไข การอนุมัติ และหลักเกณฑ์ที่ใช้ในแต่ละช่วงเวลา
            ตัวเลขประมาณการไม่ใช่การรับประกันรายได้
          </div>

          {/* Summary cards */}
          <div className="grid md:grid-cols-3 gap-3 text-sm">
            <div className="card p-4">
              <div className="text-xs text-slate-500">ประมาณการ (Estimated)</div>
              <div className="text-xl font-bold text-sky-500">฿ {Math.round(totalEst).toLocaleString('th-TH')}</div>
              <div className="text-[11px] text-slate-500">ยังไม่ถือเป็นยอดอนุมัติ</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-slate-500">อนุมัติ (Approved)</div>
              <div className="text-xl font-bold text-emerald-600">฿ {Math.round(totalApp).toLocaleString('th-TH')}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-slate-500">จ่ายแล้ว (Paid)</div>
              <div className="text-xl font-bold text-[#475569]">฿ {Math.round(totalPaid).toLocaleString('th-TH')}</div>
            </div>
          </div>

          {/* Data table */}
          {incomes.length > 0 ? (
            <div className="card p-4 overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-[#475569] text-white">
                  <tr>
                    <th className="text-left p-2">รหัสสมาชิก</th>
                    <th className="text-left p-2">ชื่อ</th>
                    <th className="text-left p-2">ตำแหน่ง</th>
                    <th className="text-right p-2">ยอดรวม (฿)</th>
                    <th className="text-right p-2">Est.</th>
                    <th className="text-right p-2">App.</th>
                    <th className="text-right p-2">Paid</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {incomes.map((item) => (
                    <tr key={item.memberId} className="hover:bg-slate-50">
                      <td className="p-2 font-mono text-sky-700">{item.memberCode || '-'}</td>
                      <td className="p-2 font-medium">{item.name || '—'}</td>
                      <td className="p-2 text-slate-600">{item.positionName || item.positionId || '—'}</td>
                      <td className="p-2 text-right font-semibold text-[#475569]">
                        {Math.round(item.totalIncome).toLocaleString('th-TH')}
                      </td>
                      <td className="p-2 text-right text-sky-600">
                        {item.summary?.estimatedIncome != null
                          ? Math.round(item.summary.estimatedIncome).toLocaleString('th-TH')
                          : '-'}
                      </td>
                      <td className="p-2 text-right text-emerald-600">
                        {item.summary?.approvedIncome != null
                          ? Math.round(item.summary.approvedIncome).toLocaleString('th-TH')
                          : '-'}
                      </td>
                      <td className="p-2 text-right text-[#475569]">
                        {item.summary?.paidIncome != null
                          ? Math.round(item.summary.paidIncome).toLocaleString('th-TH')
                          : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mt-3 flex gap-2 text-xs">
                <button className="px-3 py-1.5 rounded-full border bg-white">ดาวน์โหลด PDF</button>
                <button className="px-3 py-1.5 rounded-full border bg-white">พิมพ์</button>
                <button className="px-3 py-1.5 rounded-full bg-[#475569] text-white">ตรวจสอบเอกสาร (QR)</button>
              </div>
            </div>
          ) : (
            <div className="card p-4 text-center text-sm text-slate-400">
              ไม่มีข้อมูลรายได้ในขณะนี้ (ต้องเข้าสู่ระบบในฐานะผู้ดูแลระบบ)
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return document.cookie.split('; ').find((row) => row.startsWith('token='))?.split('=')[1] || '';
}
