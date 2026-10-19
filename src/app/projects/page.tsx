'use client';
// ตัวอย่างโครงการครบทุกแบบประกัน (111 แบบ) — แยกเป็นหน้าของตัวเอง (หน้าถัดไปจากตารางค่าคอมมิชชั่น)
import { useEffect, useMemo, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import PremiumPaymentPicture from '@/components/PremiumPaymentPicture';
import { buildProjectSamples } from '@/lib/projectSamples';

const fmt = (n:number)=> Number(n || 0).toLocaleString('th-TH');
const PAGE_SIZE = 10;

export default function ProjectsPage(){
  const [data, setData] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [premiumInput, setPremiumInput] = useState('100000');

  useEffect(()=>{
    (async ()=>{
      try{
        const r = await fetch('/api/commissions?q=&category=', { credentials:'include' });
        const j = await r.json();
        if(j.ok) setData(j); else setMsg(j.error || 'โหลดข้อมูลไม่สำเร็จ');
      }catch{ setMsg('โหลดข้อมูลไม่สำเร็จ'); }
    })();
  }, []);

  // ── ตัวอย่างโครงการครบทุกแบบประกัน (สร้างจากการ์ดแบบประกันจริงในตาราง) ──
  const [projGender, setProjGender] = useState<'ชาย' | 'หญิง'>('ชาย');
  const [projAge, setProjAge] = useState('30');
  const [projCover, setProjCover] = useState('1000000');
  const [projQ, setProjQ] = useState('');
  const [projCat, setProjCat] = useState('');

  const projectSamples = useMemo(()=> buildProjectSamples((data?.products || []) as any[], {
    startGender: projGender,
    age: Math.max(1, Number(projAge) || 30),
    cover: Math.max(1, Number(String(projCover).replace(/[^\d.]/g,'')) || 1000000),
  }), [data, projGender, projAge, projCover]);

  const shownSamples = useMemo(()=> projectSamples.filter((s:any)=>{
    if(projCat && s.cat !== projCat) return false;
    if(!projQ.trim()) return true;
    const q = projQ.trim().toLowerCase();
    return String(s.code).toLowerCase().includes(q) || String(s.name).toLowerCase().includes(q) || String(s.cat).toLowerCase().includes(q);
  }), [projectSamples, projCat, projQ]);

  const adjustedCount = projectSamples.filter((s:any)=> s.ageAdjusted).length;

  const [projPage, setProjPage] = useState(1);
  const [projShowAll, setProjShowAll] = useState(false);
  const projTotalPages = Math.max(1, Math.ceil(shownSamples.length / PAGE_SIZE));
  const safeProjPage = Math.min(Math.max(1, projPage), projTotalPages);
  const pagedSamples = projShowAll ? shownSamples : shownSamples.slice((safeProjPage - 1) * PAGE_SIZE, safeProjPage * PAGE_SIZE);
  useEffect(()=>{ setProjPage(1); }, [projQ, projCat, projGender, projAge, projCover]);

  const premium = Math.max(0, Number(String(premiumInput).replace(/[^\d.]/g,'')) || 0);
  const bahtOf = (pct:any)=> Math.round(premium * Number(pct || 0) / 100);
  const showExample = data?.tier !== 'names_only';

  return (
    <div>
      <Header />
      <div className="flex w-full">
        <Sidebar />
        <main className="flex-1 p-6 space-y-4 w-full min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-xl font-bold text-navy">ตัวอย่างโครงการครบทุกแบบประกัน</h1>
              <p className="text-xs text-slate-500 mt-1">
                หน้าถัดไปของตารางค่าคอมมิชชั่น — โครงการละเอียดครบ 111 แบบ พร้อมภาพการจ่ายเบี้ยและเงินคืนระหว่างสัญญา
              </p>
            </div>
            <div className="flex gap-2">
              <a href="/commissions" className="px-3 py-2 rounded-full border text-xs">‹ ตารางค่าคอมมิชชั่น</a>
              <a href="/apply" className="px-3 py-2 rounded-full bg-emerald-600 text-white text-xs font-semibold">กรอกข้อมูลทำประกัน ›</a>
            </div>
          </div>

          {msg && <div className="p-2 rounded-xl bg-amber-50 border text-xs">{msg}</div>}

          <div className="card p-2 flex flex-wrap items-center justify-end gap-2 text-[11px]">
            <label className="text-slate-600 flex items-center gap-2">
              ตัวอย่างการคำนวณ — เบี้ยประกันต่อปี (บาท)
              <input value={premiumInput} onChange={e=> setPremiumInput(e.target.value)} inputMode="numeric"
                className="w-28 px-2 py-1 rounded-lg border text-xs text-right font-mono" />
            </label>
          </div>

          {/* ── ตัวอย่างโครงการครบทุกแบบประกัน: เริ่มจากแบบแรกของตาราง อายุ 30 ปี ทุน 1 ล้าน สลับ ชาย/หญิง ── */}
          <div id="all-projects" className="card p-4 border-l-4 border-emerald-600">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="font-semibold text-sm">
                ตัวอย่างโครงการครบทุกแบบประกัน — {projectSamples.length} แบบ (เริ่มตั้งแต่แบบแรกของตาราง)
              </h3>
              <span className="text-[11px] text-slate-500">
                อายุ {projAge} ปี • ทุนประกัน ฿{fmt(Number(String(projCover).replace(/[^\d.]/g,''))) || 1} • สลับชาย/หญิงทีละแบบ
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              รูปแบบโครงการ + โครงสร้างการทำประกัน + ผลประโยชน์ที่ได้รับ ครบทุกแบบประกันในตารางค่าคอมมิชชั่น
              (เงื่อนไข/อัตราค่าคอมในแต่ละใบเป็นค่าจริงจากตาราง — โครงสร้างผลประโยชน์เป็นแม่แบบตามหมวดของแบบนั้น)
            </p>

            <div className="mt-3 grid md:grid-cols-4 gap-2">
              <input value={projQ} onChange={e=> setProjQ(e.target.value)} placeholder="ค้นหาในโครงการ เช่น เฮลท์, FA05, บำนาญ"
                className="px-3 py-2 rounded-xl border text-sm md:col-span-2" />
              <select value={projCat} onChange={e=> setProjCat(e.target.value)} className="px-3 py-2 rounded-xl border text-sm">
                <option value="">ทุกหมวด</option>
                {(data?.categories || []).map((c:string)=><option key={c} value={c}>{c}</option>)}
              </select>
              <select value={projGender} onChange={e=> setProjGender(e.target.value as any)} className="px-2 py-2 rounded-xl border text-xs">
                <option value="ชาย">เริ่มด้วย ชาย</option>
                <option value="หญิง">เริ่มด้วย หญิง</option>
              </select>
            </div>

            {/* ปรับ อายุ / ทุนประกัน ที่ใช้ทดลองได้ — มีผลทั้ง 111 ใบ + ภาพการจ่ายเบี้ย */}
            <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50/50 p-2">
              <div className="text-[11px] font-semibold text-emerald-900">ทดลองเปลี่ยน อายุ และ ทุนประกัน</div>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <label className="text-[11px] text-slate-700 flex items-center gap-1">
                  อายุ
                  <input value={projAge} onChange={e=> setProjAge(e.target.value)} inputMode="numeric"
                    className="w-16 px-2 py-1 rounded-lg border text-xs text-right font-mono" />
                  ปี
                </label>
                <span className="flex gap-1">
                  {[25, 30, 35, 40, 45, 50].map(a=>(
                    <button key={a} type="button" onClick={()=> setProjAge(String(a))}
                      className={`px-2 py-0.5 rounded-full border text-[11px] ${String(projAge)===String(a) ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600'}`}>
                      {a}
                    </button>
                  ))}
                </span>
                <span className="mx-1 h-4 w-px bg-emerald-200" />
                <label className="text-[11px] text-slate-700 flex items-center gap-1">
                  ทุนประกัน
                  <input value={projCover} onChange={e=> setProjCover(e.target.value)} inputMode="numeric"
                    className="w-28 px-2 py-1 rounded-lg border text-xs text-right font-mono" />
                  บาท
                </label>
                <span className="flex gap-1">
                  {[500000, 1000000, 2000000, 3000000, 5000000].map(c=>(
                    <button key={c} type="button" onClick={()=> setProjCover(String(c))}
                      className={`px-2 py-0.5 rounded-full border text-[11px] ${Number(String(projCover).replace(/[^\d]/g,''))===c ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600'}`}>
                      {c >= 1000000 ? `${c/1000000} ล้าน` : `${c/1000}พัน`}
                    </button>
                  ))}
                </span>
              </div>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              แสดง {projShowAll ? shownSamples.length : Math.min(shownSamples.length, (safeProjPage - 1) * PAGE_SIZE + 1)}–{projShowAll ? shownSamples.length : Math.min(safeProjPage * PAGE_SIZE, shownSamples.length)} จาก {shownSamples.length} โครงการ
              {!projShowAll && ` · หน้า ${safeProjPage}/${projTotalPages} (ทีละ ${PAGE_SIZE} ใบ)`}
              {adjustedCount > 0 && ` • ${adjustedCount} แบบอายุ ${projAge} ไม่อยู่ในเกณฑ์รับประกัน → ใช้อายุที่เข้าเกณฑ์ใกล้สุด (ระบุไว้ในใบนั้น)`}
            </div>

            
            <div className="mt-3 grid md:grid-cols-2 gap-3">
              {pagedSamples.map((s:any)=>(
                <div key={s.code + s.no} className="rounded-xl border p-3 bg-white">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-600 text-white">โครงการที่ {s.no}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100">{s.cat}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full ${s.gender==='ชาย'?'bg-sky-100 text-sky-800':'bg-pink-100 text-pink-800'}`}>
                      {s.gender} • อายุ {s.age} ปี
                    </span>
                    {s.ageAdjusted && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">อายุ {projAge} ไม่เข้าเกณฑ์ → ใช้ {s.age}</span>
                    )}
                  </div>
                  <div className="mt-1 font-semibold text-sm">
                    <span className="font-mono">{s.code}</span> — {s.name}
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5">เป้าหมาย: {s.goal}</p>
                  <div className="mt-2 text-[11px] text-slate-700">
                    <div>
                      ทุนประกันตัวอย่าง <b>฿{fmt(s.cover)}</b>
                      {s.rider ? ' • สัญญาเพิ่มเติม: ใช้ผลประโยชน์ต่อครั้ง/ต่อวันตามแผน' : ''}
                    </div>
                    <div className="text-slate-500">เงื่อนไขที่เข้าเกณฑ์ในตาราง: {s.cond}</div>
                  </div>
                  <div className="mt-2">
                    <div className="text-[11px] font-semibold text-slate-700">โครงสร้างการทำประกัน</div>
                    <ul className="mt-1 space-y-0.5 list-disc pl-4 text-[11px] text-slate-600">
                      {s.structure.map((b:string,i:number)=><li key={i}>{b}</li>)}
                    </ul>
                  </div>
                  <div className="mt-2">
                    <div className="text-[11px] font-semibold text-slate-700">ผลประโยชน์ที่ได้รับ (โครงสร้างตัวอย่าง)</div>
                    <ul className="mt-1 space-y-0.5 list-disc pl-4 text-[11px] text-slate-600">
                      {s.benefits.map((b:string,i:number)=><li key={i}>{b}</li>)}
                    </ul>
                  </div>
                  <div className={`mt-2 rounded-lg border p-2 ${s.cashback?.has ? 'border-emerald-200 bg-emerald-50/60' : 'border-slate-200 bg-slate-50'}`}>
                    <div className={`text-[11px] font-semibold ${s.cashback?.has ? 'text-emerald-800' : 'text-slate-700'}`}>
                      เงินคืนระหว่างสัญญา / การจ่ายผลประโยชน์ — {s.cashback?.title}
                    </div>
                    <ul className="mt-1 space-y-0.5 list-disc pl-4 text-[11px] text-slate-600">
                      {(s.cashback?.lines || []).map((b:string,i:number)=><li key={i}>{b}</li>)}
                    </ul>
                  </div>
                  <PremiumPaymentPicture
                    payYears={s.payYears}
                    premium={premium}
                    cover={s.cover}
                    assumed={s.payAssumed}
                    rider={s.rider}
                    cashback={{ has: !!s.cashback?.has, title: s.cashback?.title }}
                  />
                  {showExample && s.variant && (
                    <div className="mt-2 rounded-lg bg-emerald-50 border border-emerald-100 p-2 text-[11px]">
                      <span className="font-semibold text-emerald-800">ค่าคอมมิชชั่นตัวแทนตามตาราง: </span>
                      <span className="font-mono text-emerald-700">
                        ปี 1 {s.variant.y1 ?? '-'}% = ฿{fmt(bahtOf(s.variant.y1))}
                        {data?.tier!=='first_year' && ` · ปี 2 ฿${fmt(bahtOf(s.variant.y2))} · ปี 3 ฿${fmt(bahtOf(s.variant.y3))} · ปี 4+ ฿${fmt(bahtOf(s.variant.y4))}`}
                        {data?.tier!=='first_year' && ` · รวม 4 ปี ฿${fmt(bahtOf(s.variant.y1)+bahtOf(s.variant.y2)+bahtOf(s.variant.y3)+bahtOf(s.variant.y4))}`}
                      </span>
                      <div className="text-slate-500 mt-0.5">คิดจากเบี้ยสมมติ ฿{fmt(premium)}/ปี (แก้ได้ที่ช่องด้านบน)</div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-3 card p-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
              <span className="text-slate-600">ตัวอย่างโครงการ · ทีละ {PAGE_SIZE} ใบ</span>
              <div className="flex items-center gap-1">
                <button type="button" onClick={()=> setProjPage(1)} disabled={projShowAll || safeProjPage===1}
                  className="px-2 py-1 rounded-lg border disabled:opacity-40">«</button>
                <button type="button" onClick={()=> setProjPage(p=> Math.max(1, p-1))} disabled={projShowAll || safeProjPage===1}
                  className="px-2 py-1 rounded-lg border disabled:opacity-40">‹ ก่อนหน้า</button>
                {Array.from({ length: projTotalPages }).slice(Math.max(0, safeProjPage-3), Math.max(0, safeProjPage-3)+7).map((_, i) => {
                  const n = Math.max(0, safeProjPage-3) + i + 1;
                  return (
                    <button key={n} type="button" onClick={()=>{ setProjShowAll(false); setProjPage(n); }}
                      className={`px-2 py-1 rounded-lg border font-mono ${!projShowAll && n===safeProjPage ? 'bg-emerald-600 text-white border-emerald-600' : ''}`}>{n}</button>
                  );
                })}
                <button type="button" onClick={()=> setProjPage(p=> Math.min(projTotalPages, p+1))} disabled={projShowAll || safeProjPage===projTotalPages}
                  className="px-2 py-1 rounded-lg border disabled:opacity-40">ถัดไป ›</button>
                <button type="button" onClick={()=> setProjPage(projTotalPages)} disabled={projShowAll || safeProjPage===projTotalPages}
                  className="px-2 py-1 rounded-lg border disabled:opacity-40">»</button>
                <button type="button" onClick={()=> setProjShowAll(v=> !v)}
                  className="ml-1 px-2 py-1 rounded-full bg-slate-100 border">{projShowAll ? 'ย่อกลับทีละ 10' : 'แสดงทั้งหมด'}</button>
              </div>
            </div>
            <p className="mt-3 text-[11px] text-amber-700">
              หมายเหตุ: ทุกใบเป็น <b>ตัวอย่าง/สมมติ</b> (เพศ–อายุ–ทุนประกัน ตั้งขึ้นเพื่อสาธิตโครงสร้าง) — เบี้ยจริงขึ้นกับทุนประกัน อายุ แผน และการพิจารณารับประกันของบริษัท
              ส่วนผลประโยชน์ต้องยืนยันกับตารางผลประโยชน์/เอกสารแบบประกันฉบับจริงก่อนเสนอลูกค้าทุกครั้ง
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
