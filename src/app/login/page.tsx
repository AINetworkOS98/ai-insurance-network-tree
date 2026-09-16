'use client';
import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { auth, firebaseConfigError } from '@/lib/firebase-client';
import { GoogleAuthProvider, FacebookAuthProvider, GithubAuthProvider, signInWithPopup } from 'firebase/auth';

export const dynamic = 'force-dynamic';

type Provider = 'google' | 'facebook' | 'github' | 'tiktok';
type MsgType = 'ok' | 'err' | '';

function safeNext(v: string | null): string {
  if(!v) return '/';
  if(!v.startsWith('/')) return '/';
  if(v.startsWith('//')) return '/';
  if(v.startsWith('/login') || v.startsWith('/register')) return '/';
  return v;
}

export default function LoginPage(){
  return <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-slate-400">กำลังโหลด...</div>}><LoginInner/></Suspense>;
}
function LoginInner(){
  const searchParams = useSearchParams();
  const nextParam = safeNext(searchParams.get('next'));
  const errorParam = searchParams.get('error');

  const [form, setForm] = useState({ email:'', password:'' });
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<MsgType>('');
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<Provider | null>(null);
  const [showPass, setShowPass] = useState(false);

  useEffect(()=>{
    if(errorParam==='suspended'){
      setMsg('บัญชีถูกระงับสิทธิ กรุณาติดต่อผู้ดูแลระบบ');
      setMsgType('err');
    } else if(errorParam){
      const m = String(errorParam);
      if(m.includes('redirect_uri_mismatch')) setMsg('Google OAuth ยังไม่ได้เพิ่ม redirect URI — แจ้งผู้ดูแลเพิ่ม https://ai-insurance-network-tree.vercel.app/auth/callback ใน Google Cloud Console → Credentials → OAuth 2.0 Client');
      else if(m==='google_failed' || m.includes('google')) setMsg('เข้าสู่ระบบด้วย Google ไม่สำเร็จ — ลองใหม่หรือใช้อีเมล/รหัสผ่าน');
      else if(m!=='null' && m!=='') { setMsg(decodeURIComponent(m)); setMsgType('err'); }
      if(m) setMsgType('err');
    }
  },[errorParam]);

  async function submit(e:any){
    e.preventDefault();
    if(!form.email || !form.password){ setMsg('กรุณากรอกอีเมลและรหัสผ่าน'); setMsgType('err'); return; }
    setLoading(true); setMsg('');
    try{
      const res = await fetch('/api/auth/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form)});
      const j = await res.json();
      if(j.ok){
        setMsg('เข้าสู่ระบบสำเร็จ — กำลังพาไปหน้าปลายทาง'); setMsgType('ok');
        setTimeout(()=> location.href=nextParam, 600);
      } else { setMsg(j.error || 'เข้าสู่ระบบไม่สำเร็จ'); setMsgType('err'); }
    }catch{ setMsg('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'); setMsgType('err');}
    setLoading(false);
  }

  async function loginSocial(provider: Provider){
    if(provider==='tiktok'){
      setSocialLoading('tiktok'); setMsg('');
      try{
        const res = await fetch('/api/auth/tiktok', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'init' }) });
        const j = await res.json();
        if(j.url){ location.href = j.url; return; }
        setMsg(j.error || 'TikTok Login ยังไม่ได้ตั้งค่า — กรุณาใช้อีเมล/ Google / Facebook / GitHub ก่อน');
        setMsgType('err');
      }catch(e:any){ setMsg('TikTok Login ไม่พร้อมใช้งาน — ลองวิธีอื่นก่อน'); setMsgType('err'); }
      setSocialLoading(null);
      return;
    }
    setSocialLoading(provider); setMsg('');
    // Google: ใช้ server-side OAuth ตรง ไม่ผ่าน Firebase popup
    // (กัน auth/unauthorized-domain ถาวร — ไม่ต้องเพิ่ม domain ใน Firebase Console)
    if(provider==='google'){
      location.href = `/api/auth/google?next=${encodeURIComponent(nextParam)}`;
      return;
    }
    // ถ้า Firebase ยังไม่พร้อม ให้ใช้ server-side redirect แทน popup
    const useServerGoogle = firebaseConfigError || !auth;
    if(useServerGoogle){
      location.href = `/api/auth/google?next=${encodeURIComponent(nextParam)}`;
      return;
    }
    try{
      if(firebaseConfigError || !auth) throw new Error('Firebase ยังไม่ได้ตั้งค่า Web API Key — กำลังพาไปวิธีสำรอง');
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
      const res = await fetch('/api/auth/google', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ idToken })});
      const j = await res.json();
      if(j.ok){
        const label = provider==='google'?'Google':provider==='facebook'?'Facebook':'GitHub';
        setMsg(`เข้าสู่ระบบด้วย ${label} สำเร็จ`); setMsgType('ok');
        setTimeout(()=> location.href=nextParam, 600);
      } else { setMsg(j.error || `เข้าสู่ระบบด้วย ${provider} ไม่สำเร็จ`); setMsgType('err'); }
    }catch(e:any){
      const code = e?.code || '';
      // Firebase popup ล้มเหลว (key/domain) ให้ fallback ไป server-side redirect อัตโนมัติ
      if(code==='auth/api-key-not-valid' || code==='auth/unauthorized-domain' || code==='auth/operation-not-allowed'){
        location.href = `/api/auth/google?next=${encodeURIComponent(nextParam)}`;
        return;
      }
      if(code==='auth/popup-closed-by-user') setMsg('ปิดหน้าต่างก่อนเสร็จ');
      else if(code==='auth/cancelled-popup-request') setMsg('คำขอยกเลิก — ลองใหม่');
      else if(code==='auth/account-exists-with-different-credential') setMsg('อีเมลนี้เคยสมัครด้วยวิธีอื่น — กรุณาใช้อีเมล/รหัสผ่านเดิมแล้วเชื่อมบัญชีในตั้งค่า');
      else if(code==='auth/operation-not-allowed') setMsg('ผู้ดูแลยังไม่ได้เปิดใช้งานผู้ให้บริการนี้ใน Firebase Console');
      else setMsg(e?.message || `เข้าสู่ระบบด้วย ${provider} ไม่สำเร็จ`);
      setMsgType('err');
    }
    setSocialLoading(null);
  }

  const btnBase = "w-full py-2.5 rounded-xl border text-[13px] font-medium flex items-center justify-center gap-2.5 disabled:opacity-50 transition-all shadow-sm hover:shadow hover:-translate-y-[1px] active:translate-y-0";
  const providerBtns: {id:Provider,label:string,style:string,icon:string,iconStyle:string}[] = [
    {id:'google', label:'ดำเนินการต่อด้วย Google', style:'bg-white border-[#e8eef5] hover:bg-[#f8fafc] text-slate-700', icon:'G', iconStyle:'bg-white border border-slate-200 text-slate-600 shadow-sm'},
    {id:'facebook', label:'ดำเนินการต่อด้วย Facebook', style:'bg-[#f0f7ff] border-[#dbeafe] hover:bg-[#e8f0ff] text-[#2563eb]', icon:'f', iconStyle:'bg-white text-[#1877F2] shadow-sm'},
    {id:'github', label:'ดำเนินการต่อด้วย GitHub', style:'bg-[#f8fafc] border-[#e2e8f0] hover:bg-[#f1f5f9] text-slate-700', icon:'⌁', iconStyle:'bg-slate-800 text-white shadow-sm'},
    {id:'tiktok', label:'ดำเนินการต่อด้วย TikTok', style:'bg-[#fdf2f8] border-[#fce7f3] hover:bg-[#fce7f3] text-[#be185d]', icon:'♪', iconStyle:'bg-[#ec4899] text-white shadow-sm'},
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#f8fafc] via-[#f0f7ff] to-[#fdf2f8] flex flex-col">
      {/* Top bar minimal */}
      <div className="h-[56px] flex items-center justify-between px-4 md:px-8">
        <Link href="/" className="flex items-center gap-2.5">
          <img src="/logo.png" alt="AI Insurance" className="h-8 w-auto bg-white rounded-xl border border-slate-200 object-contain p-1 shadow-sm"/>
          <span className="text-sm font-bold text-slate-800 hidden sm:inline">AI Insurance Network Tree</span>
        </Link>
        <Link href="/" className="text-xs text-slate-500 hover:text-slate-700">กลับหน้าแรก →</Link>
      </div>

      <div className="flex-1 flex items-center justify-center p-3 md:p-4">
        <div className="w-full max-w-[820px] grid md:grid-cols-[1.05fr_1fr] gap-0 rounded-2xl overflow-hidden bg-white shadow-[0_16px_40px_-16px_rgba(71,85,105,0.18)] border border-white">
          {/* Left — Branding / Invite — ขาวนวลสดใส */}
          <div className="hidden md:flex flex-col justify-between p-6 lg:p-7 bg-gradient-to-br from-[#ffffff] via-[#f8fbff] to-[#eff6ff] relative overflow-hidden border-r border-[#eef3ff]">
            <div className="absolute inset-0">
              <div className="absolute -top-14 -right-10 w-72 h-72 rounded-full bg-[#dbeafe]/40 blur-3xl"/>
              <div className="absolute -bottom-16 -left-8 w-80 h-80 rounded-full bg-[#e0f2fe]/35 blur-3xl"/>
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] rounded-full bg-white/70 blur-2xl"/>
            </div>
            <div className="relative">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-[#dbeafe] text-xs text-slate-600 shadow-sm">✦ ระบบค้นหาด้วย AI อัจฉริยะ</div>
              <h1 className="mt-5 text-[24px] font-bold leading-tight text-slate-800">ยินดีต้อนรับกลับ</h1>
              <p className="mt-2.5 text-[13px] text-slate-500 leading-relaxed">เข้าสู่ระบบเพื่อจัดการเครือข่าย ผัง 1 แตก 5 และข้อมูลสมาชิก — ปลอดภัย รวดเร็ว สไตล์สากลที่คุ้นเคย</p>
              <div className="mt-6 space-y-2.5 text-xs text-slate-600">
                <div className="flex items-center gap-2.5"><span className="w-7 h-7 rounded-full bg-white border border-[#dbeafe] text-[#3b82f6] flex items-center justify-center shadow-sm text-[11px]">✓</span> เข้าได้ด้วย Google / Facebook / GitHub / TikTok</div>
                <div className="flex items-center gap-2.5"><span className="w-7 h-7 rounded-full bg-white border border-[#dbeafe] text-[#3b82f6] flex items-center justify-center shadow-sm text-[11px]">✓</span> ผังเครือข่าย 1×5 อัตโนมัติ พร้อม KPI</div>
                <div className="flex items-center gap-2.5"><span className="w-7 h-7 rounded-full bg-white border border-[#dbeafe] text-[#3b82f6] flex items-center justify-center shadow-sm text-[11px]">✓</span> ข้อมูลปลอดภัย เข้ารหัสมาตรฐานสากล</div>
              </div>
            </div>
            <div className="relative text-[11px] text-slate-400">© 2026 AI Insurance Network Tree • ระบบบริหารเครือข่ายตัวแทน</div>
          </div>

          {/* Right — Form */}
          <div className="p-5 md:p-6 lg:p-7 bg-white">
            <div className="md:hidden flex items-center gap-2 mb-3">
              <img src="/logo.png" alt="" className="h-6 w-auto border rounded-lg p-0.5"/>
              <span className="text-sm font-bold text-slate-800">AI Insurance Network Tree</span>
            </div>
            <h2 className="text-[19px] font-bold text-slate-800">เข้าสู่ระบบ</h2>
            <p className="text-xs text-slate-500 mt-1">เลือกวิธีที่สะดวก — นุ่มนวล ปลอดภัย แบบสากล</p>

            <div className="mt-4 flex flex-col gap-2">
              {providerBtns.map(p=>(
                <button key={p.id} onClick={()=> loginSocial(p.id)} disabled={!!socialLoading || loading} className={`${btnBase} ${p.style}`}>
                  <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${p.iconStyle}`}>{p.icon}</span>
                  <span className="flex-1 text-left">{socialLoading===p.id ? 'กำลังเชื่อม...' : p.label}</span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 my-4">
              <div className="flex-1 h-px bg-gradient-to-r from-transparent via-slate-200 to-slate-200"/><span className="text-[11px] tracking-widest text-slate-400 px-2">หรือ อีเมล</span><div className="flex-1 h-px bg-gradient-to-r from-slate-200 via-slate-200 to-transparent"/>
            </div>

            <form onSubmit={submit} className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-slate-700">อีเมล</label>
                <input value={form.email} onChange={e=> setForm({...form, email:e.target.value})} placeholder="you@example.com" type="email" autoComplete="email" className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl border border-[#e8eef5] bg-[#f8fafc] text-sm placeholder:text-slate-400 focus:outline-none focus:border-[#cbd5e1] focus:bg-white focus:ring-4 focus:ring-[#eff6ff] transition" />
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">รหัสผ่าน</label>
                  <Link href="/forgot-password" className="text-[11px] text-slate-500 hover:text-[#475569]">ลืมรหัสผ่าน?</Link>
                </div>
                <div className="relative">
                  <input value={form.password} onChange={e=> setForm({...form, password:e.target.value})} type={showPass ? 'text' : 'password'} placeholder="••••••••" autoComplete="current-password" className="mt-1.5 w-full px-3.5 py-2.5 rounded-xl border border-[#e8eef5] bg-[#f8fafc] text-sm placeholder:text-slate-400 pr-10 focus:outline-none focus:border-[#cbd5e1] focus:bg-white focus:ring-4 focus:ring-[#eff6ff] transition" />
                  <button type="button" onClick={()=> setShowPass(!showPass)} className="absolute right-1 top-1/2 -translate-y-1/2 h-7 px-2.5 rounded-full bg-white border border-slate-200 text-[11px] font-medium text-slate-600 shadow-sm hover:bg-slate-50">{showPass ? 'ซ่อน' : 'ดู'}</button>
                </div>
              </div>
              <button disabled={loading || !!socialLoading} className="w-full py-2.5 rounded-xl bg-[#475569] text-white text-sm font-bold shadow-[0_6px_16px_-8px_rgba(71,85,105,0.6)] hover:bg-slate-800 hover:shadow-lg hover:-translate-y-[1px] active:translate-y-0 disabled:opacity-50 transition-all">
                {loading ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบด้วยอีเมล'}
              </button>
            </form>

            <div className="mt-4 text-center text-xs text-slate-500">
              ยังไม่มีบัญชี?{' '}
              <Link href={`/register${nextParam !== '/' ? `?next=${encodeURIComponent(nextParam)}` : ''}`} className="font-semibold text-[#475569] underline underline-offset-4 hover:text-slate-800">
                ลงทะเบียนด้วยอีเมล
              </Link>
            </div>

            {msg && <div className={`mt-4 p-3 rounded-2xl border text-xs leading-relaxed ${msgType==='ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : msgType==='err' ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'}`}>{msg}</div>}
            {firebaseConfigError && (
              <div className="mt-4 p-4 rounded-2xl border border-amber-200 bg-amber-50 text-xs leading-relaxed text-amber-900">
                <div className="font-bold mb-1">⚠️ ปุ่ม Google/Facebook/GitHub ยังใช้ไม่ได้ — ขาด Firebase Web API Key</div>
                <div>สาเหตุของ <span className="font-mono">auth/api-key-not-valid</span>: โค้ดยังมีคีย์ตัวอย่าง (<span className="font-mono">***</span>) ไม่ใช่คีย์จริงของโปรเจกต์ akarapol798</div>
                <div className="mt-2 font-semibold">วิธีแก้ (ทำครั้งเดียว):</div>
                <ol className="mt-1 ml-4 list-decimal space-y-1">
                  <li>เปิด Firebase Console → Project settings → General → หัวข้อ Your apps → คัดลอก <b>Web API Key</b> (ขึ้นต้น AIza...)</li>
                  <li>รันคำสั่ง: <span className="font-mono bg-white px-1.5 py-0.5 rounded border">npx vercel env add NEXT_PUBLIC_FIREBASE_API_KEY</span> แล้ววางคีย์ (เลือก Production + Preview)</li>
                  <li> redeploy หนึ่งครั้ง — ปุ่ม Social จะใช้งานได้ทันที (อีเมล/รหัสผ่านใช้ได้ตามปกติอยู่แล้ว)</li>
                </ol>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="py-4 text-center text-[11px] text-slate-400">
        <Link href="/privacy" className="hover:underline">นโยบายความเป็นส่วนตัว</Link> • <Link href="/terms" className="hover:underline">ข้อกำหนดการใช้งาน</Link>
      </div>
    </div>
  );
}
