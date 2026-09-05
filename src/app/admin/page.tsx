import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
export default function Admin(){
  return (
    <div>
      <Header/>
      <div className="flex max-w-[1280px] mx-auto">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-6">
          <h1 className="text-xl font-bold text-[#0f2040]">ผู้ดูแลระบบ — Admin Dashboard</h1>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-5">
              <div className="font-semibold">อนุมัติสมาชิก</div>
              <div className="mt-2 text-xs space-y-2">
                <div className="flex items-center justify-between p-2 rounded-xl bg-amber-50 border"><span>P-1003 ธนพล — รอตรวจสอบเอกสาร</span><button className="px-3 py-1 rounded-full bg-emerald-600 text-white">อนุมัติ</button></div>
                <div className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border"><span>P-1004 — เอกสารไม่ครบ</span><button className="px-3 py-1 rounded-full border">ขอเอกสารเพิ่ม</button></div>
              </div>
            </div>
            <div className="card p-5">
              <div className="font-semibold">Income Rule (Versioned)</div>
              <div className="mt-2 text-xs">
                <div className="p-2 rounded-xl bg-slate-50 border">v2.1 — มีผล 2026-09-01 — personal 25% • unit 3% • center 2%</div>
                <button className="mt-2 px-3 py-1.5 rounded-full bg-[#0f2040] text-white">สร้างเวอร์ชันใหม่</button>
                <span className="ml-2 text-[11px] text-slate-500">อัตราปรับได้ ไม่ hard-code</span>
              </div>
            </div>
            <div className="card p-5">
              <div className="font-semibold">Placement Policy</div>
              <div className="mt-2 text-xs">
                <label className="flex items-center gap-2"><input type="radio" defaultChecked/> Strict History (default)</label>
                <label className="flex items-center gap-2 mt-1"><input type="radio"/> Vacancy Refill (ต้องอนุมัติ)</label>
              </div>
            </div>
            <div className="card p-5">
              <div className="font-semibold">อีเมล — สถิติ</div>
              <div className="mt-2 grid grid-cols-4 gap-2 text-xs text-center">
                <div className="rounded-xl bg-emerald-50 border p-2">Delivered<br/><b>1,240</b></div>
                <div className="rounded-xl bg-sky-50 border p-2">Opened<br/><b>820</b></div>
                <div className="rounded-xl bg-amber-50 border p-2">Failed<br/><b>12</b></div>
                <div className="rounded-xl bg-red-50 border p-2">Bounced<br/><b>3</b></div>
              </div>
              <button className="mt-2 px-3 py-1.5 rounded-full border bg-white text-xs">ดูประวัติ / ส่งใหม่ / Suppression List</button>
            </div>
          </div>
          <div className="card p-5">
            <div className="font-semibold">Permission Matrix (Dynamic RBAC)</div>
            <p className="text-xs text-slate-500">Super Admin สร้างระดับใหม่ได้ไม่จำกัด • กำหนดสี ไอคอน ลำดับ สิทธิ์ Scope และ Field Visibility ได้จากหน้าหลังบ้าน</p>
            <div className="mt-3 overflow-auto">
              <table className="w-full text-xs border">
                <thead className="bg-[#0f2040] text-white"><tr><th className="p-2 text-left">Role</th><th className="p-2">dashboard.view</th><th className="p-2">tree.view_all</th><th className="p-2">income.approve</th><th className="p-2">audit.view</th></tr></thead>
                <tbody className="divide-y"><tr><td className="p-2">Admin</td><td className="text-center p-2">✓</td><td className="text-center p-2">✓</td><td className="text-center p-2">✓</td><td className="text-center p-2">—</td></tr><tr><td className="p-2">Auditor</td><td className="text-center p-2">✓</td><td className="text-center p-2">✓</td><td className="text-center p-2">—</td><td className="text-center p-2">✓</td></tr></tbody>
              </table>
            </div>
          </div>
          <div className="card p-5">
            <div className="font-semibold">Audit Log (append-only)</div>
            <div className="mt-2 text-xs font-mono bg-slate-900 text-slate-100 rounded-xl p-3">
              2026-09-05 09:12 — admin@ — member.approve — P-1003 → M-000004 — reason: เอกสารครบ<br/>
              2026-09-05 09:15 — system — tree.place — M-000004 → parent A01 slot 2 — BFS<br/>
              2026-09-05 09:20 — finance@ — income.approve — TX-9001 — v2.1
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
