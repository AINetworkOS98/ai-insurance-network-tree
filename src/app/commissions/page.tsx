'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

// เมนูตารางค่าคอมมิชชั่น — กล่องค้นหาแบบ dropdown + ตัวอย่างการคำนวณเป็นบาท
// ผู้สนใจ: เห็นชื่ออย่างเดียว • ตัวแทน: +คอมปีแรก • ศูนย์ขึ้นไป: ทั้งหมด
const DEFAULT_PREMIUM = 100000;

const fmt = (n:number)=> Number(n || 0).toLocaleString('th-TH');

// อัตรา % พร้อมตัวอย่างจำนวนเงิน (บาท) จากสมมติฐานเบี้ยต่อปีที่ตั้งไว้ด้านบน
function Rate({ pct, premium }:{ pct:any; premium:number }){
  if(pct == null) return <>-</>;
  return (
    <>
      {pct}%
      {premium > 0 && <span className="block text-[10px] font-normal text-emerald-700">฿{fmt(Math.round(premium * Number(pct) / 100))}</span>}
    </>
  );
}

function condText(v:any){
  return [
    v.a ? `อายุ ${v.a[0]}–${v.a[1]}` : '',
    v.cap ? `ทุน ${v.cap[0]!=null?Number(v.cap[0]).toLocaleString():''}–${v.cap[1]!=null?Number(v.cap[1]).toLocaleString():''}` : '',
    v.pay ? `ชำระ ${v.pay[0]}–${v.pay[1]} ปี` : '',
    v.pl ? `แผน ${v.pl}` : '',
    v.note || '',
  ].filter(Boolean).join(' • ') || '-';
}

export default function CommissionsPage(){
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [data, setData] = useState<any>(null);
  const [msg, setMsg] = useState('');
  const [premiumInput, setPremiumInput] = useState(String(DEFAULT_PREMIUM));
  const [check, setCheck] = useState({ code:'', age:'', policyYear:'1', inputRate:'' });
  const [checkRes, setCheckRes] = useState<any>(null);

  const premium = Math.max(0, Number(String(premiumInput).replace(/[^\d.]/g,'')) || 0);

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
            </div>
          )}

          <div className="space-y-2">
            {products.slice(0,30).map((p:any)=>(
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
                        {p.v.map((v:any,i:number)=>{
                          return (
                            <tr key={i} className="border-b last:border-0">
                              <td className="py-1 pr-2">{condText(v)}</td>
                              <td className="py-1 pr-2 text-right font-mono font-bold"><Rate pct={v.y1} premium={showExample ? premium : 0}/></td>
                              {data.tier!=='first_year' && <>
                                <td className="py-1 pr-2 text-right font-mono"><Rate pct={v.y2} premium={premium}/></td>
                                <td className="py-1 pr-2 text-right font-mono"><Rate pct={v.y3} premium={premium}/></td>
                                <td className="py-1 pr-2 text-right font-mono"><Rate pct={v.y4} premium={premium}/></td>
                                <td className="py-1 pr-2 text-right font-mono">{v.perf ?? '-'}</td>
                                <td className="py-1 pr-2 text-right font-mono">{v.cp ?? '-'}</td>
                              </>}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
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
        </main>
      </div>
    </div>
  );
}
