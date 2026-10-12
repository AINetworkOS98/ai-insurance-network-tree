'use client';
import { useCallback, useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';

type Member = {
  id: string;
  memberId?: string;
  memberCode?: string | null;
  name?: string;
  email?: string | null;
  phone?: string | null;
  province?: string | null;
  status?: string;
  branch?: string;
  region?: string;
  positionName?: string | null;
  rankName?: string;
  rankLevel?: number;
  createdAt?: string | null;
  joinDate?: string | null;
  deleted?: boolean;
};

const STATUS_COLOR: Record<string,string> = {
  ACTIVE:'bg-emerald-100 text-emerald-800 border-emerald-200',
  PENDING:'bg-amber-100 text-amber-800 border-amber-200',
  SUSPENDED:'bg-rose-100 text-rose-700 border-rose-200',
  INACTIVE:'bg-slate-100 text-slate-600 border-slate-200',
  RESIGNED:'bg-slate-800 text-white border-slate-700',
};

/**
 * สมาชิกของฉัน (/members)
 * • ปุ่ม 🗑 ลบสมาชิก ต่อแถว — ยิง POST /api/admin/members (action:'delete', confirm:'DELETE')
 *   เครื่องยนต์เดียวกับหน้า /admin → Audit Log + ประวัติสถานะทุกครั้ง, ลบแบบซ่อนจากทะเบียน (RESIGNED) และกด ↩ คืนค่าได้
 * • ลบต้องยืนยันในกล่องข้อความก่อนเสมอ · หลังทำรายการโหลดรายชื่อใหม่เอง + แจ้งหน้าอื่นผ่าน event 'members-updated'
 * • ผู้ใช้ที่ไม่มีสิทธิ์ผู้ดูแล เห็นตารางอ่านอย่างเดียว (ไม่มีปุ่มจัดการ) ไม่ error
 */
export default function MembersPage(){
  const [members, setMembers]=useState<Member[]>([]);
  const [loading, setLoading]=useState(true);
  const [canManage, setCanManage]=useState(false);
  const [q, setQ]=useState('');
  const [filter, setFilter]=useState('all');
  const [busyId, setBusyId]=useState<string|null>(null);
  const [msg, setMsg]=useState<string|null>(null);
  const [errMsg, setErrMsg]=useState<string|null>(null);
  const [lastAt, setLastAt]=useState<Date|null>(null);

  const load = useCallback(async ()=>{
    setLoading(true);
    setErrMsg(null);
    try{
      // ทะเบียนจริง + สิทธิ์จัดการ (ผู้ดูแล) — ตัวเดียวกับหน้า /admin
      const r = await fetch('/api/admin/members',{credentials:'include',cache:'no-store'});
      if(r.ok){
        const j = await r.json().catch(()=>({}));
        if(j?.ok){
          setMembers((j.members||[]) as Member[]);
          setCanManage(true);
          setLastAt(new Date());
          return;
        }
      }
      // สมาชิกทั่วไป — อ่านอย่างเดียว (ไม่มีปุ่มจัดการ)
      const r2 = await fetch('/api/members',{credentials:'include',cache:'no-store'});
      const j2 = await r2.json().catch(()=>({}));
      setMembers((j2?.members||[]) as Member[]);
      setCanManage(false);
      setLastAt(new Date());
    }catch(e:any){
      setMembers([]);
      setErrMsg(e?.message || 'เชื่อมต่อไม่สำเร็จ');
    }finally{ setLoading(false); }
  },[]);

  useEffect(()=>{ load(); },[load]);

  // อัปเดตรายชื่อเองทุก 30 วินาที — สถานะไม่ค้าง
  useEffect(()=>{
    const t=setInterval(()=>{ load(); },30*1000);
    return ()=>clearInterval(t);
  },[load]);

  async function removeMember(m:Member){
    const code = m.memberCode || m.memberId || m.id;
    const who = m.name || code;
    const ok = window.confirm(
      `ยืนยันลบสมาชิกออกจากระบบ?\n\n${code} · ${who}\n\n` +
      'สมาชิกคนนี้จะถูกซ่อนออกจากทะเบียนที่ใช้งาน (สถานะ RESIGNED) และไม่ถูกนับในเครือข่าย — กด ↩ คืนค่าได้ทุกเมื่อ',
    );
    if(!ok) return;
    setBusyId(m.id);
    setMsg(null); setErrMsg(null);
    try{
      const r = await fetch('/api/admin/members',{
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ id:m.id, action:'delete', confirm:'DELETE' }),
      });
      const d = await r.json().catch(()=>({}));
      if(!d?.ok) setErrMsg(d?.error || 'ลบสมาชิกไม่สำเร็จ');
      else{
        setMsg(`🗑 ลบ ${who} ออกจากระบบแล้ว (ซ่อนจากทะเบียน · กด ↩ คืนค่าได้)`);
        await load();
        try{ window.dispatchEvent(new Event('members-updated')); }catch{}
      }
    }catch(e:any){ setErrMsg(e?.message || 'เชื่อมต่อไม่สำเร็จ'); }
    finally{ setBusyId(null); }
  }

  async function restoreMember(m:Member){
    const who = m.name || m.memberCode || m.memberId || m.id;
    setBusyId(m.id);
    setMsg(null); setErrMsg(null);
    try{
      const r = await fetch('/api/admin/members',{
        method:'POST', credentials:'include',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ id:m.id, action:'restore' }),
      });
      const d = await r.json().catch(()=>({}));
      if(!d?.ok) setErrMsg(d?.error || 'คืนค่าสมาชิกไม่สำเร็จ');
      else{
        setMsg(`↩ คืนค่า ${who} เข้าระบบแล้ว`);
        await load();
        try{ window.dispatchEvent(new Event('members-updated')); }catch{}
      }
    }catch(e:any){ setErrMsg(e?.message || 'เชื่อมต่อไม่สำเร็จ'); }
    finally{ setBusyId(null); }
  }

  const codeOf = (m:Member)=> m.memberCode || m.memberId || m.id;
  const isDeleted = (m:Member)=> String(m.status||'').toUpperCase()==='RESIGNED';
  const kept = members.filter(m=>!isDeleted(m)).length;
  const deletedCount = members.filter(isDeleted).length;

  const filtered = members.filter(m=>{
    if(filter==='RESIGNED'){ if(!isDeleted(m)) return false; }
    else{
      if(isDeleted(m)) return false;            // แถวที่ลบแล้วซ่อนจากมุมมองปกติ
      if(filter!=='all' && m.status!==filter) return false;
    }
    const hay = `${codeOf(m)} ${m.name||''} ${m.email||''} ${m.province||''}`.toLowerCase();
    if(q && !hay.includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <Header/>
      <div className="flex w-full">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold text-[#475569]">สมาชิกของฉัน ◉</h1>
            <span className="badge-demo">ทีมของฉัน</span>
            <span className="text-xs text-slate-500 hidden md:inline">ดูสมาชิกในสายงานตามสิทธิ์ • Own / Team / All</span>
            <Link href="/tree" className="ml-auto px-4 py-2 rounded-full bg-[#475569] text-white text-sm">ดูผังเครือข่าย</Link>
            <button onClick={load} className="px-4 py-2 rounded-full border bg-white text-sm">รีเฟรช</button>
          </div>

          <div className="grid md:grid-cols-4 gap-3 text-sm">
            <div className="card p-4"><div className="text-xs text-slate-500">สมาชิกทั้งหมด</div><div className="text-2xl font-bold text-[#475569]">{kept}</div><div className="text-[11px] text-slate-500">ในขอบเขตที่มองเห็นได้ {deletedCount>0?`• ลบแล้ว ${deletedCount}`:''}</div></div>
            <div className="card p-4"><div className="text-xs text-slate-500">Active</div><div className="text-2xl font-bold text-emerald-600">{members.filter(m=>m.status==='ACTIVE').length}</div></div>
            <div className="card p-4"><div className="text-xs text-slate-500">Pending</div><div className="text-2xl font-bold text-amber-600">{members.filter(m=>m.status==='PENDING').length}</div></div>
            <div className="card p-4"><div className="text-xs text-slate-500">อื่นๆ</div><div className="text-2xl font-bold text-slate-600">{members.filter(m=>!['ACTIVE','PENDING','RESIGNED'].includes(String(m.status))).length}</div></div>
          </div>

          <div className="card p-4">
            <div className="flex flex-wrap gap-2 text-sm mb-3">
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="ค้นหา Member ID / ชื่อ / อีเมล / จังหวัด" className="flex-1 min-w-[240px] border rounded-xl px-3 py-2" />
              <select value={filter} onChange={e=>setFilter(e.target.value)} className="border rounded-xl px-3 py-2">
                <option value="all">ทุกสถานะ</option><option value="ACTIVE">Active</option><option value="PENDING">Pending</option><option value="SUSPENDED">Suspended</option><option value="INACTIVE">Inactive</option><option value="RESIGNED">ลบแล้ว (คืนค่าได้)</option>
              </select>
              <span className="text-xs text-slate-500 self-center">{loading?'กำลังโหลด...':`${filtered.length} รายการ`}</span>
            </div>

            {msg && <div className="mb-3 text-xs px-3 py-2 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200">{msg}</div>}
            {errMsg && <div className="mb-3 text-xs px-3 py-2 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">{errMsg}</div>}

            {loading ? <div className="text-sm text-slate-500 py-8 text-center">กำลังโหลดสมาชิก...</div>
            : filtered.length===0 ? <div className="text-sm text-slate-500 py-8 text-center border rounded-xl bg-slate-50">ไม่พบสมาชิกที่ค้นหา</div>
            : (
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#475569] text-white">
                    <tr>
                      <th className="text-left p-2.5">Member ID</th>
                      <th className="text-left p-2.5">ชื่อ</th>
                      <th className="text-left p-2.5">จังหวัด</th>
                      <th className="text-left p-2.5 hidden md:table-cell">ตำแหน่ง</th>
                      <th className="p-2.5">สถานะ</th>
                      <th className="text-left p-2.5 hidden md:table-cell">อีเมล</th>
                      {canManage && <th className="p-2.5">จัดการ</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map(m=>{
                      const rowBusy = busyId===m.id;
                      const gone = isDeleted(m);
                      return (
                        <tr key={m.id} className={`hover:bg-slate-50 ${gone?'opacity-70':''}`}>
                          <td className="p-2.5 font-mono font-semibold text-[#475569]">{codeOf(m)}</td>
                          <td className="p-2.5">{m.name || '-'}</td>
                          <td className="p-2.5">{m.province || '-'}</td>
                          <td className="p-2.5 hidden md:table-cell">{m.positionName || m.rankName || m.branch || '-'}</td>
                          <td className="p-2.5"><span className={`px-2 py-1 rounded-full border text-[11px] font-medium ${STATUS_COLOR[String(m.status)]||'bg-slate-100'}`}>{m.status || 'PENDING'}</span></td>
                          <td className="p-2.5 hidden md:table-cell font-mono text-[11px]">{m.email || '-'}</td>
                          {canManage && (
                            <td className="p-2.5 text-center">
                              {!gone ? (
                                <button
                                  type="button"
                                  disabled={rowBusy}
                                  onClick={()=>removeMember(m)}
                                  title="ลบสมาชิกออกจากระบบ (ซ่อนจากทะเบียน · คืนค่าได้)"
                                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${rowBusy ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-rose-300 bg-rose-50 text-rose-700 hover:bg-rose-100'}`}
                                >
                                  🗑 ลบสมาชิก
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={rowBusy}
                                  onClick={()=>restoreMember(m)}
                                  title="คืนค่าสมาชิกกลับเข้าระบบ"
                                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border ${rowBusy ? 'border-slate-200 bg-slate-50 text-slate-400' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                                >
                                  ↩ คืนค่า
                                </button>
                              )}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="text-[11px] text-slate-500 mt-3 flex items-center gap-2 flex-wrap">
              <span suppressHydrationWarning>อัปเดตรายชื่ออัตโนมัติทุก 30 วินาที • ข้อมูลจากทะเบียนสมาชิกกลาง</span>
              {lastAt && <span suppressHydrationWarning>• ดึงล่าสุด {lastAt.toLocaleTimeString('th-TH')} น.</span>}
              <span>• สมาชิกที่ไม่ได้อยู่ในขอบเขตสิทธิ์จะไม่แสดง (Deny by Default)</span>
              {canManage && <span>• การลบ/คืนค่าถูกบันทึก Audit Log ทุกครั้ง</span>}
            </div>
          </div>

          <div className="flex gap-2 text-sm">
            <Link href="/prospects" className="px-4 py-2 rounded-full border bg-white">สมาชิกทั่วไป</Link>
            <Link href="/appointments" className="px-4 py-2 rounded-full border bg-white">นัดหมาย</Link>
            <Link href="/income" className="px-4 py-2 rounded-full border bg-white">รายได้</Link>
          </div>
        </main>
      </div>
    </div>
  );
}
