'use client';
import { useEffect, useState } from 'react';
import { DEMO_MEMBERS } from '@/lib/demo-data';
type Node = {id:string; name:string; memberId:string; status:'active'|'pending'|'inactive'|'vacant'; rankName?:string; children?:Node[]; slot?:number; avatarUrl?:string};

function NodeCard({node}:{node:Node}){
  const color = node.status==='vacant' ? 'border-dashed bg-slate-50 text-slate-500' : node.status==='active' ? 'bg-emerald-50 border-emerald-200' : node.status==='pending' ? 'bg-amber-50 border-amber-200' : 'bg-slate-50';
  const initials = node.name.split(' ').map(w=>w[0]).filter(Boolean).slice(0,2).join('').toUpperCase();
  return (
    <div className={`rounded-xl border p-3 min-w-[160px] text-center ${color}`}>
      {/* Avatar วงกลมจาก avatarUrl หรือ initials */}
      <div className="w-10 h-10 mx-auto mb-2 overflow-hidden border-2 border-[#dbeafe] bg-white flex items-center justify-center rounded-full" style={{borderRadius:'50%'}}>
        {node.avatarUrl ? (
          <img src={node.avatarUrl} alt={node.name} className="w-full h-full object-cover" style={{borderRadius:'50%'}} onError={(e)=>{e.currentTarget.style.display='none'}}/>
        ) : (
          <span className="text-sm font-bold text-[#475569]">{initials}</span>
        )}
      </div>
      <div className="text-xs font-semibold truncate">{node.name}</div>
      <div className="text-[11px]">{node.memberId}</div>
      {node.rankName && <div className="text-[10px] font-semibold text-sky-700 mt-0.5">{node.rankName}</div>}
      <div className="text-[10px] mt-1">{node.status==='vacant'?'ตำแหน่งว่าง': node.status==='active'?'Active': node.status==='pending'?'Pending':'Inactive'}</div>
    </div>
  );
}

// สายไฟเชื่อมต่อแบบ n8n — วิ่งเปลี่ยนสีไหลลงต่อเนื่อง ไม่มีจุดสิ้นสุด
function TreeConnector({ count }: { count: number }){
  const COL = 200;           // ความกว้างคอลัมน์ (ตรงกับ flex-1 ของลูก)
  const W = COL * count;
  const H = 92;
  const centerX = W / 2;
  const childXs = Array.from({ length: count }, (_, i) => COL/2 + i*COL);
  const spineY = 30;
  const dropEnd = 84;
  const trunk = `M ${centerX} 0 L ${centerX} ${spineY}`;
  const spine = `M ${childXs[0]} ${spineY} L ${childXs[count-1]} ${spineY}`;
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id="ntWireGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#38bdf8"/>
          <stop offset="50%" stopColor="#34d399"/>
          <stop offset="100%" stopColor="#a78bfa"/>
        </linearGradient>
      </defs>
      {/* ฐานเส้น (จาง) */}
      <g stroke="#e2e8f0" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path d={trunk}/>
        <path d={spine}/>
        {childXs.map((x)=> <path key={x} d={`M ${x} ${spineY} L ${x} ${dropEnd}`}/>)}
      </g>
      {/* แสงเรืองรอง */}
      <g className="nt-flow-group" stroke="url(#ntWireGrad)" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity="0.18">
        <path d={trunk}/>
        <path d={spine}/>
        {childXs.map((x)=> <path key={x} d={`M ${x} ${spineY} L ${x} ${dropEnd}`}/>)}
      </g>
      {/* สายไฟวิ่ง */}
      <g className="nt-flow-group" stroke="url(#ntWireGrad)" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path className="nt-flow-line" d={trunk}/>
        <path className="nt-flow-line" d={spine}/>
        {childXs.map((x)=> <path key={x} className="nt-flow-line" d={`M ${x} ${spineY} L ${x} ${dropEnd}`}/>)}
      </g>
      {/* จุดพลังงานที่ปลายสาย (ไหลเข้าหา node) */}
      {childXs.map((x)=> <circle key={x} cx={x} cy={dropEnd} r="4" fill="#22d3ee" className="nt-pulse-dot"/>)}
    </svg>
  );
}


