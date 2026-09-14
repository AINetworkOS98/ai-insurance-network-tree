'use client';
import { useState } from 'react';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

type LinkItem = { title: string; url: string; snippet: string; source: string };

// หน้าค้นหา (search_landing) — เพจสาธารณะ เสิร์ชเว็บ/YouTube + ทางลัดเข้าระบบผัง 1 แตก 5
export default function SearchLanding(){
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [searched, setSearched] = useState(false);
  const [msg, setMsg] = useState('');

  async function doSearch(e?: any){
    e?.preventDefault();
    const query = q.trim();
    if(!query){ setMsg('พิมพ์คำค้นหาก่อน'); return; }
    setLoading(true); setMsg(''); setSearched(true);
    try{
      const res = await fetch('/api/search', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ query, mode:'SMART' }) });
      const j = await res.json();
      if(j.ok){ setLinks(j.links || []); }
      else setMsg(j.error || 'ค้นหาไม่สำเร็จ');
    }catch{ setMsg('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'); }
    setLoading(false);
  }

  const shortcuts = [
    { href:'/tree', title:'ผังเครือข่าย 1 แตก 5', desc:'ดูผังสายงานกว้าง 5 คนของฉัน', icon:'🌳' },
    { href:'/recruit', title:'ชวนสมาชิกใหม่', desc:'ส่งลิงก์ชวนเข้าทีม 1 แตก 5', icon:'🤝' },
    { href:'/register', title:'สมัครสมาชิก', desc:'สร้างบัญชีเพื่อเข้าระบบ', icon:'📝' },
    { href:'/login', title:'เข้าสู่ระบบ', desc:'อีเมล / Google / Facebook / GitHub', icon:'🔑' },
    { href:'/dashboard', title:'แดชบอร์ด', desc:'ภาพรวมผลงานและรายได้', icon:'📊' },
    { href:'/income', title:'รายได้', desc:'สรุปค่าตอบแทนตามผัง', icon:'💰' },
  ];

  return (
    <div className="min-h-screen bg-[#ffffff] flex flex-col">
      {/* Top bar */}
      <div className="h-[56px] shrink-0 border-b border-[#dbeafe] bg-white/90 backdrop-blur flex items-center justify-between px-4 md:px-6">
        <Link href="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="AI Insurance" className="h-8 w-auto bg-white rounded-lg border border-[#dbeafe] object-contain p-0.5"/>
          <span className="text-sm font-bold text-slate-800">AI Insurance Network Tree</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link href="/" className="text-xs text-slate-500 hover:text-slate-700">หน้าแรก</Link>
          <Link href="/login" className="px-4 py-2 rounded-full bg-[#475569] text-white text-xs font-semibold hover:bg-slate-800">เข้าสู่ระบบ</Link>
        </div>
      </div>

      <div className="flex-1 w-full max-w-[860px] mx-auto px-4 md:px-6 py-10">
        <div className="text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-slate-800">ค้นหา</h1>
          <p className="mt-2 text-sm text-slate-500">ค้นหาข้อมูลประกัน ทีมงาน 1 แตก 5 และความรู้ตัวแทน</p>
        </div>

        {/* Search box */}
        <form onSubmit={doSearch} className="mt-6 flex gap-2">
          <input
            id="landing_search_input"
            value={q}
            onChange={e=> setQ(e.target.value)}
            placeholder="พิมพ์คำค้นหา เช่น ประกัน 1 แตก 5, สมัครตัวแทน..."
            className="flex-1 px-5 py-3.5 rounded-2xl border border-[#dbeafe] bg-[#f0f7ff] text-sm placeholder:text-slate-400 focus:outline-none focus:bg-white focus:ring-4 focus:ring-[#eff6ff] transition"
          />
          <button type="submit" disabled={loading} className="px-6 py-3.5 rounded-2xl bg-[#475569] text-white text-sm font-semibold hover:bg-slate-800 disabled:opacity-50 shrink-0">
            {loading ? 'กำลังค้น...' : 'ค้นหา'}
          </button>
        </form>
        {msg && <p className="mt-3 text-center text-xs text-rose-500">{msg}</p>}

        {/* Results */}
        {searched && !loading && links.length > 0 && (
          <div className="mt-6 space-y-3">
            {links.map((l, i)=>(
              <a key={i} href={l.url} target="_blank" rel="noopener noreferrer" className="block p-4 rounded-2xl bg-[#f0f7ff] border border-[#dbeafe] hover:bg-[#e8f0ff] transition">
                <div className="text-sm font-semibold text-slate-800">{l.title}</div>
                {l.snippet && <div className="mt-1 text-xs text-slate-500 leading-relaxed">{l.snippet}</div>}
                <div className="mt-1 text-[11px] text-slate-400 truncate">{l.url}</div>
              </a>
            ))}
          </div>
        )}
        {searched && !loading && links.length === 0 && !msg && (
          <p className="mt-6 text-center text-xs text-slate-400">ไม่พบผลลัพธ์ — ลองคำอื่น</p>
        )}

        {/* Shortcuts */}
        <div className="mt-10">
          <h2 className="text-sm font-bold text-slate-700">ทางลัดเข้าระบบ</h2>
          <div className="mt-3 grid grid-cols-2 md:grid-cols-3 gap-3">
            {shortcuts.map(s=>(
              <Link key={s.href} href={s.href} className="p-4 rounded-2xl bg-[#f0f7ff] border border-[#dbeafe] hover:bg-[#e8f0ff] transition">
                <div className="text-xl">{s.icon}</div>
                <div className="mt-2 text-sm font-semibold text-slate-800">{s.title}</div>
                <div className="mt-0.5 text-[11px] text-slate-500">{s.desc}</div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <footer className="py-3 text-center text-[11px] text-slate-400 border-t border-[#dbeafe] bg-white">
        <Link href="/privacy" className="hover:underline">นโยบายความเป็นส่วนตัว</Link> • <Link href="/terms" className="hover:underline">ข้อกำหนด</Link> • © 2026 AI Insurance Network Tree
      </footer>
    </div>
  );
}
