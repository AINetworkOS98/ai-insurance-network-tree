'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

export default function ReceiptsPage(){
  const [receipts, setReceipts] = useState<any[]>([]);
  const [file, setFile] = useState<File|null>(null);
  const [loading, setLoading] = useState('');
  const [msg, setMsg] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [tab, setTab] = useState<'upload'|'queue'|'history'>('upload');

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
      if(j.ok){
        setMsg('อัปโหลดสำเร็จ — กำลังอ่านข้อมูล');
        setFile(null); load();
      } else setMsg(j.error || 'อัปโหลดไม่สำเร็จ');
    }catch{ setMsg('อัปโหลดไม่สำเร็จ'); }
    setLoading('');
  }

  async function ocrMock(receiptId:string){
    // จำลอง OCR — ใน production เรียก tesseract.js / API จริง
    setLoading(receiptId);
    const mock = {
      issuerName:'บริษัท ตัวอย่าง จำกัด',
      receiptNo:`R-${Math.random().toString(36).slice(2,8).toUpperCase()}`,
      transactionRef:`TX-${Date.now()}`,
      policyNo:`P-${Math.random().toString(36).slice(2,8)}`,
      payerName:'ผู้ชำระตัวอย่าง',
      paidAt: new Date().toISOString(),
      amount: String((Math.random()*50000+1000).toFixed(2)),
      type:'premium',
      periodLabel:'งวด 1',
      agentCode:'A-001',
      qrBarcode:'QR-MOCK',
      confidence:{ issuer:0.92, amount:0.96, date:0.89, overall:0.91 },
      rawOcr:{ mock:true }
    };
    const res = await fetch('/api/receipts/ocr', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ receiptId, ocrResult: mock }) });
    const j = await res.json();
    setMsg(j.ok ? 'อ่านข้อมูลแล้ว — กรุณาตรวจทานก่อนส่งตรวจสอบ' : j.error);
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

  return (
    <div>
      <Header/>
      <div className="flex max-w-[1280px] mx-auto">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-4">
          <h1 className="text-xl font-bold text-navy">สแกนใบเสร็จและรับรองยอด</h1>
          <p className="text-xs text-slate-500">OCR เป็นการอ่านข้อมูล ไม่ใช่การพิสูจน์ว่าเอกสารแท้หรือเงินเข้าจริง — QR Code ไม่เพียงพอต่อการรับรองยอด</p>

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
                <div className="text-xs text-slate-500 mt-1">รองรับ JPG/PNG/PDF หลายหน้า — เก็บต้นฉบับตามสิทธิ</div>
                <input type="file" accept="image/*,application/pdf" capture="environment" onChange={e=> setFile(e.target.files?.[0] || null)} className="mt-3 text-xs" />
                {file && <div className="mt-2 text-xs">เลือกแล้ว: {file.name} ({(file.size/1024).toFixed(0)} KB)</div>}
                <button onClick={upload} disabled={loading==='upload'} className="mt-3 px-6 py-2 rounded-full bg-navy text-white text-xs disabled:opacity-50">
                  {loading==='upload' ? 'กำลังอัปโหลด...' : 'อัปโหลด'}
                </button>
              </div>

              <div className="mt-4 space-y-2">
                {receipts.slice(0,5).map((r:any)=>(
                  <div key={r.id} className="flex items-center gap-2 p-2 rounded-xl border text-xs">
                    <span className="font-mono">{r.originalName}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] ${r.status==='Verified'?'bg-emerald-100 text-emerald-700': r.status==='Rejected'?'bg-red-100': 'bg-amber-100'}`}>{r.status}</span>
                    <span className="ml-auto flex gap-1">
                      {r.status==='Uploaded' && <button onClick={()=> ocrMock(r.id)} disabled={loading===r.id} className="px-3 py-1 rounded-full border bg-white">อ่าน OCR</button>}
                      {r.status==='Extracted' && <button onClick={()=> submitVerify(r.id)} className="px-3 py-1 rounded-full bg-amber-500 text-white">ตรวจทานแล้ว — ส่งตรวจสอบ</button>}
                    </span>
                  </div>
                ))}
              </div>
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
                        <span>confidence: {r.extractions[0].confidence ? JSON.stringify(r.extractions[0].confidence).slice(0,60) : '-'}</span>
                      </div>
                    )}
                    <div className="mt-2 flex gap-2">
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
              <h3 className="font-semibold text-sm">ประวัติการตรวจ</h3>
              <div className="mt-3 space-y-2">
                {history.map((r:any)=>(
                  <div key={r.id} className="p-2 rounded-xl border text-xs flex gap-2">
                    <span className="font-mono">{r.originalName}</span>
                    <span className={`px-2 py-0.5 rounded-full text-[11px] ${r.status==='Verified'?'bg-emerald-100': r.status==='Duplicate'?'bg-slate-200':'bg-red-100'}`}>{r.status}</span>
                    <span className="ml-auto">{r.verifiedAt ? new Date(r.verifiedAt).toLocaleString('th-TH') : ''}</span>
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
