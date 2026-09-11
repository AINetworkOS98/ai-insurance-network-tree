'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

// เมนู 9 รายการตามสเปคหมวด 5
const items=[
  {href:"/", label:"หน้าแรก", icon:"⌂"},
  {href:"/dashboard", label:"ภาพรวม", icon:"▦"},
  {href:"/prospects", label:"สมาชิกและผู้สนใจ", icon:"◎"},
  {href:"/tree", label:"ผังทีม 1:5", icon:"⁂"},
  {href:"/receipts", label:"หลักฐานและผลงาน", icon:"▭"},
  {href:"/progress", label:"ความก้าวหน้า", icon:"⬆"},
  {href:"/periods", label:"ปิดยอดรายเดือน", icon:"◷"},
  {href:"/reports", label:"รายงาน", icon:"▤"},
  {href:"/settings", label:"ตั้งค่า", icon:"⚙"},
];
// เมนูเสริม (ไม่นับใน 9 หลัก แสดงใต้เส้นประ)
const extra=[
  {href:"/members", label:"สมาชิกของฉัน", icon:"◉"},
  {href:"/income", label:"รายได้", icon:"฿"},
  {href:"/documents", label:"เอกสารทางการเงิน", icon:"📄"},
  {href:"/admin", label:"ผู้ดูแลระบบ", icon:"🛡"},
  {href:"/verify", label:"ตรวจสมาชิก", icon:"🔍"},
  {href:"/notifications", label:"แจ้งเตือน", icon:"🔔"},
];
export default function Sidebar(){
  const path=usePathname();
  const [open,setOpen]=useState(false);
  const Nav = (
    <div className="p-4 space-y-1">
      <div className="text-[10px] tracking-widest text-slate-400 px-3 pb-1">เมนูหลัก — 9 รายการ (สเปค)</div>
      {items.map(it=>{
        const active = path===it.href;
        return <Link key={it.href} href={it.href} onClick={()=>setOpen(false)} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm ${active?'bg-[#0f2040] text-white':'hover:bg-slate-50 text-slate-700'}`}><span className="w-5 text-center">{it.icon}</span>{it.label}</Link>
      })}
      <div className="border-t my-3"/>
      <div className="text-[10px] tracking-widest text-slate-400 px-3 pb-1">เสริม</div>
      {extra.map(it=>{
        const active = path===it.href;
        return <Link key={it.href} href={it.href} onClick={()=>setOpen(false)} className={`flex items-center gap-3 px-3 py-2 rounded-xl text-sm ${active?'bg-[#0f2040] text-white':'hover:bg-slate-50 text-slate-700'}`}><span className="w-5 text-center">{it.icon}</span>{it.label}</Link>
      })}
      <div className="pt-4 text-[11px] text-slate-500 border-t mt-4">โครงสร้างล็อก 1:5 • ทุกเมนูตรวจสิทธิฝั่ง API</div>
    </div>
  );
  return (
    <>
      {/* Mobile toggle */}
      <button onClick={()=>setOpen(v=>!v)} className="lg:hidden fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-[#0f2040] text-white shadow-lg flex items-center justify-center text-xl">☰</button>
      {open && <div onClick={()=>setOpen(false)} className="lg:hidden fixed inset-0 bg-black/40 z-40"/>}
      <aside className={`w-[240px] shrink-0 border-r bg-white min-h-[calc(100vh-56px)] ${open ? 'fixed inset-y-0 left-0 z-50 overflow-auto lg:static' : 'hidden lg:block'}`}>
        {Nav}
      </aside>
    </>
  );
}
