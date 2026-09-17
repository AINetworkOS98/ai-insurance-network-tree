'use client';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Kanban from '@/components/Kanban';
import { useEffect, useState, useRef } from 'react';

export default function Prospects(){
  const [prospects, setProspects]=useState<any[]>([]);
  const [q, setQ]=useState('');
  const [statusQ, setStatusQ]=useState('');
  const [showAdd, setShowAdd]=useState(false);
  const [form, setForm]=useState({ firstName:'', lastName:'', phone:'', email:'', province:'' });
  const [msg, setMsg]=useState('');
  const [importMsg, setImportMsg]=useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function load(){
    const j = await fetch('/api/prospects',{cache:'no-store'}).then(r=>r.json()).catch(()=>({prospects:[]}));
    setProspects(j.prospects||[]);
  }
  useEffect(()=>{ load(); },[]);

  const filtered = prospects.filter((p:any)=>{
    if(statusQ && String(p.status).toUpperCase() !== statusQ.toUpperCase()) return false;
    if(q){ const s=q.toLowerCase(); const hay = `${p.name||''} ${p.email||''} ${p.phone||''}`.toLowerCase(); if(!hay.includes(s)) return false; }
    return true;
  });

  async function addProspect(){
    setMsg('');
    if(!form.firstName.trim() || !form.lastName.trim()){ setMsg('กรุณากรอกชื่อและนามสกุล'); return; }
    const res = await fetch('/api/prospects', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) }).catch(()=>null);
    const j = res ? await res.json().catch(()=>({ok:false})) : {ok:false};
    if(j.ok){ setMsg('เพิ่มผู้สนใจแล้ว'); setShowAdd(false); setForm({ firstName:'', lastName:'', phone:'', email:'', province:'' }); load(); }
    else setMsg(j.error || 'เพิ่มไม่สำเร็จ');
  }

  // นำเข้า CSV (และ xlsx ผ่าน parsing พื้นฐานถ้าเป็นข้อความ) — batch POST
  async function handleImport(file: File){
    setImportMsg('กำลังนำเข้า...');
    try{
      const text = await file.text().catch(()=> '');
      if(!text.trim()){ setImportMsg('อ่านไฟล์ไม่ได้ — ใช้ .csv (เข้ารหัส UTF-8)'); return; }
      const lines = text.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
      if(lines.length < 2){ setImportMsg('ไฟล์ต้องมีแถวหัว + ข้อมูลอย่างน้อย 1 แถว'); return; }
      // แยกคอลัมน์ (รองรับ , ; | และ tab)
      const delim = text.includes('\t') ? '\t' : text.includes(';') ? ';' : text.includes('|') ? '|' : ',';
      const parseLine = (l:string)=> l.split(delim).map(s=> s.replace(/^"|"$/g,'').trim());
      const header = parseLine(lines[0]).map(h=> h.toLowerCase());
      const col = (name:string)=> header.findIndex(h=> h.includes(name));
      const iFirst = Math.max(col('first'), col('ชื่อ'), 0);
      const iLast = Math.max(col('last'), col('นามสกุล'), 1);
      const iPhone = Math.max(col('phone'), col('โทร'), col('เบอร์'));
      const iEmail = Math.max(col('email'), col('อีเมล'));
      const iProv = Math.max(col('province'), col('จังหวัด'));
      let ok=0, fail=0;
      for(const line of lines.slice(1)){
        const c = parseLine(line);
        const firstName = (c[iFirst]||'').trim();
        const lastName = (c[iLast]||'').trim();
        if(!firstName && !lastName){ fail++; continue; }
        const payload:any = { firstName: firstName || '-', lastName: lastName || '-', phone: iPhone>=0?c[iPhone]||'':'', email: iEmail>=0?c[iEmail]||'':'', province: iProv>=0?c[iProv]||'':'' };
        const res = await fetch('/api/prospects', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify(payload) }).catch(()=>null);
        if(res?.ok) ok++; else fail++;
      }
      setImportMsg(`นำเข้าเสร็จ — สำเร็จ ${ok} รายการ${fail?` • ข้าม ${fail} รายการ`:''}`);
      load();
    }catch(e:any){ setImportMsg('นำเข้าไม่สำเร็จ — '+(e?.message||'error')); }
  }

  const by = (s:string)=> prospects.filter((p:any)=> p.status===s).length;
  const inp = "w-full px-3 py-2 rounded-xl border text-sm";

  return (
    <div>
      <Header/>
      <div className="flex w-full">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-6">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-[#475569]">ผู้สนใจ (Prospect CRM)</h1>
            {prospects.length===0 && <span className="text-xs px-2 py-1 rounded-full border bg-white text-slate-500">ไม่มีข้อมูลปลอม — แสดงเฉพาะข้อมูลจริงจาก DB</span>}
            <button onClick={()=>{ setShowAdd(true); setMsg(''); }} className="ml-auto px-4 py-2 rounded-full bg-[#475569] text-white text-sm">+ เพิ่มผู้สนใจ</button>
            <button onClick={()=> fileRef.current?.click()} className="px-4 py-2 rounded-full border bg-white text-sm">นำเข้า CSV/Excel</button>
            <input ref={fileRef} type="file" accept=".csv,.txt,.xlsx,.xls" className="hidden" onChange={e=>{ const f=e.target.files?.[0]; if(f) handleImport(f); e.target.value=''; }} />
          </div>

          {importMsg && <div className="p-3 rounded-xl bg-amber-50 border text-xs">{importMsg}</div>}

          <div className="card p-4">
            <div className="flex gap-2 text-sm mb-3 flex-wrap">
              <input placeholder="ค้นหาชื่อ อีเมล เบอร์โทร" value={q} onChange={e=> setQ(e.target.value)} className="flex-1 min-w-[200px] border rounded-xl px-3 py-2"/>
              <select value={statusQ} onChange={e=> setStatusQ(e.target.value)} className="border rounded-xl px-3 py-2 text-sm"><option value="">ทุกสถานะ</option><option>NEW</option><option>APPOINTMENT</option><option>FOLLOW_UP</option><option>CONVERTED</option><option>PENDING_REVIEW</option></select>
              <button onClick={()=>{ setQ(''); setStatusQ(''); }} className="px-4 py-2 rounded-xl border bg-white text-sm">ล้างตัวกรอง</button>
            </div>
            <div className="text-xs text-slate-500 mb-3">ผู้สนใจยังไม่ถือเป็นสมาชิกและไม่อยู่ในต้นไม้ฐาน 5 คน • แปลงเป็นสมาชิกต้องผ่าน OTP + เอกสาร + Admin อนุมัติ • ไม่แสดงข้อมูลปลอม</div>
            <Kanban prospects={filtered}/>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="card p-4">
              <div className="text-sm font-semibold">ปฏิทินนัดหมาย</div>
              <div className="mt-2 text-xs space-y-1">
                {prospects.length===0
                  ? <div className="p-3 rounded-lg bg-slate-50 border text-slate-500 text-center">— ยังไม่มีนัดหมาย —</div>
                  : prospects.slice(0,2).map((p:any)=>(<div key={p.id} className="p-2 rounded-lg bg-violet-50 border truncate">{p.id} — {p.name}</div>))}
              </div>
            </div>
            <div className="card p-4">
              <div className="text-sm font-semibold">รายการติดตาม</div>
              <div className="mt-2 text-xs text-slate-600">
                {prospects.length===0
                  ? <div className="text-slate-500">— ยังไม่มีรายการติดตาม —</div>
                  : prospects.filter((p:any)=> p.status==='FOLLOW_UP').slice(0,3).map((p:any)=>(<div key={p.id}>• {p.id} {p.name}</div>))}
              </div>
            </div>
            <div className="card p-4">
              <div className="text-sm font-semibold">Dashboard สรุปผล</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-slate-50 border p-3">ใหม่ {by('NEW')}</div><div className="rounded-xl bg-emerald-50 border p-3">Converted {by('CONVERTED')}</div>
                <div className="rounded-xl bg-sky-50 border p-3">นัดหมาย {by('APPOINTMENT')}</div><div className="rounded-xl bg-amber-50 border p-3">Follow-up {by('FOLLOW_UP')}</div>
              </div>
              {prospects.length===0 && <div className="text-[11px] text-slate-400 mt-2">ศูนย์ทั้งหมด — จะนับเมื่อมีข้อมูลจริง</div>}
            </div>
          </div>
        </main>
      </div>

      {/* Modal เพิ่มผู้สนใจ */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={()=> setShowAdd(false)}>
          <div className="bg-white rounded-2xl border shadow-xl w-full max-w-md p-5 space-y-3" onClick={e=> e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-slate-800">เพิ่มผู้สนใจ</h3>
              <button onClick={()=> setShowAdd(false)} className="w-8 h-8 rounded-full border flex items-center justify-center text-slate-500 hover:bg-slate-50">×</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input placeholder="ชื่อ *" value={form.firstName} onChange={e=> setForm({...form, firstName:e.target.value})} className={inp}/>
              <input placeholder="นามสกุล *" value={form.lastName} onChange={e=> setForm({...form, lastName:e.target.value})} className={inp}/>
            </div>
            <input placeholder="เบอร์โทร" value={form.phone} onChange={e=> setForm({...form, phone:e.target.value})} className={inp}/>
            <input placeholder="อีเมล" value={form.email} onChange={e=> setForm({...form, email:e.target.value})} className={inp}/>
            <input placeholder="จังหวัด" value={form.province} onChange={e=> setForm({...form, province:e.target.value})} className={inp}/>
            {msg && <div className="p-2 rounded-xl bg-amber-50 border text-xs">{msg}</div>}
            <div className="flex gap-2 justify-end">
              <button onClick={()=> setShowAdd(false)} className="px-4 py-2 rounded-full border text-sm">ยกเลิก</button>
              <button onClick={addProspect} className="px-5 py-2 rounded-full bg-[#475569] text-white text-sm">บันทึก</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
