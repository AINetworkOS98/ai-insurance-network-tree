'use client';
import { useState, useMemo, useEffect } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

// ---------- Types ----------
type Status = 'ACTIVE'|'PASS'|'WARNING'|'FAIL'|'SUSPENDED'|'REMOVED'|'PROMOTED'|'VACANT';
type Member = {
  id:string; memberId:string; name:string; level:number;
  parentId:string|null; slot:number; kpi:number; status:Status;
  children:Member[]; avatarUrl?:string;
};

// ---------- Demo data generator ----------
const NAMES = ['สมชาย','สมหญิง','วิชัย','นารี','ประเสริฐ','อนันต์','กมล','สุรีย์','พงษ์','ดา','เล็ก','ใหญ่','จอย','บอย','มิ้น','ต้น','น้ำ','ฟ้า','เบส','มายด์','กิ๊ก','เอ๋','โอ๋','เปิ้ล','นิด','หน่อย','เอก','บี','ซี','ดี'];
function randName(i:number){ return NAMES[i%NAMES.length] + (i>=NAMES.length ? ` ${Math.floor(i/NAMES.length)+1}`:''); }
const STATUS_POOL:Status[] = ['PASS','PASS','PASS','WARNING','FAIL','ACTIVE'];
function makeMembers(levels:number):Member[]{
  let counter=1;
  const all:Member[]=[];
  const root:Member={id:'1',memberId:'MEM000001',name:'ROOT • ประธาน',level:0,parentId:null,slot:0,kpi:96,status:'ACTIVE',children:[]};
  all.push(root);
  const q:Member[]=[root];
  for(let lv=1;lv<=levels;lv++){
    const next:Member[]=[];
    for(const p of q){
      for(let s=1;s<=5;s++){
        if(all.length>=200) break;
        counter++;
        const mid=`MEM${String(counter).padStart(6,'0')}`;
        const kpi = 45 + Math.floor(Math.random()*55);
        let st:Status = STATUS_POOL[Math.floor(Math.random()*STATUS_POOL.length)];
        if(kpi>=80) st='PASS'; else if(kpi>=60) st='WARNING'; else st='FAIL';
        if(Math.random()<0.04) st='REMOVED';
        if(Math.random()<0.03) st='PROMOTED';
        const m:Member={id:String(counter),memberId:mid,name:randName(counter),level:lv,parentId:p.id,slot:s,kpi,status:st,children:[]};
        p.children.push(m); all.push(m); next.push(m);
      }
    }
    q.splice(0,q.length,...next);
    if(q.length===0) break;
  }
  return all;
}

function statusStyle(s:Status){
  switch(s){
    case 'PASS': return 'bg-emerald-50 border-emerald-200 text-emerald-700';
    case 'ACTIVE': return 'bg-emerald-50 border-emerald-200 text-emerald-700';
    case 'PROMOTED': return 'bg-amber-50 border-amber-200 text-amber-700';
    case 'WARNING': return 'bg-amber-50 border-amber-200 text-amber-700';
    case 'FAIL': return 'bg-orange-50 border-orange-200 text-orange-700';
    case 'SUSPENDED': return 'bg-slate-100 border-slate-200 text-slate-600';
    case 'REMOVED': return 'bg-red-50 border-red-200 text-red-600';
    default: return 'bg-white border-slate-200 text-slate-600';
  }
}

