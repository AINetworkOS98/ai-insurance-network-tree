'use client';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

// หน้า "สมาชิกทั่วไป" (เดิมชื่อ "ผู้สนใจ") — ฐานเดียวกับระบบสมาชิก (/api/members)
// นิยาม: สมาชิกทั่วไป = ผู้ที่ยังอยู่ระดับตำแหน่ง 0 (ยังไม่เลื่อนเป็นตัวแทน)
// เมื่อเลื่อนเป็นตัวแทน (ระดับ 1) แล้ว รายชื่อจะไปอยู่หน้าตัวแทน/ชุมชนงานแทน
type Member = {
  id: string; memberCode?: string; name?: string; status?: string;
  rankLevel?: number; rankName?: string; province?: string;
  email?: string; phone?: string; joinDate?: string; referralCode?: string;
  /** จาก /api/admin/members — สถานะฝ่ายจัดการ + ธงลบแบบซ่อน (soft delete) */
  adminStatus?: string; deleted?: boolean; deletedAt?: string | null;
};

const STATUS_TH: Record<string, string> = {
  PENDING: 'รออนุมัติ', ACTIVE: 'ใช้งานอยู่', SUSPENDED: 'ระงับ', RESIGNED: 'ลาออก', INACTIVE: 'ไม่ใช้งาน',
};

