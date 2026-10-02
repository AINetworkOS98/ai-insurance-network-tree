'use client';
import { useEffect, useRef, useState } from 'react';
import { LANGS, getLang, setLang } from '@/i18n';

// เมนูแปลภาษาแบบ dropdown — ธงชาติ + ชื่อภาษาทั่วโลก
export default function LanguageMenu(){
  const [lang, setL] = useState(getLang());
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const cur = LANGS.find(l=> l.code===lang) || LANGS[0];

  useEffect(()=>{
    const h = (e:any)=> setL(e.detail || getLang());
    window.addEventListener('app-lang-change', h);
    const close = (e:MouseEvent)=>{ if(ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return ()=>{ window.removeEventListener('app-lang-change', h); document.removeEventListener('mousedown', close); };
  },[]);

  return (
    <div ref={ref} className="relative">
      <button onClick={()=> setOpen(v=>!v)} title="เปลี่ยนภาษา / Language"
        className="flex items-center gap-1.5 px-3 py-2 rounded-full border border-[#e8eef5] bg-white text-xs font-semibold text-slate-700 hover:bg-[#f8fafc] shadow-sm">
        <span className="text-base leading-none">{cur.flag}</span>
        <span className="hidden sm:inline uppercase">{cur.code}</span>
        <span className={`text-[10px] transition-transform ${open?'rotate-180':''}`}>▾</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-52 max-h-[320px] overflow-auto rounded-xl border bg-white shadow-lg p-1.5 z-50">
          {LANGS.map(l=>(
            <button key={l.code} onClick={()=>{ setLang(l.code); setL(l.code); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs hover:bg-slate-50 ${l.code===lang?'bg-[#eff6ff] font-bold text-sky-700':''}`}>
              <span className="text-base leading-none w-6 text-center">{l.flag}</span>
              <span className="flex-1 text-left">{l.name}</span>
              {l.code===lang && <span>✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