// ---------- Avatar - วงกลม 100% ----------
function Avatar({m,selected,onClick}:{m:Member;selected:boolean;onClick:()=>void}){
  const initials = m.name.split(' ').map(w=>w[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
  const avatarSrc = m.avatarUrl && m.avatarUrl.trim() ? m.avatarUrl : '';
  
  return (
    <button onClick={onClick} className={`min-w-[92px] max-w-[110px] p-2.5 rounded-2xl border-2 bg-white shadow-sm hover:shadow-md transition text-center ${selected?'ring-2 ring-[#475569] border-[#475569]':statusStyle(m.status)}`}>
      {/* วงกลม: ใช้ทั้ง Tailwind rounded-full และ inline style เพื่อความมั่นใจ */}
      <div className="w-10 h-10 mx-auto overflow-hidden border-2 border-[#dbeafe] bg-white flex items-center justify-center rounded-full" style={{borderRadius:'50%'}}>
        {avatarSrc ? (
          <img 
            src={avatarSrc} 
            alt={m.name} 
            className="w-full h-full object-cover rounded-full" 
            style={{borderRadius:'50%'}}
            onError={(e)=>{ e.currentTarget.style.display='none'; }}
          />
        ) : m.status==='REMOVED' ? (
          <span className="text-lg">❌</span>
        ) : m.status==='PROMOTED' ? (
          <span className="text-lg">⭐</span>
        ) : (
          <span className="text-lg font-bold text-[#475569]">{initials}</span>
        )}
      </div>
      <div className="text-[10px] font-mono mt-1 font-bold truncate">{m.memberId}</div>
      <div className="text-[11px] font-semibold truncate">{m.name}</div>
      <div className="text-[10px] opacity-70">Lv.{m.level} • Slot {m.slot||'-'}</div>
      <div className="mt-1 inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border bg-white">
        <span className={`w-1.5 h-1.5 rounded-full ${m.status==='PASS'||m.status==='ACTIVE'?'bg-emerald-500':m.status==='WARNING'?'bg-amber-400':m.status==='FAIL'?'bg-orange-400':m.status==='REMOVED'?'bg-red-500':'bg-sky-400'}`}/>
        {m.status} • {m.kpi}
      </div>
      {m.children.length>0 && <div className="text-[10px] text-slate-400 mt-1">{m.children.length}/5 ทีม</div>}
    </button>
  );
}

function TreeNode({m,depth,selectedId,setSelected}:{m:Member;depth:number;selectedId:string|null;setSelected:(id:string)=>void}){
  const isVacant = m.children.length<5 && depth<3;
  return (
    <div className="flex flex-col items-center">
      <Avatar m={m} selected={selectedId===m.id} onClick={()=>setSelected(m.id)}/>
      {(m.children.length>0 || isVacant) && (<><div className="w-3 h-3 rounded-full bg-sky-500 border-2 border-white shadow-sm mt-1.5 z-10"/><div className="w-px h-4 bg-sky-400 mt-0.5"/></>)}
      {m.children.length>0 && (
        <>
          <div className="h-px bg-[#dbeafe] w-full max-w-[560px]"/>
          <div className="flex gap-2 mt-2 flex-wrap justify-center">
            {m.children.map(c=>(
              <div key={c.id} className="flex flex-col items-center">
                <div className="w-3 h-3 rounded-full bg-sky-500 border-2 border-white shadow-sm"/>
                <div className="w-px h-3 bg-sky-400"/>
                <TreeNode m={c} depth={depth+1} selectedId={selectedId} setSelected={setSelected}/>
              </div>
            ))}
            {isVacant && Array.from({length:5-m.children.length}).map((_,i)=>(
              <div key={'v'+i} className="flex flex-col items-center opacity-60">
                <div className="w-3 h-3 rounded-full bg-slate-300 border-2 border-white"/>
                <div className="w-px h-3 bg-slate-300"/>
                <div className="min-w-[92px] p-2.5 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-center">
                  <div className="w-10 h-10 mx-auto rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400">＋</div>
                  <div className="text-[10px] text-slate-400 mt-1">ว่าง Slot {m.children.length+i+1}</div>
                  <div className="text-[10px] px-1.5 py-0.5 rounded-full bg-white border inline-block mt-1">VACANT</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
      {m.children.length===0 && isVacant && (
        <div className="flex gap-2 mt-2 flex-wrap justify-center">
          {Array.from({length:5}).map((_,i)=>(
            <div key={i} className="min-w-[92px] p-2.5 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50 text-center">
              <div className="w-10 h-10 mx-auto rounded-full border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400">＋</div>
              <div className="text-[10px] text-slate-400 mt-1">ว่าง Slot {i+1}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function NetworkExamplePage(){
  const [levels,setLevels]=useState(3);
  const [selected,setSelected]=useState<string|null>('1');

  // JWT Auth state (ใช้ระบบ登录จริง ไม่ใช่ Firebase)
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [membersLoading, setMembersLoading] = useState(false);
  const [realMembers, setRealMembers] = useState<Member[]>([]);
  const [showDemo, setShowDemo] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  // ตรวจสอบการล็อกอินผ่าน /api/auth/me
  useEffect(()=>{
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/auth/me', { cache:'no-store' });
        const j = await res.json();
        if(j.ok && j.authed) {
          setCurrentUser(j.user || null);
        }
      } catch {}
      setAuthChecked(true);
    };
    checkAuth();
  }, []);

  // ดึงสมาชิกจริงเมื่อล็อกอิน
  useEffect(()=>{
    if(!currentUser || !authChecked) return;
    const fetchMembers = async () => {
      setMembersLoading(true);
      try {
        const res = await fetch('/api/members', { cache:'no-store' });
        const j = await res.json();
        if(j.ok && j.members && Array.isArray(j.members) && j.members.length > 0) {
          // สร้าง tree จากสมาชิกจริง
          // ใช้สมาชิกคนแรกเป็น root และลูก 5 คนถัดไป
          const members:any[] = j.members;
          const rootMember:Member = {
            id: members[0].id || members[0].memberCode || 'root',
            memberId: members[0].memberCode || members[0].id || 'ROOT',
            name: members[0].displayName || members[0].name || members[0].email || 'สมาชิก',
            level: 0,
            parentId: null,
            slot: 0,
            kpi: members[0].rankLevel ? members[0].rankLevel * 25 : 80,
            status: (members[0].status || 'ACTIVE') as Status,
            children: [],
            avatarUrl: members[0].avatarUrl,
          };
          const children:Member[] = [1,2,3,4,5].map((slot,idx) => {
            const m = members[idx+1];
            if(!m) return { id:`vacant-${slot}`, memberId:'-', name:'ตำแหน่งว่าง', level:1, parentId:rootMember.id, slot, kpi:0, status:'VACANT' as Status, children:[], avatarUrl:undefined };
            return {
              id: m.id || m.memberCode || `m${idx+1}`,
              memberId: m.memberCode || m.id || `MEM${String(idx+1).padStart(6,'0')}`,
              name: m.displayName || m.name || m.email || `สมาชิก ${idx+1}`,
              level: 1,
              parentId: rootMember.id,
              slot,
              kpi: m.rankLevel ? m.rankLevel * 25 : 60,
              status: (m.status || 'ACTIVE') as Status,
              children: [],
              avatarUrl: m.avatarUrl,
            };
          });
          rootMember.children = children;
          setRealMembers([rootMember, ...children]);
          setShowDemo(false);
        } else {
          setShowDemo(true);
        }
      } catch { setShowDemo(true); }
      finally { setMembersLoading(false); }
    };
    fetchMembers();
  }, [currentUser, authChecked]);

  async function handleLogout(){
    try { await fetch('/api/auth/logout', { method:'POST' }); } catch {}
    setCurrentUser(null);
    setShowDemo(true);
    setRealMembers([]);
  }

  // Demo members - ใช้ useMemo แบบ unconditional (ห้ามมีเงื่อนไข)
  const demoMembers = useMemo(()=> makeMembers(levels), [levels]);
  const displayMembers = showDemo ? demoMembers : realMembers;
  const displayRoot = showDemo ? displayMembers[0] : (realMembers.length>0 ? realMembers[0] : null);
  const displaySelected = useMemo(()=> {
    if(showDemo) return displayMembers.find(x=>x.id===selected) || displayMembers[0];
    return realMembers.find(x=>x.id===selected) || (realMembers.length>0 ? realMembers[0] : null);
  },[showDemo, selected, displayMembers, realMembers]);

  const stats = useMemo(()=>{
    const all = showDemo ? displayMembers : realMembers;
    const c=(s:Status)=> all.filter(x=>x.status===s).length;
    return {
      total:all.length,
      active: c('ACTIVE')+c('PASS'),
      pass: c('PASS'),
      warning: c('WARNING'),
      fail: c('FAIL'),
      removed: c('REMOVED'),
      promoted: c('PROMOTED'),
      depth: showDemo ? Math.max(...all.map(x=>x.level)) : 1,
      vacant: all.reduce((acc,m)=> acc + (5 - m.children.length),0)
    };
  },[showDemo, displayMembers, realMembers]);

  const removed = showDemo ? displayMembers.find(x=>x.status==='REMOVED') : null;
  const candidates = removed ? (displayMembers.find(x=>x.id===removed.parentId)?.children.filter(c=>c.status==='PASS'||c.status==='ACTIVE').sort((a,b)=>b.kpi-a.kpi) || []) : [];
  const best = candidates[0];

  return (
    <div>
      <Header/>
      <div className="flex w-full">
        <Sidebar/>
        <main className="flex-1 p-4 lg:p-6 space-y-4 bg-[#fcfdff] min-h-[calc(100vh-56px)]">
          {/* Header */}
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-bold text-[#475569]">ตัวอย่างเครือข่าย — 1 แตก 5</h1>
            <span className="text-xs px-2.5 py-1 rounded-full bg-[#f0f7ff] border border-[#dbeafe] text-[#2563eb]">🌐 สร้างเครือข่าย</span>
            {currentUser && (
              <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">
                ✓ ล็อกอินในฐานะ {currentUser.displayName || currentUser.email?.split('@')[0] || 'สมาชิก'}
              </span>
            )}
            <span className="text-xs px-2 py-1 rounded-full bg-white border text-slate-600">Lv.{stats.depth} • {stats.total} คน • สูตร 5^level</span>
            {currentUser && (
              <button onClick={handleLogout} className="px-3 py-1 rounded-full border bg-white text-xs text-slate-600 hover:bg-slate-50">
                ออกจากระบบ
              </button>
            )}
            {!currentUser && !membersLoading && (
              <a href="/login" className="px-3 py-1 rounded-full bg-[#475569] text-white text-xs hover:bg-slate-800">
                ล็อกอินเพื่อดูผังจริง
              </a>
            )}
          </div>

          {/* KPI bar */}
          <div className="grid grid-cols-2 lg:grid-cols-8 gap-2">
            {[
              {k:'ทั้งหมด',v:stats.total,cls:'bg-white border-slate-200'},
              {k:'Active/Pass',v:stats.active,cls:'bg-emerald-50 border-emerald-200 text-emerald-700'},
              {k:'PASS',v:stats.pass,cls:'bg-emerald-50 border-emerald-200 text-emerald-700'},
              {k:'WARNING',v:stats.warning,cls:'bg-amber-50 border-amber-200 text-amber-700'},
              {k:'FAIL',v:stats.fail,cls:'bg-orange-50 border-orange-200 text-orange-700'},
              {k:'REMOVED',v:stats.removed,cls:'bg-red-50 border-red-200 text-red-600'},
              {k:'PROMOTED',v:stats.promoted,cls:'bg-sky-50 border-sky-200 text-sky-700'},
              {k:'Vacant',v:stats.vacant,cls:'bg-slate-50 border-slate-200 text-slate-600'},
            ].map(x=>(
              <div key={x.k} className={`p-3 rounded-2xl border text-center ${x.cls}`}>
                <div className="text-[11px] opacity-70">{x.k}</div>
                <div className="text-lg font-bold">{x.v}</div>
              </div>
            ))}
          </div>

          {/* Controls */}
          <div className="card p-4 flex flex-wrap items-center gap-3">
            <div className="text-sm font-semibold">จำลอง:</div>
            <div className="flex items-center gap-2">
              <span className="text-xs">ชั้น</span>
              <select value={levels} onChange={e=>setLevels(Number(e.target.value))} className="border rounded-xl px-3 py-2 text-sm bg-white">
                <option value={2}>2 ชั้น (31 คน)</option>
                <option value={3}>3 ชั้น (156 คน)</option>
                <option value={4}>4 ชั้น (781 คน)</option>
              </select>
            </div>
            <button onClick={()=>{setLevels(3); setSelected('1');}} className="px-4 py-2 rounded-full bg-[#475569] text-white text-xs font-semibold">รีเซ็ต</button>
            <span className="text-[11px] text-slate-500">คลิกการ์ดคนเพื่อดูรายละเอียด • สี: เขียว PASS / เหลือง WARNING / ส้ม FAIL / แดง REMOVED / ฟ้า PROMOTED / เส้นประ VACANT</span>
          </div>

          {/* Promotion preview */}
          {removed && best && (
            <div className="p-4 rounded-2xl border-2 border-amber-200 bg-amber-50 flex flex-wrap items-center gap-3">
              <div className="text-sm font-bold text-amber-800">🔄 Auto Promotion Preview</div>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-1 rounded-full bg-red-100 border border-red-200 text-red-700">{removed.memberId} ❌ REMOVED (KPI {removed.kpi})</span>
                <span>→</span>
                <span className="px-2 py-1 rounded-full bg-sky-100 border border-sky-200 text-sky-700">{best.memberId} ⭐ PROMOTED (KPI {best.kpi})</span>
                <span className="text-slate-500">เลือกจาก {candidates.length} คนที่ผ่าน KPI (ใกล้สุด → KPI สูงสุด)</span>
              </div>
            </div>
          )}

          <div className="grid lg:grid-cols-[1fr_300px] gap-4">
            {/* Tree - main */}
            <div className="card p-4 overflow-auto">
              <div className="text-sm font-semibold mb-3">ต้นไม้เครือข่าย — Interactive Tree (รูปคนทุก Node)</div>
              <div className="min-w-[720px] flex justify-center py-4">
                {displayRoot ? <TreeNode m={displayRoot} depth={0} selectedId={selected} setSelected={setSelected}/> : <div className="text-sm text-slate-500 py-8 text-center">กำลังโหลด...</div>}
              </div>
              <div className="mt-4 flex flex-wrap gap-2 text-[11px]">
                <span className="px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200">● PASS/ACTIVE</span>
                <span className="px-2 py-1 rounded-full bg-amber-50 border border-amber-200">● WARNING</span>
                <span className="px-2 py-1 rounded-full bg-orange-50 border border-orange-200">● FAIL</span>
                <span className="px-2 py-1 rounded-full bg-red-50 border border-red-200">● REMOVED</span>
                <span className="px-2 py-1 rounded-full bg-sky-50 border border-sky-200">● PROMOTED</span>
                <span className="px-2 py-1 rounded-full bg-slate-50 border border-dashed">◌ VACANT</span>
                <span className="text-slate-400">• Zoom/Pan ได้ • คลิก Node ดูขวา • เส้นเชื่อมชัด • รองรับ 5-wide ไม่จำกัดชั้น</span>
              </div>
            </div>

            {/* Detail panel */}
            <div className="space-y-3">
              <div className="card p-4">
                <div className="text-sm font-semibold">รายละเอียดสมาชิก</div>
                <div className="mt-3 p-3 rounded-2xl border bg-[#f8fafc] text-center">
                  {/* วงกลม 100% สำหรับ detail panel */}
                  <div className="w-14 h-14 mx-auto overflow-hidden border-2 border-[#dbeafe] bg-white flex items-center justify-center rounded-full" style={{borderRadius:'50%'}}>
                    {displaySelected && displaySelected.avatarUrl && displaySelected.avatarUrl.trim() ? (
                      <img 
                        src={displaySelected.avatarUrl} 
                        alt={displaySelected.name} 
                        className="w-full h-full object-cover rounded-full" 
                        style={{borderRadius:'50%'}}
                        onError={(e)=>{ e.currentTarget.style.display='none'; }}
                      />
                    ) : displaySelected && displaySelected.status==='REMOVED' ? (
                      <span className="text-2xl">❌</span>
                    ) : displaySelected && displaySelected.status==='PROMOTED' ? (
                      <span className="text-2xl">⭐</span>
                    ) : (
                      <span className="text-2xl font-bold text-[#475569]">{displaySelected?.name.split(' ').map(w=>w[0]).filter(Boolean).slice(0,2).join('').toUpperCase() || 'SV'}</span>
                    )}
                  </div>
                  <div className="mt-2 font-bold text-sm">{displaySelected?.name}</div>
                  <div className="font-mono text-xs px-2 py-1 rounded-full bg-white border inline-block mt-1">{displaySelected?.memberId}</div>
                  <div className={`mt-2 inline-flex px-2.5 py-1 rounded-full border text-xs font-semibold ${statusStyle(displaySelected?.status || 'ACTIVE')}`}>{displaySelected?.status} • KPI {displaySelected?.kpi}/100</div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2 rounded-xl bg-white border"><div className="text-slate-400">Level</div><div className="font-bold">{displaySelected?.level}</div></div>
                  <div className="p-2 rounded-xl bg-white border"><div className="text-slate-400">Slot</div><div className="font-bold">{displaySelected?.slot||'-'}</div></div>
                  <div className="p-2 rounded-xl bg-white border"><div className="text-slate-400">Parent</div><div className="font-mono">{displaySelected?.parentId ? (showDemo ? displayMembers.find(x=>x.id===displaySelected.parentId)?.memberId : realMembers.find(x=>x.id===displaySelected.parentId)?.memberId) : '-'}</div></div>
                  <div className="p-2 rounded-xl bg-white border"><div className="text-slate-400">ทีมตรง</div><div className="font-bold">{displaySelected?.children.length}/5</div></div>
                </div>
                <div className="mt-3 space-y-1 text-[11px] text-slate-600">
                  <div>• Sponsor / Placement แยกกัน • Sponsor ไม่เปลี่ยนเมื่อ Promote</div>
                  <div>• Transaction + Lock Slot • ป้องกัน Cycle • มี Audit Log</div>
                </div>
              </div>

              <div className="card p-4">
                <div className="text-sm font-semibold">สูตรคำนวณ</div>
                <div className="mt-2 text-xs space-y-1 font-mono bg-slate-50 p-3 rounded-xl border">
                  <div>Members(level) = 5^level</div>
                  <div>Total = (5^(level+1)-1)/4</div>
                  <div className="pt-1 border-t mt-1">Lv0=1 • Lv1=5 • Lv2=25 • Lv3=125 → รวม 156</div>
                </div>
                <div className="mt-3 text-[11px] text-slate-500">ตัวอย่างขยายไม่จำกัดชั้น • BFS Left→Right • เต็ม 5 แล้วลงชั้นถัดไปอัตโนมัติ</div>
              </div>

              <div className="card p-3">
                <div className="text-xs font-semibold">Event Feed</div>
                <div className="mt-2 space-y-1.5 text-[11px] font-mono">
                  <div className="flex gap-2"><span className="text-slate-400">23:00</span><span>{removed?.memberId||'MEM000003'} KPI FAIL</span></div>
                  <div className="flex gap-2"><span className="text-slate-400">23:01</span><span>{removed?.memberId||'MEM000003'} REMOVED</span></div>
                  <div className="flex gap-2"><span className="text-slate-400">23:01</span><span>Vacancy detected Slot {removed?.slot||3}</span></div>
                  <div className="flex gap-2"><span className="text-slate-400">23:01</span><span>Searching candidates...</span></div>
                  <div className="flex gap-2"><span className="text-slate-400">23:02</span><span>{best?.memberId||'MEM000017'} selected (KPI {best?.kpi||93})</span></div>
                  <div className="flex gap-2 text-sky-600"><span className="text-slate-400">23:02</span><span>{best?.memberId||'MEM000017'} ⭐ PROMOTED</span></div>
                  <div className="flex gap-2 text-emerald-600"><span className="text-slate-400">23:02</span><span>Tree updated ✓</span></div>
                </div>
              </div>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 text-center">Demo หน้า ตัวอย่างเครือข่าย — ใช้ข้อมูลจำลอง • เชื่อม API จริงที่ /api/network/* และ /api/promotion/* เมื่อพร้อม • กฎ 1 แตก 5 • KPI 80/60 • Grace 3 เดือน • Cascade Promotion ได้</div>
        </main>
      </div>
    </div>
  );
}// cache bust
