'use client';

import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import AutomationShowcase from '@/components/AutomationShowcase';
import SuccessPath from '@/components/SuccessPath';
import TikTokChannel from '@/components/TikTokChannel';
import FinancialFreedomVideo from '@/components/FinancialFreedomVideo';
import CosmicNetwork from '@/components/CosmicNetwork';

export default function FinancialFreedom() {
  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      <Header />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <div className="flex-1 overflow-y-auto p-6 md:p-10">
          {/* Hero Section */}
          <div className="max-w-4xl mx-auto mb-12">
            <div className="text-center mb-8">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#475569]/10 text-[#475569] text-sm font-semibold mb-4 border border-[#475569]/20">
                <span>🌟</span> วิสัยทัศน์หลัก
              </div>
              <h1 className="text-3xl md:text-5xl font-bold text-slate-900 leading-tight">
                ก้าวสู่อิสรภาพทางการเงิน
              </h1>
              <p className="mt-4 text-lg text-slate-600 max-w-2xl mx-auto">
                จากการสร้างทีม → สู่ระบบที่ทำงานต่อเนื่อง — เมื่อเครือข่ายเติบโต การทำงานไม่ควรเพิ่มขึ้นตามจำนวนสมาชิกแบบตรง ๆ
              </p>
            </div>

            {/* ขั้นตอนที่ 1 */}
            <div className="bg-gradient-to-br from-slate-50 to-white rounded-2xl border border-slate-200 p-6 md:p-8 mb-8 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg font-bold">1</div>
                <h2 className="text-xl font-bold text-slate-800">เริ่มต้นด้วยตัวเอง</h2>
              </div>
              <p className="text-slate-600 leading-relaxed mb-4">
                อิสรภาพทางการเงินไม่ใช่จุดหมายปลายทาง — มันคือกระบวนการที่เริ่มต้นจากความรับผิดชอบทางการเงินของตัวเองก่อน
                ทำความเข้าใจกระแสเงินสด มีเงินเก็บฉุกเฉิน และลดหนี้ที่ไม่จำเป็นออกให้ได้
              </p>
              <ul className="list-disc list-inside text-slate-600 space-y-2 text-sm">
                <li>ตั้งเป้าหมายทางการเงินที่วัดผลได้</li>
                <li>จัดทำงบประมาณรายรับ-รายจ่าย</li>
                <li>สร้างเงินเก็บฉุกเฉินอย่างน้อย 3-6 เดือน</li>
                <li>ชำระหนี้ดอกเบี้ยสูงก่อน</li>
              </ul>
            </div>

            {/* ขั้นตอนที่ 2 */}
            <div className="bg-gradient-to-br from-slate-50 to-white rounded-2xl border border-slate-200 p-6 md:p-8 mb-8 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg font-bold">2</div>
                <h2 className="text-xl font-bold text-slate-800">สร้างรายได้เสริม</h2>
              </div>
              <p className="text-slate-600 leading-relaxed mb-4">
                เมื่อพื้นฐานมั่นคงแล้ว ขั้นตอนต่อไปคือการสร้างช่องทางรายได้เสริมที่ไม่ขึ้นอยู่กับเงินเดือนเพียงอย่างเดียว
                ไม่ว่าจะเป็นงานฟรีแลนซ์ ธุรกิจออนไลน์ การลงทุน หรือการสร้างเครือข่ายธุรกิจ
              </p>
              <ul className="list-disc list-inside text-slate-600 space-y-2 text-sm">
                <li>สำรวจทักษะที่สามารถสร้างรายได้เสริม</li>
                <li>เริ่มจากช่องทางที่เข้าใจและทำได้จริง</li>
                <li>นำรายได้เสริมไปออมและลงทุนต่อ</li>
              </ul>
            </div>

            {/* ขั้นตอนที่ 3 */}
            <div className="bg-gradient-to-br from-slate-50 to-white rounded-2xl border border-slate-200 p-6 md:p-8 mb-8 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg font-bold">3</div>
                <h2 className="text-xl font-bold text-slate-800">สร้างเครือข่ายที่แข็งแกร่ง</h2>
              </div>
              <p className="text-slate-600 leading-relaxed mb-4">
                อิสรภาพทางการเงินมักเกิดจากความสามารถในการสร้างระบบ — ไม่ว่าจะเป็นทีมงาน ธุรกิจที่ขยายตัว หรือเครือข่ายคนที่มีเป้าหมายเดียวกัน
                การสร้างทีมที่น่าเชื่อถือช่วยให้เราขยายรายได้โดยไม่ต้องทำงานทุกอย่างด้วยตัวเอง
              </p>
              <ul className="list-disc list-inside text-slate-600 space-y-2 text-sm">
                <li>หาคนที่มีวิสัยทัศน์และค่านิยมเดียวกัน</li>
                <li>มอบหมายงานอย่างเหมาะสมและไว้วางใจ</li>
                <li>พัฒนาระบบการทำงานให้ชัดเจนและต่อเนื่อง</li>
              </ul>
            </div>

            {/* ขั้นตอนที่ 4 */}
            <div className="bg-gradient-to-br from-slate-50 to-white rounded-2xl border border-slate-200 p-6 md:p-8 mb-8 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-lg font-bold">4</div>
                <h2 className="text-xl font-bold text-slate-800">ลงทุนเพื่ออนาคต</h2>
              </div>
              <p className="text-slate-600 leading-relaxed mb-4">
                เมื่อรายได้เพิ่มขึ้น การลงทุนคือกุญแจสำคัญที่ทำให้เงินทำงานให้เราแทน การลงทุนที่เข้าใจความเสี่ยงและกระจาย Portfolios
                จะช่วยสร้าง passive income ที่นำไปสู่อิสรภาพทางการเงินอย่างแท้จริง
              </p>
              <ul className="list-disc list-inside text-slate-600 space-y-2 text-sm">
                <li>เรียนรู้การลงทุนก่อนลงมือทำจริง</li>
                <li>กระจายความเสี่ยงด้วยการลงทุนหลายช่องทาง</li>
                <li>นำผลกำไรไปลงทุนต่อแบบ compound</li>
              </ul>
            </div>

            {/* ── ต่อลงมา: เห็นระบบอัตโนมัติทำงานจริง (สุ่มตัวอย่างจริงทีละ 1 รายการ) ── */}
            <div className="mb-3">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-50 text-emerald-700 text-sm font-semibold border border-emerald-200">
                <span>⚙️</span> ขั้นตอนที่ 3 ที่ทำงานแทนคุณ
              </div>
              <h2 className="mt-4 text-2xl font-bold text-slate-900">เมื่อชวนสมาชิกเข้าระบบ — ระบบทำงานต่อให้เอง</h2>
              <p className="mt-2 text-slate-600 leading-relaxed">
                ทุกครั้งที่มีคนสนใจจากลิงก์ชวนของคุณ ระบบอัตโนมัติจะรับลีด ให้คะแนนด้วย AI มอบงานให้ตัวแทน
                ติดตามตามกำหนด นัดหมาย เตือน และสรุปผลให้ทุกวัน — ด้านล่างคือ <strong>ตัวอย่างจริงจากฐานระบบ</strong>
                ที่หมุนให้ดูทีละรายการ เลือกดูแต่ละขั้นตอนได้จากปุ่มด้านบน
              </p>
            </div>
            <AutomationShowcase />

            {/* ── ต่อลงมา: เส้นทางก้าวสู่ความสำเร็จ (แผนที่ · หลักการในฟองสบู่ · แนะนำ · หลักการทำงาน 12 ข้อ) ── */}
            <SuccessPath />

            <FinancialFreedomVideo />

            {/* ── ต่อลงมา: ช่องดูวีดีโอ TikTok @aka989._ แบบสุ่มต่อเนื่อง ── */}
            <TikTokChannel />

            {/* ── (นำออกแล้ว) ส่วน 1 แตก 5 – Future Network Simulator — ซ้ำซ้อนกับระบบ 1 แตก 5 อัตโนมัติที่ /network/1x5-autopilot ── */}

            {/* ── ต่อลงมาล่างสุด: จักรวาลเครือข่าย 3 มิติ (Interactive Cosmic Network) ── */}
            <div className="mt-14 mb-5">
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-sky-50 text-sky-700 text-sm font-semibold border border-sky-200">
                <span>🌌</span> จักรวาลของเครือข่าย
              </div>
              <h2 className="mt-4 text-2xl font-bold text-slate-900">
                หนึ่งคนเชื่อม 5 คน · 5 ขยายเป็น 25 · 25 ขยายเป็น 125 · 125 ขยายเป็น 625
              </h2>
              <p className="mt-2 text-slate-600 leading-relaxed">
                นี่ไม่ใช่แผนผังแบบเดิม — แต่เป็น <strong>จักรวาลของเครือข่าย</strong> ที่สมาชิกแต่ละคนเป็นทรงกลมพลังงาน
                เชื่อมกันด้วยเส้นแสงที่มีพลังงานไหลจากผู้แนะนำไปยังสมาชิกใหม่ ฉากนี้เป็น
                <strong> แบบจำลองเพื่อสาธิตโครงสร้าง 1 แตก 5</strong> (ข้อมูลตัวอย่าง ไม่ใช่ข้อมูลสมาชิกจริง และไม่สื่อถึงรายได้หรือผลตอบแทนใด ๆ)
                — ลากเพื่อหมุนจักรวาล ซูมเข้า-ออก คลิกสมาชิกเพื่อดูข้อมูล และกด “เพิ่มสมาชิกใหม่” เพื่อเห็นเครือข่ายขยายอีกหนึ่งระดับ
              </p>
            </div>
            <div className="-mx-6 md:-mx-10 mb-10">
              <CosmicNetwork />
              <p className="mt-3 px-3 text-center text-[11px] text-slate-500">
                ภาพจำลอง 781 โหนดเริ่มต้น (1 → 5 → 25 → 125 → 625) · ชื่อและตัวเลขทั้งหมดเป็นข้อมูลตัวอย่างเพื่อสาธิตโครงสร้างเครือข่าย
                ไม่ใช่สมาชิกจริง ไม่ใช่การรับประกันรายได้ ค่าคอมมิชชั่น หรือผลตอบแทน · ชื่อที่แสดงถูกสร้างขึ้นเพื่อการสาธิตเท่านั้น
              </p>
            </div>

            {/* ── คำขวัญปิดท้าย ── */}
            <div className="text-center mb-10">
              <p className="text-[11px] font-semibold tracking-[0.28em] text-sky-700">ONE PERSON</p>
              <p className="text-[11px] font-semibold tracking-[0.28em] text-sky-700 mt-1">ONE CONNECTION</p>
              <p className="text-[11px] font-semibold tracking-[0.28em] text-sky-700 mt-1">ONE NETWORK</p>
              <p className="mt-2 text-lg font-bold tracking-[0.14em] text-slate-900">INFINITE POSSIBILITY</p>
            </div>

            {/* ข้อความสุดท้าย */}
            <div className="text-center mt-10 p-6 bg-[#475569]/5 rounded-2xl border border-[#475569]/10">
              <p className="text-slate-700 text-lg italic">
                "อิสรภาพทางการเงินไม่ใช่แค่การมีเงินมากมาย — แต่คือการมีทางเลือกที่จะใช้เวลาของคุณอย่างที่คุณต้องการ"
              </p>
            </div>

            {/* ปุ่มกลับหน้าแรก */}
            <div className="text-center mt-8">
              <a
                href="/"
                className="inline-flex items-center gap-2 px-6 py-3 bg-[#475569] text-white rounded-full text-sm font-semibold hover:bg-slate-800 transition shadow-sm"
              >
                ← กลับสู่หน้าแรก
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
