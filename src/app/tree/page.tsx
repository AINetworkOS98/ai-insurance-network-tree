import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import TreeView from '@/components/TreeView';
export default function TreePage(){
  return (
    <div>
      <Header/>
      <div className="flex max-w-[1280px] mx-auto">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-[#0f2040]">ผังเครือข่าย — ฐานกว้าง 5 คน</h1>
            <span className="badge-demo">ข้อมูลทดลอง</span>
            <span className="text-xs text-slate-500">Strict History (default)</span>
          </div>
          <div className="card p-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <input placeholder="ค้นหาชื่อหรือ Member ID" className="border rounded-xl px-3 py-2 flex-1 min-w-[200px]"/>
              <select className="border rounded-xl px-3 py-2"><option>ทุกสถานะ</option><option>Active</option><option>Pending</option></select>
              <select className="border rounded-xl px-3 py-2"><option>ทุกตำแหน่ง</option><option>ตัวแทน</option><option>ผู้บริหารหน่วย</option></select>
              <button className="px-4 py-2 rounded-xl bg-[#0f2040] text-white">ค้นหา</button>
            </div>
          </div>
          <TreeView/>
        </main>
      </div>
    </div>
  );
}
