'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

export default function ReferralPage(){
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [copied, setCopied] = useState('');

  useEffect(()=>{
    (async()=>{
      try{
        const res = await fetch('/api/referral');
        const j = await res.json();
        if(j.ok) setData(j);
        else setErr(j.error || 'โหลดไม่สำเร็จ');
      }catch{ setErr('เกิดข้อผิดพลาด'); }
      setLoading(false);
    })();
  },[]);

  function copy(text:string, label:string){
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(()=> setCopied(''), 2000);
  }

  if(loading) return <div><Header/><Sidebar/><div className="max-w-[720px] mx-auto p-6 text-sm">กำลังโหลด...</div></div></div>;
  if(err) return <div><Header/><Sidebar/><div className="max-w-[720px] mx-auto p-6"><div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{err} \u2014 กรุณาเข้าสู่ระบบ</div></div></div></div>;

  const link = data?.referralLink || '';

  return (
    <div>
      <Header/>
      <div className="flex w-full">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-4 max-w-[720px]">
          <h1 className="text-xl font-bold text-navy">รหัสแนะนำของฉัน</h1>
          <p className="text-xs text-slate-500">การมีรหัสแนะนำไม่ทำให้ได้รับสถานะตัวแทนหรือผลตอบแทนอัตโนมัติ \u2014 ต้องผ่านการอนุมัติตามเกณฑ์</p>

          <div className="card p-5 space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border bg-slate-50">
                <div className="text-xs text-slate-500">รหัสสมาชิก</div>
                <div className="text-lg font-mono font-bold">{data.memberCode || '-'}</div>
                <button onClick={()=> copy(data.memberCode, 'memberCode')} className="mt-2 text-xs px-3 py-1 rounded-full border bg-white hover:bg-slate-50">
                  {copied==='memberCode' ? 'คัดลอกแล้ว ✓' : 'คัดลอกรหัสสมาชิก'}
                </button>
              </div>
              <div className="p-4 rounded-xl border bg-amber-50">
                <div className="text-xs text-slate-500">รหัสแนะนำ</div>
                <div className="text-lg font-mono font-bold">{data.referralCode || '-'}</div>
                <button onClick={()=> copy(data.referralCode, 'referralCode')} className="mt-2 text-xs px-3 py-1 rounded-full border bg-white hover:bg-slate-50">
                  {copied==='referralCode' ? 'คัดลอกแล้ว ✓' : 'คัดลอกรหัสแนะนำ'}
                </button>
              </div>
            </div>

            <div className="p-4 rounded-xl border">
              <div className="text-xs text-slate-500">ลิงก์แนะนำ</div>
              <div className="text-sm font-mono break-all bg-slate-50 p-2 rounded mt-1">{link || '-'}</div>
              <div className="flex gap-2 mt-2">
                <button onClick={()=> copy(link, 'link')} className="text-xs px-3 py-1.5 rounded-full bg-navy text-white">{copied==='link' ? 'คัดลอกแล้ว ✓' : 'คัดลอกลิงก์'}</button>
                <a href={link} target="_blank" rel="noreferrer" className="text-xs px-3 py-1.5 rounded-full border">เปิดลิงก์สมัคร</a>
              </div>
            </div>

            {/* QR Code */}
            <div className="p-4 rounded-xl border text-center">
              <div className="text-xs text-slate-500 mb-2">QR Code สำหรับลิงก์สมัคร</div>
              {link ? (
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(link)}`}
                  alt="QR"
                  className="mx-auto border rounded-xl p-2 bg-white"
                  width={180} height={180}
                />
              ) : <div className="text-xs text-slate-400">\u2014</div>}
              <div className="text-[11px] text-slate-500 mt-2 break-all">{link}</div>
            </div>
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-sm">รายชื่อที่ฉันแนะนำ ({data.totalSponsored || 0} คน)</h3>
            {data.sponsored?.length ? (
              <div className="mt-3 space-y-2">
                {data.sponsored.map((u:any)=>(
                  <div key={u.id} className="flex items-center gap-3 p-2.5 rounded-xl border bg-slate-50 text-sm">
                    <div className="w-8 h-8 rounded-full bg-navy text-white flex items-center justify-center text-xs">{u.firstName?.[0] || '?'}</div>
                    <div>
                      <div className="font-semibold">{u.displayName || `${u.firstName} ${u.lastName}`}</div>
                      <div className="text-xs text-slate-500">{u.memberCode || '-'} \u2022 rank {u.rankLevel} \u2022 {u.status}</div>
                    </div>
                    <div className="ml-auto text-xs text-slate-500">{new Date(u.createdAt).toLocaleDateString('th-TH')}</div>
                  </div>
                ))}
              </div>
            ) : <div className="mt-3 text-xs text-slate-500 p-3 rounded-xl bg-slate-50 border">ยังไม่มีผู้ที่ได้รับการแนะนำ</div>}
          </div>
        </div>
      </div>
    </main>
  </div>
</div>
  );
}