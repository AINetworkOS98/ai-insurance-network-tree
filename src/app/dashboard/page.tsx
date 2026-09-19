'use client';

import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';

interface Member {
  id: string;
  name?: string;
  status?: string;
  positionId?: string;
  personalFYC?: number;
  personalCOM?: number;
  memberCode?: string;
}

interface PositionSummary {
  positionId: string;
  positionName: string;
  count: number;
  totalFYC: number;
  totalCOM: number;
}

interface HealthStatus {
  db: string;
  firestore: string;
  lastBackup?: { stamp: string; at: string; counts: Record<string, number> };
}

export default function Dashboard() {
  const [members, setMembers] = useState<Member[]>([]);
  const [positions, setPositions] = useState<PositionSummary[]>([]);
  const [treeData, setTreeData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [incomeSummary, setIncomeSummary] = useState<{ estimated: number; approved: number; paid: number } | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);

  useEffect(() => {
    let mounted = true;

    async function fetchData() {
      try {
        // 1) members list
        const membersRes = await fetch('/api/members');
        const membersData = await membersRes.json();
        if (mounted && membersData.ok) {
          setMembers(membersData.members || []);
        }

        // 2) positions (admin-only — gracefully degrade)
        const posRes = await fetch('/api/admin/positions', {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const posData = await posRes.json();
        if (mounted && posData.ok) {
          setPositions(posData.summary?.byPosition || []);
          setTreeData(posData.treeStructure || null);
        }

        // 3) income summary (admin-only)
        const incRes = await fetch('/api/admin/income', {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const incData = await incRes.json();
        if (mounted && incData.ok && incData.incomes) {
          let estimated = 0,
            approved = 0,
            paid = 0;
          for (const item of incData.incomes as any[]) {
            if (item.summary) {
              if (typeof item.summary.estimatedIncome === 'number') estimated += item.summary.estimatedIncome;
              if (typeof item.summary.approvedIncome === 'number') approved += item.summary.approvedIncome;
              if (typeof item.summary.paidIncome === 'number') paid += item.summary.paidIncome;
            }
          }
          setIncomeSummary({ estimated, approved, paid });
        }

        // 4) system health
        const healthRes = await fetch('/api/admin/backup', {
          headers: { Authorization: `Bearer ${getToken()}` },
        });
        const healthData = await healthRes.json();
        if (mounted && healthData.ok) {
          setHealth(healthData.health || null);
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

  const token = getToken();

  const activeMembers = members.filter((m) => m.status === 'active').length;
  const totalMembers = members.length;

  const unitsFilled = positions
    .filter((p) => ['unit_manager', 'senior_unit_manager'].includes(p.positionId))
    .reduce((s, p) => s + p.count, 0);
  const totalPositions = positions.length;

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const periodLabel = `${year}-${month}`;

  if (loading) {
    return (
      <div>
        <Header />
        <div className="flex w-full">
          <Sidebar />
          <main className="flex-1 p-6 space-y-6">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-navy">ภาพรวม</h1>
              <span className="badge-demo animate-pulse">กำลังโหลด...</span>
            </div>
            <div className="grid md:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="card p-5 animate-pulse">
                  <div className="h-3 bg-slate-200 rounded w-2/3 mb-3" />
                  <div className="h-6 bg-slate-200 rounded w-1/2 mb-2" />
                  <div className="h-3 bg-slate-200 rounded w-3/4" />
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
        <main className="flex-1 p-6 space-y-6">
          {/* Header + status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold text-navy">ภาพรวม</h1>
              {!error && health && (
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    health.firestore === 'up' && health.db === 'up'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-red-100 text-red-700'
                  }`}
                >
                  {health.firestore === 'up' && health.db === 'up' ? 'ระบบปกติ' : 'ระบบบางส่วนไม่พร้อมใช้'}
                </span>
              )}
              {error && <span className="badge-demo">{error}</span>}
            </div>
            {health?.lastBackup && (
              <div className="text-xs text-slate-400">
                สำรองล่าสุด: {new Date(health.lastBackup.at).toLocaleString('th-TH')} (
                {Object.values(health.lastBackup.counts).reduce((a: number, b: number) => a + b, 0)} แถว)
              </div>
            )}
          </div>

          {/* KPI cards */}
          <div className="grid md:grid-cols-4 gap-4">
            {/* สมาชิกทั้งหมด */}
            <div className="card p-5">
              <div className="text-xs text-slate-500">สมาชิกทั้งหมด</div>
              <div className="text-2xl font-bold text-navy mt-1">
                {totalMembers} คน
              </div>
              <div className="text-xs text-slate-500">
                Active {activeMembers} • อื่นๆ {totalMembers - activeMembers}
              </div>
            </div>

            {/* ตำแหน่งว่าง */}
            <div className="card p-5">
              <div className="text-xs text-slate-500">ตำแหน่งในเครือข่าย</div>
              <div className="text-2xl font-bold text-navy mt-1">
                {positions.length} ระดับ
              </div>
              <div className="text-xs text-slate-500">
                {positions.filter((p) => p.count > 0).length} ระดับมีผู้ดำรง•
                {positions.filter((p) => p.count === 0).length} ระดับว่าง
              </div>
            </div>

            {/* รายได้รวม (อนุมัติ) */}
            <div className="card p-5">
              <div className="text-xs text-slate-500">รายได้สะสม (อนุมัติ)</div>
              <div className="text-2xl font-bold text-navy mt-1">
                {incomeSummary ? `฿ ${incomeSummary.approved.toLocaleString('th-TH')}` : '฿ 0'}
              </div>
              <div className="text-xs text-slate-500">
                {incomeSummary ? `จ่ายแล้ว ฿ ${incomeSummary.paid.toLocaleString('th-TH')}` : 'ยังไม่มีข้อมูล'}
              </div>
            </div>

            {/* ผลงานส่วนบุคคลรวม */}
            <div className="card p-5">
              <div className="text-xs text-slate-500">ผลงานส่วนบุคคลรวม</div>
              <div className="text-2xl font-bold text-navy mt-1">
                {incomeSummary ? `฿ ${incomeSummary.estimated.toLocaleString('th-TH')}` : '฿ 0'}
              </div>
              <div className="text-xs text-slate-500">รอบ {periodLabel} (ประมาณการ)</div>
            </div>
          </div>

          {/* สองแผงล่าง */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* ตำแหน่งว่าง / ความก้าวหน้า */}
            <div className="card p-5">
              <div className="font-semibold text-navy">ตำแหน่งในเครือข่าย — สถานะ</div>
              <div className="mt-3 space-y-2 text-sm">
                {positions.length === 0 ? (
                  <div className="text-xs text-slate-400">ไม่มีข้อมูลตำแหน่ง (ต้องล็อกอินในฐานะผู้ดูแลระบบ)</div>
                ) : (
                  positions.map((p) => {
                    const totalReq = 1;
                    const filled = p.count;
                    const pct = totalReq > 0 ? Math.min(100, (filled / totalReq) * 100) : 0;
                    return (
                      <div key={p.positionId} className="flex items-center gap-3">
                        <div className="w-24 shrink-0 text-xs text-slate-600">{p.positionName}</div>
                        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              background: p.count > 0 ? '#10b981' : '#f59e0b',
                            }}
                          />
                        </div>
                        <div className="w-16 text-right text-xs text-slate-500">
                          {p.count} / {totalReq}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <p className="text-xs text-slate-400 mt-2">
                ข้อมูลจาก Firestore ตรงตามเวลาจริง • อัปเดตเมื่อเปิดหน้า
              </p>
            </div>

            {/* รายได้ Estimated / Approved / Paid */}
            <div className="card p-5">
              <div className="font-semibold text-navy">รายได้รวม — Estimated / Approved / Paid</div>
              <div className="mt-3 flex gap-2 text-xs flex-wrap">
                <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-800">
                  Estimated ฿ {incomeSummary?.estimated.toLocaleString('th-TH') ?? '0'}
                </span>
                <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-800">
                  Approved ฿ {incomeSummary?.approved.toLocaleString('th-TH') ?? '0'}
                </span>
                <span className="px-2 py-1 rounded-full bg-navy text-white">
                  Paid ฿ {incomeSummary?.paid.toLocaleString('th-TH') ?? '0'}
                </span>
              </div>
              <div className="mt-3 h-[120px] flex items-end gap-2">
                {([incomeSummary?.estimated ?? 0, incomeSummary?.approved ?? 0, incomeSummary?.paid ?? 0] as number[]).map(
                  (v, i) => {
                    const maxVal = Math.max(...[incomeSummary?.estimated ?? 0, incomeSummary?.approved ?? 0, incomeSummary?.paid ?? 0].filter((n) => n > 0), 1);
                    const h = v > 0 ? Math.max(4, (v / maxVal) * 100) : 4;
                    return (
                      <div key={i} className="flex-1 rounded-t-lg flex flex-col items-center justify-end" style={{ height: '100%' }}>
                        <div
                          className="w-full rounded-t-lg"
                          style={{
                            height: `${h}%`,
                            background: i === 0 ? '#f59e0b' : i === 1 ? '#10b981' : '#475569',
                          }}
                        />
                        <div className="text-[11px] mt-1">{['Est', 'App', 'Paid'][i]}</div>
                      </div>
                    );
                  }
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-2">
                Estimated = ผลงานส่วนบุคคลรวม (FYC+CAM ไม่รวมโบนัส) • Approved/Paid จากระบบคำนวณ • ห้ามแสดง Estimated เป็นยอดที่ได้รับจริง
              </p>
            </div>
          </div>

          {/* ปุ่มนำทาง */}
          <div className="flex gap-3 text-sm">
            <Link href="/tree" className="px-4 py-2 rounded-full bg-[#475569] text-white">
              ดูผังเครือข่าย
            </Link>
            <Link href="/income" className="px-4 py-2 rounded-full border bg-white">
              ดูรายได้
            </Link>
            <Link href="/members" className="px-4 py-2 rounded-full border bg-white">
              ดูสมาชิก ({totalMembers} คน)
            </Link>
          </div>

          {/* ข้อมูลสุขภาพระบบ (แสดงเมื่อมี) */}
          {health && (
            <div className="card p-4 border border-slate-200">
              <div className="text-xs font-semibold text-slate-500 mb-2">สถานะระบบ</div>
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${health.db === 'up' ? 'bg-emerald-500' : 'bg-red-500'}`}
                  />
                  <span>ฐานข้อมูล: {health.db === 'up' ? 'ออนไลน์' : 'ออฟไลน์'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2 h-2 rounded-full ${health.firestore === 'up' ? 'bg-emerald-500' : 'bg-red-500'}`}
                  />
                  <span>Firestore: {health.firestore === 'up' ? 'ออนไลน์' : 'ออฟไลน์'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  <span>
                    รุ่นeeker: {health.lastBackup ? new Date(health.lastBackup.stamp).toLocaleDateString('th-TH') : '-'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function getToken(): string {
  if (typeof window === 'undefined') return '';
  return (
    document.cookie
      .split('; ')
      .find((row) => row.startsWith('token='))
      ?.split('=')[1] || ''
  );
}
