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

  async function load(){
    setLoading(true); setErr('');
    try{
      const r = await fetch('/api/members', { cache:'no-store' });
      const j = await r.json();
      if(!j?.ok) throw new Error(j?.error || 'โหลดข้อมูลไม่สำเร็จ');
      setMembers(Array.isArray(j.members) ? j.members : []);
    }catch(e:any){
      setErr(e?.message || 'โหลดข้อมูลไม่สำเร็จ');
      setMembers([]);
    }finally{ setLoading(false); }
  }
  useEffect(()=>{ load(); },[]);

  // สมาชิกทั่วไป = ระดับ 0 (สลับดูทั้งหมดได้)
  const base = useMemo(
    ()=> onlyGeneral ? members.filter(m=> (m.rankLevel ?? 0) === 0) : members,
    [members, onlyGeneral]
  );

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
              <button onClick={()=>{ setQ(''); setStatusQ(''); }} className="px-4 py-2 rounded-xl border bg-white text-sm">ล้างตัวกรอง</button>
            </div>

            <div className="text-xs text-slate-500 mb-3">
              สมาชิกทั่วไปคือผู้ที่สมัครแล้วยังอยู่<b>ระดับ 0</b> — ลงทะเบียนผ่านหน้าสมัคร/ระบบสมาชิกฐานเดียวกัน
              เมื่อผ่านการอนุมัติและเลื่อนเป็นตัวแทน (ระดับ 1) รายชื่อจะย้ายไป <Link href="/members" className="text-sky-700 underline">สมาชิกของฉัน</Link>
            </div>

            {err && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 mb-3">โหลดข้อมูลไม่สำเร็จ: {err}</div>}

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
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0,100).map(m=>(
                      <tr key={m.id} className="border-b last:border-0 hover:bg-[#FFFBF5]">
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
                            String(m.status).toUpperCase()==='ACTIVE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : String(m.status).toUpperCase()==='PENDING' ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-slate-50 text-slate-600 border-slate-200'}`}>
                            {STATUS_TH[String(m.status||'').toUpperCase()] || m.status || '—'}
                          </span>
                        </td>
                        <td className="py-2 pr-3 text-xs text-slate-600">{m.rankLevel ?? 0} · {m.rankName || 'สมาชิกทั่วไป'}</td>
                        <td className="py-2 pr-3 text-xs text-slate-500">
                          {m.joinDate ? new Date(m.joinDate).toLocaleDateString('th-TH', { year:'numeric', month:'short', day:'numeric' }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {filtered.length > 100 && <div className="text-[11px] text-slate-400 pt-2">แสดง 100 รายการแรกจาก {filtered.length} รายการ</div>}
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
