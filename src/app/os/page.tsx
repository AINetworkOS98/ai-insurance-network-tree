'use client';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import AIIntelligentSearch from '@/components/AIIntelligentSearch';

type AppId = 'ai'|'tree'|'members'|'files'|'terminal'|'settings';
interface Win { id: AppId; title: string; icon: string; x:number; y:number; w:number; h:number; z:number; minimized:boolean; maximized:boolean; }

const APPS: Record<AppId, {title:string; icon:string; color:string}> = {
  ai: {title:'AI ผู้ช่วย', icon:'✦', color:'bg-sky-500'},
  tree: {title:'ผังเครือข่าย 1:5', icon:'⁂', color:'bg-emerald-500'},
  members: {title:'สมาชิก', icon:'👥', color:'bg-violet-500'},
  files: {title:'ไฟล์', icon:'📁', color:'bg-amber-500'},
  terminal: {title:'เทอร์มินัล', icon:'▣', color:'bg-slate-800'},
  settings: {title:'ตั้งค่า', icon:'⚙', color:'bg-slate-500'},
};

export default function HermesOS(){
  const [wins, setWins] = useState<Win[]>([
    {id:'ai', title:'AI ผู้ช่วย • ระบบค้นหาอัจฉริยะ', icon:'✦', x:80, y:48, w:720, h:520, z:10, minimized:false, maximized:false},
  ]);
  const [active, setActive] = useState<AppId>('ai');
  const [time, setTime] = useState('');
  const dragRef = useRef<{id:AppId, dx:number, dy:number}|null>(null);
  const [zCounter, setZCounter] = useState(11);

  useEffect(()=>{ const t=setInterval(()=> setTime(new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})), 1000); setTime(new Date().toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit'})); return ()=> clearInterval(t); },[]);

  const openApp = (id:AppId)=>{
    setWins(prev=>{
      const ex = prev.find(w=>w.id===id);
      if(ex) return prev.map(w=> w.id===id ? {...w, minimized:false, z:zCounter} : w);
      const app = APPS[id];
      return [...prev, {id, title: app.title, icon: app.icon, x: 60+prev.length*32, y: 48+prev.length*28, w: id==='ai'?720:640, h: 480, z:zCounter, minimized:false, maximized:false}];
    });
    setActive(id); setZCounter(v=>v+1);
  };
  const closeWin = (id:AppId)=> setWins(prev=> prev.filter(w=>w.id!==id));
  const toggleMin = (id:AppId)=> setWins(prev=> prev.map(w=> w.id===id ? {...w, minimized: !w.minimized} : w));
  const toggleMax = (id:AppId)=> setWins(prev=> prev.map(w=> w.id===id ? {...w, maximized: !w.maximized} : w));
  const focus = (id:AppId)=> { setActive(id); setWins(prev=> prev.map(w=> w.id===id ? {...w, z:zCounter} : w)); setZCounter(v=>v+1); };

  const onMouseDown = (e:React.MouseEvent, id:AppId)=>{
    const win = wins.find(w=>w.id===id); if(!win || win.maximized) return;
    dragRef.current = {id, dx: e.clientX - win.x, dy: e.clientY - win.y};
  };
  useEffect(()=>{
    const move = (e:MouseEvent)=>{
      if(!dragRef.current) return;
      const {id, dx, dy} = dragRef.current;
      setWins(prev=> prev.map(w=> w.id===id ? {...w, x: Math.max(0, e.clientX - dx), y: Math.max(0, e.clientY - dy)} : w));
    };
    const up = ()=> dragRef.current=null;
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
    return ()=>{ window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
  },[]);

  const hero = (
    <div className="text-center py-2">
      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#eff6ff] border border-blue-100 text-[11px] text-sky-700">✦ ระบบค้นหาด้วย AI อัจฉริยะ • Hermes Engine</div>
      <p className="text-[11px] text-slate-400 mt-1">พิมพ์ วางข้อมูล แนบไฟล์ — สตรีมทีละคำแบบ Hermes</p>
    </div>
  );

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col select-none" style={{background: 'linear-gradient(135deg, #e0f2fe 0%, #f0f7ff 30%, #fdf2f8 70%, #fef3c7 100%)'}}>
      {/* Top bar — macOS style */}
      <div className="h-7 shrink-0 bg-white/70 backdrop-blur border-b border-white/50 flex items-center justify-between px-3 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-bold text-slate-800">⬢ Hermes OS</span>
          <span className="hidden md:inline text-slate-500">AI Insurance Network Tree</span>
          <span className="hidden lg:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[11px]"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"/> Gateway active • Muse Spark 1.2</span>
        </div>
        <div className="flex items-center gap-3 text-slate-600">
          <span className="hidden md:inline">Streaming • Multi-step</span>
          <span>{time}</span>
          <Link href="/" className="px-2.5 py-1 rounded-full bg-white border border-slate-200 hover:bg-slate-50">หน้าแรก</Link>
        </div>
      </div>

      {/* Desktop */}
      <div className="flex-1 relative overflow-hidden">
        {/* Dock — left */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 z-20 hidden md:flex flex-col gap-2 p-2 rounded-[20px] bg-white/80 backdrop-blur border border-white/60 shadow-[0_8px_40px_rgba(0,0,0,.12)]">
          {(Object.keys(APPS) as AppId[]).map(id=>{
            const app = APPS[id];
            const isOpen = wins.some(w=>w.id===id && !w.minimized);
            const isActive = active===id && isOpen;
            return (
              <button key={id} onClick={()=> openApp(id)} className={`relative w-11 h-11 rounded-2xl flex items-center justify-center text-lg transition ${isActive ? 'bg-slate-900 text-white shadow-lg scale-105' : 'bg-white border border-slate-200 hover:scale-105 hover:shadow-md'}`} title={app.title}>
                <span className={`absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-6 rounded-full ${isOpen ? 'bg-sky-500' : 'bg-transparent'}`}/>
                {app.icon}
              </button>
            );
          })}
          <div className="h-px bg-slate-200 my-1"/>
          <Link href="/login" className="w-11 h-11 rounded-2xl bg-[#475569] text-white flex items-center justify-center text-sm hover:bg-slate-800" title="เข้าสู่ระบบ">◉</Link>
        </div>

        {/* Mobile dock — bottom */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex md:hidden gap-2 p-2 rounded-full bg-white/90 backdrop-blur border border-white/60 shadow-xl">
          {(Object.keys(APPS) as AppId[]).map(id=>(
            <button key={id} onClick={()=> openApp(id)} className={`w-10 h-10 rounded-full flex items-center justify-center ${active===id?'bg-slate-900 text-white':'bg-white border border-slate-200'}`}>{APPS[id].icon}</button>
          ))}
        </div>

        {/* Windows */}
        {wins.filter(w=>!w.minimized).sort((a,b)=>a.z-b.z).map(win=>(
          <div key={win.id} onMouseDown={()=> focus(win.id)} style={win.maximized ? {left:8, top:8, width:'calc(100% - 16px)', height:'calc(100% - 16px)', zIndex: win.z} as any : {left:win.x, top:win.y, width:win.w, height:win.h, zIndex: win.z} as any} className="absolute rounded-[16px] bg-white border border-slate-200 shadow-[0_20px_60px_rgba(0,0,0,.18)] flex flex-col overflow-hidden">
            {/* Title bar */}
            <div onMouseDown={(e)=> onMouseDown(e, win.id)} className={`h-9 shrink-0 flex items-center justify-between px-3 cursor-move ${win.id==='ai'?'bg-[#f0f7ff] border-b border-blue-100':'bg-slate-50 border-b border-slate-200'}`}>
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <button onClick={()=> closeWin(win.id)} className="w-3 h-3 rounded-full bg-red-400 hover:bg-red-500"/>
                  <button onClick={()=> toggleMin(win.id)} className="w-3 h-3 rounded-full bg-amber-400 hover:bg-amber-500"/>
                  <button onClick={()=> toggleMax(win.id)} className="w-3 h-3 rounded-full bg-emerald-400 hover:bg-emerald-500"/>
                </div>
                <span className="ml-2 text-xs font-semibold text-slate-700 flex items-center gap-1.5"><span className="text-sm">{win.icon}</span> {win.title}</span>
              </div>
              <span className="text-[11px] text-slate-400 hidden md:inline">{win.id==='ai' ? 'Streaming • SSE' : 'Hermes OS Window'}</span>
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-hidden bg-[#fcfdff]">
              {win.id==='ai' && (
                <div className="h-full flex flex-col p-3">
                  <AIIntelligentSearch variant="chat" topContent={hero} />
                </div>
              )}
              {win.id==='tree' && (
                <div className="h-full overflow-auto p-4">
                  <h3 className="font-bold text-slate-800">⁂ ผังเครือข่าย 1 แตก 5</h3>
                  <p className="text-xs text-slate-500 mt-1">ระบบ BFS Auto-Placement • 5^level • คำนวณเครือข่ายอัตโนมัติ</p>
                  <div className="mt-4 grid grid-cols-3 gap-3 text-center">
                    {[{l:0,n:1},{l:1,n:5},{l:2,n:25},{l:3,n:125}].map(r=>(
                      <div key={r.l} className="rounded-2xl bg-[#f0f7ff] border border-blue-100 p-3">
                        <div className="text-xs text-slate-500">Level {r.l}</div>
                        <div className="text-lg font-bold text-sky-700">{r.n.toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Link href="/tree" className="px-4 py-2 rounded-full bg-sky-500 text-white text-xs font-semibold">เปิดผังเต็มจอ →</Link>
                    <Link href="/network-example" className="px-4 py-2 rounded-full bg-white border border-slate-200 text-xs">ตัวอย่างเครือข่าย</Link>
                  </div>
                </div>
              )}
              {win.id==='members' && (
                <div className="h-full overflow-auto p-4">
                  <h3 className="font-bold text-slate-800">👥 สมาชิก</h3>
                  <p className="text-xs text-slate-500 mt-1">ค้นหา • กรอง • จัดการสมาชิกตามสิทธิ์</p>
                  <div className="mt-3 flex gap-2">
                    <input placeholder="ค้นหาชื่อ / รหัส / เบอร์" className="flex-1 px-3 py-2 rounded-full border border-slate-200 text-sm bg-white"/>
                    <button className="px-4 py-2 rounded-full bg-[#475569] text-white text-xs">ค้นหา</button>
                  </div>
                  <div className="mt-4 space-y-2">
                    {['MEM00001 สมชาย ใจดี','MEM00002 สมหญิง รักดี','MEM00017 ศุภชัย มั่งมี'].map(m=>(
                      <div key={m} className="flex items-center gap-3 p-3 rounded-2xl border border-slate-100 bg-white">
                        <div className="w-8 h-8 rounded-full bg-[#f0f7ff] border border-blue-100 flex items-center justify-center text-xs">👤</div>
                        <div className="text-xs"><b>{m.split(' ')[0]}</b> {m.split(' ').slice(1).join(' ')}<br/><span className="text-slate-400">Level 1 • ACTIVE</span></div>
                        <span className="ml-auto text-[11px] px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">PASS</span>
                      </div>
                    ))}
                  </div>
                  <Link href="/members" className="mt-4 inline-flex px-4 py-2 rounded-full bg-white border border-slate-200 text-xs">เปิดหน้าสมาชิกเต็ม →</Link>
                </div>
              )}
              {win.id==='files' && (
                <div className="h-full overflow-auto p-4">
                  <h3 className="font-bold text-slate-800">📁 ไฟล์</h3>
                  <div className="mt-3 grid grid-cols-3 gap-3">
                    {[{n:'เอกสาร',c:'12 ไฟล์',i:'📄'},{n:'ใบเสร็จ',c:'8 ไฟล์',i:'🧾'},{n:'รูปภาพ',c:'24 ไฟล์',i:'🖼️'},{n:'CSV',c:'5 ไฟล์',i:'📊'},{n:'PDF',c:'7 ไฟล์',i:'📕'},{n:'แชร์',c:'3 โฟลเดอร์',i:'🔗'}].map(f=>(
                      <div key={f.n} className="rounded-2xl border border-slate-200 bg-white p-4 text-center hover:shadow-md cursor-pointer">
                        <div className="text-2xl">{f.i}</div>
                        <div className="text-xs font-semibold mt-1">{f.n}</div>
                        <div className="text-[11px] text-slate-400">{f.c}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {win.id==='terminal' && (
                <div className="h-full bg-slate-900 text-emerald-300 p-3 font-mono text-xs overflow-auto">
                  <div className="text-slate-400"># Hermes OS Terminal — Muse Spark 1.2</div>
                  <div className="mt-2">$ hermes status</div>
                  <div>Gateway: <span className="text-emerald-400">active</span> • Model: muse-spark-1.2-contributor-free</div>
                  <div>Provider: opencode-free • Base: https://opencode.ai/zen/v1</div>
                  <div className="mt-2">$ curl /api/ai/stream</div>
                  <div className="text-sky-300">→ Streaming SSE connected ...</div>
                  <div className="mt-2 flex gap-2">
                    <span className="text-slate-500">$</span><span className="animate-pulse">█</span>
                  </div>
                </div>
              )}
              {win.id==='settings' && (
                <div className="h-full overflow-auto p-4 space-y-3">
                  <h3 className="font-bold text-slate-800">⚙ ตั้งค่า Hermes OS</h3>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-xs font-semibold">AI Provider</div>
                    <div className="text-xs text-slate-500 mt-1">opencode-free • Muse Spark 1.2 Contributor (Streaming)</div>
                    <div className="mt-2 inline-flex px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs">● Configured</div>
                  </div>
                  <div className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="text-xs font-semibold">โหมดการค้นหา</div>
                    <div className="mt-2 flex gap-2"><span className="px-3 py-1 rounded-full bg-[#f0f7ff] border border-blue-100 text-xs">เร็ว</span><span className="px-3 py-1 rounded-full bg-slate-900 text-white text-xs">อัจฉริยะ</span><span className="px-3 py-1 rounded-full bg-white border text-xs">วิเคราะห์เชิงลึก</span></div>
                  </div>
                  <div className="text-[11px] text-slate-400">เวอร์ชัน OS: Hermes OS 1.0 • Build: 2026.09.12 • หน้าเว็บหลัก: /</div>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Taskbar — bottom */}
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-900/90 backdrop-blur text-white shadow-xl">
          {wins.map(w=>(
            <button key={w.id} onClick={()=> w.minimized ? toggleMin(w.id) : focus(w.id)} className={`px-3 py-1.5 rounded-full text-xs flex items-center gap-1.5 ${active===w.id && !w.minimized ? 'bg-white text-slate-900' : 'bg-white/10 hover:bg-white/20'}`}>{w.icon} {APPS[w.id].title}</button>
          ))}
          <span className="w-px h-4 bg-white/20 mx-1"/>
          <span className="text-[11px] text-white/70">{wins.filter(w=>!w.minimized).length} หน้าต่าง</span>
        </div>
      </div>
    </div>
  );
}