export default function GeneralMembersPage(){
  const [members, setMembers]=useState<Member[]>([]);
  const [q, setQ]=useState('');
  const [statusQ, setStatusQ]=useState('');
  const [onlyGeneral, setOnlyGeneral]=useState(true); // ค่าเริ่มต้น = เฉพาะสมาชิกทั่วไป (ระดับ 0)
  const [loading, setLoading]=useState(true);
  const [err, setErr]=useState('');
  // ── สิทธิ์ผู้ดูแล + สถานะการทำรายการ (ลบ/คืนค่า) ──
  const [canManage, setCanManage]=useState(false);
  const [showDeleted, setShowDeleted]=useState(false);
  const [busyId, setBusyId]=useState<string|null>(null);
  const [msg, setMsg]=useState('');

  async function load(){
    setLoading(true); setErr(''); setMsg('');
    try{
      // 1) ลองเส้นทางผู้ดูแลก่อน — ทะเบียนเต็ม + สิทธิ์ลบ (ตัวเดียวกับหน้า /admin และ /members)
      const ra = await fetch('/api/admin/members', { credentials:'include', cache:'no-store' });
      if(ra.ok){
        const ja = await ra.json().catch(()=>({}));
        if(ja?.ok && Array.isArray(ja.members)){
          setMembers(ja.members as Member[]);
          setCanManage(true);
          return;
        }
      }
      // 2) ผู้ใช้ทั่วไป — อ่านอย่างเดียว (ไม่มีปุ่มจัดการ) ไม่ error
      const r = await fetch('/api/members', { cache:'no-store' });
      const j = await r.json();
      if(!j?.ok) throw new Error(j?.error || 'โหลดข้อมูลไม่สำเร็จ');
      setMembers(Array.isArray(j.members) ? j.members : []);
      setCanManage(false);
    }catch(e:any){
      setErr(e?.message || 'โหลดข้อมูลไม่สำเร็จ');
      setMembers([]);
    }finally{ setLoading(false); }
  }
  useEffect(()=>{ load(); },[]);

  // ── ลบสมาชิกออกจากระบบ (ผู้ดูแลเท่านั้น) — soft delete ผ่านเครื่องยนต์เดียวกับ /admin ──
  //    ต้องยืนยันในกล่องข้อความ + ส่ง confirm:'DELETE' ตามที่ API บังคับ · กด ↩ คืนค่าได้ทุกเมื่อ
  async function removeMember(m:Member){
    if(!canManage) return;
    const code = m.memberCode || m.id;
    const who = m.name || code;
    const ok = window.confirm(
      'ยืนยันลบสมาชิกออกจากระบบ?\n\n' + `${code} · ${who}\n\n` +
      'สมาชิกคนนี้จะถูกซ่อนออกจากทะเบียนที่ใช้งาน (สถานะ RESIGNED) ไม่ถูกนับในเครือข่าย — กด ↩ คืนค่าได้ทุกเมื่อ',
    );
    if(!ok) return;
    setBusyId(m.id); setMsg(''); setErr('');
    try{
      const r = await fetch('/api/admin/members',{
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ id:m.id, action:'delete', confirm:'DELETE' }),
      });
      const d = await r.json().catch(()=>({}));
      if(!d?.ok) setErr(d?.error || 'ลบสมาชิกไม่สำเร็จ');
      else{
        setMsg(`🗑 ลบ ${who} ออกจากระบบแล้ว (ซ่อนจากทะเบียน · กด ↩ คืนค่าได้)`);
        await load();
        try{ window.dispatchEvent(new Event('members-updated')); }catch{}
      }
    }catch(e:any){ setErr(e?.message || 'เชื่อมต่อไม่สำเร็จ'); }
    finally{ setBusyId(null); }
  }

  /** คืนค่าสมาชิกที่ลบไปแล้ว (ผู้ดูแลเท่านั้น) */
  async function restoreMember(m:Member){
    if(!canManage) return;
    const who = m.name || m.memberCode || m.id;
    setBusyId(m.id); setMsg(''); setErr('');
    try{
      const r = await fetch('/api/admin/members',{
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ id:m.id, action:'restore' }),
      });
      const d = await r.json().catch(()=>({}));
      if(!d?.ok) setErr(d?.error || 'คืนค่าสมาชิกไม่สำเร็จ');
      else{
        setMsg(`↩ คืนค่า ${who} เข้าระบบแล้ว`);
        await load();
        try{ window.dispatchEvent(new Event('members-updated')); }catch{}
      }
    }catch(e:any){ setErr(e?.message || 'เชื่อมต่อไม่สำเร็จ'); }
    finally{ setBusyId(null); }
  }

  const isDeleted = (m:Member)=> m.deleted === true || String(m.status||'').toUpperCase()==='RESIGNED';

  // สมาชิกทั่วไป = ระดับ 0 (สลับดูทั้งหมดได้)
  const base = useMemo(
    ()=> (onlyGeneral ? members.filter(m=> (m.rankLevel ?? 0) === 0) : members)
          .filter(m=> showDeleted ? true : !(m.deleted === true || String(m.status||'').toUpperCase()==='RESIGNED')),
    [members, onlyGeneral, showDeleted]
  );
  /** จำนวนรายการที่ลบไปแล้ว (ในขอบเขตระดับ 0 ถ้าเปิดตัวกรองนั้นอยู่) */
  const deletedCount = useMemo(()=>{
    const scope = onlyGeneral ? members.filter(m=> (m.rankLevel ?? 0) === 0) : members;
    return scope.filter(m=> m.deleted === true || String(m.status||'').toUpperCase()==='RESIGNED').length;
  }, [members, onlyGeneral]);

  const filtered = useMemo(()=> base.filter(m=>{
    if(statusQ && String(m.status||'').toUpperCase() !== statusQ) return false;
    if(q){
      const s = q.trim().toLowerCase();
      const hay = `${m.name||''} ${m.memberCode||''} ${m.email||''} ${m.phone||''} ${m.province||''}`.toLowerCase();
      if(!hay.includes(s)) return false;
    }
    return true;
  }), [base, q, statusQ]);

  const count = (st:string)=> base.filter(m=> String(m.status||'').toUpperCase() === st).length;
  const provinces = useMemo(()=> new Set(base.map(m=> m.province).filter(Boolean)).size, [base]);

  return (
    <div>
      <Header/>
      <div className="flex w-full">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-6">
          {/* หัวหน้า */}
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-[#475569]">สมาชิกทั่วไป</h1>
            <span className="text-xs px-2 py-1 rounded-full border bg-white text-slate-500">
              ระดับ 0 · ยังไม่เป็นตัวแทน
            </span>
            <span className="text-xs px-2 py-1 rounded-full border bg-white text-slate-500">
              ข้อมูลจริงจากฐานสมาชิก — ไม่มีข้อมูลตัวอย่าง
            </span>
            {/* ผู้ใช้ที่ล็อกอินเป็นผู้ดูแลเท่านั้นที่เห็นป้ายนี้ + คอลัมน์จัดการ (ลบ/คืนค่า) */}
            {canManage && (
              <span className="text-xs px-2 py-1 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 font-semibold">
                🔐 โหมดผู้ดูแล — ลบสมาชิกได้
              </span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button onClick={load} className="px-4 py-2 rounded-full border bg-white text-sm">{loading?'กำลังโหลด...':'↻ รีเฟรช'}</button>
              <Link href="/register" className="px-4 py-2 rounded-full bg-[#475569] text-white text-sm">+ เพิ่มสมาชิก</Link>
            </div>
          </div>

          {/* สรุป */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card p-4">
              <div className="text-xs text-slate-500">สมาชิกทั่วไปทั้งหมด</div>
              <div className="text-2xl font-bold text-[#475569]">{base.length}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-slate-500">ใช้งานอยู่</div>
              <div className="text-2xl font-bold text-emerald-600">{count('ACTIVE')}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-slate-500">รออนุมัติ</div>
              <div className="text-2xl font-bold text-amber-600">{count('PENDING')}</div>
            </div>
            <div className="card p-4">
              <div className="text-xs text-slate-500">จังหวัดที่ครอบคลุม</div>
              <div className="text-2xl font-bold text-sky-700">{provinces}</div>
            </div>
          </div>

          {/* ค้นหา/กรอง */}
          <div className="card p-4">
            <div className="flex gap-2 text-sm mb-3 flex-wrap">
              <input
                placeholder="ค้นหา ชื่อ / รหัสสมาชิก / อีเมล / เบอร์ / จังหวัด"
                value={q} onChange={e=> setQ(e.target.value)}
                className="flex-1 min-w-[200px] border rounded-xl px-3 py-2"
              />
              <select value={statusQ} onChange={e=> setStatusQ(e.target.value)} className="border rounded-xl px-3 py-2 text-sm">
                <option value="">ทุกสถานะ</option>
                <option value="PENDING">รออนุมัติ</option>
                <option value="ACTIVE">ใช้งานอยู่</option>
                <option value="SUSPENDED">ระงับ</option>
                <option value="RESIGNED">ลาออก</option>
                <option value="INACTIVE">ไม่ใช้งาน</option>
              </select>
              <label className="flex items-center gap-2 px-3 py-2 rounded-xl border bg-white text-xs text-slate-600">
                <input type="checkbox" checked={onlyGeneral} onChange={e=> setOnlyGeneral(e.target.checked)} />
                เฉพาะระดับ 0 (สมาชิกทั่วไป)
              </label>
              {canManage && deletedCount > 0 && (
                <label className="flex items-center gap-2 px-3 py-2 rounded-xl border bg-white text-xs text-slate-600">
                  <input type="checkbox" checked={showDeleted} onChange={e=> setShowDeleted(e.target.checked)} />
                  แสดงรายการที่ลบแล้ว ({deletedCount})
                </label>
              )}
              <button onClick={()=>{ setQ(''); setStatusQ(''); }} className="px-4 py-2 rounded-xl border bg-white text-sm">ล้างตัวกรอง</button>
            </div>

            <div className="text-xs text-slate-500 mb-3">
              สมาชิกทั่วไปคือผู้ที่สมัครแล้วยังอยู่<b>ระดับ 0</b> — ลงทะเบียนผ่านหน้าสมัคร/ระบบสมาชิกฐานเดียวกัน
              เมื่อผ่านการอนุมัติและเลื่อนเป็นตัวแทน (ระดับ 1) รายชื่อจะย้ายไป <Link href="/members" className="text-sky-700 underline">สมาชิกของฉัน</Link>
            </div>

            {msg && <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 mb-3">{msg}</div>}
            {err && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 mb-3">{err}</div>}

            {loading ? (
              <div className="p-6 text-center text-sm text-slate-400">กำลังโหลดข้อมูลสมาชิก...</div>
            ) : filtered.length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500 border rounded-xl bg-slate-50">
                {base.length === 0
                  ? 'ยังไม่มีสมาชิกทั่วไปในฐานข้อมูล — จะแสดงเมื่อมีผู้สมัครจริง'
                  : 'ไม่พบรายการที่ตรงกับตัวกรอง'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-slate-500 border-b">
                      <th className="py-2 pr-3">รหัสสมาชิก</th>
                      <th className="py-2 pr-3">ชื่อ</th>
                      <th className="py-2 pr-3">จังหวัด</th>
                      <th className="py-2 pr-3">ติดต่อ</th>
                      <th className="py-2 pr-3">สถานะ</th>
                      <th className="py-2 pr-3">ระดับ</th>
                      <th className="py-2 pr-3">สมัครเมื่อ</th>
                      {canManage && <th className="py-2 pr-3 text-right">จัดการ</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0,100).map(m=>(
                      <tr key={m.id} className={`border-b last:border-0 ${isDeleted(m) ? 'bg-rose-50/50' : 'hover:bg-[#FFFBF5]'}`}>
                        <td className="py-2 pr-3 font-mono text-xs text-slate-600">{m.memberCode || '—'}</td>
                        <td className="py-2 pr-3 font-medium text-[#475569]">{m.name || '—'}</td>
                        <td className="py-2 pr-3 text-slate-600">{m.province || '—'}</td>
                        <td className="py-2 pr-3 text-xs text-slate-500">
                          {m.phone && <span className="block">{m.phone}</span>}
                          {m.email && <span className="block truncate max-w-[180px]">{m.email}</span>}
                          {!m.phone && !m.email && '—'}
                        </td>
                        <td className="py-2 pr-3">
                          <span className={`px-2 py-0.5 rounded-full text-[11px] border ${
                            isDeleted(m) ? 'bg-rose-50 text-rose-700 border-rose-200'
                            : String(m.status).toUpperCase()==='ACTIVE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : String(m.status).toUpperCase()==='PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                            {isDeleted(m) ? 'ลบออกแล้ว' : (STATUS_TH[String(m.status||'').toUpperCase()] || m.status || '—')}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-xs text-slate-600">{m.rankLevel ?? 0} · {m.rankName || 'สมาชิกทั่วไป'}</td>
                        <td className="py-2 pr-3 text-xs text-slate-500">
                          {m.joinDate ? new Date(m.joinDate).toLocaleDateString('th-TH', { year:'numeric', month:'short', day:'numeric' }) : '—'}
                        </td>
                        {canManage && (
                          <td className="py-2 pr-3 text-right whitespace-nowrap">
                            {isDeleted(m) ? (
                              <button
                                onClick={()=>restoreMember(m)}
                                disabled={busyId===m.id}
                                title="คืนค่าสมาชิกที่ลบแล้วเข้าระบบ"
                                className="px-3 py-1.5 rounded-full border border-emerald-200 bg-emerald-50 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-40"
                              >
                                {busyId===m.id ? '…' : '↩ คืนค่า'}
                              </button>
                            ) : (
                              <button
                                onClick={()=>removeMember(m)}
                                disabled={busyId===m.id}
                                title="ลบสมาชิกออกจากระบบ (ผู้ดูแลเท่านั้น)"
                                className="px-3 py-1.5 rounded-full border border-rose-200 bg-rose-50 text-[11px] font-semibold text-rose-700 hover:bg-rose-100 disabled:opacity-40"
                              >
                                {busyId===m.id ? 'กำลังลบ…' : '🗑 ลบสมาชิก'}
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length > 100 && <div className="text-[11px] text-slate-400 pt-2">แสดง 100 รายการแรกจาก {filtered.length} รายการ</div>}
                {canManage && (
                  <div className="text-[11px] text-slate-500 pt-3 leading-5">
                    🔐 ปุ่ม <b>🗑 ลบสมาชิก</b> เห็นเฉพาะบัญชีผู้ดูแลระบบ — กดแล้วต้องยืนยันก่อนทุกครั้ง ·
                    ลบแบบซ่อนออกจากทะเบียนที่ใช้งาน (สถานะ RESIGNED) แต่ข้อมูลและประวัติยังอยู่ครบ กด <b>↩ คืนค่า</b> กลับเข้าระบบได้ทุกเมื่อ ·
                    ทุกครั้งที่ลบ/คืนค่าจะถูกบันทึกใน Audit Log (เครื่องยนต์เดียวกับหน้า /admin และ /members)
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ทางไปต่อ */}
          <div className="grid md:grid-cols-3 gap-4">
            <div className="card p-4">
              <div className="text-sm font-semibold">สมัครสมาชิกใหม่</div>
              <div className="text-xs text-slate-500 mt-1">เพิ่มสมาชิกทั่วไปเข้าฐานเดียวกัน</div>
              <Link href="/register" className="inline-block mt-2 text-xs text-sky-700 underline">ไปหน้าสมัคร →</Link>
            </div>
            <div className="card p-4">
              <div className="text-sm font-semibold">ตรวจสอบสมาชิก</div>
              <div className="text-xs text-slate-500 mt-1">ค้นสถานะ/จังหวัด/รหัสของสมาชิกในระบบ</div>
              <Link href="/verify" className="inline-block mt-2 text-xs text-sky-700 underline">ไปหน้าตรวจสอบ →</Link>
            </div>
            <div className="card p-4">
              <div className="text-sm font-semibold">สมาชิกของฉัน</div>
              <div className="text-xs text-slate-500 mt-1">รายชื่อที่เลื่อนเป็นตัวแทนแล้วและทีมของคุณ</div>
              <Link href="/members" className="inline-block mt-2 text-xs text-sky-700 underline">ไปหน้าสมาชิกของฉัน →</Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
