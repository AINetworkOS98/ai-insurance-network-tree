'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import { useT } from '@/i18n';
import { isAdminEmail, isAdminRole } from '@/lib/access-rules';
import { visibleNav, visibleNavCount, NETWORK_GROUP_LABEL, NETWORK_GROUP_KEY, type NavEntry } from '@/lib/navCatalog';
import { rankName } from '@/lib/rankCatalog';

export default function Sidebar(){
  const { t } = useT();
  const path=usePathname();
  const [collapsed,setCollapsed]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [networkOpen,setNetworkOpen]=useState(true);
  const [authed,setAuthed]=useState<boolean|null>(null);
  // ระดับตำแหน่ง + สิทธิ์ผู้ดูแลของ "คนที่ล็อกอินอยู่" — ตัวกำหนดว่าเมนูไหนแสดง (กติกาอยู่ที่ lib/navCatalog.ts)
  const [rank,setRank]=useState(0);
  const [isAdmin,setIsAdmin]=useState(false);
  // หน้าที่มีช่องค้นหา AI (มี data-ai-search) — ปุ่มเมนูลอยจะทับแถวปุ่ม "+"/"↑" ของช่องค้นหา
  // จึงไม่แสดงปุ่มลอยบนหน้านั้น ใช้เมนูด้านบน (Header) แทน
  const [hasAiSearch,setHasAiSearch]=useState(false);

  useEffect(()=>{
    fetch('/api/auth/me', { credentials: 'include', cache:'no-store' })
      .then(async r=>{
        setAuthed(r.ok);
        if(r.ok){
          try{
            const j = await r.json();
            const u = j?.user || {};
            setIsAdmin(isAdminEmail(u.email) || isAdminRole(u.roles ?? j?.roles));
            setRank(typeof u.rankLevel === 'number' ? u.rankLevel : 0);
          }catch{}
        }
      })
      .catch(()=>setAuthed(false));
  },[]);

  // เมนูที่ผู้ใช้คนนี้เห็น (เรียงตามระดับ: หน้าแรก → Admin → ตัวแทน → หน่วย → ศูนย์ → ภาค)
  const navCtx = useMemo(()=>({ rank, isAdmin, authed: authed !== false }), [rank, isAdmin, authed]);
  const groups = useMemo(()=> visibleNav(navCtx), [navCtx]);
  const navCount = useMemo(()=> visibleNavCount(navCtx), [navCtx]);

  useEffect(()=>{
    const check=()=>setHasAiSearch(!!document.querySelector('[data-ai-search]'));
    check();
    const id=setTimeout(check,400);
    return ()=>clearTimeout(id);
  },[path]);

  // ให้เมนูด้านบน (Header) เปิดลิ้นชักเมนูด้านข้างนี้ได้ — event 'hermes:open-sidebar'
  useEffect(()=>{
    const open=()=>setMobileOpen(true);
    window.addEventListener('hermes:open-sidebar', open);
    return ()=>window.removeEventListener('hermes:open-sidebar', open);
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

  // ป้ายเมนู: ใช้คำแปลถ้ามีคีย์ (ถ้าไม่มีคำแปล i18n จะคืนคีย์เดิม → กลับมาใช้ป้ายไทย)
  const label=(e:{key?:string; label:string})=>{
    if(!e.key) return e.label;
    const v = t(e.key);
    return (!v || v===e.key) ? e.label : v;
  };

  const Row=({e, big=false, small=false}:{e:NavEntry; big?:boolean; small?:boolean})=>{
    const active = path===e.href;
    const cls = `flex items-center gap-3 rounded-xl transition-colors ${big?'px-3 py-2.5 text-sm':'px-3 py-2 text-xs'} ${small?'ml-5':''} ${collapsed?'justify-center px-2 ml-0':''} ${active?'bg-[#eff6ff] text-sky-700 font-semibold':'hover:bg-[#FFFBF5] text-slate-600'}`;
    const inner = (<>
      <span className={`${small?'w-4':'w-5'} text-center shrink-0`}>{e.icon}</span>
      {!collapsed && <span className="truncate">{label(e)}</span>}
      {!collapsed && e.external && <span className="shrink-0 text-[10px] text-slate-400">↗</span>}
      {!collapsed && active && !e.external && <span className="ml-auto text-[10px]">●</span>}
    </>);
    if(e.external){
      return <a href={e.href} target="_blank" rel="noopener noreferrer" title={collapsed?label(e):undefined} className={cls}>{inner}</a>;
    }
    return <Link href={e.href} onClick={()=>setMobileOpen(false)} title={collapsed?label(e):undefined} className={cls}>{inner}</Link>;
  };

  const Nav = (
    <div className={`p-3 space-y-1 ${collapsed?'px-2':''}`}>
      {/* ถ้ายังไม่ล็อกอิน — ไม่แสดงเมนูอะไรเลย */}
      {authed===false ? null : (
        <>
          {groups.map(g=>(
            <div key={g.section.id} className={g.section.id==='home'?'':"mt-1"}>
              {!collapsed && g.section.id!=='home' && (
                <div className="text-[10px] tracking-widest text-slate-400 px-3 pb-1 pt-2 flex items-center gap-1">
                  <span>{label(g.section)}</span>
                  {g.section.minRank>0 && <span className="text-[9px] text-slate-300">ระดับ {g.section.minRank}+</span>}
                </div>
              )}
              {g.items.map(e=> <Row key={e.section+e.href} e={e} big={g.section.id!=='center'} />)}

              {/* กลุ่มย่อย "สร้างเครือข่าย" */}
              {g.network.length>0 && (
                <div className={`${collapsed?'px-1':''} mt-1`}>
                  <button
                    onClick={()=> collapsed ? setCollapsed(false) : setNetworkOpen(v=>!v)}
                    title={collapsed?label({key:NETWORK_GROUP_KEY,label:NETWORK_GROUP_LABEL}):undefined}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${collapsed?'justify-center px-2':''} ${(path?.startsWith('/network')||path==='/referral') ?'bg-[#eff6ff] text-sky-700 font-semibold':'hover:bg-[#FFFBF5] text-slate-600'}`}>
                    <span className="w-5 text-center shrink-0">🌐</span>
                    {!collapsed && <span className="flex-1 text-left truncate">{label({key:NETWORK_GROUP_KEY,label:NETWORK_GROUP_LABEL})}</span>}
                    {!collapsed && <span className={`text-xs transition-transform duration-200 ${networkOpen?'rotate-90':''}`}>›</span>}
                  </button>
                  {!collapsed && networkOpen && (
                    <div className="mt-1 space-y-1">
                      {g.network.map(e=> <Row key={e.href} e={e} small />)}
                    </div>
                  )}
                  {collapsed && (
                    <div className="mt-1 flex flex-col items-center gap-1">
                      {g.network.map(e=> <Row key={e.href} e={e} small />)}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </>
      )}
      {!collapsed && authed!==false && (
        <div className="pt-4 mt-4 px-3 text-[11px] text-slate-400">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
              {isAdmin ? 'ผู้ดูแลระบบ' : `ระดับ: ${rankName(rank as 0|1|2|3|4)}`}
            </span>
            <span className="text-[10px] text-slate-400">เห็น {navCount} เมนู</span>
          </div>
          <div className="pt-2">กด <kbd className="px-1.5 py-0.5 bg-slate-100 border rounded text-[10px]">Ctrl</kbd>+<kbd className="px-1.5 py-0.5 bg-slate-100 border rounded text-[10px]">B</kbd> หรือ <kbd className="px-1.5 py-0.5 bg-slate-100 border rounded text-[10px]">[</kbd> เพื่อหด/ขยาย</div>
        </div>
      )}
    </div>
  );

  // หน้าแรกตอนยังไม่ล็อกอิน — ซ่อน Sidebar ทั้งแถบ (ว่างเปล่าแต่กินพื้นที่ดันแชต)
  // กล่องแชตจะได้อยู่กลางหน้าจอจริง
  if(path==='/' && authed===false) return null;

  return (
    <>
      {/* Mobile toggle — ซ่อนเมื่อหน้ามีช่องค้นหา AI (ปุ่มลอยจะทับแถวปุ่ม "+"/"↑") และยกให้พ้นแถบผู้เยี่ยมชม (fixed bottom-0 สูง ~37px) */}
      {!hasAiSearch && <button onClick={()=>setMobileOpen(v=>!v)} aria-label="เปิดเมนูด้านข้าง" className="lg:hidden fixed bottom-14 right-4 z-[60] w-12 h-12 rounded-full bg-[#475569] text-white shadow-lg flex items-center justify-center text-xl">☰</button>}
      {mobileOpen && <div onClick={()=>setMobileOpen(false)} className="lg:hidden fixed inset-0 bg-black/40 z-[55]"/>}
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
        ${mobileOpen ? 'fixed inset-y-0 left-0 z-[60] overflow-auto w-[260px]' : 'hidden lg:flex'}
        transition-all duration-200`}>
        <div className="flex-1 overflow-auto">
          {Nav}
        </div>
      </aside>
    </>
  );
}
