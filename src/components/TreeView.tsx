'use client';
import { useState } from 'react';
type Node = {id:string; name:string; memberId:string; status:'active'|'pending'|'inactive'|'vacant'; children?:Node[]; slot?:number};
const demo: Node = {
  id:'A', name:'สมชาย ใจดี', memberId:'M-000001', status:'active', children:[
    {id:'A1', name:'สมหญิง รักดี', memberId:'M-000002', status:'active'},
    {id:'A2', name:'ตำแหน่งว่าง', memberId:'-', status:'vacant'},
    {id:'A3', name:'วิชัย มั่นคง', memberId:'M-000003', status:'pending'},
    {id:'A4', name:'ตำแหน่งว่าง', memberId:'-', status:'vacant'},
    {id:'A5', name:'ตำแหน่งว่าง', memberId:'-', status:'vacant'},
  ]
};
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
          <NodeCard node={demo} />
          <div className="text-xs text-slate-400">┬─────┬─────┬─────┬─────┐</div>
          <div className="flex gap-3">
            {demo.children!.map(c=> <NodeCard key={c.id} node={c} />)}
          </div>
          <div className="text-[11px] text-slate-500 mt-2">คนที่ 6 จะลงใต้ A01 (BFS ซ้าย→ขวา ชั้นตื้นสุดก่อน) • Slot 0/5 → 5/5</div>
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
