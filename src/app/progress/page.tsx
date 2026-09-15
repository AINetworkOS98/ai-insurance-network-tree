'use client';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
export default function ProgressPage(){
  const steps=[
    { name:'ตัวแทน', need:'สมัคร + อบรมพื้นฐาน', have: true },
    { name:'ผู้บริหารหน่วย', need:'ทีม Active 15 คน + ผลงาน ฿500k', have: false, progress: 80 },
    { name:'ผู้บริหารศูนย์', need:'ทีม 50 คน + ผลงาน ฿2M', have: false, progress: 30 },
    { name:'ผู้บริหารภาค', need:'ทีม 150 คน', have: false, progress: 10 },
    { name:'ผู้จัดการฝ่าย', need:'ทีม 400 คน', have: false, progress: 5 },
    { name:'ผู้อำนวยการ', need:'ทีม 800 คน', have: false, progress: 2 },
  ];
  return (
    <div>
      <Header/>
      <div className="flex w-full">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-[#475569]">ความก้าวหน้า ⬆</h1>
            <span className="badge-demo">เส้นทางตำแหน่ง</span>
          </div>
          <div className="card p-5">
            <div className="text-sm font-semibold text-[#475569]">Progress ไปตำแหน่งถัดไป</div>
            <div className="mt-4 space-y-3">
              {steps.map((s,i)=>(
                <div key={s.name} className={`p-4 rounded-xl border flex items-center gap-4 ${s.have?'bg-emerald-50 border-emerald-200':'bg-white'}`}>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${s.have?'bg-emerald-600 text-white':'bg-[#475569] text-white'}`}>{i+1}</div>
                  <div className="flex-1">
                    <div className="font-semibold text-sm">{s.name} {s.have && <span className="ml-2 text-xs px-2 py-0.5 rounded-full bg-emerald-600 text-white">ผ่านแล้ว</span>}</div>
                    <div className="text-xs text-slate-500">{s.need}</div>
                    {!s.have && s.progress!==undefined && (
                      <div className="mt-2 h-2 bg-slate-100 rounded-full overflow-hidden"><div className="h-2 bg-[#c8a84e] rounded-full" style={{width:`${s.progress}%`}}/></div>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">{s.have ? '✓' : `${s.progress||0}%`}</div>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-3">เงื่อนไขปรับได้โดย Admin • ต้องผ่านผู้มีอำนาจอนุมัติ • แสดงสิ่งที่ยังขาดชัดเจน</p>
          </div>
        </main>
      </div>
    </div>
  );
}
