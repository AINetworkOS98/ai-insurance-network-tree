'use client';
import { useEffect, useState, useRef, Suspense } from 'react';
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
  const [form, setForm] = useState({ firstName:'', lastName:'', email:'', phone:'', password:'', confirm:'', username:'', nickname:'', addressLine:'', zipCode:'', lineId:'', facebookUrl:'', tiktokUrl:'', birthDate:'', occupation:'', consentPdpa:false, consentMarketing:false });
  const [showPwd, setShowPwd] = useState(false);
  const [showPdpa, setShowPdpa] = useState(false);
  const verifySeq = useRef(0);
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState('');
  const [autoCodes, setAutoCodes] = useState<{memberCode?:string, referralCode?:string, displayName?:string, createdAt?:string}|null>(null);
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
      // กันผลลัพธ์ที่มาช้ากว่าคำขอใหม่ (stale response)
      const seq = ++verifySeq.current;
      try{
        const res = await fetch(`/api/referral/verify?code=${encodeURIComponent(code)}`);
        const data = await res.json();
        if(seq !== verifySeq.current) return;
        if(data.ok && data.valid){ setSponsor(data.sponsor); setRefError(''); }
        else { setSponsor(null); setRefError(data.error || 'รหัสไม่ถูกต้อง'); }
      }catch{ if(seq === verifySeq.current) setRefError('ตรวจสอบไม่สำเร็จ'); }
    }

  async function submit(){
    if(!form.firstName.trim() || !form.lastName.trim()){ setMsg('กรอกชื่อและนามสกุลให้ครบ'); return; }
        if(!form.username.trim() || form.username.trim().length < 4){ setMsg('ชื่อผู้ใช้ต้องมีอย่างน้อย 4 ตัวอักษร'); return; }
        if(!/^[a-zA-Z0-9._-]+$/.test(form.username.trim())){ setMsg('ชื่อผู้ใช้ใช้ได้เฉพาะ a-z 0-9 . _ - เท่านั้น'); return; }
        if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())){ setMsg('อีเมลไม่ถูกต้อง'); return; }
        if(form.password.length < 8){ setMsg('รหัสผ่านต้องมีอย่างน้อย 8 อักขระ'); return; }
        if(form.password !== form.confirm){ setMsg('ยืนยันรหัสผ่านไม่ตรงกัน'); return; }
        if(!form.consentPdpa){ setMsg('กรุณายอมรับนโยบายความเป็นส่วนตัว (PDPA) ก่อนสมัคร'); return; }
        if(loading) return;
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
              setMsg('สมัครสำเร็จ — กรุณายืนยันอีเมลภายใน 24 ชั่วโมง');
              if(data.memberCode || data.referralCode) setAutoCodes({ memberCode:data.memberCode, referralCode:data.referralCode, displayName:data.displayName, createdAt:data.createdAt });
              setForm(f=>({...f, password:'', confirm:''}));
            } else setMsg(data.error || 'สมัครไม่สำเร็จ');
    }catch{ setMsg('เกิดข้อผิดพลาด'); }
    setLoading(false);
  }

  return (
    <div>
      <Header/>
      <div className="w-full p-6">
        <div className="card p-6">
          <h1 className="text-xl font-bold text-navy">สมัครแสดงความสนใจ</h1>
          <p className="text-xs text-slate-500 mt-1">ทุกคนเริ่มที่ผู้สนใจทั่วไป — ระบบออกรหัสสมาชิก/รหัสแนะนำอัตโนมัติ</p>

          {/* ผู้แนะนำ */}
          <div className="mt-4 p-3 rounded-xl border bg-amber-50">
            <div className="text-xs font-semibold">รหัสผู้แนะนำ (ถ้ามี)</div>
            <div className="flex gap-2 mt-1">
              <input value={ref} onChange={e=> setRef(e.target.value.toUpperCase())} onBlur={()=> verify(ref.trim().toUpperCase())} readOnly={!!refFromUrl} title={refFromUrl ? 'รหัสผู้แนะนำถูกล็อกจากลิงก์ที่ได้รับ' : ''} placeholder="เช่น R-ABC123" className={`flex-1 border rounded-xl px-3 py-2 text-sm ${refFromUrl ? 'bg-slate-100 text-slate-500' : ''}`} />
              <button onClick={()=> verify(ref.trim().toUpperCase())} className="px-4 py-2 rounded-xl bg-navy text-white text-xs">ตรวจสอบ</button>
            </div>
            {sponsor && <div className="text-xs text-emerald-700 mt-2">✓ ผู้แนะนำ: {sponsor.displayName} ({sponsor.memberCode})</div>}
            {refError && <div className="text-xs text-red-600 mt-2">✗ {refError} — หากไม่มีรหัส จะเข้าสู่คิวรอมอบหมาย (ไม่สุ่มอ้างชื่อ)</div>}
            {!sponsor && !refError && !ref && <div className="text-[11px] text-slate-500 mt-2">หากไม่มีรหัส จะเข้าสู่คิวรอมอบหมายที่ระบุชัด — ห้ามสุ่มอ้างชื่อบุคคล</div>}
          </div>

          {/* 1) ข้อมูลบัญชี: ชื่อผู้ใช้ ชื่อ-สกุล ชื่อเล่น */}
                    <div className="mt-4 text-xs font-semibold text-slate-700">1) ข้อมูลบัญชีเข้าสู่ระบบ</div>
                    <div className="mt-2 grid md:grid-cols-2 gap-3">
                      <input placeholder="ชื่อผู้ใช้ (username) *" value={form.username} onChange={e=> setForm({...form, username:e.target.value.toLowerCase()})} autoComplete="username" className="border rounded-xl px-3 py-2.5 text-sm" />
                      <input placeholder="ชื่อเล่น (ไม่บังคับ)" value={form.nickname} onChange={e=> setForm({...form, nickname:e.target.value})} className="border rounded-xl px-3 py-2.5 text-sm" />
                      <input placeholder="ชื่อ *" value={form.firstName} onChange={e=> setForm({...form, firstName:e.target.value})} className="border rounded-xl px-3 py-2.5 text-sm" />
                      <input placeholder="นามสกุล *" value={form.lastName} onChange={e=> setForm({...form, lastName:e.target.value})} className="border rounded-xl px-3 py-2.5 text-sm" />
                      <input placeholder="อีเมล *" type="email" value={form.email} onChange={e=> setForm({...form, email:e.target.value})} autoComplete="email" className="border rounded-xl px-3 py-2.5 text-sm" />
                      <input placeholder="เบอร์โทร *" type="tel" value={form.phone} onChange={e=> setForm({...form, phone:e.target.value})} autoComplete="tel" className="border rounded-xl px-3 py-2.5 text-sm" />
                      <div className="relative">
                        <input placeholder="รหัสผ่าน (≥8 อักขระ) *" type={showPwd ? 'text' : 'password'} value={form.password} onChange={e=> setForm({...form, password:e.target.value})} autoComplete="new-password" className="w-full border rounded-xl px-3 py-2.5 pr-14 text-sm" />
                        <button type="button" onClick={()=>setShowPwd(v=>!v)} className="absolute right-2 top-1/2 -translate-y-1/2 text-[11px] text-slate-500 px-2 py-1">{showPwd ? 'ซ่อน' : 'แสดง'}</button>
                      </div>
                      <input placeholder="ยืนยันรหัสผ่าน *" type={showPwd ? 'text' : 'password'} value={form.confirm} onChange={e=> setForm({...form, confirm:e.target.value})} autoComplete="new-password" className="border rounded-xl px-3 py-2.5 text-sm" />
                    </div>
                    {/* ระดับความปลอดภัยรหัสผ่าน */}
                    {form.password.length > 0 && (()=>{
                      const score = (/[a-z]/.test(form.password)?1:0)+(/[A-Z]/.test(form.password)?1:0)+(/\d/.test(form.password)?1:0)+(/[^A-Za-z0-9]/.test(form.password)?1:0)+(form.password.length>=8?1:0);
                      const label = form.password.length<8 ? 'สั้นเกินไป (ต้อง ≥8)' : score<=2 ? 'อ่อน' : score<=3 ? 'ปานกลาง' : score<=4 ? 'ดี' : 'แข็งแรง';
                      const color = form.password.length<8 ? 'bg-red-400' : score<=2 ? 'bg-orange-400' : score<=3 ? 'bg-amber-400' : score<=4 ? 'bg-emerald-400' : 'bg-emerald-600';
                      const width = form.password.length<8 ? '25%' : score<=2 ? '40%' : score<=3 ? '60%' : score<=4 ? '80%' : '100%';
                      return (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-slate-200 overflow-hidden"><div className={`h-full ${color}`} style={{width}}/></div>
                          <span className="text-[11px] text-slate-500 w-28 text-right">รหัสผ่าน: {label}</span>
                        </div>
                      );
                    })()}

          {/* 2) ข้อมูลส่วนตัวและช่องทางติดต่อ */}
                    <div className="mt-5 text-xs font-semibold text-slate-700">2) ข้อมูลส่วนตัวและช่องทางติดต่อ</div>
                    <div className="mt-2 grid md:grid-cols-3 gap-3">
            <input placeholder="LINE ID" value={form.lineId} onChange={e=> setForm({...form, lineId:e.target.value})} className="border rounded-xl px-3 py-2.5 text-sm" />
            <input placeholder="Facebook (ลิงก์)" value={form.facebookUrl} onChange={e=> setForm({...form, facebookUrl:e.target.value})} className="border rounded-xl px-3 py-2.5 text-sm" />
            <input placeholder="TikTok (ลิงก์/ID)" value={form.tiktokUrl} onChange={e=> setForm({...form, tiktokUrl:e.target.value})} className="border rounded-xl px-3 py-2.5 text-sm" />
          </div>
          <div className="mt-3 grid md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 block mb-1">วัน/เดือน/ปีเกิด</label>
              <input type="date" value={form.birthDate} onChange={e=> setForm({...form, birthDate:e.target.value})} className="w-full border rounded-xl px-3 py-2.5 text-sm" />
            </div>
            <div>
              <label className="text-xs text-slate-500 block mb-1">อาชีพ</label>
              <input placeholder="เช่น วิศวกร, ครู, นักธุรกิจ" value={form.occupation} onChange={e=> setForm({...form, occupation:e.target.value})} className="w-full border rounded-xl px-3 py-2.5 text-sm" />
            </div>
          </div>

          {/* 3) ที่อยู่ตามทะเบียนบ้าน */}
                    <div className="mt-5 text-xs font-semibold text-slate-700">3) ที่อยู่ติดต่อ</div>
                    <div className="mt-2 grid md:grid-cols-6 gap-3">
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

          {/* 4) การยินยอม (PDPA) */}
                    <div className="mt-5 text-xs font-semibold text-slate-700">4) การคุ้มครองข้อมูลส่วนบุคคล (PDPA)</div>
                    <div className="mt-2 p-3 rounded-xl border bg-slate-50">
                      <details className="group">
                        <summary className="cursor-pointer text-xs font-semibold text-slate-700 select-none">สรุปประกาศความเป็นส่วนตัว (เวอร์ชัน 1.0) ▾</summary>
              <p className="mt-2 text-[11px] text-slate-600 leading-relaxed">ข้อมูลส่วนบุคคลที่ท่านให้ไว้จะถูกเก็บรวบรวม ใช้ และประมวลผลเท่าที่จำเป็นสำหรับการสมัครสมาชิก การให้บริการ การติดต่อ และการดำเนินการที่เกี่ยวข้องตามวัตถุประสงค์ที่แจ้งไว้ โดยข้อมูลจะได้รับการดูแลตามมาตรการรักษาความปลอดภัยที่เหมาะสม</p>
              <div className="mt-2 space-x-4 text-[11px]">
                              <Link href="/privacy-policy" className="text-navy underline">อ่านนโยบายความเป็นส่วนตัว</Link>
                              <Link href="/privacy-details" className="text-navy underline">รายละเอียดการประมวลผลข้อมูล</Link>
                              <button type="button" onClick={()=>setShowPdpa(true)} className="text-navy underline">เปิดอ่านฉบับเต็ม</button>
                            </div>
                            <p className="mt-2 text-[11px] text-slate-500">ระบบบันทึกการยินยอมพร้อมเวอร์ชัน (1.0) วันเวลา และที่อยู่ IP เพื่อให้คุณและผู้ดูแลระบบตรวจสอบย้อนหลังได้</p>
            </details>
            <label className="flex items-start gap-2 mt-3 text-xs cursor-pointer">
              <input type="checkbox" checked={form.consentPdpa} onChange={e=> setForm({...form, consentPdpa:e.target.checked})} className="mt-0.5" />
              <span>ข้าพเจ้าได้อ่านและรับทราบนโยบายความเป็นส่วนตัว และยินยอมให้เก็บรวบรวม ใช้ และประมวลผลข้อมูลส่วนบุคคลตามรายละเอียดที่แจ้งไว้ <span className="text-red-500">*</span></span>
            </label>
            <label className="flex items-start gap-2 mt-2 text-xs cursor-pointer">
              <input type="checkbox" checked={form.consentMarketing} onChange={e=> setForm({...form, consentMarketing:e.target.checked})} className="mt-0.5" />
              <span>ข้าพเจ้ายินยอมให้ติดต่อเพื่อรับข่าวสาร โปรโมชั่น สิทธิประโยชน์ และข้อมูลเกี่ยวกับผลิตภัณฑ์หรือบริการ (ไม่บังคับ)</span>
            </label>
          </div>

          <button onClick={submit} disabled={loading} className="w-full mt-4 py-2.5 rounded-full bg-[#c8a84e] text-[#475569] font-semibold disabled:opacity-50">
            {loading ? 'กำลังสมัคร...' : 'สมัคร — สร้างบัญชี'}
          </button>
          {msg && <div className="mt-3 text-xs text-center p-2 rounded-xl bg-slate-50 border">{msg}</div>}
          {autoCodes && (
                      <div className="mt-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs space-y-1">
                        <div className="font-bold text-emerald-800">ระบบออกรหัสอัตโนมัติแล้ว</div>
                        {autoCodes.displayName && <div>ชื่อสมาชิก: <span className="font-semibold">{autoCodes.displayName}</span></div>}
                        {autoCodes.memberCode && <div>รหัสสมาชิก: <span className="font-mono font-bold">{autoCodes.memberCode}</span></div>}
                        {autoCodes.referralCode && <div>รหัสผู้แนะนำของคุณ: <span className="font-mono font-bold">{autoCodes.referralCode}</span> — แชร์ให้ผู้อื่นสมัครต่อได้</div>}
                        {autoCodes.createdAt && <div className="text-slate-500">สมัครเมื่อ: {new Date(autoCodes.createdAt).toLocaleString('th-TH')}</div>}
                        {autoCodes.referralCode && (
                          <div className="pt-1">
                            <button type="button" onClick={()=>{ const link = `${typeof window!=='undefined' ? window.location.origin : ''}/register?ref=${autoCodes.referralCode}`; navigator.clipboard?.writeText(link); setCopied(true); setTimeout(()=>setCopied(false), 2000); }} className="px-3 py-1.5 rounded-full bg-white border text-[11px]">{copied ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์เชิญเพื่อน'}</button>
                          </div>
                        )}
                      </div>
                    )}

          {showPdpa && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="ประกาศความเป็นส่วนตัว">
              <div className="absolute inset-0 bg-black/40" onClick={()=>setShowPdpa(false)} />
              <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[85vh] overflow-y-auto p-5">
                <div className="flex items-start justify-between gap-4">
                  <h2 className="text-base font-bold text-navy">ประกาศความเป็นส่วนตัว (PDPA) — เวอร์ชัน 1.0</h2>
                  <button type="button" onClick={()=>setShowPdpa(false)} className="text-slate-400 hover:text-slate-700 text-xl leading-none" aria-label="ปิด">✕</button>
                </div>
                <div className="mt-3 space-y-3 text-xs text-slate-600 leading-relaxed">
                  <p><span className="font-semibold text-slate-700">1. ข้อมูลที่เก็บรวบรวม</span> — ชื่อ นามสกุล ชื่อผู้ใช้ อีเมล เบอร์โทร วันเกิด อาชีพ ที่อยู่ ช่องทางโซเชียล และข้อมูลที่จำเป็นต่อการสมัครและการให้บริการ</p>
                  <p><span className="font-semibold text-slate-700">2. วัตถุประสงค์</span> — เพื่อสร้างบัญชีสมาชิก ยืนยันตัวตน จัดตำแหน่งในผังเครือข่าย คำนวณผลงานและรายได้ แจ้งข่าวสารที่เกี่ยวข้อง และปฏิบัติตามกฎหมายที่ใช้บังคับ</p>
                  <p><span className="font-semibold text-slate-700">3. ฐานทางกฎหมาย</span> — ความยินยอม (สำหรับการตลาด) และความจำเป็นเพื่อปฏิบัติตามสัญญา/กฎหมาย (สำหรับการเป็นสมาชิก)</p>
                  <p><span className="font-semibold text-slate-700">4. การเปิดเผยข้อมูล</span> — ไม่เปิดเผยต่อบุคคลภายนอก เว้นแต่ผู้แนะนำในสายงานเท่าที่จำเป็น ผู้ให้บริการระบบที่ผูกข้อตกลงรักษาความลับ หรือเมื่อกฎหมายกำหนด</p>
                  <p><span className="font-semibold text-slate-700">5. ระยะเวลาจัดเก็บ</span> — ตลอดระยะเวลาที่เป็นสมาชิก และตามระยะเวลาที่กฎหมายกำหนดหลังสิ้นสุดความเป็นสมาชิก</p>
                  <p><span className="font-semibold text-slate-700">6. สิทธิของเจ้าของข้อมูล</span> — เข้าถึง ขอสำเนา แก้ไข ลบ ระงับการใช้ ถอนความยินยอม และร้องเรียน โดยติดต่อผู้ดูแลระบบเพื่อดำเนินการ</p>
                  <p><span className="font-semibold text-slate-700">7. การบันทึกความยินยอม</span> — ระบบบันทึกเวอร์ชันประกาศ (1.0) วันเวลา และที่อยู่ IP ของการยินยอมไว้ในบันทึกความยินยอม ซึ่งตรวจสอบย้อนหลังได้</p>
                  <p><span className="font-semibold text-slate-700">8. การถอนความยินยอม</span> — ถอนความยินยอมด้านการตลาดได้ตลอดเวลา โดยไม่กระทบความเป็นสมาชิกที่ได้ให้ความยินยอมตามสัญญาไว้แล้ว</p>
                </div>
                <div className="mt-4 flex flex-wrap gap-3 text-[11px]">
                  <Link href="/privacy-policy" className="text-navy underline">นโยบายความเป็นส่วนตัวฉบับเต็ม</Link>
                  <Link href="/privacy-details" className="text-navy underline">รายละเอียดการประมวลผลข้อมูล</Link>
                </div>
                <button type="button" onClick={()=>setShowPdpa(false)} className="mt-4 w-full py-2.5 rounded-full bg-[#c8a84e] text-[#475569] font-semibold text-sm">รับทราบ</button>
              </div>
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
