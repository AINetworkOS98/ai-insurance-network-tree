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
      <div className="flex max-w-[1280px] mx-auto">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-xl font-bold text-[#0f2040]">ผังเครือข่าย — 1 แตก 5</h1>
            <span className="badge-demo">ข้อมูลจริง</span>
            <span className="text-xs text-slate-500">Strict History • BFS ตื้นก่อน ซ้ายไปขวา</span>
            <div className="ml-auto flex gap-2">
              <button onClick={()=> setActiveTab('real')} className={`px-4 py-1.5 rounded-full text-xs font-semibold border ${activeTab==='real' ? 'bg-navy text-white' : 'bg-white'}`}>ดูผังเครือข่าย</button>
              <button onClick={()=> setActiveTab('simulate')} className={`px-4 py-1.5 rounded-full text-xs font-semibold border ${activeTab==='simulate' ? 'bg-navy text-white' : 'bg-white'}`}>จำลองผัง 1 แตก 5</button>
            </div>
          </div>

          {/* 6 ปุ่มตามสเปค */}
          <div className="card p-4">
            <div className="flex flex-wrap gap-2">
              <button onClick={()=> setActiveTab('real')} className="px-4 py-2 rounded-xl bg-[#0f2040] text-white text-xs font-semibold">1. ดูผังเครือข่าย</button>
              <button onClick={()=> setActiveTab('simulate')} className="px-4 py-2 rounded-xl border text-xs">2. จำลองผัง 1 แตก 5</button>
              <button onClick={loadPreview} disabled={loading==='preview'} className="px-4 py-2 rounded-xl border bg-amber-50 text-xs disabled:opacity-50">3. ตรวจสอบก่อนรัน</button>
              <button onClick={runPlacement} disabled={loading==='run'} className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-semibold disabled:opacity-50">4. รันจัดวางอัตโนมัติ</button>
              <button onClick={()=> runs[0] && togglePause(runs[0].jobId, runs[0].status==='paused' ? 'resume' : 'pause')} className="px-4 py-2 rounded-xl border text-xs">
                5. {runs[0]?.status==='paused' ? 'ดำเนินการต่อ' : 'พักการรัน'}
              </button>
              <button onClick={loadRuns} className="px-4 py-2 rounded-xl border text-xs">6. ประวัติการรัน</button>
            </div>
            {msg && <div className="mt-2 text-xs p-2 rounded-xl bg-slate-50 border">{msg}</div>}
            <div className="mt-2 text-[11px] text-slate-500">รันต้องเป็น background job มี job_id + idempotencyKey — กดซ้ำไม่จัดวางซ้ำ, จำกัด 5 ช่อง/parent ด้วย unique constraint</div>
          </div>

          {activeTab==='real' ? (
            <>
              <div className="card p-4">
                <div className="flex flex-wrap gap-2 text-sm">
                  <input placeholder="ค้นหาชื่อหรือ Member ID" className="border rounded-xl px-3 py-2 flex-1 min-w-[200px]" />
                  <select className="border rounded-xl px-3 py-2"><option>ทุกสถานะ</option><option>Active</option><option>Pending</option></select>
                  <select className="border rounded-xl px-3 py-2"><option>ทุกตำแหน่ง</option><option>ตัวแทน</option><option>ผู้จัดการหน่วย</option></select>
                  <button className="px-4 py-2 rounded-xl bg-[#0f2040] text-white">ค้นหา</button>
                </div>
              </div>
              <TreeView/>

              {/* ตรวจสอบก่อนรัน */}
              {preview && (
                <div className="card p-4">
                  <h3 className="font-semibold text-sm">ตรวจสอบก่อนรัน — คิว {preview.queueLength} คน</h3>
                  <div className="mt-2 text-xs text-slate-600">ตำแหน่งที่จะได้รับ / สมาชิกที่ข้าม และสาเหตุ — ไม่เขียน DB จนกว่ากดรัน</div>
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

              {/* ประวัติการรัน */}
              {runs.length>0 && (
                <div className="card p-4">
                  <h3 className="font-semibold text-sm">ประวัติการรัน</h3>
                  <div className="mt-2 space-y-2">
                    {runs.map((r:any)=>(
                      <div key={r.jobId} className="p-3 rounded-xl border bg-slate-50 text-xs">
                        <div className="flex gap-2 flex-wrap">
                          <span className="font-mono">{r.jobId}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[11px] ${r.status==='completed'?'bg-emerald-100 text-emerald-700': r.status==='paused'?'bg-amber-100':'bg-slate-200'}`}>{r.status}</span>
                          <span>คิว {r.totalQueued} • สำเร็จ {r.totalSuccess} • ข้าม {r.totalSkipped} • ล้มเหลว {r.totalFailed}</span>
                          <span className="ml-auto">{new Date(r.startedAt).toLocaleString('th-TH')}</span>
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
              <h3 className="font-bold text-navy">จำลองผัง 1 แตก 5 — 781 ตำแหน่ง</h3>
              <p className="text-xs text-slate-500 mt-1">ใช้ข้อมูลจำลองแยกจากข้อมูลจริง — ตัวเลขนี้เป็นจำนวนตำแหน่งตามแบบจำลอง ไม่ใช่จำนวนสมาชิกจริงหรือการรับประกันรายได้</p>
              {simulate ? (
                <div className="mt-4 space-y-2">
                  <div className="grid grid-cols-3 gap-2 text-xs font-semibold p-2 bg-slate-50 rounded-xl">
                    <span>ชั้น</span><span>ตำแหน่งในชั้น</span><span>รวมสะสม</span>
                  </div>
                  {simulate.table?.map((r:any)=>(
                    <div key={r.level} className="grid grid-cols-3 gap-2 text-sm p-2 rounded-xl border">
                      <span>ชั้น {r.level}</span><span className="font-mono">{r.countAtLevel}</span><span className="font-mono font-bold">{r.totalUpToLevel}</span>
                    </div>
                  ))}
                  <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs">
                    รวม 1 + 5 + 25 + 125 + 625 = <b>781</b> ตำแหน่ง (จุดเริ่มต้นถึงชั้นที่ 4) • ไม่สร้างสมาชิกสมมติเติมผังจริง
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
