'use client';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { useState } from 'react';

export default function RecruitPage(){
  const OS = 'https://ai-insurance-network-os.vercel.app';
  const [form,setForm]=useState({firstName:'',lastName:'',phone:'',email:'',province:'กรุงเทพมหานคร'});
  const [saving,setSaving]=useState(false);
  const [msg,setMsg]=useState('');

  async function submit(e:React.FormEvent){
    e.preventDefault();
    if(!form.firstName || !form.lastName || !form.phone){ setMsg('กรอก ชื่อ นามสกุล เบอร์ ให้ครบ'); return; }
    setSaving(true); setMsg('');
    try{
      const r=await fetch('/api/prospects',{method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({...form, status:'pending_review'})});
      const j=await r.json();
      if(!r.ok) throw new Error(j.error||'ส่งไม่สำเร็จ');
      setMsg(`✓ ส่งใบสมัครสำเร็จ ${j.created?.id||''} — จะโผล่ใน OS recruit_agent ทันที (ฐานเดียวกัน)`);
      setForm({firstName:'',lastName:'',phone:'',email:'',province:'กรุงเทพมหานคร'});
    }catch(e:any){ setMsg('❌ '+e.message); }
    setSaving(false);
  }

  return (
    <div>
      <Header/>
      <div className="flex w-full">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-[#475569]">สมัครตัวแทน — เชื่อม OS 📝</h1>
            <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">ฐานเดียวกัน akarapol798</span>
            <a href={`${OS}/?tab=recruit_agent`} target="_blank" rel="noreferrer" className="ml-auto px-4 py-2 rounded-full bg-[#475569] text-white text-sm">เปิด OS recruit_agent ↗</a>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <div className="card p-5">
              <div className="font-semibold text-sm">ยื่นตรงจาก Tree (เขียนลง Firestore เดียวกัน)</div>
              <p className="text-xs text-slate-500 mt-1">ส่งแล้วไปโผล่ใน OS <code>recruit_agent</code> → อนุมัติเป็นสมาชิก → เห็นใน <code>search_landing</code> / <code>members_mgmt</code> / Tree ทันที</p>
              <form onSubmit={submit} className="mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <label className="text-sm">ชื่อ*<input value={form.firstName} onChange={e=>setForm({...form,firstName:e.target.value})} className="mt-1 w-full border rounded-xl px-3 py-2" placeholder="ชื่อจริง" /></label>
                  <label className="text-sm">นามสกุล*<input value={form.lastName} onChange={e=>setForm({...form,lastName:e.target.value})} className="mt-1 w-full border rounded-xl px-3 py-2" placeholder="นามสกุล" /></label>
                </div>
                <label className="text-sm">เบอร์โทร*<input value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} className="mt-1 w-full border rounded-xl px-3 py-2" placeholder="08x-xxx-xxxx" /></label>
                <label className="text-sm">อีเมล<input value={form.email} onChange={e=>setForm({...form,email:e.target.value})} className="mt-1 w-full border rounded-xl px-3 py-2" placeholder="email@example.com" /></label>
                <label className="text-sm">จังหวัด<input value={form.province} onChange={e=>setForm({...form,province:e.target.value})} className="mt-1 w-full border rounded-xl px-3 py-2" /></label>
                <button type="submit" disabled={saving} className="w-full py-3 rounded-xl bg-[#c8a84e] text-[#475569] font-bold disabled:opacity-50">{saving?'กำลังส่ง...':'ส่งใบสมัคร (เข้า OS)'}</button>
                {msg && <div className="text-xs p-3 rounded-xl bg-slate-50 border">{msg}</div>}
              </form>
              <div className="mt-3 flex gap-2 text-xs flex-wrap">
                <a href="/verify" className="px-3 py-1.5 rounded-full border bg-white">ตรวจสมาชิก →</a>
                <a href="/prospects" className="px-3 py-1.5 rounded-full border bg-white">ดูผู้สนใจ →</a>
                <a href={`${OS}/?tab=members_mgmt`} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-full border bg-white">จัดการใน OS →</a>
              </div>
            </div>

            <div className="card p-0 overflow-hidden flex flex-col">
              <div className="p-3 border-b flex items-center gap-2 bg-slate-50">
                <span className="text-sm font-semibold">ฟอร์ม OS แบบเต็ม (iframe)</span>
                <span className="text-[11px] text-slate-500">ถ้าโหลดไม่ได้ให้กดเปิดแท็บใหม่</span>
                <a href={`${OS}/?tab=recruit_agent`} target="_blank" rel="noreferrer" className="ml-auto text-xs px-3 py-1 rounded-full bg-white border">เปิดเต็มจอ ↗</a>
              </div>
              <div className="flex-1 min-h-[620px] bg-white">
                <iframe
                  src={`${OS}/?tab=recruit_agent`}
                  title="OS Recruit Agent"
                  className="w-full h-[620px] border-0"
                  allow="clipboard-write"
                />
              </div>
              <div className="p-2 text-[11px] text-slate-500 border-t bg-amber-50">หาก OS บล็อก iframe (X-Frame) ให้ใช้ฟอร์มซ้ายหรือปุ่มเปิดเต็มจอ — ข้อมูลลงฐานเดียวกันหมด</div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
