'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import TreeView from '@/components/TreeView';

export default function TreePage(){
  const [activeTab, setActiveTab] = useState<'real'|'simulate'>('real');
  const [preview, setPreview] = useState<any>(null);
  const [runs, setRuns] = useState<any[]>([]);
  const [simulate, setSimulate] = useState<any>(null);
  const [loading, setLoading] = useState('');
  const [msg, setMsg] = useState('');
  const [structResult, setStructResult] = useState<any>(null);
  const [rankResult, setRankResult] = useState<any>(null);
  const [closeResult, setCloseResult] = useState<any>(null);

  // ที่อยู่ cascade: จังหวัด → อำเภอ/เขต → ตำบล (ข้อมูลจริงจาก public/data)
  const [provList, setProvList] = useState<any[]>([]);
  const [distList, setDistList] = useState<any[]>([]);
  const [subList, setSubList] = useState<any[]|null>(null);
  const [selProv, setSelProv] = useState('');
  const [selDist, setSelDist] = useState('');
  const [selTambon, setSelTambon] = useState('');
  useEffect(()=>{ (async()=>{
    try{ const r=await fetch('/data/provinces.json',{cache:'force-cache'}); const j=await r.json(); if(Array.isArray(j)) setProvList(j.filter((p:any)=>!p.deleted_at)); }catch{}
    try{ const r=await fetch('/data/districts.json',{cache:'force-cache'}); const j=await r.json(); if(Array.isArray(j)) setDistList(j.filter((d:any)=>!d.deleted_at)); }catch{}
  })(); },[]);
  async function ensureSub(){
    if(subList) return;
    try{ const r=await fetch('/data/sub_districts.json',{cache:'force-cache'}); const j=await r.json(); if(Array.isArray(j)) setSubList(j.filter((s:any)=>!s.deleted_at)); }catch{ setSubList([]); }
  }
  const distOpts = selProv ? distList.filter((d:any)=>String(d.province_id)===String(selProv)) : [];
  const subOpts = selDist && subList ? subList.filter((s:any)=>String(s.district_id)===String(selDist)) : [];
  // เงื่อนไขค้นหาผัง: ข้อความ+สถานะใช้ปุ่มค้นหา/Enter, ที่อยู่กรองทันทีที่เลือก
  const [q,setQ]=useState('');
  const [statusQ,setStatusQ]=useState('');
  const [fq,setFq]=useState('');
  const [fStatus,setFStatus]=useState('');
  function applySearch(){ setFq(q.trim()); setFStatus(statusQ); }
  const fProv = provList.find((p:any)=>String(p.id)===selProv)?.name_th || '';
  const fDist = distList.find((d:any)=>String(d.id)===selDist)?.name_th || '';
  const fSub = (subList||[]).find((s:any)=>String(s.id)===selTambon)?.name_th || '';

  async function loadPreview(){
    setLoading('preview');
    try{
      const res = await fetch('/api/tree/preview-run');
      const j = await res.json();
      if(j.ok) setPreview(j);
      else setMsg(j.error || 'โหลดพรีวิวไม่สำเร็จ');
    }catch{ setMsg('โหลดพรีวิวไม่สำเร็จ'); }
    setLoading('');
  }
  async function runPlacement(){
    setLoading('run');
    try{
      const res = await fetch('/api/tree/run', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ idempotencyKey: `manual-${Date.now()}` }) });
      const j = await res.json();
      if(j.ok){ setMsg(`รันสำเร็จ — สำเร็จ ${j.run.totalSuccess} ข้าม ${j.run.totalSkipped} ล้มเหลว ${j.run.totalFailed}`); loadRuns(); loadPreview(); }
      else setMsg(j.error || 'รันไม่สำเร็จ');
    }catch{ setMsg('รันไม่สำเร็จ'); }
    setLoading('');
  }
  async function checkStructure(){
    setLoading('struct'); setStructResult(null);
    try{
      const res = await fetch('/api/tree/validate', { method:'POST' });
      const j = await res.json(); setStructResult(j); setMsg(j.ok ? `ตรวจโครงสร้าง: ${j.summary}` : j.error);
    }catch(e:any){ setMsg('ตรวจโครงสร้างไม่สำเร็จ'); }
    setLoading('');
  }
  async function checkRank(){
    setLoading('rank'); setRankResult(null);
    try{
      const res = await fetch('/api/rank/evaluate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({}) });
      const j = await res.json(); setRankResult(j); setMsg(j.ok ? `ตรวจคุณสมบัติ: ประเมิน ${j.evaluated||0} คน` : j.error);
    }catch{ setMsg('ตรวจคุณสมบัติไม่สำเร็จ'); }
    setLoading('');
  }
  async function closePeriod(){
    if(!confirm('ปิดยอดเดือนปัจจุบัน (Asia/Bangkok) ?')) return;
    setLoading('close'); setCloseResult(null);
    try{
      const cur = new Date(); const period = `${cur.getFullYear()}-${String(cur.getMonth()+1).padStart(2,'0')}`;
      const res = await fetch('/api/periods/close', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ period }) });
      const j = await res.json(); setCloseResult(j); setMsg(j.ok ? `ปิดยอด ${period}: ${j.snapshots ?? j.alreadyClosed ? 'สร้างแล้ว' : 'สำเร็จ'}` : j.error);
    }catch{ setMsg('ปิดยอดไม่สำเร็จ'); }
    setLoading('');
  }
  async function togglePause(jobId:string, action:'pause'|'resume'){
    const res = await fetch('/api/tree/run', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ jobId, action }) });
    const j = await res.json();
    if(j.ok){ setMsg(action==='pause' ? 'พักการรันแล้ว' : 'ดำเนินการต่อแล้ว'); loadRuns(); }
  }
  async function loadRuns(){
    const res = await fetch('/api/tree/runs?take=10');
    const j = await res.json();
    if(j.ok) setRuns(j.runs);
  }
  async function loadSimulate(){
    const res = await fetch('/api/tree/simulate?level=4');
    const j = await res.json();
    if(j.ok) setSimulate(j);
  }

  useEffect(()=>{ if(activeTab==='simulate') loadSimulate(); }, [activeTab]);
  useEffect(()=>{ loadRuns(); }, []);

  return (
    <div>
      <Header/>
      <div className="flex w-full">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-[#475569]">ผังทีม 1:5 — โครงสร้างล็อก 1:5</h1>
            <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[11px] font-bold">โครงสร้างล็อก 1:5</span>
            <span className="text-xs text-slate-500">Breadth-first • ซ้ายไปขวา • ไม่เกิน 5 ช่อง/ชั้น</span>
            <div className="ml-auto flex gap-2">
              <button onClick={()=> setActiveTab('real')} className={`px-4 py-1.5 rounded-full text-xs font-semibold border ${activeTab==='real' ? 'bg-[#eff6ff] border-[#dbeafe] text-sky-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>ดูผัง 1:5</button>
              <button onClick={()=> setActiveTab('simulate')} className={`px-4 py-1.5 rounded-full text-xs font-semibold border ${activeTab==='simulate' ? 'bg-[#eff6ff] border-[#dbeafe] text-sky-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>ทดลองรัน</button>
            </div>
          </div>

          {/* 6 ปุ่มตามสเปค — ทำงานจริง */}
          <div className="card p-4">
            <div className="text-[11px] text-slate-500 mb-2">ปุ่มควบคุม — ทุกปุ่มทำงานจริง (ไม่โชว์สำเร็จปลอม)</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <button onClick={()=> setActiveTab('real')} className="px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50">ดูผัง 1:5</button>
              <button onClick={()=> setActiveTab('simulate')} className="px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50">ทดลองรัน</button>
              <button onClick={runPlacement} disabled={loading==='run'} className="px-4 py-3 rounded-xl bg-[#eff6ff] border border-[#dbeafe] text-sky-700 text-xs font-semibold disabled:opacity-50 hover:bg-[#e0f0ff]">รันจัดวางอัตโนมัติ</button>
              <button onClick={checkStructure} disabled={loading==='struct'} className="px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-semibold disabled:opacity-50 hover:bg-slate-50">ตรวจโครงสร้าง</button>
              <button onClick={checkRank} disabled={loading==='rank'} className="px-4 py-3 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs font-semibold disabled:opacity-50 hover:bg-slate-50">ตรวจคุณสมบัติตำแหน่ง</button>
              <button onClick={closePeriod} disabled={loading==='close'} className="px-4 py-3 rounded-xl bg-white border border-amber-200 text-amber-700 text-xs font-semibold disabled:opacity-50 hover:bg-amber-50">ปิดยอดรายเดือน</button>
            </div>
            {msg && <div className="mt-3 text-xs p-2.5 rounded-xl bg-slate-50 border">{msg}</div>}
            <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-slate-500">
              <span>แสดง: สำเร็จ/รอจัดวาง/ผิดพลาด + เหตุผล</span>
              <span>•</span><span>Idempotency ป้องกันกดซ้ำ</span>
              <span>•</span><span>5 ช่อง/parent ด้วย DB constraint</span>
            </div>
          </div>

          {/* ผลตรวจโครงสร้าง */}
          {structResult && (
            <div className="card p-4">
              <h3 className="font-semibold text-sm">ผลตรวจโครงสร้าง</h3>
              <div className="mt-2 text-xs space-y-1">
                <div>Over-capacity: {structResult.overCapacity?.length ?? 0} รายการ {structResult.overCapacity?.length ? <span className="text-rose-600">— มีผังเกิน 5 ช่อง!</span> : <span className="text-emerald-600">✓ ปกติ</span>}</div>
                <div>วงจร/ซ้ำ: {structResult.cycles ?? 0} • ข้ามองค์กร: {structResult.crossOrg ?? 0} • Slot นอกช่วง 1-5: {structResult.invalidSlot ?? 0}</div>
                {structResult.details && <pre className="mt-2 p-2 bg-slate-50 rounded-xl text-[11px] overflow-auto max-h-[200px]">{JSON.stringify(structResult.details, null, 2)}</pre>}
              </div>
            </div>
          )}
          {rankResult && (
            <div className="card p-4">
              <h3 className="font-semibold text-sm">ผลตรวจคุณสมบัติตำแหน่ง</h3>
              <div className="mt-2 text-xs">ประเมิน {rankResult.evaluated ?? 0} คน • เลื่อน {rankResult.promoted ?? 0} • คงเดิม {rankResult.unchanged ?? 0}</div>
              {rankResult.details && <pre className="mt-2 p-2 bg-slate-50 rounded-xl text-[11px] overflow-auto max-h-[200px]">{JSON.stringify(rankResult.details||rankResult, null, 2)}</pre>}
            </div>
          )}
          {closeResult && (
            <div className="card p-4">
              <h3 className="font-semibold text-sm">ผลปิดยอด</h3>
              <div className="mt-2 text-xs">{closeResult.alreadyClosed ? 'ปิดไปแล้ว (idempotent) — snapshots: '+(closeResult.snapshots||0) : `สร้าง snapshot ${closeResult.snapshots||0} รายการ`}</div>
            </div>
          )}

          {activeTab==='real' ? (
            <>
              <div className="card p-4">
                <div className="flex flex-wrap gap-2 text-sm">
                  <input placeholder="ค้นหาชื่อหรือรหัสสมาชิก" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')applySearch();}} className="border rounded-xl px-3 py-2 flex-1 min-w-[200px]" />
                  <select className="border rounded-xl px-3 py-2" value={statusQ} onChange={e=>setStatusQ(e.target.value)}><option value="">ทุกสถานะ</option><option value="ACTIVE">Active</option><option value="PENDING">Pending</option></select>
                  <select className="border rounded-xl px-3 py-2" value={selTambon} disabled={!selDist} onChange={e=>setSelTambon(e.target.value)}>
                    <option value="">{selDist?'ทุกตำบล':'เลือกอำเภอก่อน'}</option>
                    {subOpts.map((s:any)=>(<option key={s.id} value={s.id}>{s.name_th}</option>))}
                  </select>
                  <select className="border rounded-xl px-3 py-2" value={selDist} disabled={!selProv} onChange={e=>{setSelDist(e.target.value);setSelTambon('');ensureSub();}}>
                    <option value="">{selProv?'ทุกอำเภอ/เขต':'เลือกจังหวัดก่อน'}</option>
                    {distOpts.map((d:any)=>(<option key={d.id} value={d.id}>{d.name_th}</option>))}
                  </select>
                  <select className="border rounded-xl px-3 py-2" value={selProv} onChange={e=>{setSelProv(e.target.value);setSelDist('');setSelTambon('');}}>
                    <option value="">ทุกสาขา/จังหวัด</option>
                    {provList.map((p:any)=>(<option key={p.id} value={p.id}>{p.name_th}</option>))}
                  </select>
                  <button onClick={applySearch} className="px-4 py-2 rounded-xl bg-[#eff6ff] border border-[#dbeafe] text-sky-700 text-xs font-semibold hover:bg-[#e0f0ff]">ค้นหา</button>
                  <button className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs hover:bg-slate-50">ซูม +</button>
                  <button className="px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-600 text-xs hover:bg-slate-50">ย้อนขึ้นชั้นบน</button>
                </div>
                <div className="text-[11px] text-slate-500 mt-2">ค้นหา • กรองสาขา • ซูม/ย่อ/ขยาย • ย้อนขึ้นชั้นบน • โหลดทีละสาขา</div>
              </div>
              <TreeView filter={{q:fq,status:fStatus,province:fProv,district:fDist,tambon:fSub}} />

              {preview && (
                <div className="card p-4">
                  <h3 className="font-semibold text-sm">ตรวจสอบก่อนรัน — คิว {preview.queueLength} คน</h3>
                  <div className="mt-2 text-xs text-slate-600">ตำแหน่งที่จะได้รับ / รอจัดวาง / ผิดพลาด — ไม่เขียน DB จนกว่ากดรัน</div>
                  <div className="mt-3 space-y-1 max-h-[300px] overflow-auto">
                    {preview.preview?.map((p:any)=>(
                      <div key={p.userId} className={`flex items-center gap-2 p-2 rounded-lg text-xs border ${p.status==='will_place' ? 'bg-emerald-50 border-emerald-200' : 'bg-amber-50 border-amber-200'}`}>
                        <span className="font-mono">{p.memberCode || p.userId.slice(0,6)}</span>
                        <span className="font-semibold">{p.displayName}</span>
                        <span className="ml-auto">{p.status==='will_place' ? `→ slot ${p.slot} (level ${p.level})` : `ข้าม: ${p.reason}`}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {runs.length>0 && (
                <div className="card p-4">
                  <h3 className="font-semibold text-sm">ประวัติการรัน — สำเร็จ / รอจัดวาง / ผิดพลาด</h3>
                  <div className="mt-2 space-y-2">
                    {runs.map((r:any)=>(
                      <div key={r.jobId} className="p-3 rounded-xl border bg-slate-50 text-xs">
                        <div className="flex gap-2 flex-wrap">
                          <span className="font-mono">{r.jobId}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[11px] ${r.status==='completed'?'bg-emerald-100 text-emerald-700': r.status==='paused'?'bg-amber-100':'bg-slate-200'}`}>{r.status}</span>
                          <span>สำเร็จ {r.totalSuccess} • รอจัดวาง {r.totalSkipped} • ผิดพลาด {r.totalFailed}</span>
                          <button onClick={()=> togglePause(r.jobId, r.status==='paused' ? 'resume' : 'pause')} className="ml-auto px-2 py-0.5 rounded-full border bg-white text-[11px]">{r.status==='paused'?'ดำเนินการต่อ':'พักการรัน'}</button>
                          <span className="text-[11px] text-slate-400">{new Date(r.startedAt).toLocaleString('th-TH')}</span>
                        </div>
                        {r.entries?.length>0 && (
                          <div className="mt-2 space-y-1">
                            {r.entries.slice(0,10).map((e:any)=>(
                              <div key={e.id} className="flex gap-2 text-[11px]">
                                <span className="font-mono">{e.userId.slice(0,6)}</span>
                                <span className={e.status==='success'?'text-emerald-700':'text-slate-600'}>{e.status} {e.reason ? `— ${e.reason}` : ''} {e.slot ? `(slot ${e.slot})` : ''}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="card p-6">
              <h3 className="font-bold text-navy">ทดลองรัน — จำลองผัง 1 แตก 5 (781 ตำแหน่ง)</h3>
              <p className="text-xs text-slate-500 mt-1">ใช้ข้อมูลจำลองแยกจากข้อมูลจริง — ไม่สร้างสมาชิกสมมติเติมผังจริง • ตัวเลขเป็นความจุผัง ไม่ใช่การรับประกันสมาชิกหรือรายได้</p>
              {simulate ? (
                <div className="mt-4 space-y-2">
                  <div className="grid grid-cols-3 gap-2 text-xs font-semibold p-2 bg-slate-50 rounded-xl">
                    <span>ชั้นจากราก</span><span>จำนวนเฉพาะชั้น</span><span>รวมสะสม</span>
                  </div>
                  {simulate.table?.map((r:any)=>(
                    <div key={r.level} className="grid grid-cols-3 gap-2 text-sm p-2 rounded-xl border">
                      <span>ชั้น {r.level}</span><span className="font-mono">{r.countAtLevel}</span><span className="font-mono font-bold">{r.totalUpToLevel}</span>
                    </div>
                  ))}
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs">
                    1 + 5 + 25 + 125 + 625 = <b>781</b> ตำแหน่ง (ชั้น 0-4) • ชั้น 5 เพิ่มอีก 3,125 เป็น 3,906 — ไม่นับสมาชิกสมมติ
                  </div>
                </div>
              ) : <div className="text-xs text-slate-500 mt-3">กำลังโหลด...</div>}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
