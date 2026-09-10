'use client';
import { useEffect, useState } from 'react';
const cols=[
  {key:'NEW', label:'New', color:'bg-slate-100'},
  {key:'CONTACTED', label:'Contacted', color:'bg-sky-100'},
  {key:'INTERESTED', label:'Interested', color:'bg-indigo-100'},
  {key:'APPOINTMENT', label:'Appointment', color:'bg-violet-100'},
  {key:'FOLLOW_UP', label:'Follow-up', color:'bg-amber-100'},
  {key:'CONVERTED', label:'Converted', color:'bg-emerald-100'},
];
type Prospect = { id:string; name:string; phone:string; status:string; score:number };
export default function Kanban(){
  const [demo, setDemo]=useState<Prospect[]>([]);
  const [loading, setLoading]=useState(true);
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try{
        const r=await fetch('/api/prospects',{cache:'no-store'});
        const j=await r.json();
        if(!cancelled) setDemo(j.prospects||[]);
      }catch{ if(!cancelled) setDemo([]); }
      finally{ if(!cancelled) setLoading(false); }
    })();
    return ()=>{ cancelled=true; };
  },[]);
  if(loading) return <div className="text-xs text-slate-500 py-4">กำลังโหลดผู้สนใจ...</div>;
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {cols.map(c=>(
        <div key={c.key} className={`rounded-xl border p-3 ${c.color}`}>
          <div className="text-xs font-bold flex items-center gap-1">{c.label} <span className="text-[10px] font-normal text-slate-500">({demo.filter(d=> d.status===c.key).length})</span></div>
          <div className="mt-2 space-y-2">
            {demo.filter(d=> d.status===c.key).map(d=>(
              <div key={d.id} className="rounded-xl bg-white border p-3">
                <div className="text-xs font-semibold truncate">{d.name}</div>
                <div className="text-[11px] text-slate-500">{d.id} • {d.phone||'-'}</div>
                <div className="text-[11px] mt-1">Lead Score <b>{d.score}</b></div>
              </div>
            ))}
            {demo.filter(d=> d.status===c.key).length===0 && <div className="text-[11px] text-slate-500">— ว่าง —</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
