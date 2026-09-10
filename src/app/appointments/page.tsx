'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

type Appt = {
  id: string;
  prospectId: string;
  prospectName?: string;
  title: string;
  startAt: string;
  endAt?: string | null;
  status: string;
  createdAt: string;
};

const STATUS_LABEL: Record<string,string> = {
  scheduled: 'นัดหมายแล้ว',
  completed: 'เสร็จสิ้น',
  cancelled: 'ยกเลิก',
  pending: 'รอยืนยัน',
};

const STATUS_COLOR: Record<string,string> = {
  scheduled: 'bg-sky-50 border-sky-200 text-sky-700',
  completed: 'bg-emerald-50 border-emerald-200 text-emerald-700',
  cancelled: 'bg-rose-50 border-rose-200 text-rose-700',
  pending: 'bg-amber-50 border-amber-200 text-amber-700',
};

export default function AppointmentsPage(){
  const [list, setList] = useState<Appt[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ prospectId:'', title:'', startAt:'', endAt:'' });
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState('');

  async function load(){
    setLoading(true);
    try{
      const r = await fetch('/api/appointments', { cache:'no-store' });
      const j = await r.json();
      setList(j.appointments || j.data || []);
    }catch{
      setList([]);
    }finally{ setLoading(false); }
  }
  useEffect(()=>{ load(); }, []);

  async function create(){
    if(!form.title || !form.startAt){ alert('กรอกชื่อนัดหมายและวันเวลา'); return; }
    setSaving(true);
    try{
      const r = await fetch('/api/appointments', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({
          prospectId: form.prospectId || null,
          title: form.title,
          startAt: new Date(form.startAt).toISOString(),
          endAt: form.endAt ? new Date(form.endAt).toISOString() : null,
          status: 'scheduled',
        })
      });
      const j = await r.json();
      if(!r.ok) throw new Error(j.error || 'สร้างไม่สำเร็จ');
      setShowForm(false);
      setForm({ prospectId:'', title:'', startAt:'', endAt:'' });
      await load();
    }catch(e:any){ alert(e.message); }
    finally{ setSaving(false); }
  }

  async function updateStatus(id:string, status:string){
    try{
      const r = await fetch(`/api/appointments/${id}`,{
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ status })
      });
      if(!r.ok){ const j=await r.json(); throw new Error(j.error||'อัปเดตไม่สำเร็จ'); }
      await load();
    }catch(e:any){ alert(e.message); }
  }
  async function remove(id:string){
    if(!confirm('ลบการนัดหมายนี้?')) return;
    try{
      const r = await fetch(`/api/appointments/${id}`,{ method:'DELETE' });
      if(!r.ok){ const j=await r.json(); throw new Error(j.error||'ลบไม่สำเร็จ'); }
      await load();
    }catch(e:any){ alert(e.message); }
  }

  const filtered = list.filter(a=>{
    if(filter!=='all' && a.status!==filter) return false;
    if(q && !(`${a.title} ${a.prospectName||''} ${a.prospectId}`.toLowerCase().includes(q.toLowerCase()))) return false;
    return true;
  });

  return (
    <div>
      <Header/>
      <div className="flex max-w-[1280px] mx-auto">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold text-[#0f2040]">นัดหมาย ◷</h1>
            <span className="badge-demo">เชื่อม Prospect</span>
            <span className="text-xs text-slate-500 hidden md:inline">จัดการนัดหมาย ติดตาม และเปลี่ยนสถานะ — เชื่อมกับผู้สนใจ (Prospect)</span>
            <button onClick={()=>setShowForm(v=>!v)} className="ml-auto px-4 py-2 rounded-full bg-[#0f2040] text-white text-sm font-semibold">+ สร้างนัดหมาย</button>
            <button onClick={load} className="px-4 py-2 rounded-full border bg-white text-sm">รีเฟรช</button>
          </div>

          {showForm && (
            <div className="card p-5 space-y-3">
              <div className="font-semibold text-sm text-[#0f2040]">สร้างนัดหมายใหม่</div>
              <div className="grid md:grid-cols-2 gap-3">
                <label className="text-sm">หัวข้อ/ชื่อนัดหมาย *
                  <input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder="เช่น นัดแนะนำแผนประกัน" className="mt-1 w-full border rounded-xl px-3 py-2" />
                </label>
                <label className="text-sm">Prospect ID (ถ้ามี)
                  <input value={form.prospectId} onChange={e=>setForm({...form,prospectId:e.target.value})} placeholder="P-XXXXXX หรือเว้นว่าง" className="mt-1 w-full border rounded-xl px-3 py-2" />
                </label>
                <label className="text-sm">เริ่ม *
                  <input type="datetime-local" value={form.startAt} onChange={e=>setForm({...form,startAt:e.target.value})} className="mt-1 w-full border rounded-xl px-3 py-2" />
                </label>
                <label className="text-sm">สิ้นสุด (ถ้ามี)
                  <input type="datetime-local" value={form.endAt} onChange={e=>setForm({...form,endAt:e.target.value})} className="mt-1 w-full border rounded-xl px-3 py-2" />
                </label>
              </div>
              <div className="flex gap-2">
                <button onClick={create} disabled={saving} className="px-5 py-2 rounded-full bg-[#c8a84e] text-[#0f2040] font-semibold text-sm disabled:opacity-50">{saving?'กำลังบันทึก...':'บันทึกนัดหมาย'}</button>
                <button onClick={()=>setShowForm(false)} className="px-5 py-2 rounded-full border bg-white text-sm">ยกเลิก</button>
              </div>
              <p className="text-[11px] text-slate-500">บันทึกแล้วจะแสดงในรายการด้านล่าง • แสดงเฉพาะนัดหมายจริงจาก DB (ไม่มีข้อมูลปลอม)</p>
            </div>
          )}

          <div className="card p-4">
            <div className="flex flex-wrap gap-2 text-sm mb-3">
              <input value={q} onChange={e=>setQ(e.target.value)} placeholder="ค้นหาชื่อ / Prospect / ID" className="flex-1 min-w-[200px] border rounded-xl px-3 py-2" />
              <select value={filter} onChange={e=>setFilter(e.target.value)} className="border rounded-xl px-3 py-2">
                <option value="all">ทุกสถานะ</option>
                <option value="scheduled">นัดหมายแล้ว</option>
                <option value="completed">เสร็จสิ้น</option>
                <option value="cancelled">ยกเลิก</option>
                <option value="pending">รอยืนยัน</option>
              </select>
              <span className="text-xs text-slate-500 self-center">{loading ? 'กำลังโหลด...' : `${filtered.length} รายการ`}</span>
            </div>

            {loading ? (
              <div className="text-sm text-slate-500 py-8 text-center">กำลังโหลดนัดหมาย...</div>
            ) : filtered.length===0 ? (
              <div className="text-sm text-slate-500 py-8 text-center border rounded-xl bg-slate-50">ยังไม่มีนัดหมาย {filter!=='all'?`สถานะ "${STATUS_LABEL[filter]||filter}"`:''} — กด “สร้างนัดหมาย” เพื่อเพิ่ม</div>
            ) : (
              <div className="space-y-2">
                {filtered.map(a=>(
                  <div key={a.id} className="flex flex-wrap items-center gap-3 p-3 rounded-xl border bg-white hover:bg-slate-50">
                    <div className="flex-1 min-w-[220px]">
                      <div className="font-semibold text-sm text-[#0f2040]">{a.title}</div>
                      <div className="text-xs text-slate-500">
                        {new Date(a.startAt).toLocaleString('th-TH',{dateStyle:'medium', timeStyle:'short'})}
                        {a.endAt ? ` → ${new Date(a.endAt).toLocaleString('th-TH',{timeStyle:'short'})}` : ''}
                        {a.prospectName ? ` • ${a.prospectName}` : a.prospectId ? ` • ${a.prospectId}` : ''}
                      </div>
                    </div>
                    <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${STATUS_COLOR[a.status]||'bg-slate-50 border-slate-200'}`}>{STATUS_LABEL[a.status]||a.status}</span>
                    <div className="flex gap-1.5">
                      {a.status!=='completed' && <button onClick={()=>updateStatus(a.id,'completed')} className="px-3 py-1.5 rounded-full bg-emerald-600 text-white text-xs">เสร็จสิ้น</button>}
                      {a.status!=='cancelled' && <button onClick={()=>updateStatus(a.id,'cancelled')} className="px-3 py-1.5 rounded-full bg-white border text-xs">ยกเลิก</button>}
                      {a.status==='cancelled' && <button onClick={()=>updateStatus(a.id,'scheduled')} className="px-3 py-1.5 rounded-full bg-sky-600 text-white text-xs">นัดใหม่</button>}
                      <button onClick={()=>remove(a.id)} className="px-3 py-1.5 rounded-full bg-white border border-rose-200 text-rose-600 text-xs">ลบ</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="text-[11px] text-slate-500 mt-3">API: GET/POST /api/appointments • PATCH/DELETE /api/appointments/[id] — แสดงเฉพาะข้อมูลจริง (ไม่มีข้อมูลปลอม)</div>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="card p-4">
              <div className="text-sm font-semibold">ปฏิทินย่อ</div>
              <div className="mt-2 text-xs space-y-1">
                {filtered.slice(0,3).map(a=>(
                  <div key={a.id} className="p-2 rounded-lg bg-violet-50 border truncate">{new Date(a.startAt).toLocaleDateString('th-TH')} {new Date(a.startAt).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})} — {a.title}</div>
                ))}
                {filtered.length===0 && <div className="text-slate-500">ไม่มีนัดหมาย</div>}
              </div>
            </div>
            <div className="card p-4">
              <div className="text-sm font-semibold">สรุปสถานะ</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-sky-50 border p-3">นัดหมาย {list.filter(x=>x.status==='scheduled').length}</div>
                <div className="rounded-xl bg-emerald-50 border p-3">เสร็จ {list.filter(x=>x.status==='completed').length}</div>
                <div className="rounded-xl bg-rose-50 border p-3">ยกเลิก {list.filter(x=>x.status==='cancelled').length}</div>
                <div className="rounded-xl bg-slate-50 border p-3">ทั้งหมด {list.length}</div>
              </div>
            </div>
            <div className="card p-4">
              <div className="text-sm font-semibold">ทิป</div>
              <div className="text-xs text-slate-600 mt-2 leading-relaxed">นัดหมายเชื่อมกับ Prospect — ใส่ Prospect ID เพื่อโยงใยใน CRM ได้เลย ถ้ายังไม่มี Prospect ก็สร้างนัดหมายเปล่าได้ แล้วค่อยผูกภายหลัง</div>
              <a href="/prospects" className="inline-block mt-2 text-xs text-sky-700 underline">ไปหน้า ผู้สนใจ →</a>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
