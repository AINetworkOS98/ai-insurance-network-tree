'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
export default function SettingsPage(){
  const [form, setForm] = useState({ firstName:'', lastName:'', phone:'', province:'' });
  const [msg, setMsg] = useState('');
  useEffect(()=>{ (async()=>{ const r=await fetch('/api/members'); const j=await r.json(); if(j.ok && j.members?.[0]) setForm({ firstName:j.members[0].firstName||'', lastName:j.members[0].lastName||'', phone:j.members[0].phone||'', province:j.members[0].province||'' }); })(); },[]);
  async function save(){
    const r = await fetch('/api/members', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form)});
    const j = await r.json();
    setMsg(j.ok ? 'บันทึกสำเร็จ' : j.error);
  }
  return (
    <div>
      <Header/>
      <div className="flex w-full">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-4 max-w-[560px]">
          <h1 className="text-xl font-bold text-navy">ตั้งค่าบัญชีและระบบ</h1>
          <div className="card p-5 space-y-3">
            <input value={form.firstName} onChange={e=> setForm({...form, firstName:e.target.value})} placeholder="ชื่อ" className="w-full px-3 py-2 rounded-xl border text-sm" />
            <input value={form.lastName} onChange={e=> setForm({...form, lastName:e.target.value})} placeholder="นามสกุล" className="w-full px-3 py-2 rounded-xl border text-sm" />
            <input value={form.phone} onChange={e=> setForm({...form, phone:e.target.value})} placeholder="โทรศัพท์" className="w-full px-3 py-2 rounded-xl border text-sm" />
            <input value={form.province} onChange={e=> setForm({...form, province:e.target.value})} placeholder="จังหวัด" className="w-full px-3 py-2 rounded-xl border text-sm" />
            <button onClick={save} className="px-6 py-2 rounded-full bg-navy text-white text-sm">บันทึก</button>
            {msg && <div className="p-2 rounded-xl bg-amber-50 border text-xs">{msg}</div>}
            <div className="text-[11px] text-slate-500">ตั้งค่าระบบ: ชื่อระบบดูได้ที่ /api/system-config (GET) — เปลี่ยนได้ที่ผู้มีสิทธิ system.manage</div>
          </div>
        </main>
      </div>
    </div>
  );
}
