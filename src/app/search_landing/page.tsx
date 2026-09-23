'use client';
import { useState } from 'react';
import Link from 'next/link';
import AIIntelligentSearch from '@/components/AIIntelligentSearch';

export const dynamic = 'force-dynamic';

// หน้าค้นหา (search_landing) — AI ค้นหา + แชท + วิเคราะห์ข้อมูล + ทางลัดระบบ
export default function SearchLanding(){
  const [showShortcuts, setShowShortcuts] = useState(true);

  const shortcuts = [
    { href:'/tree', title:'ผังเครือข่าย 1 แตก 5', desc:'ดูผังสายงานกว้าง 5 คน', icon:'🌳' },
    { href:'/recruit', title:'ชวนสมาชิกใหม่', desc:'ส่งลิงก์ชวนเข้าทีม', icon:'🤝' },
    { href:'/register', title:'สมัครสมาชิก', desc:'สร้างบัญชีเพื่อเข้าระบบ', icon:'📝' },
    { href:'/login', title:'เข้าสู่ระบบ', desc:'อีเมล / Google / Facebook', icon:'🔑' },
    { href:'/dashboard', title:'แดชบอร์ด', desc:'ภาพรวมผลงานและรายได้', icon:'📊' },
    { href:'/income', title:'รายได้', desc:'สรุปค่าตอบแทนตามผัง', icon:'💰' },
  ];

  return (
    <div className="min-h-screen bg-[#ffffff] flex flex-col">
      {/* Top bar */}
      <div className="h-[56px] shrink-0 border-b border-[#dbeafe] bg-white/90 backdrop-blur flex items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="AI Insurance" className="h-8 w-auto bg-white rounded-lg border border-[#dbeafe] object-contain p-0.5"/>
          <span className="text-sm font-bold text-slate-800">AI Insurance Network Tree</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-700">หน้าแรก</Link>
          <Link href="/login" className="px-4 py-2 rounded-full bg-[#475569] text-white text-xs font-semibold hover:bg-slate-800">เข้าสู่ระบบ</Link>
        </div>
      </div>

      <div className="flex-1 w-full max-w-[860px] mx-auto px-4 md:px-6 py-8">
        {/* Hero */}
        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800">ค้นหาด้วย AI อัจฉริยะ</h1>
          <p className="mt-2 text-sm text-slate-500">
            พิมพ์คำถาม · ค้นหาเว็บ/YouTube · วางตาราง CSV/JSON · แนบไฟล์ PDF/รูป แล้ว AI ช่วยวิเคราะห์ให้ทันที
          </p>
        </div>

        {/* AI Search + Chat (แทนกล่องค้นเว็บเก่า) */}
        <div className="mt-6">
          <AIIntelligentSearch variant="hero" topContent={
            showShortcuts ? (
              <div className="mb-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-500">ทางลัดเข้าระบบ</span>
                  <button onClick={()=> setShowShortcuts(false)} className="text-[11px] text-slate-400 hover:text-slate-600">ซ่อน</button>
                </div>
                <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2">
                  {shortcuts.map(s=>(
                    <Link key={s.href} href={s.href} className="p-3 rounded-xl bg-[#f0f7ff] border border-[#dbeafe] hover:bg-[#e8f0ff] transition text-left">
                      <div className="text-base">{s.icon}</div>
                      <div className="mt-1 text-xs font-semibold text-slate-800">{s.title}</div>
                      <div className="text-[10px] text-slate-500">{s.desc}</div>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null
          }/>
        </div>

        {!showShortcuts && (
          <div className="mt-4 text-center">
            <button onClick={()=> setShowShortcuts(true)} className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-4">แสดงทางลัด</button>
          </div>
        )}
      </div>

      <footer className="py-3 text-center text-[11px] text-slate-400 border-t border-[#dbeafe] bg-white">
        <Link href="/privacy" className="hover:underline">นโยบายความเป็นส่วนตัว</Link> • <Link href="/terms" className="hover:underline">ข้อกำหนด</Link> • © 2026 AI Insurance Network Tree
      </footer>
    </div>
  );
}
