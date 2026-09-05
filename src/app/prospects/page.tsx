import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Kanban from '@/components/Kanban';
export default function Prospects(){
  return (
    <div>
      <Header/>
      <div className="flex max-w-[1280px] mx-auto">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-[#0f2040]">ผู้สนใจ (Prospect CRM)</h1>
            <span className="badge-demo">ข้อมูลทดลอง</span>
            <button className="ml-auto px-4 py-2 rounded-full bg-[#0f2040] text-white text-sm">+ เพิ่มผู้สนใจ</button>
            <button className="px-4 py-2 rounded-full border bg-white text-sm">นำเข้า CSV/Excel</button>
          </div>
          <div className="card p-4">
            <div className="flex gap-2 text-sm mb-3">
              <input placeholder="ค้นหาชื่อ อีเมล เบอร์โทร" className="flex-1 border rounded-xl px-3 py-2"/>
              <select className="border rounded-xl px-3 py-2 text-sm"><option>ทุกสถานะ</option><option>New</option><option>Appointment</option></select>
              <button className="px-4 py-2 rounded-xl border bg-white text-sm">ส่งออกตามสิทธิ์</button>
            </div>
            <div className="text-xs text-slate-500 mb-3">ผู้สนใจยังไม่ถือเป็นสมาชิกและไม่อยู่ในต้นไม้ฐาน 5 คน • แปลงเป็นสมาชิกต้องผ่าน OTP + เอกสาร + Admin อนุมัติ</div>
            <Kanban/>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="card p-4">
              <div className="text-sm font-semibold">ปฏิทินนัดหมาย</div>
              <div className="mt-2 text-xs space-y-1">
                <div className="p-2 rounded-lg bg-violet-50 border">10 ก.ย. 10:00 — นัดคุณพิมพ์ใจ (P-1002)</div>
                <div className="p-2 rounded-lg bg-amber-50 border">12 ก.ย. 14:00 — ติดตามคุณอานนท์ (P-1001)</div>
              </div>
            </div>
            <div className="card p-4">
              <div className="text-sm font-semibold">รายการติดตาม</div>
              <div className="mt-2 text-xs text-slate-600">• P-1001 ครบกำหนดติดตาม 12 ก.ย.<br/>• P-1003 ส่งเอกสารเพิ่มเติม</div>
            </div>
            <div className="card p-4">
              <div className="text-sm font-semibold">Dashboard สรุปผล</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-xl bg-slate-50 border p-3">ใหม่ 12</div><div className="rounded-xl bg-emerald-50 border p-3">Converted 3</div>
                <div className="rounded-xl bg-sky-50 border p-3">นัดหมาย 5</div><div className="rounded-xl bg-amber-50 border p-3">Follow-up 7</div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
