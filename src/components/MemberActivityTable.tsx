'use client';
import { useCallback, useEffect, useState } from 'react';

interface Member {
  id: string;
  memberCode?: string | null;
  name?: string;
  displayName?: string;
  status?: string;
  adminStatus?: string;
  deleted?: boolean;
  source?: string;
  email?: string | null;
  phone?: string | null;
  lineId?: string | null;
  rankLevel?: number;
  rankName?: string;
  positionName?: string | null;
  joinDate?: string | null;
  createdAt?: string | null;
}

const STATUS_BG: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-700',
  PENDING: 'bg-amber-100 text-amber-700',
  SUSPENDED: 'bg-rose-100 text-rose-700',
  INACTIVE: 'bg-slate-100 text-slate-600',
  RESIGNED: 'bg-slate-800 text-white',
};

type Filter = 'all' | 'pending' | 'active' | 'deleted';

/**
 * รายชื่อสมาชิกล่าสุด — ใช้กับหน้า /dashboard
 * • อนุมัติสมาชิก (PENDING → ACTIVE) และ ลบสมาชิกออกจากระบบ (ซ่อนจากทะเบียน + คืนค่าได้)
 *   ผ่าน POST /api/admin/members — เครื่องยนต์เดียวกับหน้า /admin (มี Audit Log + ประวัติสถานะเสมอ)
 * • หลังทำรายการ โหลดรายชื่อใหม่เอง + ยิง event 'members-updated' ให้หน้าเจ้าบ้านดึงตัวเลข KPI ใหม่ด้วย
 * • ผู้ใช้ที่ไม่มีสิทธิ์ผู้ดูแล เห็นรายชื่อแบบอ่านอย่างเดียว (ไม่มีปุ่มจัดการ) โดยไม่ error
 */
