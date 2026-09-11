'use client';
import { useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { auth } from '@/lib/firebase-client';
import { GoogleAuthProvider, FacebookAuthProvider, GithubAuthProvider, OAuthProvider, signInWithPopup } from 'firebase/auth';

type Provider = 'google' | 'facebook' | 'github' | 'tiktok';
type MsgType = 'ok' | 'err' | '';

export default function LoginPage(){
  const [form, setForm] = useState({ email:'', password:'' });
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<MsgType>('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<Provider | null>(null);
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

  async function loginSocial(provider: Provider){
    if(provider==='tiktok'){
      // TikTok: ใช้ OAuth หน้า TikTok โดยตรง — ถ้ายังไม่ได้ตั้ง Client จะแจ้งให้ใช้อีเมลก่อน
      setSocialLoading('tiktok'); setMsg('');
      try{
        const res = await fetch('/api/auth/tiktok', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'init' }) });
        const j = await res.json();
        if(j.url){
          location.href = j.url; // redirect ไป TikTok OAuth
          return;
        }
        // ถ้าไม่มี config ให้แสดงข้อความ
        setMsg(j.error || 'TikTok Login ยังไม่ได้ตั้งค่า — กรุณาใช้อีเมล/ Google / Facebook / GitHub ก่อน');
        setMsgType('err');
      }catch(e:any){ setMsg('TikTok Login ไม่พร้อมใช้งาน — ลองวิธีอื่นก่อน'); setMsgType('err'); }
      setSocialLoading(null);
      return;
    }

    setSocialLoading(provider); setMsg('');
    try{
      if(!auth) throw new Error('Firebase ยังไม่พร้อม');
      let authProvider: any;
      if(provider==='google'){
        authProvider = new GoogleAuthProvider();
        authProvider.setCustomParameters({ prompt:'select_account' });
      }else if(provider==='facebook'){
        authProvider = new FacebookAuthProvider();
        authProvider.setCustomParameters({ display:'popup' });
        authProvider.addScope('email');
      }else if(provider==='github'){
        authProvider = new GithubAuthProvider();
        authProvider.addScope('user:email');
      }
      const cred = await signInWithPopup(auth, authProvider);
      const idToken = await cred.user.getIdToken();
      const res = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ idToken })});
      const j = await res.json();
      if(j.ok){
        const label = provider==='google'?'Google':provider==='facebook'?'Facebook':'GitHub';
        setMsg(`เข้าสู่ระบบด้วย ${label} สำเร็จ`); setMsgType('ok');
        setTimeout(()=> location.href='/', 600);
      } else { setMsg(j.error || `เข้าสู่ระบบด้วย ${provider} ไม่สำเร็จ`); setMsgType('err'); }
    }catch(e:any){
      const code = e?.code || '';
      if(code==='auth/popup-closed-by-user') setMsg('ปิดหน้าต่างก่อนเสร็จ');
      else if(code==='auth/cancelled-popup-request') setMsg('คำขอยกเลิก — ลองใหม่');
      else if(code==='auth/account-exists-with-different-credential') setMsg('อีเมลนี้เคยสมัครด้วยวิธีอื่น — กรุณาใช้อีเมล/รหัสผ่านเดิมแล้วเชื่อมบัญชีในตั้งค่า');
      else if(code==='auth/operation-not-allowed') setMsg('ผู้ดูแลยังไม่ได้เปิดใช้งานผู้ให้บริการนี้ใน Firebase Console');
      else setMsg(e?.message || `เข้าสู่ระบบด้วย ${provider} ไม่สำเร็จ`);
      setMsgType('err');
    }
    setSocialLoading(null);
  }

  const btnBase = "w-full py-2.5 rounded-xl border-2 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition";
  const providerBtns: {id:Provider,label:string,style:string,icon:string}[] = [
    {id:'google', label:'Google', style:'bg-white border-slate-200 hover:bg-slate-50 text-slate-700', icon:'G'},
    {id:'facebook', label:'Facebook', style:'bg-[#1877F2] border-[#1877F2] hover:bg-[#166fe5] text-white', icon:'f'},
    {id:'github', label:'GitHub', style:'bg-[#24292f] border-[#24292f] hover:bg-black text-white', icon:'⌁'},
    {id:'tiktok', label:'TikTok', style:'bg-black border-black hover:bg-zinc-800 text-white', icon:'♪'},
  ];

  return (
    <div>
      <Header/>
      <div className="flex max-w-[1280px] mx-auto">
        <Sidebar/>
        <main className="flex-1 p-6 flex justify-center">
          <div className="w-full max-w-[440px]">
            <h1 className="text-2xl font-bold text-navy">เข้าสู่ระบบ</h1>
            <p className="text-xs text-slate-500 mt-1">เข้าสู่ระบบก่อนใช้งาน — รองรับ Google / Facebook / TikTok / GitHub / อีเมล</p>

            <div className="card p-5 mt-4 space-y-4">
              {/* Social grid */}
              <div className="grid grid-cols-2 gap-2">
                {providerBtns.map(p=>(
                  <button key={p.id} onClick={()=> loginSocial(p.id)} disabled={!!socialLoading || loading} className={`${btnBase} ${p.style}`}>
                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${p.id==='google'?'border bg-white text-slate-700':p.id==='facebook'?'bg-white text-[#1877F2]':'bg-white/15 text-white'}`}>{p.icon}</span>
                    {socialLoading===p.id ? 'กำลังเชื่อม...' : p.label}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 text-center -mt-1">TikTok ต้องตั้งค่า Client Key ใน .env ก่อน (ดูคำแนะนำด้านล่าง)</p>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-slate-200"/><span className="text-[11px] text-slate-400">หรือ อีเมล</span><div className="flex-1 h-px bg-slate-200"/>
              </div>

              {/* Email / Password */}
              <form onSubmit={submit} className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-slate-700">อีเมล</label>
                  <input value={form.email} onChange={e=> setForm({...form, email:e.target.value})} placeholder="you@example.com" type="email" autoComplete="email" className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-navy/20 bg-white" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-slate-700">รหัสผ่าน</label>
                  <div className="relative">
                    <input value={form.password} onChange={e=> setForm({...form, password:e.target.value})} type={showPass ? 'text' : 'password'} placeholder="••••••••" autoComplete="current-password" className="mt-1 w-full px-3 py-2.5 rounded-xl border text-sm pr-10 focus:outline-none focus:ring-2 focus:ring-navy/20 bg-white" />
                    <button type="button" onClick={()=> setShowPass(!showPass)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] px-2 py-1 rounded-full bg-slate-100">{showPass ? 'ซ่อน' : 'ดู'}</button>
                  </div>
                </div>
                <button disabled={loading || !!socialLoading} className="w-full py-2.5 rounded-full bg-navy text-white text-sm font-semibold disabled:opacity-50">
                  {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบด้วยอีเมล'}
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

            <div className="mt-3 p-3 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-blue-900 leading-relaxed">
              <div className="font-semibold">วิธีเปิดใช้งาน Social Login:</div>
              <div className="mt-1 space-y-1 text-slate-700">
                <div><b>Google / Facebook / GitHub</b> → เปิดใน <code>Firebase Console &gt; Authentication &gt; Sign-in method</code> แล้วเพิ่ม provider</div>
                <div><b>TikTok</b> → สมัคร <code>TikTok Developers</code> เอา <code>TIKTOK_CLIENT_KEY</code> / <code>TIKTOK_CLIENT_SECRET</code> ใส่ใน <code>.env</code> แล้วตั้ง Redirect เป็น <code>/api/auth/tiktok</code></div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
