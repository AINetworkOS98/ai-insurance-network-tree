'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import PromotionWorkflow from '@/components/PromotionWorkflow';
import { rankName, type RankLevel } from '@/lib/rankCatalog';

// บอร์ดผู้ขึ้นตำแหน่ง + รายได้ — เห็นเฉพาะระดับตัวแทนขึ้นไป (สมาชิกทั่วไปไม่เห็น)
// พร้อม workflow สไตล์ n8n: แสงไฟวิ่งเฉพาะตำแหน่งที่ขึ้นแล้ว • ตำแหน่งถัดไป "ไม่มีแสงไฟ"
export default function PromotionsBoardPage(){
  const [board, setBoard] = useState<any[]>([]);
  const [msg, setMsg] = useState('');
  const [denied, setDenied] = useState(false);
  const [deniedCode, setDeniedCode] = useState(0);
  const [me, setMe] = useState<any>(null);
  const [progress, setProgress] = useState<any>(null);
  const [myDates, setMyDates] = useState<Record<string, string | undefined>>({});

  useEffect(()=>{ (async()=>{
    try{
      const r = await fetch('/api/career/board',{credentials:'include'});
      const j = await r.json();
      if(j.ok) setBoard(j.board || []);
      else if(r.status===403 || r.status===401){ setDenied(true); setDeniedCode(r.status); }
      else setMsg(j.error || 'โหลดไม่สำเร็จ');
    }catch{ setMsg('โหลดไม่สำเร็จ'); }
    // ข้อมูลของตัวเอง: ระดับปัจจุบัน + เกณฑ์ขั้นถัดไป + วันที่ขึ้นแต่ละตำแหน่ง
    try{
      const r = await fetch('/api/auth/me',{credentials:'include'});
      const j = await r.json();
      if(j.ok) setMe(j.user);
    }catch{}
    try{
      const r = await fetch('/api/rank/progress',{credentials:'include'});
      const j = await r.json();
      if(j.ok || j.result){
        setProgress(j);
        const dates: Record<string, string | undefined> = {};
        for(const h of (j.history || [])){
          if(h?.toRank == null) continue;
          dates[String(h.toRank)] = h.evaluatedAt
            ? new Date(h.evaluatedAt).toLocaleDateString('th-TH',{day:'numeric',month:'short',year:'2-digit'})
            : undefined;
        }
        setMyDates(dates);
      }
    }catch{}
  })(); },[]);

  const myRank: RankLevel = ((me?.rankLevel ?? 0) as RankLevel);
  const nextLevel: RankLevel | null = myRank < 4 ? ((myRank + 1) as RankLevel) : null;
  const nextReq = (progress?.missing || []).join(' • ');

  return (
    <div>
      <Header/>
      <div className="flex w-full">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-4 w-full min-w-0">
          <div>
            <h1 className="text-xl font-bold text-navy">ผู้ขึ้นตำแหน่งและรายได้</h1>
            <p className="text-xs text-slate-500 mt-1">เฉพาะระดับตัวแทนขึ้นไป • เลื่อนแล้วรายได้ตามโครงสร้างตำแหน่ง</p>
          </div>
          {msg && <div className="p-2 rounded-xl bg-amber-50 border text-xs">{msg}</div>}
          {denied ? (
            <div className="card p-5 text-sm space-y-2">
              <div>{deniedCode === 403
                ? 'หน้านี้สำหรับระดับตัวแทนขึ้นไป — สมัครเป็นตัวแทนเพื่อดูบอร์ดผู้เลื่อนตำแหน่ง'
                : 'กรุณาเข้าสู่ระบบก่อนจึงจะเห็นเส้นทางตำแหน่งและบอร์ดผู้เลื่อนตำแหน่ง'}</div>
              {deniedCode !== 403 && (
                <a href="/login" className="inline-block px-4 py-2 rounded-full bg-navy text-white text-xs">เข้าสู่ระบบ</a>
              )}
            </div>
          ) : (
            <>
              {/* ── Workflow เส้นทางตำแหน่งของฉัน (สไตล์ n8n) ── */}
              {me && (
                <div className="card p-4">
                  <PromotionWorkflow
                    title="เส้นทางตำแหน่งของฉัน"
                    currentRank={myRank}
                    achievedAt={myDates}
                    nextRankName={nextLevel ? rankName(nextLevel) : undefined}
                    nextRequirement={nextLevel ? (nextReq || 'ดูเกณฑ์ที่หน้า “ขึ้นตำแหน่ง” แล้วกดขอเลื่อนตำแหน่ง') : undefined}
                  />
                  <div className="mt-2 text-[11px] text-slate-500">
                    ตำแหน่งปัจจุบัน: <b className="text-slate-700">{rankName(myRank)}</b>
                    {nextLevel && <> • ถัดไป: <b className="text-amber-700">{rankName(nextLevel)}</b></>}
                    {' '}• สายงานมีทั้งหมด 5 ขั้น (ผู้สนใจทั่วไป → ผู้จัดการภาค)
                  </div>
                </div>
              )}

              <div className="card p-4">
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <h2 className="font-semibold text-sm">บอร์ดผู้เลื่อนตำแหน่ง</h2>
                  <span className="text-[11px] text-slate-500">
                    แถบในแต่ละรายการแสดงตำแหน่งที่ขึ้นแล้ว (แสงวิ่ง) และขั้นถัดไป (ไม่มีแสงไฟ)
                  </span>
                </div>
                <div className="space-y-2">
                  {board.map((b:any)=>(
                    <div key={b.id} className="p-3 rounded-xl border bg-slate-50 text-xs flex flex-wrap gap-2 items-center">
                      <span className="font-bold">{b.name}</span>
                      {b.memberCode && <span className="font-mono text-slate-500">{b.memberCode}</span>}
                      <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[11px]">{b.fromRankName} → {b.toRankName}</span>
                      <PromotionWorkflow compact currentRank={Number(b.toRank ?? 0)} />
                      <span className="ml-auto font-mono">฿{Number(b.income).toLocaleString('th-TH')}</span>
                      <span className="text-[11px] text-slate-400 w-full">{b.at ? new Date(b.at).toLocaleDateString('th-TH',{day:'numeric',month:'long',year:'numeric'}) : ''}</span>
                    </div>
                  ))}
                  {!board.length && <div className="text-xs text-slate-500">ยังไม่มีผู้เลื่อนตำแหน่ง</div>}
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
