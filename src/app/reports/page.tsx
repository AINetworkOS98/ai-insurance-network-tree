'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
export default function ReportsPage(){
  const [summary,setSummary]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [err,setErr]=useState('');
  useEffect(()=>{(async()=>{
    try{
      const r=await fetch('/api/income/summary'); const j=await r.json();
      if(j.ok) setSummary(j); else setErr(j.error||'โหลดไม่สำเร็จ');
    }catch(e:any){ setErr(e.message); } finally{ setLoading(false); }
  })()},[]);
  return (
    <div>
      <Header/>
      <div className="flex max-w-[1280px] mx-auto">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-4">
          <h1 className="text-xl font-bold text-navy">รายงาน</h1>
          <p className="text-xs text-slate-500">รายงานตามเขตเวลา Asia/Bangkok — แยกตามแหล่งที่มาที่ได้รับรอง (API ภายนอก/ผู้มีสิทธิรับรอง)</p>
          {loading && <div className="text-xs text-slate-500">กำลังโหลด...</div>}
          {err && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex justify-between">{err}<button onClick={()=>location.reload()} className="underline">ลองใหม่</button></div>}
          {!loading && !err && !summary && <div className="p-6 rounded-xl border bg-white text-center text-xs text-slate-500">ไม่มีข้อมูล</div>}
          {summary && (
            <>
              <div className="grid md:grid-cols-3 gap-3">
                <div className="card p-4"><div className="text-xs text-slate-500">ยอดยืนยันแล้ว (Verified)</div><div className="text-lg font-bold text-emerald-700">฿{Number(summary.verified ?? 0).toLocaleString('th-TH')}</div><div className="text-[11px] text-slate-400">จาก receipt ที่ Verified เท่านั้น — OCR อย่างเดียวไม่นับ</div></div>
                <div className="card p-4"><div className="text-xs text-slate-500">รออนุมัติ / รอตรวจ</div><div className="text-lg font-bold text-amber-600">฿{Number(summary.pending ?? 0).toLocaleString('th-TH')}</div><div className="text-[11px] text-slate-400">ยังไม่นับเป็นผลงานจนกว่าตรวจผ่าน</div></div>
                <div className="card p-4"><div className="text-xs text-slate-500">ไม่ผ่าน / ยกเลิก</div><div className="text-lg font-bold text-rose-600">฿{Number(summary.rejected ?? 0).toLocaleString('th-TH')}</div></div>
              </div>
              <div className="card p-4">
                <div className="font-semibold text-sm">ธุรกรรมย้อนหลัง (ตรวจสอบย้อนหลังได้)</div>
                <div className="mt-2 space-y-1 max-h-[400px] overflow-auto">
                  {(summary.transactions||summary.ledger||[]).slice(0,50).map((t:any,i:number)=>(
                    <div key={i} className="flex gap-2 text-xs p-2 rounded-lg border bg-slate-50">
                      <span className="font-mono">{t.period||t.createdAt?.slice(0,7)||'-'}</span>
                      <span>{t.type}</span>
                      <span className="ml-auto font-mono">฿{Number(t.amount||t.netAmount||0).toLocaleString()}</span>
                      <span className={`px-1.5 py-0.5 rounded-full text-[11px] ${String(t.status).toLowerCase().includes('active')||String(t.status).toLowerCase().includes('verified')?'bg-emerald-100 text-emerald-700':'bg-amber-100'}`}>{t.status}</span>
                    </div>
                  ))}
                  {(!summary.transactions && !summary.ledger) && <div className="text-xs text-slate-400">ดูรายละเอียดที่ /receipts และ /periods</div>}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">การคำนวณผลตอบแทนใช้กติกาที่ได้รับการรับรองและผลงานที่ยืนยันแล้วเท่านั้น — ห้ามใช้จำนวนสมาชิกอย่างเดียวเป็นรายได้</div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
