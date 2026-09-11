'use client';
import { useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

export default function ForgotPasswordPage(){
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirm, setConfirm] = useState('');
  const [step, setStep] = useState<'request'|'reset'>('request');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  async function request(){
    if(!email){ setMsg('กรุณากรอกอีเมล'); return; }
    setLoading(true); setMsg('');
    const r = await fetch('/api/auth/forgot-password', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ email })});
    const j = await r.json();
    setMsg(j.ok ? 'ส่งลิงก์ตั้งรหัสใหม่แล้ว — ตรวจสอบอีเมล (หรือดู token ในโหมดทดสอบ)' : j.error);
    if(j.ok && j.token) { setToken(j.token); setStep('reset'); }
    else if(j.ok) setStep('reset');
    setLoading(false);
  }
  async function reset(){
    if(newPass.length < 8){ setMsg('รหัสผ่านอย่างน้อย 8 ตัวอักษร'); return; }
    if(newPass !== confirm){ setMsg('รหัสผ่านไม่ตรงกัน'); return; }
    if(!token){ setMsg('ต้องมี token จากอีเมล'); return; }
    setLoading(true); setMsg('');
    const r = await fetch('/api/auth/reset-password', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token, password: newPass })});
    const j = await r.json();
    setMsg(j.ok ? 'ตั้งรหัสผ่านใหม่สำเร็จ — ไปเข้าสู่ระบบได้เลย' : j.error);
    setLoading(false);
    if(j.ok) setTimeout(()=> location.href='/login', 1200);
  }

  return (
    <div>
      <Header/>
      <div className="flex max-w-[1280px] mx-auto">
        <Sidebar/>
        <main className="flex-1 p-6 flex justify-center">
          <div className="w-full max-w-[420px]">
            <h1 className="text-xl font-bold text-navy">ลืมรหัสผ่าน / ตั้งรหัสใหม่</h1>
            <p className="text-xs text-slate-500 mt-1">ยืนยันอีเมล → ตั้งรหัสใหม่ → session เก่าทั้งหมดถูกยกเลิก</p>
            <div className="card p-5 mt-4 space-y-3">
              {step==='request' ? (
                <>
                  <input value={email} onChange={e=> setEmail(e.target.value)} placeholder="อีเมลที่ลงทะเบียน" type="email" className="w-full px-3 py-2.5 rounded-xl border text-sm" />
                  <button onClick={request} disabled={loading} className="w-full py-2.5 rounded-full bg-navy text-white text-sm disabled:opacity-50">{loading ? 'กำลังส่ง...' : 'ส่งลิงก์ตั้งรหัสใหม่'}</button>
                </>
              ) : (
                <>
                  <input value={token} onChange={e=> setToken(e.target.value)} placeholder="วาง token จากอีเมล" className="w-full px-3 py-2 rounded-xl border text-sm font-mono text-xs" />
                  <input value={newPass} onChange={e=> setNewPass(e.target.value)} type="password" placeholder="รหัสผ่านใหม่ (≥8 ตัว)" className="w-full px-3 py-2.5 rounded-xl border text-sm" />
                  <input value={confirm} onChange={e=> setConfirm(e.target.value)} type="password" placeholder="ยืนยันรหัสผ่านใหม่" className="w-full px-3 py-2.5 rounded-xl border text-sm" />
                  <button onClick={reset} disabled={loading} className="w-full py-2.5 rounded-full bg-navy text-white text-sm disabled:opacity-50">{loading ? 'กำลังตั้งค่า...' : 'ตั้งรหัสผ่านใหม่'}</button>
                  <button onClick={()=> setStep('request')} className="w-full text-xs text-slate-500">← กลับไปขอใหม่</button>
                </>
              )}
              {msg && <div className="p-2.5 rounded-xl bg-amber-50 border text-xs">{msg}</div>}
              <Link href="/login" className="block text-center text-xs text-navy underline">กลับไปเข้าสู่ระบบ</Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
