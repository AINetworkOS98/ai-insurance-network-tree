'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import AIIntelligentSearch from '@/components/AIIntelligentSearch';
import Link from 'next/link';
import { useT } from '@/i18n';

// หน้าแรก — Header (เมนูหลัก) + Sidebar + ระบบแชตเดียวกับ /chat
// แท็บขวามือ: ค้นหา (ช่องค้นหา AI) + สร้างงาน (ทางลัดสร้างงาน)
export default function Home(){
  const { t } = useT();
  const [authed,setAuthed]=useState<boolean|null>(null);
  const [tab,setTab]=useState<'search'|'create'>('search');
  useEffect(()=>{
    fetch('/api/auth/me', { credentials:'include', cache:'no-store' }).then(r=>setAuthed(r.ok)).catch(()=>setAuthed(false));
  },[]);

  const createActions = [
    { icon:'🧾', label:'สแกนใบเสร็จ', desc:'บันทึกยอดขาย / ผลงาน', href:'/receipts' },
    { icon:'📄', label:'อัปโหลดเอกสาร', desc:'เอกสารการเงิน / ใบเสนอ', href:'/documents' },
    { icon:'👤', label:'เพิ่มผู้สนใจ', desc:'สร้างรายชื่อผู้สนใจใหม่', href:'/prospects' },
    { icon:'📊', label:'สร้างรายงาน', desc:'รายงานยอดและผลงาน', href:'/reports' },
    { icon:'🌐', label:'จัดวางผัง 1:5', desc:'รันจัดวางอัตโนมัติ', href:'/tree' },
  ];

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      <Header/>
      <div className="flex flex-1 min-h-0">
        <Sidebar/>
        <div className="flex-1 flex flex-col min-w-0">
          {authed===false ? (
            <div className="h-[56px] shrink-0" />
          ) : (
            <div className="border-b border-blue-100 bg-white px-4 md:px-6 shrink-0">
              <div className="h-[56px] w-full flex items-center">
                <div>
                  <div className="text-sm font-bold text-slate-800">{tab==='search' ? t('chat_title') : 'สร้างงาน'}</div>
                  <div className="text-[11px] text-slate-400">{tab==='search' ? t('chat_sub') : 'ทางลัดสร้างงาน — เลือกรายการเพื่อเริ่มทำงาน'}</div>
                </div>
              </div>
            </div>
          )}
          {tab==='search' ? (
            <div className="flex-1 overflow-hidden bg-[#fcfdff] flex flex-col">
              <div className="flex-1 overflow-auto px-4 md:px-6 py-6">
                <div className="w-full max-w-[860px] mx-auto h-full">
                  <AIIntelligentSearch variant="chat"/>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto bg-[#fcfdff] p-6">
              <div className="max-w-[720px] mx-auto">
                <h2 className="text-lg font-bold text-slate-800">➕ สร้างงาน</h2>
                <p className="text-xs text-slate-500 mt-1">เลือกงานที่ต้องการสร้าง — ระบบจะพาไปยังหน้าทำงานนั้น</p>
                <div className="mt-4 space-y-2">
                  {createActions.map(a=>(
                    <Link key={a.href} href={a.href} className="flex items-center gap-3 p-4 rounded-xl border bg-white hover:bg-[#f0f7ff] hover:border-blue-200 transition">
                      <span className="text-2xl shrink-0">{a.icon}</span>
                      <div>
                        <div className="text-sm font-semibold text-slate-800">{a.label}</div>
                        <div className="text-xs text-slate-500">{a.desc}</div>
                      </div>
                      <span className="ml-auto text-slate-300 text-lg">›</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* แท็บขวามือ — ค้นหา / สร้างงาน */}
        <div className="shrink-0 w-16 border-l border-blue-100 bg-white flex flex-col items-center py-4 gap-1">
          <button onClick={()=> setTab('search')} className={`w-full flex flex-col items-center gap-0.5 py-3 text-[10px] font-medium ${tab==='search'?'text-sky-700':'text-slate-500 hover:text-slate-700'}`}>
            <span className="text-xl">🔍</span>
            <span>ค้นหา</span>
            {tab==='search' && <span className="w-8 h-0.5 rounded-full bg-sky-500 mt-0.5" />}
          </button>
          <button onClick={()=> setTab('create')} className={`w-full flex flex-col items-center gap-0.5 py-3 text-[10px] font-medium ${tab==='create'?'text-sky-700':'text-slate-500 hover:text-slate-700'}`}>
            <span className="text-xl">➕</span>
            <span>สร้างงาน</span>
            {tab==='create' && <span className="w-8 h-0.5 rounded-full bg-sky-500 mt-0.5" />}
          </button>
        </div>
      </div>
    </div>
  );
}
