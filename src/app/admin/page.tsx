'use client';
import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';

export default function Admin() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/dashboard';
  const [activeTab, setActiveTab] = useState<'members' | 'income' | 'positions' | 'audit'>('members');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [incomes, setIncomes] = useState<any[]>([]);
  const [positionData, setPositionData] = useState<any[]>([]);
  const [treeStructure, setTreeStructure] = useState<any[]>([]);
  const [totalActiveMembers, setTotalActiveMembers] = useState(0);

  useEffect(() => {
    fetchMembers();
    fetchIncomeSummary();
    fetchPositionData();
  }, []);

  const callApi = async (endpoint: string) => {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api${endpoint}`);
    return await res.json();
  };

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const data = await callApi('/admin/members');
      if (data.ok) {
        setMembers(data.members || []);
        setTotalActiveMembers(data.summary?.totalActiveMembers || 0);
      } else {
        setError(data.error || 'ดึงข้อมูลไม่สำเร็จ');
      }
    } catch (err: any) {
      setError(err.message || 'เชื่อมต่อไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  const fetchIncomeSummary = async () => {
    try {
      const data = await callApi('/admin/income');
      if (data.ok) {
        setIncomes(data.incomes || []);
      }
    } catch (err: any) {
      console.error('Income fetch error:', err);
    }
  };

  const fetchPositionData = async () => {
    try {
      const data = await callApi('/admin/positions');
      if (data.ok) {
        setPositionData(data.positions || []);
        setTreeStructure(data.treeStructure || []);
      }
    } catch (err: any) {
      console.error('Position data fetch error:', err);
    }
  };

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
        <div className="card p-6 bg-red-50 border-red-200">
          <h3 className="text-lg font-bold text-red-600 mb-2">เกิดข้อผิดพลาด</h3>
          <p className="text-slate-600">{error}</p>
          <button
            onClick={fetchMembers}
            className="mt-3 px-4 py-2 rounded-full bg-[#c8a84e] text-[#0f2040] text-sm font-medium hover:bg-slate-50"
          >
            ลองใหม่
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Header />
      <div className="flex max-w-[1280px] mx-auto">
        <Sidebar />
        <main className="flex-1 p-6 space-y-6">
          <h1 className="text-xl font-bold text-navy">ผู้ดูแลระบบ — Admin Dashboard</h1>

          <div className="flex gap-3 mb-4">
            <button
              onClick={() => setActiveTab('members')}
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                activeTab === 'members' 
                  ? 'bg-[#0f2040] text-white' 
                  : 'border text-slate-500 hover:bg-slate-50'
              }`}
            >
              ข้อมูลสมาชิก
            </button>
            <button
              onClick={() => setActiveTab('income')}
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                activeTab === 'income'
                  ? 'bg-[#0f2040] text-white'
                  : 'border text-slate-500 hover:bg-slate-50'
              }`}
            >
              รายได้
            </button>
            <button
              onClick={() => setActiveTab('positions')}
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                activeTab === 'positions'
                  ? 'bg-[#0f2040] text-white'
                  : 'border text-slate-500 hover:bg-slate-50'
              }`}
            >
              ตำแหน่ง
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`px-4 py-2 rounded-full text-sm font-medium ${
                activeTab === 'audit'
                  ? 'bg-[#0f2040] text-white'
                  : 'border text-slate-500 hover:bg-slate-50'
              }`}
            >
              งบบันทึกการแก้ไข
            </button>
          </div>

          {/* Members Tab */}
          {activeTab === 'members' && (
            <div>
              <div className="card p-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-navy">สมาชิกทั้งหมด</h2>
                  <span className="text-sm text-slate-500">ทั้งหมด {totalActiveMembers} รายการ</span>
                </div>
                <div className="mt-4 space-y-3 max-h-[500px] overflow-y-auto">
                  {members.length === 0 ? (
                    <p className="text-sm text-slate-500">ไม่พบข้อมูลสมาชิก</p>
                  ) : (
                    <table className="w-full text-xs border">
                      <thead className="bg-[#0f2040] text-white">
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
                <h2 className="text-lg font-bold text-navy">อัตราการกระจายตำแหน่ง</h2>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  {positionData.map((p: any) => (
                    <div key={p.positionId} className="p-3 rounded-xl border-slate-200">
                      <div className="font-semibold text-navy">{p.positionName}</div>
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
                <h2 className="text-lg font-bold text-navy">สรุปรายได้ทั้งหมด</h2>
                {incomes.length === 0 ? (
                  <p className="text-sm text-slate-500 mt-4">ไม่พบข้อมูลรายได้</p>
                ) : (
                  <table className="w-full text-xs border mt-4">
                    <thead className="bg-[#0f2040] text-white">
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
                            <td className="p-2 text-right font-bold text-navy">{i.totalIncome.toLocaleString()} บ.</td>
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
                <h2 className="text-lg font-bold text-navy">กราปจัดแบ่งรายได้</h2>
                <div className="grid grid-cols-2 gap-3 mt-4">
                  <div>
                    <div className="text-xs text-slate-500">ส่วนตัว (Personal)</div>
                    <div className="h-4 bg-slate-200 rounded-full overflow-hidden">
                      <div 
                        style={{ height: `${incomes.length > 0 ? (incomes[0].summary.personalCommission / Math.max(1, incomes.reduce((s: any, x: any) => s + x.totalIncome, 0)) * 100 : 0)}%`, background: '#34d399' }}
                        className="h-full rounded-full"
                      ></div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">หน่วย (Unit)</div>
                    <div className="h-4 bg-slate-200 rounded-full overflow-hidden">
                      <div 
                        style={{ height: `${incomes.length > 0 ? (incomes[0].summary.unitIncomes / Math.max(1, incomes.reduce((s: any, x: any) => s + x.totalIncome, 0)) * 100 : 0)}%`, background: '#a78bfa' }}
                        className="h-full rounded-full"
                      ></div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">ศูนย์ (Center)</div>
                    <div className="h-4 bg-slate-200 rounded-full overflow-hidden">
                      <div 
                        style={{ height: `${incomes.length > 0 ? (incomes[0].summary.centerIncomes / Math.max(1, incomes.reduce((s: any, x: any) => s + x.totalIncome, 0)) * 100 : 0)}%`, background: '#fbbf24' }}
                        className="h-full rounded-full"
                      ></div>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500">ภาค (Region)</div>
                    <div className="h-4 bg-slate-200 rounded-full overflow-hidden">
                      <div 
                        style={{ height: `${incomes.length > 0 ? (incomes[0].summary.regionIncomes / Math.max(1, incomes.reduce((s: any, x: any) => s + x.totalIncome, 0)) * 100 : 0)}%`, background: '#f43f5e' }}
                        className="h-full rounded-full"
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Positions Tab */}
          {activeTab === 'positions' && (
            <div>
              <div className="card p-5">
                <h2 className="text-lg font-bold text-navy">โครงสร้างต้นไม้ (Tree Structure)</h2>
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
                <h2 className="text-lg font-bold text-navy">Log บันทึก (Audit Log)</h2>
                <div className="mt-4 text-xs font-mono bg-slate-900 text-slate-100 rounded-xl p-3" style={{ maxHeight: '400px', overflow: 'auto' }}>
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