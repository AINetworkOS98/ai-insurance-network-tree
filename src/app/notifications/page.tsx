'use client';
import { useEffect, useState } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

export default function NotificationsPage(){
  const [list, setList] = useState<any[]>([]);
  const [unread, setUnread] = useState(0);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [filterUnread, setFilterUnread] = useState(false);

  async function load(){
    const url = `/api/notifications?q=${encodeURIComponent(q)}${filterUnread?'&unread=1':''}`;
    const r = await fetch(url);
    const j = await r.json();
    if(j.ok){ setList(j.notifications||[]); setUnread(j.unread||0); }
  }
  useEffect(()=>{ load(); },[filterUnread]);
  async function markAll(){ await fetch('/api/notifications', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ action:'readAll' })}); load(); setMsg('อ่านทั้งหมดแล้ว'); }
  async function markOne(id:string){ await fetch('/api/notifications', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ notificationId: id })}); load(); }

  return (
    <div>
      <Header/>
      <div className="flex max-w-[1280px] mx-auto">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-4">
          <div className="flex gap-2 items-center">
            <h1 className="text-xl font-bold text-navy">ศูนย์แจ้งเตือน</h1>
            <span className="px-2.5 py-0.5 rounded-full bg-red-600 text-white text-xs">{unread} ยังไม่อ่าน</span>
            <button onClick={markAll} className="ml-auto px-4 py-1.5 rounded-full border bg-white text-xs">อ่านทั้งหมด</button>
          </div>
          <div className="flex gap-2">
            <input value={q} onChange={e=> setQ(e.target.value)} onKeyDown={e=> e.key==='Enter' && load()} placeholder="ค้นหาแจ้งเตือน..." className="flex-1 px-3 py-1.5 rounded-xl border text-xs" />
            <button onClick={()=> load()} className="px-4 py-1.5 rounded-full bg-navy text-white text-xs">ค้นหา</button>
            <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={filterUnread} onChange={e=> setFilterUnread(e.target.checked)} /> ยังไม่อ่าน</label>
          </div>
          {msg && <div className="p-2 rounded-xl bg-amber-50 border text-xs">{msg}</div>}
          <div className="card p-4">
            <div className="space-y-2 max-h-[520px] overflow-auto">
              {list.map((n:any)=>(
                <div key={n.id} onClick={()=> !n.isRead && markOne(n.id)} className={`p-3 rounded-xl border text-xs flex gap-3 cursor-pointer ${n.isRead?'bg-white':'bg-amber-50 border-amber-200'}`}>
                  <div className="flex-1">
                    <div className="font-semibold">{n.title} <span className="font-normal text-[11px] text-slate-500">({n.type})</span></div>
                    <div className="text-slate-600 mt-0.5 line-clamp-2">{n.body || '-'}</div>
                    <div className="text-[11px] text-slate-400 mt-1">{new Date(n.createdAt).toLocaleString('th-TH')}</div>
                  </div>
                  {n.referenceId && <a href={n.referenceId.startsWith('/')? n.referenceId : `/${n.referenceId}`} className="px-3 py-1 rounded-full border bg-white text-[11px] self-center">เปิดรายการ</a>}
                </div>
              ))}
              {!list.length && <div className="text-xs text-slate-500 p-3 rounded-xl bg-slate-50 border">ไม่มีแจ้งเตือน</div>}
            </div>
          </div>
          <div className="card p-4">
            <h3 className="font-semibold text-sm">คิวอีเมล</h3>
            <EmailPanel/>
          </div>
        </main>
      </div>
    </div>
  );
}

function EmailPanel(){
  const [emails, setEmails] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [connected, setConnected] = useState<boolean| null>(null);
  useEffect(()=>{ (async()=>{ const r=await fetch('/api/emails'); const j=await r.json(); if(j.ok){ setEmails(j.emails||[]); setSummary(j.summary); setConnected(j.connected); } })(); },[]);
  return (
    <div className="mt-2 space-y-2">
      <div className="text-[11px] text-slate-500">{connected===false ? 'ยังไม่เชื่อมต่ออีเมล (ตั้งค่า EMAIL_API_KEY)' : connected ? 'เชื่อมต่อแล้ว' : ''} {summary && <span>• QUEUED {summary.QUEUED||0} • SENT {summary.SENT||0} • FAILED {summary.FAILED||0}</span>}</div>
      {emails.slice(0,20).map((e:any)=>(
        <div key={e.id} className={`flex gap-2 text-[11px] p-2 rounded border ${e.status==='SENT'?'bg-emerald-50': e.status==='FAILED'?'bg-red-50':'bg-slate-50'}`}>
          <span className="font-mono">{e.toEmail}</span>
          <span className="truncate flex-1">{e.subject}</span>
          <span className="px-1.5 py-0.5 rounded text-[10px] bg-white border">{e.status}</span>
        </div>
      ))}
      {!emails.length && <div className="text-xs text-slate-500">ไม่มีคิวอีเมล</div>}
    </div>
  );
}
