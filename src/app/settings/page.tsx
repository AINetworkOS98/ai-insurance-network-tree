'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
export default function SettingsPage(){
  const [form, setForm] = useState({ firstName:'', lastName:'', phone:'', province:'', district:'', subdistrict:'' });
  const [msg, setMsg] = useState('');
  // cascade data same as /tree
  const [provList, setProvList] = useState<any[]>([]);
  const [distList, setDistList] = useState<any[]>([]);
  const [subList, setSubList] = useState<any[]|null>(null);
  const [selProv, setSelProv] = useState('');
  const [selDist, setSelDist] = useState('');
  const [selTambon, setSelTambon] = useState('');
  useEffect(()=>{ (async()=>{
    try{ const r=await fetch('/data/provinces.json',{cache:'force-cache'}); const j=await r.json(); if(Array.isArray(j)) setProvList(j.filter((p:any)=>!p.deleted_at)); }catch{}
    try{ const r=await fetch('/data/districts.json',{cache:'force-cache'}); const j=await r.json(); if(Array.isArray(j)) setDistList(j.filter((d:any)=>!d.deleted_at)); }catch{}
  })(); },[]);
  async function ensureSub(){
    if(subList) return;
    try{ const r=await fetch('/data/sub_districts.json',{cache:'force-cache'}); const j=await r.json(); if(Array.isArray(j)) setSubList(j.filter((s:any)=>!s.deleted_at)); }catch{ setSubList([]); }
  }
  const distOpts = selProv ? distList.filter((d:any)=>String(d.province_id)===String(selProv)) : [];
  const subOpts = selDist && subList ? subList.filter((s:any)=>String(s.district_id)===String(selDist)) : [];
  useEffect(()=>{ (async()=>{
    const r=await fetch('/api/members'); const j=await r.json();
    if(j.ok && j.members?.[0]){
      const m=j.members[0];
      setForm({ firstName:m.firstName||m.name?.split(' ')?.[0]||'', lastName:m.lastName||m.name?.split(' ')?.slice(1).join(' ')||'', phone:m.phone||'', province:m.province||'', district:m.district||'', subdistrict:m.subdistrict||'' });
      // try to map names to ids for selects
      setTimeout(()=>{
        if(m.province){
          const p=provList.find((x:any)=>x.name_th===m.province);
          if(p) setSelProv(String(p.id));
        }
        if(m.district){
          const d=distList.find((x:any)=>x.name_th===m.district);
          if(d) setSelDist(String(d.id));
        }
        if(m.subdistrict && subList){
          const s=subList.find((x:any)=>x.name_th===m.subdistrict);
          if(s) setSelTambon(String(s.id));
        }
      },300);
    }
  })(); },[provList.length, distList.length]);
  // when province/district names loaded, sync ids
  useEffect(()=>{
    if(form.province && provList.length && !selProv){
      const p=provList.find((x:any)=>x.name_th===form.province);
      if(p) setSelProv(String(p.id));
    }
  },[provList, form.province]);
  useEffect(()=>{
    if(form.district && distList.length && !selDist && selProv){
      const d=distList.find((x:any)=>x.name_th===form.district);
      if(d) setSelDist(String(d.id));
    }
  },[distList, selProv, form.district]);
  useEffect(()=>{
    if(form.subdistrict && subList && !selTambon && selDist){
      const s=subList.find((x:any)=>x.name_th===form.subdistrict);
      if(s) setSelTambon(String(s.id));
    }
  },[subList, selDist, form.subdistrict]);

  async function save(){
    const pname = provList.find((p:any)=>String(p.id)===selProv)?.name_th || form.province || '';
    const dname = distOpts.find((d:any)=>String(d.id)===selDist)?.name_th || form.district || '';
    const sname = (subOpts.find((s:any)=>String(s.id)===selTambon)?.name_th) || form.subdistrict || '';
    const payload = { ...form, province:pname, district:dname, subdistrict:sname };
    const r = await fetch('/api/members', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload)});
    const j = await r.json();
    setMsg(j.ok ? 'บันทึกสำเร็จ' : j.error || 'บันทึกไม่สำเร็จ');
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
            <div className="grid grid-cols-3 gap-2">
              <select value={selTambon} disabled={!selDist} onChange={e=>setSelTambon(e.target.value)} className="border rounded-xl px-3 py-2 text-sm disabled:opacity-50">
                <option value="">{selDist?'ทุกตำบล':'ตำบล'}</option>
                {subOpts.map((s:any)=>(<option key={s.id} value={s.id}>{s.name_th}</option>))}
              </select>
              <select value={selDist} disabled={!selProv} onChange={e=>{setSelDist(e.target.value);setSelTambon('');ensureSub();}} className="border rounded-xl px-3 py-2 text-sm disabled:opacity-50">
                <option value="">{selProv?'อำเภอ/เขต':'อำเภอ/เขต'}</option>
                {distOpts.map((d:any)=>(<option key={d.id} value={d.id}>{d.name_th}</option>))}
              </select>
              <select value={selProv} onChange={e=>{setSelProv(e.target.value);setSelDist('');setSelTambon('');}} className="border rounded-xl px-3 py-2 text-sm">
                <option value="">จังหวัด</option>
                {provList.map((p:any)=>(<option key={p.id} value={p.id}>{p.name_th}</option>))}
              </select>
            </div>
            <div className="text-[11px] text-slate-500">จังหวัด/อำเภอ/ตำบล — ข้อมูลเดียวกับหน้า ผังทีม 1:5 (77/930/7452) • เล็กไปใหญ่ ตำบล→อำเภอ→จังหวัด</div>
            <button onClick={save} className="px-6 py-2 rounded-full bg-navy text-white text-sm">บันทึก</button>
            {msg && <div className="p-2 rounded-xl bg-amber-50 border text-xs">{msg}</div>}
            <div className="text-[11px] text-slate-500">ตั้งค่าระบบ: ชื่อระบบดูได้ที่ /api/system-config (GET) — เปลี่ยนได้ที่ผู้มีสิทธิ system.manage</div>
          </div>
        </main>
      </div>
    </div>
  );
}
