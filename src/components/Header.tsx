'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
export default function Header(){
  const [unread, setUnread] = useState<number|null>(null);
  useEffect(()=>{ (async()=>{ try{ const r=await fetch('/api/notifications'); const j=await r.json(); if(j.ok) setUnread(j.unread); }catch{} })(); },[]);
  return (
    <header className="bg-[#0f2040] text-white sticky top-0 z-40">
      <div className="max-w-[1280px] mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <img src="/logo.png" alt="AI Insurance Network Tree" className="h-9 w-auto bg-white rounded-xl px-1 py-1 object-contain" />
          <div>
            <div className="font-bold leading-none text-sm">AI Insurance Network Tree</div>
            <div className="text-[11px] opacity-70">ระบบบริหารเครือข่ายตัวแทน • ต้นไม้ฐาน 5 คน</div>
          </div>
        </Link>
        <nav className="hidden md:flex gap-5 text-sm items-center">
          <Link href="/" className="opacity-80 hover:opacity-100">หน้าแรก</Link>
          <Link href="/verify" className="opacity-80 hover:opacity-100">ตรวจสมาชิก</Link>
          <Link href="/prospects" className="opacity-80 hover:opacity-100">ผู้สนใจ</Link>
          <Link href="/tree" className="opacity-80 hover:opacity-100">ผังเครือข่าย</Link>
          <Link href="/income" className="opacity-80 hover:opacity-100">รายได้</Link>
          <Link href="/admin" className="opacity-80 hover:opacity-100">ผู้ดูแล</Link>
          <Link href="/notifications" className="relative opacity-80 hover:opacity-100">🔔 แจ้งเตือน {unread!=null && unread>0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[11px]">{unread}</span>}</Link>
          <a href="https://ai-insurance-network-3cp54o23p-ak-e11e.vercel.app/" target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-full border border-white/30 text-xs hover:bg-white/10">↩ กลับระบบเก่า</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/register" className="px-4 py-2 rounded-full bg-[#c8a84e] text-[#0f2040] text-sm font-semibold">สมัครแสดงความสนใจ</Link>
        </div>
      </div>
    </header>
  );
}
