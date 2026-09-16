'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

// บอร์ดผู้ขึ้นตำแหน่ง + รายได้ — เห็นเฉพาะระดับตัวแทนขึ้นไป (สมาชิกทั่วไปไม่เห็น)
export default function PromotionsBoardPage(){
  const [board, setBoard] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [denied, setDenied] = useState(false);

  useEffect(()=>{ (async()=>{
    try{
      const r = await fetch('/api/career/board',{credentials:'include'});
      const j = await r.json();
      if(j.ok) setBoard(j.board || []);
      else if(r.status===403){ setDenied(true); }
      else setMsg(j.error || 'โหลดไม่สำเร็จ');
    }catch{ setMsg('โหลดไม่สำเร็จ'); }
  })(); },[]);

  return (
    <div>
      <Header/>
      <div className="flex w-full">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-4 max-w-[860px]">
          <div>
            <h1 className="text-xl font-bold text-navy">ผู้ขึ้นตำแหน่งและรายได้</h1>
            <p className="text-xs text-slate-500 mt-1">เฉพาะระดับตัวแทนขึ้นไป • เลื่อนแล้วรายได้ตามโครงสร้างตำแหน่ง</p>
          </div>
          {msg && <div className="p-2 rounded-xl bg-amber-50 border text-xs">{msg}</div>}
          {denied ? (
            <div className="card p-5 text-sm">หน้านี้สำหรับระดับตัวแทนขึ้นไป — สมัครเป็นตัวแทนเพื่อดูบอร์ดผู้เลื่อนตำแหน่ง</div>
          ) : (
            <div className="card p-4">
              <div className="space-y-2">
                {board.map((b:any)=>(
                  <div key={b.id} className="p-3 rounded-xl border bg-slate-50 text-xs flex flex-wrap gap-2 items-center">
                    <span className="font-bold">{b.name}</span>
                    {b.memberCode && <span className="font-mono text-slate-500">{b.memberCode}</span>}
                    <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[11px]">{b.fromRankName} → {b.toRankName}</span>
                    <span className="ml-auto font-mono">฿{Number(b.income).toLocaleString('th-TH')}</span>
                    <span className="text-[11px] text-slate-400 w-full">{b.at ? new Date(b.at).toLocaleDateString('th-TH',{day:'numeric',month:'long',year:'numeric'}) : ''}</span>
                  </div>
                ))}
                {!board.length && <div className="text-xs text-slate-500">ยังไม่มีผู้เลื่อนตำแหน่ง</div>}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
