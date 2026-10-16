'use client';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import HomePanel from '@/components/HomePanel';

export const dynamic = 'force-dynamic';

// หน้าแรก — เนื้อหาหลักอยู่ในคอมโพเนนต์ HomePanel (ใช้ซ้ำเป็นแท็บในหน้า /network/1x5-autopilot?tab=home ได้)
export default function Home() {
  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      <Header />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        {/* ค่าเริ่มต้น = จักรวาลของเครือข่าย (เหมือนเดิม) */}
        <HomePanel defaultPanel="cosmic" />
      </div>
    </div>
  );
}