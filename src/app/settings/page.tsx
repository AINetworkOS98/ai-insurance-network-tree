'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
export default function SettingsPage(){
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', phone:'', province:'', district:'', subdistrict:'', addressLine:'', zipCode:'', lineId:'', facebookUrl:'', tiktokUrl:'', referralCode:'', memberCode:'' });
  const [msg, setMsg] = useState('');
  const [origEmail, setOrigEmail] = useState('');
  // cascade data same as /tree and register
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
  useEffect(()=>{ if(selTambon && subList){
    const s=subList.find((x:any)=>String(x.id)===selTambon);
    if(s?.zip_code) setForm(f=> f.zipCode ? f : {...f, zipCode: String(s.zip_code)});
  }},[selTambon, subList]);
  useEffect(()=>{ (async()=>{
    // โหลดโปรไฟล์ของตัวเองเท่านั้น (ห้ามใช้ members[0] — นั่นคือคนอื่น)
    try{
      const r=await fetch('/api/auth/me',{credentials:'include'});
      const j=await r.json();
      if(j.ok && j.user){
        const u=j.user;
        setOrigEmail(u.email||'');
        setForm(f=>({...f,
          firstName:u.firstName||f.firstName, lastName:u.lastName||f.lastName,
          email:u.email||f.email, phone:u.phone||f.phone,
          province:u.province||f.province, district:u.district||f.district, subdistrict:u.subdistrict||f.subdistrict,
          addressLine:u.addressLine||f.addressLine, zipCode:u.zipCode||f.zipCode,
          lineId:u.lineId||f.lineId, facebookUrl:u.facebookUrl||f.facebookUrl, tiktokUrl:u.tiktokUrl||f.tiktokUrl,
          referralCode:u.referralCode||f.referralCode, memberCode:u.memberCode||f.memberCode,
        }));
      }
    }catch{}
  })(); },[]);
  // map names to ids when lists loaded
  useEffect(()=>{
    if(form.province && provList.length && !selProv){
      const p=provList.find((x:any)=>x.name_th===form.province);
      if(p) setSelProv(String(p.id));
    }
  },[provList, form.province]);
  useEffect(()=>{
    if(form.district && distList.length && !selDist && selProv){
      const d=distList.find((x:any)=>x.name_th===form.district);
      if(d){ setSelDist(String(d.id)); ensureSub(); }
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
    const j = await r.json().catch(()=>({ok:false, error:'no response'}));
    setMsg(j.ok ? 'บันทึกสำเร็จ' : (j.error || 'บันทึกไม่สำเร็จ — ลองใหม่'));
    if(j.ok && (j.memberCode || j.referralCode)){
      setForm(f=>({...f, memberCode: j.memberCode||f.memberCode, referralCode: j.referralCode||f.referralCode}));
    }
  }
  return (
    <div>
      <Header/>
      <div className="flex w-full">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-4 w-full min-w-0">
          <h1 className="text-xl font-bold text-navy">ตั้งค่าบัญชีและระบบ</h1>
          <p className="text-xs text-slate-500">ข้อมูลมาตรฐาน — ระบบออกรหัสสมาชิก/รหัสแนะนำอัตโนมัติเมื่อสมัคร</p>
          <div className="card p-5 space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <input value={form.firstName} onChange={e=> setForm({...form, firstName:e.target.value})} placeholder="ชื่อ *" className="w-full px-3 py-2 rounded-xl border text-sm" />
              <input value={form.lastName} onChange={e=> setForm({...form, lastName:e.target.value})} placeholder="นามสกุล *" className="w-full px-3 py-2 rounded-xl border text-sm" />
            </div>
            <input value={form.email} onChange={e=> setForm({...form, email:e.target.value})} placeholder="อีเมล *" className="w-full px-3 py-2 rounded-xl border text-sm" />
            <input value={form.phone} onChange={e=> setForm({...form, phone:e.target.value})} placeholder="เบอร์โทร *" className="w-full px-3 py-2 rounded-xl border text-sm" />
            <div className="grid md:grid-cols-3 gap-3">
              <input value={form.lineId} onChange={e=> setForm({...form, lineId:e.target.value})} placeholder="LINE ID" className="w-full px-3 py-2 rounded-xl border text-sm" />
              <input value={form.facebookUrl} onChange={e=> setForm({...form, facebookUrl:e.target.value})} placeholder="Facebook (ลิงก์)" className="w-full px-3 py-2 rounded-xl border text-sm" />
              <input value={form.tiktokUrl} onChange={e=> setForm({...form, tiktokUrl:e.target.value})} placeholder="TikTok (ลิงก์/ID)" className="w-full px-3 py-2 rounded-xl border text-sm" />
            </div>
            <div className="grid md:grid-cols-3 gap-2">
              <input value={form.addressLine} onChange={e=> setForm({...form, addressLine:e.target.value})} placeholder="บ้านเลขที่/ถนน" className="w-full px-3 py-2 rounded-xl border text-sm md:col-span-3" />
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <select value={selTambon} disabled={!selDist} onChange={e=>setSelTambon(e.target.value)} className="border rounded-xl px-3 py-2 text-sm disabled:opacity-50">
                <option value="">{selDist?'ตำบล':'ตำบล'}</option>
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
              <input value={form.zipCode} onChange={e=> setForm({...form, zipCode:e.target.value})} placeholder="รหัสไปรษณีย์" inputMode="numeric" className="w-full px-3 py-2 rounded-xl border text-sm" />
            </div>
            <div className="text-[11px] text-slate-500">ตำบล→อำเภอ→จังหวัด→รหัสไปรษณีย์ — ชุดข้อมูลเดียวกับหน้า ผังทีม 1:5</div>
            <div className="grid md:grid-cols-2 gap-3 pt-2 border-t">
              <div>
                <label className="text-xs text-slate-600">รหัสผู้แนะนำ</label>
                <input value={form.referralCode} readOnly placeholder="เช่น R-XXXXXX (ถ้ามีผู้แนะนำ)" className="w-full mt-1 px-3 py-2 rounded-xl border text-sm bg-slate-50" />
                <div className="text-[11px] text-slate-400 mt-1">รหัสที่ใช้สมัครเข้ามา (ถ้ามี)</div>
              </div>
              <div>
                <label className="text-xs text-slate-600">รหัสของคุณ (ออโต้)</label>
                <input value={form.memberCode} readOnly placeholder="เช่น M-XXXXXX — ระบบออกให้อัตโนมัติ" className="w-full mt-1 px-3 py-2 rounded-xl border text-sm bg-slate-50 font-mono" />
                <div className="text-[11px] text-slate-400 mt-1">รหัสสมาชิก + รหัสแนะนำของคุณจะขึ้นหลังสมัคร</div>
              </div>
            </div>
            <button onClick={save} className="px-6 py-2 rounded-full bg-navy text-white text-sm">บันทึก</button>
            {msg && <div className="p-2 rounded-xl bg-amber-50 border text-xs">{msg}</div>}
            <div className="text-[11px] text-slate-500">ตั้งค่าระบบ: ชื่อระบบดูได้ที่ /api/system-config (GET) — เปลี่ยนได้ที่ผู้มีสิทธิ system.manage</div>
          </div>
        </main>
      </div>
    </div>
  );
}
