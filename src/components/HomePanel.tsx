'use client';

/**
 * HomePanel — เนื้อหาหลักของหน้าแรก (ค้นหาด้วย AI อัจฉริยะ + แท็บ จักรวาลของเครือข่าย ⇄ ทางลัดเข้าระบบ)
 *
 * ● แยกออกมาจาก src/app/page.tsx เพื่อให้ “หน้าแรก” ถูกนำไปใช้ซ้ำได้เป็นแท็บในหน้าอื่น
 *   (หน้า /network/1x5-autopilot?tab=home ใช้คอมโพเนนต์ตัวเดียวกัน ⇒ เห็นเหมือนหน้าแรกจริง ๆ ไม่ใช่คัดลอกโค้ด)
 * ● ค่าเริ่มต้นของแท็บในหน้า = จักรวาลของเครือข่าย (เหมือนหน้าแรก) · หน้าอื่นส่ง defaultPanel มาทับได้
 * ● Header/Sidebar ไม่ได้อยู่ในนี้ — หน้าเจ้าบ้านเป็นคนวาง (กันซ้อนกันสองชั้น)
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AIIntelligentSearch from '@/components/AIIntelligentSearch';
import CosmicNetwork from '@/components/CosmicNetwork';
import Net1x5MemberLayers from '@/components/Net1x5MemberLayers';
import { LiveStamp } from '@/components/LiveStamp';

export type HomePanelId = 'members' | 'cosmic' | 'shortcuts';

// เรียงแท็บ: สมาชิก 1 แตก 5 (สร้างก่อน) → จักรวาลของเครือข่าย → ทางลัดเข้าระบบ
const PANEL_TABS: { id: HomePanelId; label: string; icon: string; hint: string }[] = [
  { id: 'members',   label: 'สมาชิก 1 แตก 5',      icon: '👥', hint: 'ผังสมาชิก 1 แตก 5 เป็นชั้น ๆ (ข้อมูลจริง)' },
  { id: 'cosmic',    label: 'จักรวาลของเครือข่าย', icon: '🌌', hint: 'ฉาก 3 มิติของเครือข่าย 1 แตก 5 (ลากหมุน · คลิกดูข้อมูล)' },
  { id: 'shortcuts', label: 'ทางลัดเข้าระบบ',      icon: '🧭', hint: 'ปุ่มลัดไปหน้าที่ใช้บ่อย' },
];

// แต่ละแท็บมี URL ของตัวเอง (/ 、/?tab=members | cosmic | shortcuts) — เปิด/แชร์ลิงก์แล้วเข้าถูกแท็บ กด back/forward ได้
const slugToPanel = (s: string | null): HomePanelId | null =>
  s === 'members' ? 'members' : s === 'cosmic' ? 'cosmic' : s === 'shortcuts' ? 'shortcuts' : null;

export default function HomePanel({ defaultPanel = 'cosmic' }: { defaultPanel?: HomePanelId }) {
  // ค่าเริ่มต้น = อ่านจาก URL ก่อน (?tab=) ถ้าไม่มีจึงใช้ค่าที่หน้าส่งมา / จักรวาลของเครือข่าย
  const [panel, setPanelState] = useState<HomePanelId>(() => {
    if (typeof window === 'undefined') return defaultPanel;
    return slugToPanel(new URLSearchParams(window.location.search).get('tab')) || defaultPanel;
  });
  const [tabUrl, setTabUrl] = useState<string>('');

  const goTab = (id: HomePanelId) => {
    setPanelState(id);
    if (typeof window === 'undefined') return;
    const u = new URL(window.location.href);
    if (id === defaultPanel) u.searchParams.delete('tab'); else u.searchParams.set('tab', id);
    window.history.pushState(null, '', u.pathname + u.search + u.hash);
    setTabUrl(u.pathname + u.search);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // เปิดหน้ามาแล้วไม่มี ?tab= ให้เติมค่าเริ่มต้นลง URL ทันที (แชร์ลิงก์ได้เสมอ)
    const u = new URL(window.location.href);
    const p = slugToPanel(u.searchParams.get('tab')) || defaultPanel;
    if (!u.searchParams.get('tab')) {
      if (p === defaultPanel) { setTabUrl(u.pathname + u.search); }
      else { u.searchParams.set('tab', p); window.history.replaceState(null, '', u.pathname + u.search + u.hash); setTabUrl(u.pathname + u.search); }
    } else {
      setTabUrl(u.pathname + u.search);
    }
    setPanelState(p);
    const onPop = () => {
      setPanelState(slugToPanel(new URLSearchParams(window.location.search).get('tab')) || defaultPanel);
      setTabUrl(window.location.pathname + window.location.search);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeTab = PANEL_TABS.find(t => t.id === panel) || PANEL_TABS[1];

  // URL ของแต่ละแท็บ (ใช้กับ href จริง เพื่อให้คลิกขวา/คัดลอกลิงก์ได้)
  const urlFor = (id: HomePanelId) => {
    const base = typeof window === 'undefined' ? '/' : window.location.pathname;
    return id === defaultPanel ? base : `${base}?tab=${id}`;
  };

  const shortcuts = [
    { href: '/tree',       title: 'ผังเครือข่าย 1 แตก 5',   desc: 'ดูผังสายงานกว้าง 5 คน',                  icon: '🌳' },
    { href: '/referral',   title: 'ชวนสมาชิก',              desc: 'ส่งลิงก์ชวนเข้าทีม',                     icon: '🤝' },
    { href: '/register',   title: 'สมัครสมาชิก',            desc: 'สร้างบัญชีเพื่อเข้าระบบ',                 icon: '📝' },
    { href: '/login',      title: 'เข้าสู่ระบบ',            desc: 'อีเมล / Google / GitHub',                 icon: '🔑' },
    { href: '/dashboard',  title: 'แดชบอร์ด',             desc: 'ภาพรวมผลงานและรายได้',                  icon: '📊' },
    { href: '/income',     title: 'รายได้',                desc: 'สรุปค่าตอบแทนตามผัง',                   icon: '💰' },
  ];

  return (
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
              {/* เวลาปัจจุบัน (เขตเวลาไทย) — หน้าอื่น ๆ ดึงจาก lib/now ตัวเดียวกันทั้งหมด */}
              <div className="mt-2 text-xs text-slate-500">
                <LiveStamp />
              </div>
            </div>
            {/* ── ปุ่มสลับแท็บ: สมาชิก 1 แตก 5 ⇄ จักรวาลของเครือข่าย ⇄ ทางลัดเข้าระบบ (แท็บละ URL) ── */}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2 max-w-[760px] mx-auto">
              {PANEL_TABS.map((tab) => {
                const active = panel === tab.id;
                const href = tab.id === defaultPanel ? urlFor(defaultPanel) : `?tab=${tab.id}`;
                return (
                  <a
                    key={tab.id}
                    href={href}
                    title={tab.hint}
                    onClick={(e) => { e.preventDefault(); goTab(tab.id); }}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-xs font-semibold transition ${
                      active
                        ? 'border-sky-500 bg-sky-500 text-white shadow-sm'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-sky-300 hover:text-sky-700'
                    }`}
                  >
                    <span>{tab.icon}</span>
                    {tab.label}
                  </a>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-[11px] max-w-[760px] mx-auto">
              <span className="text-slate-400">ลิงก์แท็บนี้:</span>
              <code className="px-2 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 select-all">
                {tabUrl || `/${defaultPanel === 'cosmic' ? '' : `?tab=${defaultPanel}`}`}
              </code>
              <button
                type="button"
                onClick={() => { if (typeof navigator !== 'undefined' && tabUrl) navigator.clipboard?.writeText(`${window.location.origin}${tabUrl}`); }}
                className="px-2.5 py-1 rounded-full border border-slate-200 bg-white text-slate-600 font-semibold hover:bg-slate-50"
              >⧉ คัดลอกลิงก์แท็บ</button>
              <span className="text-slate-400 hidden sm:inline">{activeTab.hint}</span>
            </div>

            {panel === 'members' ? (
              <div className="mt-3 w-full">
                {/* ผังสมาชิก 1 แตก 5 เป็นชั้น ๆ (ข้อมูลจริง · อ่านเท่านั้น) — ผู้ที่ยังไม่เข้าสู่ระบบจะเห็นการ์ดเชิญเข้าสู่ระบบ */}
                <Net1x5MemberLayers embedded />
              </div>
            ) : panel === 'cosmic' ? (
              <div className="mt-3">
                <p className="mx-auto max-w-[760px] text-center text-[11px] font-semibold tracking-wide text-sky-700">
                  หนึ่งคนเชื่อม 5 คน · 5 ขยายเป็น 25 · 25 ขยายเป็น 125 · 125 ขยายเป็น 625
                </p>
                <div className="mt-2">
                  <CosmicNetwork heightClass="h-[38vh] min-h-[300px]" />
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
                  <button onClick={() => goTab('cosmic')} className="text-[11px] text-slate-400 hover:text-slate-600">กลับไปจักรวาล</button>
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
  );
}