export default function MemberActivityTable() {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [canManage, setCanManage] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [lastAt, setLastAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    try {
      // 1) ทะเบียนจริง + สิทธิ์จัดการ (ผู้ดูแลเท่านั้น) — ตัวเดียวกับหน้า /admin
      const r = await fetch('/api/admin/members', { credentials: 'include', cache: 'no-store' });
      if (r.ok) {
        const d = await r.json();
        if (d?.ok) {
          setMembers((d.members || []) as Member[]);
          setCanManage(true);
          setErrMsg(null);
          setLastAt(new Date());
          return;
        }
      }
      // 2) สมาชิกทั่วไป (ไม่มีสิทธิ์ผู้ดูแล) — แสดงรายชื่ออ่านอย่างเดียว
      const r2 = await fetch('/api/members?take=50', { credentials: 'include', cache: 'no-store' });
      const d2 = await r2.json();
      if (d2?.ok) {
        setMembers((d2.members || []) as Member[]);
        setCanManage(false);
        setErrMsg(null);
        setLastAt(new Date());
      } else {
        setErrMsg(d2?.error || 'โหลดรายชื่อสมาชิกไม่สำเร็จ');
      }
    } catch (e: any) {
      setErrMsg(e?.message || 'เชื่อมต่อไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // อัปเดตระบบสมาชิกเองทุก 30 วินาที — สถานะไม่ค้าง
  useEffect(() => {
    const t = setInterval(() => { load(); }, 30 * 1000);
    return () => clearInterval(t);
  }, [load]);

  async function act(m: Member, action: 'approve' | 'delete' | 'restore') {
    const who = m.name || m.displayName || m.memberCode || m.id;
    if (action === 'delete') {
      const ok = window.confirm(
        `ยืนยันลบสมาชิกออกจากระบบ?\n\n${m.memberCode ? m.memberCode + ' · ' : ''}${who}\n\n` +
          'สมาชิกคนนี้จะถูกซ่อนออกจากทะเบียนที่ใช้งาน (สถานะ RESIGNED) และไม่ถูกนับในเครือข่าย — กด ↩ คืนค่าได้ทุกเมื่อ',
      );
      if (!ok) return;
    }
    setBusyId(m.id);
    setMsg(null);
    setErrMsg(null);
    try {
      const body: any = { id: m.id, action };
      if (action === 'delete') body.confirm = 'DELETE';
      const r = await fetch('/api/admin/members', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const d = await r.json().catch(() => ({} as any));
      if (!d?.ok) {
        setErrMsg(d?.error || 'ทำรายการไม่สำเร็จ');
      } else {
        setMsg(
          action === 'approve'
            ? `✅ อนุมัติ ${who} แล้ว — สถานะเป็น ACTIVE`
            : action === 'delete'
              ? `🗑 ลบ ${who} ออกจากระบบแล้ว (ซ่อนจากทะเบียน · กด ↩ คืนค่าได้)`
              : `↩ คืนค่า ${who} เข้าระบบแล้ว`,
        );
        await load();
        // แจ้งหน้าอื่น (การ์ด KPI / เมนูด้านข้าง) ให้ดึงตัวเลขสมาชิกใหม่
        try { window.dispatchEvent(new Event('members-updated')); } catch {}
      }
    } catch (e: any) {
      setErrMsg(e?.message || 'เชื่อมต่อไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  }

  const visible = members.filter((m) => {
    const st = String(m.status || 'PENDING').toUpperCase();
    if (filter === 'deleted') return st === 'RESIGNED';
    if (st === 'RESIGNED') return false;
    if (filter === 'active') return st === 'ACTIVE';
    if (filter === 'pending') return st === 'PENDING';
    return true;
  });

  const pendingCount = members.filter((m) => String(m.status || '').toUpperCase() === 'PENDING').length;
  const activeCount = members.filter((m) => String(m.status || '').toUpperCase() === 'ACTIVE').length;
  const deletedCount = members.filter((m) => String(m.status || '').toUpperCase() === 'RESIGNED').length;

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
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="font-semibold text-navy">รายชื่อสมาชิกล่าสุด</div>
          {pendingCount > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
              รออนุมัติ {pendingCount}
            </span>
          )}
        </div>
        <div className="flex gap-2 text-xs flex-wrap">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1 rounded-full border ${filter === 'all' ? 'bg-navy text-white border-navy' : 'bg-white border-slate-300'}`}
          >ทั้งหมด ({members.length - deletedCount})</button>
          <button
            onClick={() => setFilter('active')}
            className={`px-3 py-1 rounded-full border ${filter === 'active' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-slate-300'}`}
          >Active ({activeCount})</button>
          <button
            onClick={() => setFilter('pending')}
            className={`px-3 py-1 rounded-full border ${filter === 'pending' ? 'bg-amber-600 text-white border-amber-600' : 'bg-white border-slate-300'}`}
          >Pending ({pendingCount})</button>
          <button
            onClick={() => setFilter('deleted')}
            className={`px-3 py-1 rounded-full border ${filter === 'deleted' ? 'bg-slate-700 text-white border-slate-700' : 'bg-white border-slate-300'}`}
          >ลบแล้ว ({deletedCount})</button>
        </div>
      </div>

      {msg && <div className="mb-3 text-xs px-3 py-2 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">{msg}</div>}
      {errMsg && <div className="mb-3 text-xs px-3 py-2 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">{errMsg}</div>}

      {visible.length === 0 ? (
        <div className="text-xs text-slate-400 text-center py-4">
          {filter === 'deleted' ? 'ยังไม่มีสมาชิกที่ถูกลบออกจากระบบ' : 'ยังไม่มีสมาชิกในระบบ'}
        </div>
      ) : (
        <div className="overflow-auto max-h-[360px]">
          <table className="w-full text-xs">
            <thead className="bg-slate-100 text-slate-600 sticky top-0">
              <tr>
                <th className="text-left p-2">Member ID</th>
                <th className="text-left p-2">ชื่อ</th>
                <th className="text-left p-2 hidden md:table-cell">อีเมล</th>
                <th className="text-left p-2 hidden md:table-cell">เบอร์โทร</th>
                <th className="text-center p-2">สถานะ</th>
                <th className="text-center p-2 hidden sm:table-cell">ตำแหน่ง</th>
                <th className="text-center p-2 hidden lg:table-cell">วันสมัคร</th>
                {canManage && <th className="text-center p-2">จัดการ</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.slice(0, 20).map((m) => {
                const st = String(m.status || 'PENDING').toUpperCase();
                const isDeleted = st === 'RESIGNED';
                const rowBusy = busyId === m.id;
                const joined = m.joinDate || m.createdAt;
                return (
                  <tr key={m.id} className={`hover:bg-slate-50 ${isDeleted ? 'opacity-70' : ''}`}>
                    <td className="p-2 font-mono font-semibold text-navy">{m.memberCode || '-'}</td>
                    <td className="p-2 font-medium">{m.name || m.displayName || '-'}</td>
                    <td className="p-2 text-slate-500 hidden md:table-cell">{m.email || '-'}</td>
                    <td className="p-2 text-slate-500 hidden md:table-cell">{m.phone || '-'}</td>
                    <td className="p-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full border text-[10px] font-medium ${STATUS_BG[st] || 'bg-slate-100'}`}>
                        {st}
                      </span>
                    </td>
                    <td className="p-2 text-center text-slate-500 hidden sm:table-cell">
                      {m.positionName || m.rankName || `L${m.rankLevel ?? 0}`}
                    </td>
                    <td className="p-2 text-center text-slate-400 hidden lg:table-cell">
                      {joined ? new Date(joined).toLocaleDateString('th-TH') : '-'}
                    </td>
                    {canManage && (
                      <td className="p-2">
                        <div className="flex gap-1.5 justify-center">
                          {!isDeleted && st !== 'ACTIVE' && (
                            <button
                              type="button"
                              disabled={rowBusy}
                              onClick={() => act(m, 'approve')}
                              title="อนุมัติสมาชิกคนนี้ (PENDING → ACTIVE)"
                              className={`px-2 py-1 rounded-full text-[11px] font-semibold border ${
                                rowBusy ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                              }`}
                            >
                              ✅ อนุมัติ
                            </button>
                          )}
                          {!isDeleted ? (
                            <button
                              type="button"
                              disabled={rowBusy}
                              onClick={() => act(m, 'delete')}
                              title="ลบสมาชิกออกจากระบบ (ซ่อนจากทะเบียน · คืนค่าได้)"
                              className={`px-2 py-1 rounded-full text-[11px] font-semibold border ${
                                rowBusy ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'
                              }`}
                            >
                              🗑 ลบ
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={rowBusy}
                              onClick={() => act(m, 'restore')}
                              title="คืนค่าสมาชิกกลับเข้าระบบ"
                              className={`px-2 py-1 rounded-full text-[11px] font-semibold border ${
                                rowBusy ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                              }`}
                            >
                              ↩ คืนค่า
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visible.length > 20 && (
            <div className="text-center text-xs text-slate-400 py-2">แสดง 20 รายการล่าสุด (ทั้งหมด {visible.length} คน)</div>
          )}
        </div>
      )}

      <div className="text-[10px] text-slate-400 mt-2 flex items-center gap-2 flex-wrap">
        <span suppressHydrationWarning>อัปเดตอัตโนมัติทุก 30 วินาที • ทะเบียนจริง (Postgres)</span>
        {lastAt && <span suppressHydrationWarning>• ดึงล่าสุด {lastAt.toLocaleTimeString('th-TH')} น.</span>}
        {!canManage && <span>• ต้องเข้าสู่ระบบในฐานะผู้ดูแลระบบจึงจะอนุมัติ/ลบสมาชิกได้</span>}
        {canManage && <span>• ทุกคำสั่งถูกบันทึก Audit Log (ใครทำ เมื่อไร ผลเป็นอย่างไร)</span>}
      </div>
    </div>
  );
}
