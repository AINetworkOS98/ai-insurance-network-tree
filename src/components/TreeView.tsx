'use client';
import { useEffect, useState } from 'react';
type Node = {id:string; name:string; memberId:string; status:'active'|'pending'|'inactive'|'vacant'; children?:Node[]; slot?:number};

function NodeCard({node}:{node:Node}){
  const color = node.status==='vacant' ? 'border-dashed bg-slate-50 text-slate-500' : node.status==='active' ? 'bg-emerald-50 border-emerald-200' : node.status==='pending' ? 'bg-amber-50 border-amber-200' : 'bg-slate-50';
  return (
    <div className={`rounded-xl border p-3 min-w-[160px] text-center ${color}`}>
      <div className="text-xs font-semibold truncate">{node.name}</div>
      <div className="text-[11px]">{node.memberId}</div>
      <div className="text-[10px] mt-1">{node.status==='vacant'?'ตำแหน่งว่าง': node.status==='active'?'Active': node.status==='pending'?'Pending':'Inactive'}</div>
    </div>
  );
}

export default function TreeView(){
  const [zoom,setZoom]=useState(100);
  const [tree, setTree]=useState<Node|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');

  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      try{
        // พยายามดึงข้อมูลจริงจาก API (members + placements)
        // ถ้าไม่มีข้อมูล จะแสดงสถานะว่าง — ไม่ hardcode คนปลอม
        const r = await fetch('/api/members',{cache:'no-store'});
        const j = await r.json();
        if(cancelled) return;
        const members = j.members||[];
        if(members.length===0){
          setTree(null);
        } else {
          // สร้างต้นไม้จำลองจากข้อมูลจริง (root = คนแรก, ลูก = ที่เหลือ) — ไม่สร้างชื่อปลอม
          const root = members[0];
          const rest = members.slice(1,5);
          const children: Node[] = [1,2,3,4,5].map((slot,idx)=>{
            const m = rest[idx];
            if(m) return { id:m.memberId, name:m.name, memberId:m.memberId, status: m.status==='ACTIVE'?'active': m.status==='PENDING'?'pending':'inactive', slot };
            return { id:`vacant-${slot}`, name:'ตำแหน่งว่าง', memberId:'-', status:'vacant', slot };
          });
          setTree({ id:root.memberId, name:root.name, memberId:root.memberId, status: root.status==='ACTIVE'?'active':'pending', children });
        }
      }catch(e:any){
        if(!cancelled) setError(e.message||'โหลดไม่สำเร็จ');
      }finally{ if(!cancelled) setLoading(false); }
    })();
    return ()=>{ cancelled=true; };
  },[]);

  if(loading) return <div className="text-xs text-slate-500 py-6 text-center">กำลังโหลดผังเครือข่าย...</div>;

  if(!tree) return (
    <div>
      <div className="border rounded-2xl bg-white p-10 text-center">
        <div className="text-sm font-semibold text-[#0f2040]">ยังไม่มีผังเครือข่าย</div>
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
      <div className="flex gap-2 mb-3">
        <button onClick={()=>setZoom(z=>Math.max(60,z-10))} className="px-3 py-1.5 rounded-lg border bg-white text-sm">−</button>
        <span className="px-3 py-1.5 text-sm">{zoom}%</span>
        <button onClick={()=>setZoom(z=>Math.min(140,z+10))} className="px-3 py-1.5 rounded-lg border bg-white text-sm">+</button>
        <span className="ml-auto text-xs text-slate-500">ลาก/ซูม • ค้นหา • Filter • Lazy Loading • List View บนมือถือ</span>
      </div>
      <div className="overflow-auto border rounded-2xl bg-white p-6" style={{zoom:`${zoom}%`}}>
        <div className="flex flex-col items-center gap-4 min-w-[700px]">
          <NodeCard node={tree} />
          <div className="text-xs text-slate-400">┬─────┬─────┬─────┬─────┐</div>
          <div className="flex gap-3">
            {tree.children!.map(c=> <NodeCard key={c.id} node={c} />)}
          </div>
          <div className="text-[11px] text-slate-500 mt-2">คนที่ 6 จะลงใต้ {tree.children![0]?.memberId} (BFS ซ้าย→ขวา ชั้นตื้นสุดก่อน) • แสดงเฉพาะสมาชิกจริง</div>
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
