'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { RANK_CATALOG } from '@/lib/rankCatalog';

type Plan = any;

export default function RankPlansPage(){
  const [plans, setPlans] = useState<Plan[]>([]);
  const [progress, setProgress] = useState<any>(null);
  const [formName, setFormName] = useState('');
  const [formVersion, setFormVersion] = useState('v1-draft-15jan64');
  const [formSource, setFormSource] = useState('ภาพโครงสร้าง update 15 Jan 64');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState('');

  async function load(){
    const r = await fetch('/api/rank-plans');
    const j = await r.json();
    if(j.ok) setPlans(j.plans);
    const pr = await fetch('/api/rank/progress');
    const pj = await pr.json();
    if(pj.ok) setProgress(pj);
  }
  useEffect(()=>{ load(); },[]);

  async function createDraft(){
    if(!formName || !formVersion) { setMsg('กรุณากรอกชื่อและเวอร์ชัน'); return; }
    setLoading('create');
    const res = await fetch('/api/rank-plans', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name: formName, version: formVersion, sourceRef: formSource, isLegacyRef: true }) });
    const j = await res.json();
    setMsg(j.ok ? `สร้าง ${j.plan.version} สำเร็จ (Draft)` : j.error);
    setLoading('');
    load();
  }

  async function setActive(planId:string){
    if(!confirm('เปิดใช้งานแผนนี้เป็น Active? (จะมี Active ได้ครั้งละ 1 แผน)')) return;
    const res = await fetch('/api/rank-plans', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ planId, status:'Active' }) });
    const j = await res.json();
    setMsg(j.ok ? 'เปิดใช้งานแล้ว' : j.error);
    load();
  }

  async function evaluate(){
    const res = await fetch('/api/rank/evaluate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ userId: progress?.userId || '' }) });
    const j = await res.json();
    setMsg(j.message || j.error || j.result);
    load();
  }

  const activePlan = plans.find(p=> p.status==='Active');
  const draftPlan = plans.find(p=> p.status==='Draft');

  return (
    <div>
      <Header/>
      <div className="flex max-w-[1280px] mx-auto">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-5">
          <h1 className="text-xl font-bold text-navy">แผนตำแหน่งและเส้นทางตำแหน่ง</h1>
          <p className="text-[11px] text-slate-500">ห้ามนำค่าอ้างอิง 20,000/75,000/1,200,000 ไปคำนวณจริงจนได้รับแผนที่ยืนยันแล้ว — แผน Draft ยังไม่เปลี่ยนตำแหน่ง</p>
          {msg && <div className="p-2 rounded-xl bg-amber-50 border text-xs">{msg}</div>}

          {/* ความคืบหน้าของผู้ล็อกอิน */}
          {progress && (
            <div className="card p-4 border-2 border-navy/10">
              <h3 className="font-bold text-sm">ตำแหน่งปัจจุบัน: {progress.currentRankNameTh} (ระดับ {progress.currentRank}) — เป้าหมาย: {progress.targetRankNameTh || 'ถึงสูงสุดแล้ว'}</h3>
              {progress.evalMessage && <div className="mt-2 p-2 rounded-xl bg-slate-50 border text-xs font-mono">{progress.evalMessage}</div>}
              {progress.missing.length ? (
                <ul className="mt-2 list-disc list-inside text-xs text-amber-700">
                  {progress.missing.map((m:string, i:number)=><li key={i}>{m}</li>)}
                </ul>
              ) : progress.targetRank != null ? <div className="text-xs text-emerald-700">มีคุณสมบัติครบ — รอระบบ/ผู้มีสิทธิอนุมัติ</div> : null}
              {progress.evalType==='approval' && <div className="text-[11px] text-slate-500">แผนนี้ต้องส่งผู้มีสิทธิอนุมัติ — ไม่เลื่อนอัตโนมัติ</div>}
              <button onClick={evaluate} className="mt-3 px-4 py-1.5 rounded-full bg-navy text-white text-xs">ประเมินตอนนี้</button>
            </div>
          )}

          {/* สร้าง Draft */}
          <div className="card p-4">
            <h3 className="font-semibold text-sm">สร้างแผน (Draft)</h3>
            <div className="mt-2 flex flex-wrap gap-2">
              <input value={formName} onChange={e=> setFormName(e.target.value)} placeholder="ชื่อแผน" className="px-3 py-1.5 rounded-xl border text-xs flex-1 min-w-[160px]" />
              <input value={formVersion} onChange={e=> setFormVersion(e.target.value)} placeholder="เวอร์ชัน" className="px-3 py-1.5 rounded-xl border text-xs w-[180px]" />
              <input value={formSource} onChange={e=> setFormSource(e.target.value)} placeholder="แหล่งอ้างอิง" className="px-3 py-1.5 rounded-xl border text-xs flex-1 min-w-[180px]" />
              <button onClick={createDraft} disabled={loading==='create'} className="px-5 py-1.5 rounded-full bg-navy text-white text-xs disabled:opacity-50">สร้าง Draft</button>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">ตัวอย่าง Draft 15 Jan 64: บำเหน็จ 20k/75k/1.2M + หน่วย/ศูนย์ + 1–6/3–6/12–24 เดือน — ห้าม Active จนยืนยันนิยามครบ</div>
          </div>

          {/* รายการแผน */}
          <div className="card p-4">
            <h3 className="font-semibold text-sm">รายการแผน ({plans.length})</h3>
            <div className="mt-3 space-y-2">
              {plans.map((p:Plan)=>(
                <div key={p.id} className={`p-3 rounded-xl border text-xs ${p.status==='Active' ? 'bg-emerald-50 border-emerald-200' : p.status==='Draft' ? 'bg-amber-50' : 'bg-slate-50'}`}>
                  <div className="flex gap-2 items-center">
                    <span className="font-bold">{p.name}</span>
                    <span className="font-mono">{p.version}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] ${p.status==='Active'?'bg-emerald-600 text-white': p.status==='Draft'?'bg-amber-400':'bg-slate-300'}`}>{p.status}</span>
                    {p.isLegacyRef && <span className="px-2 py-0.5 rounded-full bg-slate-200 text-[10px]">อ้างอิงเก่า 15 Jan 64</span>}
                    <span className="ml-auto text-[11px] text-slate-500">{p.sourceRef || '-'}</span>
                    {p.status==='Draft' && <button onClick={()=> setActive(p.id)} className="px-3 py-1 rounded-full bg-navy text-white text-[11px]">ตั้งเป็น Active</button>}
                  </div>
                  {p.rules?.length ? (
                    <table className="mt-2 w-full text-[11px] border-collapse">
                      <thead><tr className="text-slate-500"><th className="text-left">เป้าหมาย</th><th>metric</th><th>ส่วนตัว</th><th>ทีม</th><th>หน่วย/ศูนย์</th><th>ระยะเวลา</th><th>ใบอนุญาต</th><th>ประเมิน</th></tr></thead>
                      <tbody>
                        {p.rules.map((r:any)=>(
                          <tr key={r.id} className="border-t">
                            <td>{RANK_CATALOG.find(x=> x.level===r.targetRank)?.nameTh || r.targetRank}</td>
                            <td className="text-center font-mono">{r.metric}</td>
                            <td className="text-right">{r.personalMin ?? '-'}</td>
                            <td className="text-right">{r.teamMin ?? '-'}</td>
                            <td className="text-center">{r.qualifiedUnits ?? '-'}/{r.qualifiedCenters ?? '-'}</td>
                            <td className="text-center">{r.durationMinMonths ?? '?'}-{r.durationMaxMonths ?? '?'} เดือน</td>
                            <td className="text-center">{r.licenseRequired ? 'ต้องมี' : '-'}</td>
                            <td className="text-center">{r.evalType}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : <div className="text-[11px] text-slate-500">ยังไม่มีกฎ — เพิ่มผ่าน API /api/rank-plans พร้อม rules[]</div>}
                </div>
              ))}
              {!plans.length && <div className="text-xs text-slate-500 p-3 rounded-xl bg-slate-50 border">ยังไม่มีแผน — สร้าง Draft จากข้อมูลอ้างอิงเก่า 15 Jan 64 ก่อน</div>}
            </div>
          </div>

          {/* ตำแหน่งอ้างอิง */}
          <div className="card p-4">
            <h3 className="font-semibold text-sm">โครงสร้างตำแหน่ง 0–4</h3>
            <div className="mt-2 grid grid-cols-5 gap-2 text-[11px]">
              {RANK_CATALOG.map((r:any)=>(
                <div key={r.level} className="p-2 rounded-xl border bg-slate-50 text-center">
                  <div className="font-bold">{r.level} — {r.nameTh}</div>
                  <div className="text-slate-500">{r.nameRef}</div>
                </div>
              ))}
            </div>
            <div className="text-[11px] text-slate-500 mt-2">เก็บชื่ออ้างอิงเดิมไว้ แก้ชื่อแสดงผลได้ — ห้ามสร้างตำแหน่งย่อยเพิ่มเติมแล้วอ้างเป็นโครงสร้างทางการ</div>
          </div>
        </main>
      </div>
    </div>
  );
}
