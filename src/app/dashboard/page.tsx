import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Link from 'next/link';
export default function Dashboard(){
  return (
    <div>
      <Header/>
      <div className="flex max-w-[1280px] mx-auto">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-navy">ภาพรวม</h1>
            <span className="badge-demo">ข้อมูลทดลอง</span>
          </div>
          <div className="grid md:grid-cols-4 gap-4">
            {[
              {k:'สมาชิกตรง', v:'3/5', sub:'A01-A03 มีคน, A04-A05 ว่าง'},
              {k:'สมาชิกในทีม', v:'18 คน', sub:'Active 12 • Pending 6'},
              {k:'ผลงานส่วนบุคคล', v:'฿ 85,000', sub:'รอบ 2026-09'},
              {k:'รายได้อนุมัติ', v:'฿ 42,300', sub:'จ่ายแล้ว ฿ 28,000'},
            ].map(c=>(
              <div key={c.k} className="card p-5">
                <div className="text-xs text-slate-500">{c.k}</div>
                <div className="text-2xl font-bold text-navy mt-1">{c.v}</div>
                <div className="text-xs text-slate-500">{c.sub}</div>
              </div>
            ))}
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="card p-5">
              <div className="font-semibold text-navy">ความก้าวหน้าสู่ตำแหน่งถัดไป — ผู้บริหารหน่วย</div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between text-xs"><span>สมาชิก Active</span><span>12/15</span></div>
                <div className="h-2 bg-slate-100 rounded-full"><div className="h-2 bg-navy rounded-full" style={{width:'80%'}}/></div>
                <div className="flex justify-between text-xs"><span>ผลงานรวมทีม</span><span>฿ 420k / ฿ 500k</span></div>
                <div className="h-2 bg-slate-100 rounded-full"><div className="h-2 bg-[#c8a84e] rounded-full" style={{width:'84%'}}/></div>
                <div className="text-xs text-slate-500">สิ่งที่ยังขาด: สมาชิก Active อีก 3 คน • ผลงานอีก ฿ 80,000 • รอผู้มีอำนาจอนุมัติ</div>
              </div>
            </div>
            <div className="card p-5">
              <div className="font-semibold text-navy">รายได้ Estimated / Approved / Paid</div>
              <div className="mt-3 flex gap-2 text-xs">
                <span className="px-2 py-1 rounded-full bg-amber-100 text-amber-800">Estimated ฿ 18,000</span>
                <span className="px-2 py-1 rounded-full bg-emerald-100 text-emerald-800">Approved ฿ 42,300</span>
                <span className="px-2 py-1 rounded-full bg-navy text-white">Paid ฿ 28,000</span>
              </div>
              <div className="mt-3 h-[120px] flex items-end gap-2">
                {[18,42,28].map((v,i)=>(
                  <div key={i} className="flex-1 rounded-t-lg flex flex-col items-center justify-end" style={{height:'100%'}}>
                    <div className="w-full rounded-t-lg" style={{height:`${v*2}px`, background: i===0?'#f59e0b': i===1?'#10b981':'#475569'}}/>
                    <div className="text-[11px] mt-1">{['Est','App','Paid'][i]}</div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-2">ห้ามแสดง Estimated เป็นยอดที่ได้รับจริง</p>
            </div>
          </div>
          <div className="flex gap-3 text-sm">
            <Link href="/tree" className="px-4 py-2 rounded-full bg-[#475569] text-white">ดูผังเครือข่าย</Link>
            <Link href="/income" className="px-4 py-2 rounded-full border bg-white">ดูรายได้</Link>
          </div>
        </main>
      </div>
    </div>
  );
}
