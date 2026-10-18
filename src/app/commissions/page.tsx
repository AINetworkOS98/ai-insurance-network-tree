'use client';
import { useEffect, useMemo, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import PremiumPaymentPicture from '@/components/PremiumPaymentPicture';
import { buildProjectSamples } from '@/lib/projectSamples';

// เมนูตารางค่าคอมมิชชั่น — กล่องค้นหาแบบ dropdown + ตัวอย่างการคำนวณเป็นบาท
// ผู้สนใจ: เห็นชื่ออย่างเดียว • ตัวแทน: +คอมปีแรก • ศูนย์ขึ้นไป: ทั้งหมด
const DEFAULT_PREMIUM = 100000;

const fmt = (n:number)=> Number(n || 0).toLocaleString('th-TH');

function condText(v:any){
  return [
    v.a ? `อายุ ${v.a[0]}–${v.a[1]}` : '',
    v.cap ? `ทุน ${v.cap[0]!=null?Number(v.cap[0]).toLocaleString():''}–${v.cap[1]!=null?Number(v.cap[1]).toLocaleString():''}` : '',
    v.pay ? `ชำระ ${v.pay[0]}–${v.pay[1]} ปี` : '',
    v.pl ? `แผน ${v.pl}` : '',
    v.note || '',
  ].filter(Boolean).join(' • ') || '-';
}

// ตัวอย่างโครงการประกัน — รูปแบบโครงการ + โครงสร้างการทำประกัน + ผลประโยชน์ที่ได้รับ
// (รหัสแบบประกันผูกกับตารางค่าคอมมิชชั่นจริง เพื่อให้เห็นทั้งโครงสร้างและค่าคอมของตัวแทน)
const PROJECT_SAMPLES: any[] = [
  {
    key:'retire', title:'โครงการเกษียณมั่นคง 60/60', tag:'วางแผนเกษียณ',
    goal:'มีเงินก้อนใช้ยามเกษียณ และมีทุนประกันชีวิตคุ้มครองระหว่างทาง',
    plans:['NJ'], cover:1000000, payYears:'ชำระเบี้ย 10 ปี',
    benefits:[
      'ทุนประกันชีวิต จ่ายให้ผู้รับผลประโยชน์เมื่อเสียชีวิตตลอดสัญญา',
      'ผลประโยชน์เกษียณ รับเงินก้อน/เงินรายปีเมื่อครบกำหนดแบบ',
      'ชำระเบี้ยจำกัดปี คุ้มครองยาวถึงวัยเกษียณ (60 ปี)',
      'เบี้ยประกันชีวิตใช้สิทธิลดหย่อนภาษีตามเกณฑ์กรมสรรพากร',
    ],
  },
  {
    key:'wealth', title:'โครงการสะสมทรัพย์ คุ้มทวี', tag:'สะสมทรัพย์',
    goal:'ออมระยะยาวรับเงินก้อน และมีความคุ้มครองชีวิตแบบทวีคูณ',
    plans:['PJ'], cover:3000000, payYears:'ชำระเบี้ย 20 ปี',
    benefits:[
      'ความคุ้มครองชีวิตแบบทวีคูณ (ทุนประกันสูงกว่าเบี้ยที่ชำระ)',
      'เงินครบสัญญา รับเงินก้อนเมื่อครบกำหนดสัญญา',
      'มีเงินคืนระหว่างสัญญาตามแบบที่เลือก',
      'ต่อสัญญาเพิ่มเติมสุขภาพ/อุบัติเหตุได้',
    ],
  },
  {
    key:'tax', title:'โครงการวางแผนภาษี ทีแอลแพลน', tag:'ลดหย่อนภาษี',
    goal:'ใช้สิทธิลดหย่อนภาษีทุกปี พร้อมความคุ้มครองชีวิตระยะยาว',
    plans:['FA10'], cover:1000000, payYears:'ชำระเบี้ย 10 ปี',
    benefits:[
      'เบี้ยประกันชีวิตนำไปลดหย่อนภาษีได้ตามเพดานที่กำหนด',
      'ความคุ้มครองชีวิตตลอดระยะสัญญา',
      'มีเงินคืน/เงินครบสัญญาตามแบบ (สะสมทรัพย์)',
      'วางแผนได้ทั้งเป้าหมายภาษีและเป้าหมายออม',
    ],
  },
  {
    key:'health', title:'โครงการสุขภาพ + อุบัติเหตุ', tag:'สัญญาเพิ่มเติม',
    goal:'เสริมความคุ้มครองค่ารักษาพยาบาลและอุบัติเหตุจากแบบประกันหลัก',
    plans:['HHE','TM1'], cover:500000, payYears:'ชำระเบี้ยรายปี',
    benefits:[
      'ความคุ้มครองค่ารักษาพยาบาลตามแผนสุขภาพที่แนบ (เฮลท์ ฟิต ซีลด์)',
      'ความคุ้มครองอุบัติเหตุ/ค่ารักษาในโรงพยาบาล (พี.เอ. ฮอสพิทอล ซีลด์)',
      'ต่อกับแบบประกันชีวิตหลักได้ เพื่อให้ครบทุกความเสี่ยง',
      'เบี้ยสัญญาเพิ่มเติมขึ้นกับอายุและแผนที่เลือก',
    ],
  },
];

export default function CommissionsPage(){
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [data, setData] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [premiumInput, setPremiumInput] = useState(String(DEFAULT_PREMIUM));
  const [check, setCheck] = useState({ code:'', age:'', policyYear:'1', inputRate:'' });
  const [checkRes, setCheckRes] = useState<any>(null);

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

  const premium = Math.max(0, Number(String(premiumInput).replace(/[^\d.]/g,'')) || 0);
  // แปลงอัตรา % ของตาราง → ตัวอย่างจำนวนเงิน (บาท) จากสมมติฐานเบี้ยต่อปี
  const bahtOf = (pct:any)=> Math.round(premium * Number(pct || 0) / 100);

  async function search(query:string, category:string){
    try{
      const r = await fetch(`/api/commissions?q=${encodeURIComponent(query)}&category=${encodeURIComponent(category)}`,{credentials:'include'});
      const j = await r.json();
      if(j.ok) setData(j);
      else setMsg(j.error || 'ค้นหาไม่สำเร็จ');
    }catch{ setMsg('ค้นหาไม่สำเร็จ'); }
  }
  useEffect(()=>{ search('', ''); },[]);

  const opts = (data?.products || []).map((p:any)=> `${p.c} — ${p.n}`);
  const tierMsg = data?.tier==='names_only' ? 'ระดับผู้สนใจ: เห็นชื่อผลิตภัณฑ์อย่างเดียว'
    : data?.tier==='first_year' ? 'ระดับตัวแทน: เห็นค่าคอมปีแรก'
    : data?.tier==='full' ? 'หัวหน้าหน่วยขึ้นไป: เห็นข้อมูลทั้งหมด' : '';

  // ประกันตัวแรก = ผลิตภัณฑ์ตัวแรกของรายการที่แสดงอยู่ (ใช้ทำตัวอย่างการคำนวณเป็นบาท)
  const products = (data?.products || []) as any[];
  const firstProduct = products.find((p:any)=> Array.isArray(p.v) && p.v.length) || null;
  const showExample = data?.tier !== 'names_only';

  async function runCheck(){
    setCheckRes(null); setMsg('');
    try{
      const res = await fetch('/api/commissions', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'check', code: check.code, age: Number(check.age), policyYear: Number(check.policyYear), inputRate: Number(check.inputRate) })});
      const j = await res.json();
      if(j.ok) setCheckRes(j);
      else setMsg(j.error || 'ตรวจสอบไม่สำเร็จ');
    }catch{ setMsg('ตรวจสอบไม่สำเร็จ'); }
  }

  return (
    <div>
      <Header/>
      <div className="flex w-full">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-4 w-full min-w-0">
          <div>
            <h1 className="text-xl font-bold text-navy">ตารางค่าคอมมิชชั่น</h1>
            <p className="text-xs text-slate-500 mt-1">
              {data ? `เวอร์ชัน ${data.version} (${data.effectiveFrom ? new Date(data.effectiveFrom).toLocaleDateString('th-TH') : ''} – ${data.effectiveTo ? new Date(data.effectiveTo).toLocaleDateString('th-TH') : ''}) • ` : ''}{tierMsg}
            </p>
          </div>
          {msg && <div className="p-2 rounded-xl bg-amber-50 border text-xs">{msg}</div>}

          <div className="card p-4">
            <div className="grid md:grid-cols-3 gap-2">
              <div className="md:col-span-2">
                <input list="comm-options" value={q} onChange={e=>{ setQ(e.target.value); search(e.target.value, cat); }}
                  placeholder="พิมพ์รหัสหรือชื่อแบบ เช่น FA05, ธนทรัพย์..." className="w-full px-3 py-2 rounded-xl border text-sm" />
                <datalist id="comm-options">{opts.map((o:string)=><option key={o} value={o.split(' — ')[0]} />)}</datalist>
              </div>
              <select value={cat} onChange={e=>{ setCat(e.target.value); search(q, e.target.value); }} className="px-3 py-2 rounded-xl border text-sm">
                <option value="">ทุกหมวด</option>
                {(data?.categories||[]).map((c:string)=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">พบ {data?.count ?? 0} รายการ</div>
            {showExample && (
              <div className="mt-2 flex flex-wrap items-center justify-end gap-2 border-t pt-2">
                <label className="text-[11px] text-slate-600 flex items-center gap-2">
                  ตัวอย่างการคำนวณ — เบี้ยประกันต่อปี (บาท)
                  <input value={premiumInput} onChange={e=> setPremiumInput(e.target.value)} inputMode="numeric"
                    className="w-28 px-2 py-1 rounded-lg border text-xs text-right font-mono" />
                </label>
              </div>
            )}
          </div>

          {showExample && firstProduct && (
            <div className="card p-4 border-l-4 border-emerald-500">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold text-sm">
                  ตัวอย่างการคำนวณค่าคอมมิชชั่น — ประกันตัวแรกของรายการ:{' '}
                  <span className="font-mono">{firstProduct.c}</span> {firstProduct.n}
                </h3>
                <span className="text-[11px] text-slate-500">สมมติเบี้ยประกันปีละ ฿{fmt(premium)} • ตัวเลข = ค่าคอมที่ได้รับ (บาท)</span>
              </div>
              <div className="mt-2 overflow-auto">
                <table className="w-full text-[11px]">
                  <thead><tr className="text-left text-slate-500 border-b">
                    <th className="py-1 pr-2">เงื่อนไข</th>
                    <th className="py-1 pr-2 text-right">ปี 1</th>
                    {data.tier!=='first_year' && <>
                      <th className="py-1 pr-2 text-right">ปี 2</th>
                      <th className="py-1 pr-2 text-right">ปี 3</th>
                      <th className="py-1 pr-2 text-right">ปี 4+</th>
                      <th className="py-1 pr-2 text-right">รวมปี 1–4</th>
                    </>}
                  </tr></thead>
                  <tbody>
                    {firstProduct.v.map((v:any,i:number)=>{
                      const y1 = Math.round(premium * Number(v.y1 || 0) / 100);
                      const y2 = Math.round(premium * Number(v.y2 || 0) / 100);
                      const y3 = Math.round(premium * Number(v.y3 || 0) / 100);
                      const y4 = Math.round(premium * Number(v.y4 || 0) / 100);
                      return (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-1 pr-2">{condText(v)}</td>
                          <td className="py-1 pr-2 text-right font-mono font-bold text-emerald-700">฿{fmt(y1)}</td>
                          {data.tier!=='first_year' && <>
                            <td className="py-1 pr-2 text-right font-mono text-emerald-700">฿{fmt(y2)}</td>
                            <td className="py-1 pr-2 text-right font-mono text-emerald-700">฿{fmt(y3)}</td>
                            <td className="py-1 pr-2 text-right font-mono text-emerald-700">฿{fmt(y4)}</td>
                            <td className="py-1 pr-2 text-right font-mono font-bold text-navy">฿{fmt(y1+y2+y3+y4)}</td>
                          </>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                ตัวอย่างเพื่อเทียบให้เห็นเป็นจำนวนเงิน — เบี้ยจริงขึ้นกับทุนประกัน อายุ และแผนที่เลือก (แก้ตัวเลขเบี้ยต่อปีด้านบนได้ ตัวอย่างทั้งหน้าจะคำนวณใหม่)
              </p>
              <a href="#projects" className="inline-block mt-2 text-[11px] font-semibold text-navy underline">
                ↓ ดูตัวอย่างโครงการประกัน + โครงสร้างผลประโยชน์ (ด้านล่าง)
              </a>
            </div>
          )}

          <div className="space-y-2">
            {products.map((p:any,idx:number)=>(
              <div key={p.c} className="card p-4">
                <div className="flex flex-wrap gap-2 items-center text-sm">
                  <span className="font-mono font-bold">{p.c}</span>
                  <span className="font-semibold">{p.n}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100">{p.cat}</span>
                  {(p.aka||[]).length > 0 && <span className="text-[11px] text-slate-400">({(p.aka||[]).join(', ')})</span>}
                </div>
                {p.v && (
                  <div className="mt-2 overflow-auto">
                    <table className="w-full text-[11px]">
                      <thead><tr className="text-left text-slate-500 border-b">
                        <th className="py-1 pr-2">เงื่อนไข</th>
                        {data.tier!=='first_year' ? <><th className="py-1 pr-2 text-right">ปี 1</th><th className="py-1 pr-2 text-right">ปี 2</th><th className="py-1 pr-2 text-right">ปี 3</th><th className="py-1 pr-2 text-right">ปี 4+</th><th className="py-1 pr-2 text-right">ผลงาน</th><th className="py-1 pr-2 text-right">Com+</th></>
                        : <><th className="py-1 pr-2 text-right">ปี 1</th></>}
                      </tr></thead>
                      <tbody>
                        {p.v.map((v:any,i:number)=>(
                          <tr key={i} className="border-b last:border-0">
                            <td className="py-1 pr-2">{condText(v)}</td>
                            <td className="py-1 pr-2 text-right font-mono font-bold">{v.y1 ?? '-'}{v.y1!=null?'%':''}</td>
                            {data.tier!=='first_year' && <>
                              <td className="py-1 pr-2 text-right font-mono">{v.y2 ?? '-'}{v.y2!=null?'%':''}</td>
                              <td className="py-1 pr-2 text-right font-mono">{v.y3 ?? '-'}{v.y3!=null?'%':''}</td>
                              <td className="py-1 pr-2 text-right font-mono">{v.y4 ?? '-'}{v.y4!=null?'%':''}</td>
                              <td className="py-1 pr-2 text-right font-mono">{v.perf ?? '-'}</td>
                              <td className="py-1 pr-2 text-right font-mono">{v.cp ?? '-'}</td>
                            </>}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                {showExample && Array.isArray(p.v) && p.v.length > 0 && (
                  <div className="mt-2 rounded-xl bg-emerald-50 border border-emerald-100 p-2">
                    <div className="text-[11px] font-semibold text-emerald-800">
                      ตัวอย่างที่ {idx+1} — ค่าคอมที่ได้รับ (บาท) เมื่อเบี้ยประกันปีละ ฿{fmt(premium)}
                    </div>
                    <ul className="mt-1 space-y-0.5">
                      {p.v.map((v:any,i:number)=>(
                        <li key={i} className="text-[11px] text-slate-500">
                          {condText(v)} →{' '}
                          <span className="font-mono text-emerald-700">
                            ปี 1 ฿{fmt(bahtOf(v.y1))}
                            {data.tier!=='first_year' && ` · ปี 2 ฿${fmt(bahtOf(v.y2))} · ปี 3 ฿${fmt(bahtOf(v.y3))} · ปี 4+ ฿${fmt(bahtOf(v.y4))}`}
                            {' · รวม 4 ปี '}<span className="font-bold">฿{fmt(bahtOf(v.y1)+bahtOf(v.y2)+bahtOf(v.y3)+bahtOf(v.y4))}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>

          {data?.tier==='full' && (
            <div className="card p-4">
              <h3 className="font-semibold text-sm">ตรวจสอบค่าคอมที่กรอกเทียบตารางมาตรฐาน</h3>
              <div className="mt-2 grid md:grid-cols-5 gap-2">
                <input value={check.code} onChange={e=> setCheck({...check, code:e.target.value})} placeholder="รหัส เช่น FA05" className="px-3 py-2 rounded-xl border text-sm" />
                <input value={check.age} onChange={e=> setCheck({...check, age:e.target.value})} placeholder="อายุ" inputMode="numeric" className="px-3 py-2 rounded-xl border text-sm" />
                <input value={check.policyYear} onChange={e=> setCheck({...check, policyYear:e.target.value})} placeholder="ปีกรมธรรม์" inputMode="numeric" className="px-3 py-2 rounded-xl border text-sm" />
                <input value={check.inputRate} onChange={e=> setCheck({...check, inputRate:e.target.value})} placeholder="ค่าที่กรอก %" inputMode="decimal" className="px-3 py-2 rounded-xl border text-sm" />
                <button onClick={runCheck} className="px-4 py-2 rounded-full bg-navy text-white text-xs">ตรวจสอบ</button>
              </div>
              {checkRes && (
                <div className="mt-2 space-y-1">
                  {checkRes.results.map((r:any,i:number)=>(
                    <div key={i} className={`p-2 rounded-xl border text-xs ${r.pass===true?'bg-emerald-50 border-emerald-200':r.pass===false?'bg-red-50 border-red-200':'bg-slate-50'}`}>
                      มาตรฐาน {r.expected ?? '-'}% • กรอก {r.input ?? '-'}% • ต่าง {r.difference ?? '-'} → {r.pass===true?'✓ ถูกต้อง':r.pass===false?'✗ ไม่ตรง':'−'}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <div id="projects" className="card p-4 border-l-4 border-navy">
            <h3 className="font-semibold text-sm">ตัวอย่างโครงการประกัน — รูปแบบโครงการ · โครงสร้าง · ผลประโยชน์</h3>
            <p className="text-[11px] text-slate-500 mt-1">
              ยกตัวอย่าง 4 โครงการที่ใช้คุยกับลูกค้าได้จริง: เป้าหมาย → แบบประกันที่ใช้ (รหัสเดียวกับตารางด้านบน) → โครงสร้างผลประโยชน์ → ค่าคอมมิชชั่นของตัวแทน
            </p>
            <div className="mt-3 grid md:grid-cols-2 gap-3">
              {PROJECT_SAMPLES.map((s:any, si:number)=>{
                const found = (s.plans || []).map((c:string)=> products.find((p:any)=> p.c === c)).filter(Boolean);
                return (
                  <div key={s.key} className="rounded-xl border p-3 bg-slate-50/60">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-navy text-white">โครงการที่ {si+1}</span>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200">{s.tag}</span>
                    </div>
                    <div className="mt-1 font-semibold text-sm">{s.title}</div>
                    <p className="text-[11px] text-slate-600 mt-0.5">เป้าหมาย: {s.goal}</p>
                    <div className="mt-2 text-[11px] text-slate-700 space-y-0.5">
                      <div>
                        แบบประกันที่ใช้:{' '}
                        {found.length === 0
                          ? <span className="text-slate-400">— ไม่พบรหัสนี้ในตารางเวอร์ชันปัจจุบัน</span>
                          : found.map((pr:any, i:number)=>(
                              <span key={pr.c}>{i > 0 ? ' + ' : ''}<span className="font-mono font-bold">{pr.c}</span> {pr.n}</span>
                            ))}
                      </div>
                      <div>
                        ทุนประกันตัวอย่าง ฿{fmt(s.cover)} • {s.payYears}
                        {showExample && premium > 0 ? ` • เบี้ยตัวอย่าง ฿${fmt(premium)}/ปี` : ''}
                      </div>
                    </div>
                    <div className="mt-2">
                      <div className="text-[11px] font-semibold text-slate-700">โครงสร้างผลประโยชน์</div>
                      <ul className="mt-1 space-y-0.5 list-disc pl-4 text-[11px] text-slate-600">
                        {s.benefits.map((b:string,i:number)=><li key={i}>{b}</li>)}
                      </ul>
                    </div>
                    {showExample && found.map((pr:any)=>{
                      const v = pr.v?.[0];
                      if(!v) return null;
                      return (
                        <div key={pr.c} className="mt-2 rounded-lg bg-emerald-50 border border-emerald-100 p-2 text-[11px]">
                          <span className="font-semibold text-emerald-800">ค่าคอมมิชชั่นตัวแทนตามตาราง ({pr.c}): </span>
                          <span className="font-mono text-emerald-700">
                            ปี 1 {v.y1 ?? '-'}% = ฿{fmt(bahtOf(v.y1))} · รวม 4 ปี ฿{fmt(bahtOf(v.y1)+bahtOf(v.y2)+bahtOf(v.y3)+bahtOf(v.y4))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[11px] text-amber-700">
              หมายเหตุ: ผลประโยชน์ที่แสดงเป็น <b>โครงสร้างตัวอย่าง</b> เพื่อให้เห็นภาพรวมการทำประกัน (ทุนประกัน/ระยะชำระเบี้ย/เบี้ยต่อปี เป็นค่าสมมติที่ปรับตามดีลจริงได้)
              — ตัวเลขผลประโยชน์จริงต้องยืนยันกับตารางผลประโยชน์/เอกสารแบบประกันของบริษัท และใบเสนอขายที่ออกจากระบบก่อนยื่นลูกค้า
            </p>
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
              <div className="flex items-center gap-2">
                <select value={projGender} onChange={e=> setProjGender(e.target.value as any)} className="px-2 py-2 rounded-xl border text-xs">
                  <option value="ชาย">เริ่มด้วย ชาย</option>
                  <option value="หญิง">เริ่มด้วย หญิง</option>
                </select>
                <input value={projAge} onChange={e=> setProjAge(e.target.value)} inputMode="numeric" aria-label="อายุตัวอย่าง"
                  className="w-16 px-2 py-2 rounded-xl border text-xs text-right font-mono" />
                <input value={projCover} onChange={e=> setProjCover(e.target.value)} inputMode="numeric" aria-label="ทุนประกัน"
                  className="w-28 px-2 py-2 rounded-xl border text-xs text-right font-mono" />
              </div>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              แสดง {shownSamples.length} / {projectSamples.length} โครงการ
              {adjustedCount > 0 && ` • ${adjustedCount} แบบอายุ ${projAge} ไม่อยู่ในเกณฑ์รับประกัน → ใช้อายุที่เข้าเกณฑ์ใกล้สุด (ระบุไว้ในใบนั้น)`}
            </div>

            <div className="mt-3 grid md:grid-cols-2 gap-3">
              {shownSamples.map((s:any)=>(
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
                  <PremiumPaymentPicture
                    payYears={s.payYears}
                    premium={premium}
                    cover={s.cover}
                    assumed={s.payAssumed}
                    rider={s.rider}
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
