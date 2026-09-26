'use client';
import { useEffect, useState } from 'react';

interface ActivityEntry {
  id: string;
  userId: string;
  ip: string;
  userAgent: string;
  lastActiveAt: string;
  user: {
    id: string;
    displayName?: string;
    email?: string;
    phone?: string;
    lineId?: string;
    memberCode?: string;
    status?: string;
  } | null;
}

export default function VisitorActivityTable() {
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [myIP, setMyIP] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function fetchActivity() {
      try {
        const res = await fetch('/api/admin/visitor-activity');
        const data = await res.json();
        if (mounted && data.ok) {
          setActivity(data.activity || []);
          setMyIP(data.myIP || null);
        }
      } catch (e) {
        console.error('fetch activity error', e);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    fetchActivity();
    return () => { mounted = false; };
  }, []);

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch('/api/admin/visitor-activity');
      const data = await res.json();
      if (data.ok) {
        setActivity(data.activity || []);
        setMyIP(data.myIP || null);
      }
    } catch (e) {
      console.error('refresh error', e);
    }
    setRefreshing(false);
  }

  const formatTime = (iso: string) => {
    try {
      const d = new Date(iso);
      const now = new Date();
      const diff = now.getTime() - d.getTime();
      const mins = Math.floor(diff / 60000);
      const hrs = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      if (mins < 1) return 'ตอนนี้';
      if (mins < 60) return `${mins} นาทีที่แล้ว`;
      if (hrs < 24) return `${hrs} ชั่วโมงที่แล้ว`;
      if (days < 7) return `${days} วันที่แล้ว`;
      return d.toLocaleDateString('th-TH');
    } catch {
      return iso;
    }
  };

  if (loading) {
    return (
      <div className="card p-5">
        <div className="animate-pulse space-y-2">
          <div className="h-5 bg-slate-200 rounded w-1/3" />
          <div className="h-3 bg-slate-200 rounded w-full" />
          <div className="h-3 bg-slate-200 rounded w-5/6" />
          <div className="h-3 bg-slate-200 rounded w-2/3" />
        </div>
      </div>
    );
  }

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="font-semibold text-navy">กิจกรรมล่าสุด — IP Tracking</div>
        <div className="flex items-center gap-2">
          {myIP && (
            <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full font-mono">IP: {myIP}</span>
          )}
          <button
            onClick={refresh}
            disabled={refreshing}
            className="text-xs px-2 py-1 rounded-full border bg-white border-slate-300 hover:bg-slate-50 disabled:opacity-50"
          >
            {refreshing ? 'กำลังโหลด...' : 'รีเฟรช'}
          </button>
        </div>
      </div>

      {activity.length === 0 ? (
        <div className="text-xs text-slate-400 text-center py-3">
          ยังไม่มีกิจกรรม — มีสมาชิก login เข้ามาจะปรากฏที่นี่
        </div>
      ) : (
        <div className="overflow-auto max-h-[280px]">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 text-slate-600 sticky top-0">
              <tr>
                <th className="text-left p-2">เวลา</th>
                <th className="text-left p-2 font-mono">IP</th>
                <th className="text-left p-2 hidden sm:table-cell">สมาชิก</th>
                <th className="text-left p-2 hidden md:table-cell">อีเมล</th>
                <th className="text-left p-2 hidden lg:table-cell">เบอร์โทร</th>
                <th className="text-left p-2 hidden xl:table-cell">Line ID</th>
                <th className="text-center p-2">สถานะ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {activity.slice(0, 15).map((a) => (
                <tr key={a.id} className="hover:bg-slate-50">
                  <td className="p-2 text-slate-500 whitespace-nowrap">
                    {formatTime(a.lastActiveAt)}
                    <div className="text-[10px] text-slate-400">
                      {new Date(a.lastActiveAt).toLocaleTimeString('th-TH', { hour:'2-digit', minute:'2-digit' })}
                    </div>
                  </td>
                  <td className="p-2 font-mono text-slate-600">{a.ip}</td>
                  <td className="p-2 hidden sm:table-cell">
                    {a.user ? (
                      <span className="font-medium">
                        {a.user.memberCode && <span className="text-navy font-mono text-[10px] mr-1">{a.user.memberCode}</span>}
                        {a.user.displayName || a.user.email}
                      </span>
                    ) : (
                      <span className="text-slate-400">(ไม่ระบุ)</span>
                    )}
                  </td>
                  <td className="p-2 text-slate-500 hidden md:table-cell">{a.user?.email || '-'}</td>
                  <td className="p-2 text-slate-500 hidden lg:table-cell">{a.user?.phone || '-'}</td>
                  <td className="p-2 text-slate-500 hidden xl:table-cell">{a.user?.lineId || '-'}</td>
                  <td className="p-2 text-center">
                    {a.user && (
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium ${
                        a.user.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' :
                        a.user.status === 'PENDING' ? 'bg-amber-100 text-amber-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>
                        {a.user.status || 'UNKNOWN'}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {activity.length > 15 && (
            <div className="text-center text-xs text-slate-400 py-1">
              แสดง 15 กิจกรรมล่าสุด (ทั้งหมด {activity.length})
            </div>
          )}
        </div>
      )}
      <div className="text-[10px] text-slate-400 mt-2">
        อัปเดตเมื่อเปิดหน้า • IP จับจาก x-forwarded-for / x-real-ip / cf-connecting-ip
      </div>
    </div>
  );
}
