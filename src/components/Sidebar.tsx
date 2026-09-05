'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
const items=[
  {href:"/dashboard", label:"ภาพรวม", icon:"▦"},
  {href:"/prospects", label:"ผู้สนใจ", icon:"◎"},
  {href:"/appointments", label:"นัดหมาย", icon:"◷"},
  {href:"/tree", label:"ผังเครือข่าย", icon:"⁂"},
  {href:"/members", label:"สมาชิกของฉัน", icon:"◉"},
  {href:"/income", label:"รายได้", icon:"฿"},
  {href:"/documents", label:"เอกสารทางการเงิน", icon:"▭"},
  {href:"/progress", label:"ความก้าวหน้า", icon:"⬆"},
  {href:"/admin", label:"ผู้ดูแลระบบ", icon:"⚙"},
];
export default function Sidebar(){
  const path=usePathname();
  return (
    <aside className="w-[240px] shrink-0 hidden lg:block border-r bg-white min-h-[calc(100vh-56px)]">
      <div className="p-4 space-y-1">
        {items.map(it=>{
          const active = path===it.href;
          return <Link key={it.href} href={it.href} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm ${active?'bg-[#0f2040] text-white':'hover:bg-slate-50 text-slate-700'}`}><span>{it.icon}</span>{it.label}</Link>
        })}
        <div className="pt-4 text-[11px] text-slate-500 border-t mt-4">เมนูแสดงตาม Permission เท่านั้น • Deny by Default</div>
      </div>
    </aside>
  );
}