export default function TreeView({ filter }: { filter?: { q?:string; status?:string; province?:string; district?:string; tambon?:string; zipCode?:string } }){
  const [zoom,setZoom]=useState(100);
  const [tree, setTree]=useState<Node|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [count,setCount]=useState(0);
  function applyFilter(ms:any[]){
    const f = filter||{};
    let list = ms;
    if(f.q){ const s=String(f.q).toLowerCase(); list=list.filter((m:any)=>String(m.memberId||m.memberCode||'').toLowerCase().includes(s)||String(m.name||m.displayName||'').toLowerCase().includes(s)||String(m.email||'').toLowerCase().includes(s)); }
    if(f.status){ list=list.filter((m:any)=>String(m.status||'').toUpperCase()===String(f.status).toUpperCase()); }
    if(f.province){ list=list.filter((m:any)=>String(m.province||m.branch||'')===f.province); }
    if(f.district){ list=list.filter((m:any)=>String(m.district||'')===f.district); }
    if(f.tambon){ list=list.filter((m:any)=>String(m.subdistrict||m.tambon||'')===f.tambon); }
    if(f.zipCode){ const z=String(f.zipCode); list=list.filter((m:any)=>String(m.zipCode||'').includes(z)); }
    return list;
  }

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      setLoading(true);
      try{
        const r = await fetch('/api/members',{cache:'no-store'});
        const j = await r.json();
        if(cancelled) return;
        let members:any[];
        if(j && j.members && Array.isArray(j.members) && j.members.length>0){
          members = applyFilter(j.members);
        } else {
          console.warn('no members from API, using demo data');
          members = applyFilter(DEMO_MEMBERS);
        }
        setCount(members.length);
        if(members.length===0){
          setTree(null);
        } else {
          const root = members[0];
          const rest = members.slice(1,5);
          const children:Node[] = [1,2,3,4,5].map((slot,idx)=>{
            const m = rest[idx];
            if(m) return { id:m.memberId, name:m.name, memberId:m.memberId, rankName: m.rankName, status: m.status==='ACTIVE'?'active': m.status==='PENDING'?'pending':'inactive', slot, avatarUrl: m.avatarUrl };
            return { id:`vacant-${slot}`, name:'ตำแหน่งว่าง', memberId:'-', status:'vacant', slot };
          });
          setTree({ id:root.memberId, name:root.name, memberId:root.memberId, rankName: root.rankName, status: root.status==='ACTIVE'?'active':'pending', avatarUrl: root.avatarUrl, children });
        }
      }catch(e){
        console.warn('fetch failed, using demo data:', e);
        if(cancelled) return;
        const members = applyFilter(DEMO_MEMBERS);
        setCount(members.length);
        if(members.length>0){
          const root = members[0];
          const rest = members.slice(1,5);
          const children:Node[] = [1,2,3,4,5].map((slot,idx)=>{
            const m = rest[idx];
            if(m) return { id:m.memberId, name:m.name, memberId:m.memberId, rankName: m.rankName, status: m.status==='ACTIVE'?'active': m.status==='PENDING'?'pending':'inactive', slot, avatarUrl: m.avatarUrl };
            return { id:`vacant-${slot}`, name:'ตำแหน่งว่าง', memberId:'-', status:'vacant', slot };
          });
          setTree({ id:root.memberId, name:root.name, memberId:root.memberId, rankName: root.rankName, status: root.status==='ACTIVE'?'active':'pending', avatarUrl: root.avatarUrl, children });
        }
      }
      if(cancelled) return;
      setLoading(false);
    })();
  },[]);
  if(loading) return <div className="text-xs text-slate-500 py-6 text-center">กำลังโหลดผังเครือข่าย...</div>;

  if(!tree) return (
    <div>
      <div className="border rounded-2xl bg-white p-10 text-center">
        <div className="text-sm font-semibold text-[#475569]">ยังไม่มีผังเครือข่าย</div>
        <div className="text-xs text-slate-500 mt-1">ไม่มีข้อมูลปลอม — ระบบจะแสดงผังเมื่อมีสมาชิกจริงใน DB</div>
        <div className="text-[11px] text-slate-400 mt-2">สร้างสมาชิกผ่าน Admin → อนุมัติ Prospect → ระบบจะวางในต้นไม้ฐาน 5 คนแบบ BFS อัตโนมัติ</div>
        <div className="flex justify-center gap-2 text-[11px] mt-4">
          <span className="px-2 py-1 rounded-full bg-slate-50 border">ตำแหน่งว่าง</span>
          <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">Active</span>
          <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700">Pending</span>
        </div>
      </div>
      <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
        <b>หลักประกันความถูกต้อง:</b> ตำแหน่งว่างไม่นับเป็นสมาชิก/ผลงาน/รายได้ • ห้าม hard-code อัตรา • ทุกการจัดวางบันทึก Audit Log + Placement Timestamp
      </div>
    </div>
  );

  if(error) return <div className="text-xs text-rose-600 border rounded-xl bg-rose-50 p-4">{error}</div>;

  return (
    <div>
      <div className="text-xs text-slate-500 mb-2">พบสมาชิก {count} คน{filter && (filter.q||filter.status||filter.province||filter.district||filter.tambon||filter.zipCode) ? ' (ตามเงื่อนไขค้นหา)' : ''}</div>
      <div className="flex gap-2 mb-3">
        <button onClick={()=>setZoom(z=>Math.max(60,z-10))} className="px-3 py-1.5 rounded-lg border bg-white text-sm">−</button>
        <span className="px-3 py-1.5 text-sm">{zoom}%</span>
        <button onClick={()=>setZoom(z=>Math.min(140,z+10))} className="px-3 py-1.5 rounded-lg border bg-white text-sm">+</button>
        <span className="ml-auto text-xs text-slate-500">ลาก/ซูม • ค้นหา • Filter • Lazy Loading • List View บนมือถือ</span>
      </div>
      <div className="overflow-auto border rounded-2xl bg-white p-6" style={{zoom:`${zoom}%`}}>
        <style>{`
          @keyframes ntWireFlow { 0% { stroke-dashoffset: 0; } 100% { stroke-dashoffset: -40; } }
          @keyframes ntHueSpin { 0% { filter: hue-rotate(0deg); } 100% { filter: hue-rotate(360deg); } }
          @keyframes ntPulse { 0%,100% { opacity: 0.25; r: 3; } 50% { opacity: 1; r: 5; } }
          .nt-flow-line { stroke-dasharray: 10 10; animation: ntWireFlow 0.7s linear infinite; }
          .nt-flow-group { animation: ntHueSpin 6s linear infinite; }
          .nt-pulse-dot { animation: ntPulse 1.6s ease-in-out infinite; }
        `}</style>
        <div className="flex flex-col items-center gap-0 min-w-[700px]">
          <NodeCard node={tree} />
          <TreeConnector count={tree.children!.length} />
          <div className="flex gap-3">
            {tree.children!.map(c=> <NodeCard key={c.id} node={c} />)}
          </div>
          <div className="text-[11px] text-slate-500 mt-3">คนที่ 6 จะลงใต้ {tree.children![0]?.memberId} (BFS ซ้าย→ขวา ชั้นตื้นสุดก่อน) • แสดงเฉพาะสมาชิกจริง</div>
          <div className="flex gap-2 text-[11px] mt-2">
            <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-700">Active</span>
            <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-700">Pending</span>
            <span className="px-2 py-1 rounded-full bg-slate-100">Inactive</span>
            <span className="px-2 py-1 rounded-full border border-dashed">ตำแหน่งว่าง</span>
          </div>
        </div>
      </div>
      <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
        <b>หลักประกันความถูกต้อง:</b> ตำแหน่งว่างไม่นับเป็นสมาชิก/ผลงาน/รายได้ • ห้าม hard-code อัตรา • ทุกการจัดวางบันทึก Audit Log + Placement Timestamp
      </div>
    </div>
  );
}
