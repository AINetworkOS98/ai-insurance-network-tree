'use client';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Kanban from '@/components/Kanban';
import { useEffect, useState } from 'react';

export default function Prospects(){
  const [prospects, setProspects]=useState<any[]>([]);
  useEffect(()=>{
    fetch('/api/prospects',{cache:'no-store'}).then(r=>r.json()).then(j=> setProspects(j.prospects||[])).catch(()=>{});
  },[]);
  const by = (s:string)=> prospects.filter((p:any)=> p.status===s).length;
  return (
    <div>
      <Header/>
      <div className="flex max-w-[1280px] mx-auto">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-[#0f2040]">ผู้สนใจ (Prospect CRM)</h1>
            {prospects.length===0 && <span className="text-xs px-2 py-1 rounded-full border bg-white text-slate-500">ไม่มีข้อมูลปลอม — แสดงเฉพาะข้อมูลจริงจาก DB</span>}
            <button className="ml-auto px-4 py-2 rounded-full bg-[#0f2040] text-white text-sm">+ เพิ่มผู้สนใจ</button>
            <button className="px-4 py-2 rounded-full border bg-white text-sm">นำเข้า CSV/Excel</button>
          </div>
          <div className="card p-4">
            <div className="flex gap-2 text-sm mb-3">
              <input placeholder="ค้นหาชื่อ อีเมล เบอร์โทร" className="flex-1 border rounded-xl px-3 py-2"/>
              <select className="border rounded-xl px-3 py-2 text-sm"><option>ทุกสถานะ</option><option>New</option><option>Appointment</option></select>
              <button className="px-4 py-2 rounded-xl border bg-white text-sm">ส่งออกตามสิทธิ์</button>
            </div>
            <div className="text-xs text-slate-500 mb-3">ผู้สนใจยังไม่ถือเป็นสมาชิกและไม่อยู่ในต้นไม้ฐาน 5 คน • แปลงเป็นสมาชิกต้องผ่าน OTP + เอกสาร + Admin อนุมัติ • ไม่แสดงข้อมูลปลอม</div>
            <Kanban/>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="card p-4">
              <div className="text-sm font-semibold">ปฏิทินนัดหมาย</div>
              <div className="mt-2 text-xs space-y-1">
                {prospects.length===0
                  ? <div className="p-3 rounded-lg bg-slate-50 border text-slate-500 text-center">— ยังไม่มีนัดหมาย —</div>
                  : prospects.slice(0,2).map((p:any)=>(<div key={p.id} className="p-2 rounded-lg bg-violet-50 border truncate">{p.id} — {p.name}</div>))}
              </div>
            </div>
            <div className="card p-4">
              <div className="text-sm font-semibold">รายการติดตาม</div>
              <div className="mt-2 text-xs text-slate-600">
                {prospects.length===0
                  ? <div className="text-slate-500">— ยังไม่มีรายการติดตาม —</div>
                  : prospects.filter((p:any)=> p.status==='FOLLOW_UP').slice(0,3).map((p:any)=>(<div key={p.id}>• {p.id} {p.name}</div>))}
              </div>
            </div>
            <div className="card p-4">
              <div className="text-sm font-semibold">Dashboard สรุปผล</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-slate-50 border p-3">ใหม่ {by('NEW')}</div><div className="rounded-xl bg-emerald-50 border p-3">Converted {by('CONVERTED')}</div>
                <div className="rounded-xl bg-sky-50 border p-3">นัดหมาย {by('APPOINTMENT')}</div><div className="rounded-xl bg-amber-50 border p-3">Follow-up {by('FOLLOW_UP')}</div>
              </div>
              {prospects.length===0 && <div className="text-[11px] text-slate-400 mt-2">ศูนย์ทั้งหมด — จะนับเมื่อมีข้อมูลจริง</div>}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
