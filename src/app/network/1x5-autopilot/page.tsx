'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Net1x5Autopilot from '@/components/Net1x5Autopilot';
import Net1x5MemberLayers from '@/components/Net1x5MemberLayers';
import HomePanel from '@/components/HomePanel';
import Net1x5Universe from '@/components/Net1x5Universe';

// ระบบบริหารเครือข่าย 1 แตก 5 — เชื่อมต่อสายงานทุกระดับอัตโนมัติ
// Dashboard นี้ทำงานกับ "ข้อมูลจริง" ในฐานข้อมูล (User / TreeNode / TreePlacement / PerformanceLedger)
// วงจรอัตโนมัติ: ตรวจใบเสร็จ → คัดสมาชิกที่ไม่ผ่านเงื่อนไข → เลื่อนผู้มีคุณสมบัติขึ้นแทน → จัดสายงาน 1:5 → แจ้งเตือน
// ลิงก์อ่าน PDF สรุประบบอยู่มุมบนขวาของหน้า (Net1x5Autopilot)
//
// ── แท็บในหน้าเดียว (สไตล์เดียวกับแท็บของหน้าแรก/หน้าสมาชิกทั่วไป) ──
//   1) ระบบ 1 แตก 5 อัตโนมัติ = แดชบอร์ดวงจร 7 ขั้น (ค่าเริ่มต้น)
//   2) สมาชิก 1 แตก 5        = ผังผู้แนะนำ 1 → 5 ครบทุกช่อง (สมาชิกจริงอยู่ในช่องไหนของใคร)
//   3) หน้าแรก               = ค้นหาด้วย AI อัจฉริยะ + ทางลัดเข้าระบบ (คอมโพเนนต์ HomePanel ตัวเดียวกับหน้า /)
//   4) จักรวาลของเครือข่าย    = ฉาก 3 มิติของสมาชิกจริง (ส่วนเดิมท้ายหน้าของเดิม)
// ทุกแท็บมี URL ของตัวเอง (?tab=sys|members|home|cosmic) เปิด/แชร์ลิงก์แล้วเข้าถูกแท็บ และกด back/forward ได้
// ของเดิมไม่ถูกนำออก: แดชบอร์ดยัง mount ไว้เสมอ (ซ่อนด้วย CSS เมื่ออยู่แท็บอื่น) เพื่อให้ตัวเฝ้าความสดของข้อมูลทำงานต่อ
type Panel = 'sys' | 'members' | 'home' | 'cosmic';

const TABS: Array<{ id: Panel; slug: string; label: string; hint: string }> = [
  { id: 'sys', slug: 'sys', label: '🧬 ระบบ 1 แตก 5 อัตโนมัติ', hint: 'แดชบอร์ดวงจร 7 ขั้น (ตรวจใบเสร็จ → คัดออก → เลื่อนตำแหน่ง → จัดสายงาน 1:5)' },
  { id: 'members', slug: 'members', label: '👥 สมาชิก 1 แตก 5', hint: 'ผังผู้แนะนำ 1 → 5 เป็นชั้น ๆ · สมาชิกจริงอยู่ในช่องไหนของใคร' },
  { id: 'home', slug: 'home', label: '🏠 หน้าแรก', hint: 'ค้นหาด้วย AI อัจฉริยะ + ทางลัดเข้าระบบ (เนื้อหาหน้าแรกตัวเดียวกับ /)' },
  { id: 'cosmic', slug: 'cosmic', label: '🪐 จักรวาลของเครือข่าย', hint: 'ฉาก 3 มิติของสมาชิกจริงในผัง 1:5 (ลากหมุน · คลิกดูข้อมูล)' },
];

const slugToPanel = (s: string | null): Panel =>
  s === 'members' ? 'members' : s === 'home' ? 'home' : s === 'cosmic' ? 'cosmic' : 'sys';

