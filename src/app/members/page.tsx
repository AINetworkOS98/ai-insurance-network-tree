'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';

type Member = {
  memberId: string;
  name: string;
  email: string;
  province: string;
  status: string;
  branch: string;
  region: string;
  createdAt: string;
};

const STATUS_COLOR: Record<string,string> = {
  ACTIVE:'bg-emerald-100 text-emerald-800 border-emerald-200',
  PENDING:'bg-amber-100 text-amber-800 border-amber-200',
  SUSPENDED:'bg-rose-100 text-rose-700 border-rose-200',
  INACTIVE:'bg-slate-100 text-slate-600 border-slate-200',
  RESIGNED:'bg-slate-800 text-white border-slate-700',
};

export default function MembersPage(){
  const [members, setMembers]=useState<Member[]>([]);
  const [loading, setLoading]=useState(true);
  const [q, setQ]=useState('');
  const [filter, setFilter]=useState('all');

  async function load(){
    setLoading(true);
    try{
      const r=await fetch('/api/members',{cache:'no-store'});
      const j=await r.json();
      setMembers(j.members||[]);
    }catch{ setMembers([]); }
    finally{ setLoading(false); }
  }
  useEffect(()=>{ load(); },[]);

  const filtered = members.filter(m=>{
    if(filter!=='all' && m.status!==filter) return false;
    if(q && !`${m.memberId} ${m.name} ${m.email} ${m.province}`.toLowerCase().includes(q.toLowerCase())) return false;
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
            <div className="card p-4"><div className="text-xs text-slate-500">สมาชิกทั้งหมด</div><div className="text-2xl font-bold text-[#475569]">{members.length}</div><div className="text-[11px] text-slate-500">ในขอบเขตที่มองเห็นได้</div></div>
            <div className="card p-4"><div className="text-xs text-slate-500">Active</div><div className="text-2xl font-bold text-emerald-600">{members.filter(m=>m.status==='ACTIVE').length}</div></div>
            <div className="card p-4"><div className="text-xs text-slate-500">Pending</div><div className="text-2xl font-bold text-amber-600">{members.filter(m=>m.status==='PENDING').length}</div></div>
            <div className="card p-4"><div className="text-xs text-slate-500">อื่นๆ</div><div className="text-2xl font-bold text-slate-600">{members.filter(m=>!['ACTIVE','PENDING'].includes(m.status)).length}</div></div>
          </div>

          <div className="card p-4">
            <div className="flex flex-wrap gap-2 text-sm mb-3">
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="ค้นหา Member ID / ชื่อ / อีเมล / จังหวัด" className="flex-1 min-w-[240px] border rounded-xl px-3 py-2" />
              <select value={filter} onChange={e=>setFilter(e.target.value)} className="border rounded-xl px-3 py-2">
                <option value="all">ทุกสถานะ</option><option value="ACTIVE">Active</option><option value="PENDING">Pending</option><option value="SUSPENDED">Suspended</option><option value="INACTIVE">Inactive</option>
              </select>
              <span className="text-xs text-slate-500 self-center">{loading?'กำลังโหลด...':`${filtered.length} รายการ`}</span>
            </div>

            {loading ? <div className="text-sm text-slate-500 py-8 text-center">กำลังโหลดสมาชิก...</div>
            : filtered.length===0 ? <div className="text-sm text-slate-500 py-8 text-center border rounded-xl bg-slate-50">ไม่พบสมาชิกที่ค้นหา</div>
            : (
              <div className="overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-[#475569] text-white">
                    <tr><th className="text-left p-2.5">Member ID</th><th className="text-left p-2.5">ชื่อ</th><th className="text-left p-2.5">จังหวัด</th><th className="text-left p-2.5 hidden md:table-cell">สาขา/ภาค</th><th className="p-2.5">สถานะ</th><th className="text-left p-2.5 hidden md:table-cell">อีเมล</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {filtered.map(m=>(
                      <tr key={m.memberId} className="hover:bg-slate-50">
                        <td className="p-2.5 font-mono font-semibold text-[#475569]">{m.memberId}</td>
                        <td className="p-2.5">{m.name}</td>
                        <td className="p-2.5">{m.province}</td>
                        <td className="p-2.5 hidden md:table-cell">{m.branch} / {m.region}</td>
                        <td className="p-2.5"><span className={`px-2 py-1 rounded-full border text-[11px] font-medium ${STATUS_COLOR[m.status]||'bg-slate-100'}`}>{m.status}</span></td>
                        <td className="p-2.5 hidden md:table-cell font-mono text-[11px]">{m.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="text-[11px] text-slate-500 mt-3">API: GET /api/members — ใช้ Prisma ถ้า DB พร้อม, fallback demo เมื่อ DB ว่าง • สมาชิกที่ไม่ได้อยู่ในขอบเขตสิทธิ์จะไม่แสดง (Deny by Default)</div>
          </div>

          <div className="flex gap-2 text-sm">
            <Link href="/prospects" className="px-4 py-2 rounded-full border bg-white">ผู้สนใจ</Link>
            <Link href="/appointments" className="px-4 py-2 rounded-full border bg-white">นัดหมาย</Link>
            <Link href="/income" className="px-4 py-2 rounded-full border bg-white">รายได้</Link>
          </div>
        </main>
      </div>
    </div>
  );
}
