'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import AIIntelligentSearch from '@/components/AIIntelligentSearch';
import { useT } from '@/i18n';

// หน้าแรก — Header (เมนูหลัก) + Sidebar + ระบบแชตเดียวกับ /chat
// ยังไม่เข้าระบบ — ไม่แสดงข้อความหัวข้อแชต
export default function Home(){
  const { t } = useT();
  const [authed,setAuthed]=useState<boolean|null>(null);
  useEffect(()=>{
    fetch('/api/auth/me', { credentials:'include', cache:'no-store' }).then(r=>setAuthed(r.ok)).catch(()=>setAuthed(false));
  },[]);
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
              <div className="h-[56px] w-full max-w-[860px] mx-auto flex items-center">
                <div>
                  <div className="text-sm font-bold text-slate-800">{t('chat_title')}</div>
                  <div className="text-[11px] text-slate-400">{t('chat_sub')}</div>
                </div>
                <div className="ml-auto text-[11px] text-slate-400 hidden md:block">กด <kbd className="px-1 py-0.5 bg-slate-100 border rounded text-[10px]">Ctrl</kbd>+<kbd className="px-1 py-0.5 bg-slate-100 border rounded text-[10px]">B</kbd> หด/ขยายเมนู</div>
              </div>
            </div>
          )}
          <div className="flex-1 overflow-hidden bg-[#fcfdff] flex flex-col">
            <div className="flex-1 overflow-auto px-4 md:px-6 py-6">
              <div className="w-full max-w-[860px] mx-auto h-full">
                <AIIntelligentSearch variant="chat"/>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
