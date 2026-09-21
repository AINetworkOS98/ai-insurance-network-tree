'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import LanguageMenu from '@/components/LanguageMenu';
import { useT } from '@/i18n';
export default function Header(){
  const { t } = useT();
  const [unread, setUnread] = useState<number|null>(null);
  const [user, setUser] = useState<{email:string, displayName?:string}|null>(null);
  const [n8nOpen, setN8nOpen] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  useEffect(()=>{ (async()=>{
    try{ const r=await fetch('/api/notifications'); const j=await r.json(); if(j.ok) setUnread(j.unread); }catch{}
    // ใช้ /api/auth/me เพื่อเช็ค auth status — cookie httpOnly อ่านได้ฝั่ง server
    try{
      const r = await fetch('/api/auth/me', { credentials: 'include' });
      const j = await r.json();
      if(j.ok && j.authed && j.user){
        setUser({ email: j.user.email || '', displayName: j.user.displayName || '' });
      }
    }catch{}
  })(); },[]);
  async function logout(){
    try{ await fetch('/api/auth/logout', { method:'POST' }); }catch{}
    location.href = '/login';
  }
  return (
    <header className="bg-white sticky top-0 z-40 border-b border-[#f3e8d3] text-[#475569]">
      <div className="w-full px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <img src="/logo.png" alt="AI Insurance Network Tree" className="h-9 w-auto bg-white rounded-xl px-1 py-1 object-contain border border-[#f3e8d3]" />
          <div>
            <div className="font-bold leading-none text-sm text-[#475569]">AI Insurance Network Tree</div>
            <div className="text-[11px] text-[#57534e]">{t('tagline')}</div>
          </div>
        </Link>
        <nav className="hidden md:flex gap-5 text-sm items-center">
          {/* ยังไม่เข้าระบบ — ทุกเมนูลิงก์ไป /admin */}
          <Link href={user ? "/" : "/admin"} className="text-[#57534e] hover:text-[#475569] hover:bg-[#FCFBF6] hover:shadow-sm rounded-full px-3 py-1.5 transition-colors">{t('nav_home')}</Link>
          <Link href={user ? "/verify" : "/admin"} className="text-[#57534e] hover:text-[#475569] hover:bg-[#FCFBF6] hover:shadow-sm rounded-full px-3 py-1.5 transition-colors">{t('nav_verify')}</Link>
          <Link href={user ? "/prospects" : "/admin"} className="text-[#57534e] hover:text-[#475569] hover:bg-[#FCFBF6] hover:shadow-sm rounded-full px-3 py-1.5 transition-colors">{t('nav_prospects')}</Link>
          <Link href={user ? "/income" : "/admin"} className="text-[#57534e] hover:text-[#475569] hover:bg-[#FCFBF6] hover:shadow-sm rounded-full px-3 py-1.5 transition-colors">{t('nav_income')}</Link>
          {/* N8N Submenu */}
          <div className="relative">
            <button onClick={() => setN8nOpen(!n8nOpen)} className="flex items-center gap-1.5 text-[#57534e] hover:text-[#475569] hover:bg-[#FCFBF6] hover:shadow-sm rounded-full px-3 py-1.5 transition-colors">
              <span className="text-base">⚡</span>
              <span className="text-sm font-medium">{t('nav_n8n')}</span>
              <svg className="w-3.5 h-3.5 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
            </button>
            {n8nOpen && (
              <div className="absolute right-0 mt-2 w-64 rounded-xl border border-[#e2e8f0] bg-white shadow-xl z-50 overflow-hidden">
                <div className="px-4 py-2.5 bg-[#f8fafc] border-b border-[#e2e8f0] text-xs font-semibold text-slate-500 uppercase tracking-wider">{t('nav_n8n')}</div>
                <div className="py-1">
                  <a href="http://localhost:5678/" target="_blank" rel="noopener noreferrer"
                     className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-[#eff6ff] hover:text-sky-700 transition-colors">
                    <span className="text-base">🖥️</span>
                    <span>{t('n8n_editor')}</span>
                    <span className="ml-auto text-[11px] text-slate-400">ใหม่หน้า</span>
                  </a>
                  <a href="/n8n" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-[#eff6ff] hover:text-sky-700 transition-colors">
                    <span className="text-base">🔗</span>
                    <span>{t('n8n_webhooks')}</span>
                    <span className="ml-auto text-[11px] text-slate-400">คัดลอก URL</span>
                  </a>
                  <a href="/n8n/workflows" className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-slate-700 hover:bg-[#eff6ff] hover:text-sky-700 transition-colors">
                    <span className="text-base">⚙️</span>
                    <span>{t('n8n_workflows')}</span>
                  </a>
                  <div className="my-1 border-t border-[#e2e8f0]"></div>
                  <div className="px-4 py-2 text-xs text-slate-400 bg-slate-50">
                    <span className="block">{t('n8n_status_running')}</span>
                    <span className="block mt-0.5 text-green-600 font-medium">● localhost:5678</span>
                  </div>
                </div>
              </div>
            )}
          </div>
          <Link href={user ? "/notifications" : "/admin"} className="relative text-[#57534e] hover:text-[#475569] hover:bg-[#FCFBF6] hover:shadow-sm rounded-full px-3 py-1.5 transition-colors">🔔 {t('nav_notif')} {unread!=null && unread>0 && <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-600 text-white text-[11px]">{unread}</span>}</Link>
        </nav>
        <div className="flex items-center gap-2">
          <LanguageMenu/>
          {user ? (
            <div className="relative">
              <button onClick={()=> setShowMenu(!showMenu)} className="px-3 py-2 rounded-full bg-[#eff6ff] border border-blue-200 text-xs font-semibold text-sky-800 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-sky-500 text-white flex items-center justify-center text-[11px]">{(user.email||'?')[0].toUpperCase()}</span>
                <span className="max-w-[120px] truncate hidden sm:inline">{user.email}</span>
              </button>
              {showMenu && (
                <div className="absolute right-0 mt-2 w-48 rounded-xl border bg-white shadow-lg p-2 text-sm z-50">
                  <div className="px-3 py-2 text-xs text-slate-500 border-b truncate">{user.email}</div>
                  <Link href="/settings" className="block px-3 py-2 rounded-lg hover:bg-slate-50">{t('settings')}</Link>
                  <button onClick={logout} className="w-full text-left px-3 py-2 rounded-lg hover:bg-red-50 text-red-600">{t('logout')}</button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link href="/login" className="px-4 py-2 rounded-full border border-blue-200 bg-white text-sky-700 text-sm font-semibold">{t('login')}</Link>
              <Link href="/register" className="px-4 py-2 rounded-full bg-[#c8a84e] text-[#475569] text-sm font-semibold">{t('register_interest')}</Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
