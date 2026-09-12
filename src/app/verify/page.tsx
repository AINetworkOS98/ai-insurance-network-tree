'use client';
import { useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

type VerifyResult = { memberId:string; name:string; province:string; status:string; positionId:string } | null;

export default function VerifyPage(){
  const [q,setQ]=useState('');
  const [loading,setLoading]=useState(false);
  const [result,setResult]=useState<VerifyResult[]>([]);
  const [msg,setMsg]=useState('');

  async function verify(){
    if(!q.trim()){ setMsg('กรอก รหัสสมาชิก / ชื่อ / เบอร์ / อีเมล'); return; }
    setLoading(true); setMsg(''); setResult([]);
    try{
      const r1 = await fetch(`/api/members`,{cache:'no-store'});
      const j1 = await r1.json();
      const members:any[] = j1.members||[];
      const qLower = q.trim().toLowerCase();
      const hits = members.filter((m:any)=>
        String(m.memberId||'').toLowerCase().includes(qLower) ||
        String(m.name||'').toLowerCase().includes(qLower) ||
        String(m.email||'').toLowerCase().includes(qLower) ||
        String(m.province||'').toLowerCase().includes(qLower)
      );
      if(hits.length>0){
        setResult(hits.slice(0,12));
        setMsg(`✓ พบ ${hits.length} รายการ` );
      } else {
        setMsg(`ไม่พบ "${q}" (มีสมาชิก ${members.length} คน)`);
      }
    }catch(e:any){ setMsg('ตรวจสอบไม่สำเร็จ: '+e.message); }
    setLoading(false);
  }

  return (
    <div>
      <Header/>
      <div className="flex max-w-[1280px] mx-auto">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-[#475569]">ตรวจสมาชิก 🔍</h1>
          </div>

          <div className="card p-5">
            <div className="text-sm font-semibold">ค้นหา/ตรวจสอบสมาชิก</div>
            <p className="text-xs text-slate-500 mt-1">พิมพ์ รหัส AG / ชื่อ / เบอร์ / อีเมล / จังหวัด</p>
            <div className="mt-4 flex gap-2">
              <input value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=> e.key==='Enter' && verify()} placeholder="เช่น AG-VEE6LY / สมชาย / 0924625798 / กรุงเทพ" className="flex-1 border rounded-xl px-4 py-3" />
              <button onClick={verify} disabled={loading} className="px-6 py-3 rounded-xl bg-[#475569] text-white font-semibold disabled:opacity-50">{loading?'กำลังตรวจ...':'ตรวจสอบ'}</button>
            </div>
            {msg && <div className="mt-3 text-xs p-3 rounded-xl bg-slate-50 border">{msg}</div>}
            {result.length>0 && (
              <div className="mt-4 space-y-2">
                {result.map(r=>(
                  <div key={r!.memberId} className="p-3 rounded-xl border bg-white flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold">{r!.name} <span className="ml-2 font-mono text-xs px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border">{r!.memberId}</span></div>
                      <div className="text-xs text-slate-500">{r!.province} • {r!.positionId} • {r!.status}</div>
                    </div>
                    <span className="px-3 py-1.5 rounded-full bg-slate-100 text-xs">{r!.status}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <a href="/tree" className="px-3 py-2 rounded-full border bg-white hover:bg-slate-50">🌳 ผัง 5-wide</a>
              <a href="/members" className="px-3 py-2 rounded-full border bg-white hover:bg-slate-50">👥 สมาชิกของฉัน</a>
            </div>
          </div>

        </main>
      </div>
    </div>
  );
}
