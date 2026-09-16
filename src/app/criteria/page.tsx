'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

// หน้าเกณฑ์มาตรฐาน — ฝ่าย 19 ไทยประกันชีวิต ไตรมาส 2569
// ชัดเจน โปร่งใส วัดผลได้จริง — สมาชิกทุกคนดูได้
const STATIC_ROWS = [
  { rank:'ตัวแทน', level:1, keep:'3,000', fix:'3,000' },
  { rank:'ผบ.หน่วย', level:2, keep:'7,500', fix:'10,000' },
  { rank:'ผบ.ศูนย์', level:3, keep:'30,000', fix:'30,000' },
];
const QUARTERS = [
  { q:'ไตรมาส 1/2569', m:'ม.ค. – มี.ค. 2569' },
  { q:'ไตรมาส 2/2569', m:'เม.ย. – มิ.ย. 2569' },
  { q:'ไตรมาส 3/2569', m:'ก.ค. – ก.ย. 2569' },
  { q:'ไตรมาส 4/2569', m:'ต.ค. – ธ.ค. 2569' },
];

export default function CriteriaPage(){
  const [plan, setPlan] = useState<any>(null);
  const [results, setResults] = useState<any[]>([]);

  useEffect(()=>{ (async()=>{
    try{
      const r = await fetch('/api/maintenance');
      const j = await r.json();
      if(j.ok){
        const std = (j.plans||[]).find((p:any)=> p.status==='Active') || (j.plans||[])[0] || null;
        setPlan(std);
      }
    }catch{}
    try{
      const r = await fetch('/api/maintenance/results');
      const j = await r.json();
      if(j.ok) setResults(j.results||[]);
    }catch{}
  })(); },[]);

  const removed = results.filter(r=> r.status==='removed').slice(0,20);
  const rules = plan?.rules?.length ? plan.rules : null;

  return (
    <div>
      <Header/>
      <div className="flex w-full">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-4 max-w-[860px]">
          <div>
            <div className="text-xs text-slate-500">ฝ่าย 19 • ไทยประกันชีวิต</div>
            <h1 className="text-xl font-bold text-navy">เกณฑ์วัดรอบผลงานบริษัท</h1>
            <p className="text-xs text-slate-500 mt-1">ชัดเจน โปร่งใส วัดผลได้จริง สร้างผลงานไปด้วยกัน — วัดรอบผลงานทุกไตรมาส (ม.ค.-มี.ค. / เม.ย.-มิ.ย. / ก.ค.-ก.ย. / ต.ค.-ธ.ค. 2569)</p>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-sm">ตารางเป้าหมายและบำเหน็จ (COM + COM PLUS)</h3>
            <div className="mt-3 overflow-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500 border-b">
                    <th className="py-2 pr-3">ตำแหน่ง</th>
                    <th className="py-2 pr-3 text-right">ป้องกันสตาร์</th>
                    <th className="py-2 pr-3 text-right">แก้สตาร์</th>
                    <th className="py-2">สถานะเกณฑ์</th>
                  </tr>
                </thead>
                <tbody>
                  {STATIC_ROWS.map(r=>(
                    <tr key={r.level} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-semibold">{r.rank}</td>
                      <td className="py-2 pr-3 text-right font-mono">{r.keep}</td>
                      <td className="py-2 pr-3 text-right font-mono">{r.fix}</td>
                      <td className="py-2 text-[11px] text-slate-500">
                        {rules?.find((x:any)=> x.targetRank===r.level)
                          ? `ใช้จริง: ${Number(rules.find((x:any)=> x.targetRank===r.level).minAmount).toLocaleString()} (${rules.find((x:any)=> x.targetRank===r.level).resultType})`
                          : 'รอบันทึกในระบบ'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-[11px] text-slate-500">เงื่อนไขเพิ่มเติม: บุคลากรในสังกัด 3 หน่วย (รวมหน่วยตรง) • ผลงานค่าบำเหน็จ COM + COM PLUS</div>
            {plan && <div className="mt-2 text-[11px]">แผนในระบบ: <span className="font-semibold">{plan.name}</span> <span className={`px-2 py-0.5 rounded-full ${plan.status==='Active'?'bg-emerald-600 text-white':'bg-slate-200'}`}>{plan.status}</span> <span className="text-slate-500">เตือนก่อน 1 รอบ • ผ่อนผันสมาชิกใหม่ {plan.graceMonths ?? 0} เดือน</span></div>}
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-sm">รอบไตรมาส 2569</h3>
            <div className="mt-2 grid md:grid-cols-4 gap-2">
              {QUARTERS.map(q=>(
                <div key={q.q} className="p-3 rounded-xl border bg-slate-50 text-xs">
                  <div className="font-bold">{q.q}</div>
                  <div className="text-slate-500">{q.m}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-sm">ผู้รักษายอดไม่ได้ — ดีดออกอัตโนมัติ ({removed.length})</h3>
            <p className="text-[11px] text-slate-500 mt-1">ไม่ผ่านซ้ำ = RESIGNED + ยกเลิก session + ปิดจุดในผัง — แล้วเลื่อนผู้คุณสมบัติครบชั้นล่างขึ้นแทนอัตโนมัติ</p>
            <div className="mt-2 space-y-1">
              {removed.map((r:any)=>(
                <div key={r.id} className="flex gap-2 text-xs p-2 rounded-xl border bg-red-50">
                  <span className="font-mono">{r.period}</span>
                  <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[11px]">removed</span>
                  <span className="ml-auto text-[11px]">ต้อง {String(r.required)} ได้ {String(r.verified)}</span>
                </div>
              ))}
              {!removed.length && <div className="text-xs text-slate-500">ยังไม่มีผู้ถูกดีดออก</div>}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-center text-[11px] text-slate-500">
            <div className="p-2 rounded-xl border bg-white">เป้าชัด วัดผลได้จริง</div>
            <div className="p-2 rounded-xl border bg-white">ผลตอบแทน คุ้มค่า</div>
            <div className="p-2 rounded-xl border bg-white">เติบโต ไปด้วยกัน</div>
            <div className="p-2 rounded-xl border bg-white">สำเร็จ อย่างยั่งยืน</div>
          </div>
        </main>
      </div>
    </div>
  );
}
