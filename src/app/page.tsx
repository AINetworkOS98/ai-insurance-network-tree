'use client';
import { useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import AIIntelligentSearch from '@/components/AIIntelligentSearch';
import CosmicNetwork from '@/components/CosmicNetwork';

export const dynamic = 'force-dynamic';

type HomePanel = 'cosmic' | 'shortcuts';

const PANEL_TABS: { id: HomePanel; label: string; icon: string }[] = [
  { id: 'cosmic',    label: 'จักรวาลของเครือข่าย', icon: '🌌' },
  { id: 'shortcuts', label: 'ทางลัดเข้าระบบ',      icon: '🧭' },
];

export default function Home() {
  // ค่าเริ่มต้น = จักรวาลของเครือข่าย (รันก่อน) · กดปุ่มเพื่อสลับไปทางลัดเข้าระบบ
  const [panel, setPanel] = useState<HomePanel>('cosmic');

  const shortcuts = [
    { href: '/tree',       title: 'ผังเครือข่าย 1 แตก 5',   desc: 'ดูผังสายงานกว้าง 5 คน',                  icon: '🌳' },
    { href: '/referral',   title: 'ชวนสมาชิก',              desc: 'ส่งลิงก์ชวนเข้าทีม',                     icon: '🤝' },
    { href: '/register',   title: 'สมัครสมาชิก',            desc: 'สร้างบัญชีเพื่อเข้าระบบ',                 icon: '📝' },
    { href: '/login',      title: 'เข้าสู่ระบบ',            desc: 'อีเมล / Google / GitHub',                 icon: '🔑' },
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
                {/* ── ปุ่มสลับ: จักรวาลของเครือข่าย ⇄ ทางลัดเข้าระบบ (จักรวาลรันก่อน) ── */}
                <div className="mt-4 flex items-center justify-center gap-2 max-w-[760px] mx-auto">
                  {PANEL_TABS.map((tab) => {
                    const active = panel === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setPanel(tab.id)}
                        aria-pressed={active}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                          active
                            ? 'border-sky-500 bg-sky-500 text-white shadow-sm'
                            : 'border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700'
                        }`}
                      >
                        <span>{tab.icon}</span>
                        {tab.label}
                      </button>
                    );
                  })}
                </div>

                {panel === 'cosmic' ? (
                  <div className="mt-3">
                    <p className="mx-auto max-w-[760px] text-center text-[11px] font-semibold tracking-wide text-sky-700">
                      หนึ่งคนเชื่อม 5 คน · 5 ขยายเป็น 25 · 25 ขยายเป็น 125 · 125 ขยายเป็น 625
                    </p>
                    <div className="mt-2">
                      <CosmicNetwork heightClass="h-[44vh] min-h-[300px]" />
                    </div>
                    <p className="mx-auto mt-2 max-w-[760px] text-center text-[10px] leading-relaxed text-slate-500">
                      ภาพจำลองโครงสร้างเครือข่าย 1 แตก 5 (781 โหนดตัวอย่าง) — ลากเพื่อหมุนจักรวาล ซูมเข้า-ออก
                      คลิกสมาชิกเพื่อดูข้อมูล · ชื่อและตัวเลขทั้งหมดเป็นข้อมูลตัวอย่าง ไม่ใช่สมาชิกจริง
                      ไม่ใช่การรับประกันรายได้ ค่าคอมมิชชั่น หรือผลตอบแทน · ดูเวอร์ชันเต็มได้ที่หน้า
                      <Link href="/financial-freedom" className="ml-1 text-sky-700 underline underline-offset-2">
                        อิสรภาพทางการเงิน
                      </Link>
                    </p>
                  </div>
                ) : (
                  <div className="mt-3">
                    <div className="flex items-center justify-between max-w-[760px] mx-auto">
                      <span className="text-xs font-semibold text-slate-500">ทางลัดเข้าระบบ</span>
                      <button onClick={() => setPanel('cosmic')} className="text-[11px] text-slate-400 hover:text-slate-600">กลับไปจักรวาล</button>
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
              </div>
            }
          />
        </div>
      </div>
    </div>
  );
}