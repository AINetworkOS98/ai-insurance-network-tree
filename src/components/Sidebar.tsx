'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useT } from '@/i18n';

const items=[
  {href:"/", key:"nav_home", icon:"⌂"},
  {href:"/dashboard", key:"sb_dashboard", icon:"▦"},
  {href:"/prospects", key:"sb_members_prospects", icon:"◎"},
  {href:"/tree", key:"sb_tree", icon:"⁂"},
  {href:"/receipts", key:"sb_receipts", icon:"▭"},
  {href:"/receipts/settings", key:"sb_receipt_settings", icon:"⚙"},
  {href:"/progress", key:"sb_progress", icon:"⬆"},
  {href:"/career", key:"sb_career", icon:"▲"},
  {href:"/periods", key:"sb_periods", icon:"◷"},
  {href:"/criteria", key:"sb_criteria", icon:"✓"},
  {href:"/commissions", key:"sb_commissions", icon:"฿"},
  {href:"/reports", key:"sb_reports", icon:"▤"},
];
const extra=[
  {href:"/members", key:"sb_my_members", icon:"◉"},
  {href:"/documents", key:"sb_documents", icon:"📄"},
  {href:"/settings", key:"sb_settings", icon:"⚙"},
];

export default function Sidebar(){
  const { t } = useT();
  const path=usePathname();
  const router=useRouter();
  const [collapsed,setCollapsed]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [networkOpen,setNetworkOpen]=useState(true);
  const [authed,setAuthed]=useState<boolean|null>(null);

  useEffect(()=>{
    fetch('/api/auth/me', { credentials: 'include', cache:'no-store' }).then(r=>setAuthed(r.ok)).catch(()=>setAuthed(false));
  },[]);

  // คีย์บอร์ด: Ctrl+B / [ / \ เพื่อ หด/ขยาย
  useEffect(()=>{
    const onKey=(e:KeyboardEvent)=>{
      const tag=(e.target as HTMLElement)?.tagName;
      const isTyping = tag==='INPUT' || tag==='TEXTAREA' || (e.target as HTMLElement)?.isContentEditable;
      if(isTyping && !(e.ctrlKey || e.metaKey)) return;
      if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==='b'){
        e.preventDefault(); setCollapsed(v=>!v);
      } else if(!e.ctrlKey && !e.metaKey && !e.altKey && (e.key==='[' || e.key==='\\' || e.key===']')){
        if(!isTyping){ e.preventDefault(); setCollapsed(v=>!v); }
      } else if(e.key==='Escape' && mobileOpen){
        setMobileOpen(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  },[mobileOpen]);

  // จำ state ไว้
  useEffect(()=>{
    const saved=localStorage.getItem('sidebar-collapsed');
    if(saved) setCollapsed(saved==='1');
  },[]);
  useEffect(()=>{ localStorage.setItem('sidebar-collapsed', collapsed?'1':'0'); },[collapsed]);

  const Nav = (
    <div className={`p-3 space-y-1 ${collapsed?'px-2':''}`}>
      {/* ถ้ายังไม่ล็อกอิน — ไม่แสดงเมนูอะไรเลย */}
      {authed===false ? null : (
        <>
          {!collapsed && <div className="text-[10px] tracking-widest text-slate-400 px-3 pb-1 pt-2" >{t('menu_main')}</div>}
          {items.map(it=>{
            const active = path===it.href;
            return (
              <Link key={it.href} href={it.href} onClick={()=>setMobileOpen(false)} title={collapsed?t(it.key):undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${collapsed?'justify-center px-2':''} ${active?'bg-[#eff6ff] text-sky-700 font-semibold':'hover:bg-[#FFFBF5] text-slate-600'}`}>
                <span className="w-5 text-center shrink-0">{it.icon}</span>
                {!collapsed && <span className="truncate">{t(it.key)}</span>}
              </Link>
            )
          })}
          {/* สร้างเครือข่าย - ซัพเมนู */}
          <div className={`${collapsed?'px-1':''} mt-1`}>
            <button
              onClick={()=> collapsed ? setCollapsed(false) : setNetworkOpen(v=>!v)}
              title={collapsed?t('sb_network'):undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${collapsed?'justify-center px-2':''} ${(path?.startsWith('/network')||path?.startsWith('/tree')) ?'bg-[#eff6ff] text-sky-700 font-semibold':'hover:bg-[#FFFBF5] text-slate-600'}`}>
              <span className="w-5 text-center shrink-0">🌐</span>
              {!collapsed && <span className="flex-1 text-left truncate" >{t('sb_network')}</span>}
              {!collapsed && <span className={`text-xs transition-transform duration-200 ${networkOpen?'rotate-90':''}`}>›</span>}
            </button>
            {!collapsed && networkOpen && (
              <div className="ml-5 mt-1 space-y-1">
                <Link href="/network-example" onClick={()=>setMobileOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-colors ${path==='/network-example'?'bg-[#eff6ff] text-sky-700 font-semibold':'hover:bg-[#FFFBF5] text-slate-600'}`}>
                  <span>👥</span><span>{t('sb_network_example')}</span>
                  {path==='/network-example' && <span className="ml-auto text-[10px]">●</span>}
                </Link>
                <Link href="/referral" onClick={()=>setMobileOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-colors ${path==='/referral'?'bg-[#eff6ff] text-sky-700 font-semibold':'hover:bg-[#FFFBF5] text-slate-600'}`}>
                  <span>✉</span><span>{t('sb_invite')}</span>
                  {path==='/referral' && <span className="ml-auto text-[10px]">●</span>}
                </Link>
                <Link href="/receipts" onClick={()=>setMobileOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-colors ${path==='/receipts'?'bg-[#eff6ff] text-sky-700 font-semibold':'hover:bg-[#FFFBF5] text-slate-600'}`}>
                  <span>🧾</span><span>{t('sb_scan')}</span>
                  {path==='/receipts' && <span className="ml-auto text-[10px]">●</span>}
                </Link>
                <Link href="/network/promotions" onClick={()=>setMobileOpen(false)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs transition-colors ${path==='/network/promotions'?'bg-[#eff6ff] text-sky-700 font-semibold':'hover:bg-[#FFFBF5] text-slate-600'}`}>
                  <span>🎖</span><span>{t('sb_promotions')}</span>
                  {path==='/network/promotions' && <span className="ml-auto text-[10px]">●</span>}
                </Link>
              </div>
            )}
            {collapsed && (
              <div className="mt-1 flex flex-col items-center gap-1">
                <Link href="/network-example" title={t('sb_network_example')} className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-colors ${path==='/network-example'?'bg-[#eff6ff] text-sky-700':'hover:bg-[#FFFBF5] text-slate-600'}`}>👥</Link>
                <Link href="/referral" title={t('sb_invite')} className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-colors ${path==='/referral'?'bg-[#eff6ff] text-sky-700':'hover:bg-[#FFFBF5] text-slate-600'}`}>✉</Link>
                <Link href="/receipts" title={t('sb_scan')} className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-colors ${path==='/receipts'?'bg-[#eff6ff] text-sky-700':'hover:bg-[#FFFBF5] text-slate-600'}`}>🧾</Link>
                <Link href="/network/promotions" title={t('sb_promotions')} className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs transition-colors ${path==='/network/promotions'?'bg-[#eff6ff] text-sky-700':'hover:bg-[#FFFBF5] text-slate-600'}`}>🎖</Link>
              </div>
            )}
          </div>
          {extra.map(it=>{
            const active = path===it.href;
            return (
              <Link key={it.href} href={it.href} onClick={()=>setMobileOpen(false)} title={collapsed?t(it.key):undefined}
                className={`flex items-center gap-3 px-3 py-2 rounded-xl text-xs transition-colors ${collapsed?'justify-center px-2':''} ${active?'bg-[#eff6ff] text-sky-700 font-semibold':'hover:bg-[#FFFBF5] text-slate-600'}`}>
                <span className="w-5 text-center shrink-0">{it.icon}</span>
                {!collapsed && <span className="truncate">{t(it.key)}</span>}
              </Link>
            )
          })}
        </>
      )}
      {!collapsed && authed!==false && <div className="pt-4 text-[11px] text-slate-400 px-3 mt-4">กด <kbd className="px-1.5 py-0.5 bg-slate-100 border rounded text-[10px]">Ctrl</kbd>+<kbd className="px-1.5 py-0.5 bg-slate-100 border rounded text-[10px]">B</kbd> หรือ <kbd className="px-1.5 py-0.5 bg-slate-100 border rounded text-[10px]">[</kbd> เพื่อหด/ขยาย</div>}
    </div>
  );

  // หน้าแรกตอนยังไม่ล็อกอิน — ซ่อน Sidebar ทั้งแถบ (ว่างเปล่าแต่กินพื้นที่ดันแชต)
  // กล่องแชตจะได้อยู่กลางหน้าจอจริง
  if(path==='/' && authed===false) return null;

  return (
    <>
      {/* Mobile toggle */}
      <button onClick={()=>setMobileOpen(v=>!v)} className="lg:hidden fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-[#475569] text-white shadow-lg flex items-center justify-center text-xl">☰</button>
      {mobileOpen && <div onClick={()=>setMobileOpen(false)} className="lg:hidden fixed inset-0 bg-black/40 z-40"/>}
      {/* Desktop collapse toggle - ลอยขอบ */}
      <button
        onClick={()=>setCollapsed(v=>!v)}
        title={collapsed?'ขยายเมนู (Ctrl+B หรือ [)':'หดเมนู (Ctrl+B หรือ [)'}
        className="hidden lg:flex fixed z-30 w-6 h-12 items-center justify-center bg-white hover:bg-[#FFFBF5] text-slate-500 rounded-r-xl shadow-sm transition-colors"
        style={{left: collapsed? '56px' : '260px', top:'50%', transform:'translateY(-50%)'}}
      >
        {collapsed?'›':'‹'}
      </button>

      <aside className={`${collapsed?'w-[56px]':'w-[260px]'} shrink-0 bg-white flex flex-col
        ${mobileOpen ? 'fixed inset-y-0 left-0 z-50 overflow-auto w-[260px]' : 'hidden lg:flex'}
        transition-all duration-200`}>
        <div className="flex-1 overflow-auto">
          {Nav}
        </div>
      </aside>
    </>
  );
}
