'use client';
import { useEffect, useState } from 'react';

interface Member {
  id: string;
  memberCode?: string;
  name?: string;
  status?: string;
  email?: string;
  phone?: string;
  lineId?: string;
  rankLevel?: number;
  rankName?: string;
  joinDate?: string;
  createdAt?: string;
}

const STATUS_BG: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  PENDING: 'bg-amber-100 text-amber-700',
  SUSPENDED: 'bg-rose-100 text-rose-700',
  INACTIVE: 'bg-slate-100 text-slate-600',
  RESIGNED: 'bg-slate-800 text-white',
};

export default function MemberActivityTable() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'pending'>('all');

  useEffect(() => {
    let mounted = true;
    async function fetchMembers() {
      try {
        const res = await fetch('/api/members?take=50');
        const data = await res.json();
        if (mounted && data.ok) {
          let list = data.members || [];
          if (filter === 'active') list = list.filter((m: Member) => m.status === 'ACTIVE');
          if (filter === 'pending') list = list.filter((m: Member) => m.status === 'PENDING');
          setMembers(list);
        }
      } catch (e) {
        console.error('fetch members error', e);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchMembers();
    return () => { mounted = false; };
  }, [filter]);

  const activeCount = members.filter(m => m.status === 'ACTIVE').length;
  const pendingCount = members.filter(m => m.status === 'PENDING').length;

  if (loading) {
    return (
      <div className="card p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-5 bg-slate-200 rounded w-1/3" />
          <div className="h-3 bg-slate-200 rounded w-full" />
          <div className="h-3 bg-slate-200 rounded w-5/6" />
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="font-semibold text-navy">รายชื่อสมาชิกล่าสุด</div>
        <div className="flex gap-2 text-xs">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-full border ${filter === 'all' ? 'bg-navy text-white border-navy' : 'bg-white border-slate-300'}`}
          >ทั้งหมด ({members.length})</button>
          <button
            onClick={() => setFilter('active')}
            className={`px-3 py-1 rounded-full border ${filter === 'active' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-slate-300'}`}
          >Active ({activeCount})</button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-3 py-1 rounded-full border ${filter === 'pending' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white border-slate-300'}`}
          >Pending ({pendingCount})</button>
        </div>
      </div>

      {members.length === 0 ? (
        <div className="text-xs text-slate-400 text-center py-4">ยังไม่มีสมาชิกในระบบ</div>
      ) : (
        <div className="overflow-auto max-h-[320px]">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 text-slate-600 sticky top-0">
              <tr>
                <th className="text-left p-2">Member ID</th>
                <th className="text-left p-2">ชื่อ</th>
                <th className="text-left p-2 hidden md:table-cell">อีเมล</th>
                <th className="text-left p-2 hidden md:table-cell">เบอร์โทร</th>
                <th className="text-left p-2 hidden lg:table-cell">Line ID</th>
                <th className="text-center p-2">สถานะ</th>
                <th className="text-center p-2 hidden sm:table-cell">Rank</th>
                <th className="text-center p-2 hidden lg:table-cell">วันสมัคร</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {members.slice(0, 20).map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <td className="p-2 font-mono font-semibold text-navy">{m.memberCode || '-'}</td>
                  <td className="p-2 font-medium">{m.name || '-'}</td>
                  <td className="p-2 text-slate-500 hidden md:table-cell">{m.email || '-'}</td>
                  <td className="p-2 text-slate-500 hidden md:table-cell">{m.phone || '-'}</td>
                  <td className="p-2 text-slate-500 hidden lg:table-cell">{m.lineId || '-'}</td>
                  <td className="p-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium ${STATUS_BG[m.status || 'PENDING'] || 'bg-slate-100'}`}>
                      {m.status || 'PENDING'}
                    </span>
                  </td>
                  <td className="p-2 text-center text-slate-500 hidden sm:table-cell">{m.rankName || `L${m.rankLevel}`}</td>
                  <td className="p-2 text-center text-slate-400 hidden lg:table-cell">
                    {m.joinDate ? new Date(m.joinDate).toLocaleDateString('th-TH') : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {members.length > 20 && (
            <div className="text-center text-xs text-slate-400 py-2">แสดง 20 รายการล่าสุด (ทั้งหมด {members.length} คน)</div>
          )}
        </div>
      )}
      <div className="text-[10px] text-slate-400 mt-2">อัปเดตเมื่อเปิดหน้า • ข้อมูลจากฐานข้อมูลหลัก</div>
    </div>
  );
}
