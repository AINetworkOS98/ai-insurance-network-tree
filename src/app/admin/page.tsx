'use client';
import { useState, useEffect, Suspense } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';
import { isAdminEmail } from '@/lib/access-rules';

export const dynamic = 'force-dynamic';

interface Member {
  id: string;
  memberCode?: string;
  displayName?: string;
  name?: string;
  email?: string | null;
  positionId?: string;
  positionName?: string;
  personalFYC?: number;
  personalCOM?: number;
  status?: string;
  /** สถานะฝั่งผู้ดูแล: pending (รออนุมัติ) · approved · rejected · deleted */
  adminStatus?: 'pending' | 'approved' | 'rejected' | 'deleted';
  deleted?: boolean;
  autoRenew?: boolean;
  autoRenewSelf?: boolean;
  autoRenewSet?: boolean;
  legacy?: boolean;
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
  // เครื่องมือผู้บริหารระบบ (ตอบสมาชิก / Support / รายงาน) — แสดงเฉพาะ Admin หรืออีเมล akarapol.pro798@gmail.com
  const [canAdminTools, setCanAdminTools] = useState(false);
  // แยกสาเหตุที่โหลดไม่ได้: 'auth' = ยังไม่ล็อกอิน (ให้ไปหน้าเข้าสู่ระบบ) / 'perm' = ล็อกอินแล้วแต่ไม่มีสิทธิ์ (ไม่ต้องล็อกอินใหม่)
  const [errorHint, setErrorHint] = useState<'auth'|'perm'|null>(null);

