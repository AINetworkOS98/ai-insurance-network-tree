'use client';
import { useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { auth } from '@/lib/firebase-client';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';

export default function LoginPage(){
  const [form, setForm] = useState({ email:'', password:'' });
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'ok'|'err'|''>('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  async function submit(e:any){
    e.preventDefault();
    if(!form.email || !form.password){ setMsg('กรุณากรอกอีเมลและรหัสผ่าน'); setMsgType('err'); return; }
    setLoading(true); setMsg('');
    try{
      const res = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form)});
      const j = await res.json();
      if(j.ok){
        setMsg('เข้าสู่ระบบสำเร็จ — กำลังพาไปหน้าแรก'); setMsgType('ok');
        setTimeout(()=> location.href='/', 600);
      } else { setMsg(j.error || 'เข้าสู่ระบบไม่สำเร็จ'); setMsgType('err'); }
    }catch{ setMsg('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'); setMsgType('err');}
    setLoading(false);
  }

  async function loginGoogle(){
    setGoogleLoading(true); setMsg('');
    try{
      if(!auth) throw new Error('Firebase ยังไม่พร้อม');
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt:'select_account' });
      const cred = await signInWithPopup(auth, provider);
      const idToken = await cred.user.getIdToken();
      const res = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ idToken })});
      const j = await res.json();
      if(j.ok){
        setMsg('เข้าสู่ระบบด้วย Google สำเร็จ'); setMsgType('ok');
        setTimeout(()=> location.href='/', 600);
      } else { setMsg(j.error || 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ'); setMsgType('err'); }
    }catch(e:any){
      const code = e?.code || '';
      if(code==='auth/popup-closed-by-user') setMsg('ปิดหน้าต่าง Google ก่อนเสร็จ');
      else if(code==='auth/cancelled-popup-request') setMsg('คำขอยกเลิก — ลองใหม่');
      else setMsg(e?.message || 'เข้าสู่ระบบด้วย Google ไม่สำเร็จ');
      setMsgType('err');
    }
    setGoogleLoading(false);
  }

  return (
    <div>
      <Header/>
      <div className="flex max-w-[1280px] mx-auto">
        <Sidebar/>
        <main className="flex-1 p-6 flex justify-center">
          <div className="w-full max-w-[420px]">
            <h1 className="text-2xl font-bold text-navy">เข้าสู่ระบบ</h1>
            <p className="text-xs text-slate-500 mt-1">ใช้ Google หรือ อีเมล + รหัสผ่าน — มีสถานะกำลังโหลดและข้อความภาษาไทย</p>

            <div className="card p-5 mt-4 space-y-4">
              {/* Google */}
              <button onClick={loginGoogle} disabled={googleLoading || loading} className="w-full py-2.5 rounded-xl border-2 border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                <span className="w-5 h-5 rounded-full bg-white border flex items-center justify-center text-[11px] font-bold" style={{background:'conic-gradient(from 0deg, #4285F4, #34A853, #FBBC05, #EA4335)'}}>G</span>
                {googleLoading ? 'กำลังเปิด Google...' : 'เข้าสู่ระบบด้วย Google'}
              </button>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200"/><span className="text-[11px] text-slate-400">หรือ</span><div className="flex-1 h-px bg-slate-200"/>
              </div>

              {/* Email / Password */}
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">อีเมล</label>
                  <input value={form.email} onChange={e=> setForm({...form, email:e.target.value})} placeholder="you@example.com" type="email" autoComplete="email" className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-navy/20" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">รหัสผ่าน</label>
                  <div className="relative">
                    <input value={form.password} onChange={e=> setForm({...form, password:e.target.value})} type={showPass ? 'text' : 'password'} placeholder="••••••••" autoComplete="current-password" className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-navy/20" />
                    <button type="button" onClick={()=> setShowPass(!showPass)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] px-2 py-1 rounded-full bg-slate-100">{showPass ? 'ซ่อน' : 'ดู'}</button>
                  </div>
                </div>
                <button disabled={loading || googleLoading} className="w-full py-2.5 rounded-full bg-navy text-white text-sm font-semibold disabled:opacity-50">
                  {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
                </button>
              </form>

              <div className="flex justify-between text-xs">
                <Link href="/register" className="text-navy underline">สมัครสมาชิก</Link>
                <Link href="/forgot-password" className="text-slate-500 hover:text-navy">ลืมรหัสผ่าน?</Link>
              </div>

              {msg && <div className={`p-2.5 rounded-xl border text-xs ${msgType==='ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-red-50 border-red-200 text-red-800'}`}>{msg}</div>}

              <div className="text-[11px] text-slate-400 text-center leading-relaxed">
                เข้าสู่ระบบ = ยอมรับเงื่อนไขการใช้งาน · บัญชีถูกระงับจะเข้าไม่ได้ (SUSPENDED/RESIGNED)
              </div>
            </div>

            <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-900">
              ทดสอบ: อีเมล/รหัสผ่านตรวจกับ Postgres + Firebase Auth · Google ตรวจ <code>email_verified</code> และกันการเชื่อมบัญชีผิดคน
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
