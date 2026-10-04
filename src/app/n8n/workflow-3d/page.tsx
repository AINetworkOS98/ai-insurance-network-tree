'use client';

import { useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Workflow3DAll from '@/components/Workflow3DAll';
import Workflow3DProcess from '@/components/Workflow3DProcess';

// หน้ากระบวนการทำงาน 3 มิติ — สั่งโดยเจ้าของระบบ: "สร้าง 3D เพื่อบอกกระบวนการทำงาน
// ให้สมาชิกนำไปสร้างระบบต่อไป" (เมนู: n8n Workflow Automation)
//  • แท็บ 1 "ทุกเวิร์กโฟลว์ n8n" — ฉาก 3 มิติของเวิร์กโฟลว์ทั้งหมดในระบบ (เมนูในหน้านี้เลือกได้ทุกตัว)
//  • แท็บ 2 "กระบวนการทำงานของระบบ" — ฉากอธิบายเส้นทางงาน 7 ขั้นแบบเดิม
// ลิงก์ตรงของแต่ละเวิร์กโฟลว์: /n8n/workflow-3d?wf=<id>
export default function Workflow3DPage() {
  const [tab, setTab] = useState<'all' | 'process'>('all');

  return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
      <Header />
      <div className="flex flex-1 min-h-0">
        <Sidebar />
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {/* สลับมุมมองภายในหน้าเดียวกัน */}
          <div className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 px-4 py-2 backdrop-blur sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-[1500px] gap-2">
              <button
                onClick={() => setTab('all')}
                className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${tab === 'all' ? 'bg-[#0b1220] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                🧊 ทุกเวิร์กโฟลว์ n8n (3D)
              </button>
              <button
                onClick={() => setTab('process')}
                className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${tab === 'process' ? 'bg-[#0b1220] text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                🧭 กระบวนการทำงานของระบบ (7 ขั้น)
              </button>
            </div>
          </div>

          {tab === 'all' ? <Workflow3DAll /> : <Workflow3DProcess />}
        </div>
      </div>
    </div>
  );
}