export default function Net1x5AutopilotPage() {
  const [panel, setPanel] = useState<Panel>('sys');
  const [tabUrl, setTabUrl] = useState<string>('');

  const panelFromUrl = (): Panel => {
    if (typeof window === 'undefined') return 'sys';
    return slugToPanel(new URLSearchParams(window.location.search).get('tab'));
  };

  const goTab = (p: Panel) => {
    setPanel(p);
    if (typeof window === 'undefined') return;
    const u = new URL(window.location.href);
    u.searchParams.set('tab', p);
    window.history.pushState(null, '', u.pathname + u.search + u.hash);
    setTabUrl(u.pathname + u.search);
  };

  useEffect(() => {
    const p = panelFromUrl();
    setPanel(p);
    if (typeof window !== 'undefined') {
      const u = new URL(window.location.href);
      if (!u.searchParams.get('tab')) { u.searchParams.set('tab', p); window.history.replaceState(null, '', u.pathname + u.search + u.hash); }
      setTabUrl(u.pathname + u.search);
    }
    const onPop = () => {
      setPanel(panelFromUrl());
      if (typeof window !== 'undefined') setTabUrl(window.location.pathname + window.location.search);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeTab = TABS.find((t) => t.id === panel) || TABS[0];

  return (
    <div>
      <Header />
      <div className="flex w-full">
        <Sidebar />
        <main className="flex-1 min-w-0">
          {/* ── แถบแท็บ (สไตล์เดียวกับแท็บของหน้าแรก/หน้าสมาชิกทั่วไป) ── */}
          <div className="bg-[#FCFBF6] border-b border-[#f3e8d3]">
            <div className="max-w-[1400px] mx-auto px-3 sm:px-5 pt-4">
              <div className="flex flex-wrap gap-2 items-center">
                {TABS.map((t) => (
                  <a
                    key={t.id}
                    href={`?tab=${t.slug}`}
                    onClick={(e) => { e.preventDefault(); goTab(t.id); }}
                    aria-pressed={panel === t.id}
                    title={t.hint}
                    className={`px-4 py-2 rounded-full text-sm font-semibold border transition ${
                      panel === t.id
                        ? 'bg-[#475569] text-white border-[#475569]'
                        : 'bg-white text-[#57534e] border-[#f3e8d3] hover:border-sky-300 hover:text-sky-700'
                    }`}
                  >
                    {t.label}
                  </a>
                ))}
                <span className="text-[11px] text-[#78716c] ml-1 hidden sm:inline">{activeTab.hint}</span>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-[11px] mt-2 pb-3">
                <span className="text-[#a8a29e]">ลิงก์แท็บนี้:</span>
                <code className="px-2 py-1 rounded-lg border border-[#f3e8d3] bg-white text-[#57534e] select-all">
                  {tabUrl || '/network/1x5-autopilot'}
                </code>
                <button
                  onClick={() => { if (typeof navigator !== 'undefined' && tabUrl) navigator.clipboard?.writeText(`${window.location.origin}${tabUrl}`); }}
                  className="px-2.5 py-1 rounded-full border border-[#f3e8d3] bg-white text-[#57534e] font-semibold hover:bg-slate-50"
                >⧉ คัดลอกลิงก์แท็บ</button>
                <span className="text-[#a8a29e]">ทุกแท็บใช้ข้อมูลจริงในฐานข้อมูล · เปิด/แชร์ลิงก์แล้วเข้าถูกแท็บทันที</span>
              </div>
            </div>
          </div>

          {/* 1) แดชบอร์ดวงจรอัตโนมัติ — mount ไว้เสมอ (ซ่อนเมื่ออยู่แท็บอื่น) ให้ตัวเฝ้าความสดทำงานต่อ */}
          <div className={panel === 'sys' ? '' : 'hidden'}>
            <Net1x5Autopilot />
          </div>

          {/* 2) สมาชิก 1 แตก 5 — ผังผู้แนะนำ 1 → 5 เป็นชั้น ๆ (สมาชิกจริง) */}
          {panel === 'members' && <Net1x5MemberLayers />}

          {/* 3) หน้าแรก — ค้นหาด้วย AI อัจฉริยะ + ทางลัดเข้าระบบ (คอมโพเนนต์ตัวเดียวกับหน้า /) */}
          {panel === 'home' && (
            <div className="flex flex-col bg-white min-h-[70vh]">
              <HomePanel defaultPanel="cosmic" />
            </div>
          )}

          {/* 4) จักรวาลการสร้างเครือข่าย (ข้อมูลจริง) — ส่วนเดิมของหน้า แสดงเมื่อเลือกแท็บนี้ */}
          {panel === 'cosmic' && <Net1x5Universe />}
        </main>
      </div>
    </div>
  );
}

