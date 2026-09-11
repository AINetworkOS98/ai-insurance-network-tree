'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Header from '@/components/Header';
import Link from 'next/link';

function RegisterInner(){
  const sp = useSearchParams();
  const refFromUrl = sp.get('ref')?.trim().toUpperCase() || '';
  const [ref, setRef] = useState(refFromUrl);
  const [sponsor, setSponsor] = useState<any>(null);
  const [refError, setRefError] = useState('');
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', phone:'', password:'', confirm:'' });
  const [msg, setMsg] = useState('');

  useEffect(()=>{ if(refFromUrl) verify(refFromUrl); }, [refFromUrl]);

  async function verify(code:string){
    if(!code) { setSponsor(null); setRefError(''); return; }
    try{
      const res = await fetch(`/api/referral/verify?code=${encodeURIComponent(code)}`);
      const data = await res.json();
      if(data.ok && data.valid){ setSponsor(data.sponsor); setRefError(''); }
      else { setSponsor(null); setRefError(data.error || 'รหัสไม่ถูกต้อง'); }
    }catch{ setRefError('ตรวจสอบไม่สำเร็จ'); }
  }

  async function submit(){
    if(form.password.length < 8){ setMsg('รหัสผ่านต้องมีอย่างน้อย 8 อักขระ'); return; }
    if(form.password !== form.confirm){ setMsg('ยืนยันรหัสผ่านไม่ตรงกัน'); return; }
    setLoading(true); setMsg('');
    try{
      const res = await fetch('/api/auth/register', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ ...form, referralCode: ref.trim().toUpperCase() || undefined })
      });
      const data = await res.json();
      if(data.ok){
        setMsg(data.sponsorError ? `สมัครสำเร็จ — ${data.sponsorError}` : 'สมัครสำเร็จ — กรุณายืนยันอีเมลภายใน 24 ชั่วโมง');
      } else setMsg(data.error || 'สมัครไม่สำเร็จ');
    }catch{ setMsg('เกิดข้อผิดพลาด'); }
    setLoading(false);
  }

  return (
    <div>
      <Header/>
      <div className="max-w-[560px] mx-auto p-6">
        <div className="card p-6">
          <h1 className="text-xl font-bold text-navy">สมัครแสดงความสนใจ</h1>
          <p className="text-xs text-slate-500 mt-1">ทุกคนเริ่มที่ผู้สนใจทั่วไป — ไม่ให้เลือกตำแหน่งเอง</p>

          {/* ผู้แนะนำ */}
          <div className="mt-4 p-3 rounded-xl border bg-amber-50">
            <div className="text-xs font-semibold">รหัสผู้แนะนำ (ถ้ามี)</div>
            <div className="flex gap-2 mt-1">
              <input value={ref} onChange={e=> setRef(e.target.value.toUpperCase())} onBlur={()=> verify(ref.trim().toUpperCase())} placeholder="เช่น R-ABC123" className="flex-1 border rounded-xl px-3 py-2 text-sm" />
              <button onClick={()=> verify(ref.trim().toUpperCase())} className="px-4 py-2 rounded-xl bg-navy text-white text-xs">ตรวจสอบ</button>
            </div>
            {sponsor && <div className="text-xs text-emerald-700 mt-2">✓ ผู้แนะนำ: {sponsor.displayName} ({sponsor.memberCode})</div>}
            {refError && <div className="text-xs text-red-600 mt-2">✗ {refError} — หากไม่มีรหัส จะเข้าสู่คิวรอมอบหมาย (ไม่สุ่มอ้างชื่อ)</div>}
            {!sponsor && !refError && !ref && <div className="text-[11px] text-slate-500 mt-2">หากไม่มีรหัส จะเข้าสู่คิวรอมอบหมายที่ระบุชัด — ห้ามสุ่มอ้างชื่อบุคคล</div>}
          </div>

          <div className="mt-4 grid md:grid-cols-2 gap-3">
            <input placeholder="ชื่อ" value={form.firstName} onChange={e=> setForm({...form, firstName:e.target.value})} className="border rounded-xl px-3 py-2.5 text-sm" />
            <input placeholder="นามสกุล" value={form.lastName} onChange={e=> setForm({...form, lastName:e.target.value})} className="border rounded-xl px-3 py-2.5 text-sm" />
            <input placeholder="อีเมล" value={form.email} onChange={e=> setForm({...form, email:e.target.value})} className="border rounded-xl px-3 py-2.5 text-sm" />
            <input placeholder="เบอร์โทร" value={form.phone} onChange={e=> setForm({...form, phone:e.target.value})} className="border rounded-xl px-3 py-2.5 text-sm" />
            <input placeholder="รหัสผ่าน (≥8 อักขระ)" type="password" value={form.password} onChange={e=> setForm({...form, password:e.target.value})} className="border rounded-xl px-3 py-2.5 text-sm" />
            <input placeholder="ยืนยันรหัสผ่าน" type="password" value={form.confirm} onChange={e=> setForm({...form, confirm:e.target.value})} className="border rounded-xl px-3 py-2.5 text-sm" />
          </div>

          <label className="flex items-center gap-2 mt-3 text-xs"><input type="checkbox" defaultChecked /> ยอมรับเงื่อนไขการใช้งานและ PDPA (เก็บเวอร์ชันและเวลายินยอม)</label>

          <button onClick={submit} disabled={loading} className="w-full mt-4 py-2.5 rounded-full bg-[#c8a84e] text-[#0f2040] font-semibold disabled:opacity-50">
            {loading ? 'กำลังสมัคร...' : 'สมัคร — สร้างบัญชี'}
          </button>
          {msg && <div className="mt-3 text-xs text-center p-2 rounded-xl bg-slate-50 border">{msg}</div>}

          <div className="mt-4 text-center text-xs">
            <Link href="/login" className="text-navy underline">มีบัญชีแล้ว — เข้าสู่ระบบ</Link>
            <span className="mx-2 text-slate-300">|</span>
            <Link href="/referral" className="text-navy underline">ดูรหัสแนะนำของฉัน</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage(){
  return <Suspense fallback={<div className="p-6 text-sm">กำลังโหลด...</div>}><RegisterInner/></Suspense>;
}
