'use client';
import { useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import AIIntelligentSearch from '@/components/AIIntelligentSearch';

export const dynamic = 'force-dynamic';

export default function Home() {
  const [showShortcuts, setShowShortcuts] = useState(true);

  const shortcuts = [
    { href: '/tree',       title: 'ผังเครือข่าย 1 แตก 5',   desc: 'ดูผังสายงานกว้าง 5 คน',                  icon: '🌳' },
    { href: '/recruit',    title: 'ชวนสมาชิกใหม่',          desc: 'ส่งลิงก์ชวนเข้าทีม',                     icon: '🤝' },
    { href: '/register',   title: 'สมัครสมาชิก',            desc: 'สร้างบัญชีเพื่อเข้าระบบ',                 icon: '📝' },
    { href: '/login',      title: 'เข้าสู่ระบบ',            desc: 'อีเมล / Google / Facebook',               icon: '🔑' },
    { href: '/dashboard',  title: 'แดชบอร์ด',             desc: 'ภาพรวมผลงานและรายได้',                  icon: '📊' },
    { href: '/income',     title: 'รายได้',                desc: 'สรุปค่าตอบแทนตามผัง',                   icon: '💰' },
  ];

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      <Header />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <div className="flex-1 flex flex-col min-h-0">
          <AIIntelligentSearch
            variant="hero"
            topContent={
              <div>
                <div className="text-center pt-6">
                  <h1 className="text-xl md:text-2xl font-bold text-slate-800">ค้นหาด้วย AI อัจฉริยะ</h1>
                  <p className="mt-1 text-sm text-slate-500">
                    พิมพ์คำถาม · ค้นหาเว็บ/YouTube · วางตาราง CSV/JSON · แนบไฟล์ PDF/รูป แล้ว AI ช่วยวิเคราะห์ให้ทันที
                  </p>
                </div>
                {showShortcuts && (
                  <div className="mt-4">
                    <div className="flex items-center justify-between max-w-[760px] mx-auto">
                      <span className="text-xs font-semibold text-slate-500">ทางลัดเข้าระบบ</span>
                      <button onClick={() => setShowShortcuts(false)} className="text-[11px] text-slate-400 hover:text-slate-600">ซ่อน</button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 md:grid-cols-3 gap-2 max-w-[760px] mx-auto">
                      {shortcuts.map(s => (
                        <Link key={s.href} href={s.href} className="p-3 rounded-xl bg-[#f0f7ff] border border-[#dbeafe] hover:bg-[#e8f0ff] transition text-left">
                          <div className="text-base">{s.icon}</div>
                          <div className="mt-1 text-xs font-semibold text-slate-800">{s.title}</div>
                          <div className="text-[10px] text-slate-500">{s.desc}</div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}
                {!showShortcuts && (
                  <div className="mt-2 text-center">
                    <button onClick={() => setShowShortcuts(true)} className="text-xs text-slate-400 hover:text-slate-600 underline underline-offset-4">แสดงทางลัด</button>
                  </div>
                )}
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
}