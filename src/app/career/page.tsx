'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

// เมนูขึ้นตำแหน่ง — เห็นได้เฉพาะระดับตัวแทนขึ้นไป
// เกณฑ์: โครงสร้างรายได้ ไทยประกันชีวิต (update 15 Jan 64), เลื่อนตามผัง 1 แตก 5
const STEPS = [
  { level:1, name:'ตัวแทน', req:'ขอ code + สอบใบอนุญาตตัวแทนประกันชีวิต', income:'ค่าบำเหน็จ + ค่าพาหนะ (ตามตารางผลิตภัณฑ์: ทรัพย์ปันผล 32% / ธนทรัพย์ 35% / TL Plan 25% / คุ้มธนกิจ 40% ปีแรก)' },
  { level:2, name:'ผู้บริหารหน่วย', req:'บำเหน็จ 20,000 บาท • เวลา 1–6 เดือน', income:'ค่าจัดงานหน่วย 25–40% ตาม COM ทีม + ค่าแยกหน่วย 2,000/หน่วย' },
  { level:3, name:'ผู้บริหารศูนย์', req:'บำเหน็จ 75,000 บาท • เวลา 3–6 เดือน • แยกหน่วย 2 หน่วย', income:'จัดงานศูนย์ ป.1 (15–30%) + ป.2 (0.8% เบี้ยปีต่อ) + ป.3 + แยกศูนย์ + โบนัสศูนย์' },
  { level:4, name:'ผู้บริหารภาค', req:'บำเหน็จ 1,200,000 บาท • เวลา 12–24 เดือน • แยกศูนย์ 4 ศูนย์', income:'จัดงานภาค ป.1–2 + บริหารเป้า + โบนัสภาค + ค่าแยกภาค' },
];

export default function CareerPage(){
  const [me, setMe] = useState<any>(null);
  const [progress, setProgress] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  async function load(){
    try{
      const r = await fetch('/api/auth/me',{credentials:'include'});
      const j = await r.json();
      if(j.ok){ setMe(j.user); }
    }catch{}
    try{
      const r = await fetch('/api/rank/progress',{credentials:'include'});
      const j = await r.json();
      if(j.ok || j.result) setProgress(j);
    }catch{}
  }
  useEffect(()=>{ load(); },[]);

  async function promote(){
    if(!confirm('ยืนยันขอเลื่อนตำแหน่ง? ระบบจะตรวจคุณสมบัติจริงก่อน')) return;
    setLoading(true); setMsg('');
    try{
      const res = await fetch('/api/rank/evaluate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'promote' }) });
      const j = await res.json();
      setMsg(j.ok ? (j.message || 'สำเร็จ') : (j.error || 'ยังไม่ผ่านเกณฑ์'));
      load();
    }catch{ setMsg('ทำไม่สำเร็จ — ลองใหม่'); }
    setLoading(false);
  }

  const rank = me?.rankLevel ?? 0;
  if(me && rank < 1){
    return (
      <div><Header/><div className="flex w-full"><Sidebar/>
        <main className="flex-1 p-6 max-w-none w-full min-w-0">
          <h1 className="text-xl font-bold text-navy">ขึ้นตำแหน่ง</h1>
          <div className="card p-5 mt-4 text-sm">เมนูนี้สำหรับระดับตัวแทนขึ้นไป — สมัครเป็นตัวแทนก่อนเพื่อดูเส้นทางความก้าวหน้า</div>
        </main>
      </div></div>
    );
  }

  return (
    <div>
      <Header/>
      <div className="flex w-full">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-4 w-full min-w-0">
          <div>
            <h1 className="text-xl font-bold text-navy">ขึ้นตำแหน่ง</h1>
            <p className="text-xs text-slate-500 mt-1">เกณฑ์โครงสร้างรายได้ ไทยประกันชีวิต (15 Jan 64) — เลื่อนตามผัง 1 แตก 5 • ปัจจุบัน: <span className="font-bold">{progress?.currentRankNameTh || '-'}</span></p>
          </div>
          {msg && <div className="p-2 rounded-xl bg-amber-50 border text-xs">{msg}</div>}

          <div className="card p-5">
            <h3 className="font-semibold text-sm">บันไดตำแหน่ง</h3>
            <div className="mt-3 space-y-2">
              {STEPS.map(s=>(
                <div key={s.level} className={`p-3 rounded-xl border text-xs ${rank>=s.level?'bg-emerald-50 border-emerald-200':'bg-slate-50'}`}>
                  <div className="flex gap-2 items-center">
                    <span className="font-bold">{s.level}. {s.name}</span>
                    {rank>=s.level && <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px]">ถึงแล้ว</span>}
                    {progress?.targetRank===s.level && <span className="px-2 py-0.5 rounded-full bg-amber-400 text-[10px]">เป้าหมายถัดไป</span>}
                  </div>
                  <div className="mt-1 text-slate-600">คุณสมบัติ: {s.req}</div>
                  <div className="mt-0.5 text-slate-500">รายได้: {s.income}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-sm">ความคืบหน้าของฉัน {progress?.targetRankNameTh ? `→ ${progress.targetRankNameTh}` : ''}</h3>
            {progress ? (
              <div className="mt-2 text-xs space-y-1">
                <div>ผลประเมิน: <span className="font-bold">{progress.result}</span> <span className="text-slate-500">{progress.evalMessage || ''}</span></div>
                {(progress.missing||[]).length > 0 && (
                  <ul className="list-disc ml-5 text-slate-600">
                    {(progress.missing||[]).map((m:string,i:number)=><li key={i}>{m}</li>)}
                  </ul>
                )}
                {!(progress.missing||[]).length && progress.result==='qualified_auto' && <div className="text-emerald-700 font-semibold">คุณสมบัติครบ — กดเลื่อนตำแหน่งได้เลย</div>}
                <button onClick={promote} disabled={loading} className="mt-2 px-6 py-2 rounded-full bg-navy text-white text-xs disabled:opacity-50">
                  {loading ? 'กำลังตรวจ...' : 'ขอเลื่อนตำแหน่ง'}
                </button>
              </div>
            ) : <div className="text-xs text-slate-500 mt-2">กำลังโหลด...</div>}
          </div>

          {!!(progress?.history||[]).length && (
            <div className="card p-5">
              <h3 className="font-semibold text-sm">ประวัติตำแหน่ง</h3>
              <div className="mt-2 space-y-1">
                {(progress.history||[]).map((h:any)=>(
                  <div key={h.id} className="flex gap-2 text-xs p-1 rounded border bg-slate-50">
                    <span>{h.fromRank} → {h.toRank}</span>
                    <span className="px-2 py-0.5 rounded-full bg-slate-200 text-[10px]">{h.result}</span>
                    <span className="ml-auto text-slate-500">{h.evaluatedAt ? new Date(h.evaluatedAt).toLocaleDateString('th-TH') : ''}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="text-[11px] text-slate-500">เปลี่ยนเกณฑ์ได้เฉพาะผู้บริหารระบบ / Admin Akarapol เท่านั้น</div>
        </main>
      </div>
    </div>
  );
}
