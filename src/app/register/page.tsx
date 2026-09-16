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
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', phone:'', password:'', confirm:'', addressLine:'', zipCode:'', lineId:'', facebookUrl:'', tiktokUrl:'' });
  const [msg, setMsg] = useState('');
  const [autoCodes, setAutoCodes] = useState<{memberCode?:string, referralCode?:string}|null>(null);
  // ที่อยู่ตอนสมัคร (เก็บชื่อจังหวัด/อำเภอ/ตำบล)
  const [provList, setProvList] = useState<any[]>([]);
  const [distList, setDistList] = useState<any[]>([]);
  const [subList, setSubList] = useState<any[]>([]);
  const [addressLoading, setAddressLoading] = useState(true);
  const [addrP, setAddrP] = useState('');
  const [addrD, setAddrD] = useState('');
  const [addrS, setAddrS] = useState('');
  const [provinceQuery, setProvinceQuery] = useState('');
  const [districtQuery, setDistrictQuery] = useState('');
  const [subdistrictQuery, setSubdistrictQuery] = useState('');
  useEffect(()=>{ (async()=>{
    // โหลดข้อมูลที่อยู่ทั้งหมดตั้งแต่เปิดหน้า เพื่อให้ dropdown จังหวัด/อำเภอ/ตำบล
    // พร้อมใช้งานทันทีและคำนวณรหัสไปรษณีย์จากตำบลได้อัตโนมัติ
    try{
      const [provinces, districts, subDistricts] = await Promise.all([
        fetch('/data/provinces.json',{cache:'force-cache'}).then(r=>r.json()),
        fetch('/data/districts.json',{cache:'force-cache'}).then(r=>r.json()),
        fetch('/data/sub_districts.json',{cache:'force-cache'}).then(r=>r.json()),
      ]);
      if(Array.isArray(provinces)) setProvList(provinces.filter((p:any)=>!p.deleted_at));
      if(Array.isArray(districts)) setDistList(districts.filter((d:any)=>!d.deleted_at));
      if(Array.isArray(subDistricts)) setSubList(subDistricts.filter((s:any)=>!s.deleted_at));
    }catch{ setMsg('โหลดข้อมูลจังหวัด/อำเภอ/ตำบลไม่สำเร็จ กรุณารีเฟรชหน้า'); }
    finally{ setAddressLoading(false); }
  })(); },[]);
  const distOpts = addrP ? distList.filter((d:any)=>String(d.province_id)===String(addrP)) : [];
  const subOpts = addrD ? subList.filter((s:any)=>String(s.district_id)===String(addrD)) : [];
  const provinceName = (id:string) => provList.find((p:any)=>String(p.id)===String(id))?.name_th || '';
  const districtName = (id:string) => distList.find((d:any)=>String(d.id)===String(id))?.name_th || '';
  const districtLabel = (d:any) => `${d.name_th} — ${provinceName(d.province_id)}`;
  const subdistrictLabel = (s:any) => `${s.name_th} — ${districtName(s.district_id)} — ${provinceName(distList.find((d:any)=>String(d.id)===String(s.district_id))?.province_id)}`;

  function selectProvince(value:string){
    setProvinceQuery(value);
    const p=provList.find((x:any)=>x.name_th===value);
    if(!p) return;
    setAddrP(String(p.id)); setAddrD(''); setAddrS(''); setDistrictQuery(''); setSubdistrictQuery('');
    setForm(f=>({...f,zipCode:''}));
  }
  function selectDistrict(value:string){
    setDistrictQuery(value);
    const d=distList.find((x:any)=>districtLabel(x)===value);
    if(!d) return;
    setAddrD(String(d.id)); setAddrP(String(d.province_id)); setProvinceQuery(provinceName(d.province_id)); setAddrS(''); setSubdistrictQuery('');
    setForm(f=>({...f,zipCode:''}));
  }
  function selectSubdistrict(value:string){
    setSubdistrictQuery(value);
    const s=subList.find((x:any)=>subdistrictLabel(x)===value);
    if(!s) return;
    const d=distList.find((x:any)=>String(x.id)===String(s.district_id));
    if(!d) return;
    setAddrS(String(s.id)); setAddrD(String(d.id)); setAddrP(String(d.province_id));
    setDistrictQuery(districtLabel(d)); setProvinceQuery(provinceName(d.province_id));
    setForm(f=>({...f,zipCode:String(s.zip_code || '')}));
  }
  // auto zip from tambon
  useEffect(()=>{
    if(addrS && subList){
      const s=subList.find((x:any)=>String(x.id)===addrS);
      if(s?.zip_code) setForm(f=>({...f, zipCode: String(s.zip_code)}));
    }
  },[addrS, subList]);

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
    if(!form.email.trim() || !form.firstName.trim() || !form.lastName.trim()){ setMsg('กรอกชื่อ สกุล อีเมล ให้ครบ'); return; }
    setLoading(true); setMsg(''); setAutoCodes(null);
    const pname = provList.find((p:any)=>String(p.id)===addrP)?.name_th || undefined;
    const dname = distOpts.find((d:any)=>String(d.id)===addrD)?.name_th || undefined;
    const sname = (subOpts.find((s:any)=>String(s.id)===addrS)?.name_th) || undefined;
    try{
      const res = await fetch('/api/auth/register', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ ...form, province:pname, district:dname, subdistrict:sname, referralCode: ref.trim().toUpperCase() || undefined })
      });
      const data = await res.json();
      if(data.ok){
        setMsg(data.sponsorError ? `สมัครสำเร็จ — ${data.sponsorError}` : 'สมัครสำเร็จ — กรุณายืนยันอีเมลภายใน 24 ชั่วโมง');
        if(data.memberCode || data.referralCode) setAutoCodes({ memberCode: data.memberCode, referralCode: data.referralCode });
      } else setMsg(data.error || 'สมัครไม่สำเร็จ');
    }catch{ setMsg('เกิดข้อผิดพลาด'); }
    setLoading(false);
  }

  return (
    <div>
      <Header/>
      <div className="max-w-[640px] mx-auto p-6">
        <div className="card p-6">
          <h1 className="text-xl font-bold text-navy">สมัครแสดงความสนใจ</h1>
          <p className="text-xs text-slate-500 mt-1">ทุกคนเริ่มที่ผู้สนใจทั่วไป — ระบบออกรหัสสมาชิก/รหัสแนะนำอัตโนมัติ</p>

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

          {/* มาตรฐาน: ชื่อ สกุล อีเมล เบอร์โทร */}
          <div className="mt-4 grid md:grid-cols-2 gap-3">
            <input placeholder="ชื่อ *" value={form.firstName} onChange={e=> setForm({...form, firstName:e.target.value})} className="border rounded-xl px-3 py-2.5 text-sm" />
            <input placeholder="นามสกุล *" value={form.lastName} onChange={e=> setForm({...form, lastName:e.target.value})} className="border rounded-xl px-3 py-2.5 text-sm" />
            <input placeholder="อีเมล *" value={form.email} onChange={e=> setForm({...form, email:e.target.value})} className="border rounded-xl px-3 py-2.5 text-sm" />
            <input placeholder="เบอร์โทร *" value={form.phone} onChange={e=> setForm({...form, phone:e.target.value})} className="border rounded-xl px-3 py-2.5 text-sm" />
            <input placeholder="รหัสผ่าน (≥8 อักขระ) *" type="password" value={form.password} onChange={e=> setForm({...form, password:e.target.value})} className="border rounded-xl px-3 py-2.5 text-sm" />
            <input placeholder="ยืนยันรหัสผ่าน *" type="password" value={form.confirm} onChange={e=> setForm({...form, confirm:e.target.value})} className="border rounded-xl px-3 py-2.5 text-sm" />
          </div>

          {/* โซเชียล */}
          <div className="mt-3 grid md:grid-cols-3 gap-3">
            <input placeholder="LINE ID" value={form.lineId} onChange={e=> setForm({...form, lineId:e.target.value})} className="border rounded-xl px-3 py-2.5 text-sm" />
            <input placeholder="Facebook (ลิงก์)" value={form.facebookUrl} onChange={e=> setForm({...form, facebookUrl:e.target.value})} className="border rounded-xl px-3 py-2.5 text-sm" />
            <input placeholder="TikTok (ลิงก์/ID)" value={form.tiktokUrl} onChange={e=> setForm({...form, tiktokUrl:e.target.value})} className="border rounded-xl px-3 py-2.5 text-sm" />
          </div>

          {/* ที่อยู่ มาตรฐาน: บ้านเลขที่ + ตำบล/อำเภอ/จังหวัด + รหัสไปรษณีย์ */}
          <div className="mt-3 grid md:grid-cols-6 gap-3">
            <input placeholder="ที่อยู่: บ้านเลขที่/ถนน" value={form.addressLine} onChange={e=> setForm({...form, addressLine:e.target.value})} className="border rounded-xl px-3 py-2.5 text-sm md:col-span-2" />
            <div className="relative">
              <input list="subdistrict-options" placeholder="ตำบล: พิมพ์ค้นหา" value={subdistrictQuery} disabled={addressLoading} onChange={e=>selectSubdistrict(e.target.value)} className="w-full border rounded-xl px-3 py-2.5 text-sm disabled:opacity-50" />
              <datalist id="subdistrict-options">{subList.map((s:any)=><option key={s.id} value={subdistrictLabel(s)} />)}</datalist>
            </div>
            <div className="relative">
              <input list="district-options" placeholder="เขต/อำเภอ: พิมพ์ค้นหา" value={districtQuery} disabled={addressLoading} onChange={e=>selectDistrict(e.target.value)} className="w-full border rounded-xl px-3 py-2.5 text-sm disabled:opacity-50" />
              <datalist id="district-options">{distList.map((d:any)=><option key={d.id} value={districtLabel(d)} />)}</datalist>
            </div>
            <div className="relative">
              <input list="province-options" placeholder="จังหวัด: พิมพ์ค้นหา" value={provinceQuery} disabled={addressLoading} onChange={e=>selectProvince(e.target.value)} className="w-full border rounded-xl px-3 py-2.5 text-sm disabled:opacity-50" />
              <datalist id="province-options">{provList.map((p:any)=><option key={p.id} value={p.name_th} />)}</datalist>
            </div>
            <input placeholder="ไปรษณีย์" value={form.zipCode} onChange={e=> setForm({...form, zipCode:e.target.value})} inputMode="numeric" maxLength={5} className="border rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <p className="mt-2 text-[11px] text-slate-500">พิมพ์อักษรในช่องตำบล เขต/อำเภอ หรือจังหวัดเพื่อดูตัวเลือกทันที — เลือกตำบลแล้วระบบเติมเขต/อำเภอ จังหวัด และรหัสไปรษณีย์ให้อัตโนมัติ</p>

          <label className="flex items-center gap-2 mt-3 text-xs"><input type="checkbox" defaultChecked /> ยอมรับเงื่อนไขการใช้งานและ PDPA (เก็บเวอร์ชันและเวลายินยอม)</label>

          <button onClick={submit} disabled={loading} className="w-full mt-4 py-2.5 rounded-full bg-[#c8a84e] text-[#475569] font-semibold disabled:opacity-50">
            {loading ? 'กำลังสมัคร...' : 'สมัคร — สร้างบัญชี'}
          </button>
          {msg && <div className="mt-3 text-xs text-center p-2 rounded-xl bg-slate-50 border">{msg}</div>}
          {autoCodes && (
            <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs space-y-1">
              <div className="font-bold text-emerald-800">ระบบออกรหัสอัตโนมัติแล้ว</div>
              {autoCodes.memberCode && <div>รหัสสมาชิก: <span className="font-mono font-bold">{autoCodes.memberCode}</span></div>}
              {autoCodes.referralCode && <div>รหัสแนะนำของคุณ: <span className="font-mono font-bold">{autoCodes.referralCode}</span> — แชร์ให้ผู้อื่นสมัครต่อได้</div>}
            </div>
          )}

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
