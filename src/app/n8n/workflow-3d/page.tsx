'use client';

import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Workflow3DProcess from '@/components/Workflow3DProcess';

// หน้ากระบวนการทำงาน 3 มิติ — สั่งโดยเจ้าของระบบ: "สร้าง 3D เพื่อบอกกระบวนการทำงาน
// ให้สมาชิกนำไปสร้างระบบต่อไป" (เมนู: n8n Workflow Automation)
export default function Workflow3DPage() {
  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      <Header />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <div className="flex-1 overflow-y-auto overscroll-contain">
          <Workflow3DProcess />
        </div>
      </div>
    </div>
  );
}
