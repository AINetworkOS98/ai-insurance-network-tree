'use client';
import Header from '@/components/Header';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
export default function Login(){
  const [email,setEmail]=useState('admin@example.com');
  const [pw,setPw]=useState('admin123');
  const [msg,setMsg]=useState('');
  const [loading,setLoading]=useState(false);
  const router=useRouter();
  async function submit(){
    setLoading(true); setMsg('');
    try{
      const r=await fetch('/api/auth/login',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({email, password: pw})});
      const j=await r.json();
      if(j.ok){ setMsg('✅ เข้าสู่ระบบสำเร็จ — กำลังไป Dashboard...'); setTimeout(()=> router.push('/dashboard'), 600); }
      else setMsg('❌ '+ (j.error||'เข้าสู่ระบบไม่สำเร็จ'));
    }catch(e:any){ setMsg('❌ '+ e.message); }
    setLoading(false);
  }
  return (<div><Header/><div className="max-w-[480px] mx-auto p-6"><div className="card p-6"><h1 className="text-xl font-bold text-[#0f2040]">เข้าสู่ระบบ</h1><p className="text-xs text-slate-500 mt-1">Demo: admin@example.com / admin123 หรืออีเมลใดก็ได้ + รหัสใดก็ได้ (โหมดทดสอบ)</p><div className="mt-4 space-y-3"><input value={email} onChange={e=>setEmail(e.target.value)} placeholder="อีเมลหรือเบอร์โทร" className="w-full border rounded-xl px-3 py-2.5"/><input value={pw} onChange={e=>setPw(e.target.value)} placeholder="รหัสผ่าน" type="password" className="w-full border rounded-xl px-3 py-2.5"/><button onClick={submit} disabled={loading} className="w-full py-2.5 rounded-full bg-[#0f2040] text-white font-semibold disabled:opacity-50">{loading?'กำลังเข้าสู่ระบบ...':'เข้าสู่ระบบ'}</button>{msg && <div className="text-sm p-3 rounded-xl bg-slate-50 border">{msg}</div>}<div className="flex gap-2"><button onClick={()=>setMsg('Google Sign-in — เปิดใช้งานเมื่อต่อ Firebase')} className="flex-1 py-2 rounded-full border bg-white text-sm">Google Sign-in</button><button onClick={()=>router.push('/register')} className="flex-1 py-2 rounded-full border bg-white text-sm">OTP / สมัคร</button></div><div className="text-xs text-slate-500 text-center">MFA สำหรับ Admin • แจ้งเตือนเมื่อเข้าสู่ระบบจากอุปกรณ์ใหม่ • Session จัดการได้</div></div></div></div></div>);
}
