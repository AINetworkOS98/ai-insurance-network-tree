'use client';
import { useState, useEffect, Suspense } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

interface Member {
  id: string;
  memberCode?: string;
  displayName?: string;
  name?: string;
  positionId?: string;
  personalFYC?: number;
  personalCOM?: number;
  status?: string;
}

interface IncomeItem {
  memberId: string;
  name?: string;
  positionId?: string;
  totalIncome: number;
  summary: {
    personalCommission: number;
    unitIncomes: number;
    centerIncomes: number;
    regionIncomes: number;
    bonusIncomes: number;
  };
}

interface PositionData {
  positionId: string;
  positionName: string;
  memberCount: number;
  totalFYC: number;
  totalCOM: number;
}

interface TreeNode {
  id: string;
  name?: string;
  memberCode?: string;
  positionName?: string;
  positionId?: string;
  personalFYC?: number;
}

function AdminContent() {
  const [activeTab, setActiveTab] = useState<'members' | 'income' | 'positions' | 'audit'>('members');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [incomes, setIncomes] = useState<IncomeItem[]>([]);
  const [positionData, setPositionData] = useState<PositionData[]>([]);
  const [treeStructure, setTreeStructure] = useState<TreeNode[]>([]);
  const [totalActiveMembers, setTotalActiveMembers] = useState(0);
  const [pendingMsgCount, setPendingMsgCount] = useState(0);

  const callApi = async (endpoint: string) => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api${endpoint}`);
    return await res.json();
  };

  const fetchMembers = async () => {
      try {
        const data = await callApi('/admin/members');
        if (data.ok) {
          setMembers(data.members || []);
          setTotalActiveMembers(data.summary?.totalActiveMembers || 0);
        } else {
          setError(data.error || 'ดึงข้อมูลไม่สำเร็จ');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'เชื่อมต่อไม่สำเร็จ');
      }
    };

    const fetchIncomeSummary = async () => {
        try {
          const data = await callApi('/admin/income');
          if (data.ok) {
            setIncomes(data.incomes || []);
          }
        } catch (err) {
          console.error('Income fetch error:', err);
        } finally {
          setLoading(false);
        }
      };

    const fetchPositionData = async () => {
      try {
        const data = await callApi('/admin/positions');
        if (data.ok) {
          setPositionData(data.positions || []);
          setTreeStructure(data.treeStructure || []);
        }
      } catch (err) {
        console.error('Position data fetch error:', err);
      }
    };

  useEffect(() => {
      fetchMembers();
      fetchIncomeSummary();
      fetchPositionData();
      // badge จำนวนข้อความที่ยังไม่ได้ตอบ (best-effort)
      fetch('/api/admin/messages', { credentials: 'include' }).then(r => r.json()).then(j => { if (j.ok) setPendingMsgCount(j.pending || 0); }).catch(() => {});
    }, []);

  if (loading) {
    return (
      <div className="p-8">
        <div className="card p-6">
          <div className="loading-spinner mx-auto mb-4" />
          <p className="text-center text-slate-500">กำลังโหลดข้อมูลจากฐานข้อมูล...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8">
        <div className="card p-6 bg-sky-50 border-blue-100">
          <h3 className="text-lg font-bold text-sky-700 mb-2">กรุณาเข้าสู่ระบบ</h3>
          <p className="text-slate-600 text-sm">{error}</p>
          <div className="mt-3 flex gap-2">
          <button
            onClick={fetchMembers}
            className="px-4 py-2 rounded-full bg-sky-400 text-white text-sm font-medium hover:bg-sky-500"
          >
            ลองใหม่
          </button>
          <Link href="/login" className="px-4 py-2 rounded-full bg-white border border-blue-200 text-sky-700 text-sm">ไปหน้าเข้าสู่ระบบ</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header />
      <div className="flex w-full">
        <Sidebar />
        <main className="flex-1 p-6 space-y-6 bg-white">
          <h1 className="text-xl font-bold text-slate-800">ผู้ดูแลระบบ — Admin Dashboard</h1>

          <div className="flex gap-3 mb-4">
            <button
              onClick={() => setActiveTab('members')}
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                activeTab === 'members'
                  ? 'bg-sky-400 text-white shadow-sm border border-sky-400'
                  : 'bg-white border border-blue-100 text-slate-600 hover:bg-[#f0f7ff]'
              }`}
            >
              ข้อมูลสมาชิก
            </button>
            <button
              onClick={() => setActiveTab('income')}
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                activeTab === 'income'
                  ? 'bg-sky-400 text-white shadow-sm border border-sky-400'
                  : 'bg-white border border-blue-100 text-slate-600 hover:bg-[#f0f7ff]'
              }`}
            >
              รายได้
            </button>
            <button
              onClick={() => setActiveTab('positions')}
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                activeTab === 'positions'
                  ? 'bg-sky-400 text-white shadow-sm border border-sky-400'
                  : 'bg-white border border-blue-100 text-slate-600 hover:bg-[#f0f7ff]'
              }`}
            >
              ตำแหน่ง
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                activeTab === 'audit'
                  ? 'bg-sky-400 text-white shadow-sm border border-sky-400'
                  : 'bg-white border border-blue-100 text-slate-600 hover:bg-[#f0f7ff]'
              }`}
            >
              งบบันทึกการแก้ไข
            </button>
            <Link
              href="/admin/messages"
              className="px-4 py-2 rounded-full text-sm font-medium bg-white border border-blue-100 text-slate-600 hover:bg-[#f0f7ff] flex items-center gap-2"
            >
              💬 ตอบสมาชิก
              {pendingMsgCount > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[11px] font-semibold">{pendingMsgCount}</span>
              )}
            </Link>
            <Link
              href="/admin/reports"
              className="px-4 py-2 rounded-full text-sm font-medium bg-white border border-blue-100 text-slate-600 hover:bg-[#f0f7ff]"
            >
              📊 รายงาน
            </Link>
          </div>

          {/* Members Tab */}
          {activeTab === 'members' && (
            <div>
              <div className="card p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-slate-800">สมาชิกทั้งหมด</h2>
                  <span className="text-sm text-slate-500">ทั้งหมด {totalActiveMembers} รายการ</span>
                </div>
                <div className="mt-4 space-y-3 max-h-[500px] overflow-y-auto">
                  {members.length === 0 ? (
                    <p className="text-sm text-slate-500">ไม่พบข้อมูลสมาชิก</p>
                  ) : (
                    <table className="w-full text-xs border border-blue-100">
                      <thead className="bg-[#f0f7ff] text-slate-600 border-b border-blue-100">
                        <tr>
                          <th className="p-2 text-left">รหสมาชิก</th>
                          <th className="p-2 text-left">ชื่อ-นามสกุล</th>
                          <th className="p-2 text-left">ตำแหน่ง</th>
                          <th className="p-2 text-center">ผลงาน FYC</th>
                          <th className="p-2 text-center">COM ส่วนตัว</th>
                          <th className="p-2 text-center">สถานะ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map((m: any) => (
                          <tr key={m.id} className="border-b">
                            <td className="p-2 font-medium">{m.memberCode || m.id}</td>
                            <td className="p-2">{m.displayName || m.name || '—'}</td>
                            <td className="p-2">
                              {DEFAULT_POSITIONS.find((p: any) => p.id === m.positionId)?.name || m.positionId}
                            </td>
                            <td className="p-2 text-center">{(m.personalFYC || 0).toLocaleString()}</td>
                            <td className="p-2 text-center">{(m.personalCOM || 0).toLocaleString()}</td>
                            <td className="p-2 text-center">
                              {m.status === 'active' ? (
                                <span className="text-green-600">Active</span>
                              ) : (
                                <span className="text-red-600">Inactive</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>

              <div className="mt-6 card p-5">
                <h2 className="text-lg font-bold text-slate-800">อัตราการกระจายตำแหน่ง</h2>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  {positionData.map((p: any) => (
                    <div key={p.positionId} className="p-3 rounded-xl border border-blue-100 bg-[#f0f7ff]">
                      <div className="font-semibold text-slate-800">{p.positionName}</div>
                      <div className="text-xs text-slate-500 mt-1">จำนวน: {p.memberCount} คน</div>
                      <div className="mt-2">
                        <div className="text-xs text-slate-500">FYC รวม: {p.totalFYC.toLocaleString()} บ.</div>
                        <div className="text-xs text-slate-500 mt-1">COM รวม: {p.totalCOM.toLocaleString()} บ.</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Income Tab */}
          {activeTab === 'income' && (
            <div>
              <div className="card p-5">
                <h2 className="text-lg font-bold text-slate-800">สรุปรายได้ทั้งหมด</h2>
                {incomes.length === 0 ? (
                  <p className="text-sm text-slate-500 mt-4">ไม่พบข้อมูลรายได้</p>
                ) : (
                  <table className="w-full text-xs border border-blue-100 mt-4">
                    <thead className="bg-[#f0f7ff] text-slate-600 border-b border-blue-100">
                      <tr>
                        <th className="p-2 text-left">ชื่อ</th>
                        <th className="p-2 text-center">ตำแหน่ง</th>
                        <th className="p-2 text-right">ยอดรวม</th>
                        <th className="p-2 text-left">ส่วนตัว</th>
                        <th className="p-2 text-left">หน่วย</th>
                        <th className="p-2 text-left">ศูนย์</th>
                        <th className="p-2 text-left">ภาค</th>
                        <th className="p-2 text-left">โบนัส</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incomes
                        .sort((a: any, b: any) => b.totalIncome - a.totalIncome)
                        .map((i: any) => (
                          <tr key={i.memberId} className="border-b">
                            <td className="p-2 font-medium">{i.name || '—'}</td>
                            <td className="p-2">
                              {DEFAULT_POSITIONS.find((p: any) => p.id === i.positionId)?.name || i.positionId}
                            </td>
                            <td className="p-2 text-right font-bold text-slate-800">{i.totalIncome.toLocaleString()} บ.</td>
                            <td className="p-2 text-right">{i.summary.personalCommission.toLocaleString()} บ.</td>
                            <td className="p-2 text-right">{i.summary.unitIncomes.toLocaleString()} บ.</td>
                            <td className="p-2 text-right">{i.summary.centerIncomes.toLocaleString()} บ.</td>
                            <td className="p-2 text-right">{i.summary.regionIncomes.toLocaleString()} บ.</td>
                            <td className="p-2 text-right">{i.summary.bonusIncomes.toLocaleString()} บ.</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="mt-6 card p-5">
                <h2 className="text-lg font-bold text-slate-800">กราปจัดแบ่งรายได้</h2>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  {(() => {
                    const totalIncomeSum = incomes.length > 0 ? incomes.reduce((s: number, x: any) => s + x.totalIncome, 0) : 1;
                    const personalPct = incomes.length > 0 ? (incomes[0].summary.personalCommission / Math.max(1, totalIncomeSum)) * 100 : 0;
                    const unitPct = incomes.length > 0 ? (incomes[0].summary.unitIncomes / Math.max(1, totalIncomeSum)) * 100 : 0;
                    const centerPct = incomes.length > 0 ? (incomes[0].summary.centerIncomes / Math.max(1, totalIncomeSum)) * 100 : 0;
                    const regionPct = incomes.length > 0 ? (incomes[0].summary.regionIncomes / Math.max(1, totalIncomeSum)) * 100 : 0;
                    return (
                      <>
                        <div>
                          <div className="text-xs text-slate-500">ส่วนตัว (Personal)</div>
                          <div className="h-4 bg-blue-100 rounded-full overflow-hidden">
                            <div
                              style={{ height: `${personalPct}%`, background: '#34d399' }}
                              className="h-full rounded-full"
                            ></div>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">หน่วย (Unit)</div>
                          <div className="h-4 bg-blue-100 rounded-full overflow-hidden">
                            <div
                              style={{ height: `${unitPct}%`, background: '#a78bfa' }}
                              className="h-full rounded-full"
                            ></div>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">ศูนย์ (Center)</div>
                          <div className="h-4 bg-blue-100 rounded-full overflow-hidden">
                            <div
                              style={{ height: `${centerPct}%`, background: '#fbbf24' }}
                              className="h-full rounded-full"
                            ></div>
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-500">ภาค (Region)</div>
                          <div className="h-4 bg-blue-100 rounded-full overflow-hidden">
                            <div
                              style={{ height: `${regionPct}%`, background: '#f43f5e' }}
                              className="h-full rounded-full"
                            ></div>
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              </div>
            </div>
          )}

          {/* Positions Tab */}
          {activeTab === 'positions' && (
            <div>
              <div className="card p-5">
                <h2 className="text-lg font-bold text-slate-800">โครงสร้างต้นไม้ (Tree Structure)</h2>
                {treeStructure.length === 0 ? (
                  <p className="text-sm text-slate-500 mt-4">ไม่พบข้อมูลต้นไม้</p>
                ) : (
                  <div className="space-y-4 max-h-[600px] overflow-y-auto">
                    {treeStructure.map((root: any) => renderTreeNode(root, 0))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Audit Tab */}
          {activeTab === 'audit' && (
            <div>
              <div className="card p-5">
                <h2 className="text-lg font-bold text-slate-800">Log บันทึก (Audit Log)</h2>
                <div className="mt-4 text-xs font-mono bg-[#f0f7ff] border border-blue-100 text-slate-600 rounded-xl p-3" style={{ maxHeight: '400px', overflow: 'auto' }}>
                  2026-09-05 09:12 — admin@ — member.approve — P-1003 → M-000004 — reason: เอกสารครบ<br/>
                  2026-09-05 09:15 — system — tree.place — M-000004 → parent A01 slot 2 — BFS<br/>
                  2026-09-05 09:20 — finance@ — income.approve — TX-9001 — v2.1
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function renderTreeNode(node: any, depth: number) {
  const indent = '▼ '.repeat(depth);
  return (
    <div key={node.id} className="flex items-start space-x-2">
      <span className="text-xs text-slate-500">{indent}</span>
      <div className="flex-1">
        <div className="font-medium">{node.name || node.memberCode || '—'}</div>
        <div className="text-xs text-slate-500">{node.positionName || node.positionId}</div>
      </div>
      <div className="text-xs text-slate-500">{node.personalFYC?.toLocaleString() || '0'} FYC</div>
    </div>
  );
}

// Default positions for tab rendering
const DEFAULT_POSITIONS = [
  { id: 'agent', name: 'ตัวแทน', color: '#38bdf8' },
  { id: 'unit_manager', name: 'ผู้บริหารหน่วย', color: '#34d399' },
  { id: 'center_manager', name: 'ผู้บริหารศูนย์', color: '#fbbf24' },
  { id: 'region_manager', name: 'ผู้บริหารภาค', color: '#f43f5e' },
  { id: 'senior_unit_manager', name: 'ผู้บริหารหน่วยอาวุโส', color: '#a78bfa' },
  { id: 'senior_center_manager', name: 'ผู้บริหารศูนย์อาวุโส', color: '#fb923c' },
  { id: 'executive_region', name: 'ผู้บริหารภาคอาวุโส', color: '#e879f9' },
];

export default function Admin() {
  return (
    <Suspense fallback={<div className="p-8"><div className="card p-6"><div className="loading-spinner mx-auto mb-4" /><p className="text-center text-slate-500">กำลังโหลด...</p></div></div>}>
      <AdminContent />
    </Suspense>
  );
}