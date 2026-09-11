import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
export default function Income(){
  const rows=[
    {id:'TX-9001', type:'ค่าคอมมิชชั่นส่วนบุคคล', period:'2026-09', gross:25000, tax:750, net:24250, status:'APPROVED', rule:'v2.1'},
    {id:'TX-9002', type:'ค่าบริหารหน่วย', period:'2026-09', gross:8000, tax:240, net:7760, status:'ESTIMATED', rule:'v2.1'},
    {id:'TX-9003', type:'โบนัส', period:'2026-08', gross:15000, tax:450, net:14550, status:'PAID', rule:'v2.0'},
    {id:'TX-9004', type:'Reversal', period:'2026-08', gross:-5000, tax:0, net:-5000, status:'REVERSED', rule:'v2.0'},
  ];
  return (
    <div>
      <Header/>
      <div className="flex max-w-[1280px] mx-auto">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-[#475569]">รายได้และเอกสาร</h1>
            <span className="badge-demo">ข้อมูลทดลอง</span>
          </div>
          <div className="rounded-xl bg-[#eff6ff] border border-blue-100 p-3 text-xs text-sky-900">
            รายได้และผลประโยชน์ขึ้นอยู่กับผลงานจริง คุณสมบัติ เงื่อนไข การอนุมัติ และหลักเกณฑ์ที่ใช้ในแต่ละช่วงเวลา ตัวเลขประมาณการไม่ใช่การรับประกันรายได้
          </div>
          <div className="grid md:grid-cols-3 gap-3 text-sm">
            <div className="card p-4"><div className="text-xs text-slate-500">ประมาณการ (Estimated)</div><div className="text-xl font-bold text-sky-500">฿ 7,760</div><div className="text-[11px] text-slate-500">ยังไม่ถือเป็นยอดอนุมัติ</div></div>
            <div className="card p-4"><div className="text-xs text-slate-500">อนุมัติ (Approved)</div><div className="text-xl font-bold text-emerald-600">฿ 24,250</div></div>
            <div className="card p-4"><div className="text-xs text-slate-500">จ่ายแล้ว (Paid)</div><div className="text-xl font-bold text-[#475569]">฿ 14,550</div></div>
          </div>
          <div className="card p-4 overflow-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#475569] text-white">
                <tr><th className="text-left p-2">Transaction</th><th className="text-left p-2">ประเภท</th><th className="p-2">รอบ</th><th className="text-right p-2">ก่อนหัก</th><th className="text-right p-2">ภาษี</th><th className="text-right p-2">สุทธิ</th><th className="p-2">สถานะ</th><th className="p-2">Rule</th></tr>
              </thead>
              <tbody className="divide-y">
                {rows.map(r=>(
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="p-2 font-mono">{r.id}</td><td className="p-2">{r.type}</td><td className="p-2 text-center">{r.period}</td>
                    <td className="p-2 text-right">{r.gross.toLocaleString()}</td><td className="p-2 text-right">{r.tax.toLocaleString()}</td><td className="p-2 text-right font-semibold">{r.net.toLocaleString()}</td>
                    <td className="p-2"><span className={`px-2 py-1 rounded-full text-[11px] ${r.status==='ESTIMATED'?'bg-sky-100 text-sky-700 border border-blue-100': r.status==='PAID'?'bg-[#475569] text-white': r.status==='REVERSED'?'bg-red-100 text-red-700':'bg-emerald-100 text-emerald-800'}`}>{r.status}</span></td>
                    <td className="p-2 font-mono">{r.rule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-3 flex gap-2 text-xs">
              <button className="px-3 py-1.5 rounded-full border bg-white">ดาวน์โหลด PDF</button>
              <button className="px-3 py-1.5 rounded-full border bg-white">พิมพ์</button>
              <button className="px-3 py-1.5 rounded-full bg-[#475569] text-white">ตรวจสอบเอกสาร (QR)</button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
