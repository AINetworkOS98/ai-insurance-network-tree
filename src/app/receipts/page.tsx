'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

type Manual = { amount:string; paidAt:string; receiptNo:string; transactionRef:string; policyNo:string; payerName:string; issuerName:string; type:string; periodLabel:string };
const emptyManual: Manual = { amount:'', paidAt:'', receiptNo:'', transactionRef:'', policyNo:'', payerName:'', issuerName:'', type:'premium', periodLabel:'' };

export default function ReceiptsPage(){
  const [receipts, setReceipts] = useState<any[]>([]);
  const [file, setFile] = useState<File|null>(null);
  const [loading, setLoading] = useState('');
  const [msg, setMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [tab, setTab] = useState<'upload'|'queue'|'history'>('upload');
  const [manual, setManual] = useState<Manual>(emptyManual);
  const [manualFor, setManualFor] = useState<string|null>(null);
  const [manualMode, setManualMode] = useState<'create'|'edit'>('create');

  async function load(){
    const res = await fetch('/api/receipts/upload');
    const j = await res.json();
    if(j.ok) setReceipts(j.receipts || []);
  }
  useEffect(()=>{ load(); },[]);

  async function upload(){
    if(!file) { setMsg('กรุณาเลือกไฟล์'); return; }
    setLoading('upload'); setMsg('');
    try{
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/receipts/upload', { method:'POST', body: fd });
      const j = await res.json();
      if(!j.ok){ setMsg(j.error || 'อัปโหลดไม่สำเร็จ'); setLoading(''); return; }
      const receiptId = j.receipt.id;
      setMsg('อัปโหลดสำเร็จ — กำลังอ่านข้อมูลจริงจากภาพ');
      // อ่าน OCR จริงจากไฟล์เดียวกันทันที (ไม่สร้างเลขสุ่ม)
      await readRealOcr(receiptId, file);
      setFile(null);
      load();
    }catch{ setMsg('อัปโหลดไม่สำเร็จ'); }
    setLoading('');
  }

  // ส่งไฟล์จริงไป /api/ocr (vision) แล้วบันทึกผล — ถ้าไม่มีคีย์ให้กรอกเอง
  async function readRealOcr(receiptId:string, f:File|null){
    if(!f){ setMsg('เลือกไฟล์เดิมอีกครั้งเพื่ออ่าน OCR'); return; }
    setLoading(receiptId); setMsg('กำลังอ่านข้อมูลจากภาพ...');
    try{
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/ocr', { method:'POST', body: fd });
      const j = await res.json();
      if(!res.ok || j.success === false){
        // ไม่มีคีย์/อ่านไม่ได้ — เปิดฟอร์มกรอกเอง (ห้ามสุ่มเลข)
        setManualFor(receiptId); setManualMode('create'); setManual(emptyManual);
        setMsg((j.error || 'อ่านอัตโนมัติไม่ได้') + ' — กรุณากรอกค่าจากเอกสารเอง');
        setLoading(''); load();
        return;
      }
      const ocrResult = {
        issuerName: j.companyName || null,
        receiptNo: j.receiptNumber || null,
        transactionRef: j.referenceNumber || null,
        policyNo: null,
        payerName: j.payerName || null,
        paidAt: j.date ? (j.time ? `${j.date}T${j.time}` : j.date) : null,
        amount: j.amount != null ? String(j.amount) : null,
        type: j.documentType === 'tax_document' ? 'premium' : 'premium',
        periodLabel: null,
        agentCode: null,
        qrBarcode: null,
        confidence: { overall: j.confidence ?? 0, provider: j.provider, needsReview: j.needsManualReview },
        rawOcr: j,
      };
      const sres = await fetch('/api/receipts/ocr', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ receiptId, ocrResult }) });
      const sj = await sres.json();
      if(sj.ok){
        setMsg('อ่านข้อมูลแล้ว — กรุณาตรวจทานก่อนส่งตรวจสอบ' + (j.companyWarning ? ` (หมายเหตุ: ${j.companyWarning})` : ''));
      } else setMsg(sj.error || 'บันทึกผล OCR ไม่สำเร็จ');
    }catch{ setMsg('อ่านข้อมูลไม่สำเร็จ — กรุณากรอกเอง'); setManualFor(receiptId); setManualMode('create'); setManual(emptyManual); }
    setLoading(''); load();
  }

  function openManual(receiptId:string, existing?:any){
    if(existing){
      setManual({
        amount: existing.amount || '', paidAt: existing.paidAt ? String(existing.paidAt).slice(0,10) : '',
        receiptNo: existing.receiptNo || '', transactionRef: existing.transactionRef || '',
        policyNo: existing.policyNo || '', payerName: existing.payerName || '',
        issuerName: existing.issuerName || '', type: existing.type || 'premium', periodLabel: existing.periodLabel || '',
      });
      setManualMode('edit');
    } else { setManual(emptyManual); setManualMode('create'); }
    setManualFor(receiptId);
  }

  async function saveManual(){
    if(!manualFor) return;
    if(!manual.amount){ setMsg('กรุณากรอกยอดเงิน'); return; }
    setLoading(manualFor);
    const payload = {
      issuerName: manual.issuerName || null, receiptNo: manual.receiptNo || null,
      transactionRef: manual.transactionRef || null, policyNo: manual.policyNo || null,
      payerName: manual.payerName || null, paidAt: manual.paidAt || null,
      amount: manual.amount, type: manual.type, periodLabel: manual.periodLabel || null,
      agentCode: null, qrBarcode: null,
      confidence: manualMode==='create' ? { overall: 0, manual:true, note:'กรอกเองจากเอกสาร' } : undefined,
      rawOcr: manualMode==='create' ? { manual:true, by:'self' } : undefined,
    };
    try{
      let j:any;
      if(manualMode==='create'){
        const res = await fetch('/api/receipts/ocr', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ receiptId: manualFor, ocrResult: payload }) });
        j = await res.json();
      } else {
        const correctedFields:any = {};
        if(manual.amount) correctedFields.amount = manual.amount;
        if(manual.paidAt) correctedFields.paidAt = new Date(manual.paidAt).toISOString();
        for(const k of ['receiptNo','transactionRef','policyNo','payerName','issuerName','type','periodLabel'] as const){
          if((manual as any)[k]) correctedFields[k] = (manual as any)[k];
        }
        const res = await fetch('/api/receipts/ocr', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ receiptId: manualFor, correctedFields }) });
        j = await res.json();
      }
      setMsg(j.ok ? 'บันทึกค่าแล้ว — ตรวจทานแล้วกดส่งตรวจสอบ' : (j.error || 'บันทึกไม่สำเร็จ'));
      if(j.ok){ setManualFor(null); setManual(emptyManual); }
    }catch{ setMsg('บันทึกไม่สำเร็จ'); }
    setLoading(''); load();
  }

  async function submitVerify(receiptId:string){
    const res = await fetch('/api/receipts/verify', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ receiptId, action:'submit' }) });
    const j = await res.json();
    setMsg(j.ok ? 'ส่งตรวจสอบแล้ว — รอเจ้าหน้าที่ตรวจกับแหล่งรับเงินจริง' : j.error);
    load();
  }

  async function verify(receiptId:string, action:'verify'|'reject'){
    const res = await fetch('/api/receipts/verify', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ receiptId, action, reason: action==='verify' ? 'ตรวจสอบกับรายงานรับเงินจริงแล้ว' : 'เอกสารไม่ชัดเจน', creditedPeriod: new Date().toISOString().slice(0,7), ledgerType:'premium' }) });
    const j = await res.json();
    setMsg(j.ok ? (action==='verify' ? 'รับรองยอดสำเร็จ' : 'ปฏิเสธแล้ว') : j.error);
    load();
  }

  const queue = receipts.filter((r:any)=> ['Uploaded','Extracted','PendingVerification'].includes(r.status));
  const history = receipts.filter((r:any)=> ['Verified','Rejected','Duplicate','Reversed'].includes(r.status));
  const inp = "w-full px-3 py-2 rounded-xl border text-sm";

  return (
    <div>
      <Header/>
      <div className="flex w-full">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-4">
          <h1 className="text-xl font-bold text-navy">สแกนใบเสร็จและรับรองยอด</h1>
          <p className="text-xs text-slate-500">อ่านค่าจริงจากภาพทุกครั้ง (ไม่สุ่มเลข) — บันทึกไว้ตรวจสอบย้อนหลังได้ตลอด OCR เป็นการอ่านข้อมูล ไม่ใช่การพิสูจน์ว่าเอกสารแท้หรือเงินเข้าจริง</p>

          <div className="flex gap-2">
            <button onClick={()=> setTab('upload')} className={`px-4 py-1.5 rounded-full text-xs border ${tab==='upload'?'bg-navy text-white':'bg-white'}`}>สแกน/อัปโหลด</button>
            <button onClick={()=> setTab('queue')} className={`px-4 py-1.5 rounded-full text-xs border ${tab==='queue'?'bg-navy text-white':'bg-white'}`}>คิวตรวจ ({queue.length})</button>
            <button onClick={()=> setTab('history')} className={`px-4 py-1.5 rounded-full text-xs border ${tab==='history'?'bg-navy text-white':'bg-white'}`}>ประวัติ</button>
          </div>

          {msg && <div className="p-2 rounded-xl bg-amber-50 border text-xs">{msg}</div>}

          {tab==='upload' && (
            <div className="card p-5">
              <div
                onDragOver={e=>{e.preventDefault(); setDragOver(true);}}
                onDragLeave={()=> setDragOver(false)}
                onDrop={e=>{e.preventDefault(); setDragOver(false); const f=e.dataTransfer.files?.[0]; if(f) setFile(f);}}
                className={`border-2 border-dashed rounded-xl p-6 text-center ${dragOver ? 'bg-amber-50 border-amber-300' : 'bg-slate-50'}`}
              >
                <div className="text-sm font-semibold">ถ่ายภาพผ่านมือถือ / ลากไฟล์มาวาง</div>
                <div className="text-xs text-slate-500 mt-1">รองรับ JPG/PNG/PDF หลายหน้า — อัปโหลดแล้วอ่านค่าจริงทันที</div>
                <input id="receipt-file-input" type="file" accept="image/*,application/pdf" capture="environment" onChange={e=> setFile(e.target.files?.[0] || null)} className="hidden" />
                <div className="mt-3 flex items-center justify-center gap-2">
                  <label htmlFor="receipt-file-input" className="px-6 py-2 rounded-full border bg-white text-xs font-semibold cursor-pointer hover:bg-slate-50 shadow-sm">📁 เลือกไฟล์</label>
                  <span className="text-xs text-slate-500">{file ? `${file.name} (${(file.size/1024).toFixed(0)} KB)` : 'ยังไม่ได้เลือกไฟล์'}</span>
                </div>
                <button onClick={upload} disabled={loading==='upload'} className="mt-3 px-6 py-2 rounded-full bg-navy text-white text-xs disabled:opacity-50">
                  {loading==='upload' ? 'กำลังอัปโหลด+อ่าน...' : 'อัปโหลด+สแกน'}
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {receipts.slice(0,5).map((r:any)=>(
                  <div key={r.id} className="flex items-center gap-2 p-2 rounded-xl border text-xs">
                    <span className="font-mono">{r.originalName}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] ${r.status==='Verified'?'bg-emerald-100 text-emerald-700': r.status==='Rejected'?'bg-red-100': 'bg-amber-100'}`}>{r.status}</span>
                    {r.extractions?.[0]?.amount && <span className="text-slate-600">฿{r.extractions[0].amount}</span>}
                    <span className="ml-auto flex gap-1">
                      {r.status==='Uploaded' && <button onClick={()=> readRealOcr(r.id, file)} disabled={loading===r.id} className="px-3 py-1 rounded-full border bg-white">อ่าน OCR</button>}
                      {r.status==='Extracted' && <button onClick={()=> submitVerify(r.id)} className="px-3 py-1 rounded-full bg-amber-500 text-white">ตรวจทานแล้ว — ส่งตรวจสอบ</button>}
                    </span>
                  </div>
                ))}
              </div>

              {manualFor && (
                <div className="mt-4 p-4 rounded-xl border bg-slate-50">
                  <div className="text-sm font-semibold">{manualMode==='create' ? 'กรอกค่าจากเอกสารเอง' : 'แก้ไขค่าที่อ่านได้'}</div>
                  <div className="mt-2 grid md:grid-cols-3 gap-2">
                    <input value={manual.amount} onChange={e=> setManual({...manual, amount:e.target.value})} placeholder="ยอดเงิน *" inputMode="decimal" className={inp} />
                    <input value={manual.paidAt} onChange={e=> setManual({...manual, paidAt:e.target.value})} type="date" className={inp} />
                    <input value={manual.receiptNo} onChange={e=> setManual({...manual, receiptNo:e.target.value})} placeholder="เลขใบเสร็จ" className={inp} />
                    <input value={manual.transactionRef} onChange={e=> setManual({...manual, transactionRef:e.target.value})} placeholder="เลขอ้างอิงธุรกรรม" className={inp} />
                    <input value={manual.policyNo} onChange={e=> setManual({...manual, policyNo:e.target.value})} placeholder="เลขกรมธรรม์" className={inp} />
                    <input value={manual.payerName} onChange={e=> setManual({...manual, payerName:e.target.value})} placeholder="ชื่อผู้ชำระ" className={inp} />
                    <input value={manual.issuerName} onChange={e=> setManual({...manual, issuerName:e.target.value})} placeholder="ผู้ออกเอกสาร" className={inp} />
                    <select value={manual.type} onChange={e=> setManual({...manual, type:e.target.value})} className={inp}>
                      <option value="premium">เบี้ยประกัน</option>
                      <option value="commission">ค่าบำเหน็จ (ต้องมีรายงานแยก)</option>
                    </select>
                    <input value={manual.periodLabel} onChange={e=> setManual({...manual, periodLabel:e.target.value})} placeholder="งวด (เช่น งวด 1)" className={inp} />
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={saveManual} className="px-5 py-1.5 rounded-full bg-navy text-white text-xs">บันทึกค่า</button>
                    <button onClick={()=>{ setManualFor(null); setManual(emptyManual); }} className="px-5 py-1.5 rounded-full border text-xs bg-white">ยกเลิก</button>
                  </div>
                </div>
              )}
            </div>
          )}

          {tab==='queue' && (
            <div className="card p-5">
              <h3 className="font-semibold text-sm">คิวตรวจหลักฐาน (สำหรับผู้มีสิทธิ document.verify)</h3>
              <div className="mt-3 space-y-2">
                {queue.length ? queue.map((r:any)=>(
                  <div key={r.id} className="p-3 rounded-xl border bg-slate-50 text-xs">
                    <div className="flex gap-2">
                      <span className="font-mono">{r.originalName}</span>
                      <span className="px-2 py-0.5 rounded-full bg-amber-100">{r.status}</span>
                      <span className="ml-auto">{new Date(r.createdAt).toLocaleString('th-TH')}</span>
                    </div>
                    {r.extractions?.[0] && (
                      <div className="mt-2 p-2 rounded bg-white border text-[11px] grid grid-cols-2 gap-1">
                        <span>ยอด: {r.extractions[0].amount || '-'}</span>
                        <span>วันที่ชำระ: {r.extractions[0].paidAt ? new Date(r.extractions[0].paidAt).toLocaleDateString('th-TH') : '-'}</span>
                        <span>เลขใบเสร็จ: {r.extractions[0].receiptNo || '-'}</span>
                        <span>กรมธรรม์: {r.extractions[0].policyNo || '-'}</span>
                        <span>ผู้ชำระ: {r.extractions[0].payerName || '-'}</span>
                        <span>อ้างอิง: {r.extractions[0].transactionRef || '-'}</span>
                      </div>
                    )}
                    <div className="mt-2 flex gap-2">
                      {r.extractions?.[0] && <button onClick={()=> openManual(r.id, r.extractions[0])} className="px-3 py-1 rounded-full border bg-white text-xs">แก้ไขค่า</button>}
                      <button onClick={()=> verify(r.id,'verify')} className="px-3 py-1 rounded-full bg-emerald-600 text-white text-xs">รับรองยอด</button>
                      <button onClick={()=> verify(r.id,'reject')} className="px-3 py-1 rounded-full border text-xs">ปฏิเสธ</button>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">ต้องเทียบกับแหล่งรับเงินจริงหรือรายงานผู้ออกเอกสาร — หากไม่มี API ให้เข้าคิวตรวจ manual</div>
                  </div>
                )) : <div className="text-xs text-slate-500 p-3 rounded-xl bg-slate-50 border">ไม่มีคิวรอตรวจ</div>}
              </div>
            </div>
          )}

          {tab==='history' && (
            <div className="card p-5">
              <h3 className="font-semibold text-sm">ประวัติการตรวจ (ตรวจสอบย้อนหลังได้ตลอด)</h3>
              <div className="mt-3 space-y-2">
                {history.map((r:any)=>(
                  <div key={r.id} className="p-2 rounded-xl border text-xs">
                    <div className="flex gap-2">
                      <span className="font-mono">{r.originalName}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[11px] ${r.status==='Verified'?'bg-emerald-100': r.status==='Duplicate'?'bg-slate-200':'bg-red-100'}`}>{r.status}</span>
                      <span className="ml-auto">{r.verifiedAt ? new Date(r.verifiedAt).toLocaleString('th-TH') : ''}</span>
                    </div>
                    {r.extractions?.[0] && <div className="mt-1 text-[11px] text-slate-600">ยอด ฿{r.extractions[0].amount || '-'} • ใบเสร็จ {r.extractions[0].receiptNo || '-'} • งวด {r.creditedPeriod || '-'}</div>}
                    {r.verifications?.[0] && <div className="mt-1 text-[11px] text-slate-500">โดย {r.verifications[0].verifiedBy ? 'เจ้าหน้าที่' : '-'} • {r.verifications[0].reason || ''} • {r.verifications[0].source || ''}</div>}
                  </div>
                ))}
                {!history.length && <div className="text-xs text-slate-500">ยังไม่มีประวัติ</div>}
              </div>
              <div className="mt-3 p-2 rounded-xl bg-amber-50 border text-[11px] text-amber-900">
                ใบเสร็จเบี้ยไม่ใช่หลักฐานยืนยันค่าบำเหน็จ — ต้องแยกรายงานค่าบำเหน็จที่ตรวจสอบแล้ว, ห้ามคัดยอดเบี้ยไปใส่เป็นค่าบำเหน็จโดยตรง
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
