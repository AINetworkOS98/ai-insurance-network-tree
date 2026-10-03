'use client';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Net1x5Autopilot from '@/components/Net1x5Autopilot';
import Net1x5Universe from '@/components/Net1x5Universe';

// ระบบบริหารเครือข่าย 1 แตก 5 — เชื่อมต่อสายงานทุกระดับอัตโนมัติ
// Dashboard นี้ทำงานกับ "ข้อมูลจริง" ในฐานข้อมูล (User / TreeNode / TreePlacement / PerformanceLedger)
// วงจรอัตโนมัติ: ตรวจใบเสร็จ → คัดสมาชิกที่ไม่ผ่านเงื่อนไข → เลื่อนผู้มีคุณสมบัติขึ้นแทน → จัดสายงาน 1:5 → แจ้งเตือน
// ลิงก์อ่าน PDF สรุประบบอยู่มุมบนขวาของหน้า (Net1x5Autopilot)
export default function Net1x5AutopilotPage() {
  return (
    <div>
      <Header />
      <div className="flex w-full">
        <Sidebar />
        <main className="flex-1 min-w-0">
          <Net1x5Autopilot />
          {/* ── จักรวาลการสร้างเครือข่าย (ข้อมูลจริง) — แสดงต่อท้ายแดชบอร์ด ── */}
          <Net1x5Universe />
        </main>
      </div>
    </div>
  );
}