  const callApi = async (endpoint: string) => {
    // credentials:'include' — ส่งคุกกี้เซสชันเสมอ (กันกรณี NEXT_PUBLIC_BASE_URL ชี้คนละโดเมน)
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api${endpoint}`, { credentials: 'include', cache: 'no-store' });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data: data as any };
  };

  const fetchMembers = async () => {
      try {
        const { status, data } = await callApi('/admin/members');
        if (data.ok) {
          setMembers(data.members || []);
          setTotalActiveMembers(data.summary?.totalActiveMembers || 0);
          setSummary(data.summary || null);
          setAutoRenewGlobal(data.summary?.autoRenewGlobal === true);
          setError(null); setErrorHint(null);
        } else if (status === 401) {
          setErrorHint('auth');
          setError(data.error || 'ยังไม่ได้เข้าสู่ระบบ หรือเซสชันหมดอายุ');
        } else if (status === 403) {
          setErrorHint('perm');
          setError(data.error || 'บัญชีที่ล็อกอินอยู่ไม่มีสิทธิ์ผู้ดูแลระบบ');
        } else {
          setErrorHint(null);
          setError(data.error || `ดึงข้อมูลไม่สำเร็จ (HTTP ${status})`);
        }
      } catch (err) {
        setErrorHint(null);
        setError(err instanceof Error ? err.message : 'เชื่อมต่อไม่สำเร็จ');
      }
    };

    const fetchIncomeSummary = async () => {
        try {
          const { data } = await callApi('/admin/income');
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
        const { data } = await callApi('/admin/positions');
        if (data.ok) {
          setPositionData(data.positions || []);
          setTreeStructure(data.treeStructure || []);
        }
      } catch (err) {
        console.error('Position data fetch error:', err);
      }
    };

  // ── จัดการสมาชิก: อนุมัติ/ไม่อนุมัติ · ลบออก/คืนค่า · ต่ออายุอัตโนมัติ ──────────
  const [busyId, setBusyId] = useState<string | null>(null);
  const [globalBusy, setGlobalBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [memberFilter, setMemberFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'deleted'>('all');
  const [autoRenewGlobal, setAutoRenewGlobal] = useState(false);
  const [summary, setSummary] = useState<any>(null);

  const postAction = async (payload: any) => {
    // credentials:'include' — ต้องส่งคุกกี้เซสชัน ไม่งั้นตัวกั้นผู้ดูแลตอบ 401
    const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/admin/members`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || `ทำรายการไม่สำเร็จ (HTTP ${res.status})`);
    return data;
  };

  const memberAction = async (m: any, action: 'approve' | 'reject' | 'delete' | 'restore' | 'autoRenew', autoRenew?: boolean) => {
    const label = m.name || m.memberCode || m.id;
    const ask: Record<string, string> = {
      approve: `อนุมัติสมาชิก ${label} ใช่หรือไม่?\n(สถานะจะเปลี่ยนเป็น ACTIVE)`,
      reject: `ไม่อนุมัติ ${label} ใช่หรือไม่?\n(สถานะจะเปลี่ยนเป็น INACTIVE)`,
      delete: `ลบ ${label} ออกจากระบบ?\n(ซ่อนจากทะเบียนที่ใช้งาน — กดคืนค่าได้ภายหลัง)`,
      restore: `คืนค่า ${label} กลับเข้าระบบ ใช่หรือไม่?`,
    };
    if (ask[action] && !window.confirm(ask[action])) return;
    setBusyId(m.id); setNotice(null);
    try {
      await postAction({ id: m.id, action, autoRenew, confirm: action === 'delete' ? 'DELETE' : undefined });
      const done: Record<string, string> = {
        approve: 'อนุมัติแล้ว',
        reject: 'ตั้งเป็นไม่อนุมัติแล้ว',
        delete: 'ลบออกแล้ว (กดคืนค่าได้)',
        restore: 'คืนค่าแล้ว',
        autoRenew: autoRenew ? 'เปิดต่ออายุอัตโนมัติแล้ว' : 'ปิดต่ออายุอัตโนมัติแล้ว',
      };
      setNotice({ kind: 'ok', text: `${label}: ${done[action]}` });
      await fetchMembers();
    } catch (err) {
      setNotice({ kind: 'err', text: err instanceof Error ? err.message : 'ทำรายการไม่สำเร็จ' });
    } finally {
      setBusyId(null);
    }
  };

  const toggleGlobalAutoRenew = async () => {
    const next = !autoRenewGlobal;
    if (!window.confirm(next ? 'เปิดต่ออายุอัตโนมัติให้สมาชิกทุกคนในระบบ?' : 'ปิดต่ออายุอัตโนมัติทั้งระบบ?')) return;
    setGlobalBusy(true); setNotice(null);
    try {
      const data = await postAction({ action: 'autoRenewGlobal', autoRenew: next });
      setAutoRenewGlobal(next);
      setNotice({
        kind: 'ok',
        text: next
          ? `เปิดต่ออายุอัตโนมัติทั้งระบบแล้ว — ใช้กับสมาชิก ${data.affected ?? 0} บัญชีที่ยังไม่ตั้งรายคน`
          : 'ปิดต่ออายุอัตโนมัติทั้งระบบแล้ว (สมาชิกที่ตั้งรายคนไว้ยังใช้ค่าของตัวเอง)',
      });
      await fetchMembers();
    } catch (err) {
      setNotice({ kind: 'err', text: err instanceof Error ? err.message : 'สลับสวิตช์ไม่สำเร็จ' });
    } finally {
      setGlobalBusy(false);
    }
  };

  useEffect(() => {
      fetchMembers();
      fetchIncomeSummary();
      fetchPositionData();
      // badge จำนวนข้อความที่ยังไม่ได้ตอบ (best-effort)
      fetch('/api/admin/messages', { credentials: 'include' }).then(r => r.json()).then(j => { if (j.ok) setPendingMsgCount(j.pending || 0); }).catch(() => {});
      // ใครเป็นผู้บริหารระบบ — คุมการแสดงเมนู ตอบสมาชิก/Support/รายงาน (ตัวกั้นจริงอยู่ที่ middleware)
      fetch('/api/auth/me', { credentials: 'include' }).then(r => r.json()).then(j => { if (j.ok && j.authed && j.user) setCanAdminTools(isAdminEmail(j.user.email)); }).catch(() => {});
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
          <h3 className="text-lg font-bold text-sky-700 mb-2">
            {errorHint === 'auth' ? 'กรุณาเข้าสู่ระบบ' : errorHint === 'perm' ? 'เข้าสู่ระบบแล้ว แต่บัญชีนี้ยังไม่มีสิทธิ์ผู้ดูแลระบบ' : 'โหลดข้อมูลไม่สำเร็จ'}
          </h3>
          <p className="text-slate-600 text-sm">{error}</p>
          {errorHint === 'perm' && (
            <p className="text-slate-500 text-xs mt-2">
              วิธีแก้: เข้าสู่ระบบด้วยอีเมลผู้ดูแลระบบที่กำหนด (เช่น akarapol.pro798@gmail.com) หรือให้ผู้ดูแลเพิ่มบทบาท admin/super_admin ให้บัญชีนี้ — ไม่ต้องเข้าสู่ระบบซ้ำ
            </p>
          )}
          <div className="mt-3 flex gap-2">
          <button
            onClick={fetchMembers}
            className="px-4 py-2 rounded-full bg-sky-400 text-white text-sm font-medium hover:bg-sky-500"
          >
            ลองใหม่
          </button>
          {errorHint === 'auth' && (
            <Link href="/login" className="px-4 py-2 rounded-full bg-white border border-blue-200 text-sky-700 text-sm">ไปหน้าเข้าสู่ระบบ</Link>
          )}
          {errorHint === 'perm' && (
            <Link href="/" className="px-4 py-2 rounded-full bg-white border border-blue-200 text-sky-700 text-sm">กลับหน้าแรก</Link>
          )}
          </div>
        </div>
      </div>
    );
  }

  const visibleMembers = members.filter((m: any) => (memberFilter === 'all' ? true : m.adminStatus === memberFilter));

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
            {canAdminTools && (<>
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
              href="/admin/support"
              className="px-4 py-2 rounded-full text-sm font-medium bg-white border border-blue-100 text-slate-600 hover:bg-[#f0f7ff] flex items-center gap-2"
            >
              📩 Support
            </Link>
            <Link
              href="/admin/reports"
              className="px-4 py-2 rounded-full text-sm font-medium bg-white border border-blue-100 text-slate-600 hover:bg-[#f0f7ff]"
            >
              📊 รายงาน
            </Link>
            <Link
              href="/admin/consent"
              className="px-4 py-2 rounded-full text-sm font-medium bg-white border border-blue-100 text-slate-600 hover:bg-[#f0f7ff]"
            >
              🔐 บันทึกความยินยอม (PDPA)
            </Link>
            </>)}
          </div>

          {/* Members Tab */}
          {activeTab === 'members' && (
            <div>
              <div className="card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-bold text-slate-800">สมาชิกทั้งหมด</h2>
                  <span className="text-sm text-slate-500">
                    ทั้งหมด {members.length} รายการ · ใช้งาน {summary?.totalActiveMembers ?? totalActiveMembers} ราย
                    {summary?.sources ? ` · ทะเบียนหลัก ${summary.sources.postgres} · ข้อมูลเดิม ${summary.sources.legacy}` : ''}
                  </span>
                </div>

                {/* สวิตช์ต่ออายุอัตโนมัติทั้งระบบ */}
                <div className="mt-3 flex flex-wrap items-center gap-3 p-3 rounded-xl border border-blue-100 bg-[#f0f7ff]">
                  <span className="text-sm font-semibold text-slate-700">🔄 ต่ออายุอัตโนมัติ (ทั้งระบบ)</span>
                  <button
                    onClick={toggleGlobalAutoRenew}
                    disabled={globalBusy}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border ${
                      autoRenewGlobal
                        ? 'bg-emerald-500 border-emerald-500 text-white hover:bg-emerald-600'
                        : 'bg-white border-blue-200 text-slate-600 hover:bg-white/70'
                    } ${globalBusy ? 'opacity-50' : ''}`}
                  >
                    {globalBusy ? 'กำลังบันทึก...' : autoRenewGlobal ? 'เปิดอยู่ — กดเพื่อปิดทั้งระบบ' : 'ปิดอยู่ — กดเพื่อเปิดทั้งระบบ'}
                  </button>
                  <span className="text-[11px] text-slate-500">
                    ค่าเริ่มต้นของทั้งระบบ — มีผลกับสมาชิกที่ยังไม่ตั้งรายคน · สมาชิกที่ตั้งไว้เองจะใช้ค่าของตัวเอง (ปุ่มท้ายแถว) · บันทึกเป็น Audit Log ทุกครั้ง
                  </span>
                </div>

                {notice && (
                  <div className={`mt-3 px-3 py-2 rounded-xl text-sm border ${
                    notice.kind === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'
                  }`}>
                    {notice.kind === 'ok' ? '✅ ' : '⚠️ '}{notice.text}
                  </div>
                )}

                {/* ตัวกรองตามสถานะ */}
                <div className="mt-3 flex flex-wrap gap-2">
                  {([
                    ['all', 'ทั้งหมด', summary?.total],
                    ['pending', 'รออนุมัติ', summary?.pending],
                    ['approved', 'อนุมัติแล้ว', summary?.approved],
                    ['rejected', 'ไม่อนุมัติ', summary?.rejected],
                    ['deleted', 'ลบออกแล้ว', summary?.deleted],
                  ] as const).map(([key, label, n]) => (
                    <button
                      key={key}
                      onClick={() => setMemberFilter(key as any)}
                      className={`px-3 py-1 rounded-full text-xs font-medium border ${
                        memberFilter === key
                          ? 'bg-sky-400 border-sky-400 text-white'
                          : 'bg-white border-blue-100 text-slate-600 hover:bg-[#f0f7ff]'
                      }`}
                    >
                      {label}{typeof n === 'number' ? ` (${n})` : ''}
                    </button>
                  ))}
                </div>

                <div className="mt-4 space-y-3 max-h-[560px] overflow-y-auto">
                  {visibleMembers.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      {members.length === 0 ? 'ไม่พบข้อมูลสมาชิก' : 'ไม่มีสมาชิกในสถานะนี้ — กด “ทั้งหมด” เพื่อดูทุกสถานะ'}
                    </p>
                  ) : (
                    <table className="w-full text-xs border border-blue-100">
                      <thead className="bg-[#f0f7ff] text-slate-600 border-b border-blue-100">
                        <tr>
                          <th className="p-2 text-left">รหัสสมาชิก</th>
                          <th className="p-2 text-left">ชื่อ-นามสกุล</th>
                          <th className="p-2 text-left">ตำแหน่ง</th>
                          <th className="p-2 text-center">สถานะ</th>
                          <th className="p-2 text-center">ต่ออายุอัตโนมัติ</th>
                          <th className="p-2 text-center min-w-[300px]">การจัดการ (อนุมัติ · ลบ/คืนค่า)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleMembers.map((m: any) => {
                          const st = ({
                            pending: ['รออนุมัติ', 'bg-amber-50 text-amber-700 border-amber-200'],
                            approved: ['อนุมัติแล้ว', 'bg-emerald-50 text-emerald-700 border-emerald-200'],
                            rejected: ['ไม่อนุมัติ', 'bg-rose-50 text-rose-700 border-rose-200'],
                            deleted: ['ลบออกแล้ว (คืนค่าได้)', 'bg-slate-100 text-slate-500 border-slate-300'],
                          } as any)[m.adminStatus] || ['รออนุมัติ', 'bg-amber-50 text-amber-700 border-amber-200'];
                          const busy = busyId === m.id;
                          return (
                            <tr key={m.id} className={`border-b ${m.deleted ? 'opacity-60' : ''}`}>
                              <td className="p-2 font-medium font-mono">
                                {m.memberCode || '—'}
                                {m.legacy && <span className="ml-1 text-[10px] text-slate-400">(ข้อมูลเดิม)</span>}
                              </td>
                              <td className="p-2">
                                <div className="font-medium">{m.name || '—'}</div>
                                <div className="text-[11px] text-slate-400">{m.email || ''}</div>
                              </td>
                              <td className="p-2">{m.positionName || DEFAULT_POSITIONS.find((p: any) => p.id === m.positionId)?.name || m.positionId || '—'}</td>
                              <td className="p-2 text-center">
                                <span className={`px-2 py-0.5 rounded-full border text-[11px] ${st[1]}`}>{st[0]}</span>
                                <div className="text-[10px] text-slate-400 mt-1">{m.status}</div>
                              </td>
                              <td className="p-2 text-center">
                                <button
                                  onClick={() => memberAction(m, 'autoRenew', !(m.autoRenewSet ? m.autoRenewSelf : m.autoRenew))}
                                  disabled={busy}
                                  title={m.autoRenewSet ? 'ตั้งค่าไว้รายคน — กดเพื่อสลับ' : 'ยังไม่ตั้งรายคน ใช้ค่าสวิตช์ทั้งระบบ — กดเพื่อตั้งเฉพาะคนนี้'}
                                  className={`px-2 py-1 rounded-full text-[11px] border font-medium ${
                                    (m.autoRenewSet ? m.autoRenewSelf : m.autoRenew)
                                      ? 'bg-emerald-500 border-emerald-500 text-white hover:bg-emerald-600'
                                      : 'bg-white border-blue-200 text-slate-500 hover:bg-[#f0f7ff]'
                                  } ${busy ? 'opacity-40' : ''}`}
                                >
                                  {(m.autoRenewSet ? m.autoRenewSelf : m.autoRenew) ? '🔄 เปิด' : '⭕ ปิด'}
                                </button>
                                <div className={`text-[10px] mt-1 ${m.autoRenewSet ? 'text-slate-400' : 'text-sky-600'}`}>
                                  {m.autoRenewSet ? 'ตั้งรายคน' : `ตามค่าทั้งระบบ (${autoRenewGlobal ? 'เปิด' : 'ปิด'})`}
                                </div>
                              </td>
                              <td className="p-2">
                                <div className="flex flex-wrap gap-1 justify-center">
                                  <button
                                    onClick={() => memberAction(m, 'approve')}
                                    disabled={busy || (m.adminStatus === 'approved' && !m.deleted)}
                                    className={`px-2 py-1 rounded-full text-[11px] font-medium text-white bg-emerald-500 hover:bg-emerald-600 ${busy || (m.adminStatus === 'approved' && !m.deleted) ? 'opacity-40 cursor-not-allowed' : ''}`}
                                  >
                                    ✅ อนุมัติ
                                  </button>
                                  <button
                                    onClick={() => memberAction(m, 'reject')}
                                    disabled={busy || m.adminStatus === 'rejected'}
                                    className={`px-2 py-1 rounded-full text-[11px] font-medium text-white bg-amber-500 hover:bg-amber-600 ${busy || m.adminStatus === 'rejected' ? 'opacity-40 cursor-not-allowed' : ''}`}
                                  >
                                    ⛔ ไม่อนุมัติ
                                  </button>
                                  {m.deleted ? (
                                    <button
                                      onClick={() => memberAction(m, 'restore')}
                                      disabled={busy}
                                      className={`px-2 py-1 rounded-full text-[11px] font-medium text-white bg-sky-500 hover:bg-sky-600 ${busy ? 'opacity-40 cursor-not-allowed' : ''}`}
                                    >
                                      ♻️ คืนค่า
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => memberAction(m, 'delete')}
                                      disabled={busy || m.legacy}
                                      className={`px-2 py-1 rounded-full text-[11px] font-medium text-white bg-rose-600 hover:bg-rose-700 ${busy || m.legacy ? 'opacity-40 cursor-not-allowed' : ''}`}
                                      title={m.legacy ? 'ข้อมูลเดิมใน Firestore — ลบ/คืนค่าได้เฉพาะสมาชิกในทะเบียนหลัก' : ''}
                                    >
                                      🗑️ ลบออก
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
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