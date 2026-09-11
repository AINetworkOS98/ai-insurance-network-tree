'use client';
import { useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
export default function LoginPage(){
  const [form, setForm] = useState({ email:'', password:'' });
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(e:any){
    e.preventDefault(); setLoading(true); setMsg('');
    try{
      const res = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form)});
      const j = await res.json();
      setMsg(j.ok ? 'เข้าสู่ระบบสำเร็จ' : (j.error || 'ไม่สำเร็จ'));
      if(j.ok) location.href='/dashboard';
    }catch{ setMsg('เข้าสู่ระบบไม่สำเร็จ');}
    setLoading(false);
  }
  return (
    <div>
      <Header/>
      <div className="flex max-w-[1280px] mx-auto">
        <Sidebar/>
        <main className="flex-1 p-6 max-w-[420px] mx-auto w-full">
          <h1 className="text-xl font-bold text-navy">เข้าสู่ระบบ</h1>
          <p className="text-xs text-slate-500 mt-1">รองรับ Google + อีเมล/รหัสผ่าน — มี loading และข้อความภาษาไทย, ไม่ปล่อยหน้าขาว</p>
          <form onSubmit={submit} className="card p-5 mt-4 space-y-3">
            <input value={form.email} onChange={e=> setForm({...form, email:e.target.value})} placeholder="อีเมล" className="w-full px-3 py-2 rounded-xl border text-sm" />
            <input value={form.password} onChange={e=> setForm({...form, password:e.target.value})} type="password" placeholder="รหัสผ่าน" className="w-full px-3 py-2 rounded-xl border text-sm" />
            <button disabled={loading} className="w-full py-2 rounded-full bg-navy text-white text-sm disabled:opacity-50">{loading?'กำลังเข้าสู่ระบบ...':'เข้าสู่ระบบ'}</button>
            <a href="/register" className="block text-center text-xs text-navy">ยังไม่มีบัญชี? สมัครที่นี่</a>
            {msg && <div className="p-2 rounded-xl bg-amber-50 border text-xs">{msg}</div>}
            <div className="text-[11px] text-slate-500">Google Login: ใช้ปุ่ม Google จาก Firebase Client SDK ในหน้าจริง — API /api/auth/google พร้อมแล้ว</div>
          </form>
        </main>
      </div>
    </div>
  );
}
