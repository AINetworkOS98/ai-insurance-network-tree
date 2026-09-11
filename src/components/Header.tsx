'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
export default function Header(){
  const [unread, setUnread] = useState<number|null>(null);
  const [user, setUser] = useState<{email:string, displayName?:string}|null>(null);
  const [showMenu, setShowMenu] = useState(false);
  useEffect(()=>{ (async()=>{
    try{ const r=await fetch('/api/notifications'); const j=await r.json(); if(j.ok) setUnread(j.unread); }catch{}
    // ลองเช็ค session จาก /api/auth/me หรือ decode cookie ง่ายๆ — ใช้ /api/members/me ถ้ามี
    try{
      const r=await fetch('/api/auth/login', { method:'GET' } as any);
      // fallback: ดู token ใน cookie แล้วเรียก /api/members?limit=1 เพื่อเช็ค auth
    }catch{}
    // อ่านจาก localStorage ที่ login อาจเก็บไว้
    try{
      const raw = document.cookie;
      // ถ้ามี token ให้ถือว่า login แล้ว — ดึง email จาก JWT payload (base64 decode)
      const m = raw.match(/(?:^|;\s*)token=([^;]+)/);
      if(m){
        const token = decodeURIComponent(m[1]);
        const payload = token.split('.')[1];
        if(payload){
          const json = JSON.parse(atob(payload.replace(/-/g,'+').replace(/_/g,'/')));
          setUser({ email: json.email || '', displayName: json.displayName || '' });
        }
      }
    }catch{}
  })(); },[]);
  async function logout(){
    try{ await fetch('/api/auth/logout', { method:'POST' }); }catch{}
    location.href = '/login';
  }
  return (
    <header className="bg-[#FFFBF5] sticky top-0 z-40 border-b border-[#f3e8d3] text-[#475569]">
      <div className="max-w-[1280px] mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <img src="/logo.png" alt="AI Insurance Network Tree" className="h-9 w-auto bg-white rounded-xl px-1 py-1 object-contain border border-[#f3e8d3]" />
          <div>
            <div className="font-bold leading-none text-sm text-[#475569]">AI Insurance Network Tree</div>
            <div className="text-[11px] text-[#57534e]">ระบบบริหารเครือข่ายตัวแทน • ต้นไม้ฐาน 5 คน</div>
          </div>
        </Link>
        <nav className="hidden md:flex gap-5 text-sm items-center">
          <Link href="/" className="text-[#57534e] hover:text-[#475569] transition-colors">หน้าแรก</Link>
          <Link href="/verify" className="text-[#57534e] hover:text-[#475569] transition-colors">ตรวจสมาชิก</Link>
          <Link href="/prospects" className="text-[#57534e] hover:text-[#475569] transition-colors">ผู้สนใจ</Link>
          <Link href="/tree" className="text-[#57534e] hover:text-[#475569] transition-colors">ผังเครือข่าย</Link>
          <Link href="/income" className="text-[#57534e] hover:text-[#475569] transition-colors">รายได้</Link>
          <Link href="/admin" className="text-[#57534e] hover:text-[#475569] transition-colors">ผู้ดูแล</Link>
          <Link href="/notifications" className="relative text-[#57534e] hover:text-[#475569] transition-colors">🔔 แจ้งเตือน {unread!=null && unread>0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[11px]">{unread}</span>}</Link>
        </nav>
        <div className="flex items-center gap-2">
          {user ? (
            <div className="relative">
              <button onClick={()=> setShowMenu(!showMenu)} className="px-3 py-2 rounded-full bg-[#eff6ff] border border-blue-200 text-xs font-semibold text-sky-800 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-sky-500 text-white flex items-center justify-center text-[11px]">{(user.email||'?')[0].toUpperCase()}</span>
                <span className="max-w-[120px] truncate hidden sm:inline">{user.email}</span>
              </button>
              {showMenu && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl border bg-white shadow-lg p-2 text-sm z-50">
                  <div className="px-3 py-2 text-xs text-slate-500 border-b truncate">{user.email}</div>
                  <Link href="/settings" className="block px-3 py-2 rounded-lg hover:bg-slate-50">ตั้งค่า</Link>
                  <button onClick={logout} className="w-full text-left px-3 py-2 rounded-lg hover:bg-red-50 text-red-600">ออกจากระบบ</button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link href="/login" className="px-4 py-2 rounded-full border border-blue-200 bg-white text-sky-700 text-sm font-semibold">เข้าสู่ระบบ</Link>
              <Link href="/register" className="px-4 py-2 rounded-full bg-[#c8a84e] text-[#475569] text-sm font-semibold">สมัครแสดงความสนใจ</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
