'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

// หน้าสำรองและกู้คืนข้อมูล — ดูได้เมื่อล็อกอิน, กดสำรอง/กู้คืนได้เฉพาะผู้บริหารระบบ
export default function BackupPage(){
  const [health, setHealth] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState('');

  async function load(){
    try{
      const r = await fetch('/api/system/health',{credentials:'include'});
      const j = await r.json();
      if(j.ok) setHealth(j);
      else setMsg(j.error || 'โหลดไม่สำเร็จ');
    }catch{ setMsg('โหลดไม่สำเร็จ'); }
  }
  useEffect(()=>{ load(); },[]);

  async function act(action:'backup'|'restore'){
    if(action==='restore' && !confirm('กู้คืนแถวที่หายไปจากข้อมูลสำรองล่าสุด? (ไม่เขียนทับของใหม่)')) return;
    setLoading(action); setMsg('');
    try{
      const res = await fetch('/api/system/health', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action }) });
      const j = await res.json();
      setMsg(j.ok ? (action==='backup' ? `สำรองสำเร็จ ${j.stamp}` : `กู้คืนแล้ว: ${JSON.stringify(j.restored)}`) : (j.error || 'ทำไม่สำเร็จ'));
      load();
    }catch{ setMsg('ทำไม่สำเร็จ'); }
    setLoading('');
  }

  const dot = (s:string)=> s==='up' ? 'bg-emerald-600' : s==='down' ? 'bg-red-600' : 'bg-slate-300';

  return (
    <div>
      <Header/>
      <div className="flex w-full">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-4 max-w-[720px]">
          <div>
            <h1 className="text-xl font-bold text-navy">สำรองและกู้คืนข้อมูล</h1>
            <p className="text-xs text-slate-500 mt-1">สำรองอัตโนมัติทุกวัน + กดสำรองทันทีได้ — ถ้าฐานหลักล่ม ระบบเติมข้อมูลที่หายจากสำรองให้ทันทีที่กลับมา</p>
          </div>
          {msg && <div className="p-2 rounded-xl bg-amber-50 border text-xs">{msg}</div>}
          <div className="card p-5 space-y-2 text-sm">
            <div className="flex items-center gap-2"><span className={`w-3 h-3 rounded-full ${dot(health?.db)}`}/> ฐานหลัก (Postgres): <b>{health?.db || '-'}</b></div>
            <div className="flex items-center gap-2"><span className={`w-3 h-3 rounded-full ${dot(health?.firestore)}`}/> ที่สำรอง (Firestore): <b>{health?.firestore || '-'}</b></div>
            <div className="text-xs text-slate-600">
              สำรองล่าสุด: <b>{health?.lastBackup?.stamp || '-'}</b>
              {health?.lastBackup?.at && <span> • {new Date(health.lastBackup.at).toLocaleString('th-TH')}</span>}
            </div>
            {health?.lastBackup?.counts && (
              <div className="text-[11px] text-slate-500">
                {Object.entries(health.lastBackup.counts).map(([k,v]:any)=> `${k} ${v}`).join(' • ')}
              </div>
            )}
            {health?.canRestore && (
              <div className="flex gap-2 pt-2">
                <button onClick={()=> act('backup')} disabled={!!loading} className="px-5 py-2 rounded-full bg-navy text-white text-xs disabled:opacity-50">
                  {loading==='backup' ? 'กำลังสำรอง...' : 'สำรองทันที'}
                </button>
                <button onClick={()=> act('restore')} disabled={!!loading} className="px-5 py-2 rounded-full border text-xs bg-white disabled:opacity-50">
                  {loading==='restore' ? 'กำลังกู้...' : 'กู้คืนข้อมูลที่หาย'}
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
