'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { RANK_CATALOG } from '@/lib/rankCatalog';

export default function PeriodMaintenancePage(){
  const [periods, setPeriods] = useState<any[]>([]);
  const [snaps, setSnaps] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [results, setResults] = useState<any[]>([]);
  const [cur, setCur] = useState('');
  const [curLabel, setCurLabel] = useState('');
  const [schedule, setSchedule] = useState<any[]>([]);
  const [autoClose, setAutoClose] = useState(false);
  const [msg, setMsg] = useState('');
  const [tab, setTab] = useState<'perf'|'maintain'|'removed'>('perf');
  const [maintainForm, setMaintainForm] = useState({ name:'แผนรักษายอดรายเดือน', metric:'commission', cycle:'monthly' as any });

  async function load(){
    const r = await fetch('/api/periods');
    const j = await r.json();
    if(j.ok){ setPeriods(j.periods||[]); setSnaps(j.snapshots||[]); setCur(j.currentPeriod||''); }
    try{
      const s = await fetch('/api/periods/schedule');
      const sj = await s.json();
      if(sj.ok){ setSchedule(sj.schedule||[]); setAutoClose(!!sj.autoClose); setCurLabel(sj.currentLabel||''); }
    }catch{}
    const m = await fetch('/api/maintenance');
    const mj = await m.json();
    if(mj.ok) setPlans(mj.plans||[]);
    const rs = await fetch('/api/maintenance/results');
    const rj = await rs.json();
    if(rj.ok) setResults(rj.results||[]);
  }
  useEffect(()=>{ load(); },[]);

  async function closePeriod(period:string){
    if(!confirm(`ปิดยอด ${period} ?`)) return;
    const res = await fetch('/api/periods/close', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ period }) });
    const j = await res.json();
    setMsg(j.ok ? `ปิดยอด ${period} — snapshot ${j.snapshots} รายการ` : j.error);
    load();
  }
  async function createPlan(){
    if(!maintainForm.name) { setMsg('กรุณากรอกชื่อแผน'); return; }
    const res = await fetch('/api/maintenance', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name: maintainForm.name, metric: maintainForm.metric, cycle: maintainForm.cycle, kind: maintainForm.cycle }) });
    const j = await res.json();
    setMsg(j.ok ? `สร้างแผน ${j.plan.name} Draft สำเร็จ` : j.error);
    load();
  }
  async function setActive(planId:string, status:string){
    const res = await fetch('/api/maintenance', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ planId, status }) });
    const j = await res.json();
    setMsg(j.ok ? `เปลี่ยนเป็น ${status} แล้ว` : j.error);
    load();
  }
  async function runMaintain(planId:string, period:string){
    const res = await fetch('/api/maintenance/run', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ planId, period }) });
    const j = await res.json();
    setMsg(j.ok ? `รันรักษายอด ${period}: สร้างผล ${j.created}/${j.eligible} คน` : j.error);
    load();
  }

  const removed = results.filter(r=> r.status==='removed');
  const suspended = results.filter(r=> r.status==='suspended');

  return (
    <div>
      <Header/>
      <div className="flex w-full">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-4">
          <h1 className="text-xl font-bold text-navy">ตัดยอดและรักษายอด</h1>
          <p className="text-[11px] text-slate-500">เขตเวลา Asia/Bangkok — ตัดยอดทุกวันสิ้นเดือน 24:00 น. วันสิ้นเดือนถือปีพุทธศักราช — ปิดยอดสร้าง snapshot ห้ามแก้ย้อนหลังเงียบๆ สมาชิกทุกคนดูตารางได้</p>
          {msg && <div className="p-2 rounded-xl bg-amber-50 border text-xs">{msg}</div>}

          <div className="card p-4">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-xs">รอบปัจจุบัน: <span className="font-bold">{curLabel||cur||'-'}</span> <span className="font-mono text-slate-400">({cur})</span></span>
              <span className={`px-2 py-0.5 rounded-full text-[11px] ${autoClose?'bg-emerald-600 text-white':'bg-slate-200'}`}>{autoClose?'ตัดยอดสิ้นเดือนอัตโนมัติ: เปิด':'ตัดยอดสิ้นเดือนอัตโนมัติ: ปิด'}</span>
              <span className="ml-auto flex gap-2">
                <button onClick={async()=>{
                  const res = await fetch('/api/periods/schedule', { method:'PUT', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ autoClose: !autoClose }) });
                  const j = await res.json(); setMsg(j.ok ? `ตัดยอดอัตโนมัติ: ${j.autoClose?'เปิด':'ปิด'} แล้ว` : (j.error||'ทำไม่สำเร็จ')); load();
                }} className="px-4 py-1.5 rounded-full border text-xs bg-white">{autoClose?'ปิดอัตโนมัติ':'เปิดอัตโนมัติ'}</button>
                <button onClick={async()=>{
                  if(!confirm('ตัดยอดเดือนก่อนทันที?')) return;
                  const res = await fetch('/api/periods/close', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ auto:true }) });
                  const j = await res.json(); setMsg(j.ok ? `ตัดยอด ${j.period} — snapshot ${j.snapshots} รายการ` : (j.error||'ทำไม่สำเร็จ')); load();
                }} className="px-4 py-1.5 rounded-full bg-navy text-white text-xs">ตัดยอดเดือนก่อนทันที</button>
              </span>
            </div>
            <div className="mt-3">
              <div className="text-xs font-semibold mb-1">ตารางตัดยอดสิ้นเดือนล่วงหน้า (พ.ศ.) — ล่าสุดอยู่บนสุด</div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100">
                      <th className="text-left px-2 py-1 font-semibold">เดือน (พ.ศ.)</th>
                      <th className="text-left px-2 py-1 font-semibold">Period</th>
                      <th className="text-left px-2 py-1 font-semibold">ตัดยอด (Bangkok)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((s:any)=>(
                      <tr key={s.period} className="border-b">
                        <td className="px-2 py-1.5 font-bold">{s.label}</td>
                        <td className="px-2 py-1.5 font-mono text-slate-500">{s.period}</td>
                        <td className="px-2 py-1.5 text-slate-600">{s.cutoffBangkok}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={()=> setTab('perf')} className={`px-4 py-1.5 rounded-full text-xs border ${tab==='perf'?'bg-navy text-white':'bg-white'}`}>ผลงาน/ปิดยอด</button>
            <button onClick={()=> setTab('maintain')} className={`px-4 py-1.5 rounded-full text-xs border ${tab==='maintain'?'bg-navy text-white':'bg-white'}`}>รักษายอด/แผน</button>
            <button onClick={()=> setTab('removed')} className={`px-4 py-1.5 rounded-full text-xs border ${tab==='removed'?'bg-navy text-white':'bg-white'}`}>คัดออก/พักสิทธิ ({removed.length+suspended.length})</button>
          </div>

          {tab==='perf' && (
            <div className="space-y-3">
              <div className="card p-4">
                <div className="flex gap-2 items-center">
                  <span className="text-xs">รอบปัจจุบัน: <span className="font-mono font-bold">{cur||'-'}</span></span>
                  <button onClick={()=> closePeriod(cur)} className="ml-auto px-4 py-1.5 rounded-full bg-navy text-white text-xs">ปิดยอดเดือนนี้</button>
                </div>
              </div>
              <div className="card p-4">
                <h3 className="font-semibold text-sm">รอบทั้งหมด ({periods.length}) — Open → PendingFinalization → Closed</h3>
                <div className="mt-2 space-y-1 max-h-[200px] overflow-auto">
                  {periods.map((p:any)=>(
                    <div key={p.period} className="flex gap-2 text-xs p-1 rounded border bg-slate-50">
                      <span className="font-bold">{(schedule.find(s=> s.period===p.period)?.label) || p.period}</span>
                      <span className="font-mono text-slate-400">{p.period}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] ${p.status==='Closed'?'bg-emerald-600 text-white': p.status==='PendingFinalization'?'bg-amber-400':'bg-slate-200'}`}>{p.status}</span>
                      <span className="text-[10px] text-slate-500">{p.endAt ? `ตัด ${new Date(p.endAt).toLocaleDateString('th-TH',{day:'numeric',month:'long',year:'numeric'})}` : ''}</span>
                      <span className="ml-auto">{p.status!=='Closed' && <button onClick={()=> closePeriod(p.period)} className="px-2 py-0.5 rounded-full border bg-white text-[11px]">ปิดยอด</button>}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card p-4">
                <h3 className="font-semibold text-sm">Snapshot ของฉัน (12 เดือนล่าสุด)</h3>
                <div className="mt-2 space-y-1">
                  {snaps.map((s:any)=>(
                    <div key={s.id} className="flex gap-2 text-xs p-1 rounded border bg-white">
                      <span className="font-mono">{s.period}</span>
                      <span>{RANK_CATALOG.find(x=> x.level===s.rankLevel)?.nameTh}</span>
                      <span className="ml-auto">รับรอง {String(s.verifiedAmount)} • รอตรวจ {String(s.pendingAmount)}</span>
                    </div>
                  ))}
                  {!snaps.length && <div className="text-xs text-slate-500">ยังไม่มี snapshot — ปิดยอดก่อน</div>}
                </div>
              </div>
            </div>
          )}

          {tab==='maintain' && (
            <div className="space-y-3">
              <div className="card p-4">
                <h3 className="font-semibold text-sm">สร้างแผนรักษายอด</h3>
                <div className="mt-2 flex flex-wrap gap-2">
                  <input value={maintainForm.name} onChange={e=> setMaintainForm({...maintainForm, name:e.target.value})} placeholder="ชื่อแผน" className="px-3 py-1.5 rounded-xl border text-xs flex-1 min-w-[160px]" />
                  <select value={maintainForm.metric} onChange={e=> setMaintainForm({...maintainForm, metric:e.target.value})} className="px-3 py-1.5 rounded-xl border text-xs">
                    <option value="commission">ค่าบำเหน็จ COM+COM PLUS</option>
                    <option value="premium">เบี้ยประกัน</option>
                    <option value="fyc">FYC</option>
                    <option value="com">COM</option>
                  </select>
                  <select value={maintainForm.cycle} onChange={e=> setMaintainForm({...maintainForm, cycle:e.target.value as any})} className="px-3 py-1.5 rounded-xl border text-xs">
                    <option value="monthly">รายเดือน</option>
                    <option value="quarterly">รายไตรมาส</option>
                  </select>
                  <button onClick={createPlan} className="px-5 py-1.5 rounded-full bg-navy text-white text-xs">สร้าง Draft</button>
                </div>
                <div className="text-[11px] text-slate-500 mt-1">แผนไตรมาส 2569 (Draft อ้างอิง) ห้าม Active — สร้างแผนรายเดือนแยก ไม่หาร 3 และไม่เดาตัวเลข</div>
              </div>
              <div className="card p-4">
                <h3 className="font-semibold text-sm">รายการแผน ({plans.length})</h3>
                <div className="mt-2 space-y-2">
                  {plans.map((pl:any)=>(
                    <div key={pl.id} className={`p-3 rounded-xl border text-xs ${pl.status==='Active'?'bg-emerald-50 border-emerald-200': pl.status==='Draft'?'bg-amber-50':'bg-slate-50'}`}>
                      <div className="flex gap-2 items-center">
                        <span className="font-bold">{pl.name}</span>
                        <span className="font-mono text-[11px]">{pl.kind}/{pl.cycle}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[11px] ${pl.status==='Active'?'bg-emerald-600 text-white': pl.status==='Draft'?'bg-amber-400':'bg-slate-300'}`}>{pl.status}</span>
                        {pl.isLegacyRef && <span className="px-2 py-0.5 rounded-full bg-slate-200 text-[10px]">อ้างอิงไตรมาส 2569</span>}
                        <span className="ml-auto flex gap-1">
                          {pl.status==='Draft' && <button onClick={()=> setActive(pl.id,'Active')} className="px-3 py-1 rounded-full bg-navy text-white text-[11px]">ตั้ง Active</button>}
                          {pl.status==='Active' && <button onClick={()=> runMaintain(pl.id, cur)} className="px-3 py-1 rounded-full bg-amber-500 text-white text-[11px]">รัน {cur}</button>}
                        </span>
                      </div>
                      {pl.rules?.length ? <div className="mt-1 text-[11px]">{pl.rules.map((r:any)=> `${RANK_CATALOG.find(x=> x.level===r.targetRank)?.nameTh}: ${String(r.minAmount)} (${r.label||r.resultType})`).join(' • ')}</div> : <div className="text-[11px] text-slate-500">ยังไม่มีกฎ</div>}
                    </div>
                  ))}
                </div>
              </div>
              <div className="card p-4">
                <h3 className="font-semibold text-sm">ผลรักษายอด ({results.length})</h3>
                <div className="mt-2 space-y-1 max-h-[300px] overflow-auto">
                  {results.slice(0,50).map((r:any)=>(
                    <div key={r.id} className={`flex gap-2 text-[11px] p-1 rounded border ${r.status==='removed'?'bg-red-50 border-red-200': r.status==='suspended'?'bg-amber-50': r.status==='warning'?'bg-amber-50': r.status==='pending_review'?'bg-slate-200':'bg-emerald-50'}`}>
                      <span className="font-mono">{r.period}</span>
                      <span className="w-[160px] truncate">{r.userId.slice(0,8)}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${r.status==='removed'?'bg-red-600 text-white': r.status==='suspended'?'bg-amber-500 text-white': r.status==='passed'?'bg-emerald-600 text-white':'bg-slate-400 text-white'}`}>{r.status}</span>
                      <span className="ml-auto">{String(r.verified)}/{String(r.required)} {r.remaining ? `ขาด ${String(r.remaining)}`: ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab==='removed' && (
            <div className="space-y-3">
              <div className="card p-4">
                <h3 className="font-semibold text-sm">พักสิทธิ / คัดออก — คงประวัติ ไม่ลบธุรกรรม ไม่บีบอัดผัง</h3>
                <div className="mt-2 space-y-1">
                  {[...suspended,...removed].slice(0,50).map((r:any)=>(
                    <div key={r.id} className="flex gap-2 text-xs p-2 rounded-xl border bg-red-50">
                      <span className="font-mono">{r.period}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] ${r.status==='removed'?'bg-red-600 text-white':'bg-amber-500 text-white'}`}>{r.status}</span>
                      <span className="ml-auto text-[11px]">{r.reason || '-'}</span>
                    </div>
                  ))}
                  {!suspended.length && !removed.length && <div className="text-xs text-slate-500 p-3 rounded-xl bg-slate-50 border">ยังไม่มีผู้ถูกพัก/คัดออก</div>}
                </div>
                <div className="text-[11px] text-slate-500 mt-2">คัดออก = ปิดสิทธิหลังบ้าน + ยกเลิก session + คงจุดเดิม isActive=false ไม่รับสมาชิกใหม่ใต้ตำแหน่งนั้น — คืนสถานะได้ผ่าน ขอทบทวน</div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
