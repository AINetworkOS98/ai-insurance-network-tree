import AIIntelligentSearch from '@/components/AIIntelligentSearch';
import Link from 'next/link';

// หน้าแรก — AI อัจฉริยะ
export default function Home(){
  const hero = (
    <div className="text-center pt-6 pb-2">
      <h1 className="text-2xl md:text-3xl font-bold text-[#475569] tracking-tight">AI Network</h1>
      <div className="mt-2 flex items-center justify-center gap-2 text-[11px]">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-sky-50 to-violet-50 border border-blue-100 text-sky-700">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" /> AI อัจฉริยะ • ระบบปฏิบัติการอัจฉริยะ
        </span>
        <span className="hidden sm:inline-flex px-2 py-1 rounded-full bg-white border border-slate-200 text-slate-500">ขนาน • จำได้ • ตรวจสอบได้</span>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-screen bg-[#fcfdff] overflow-hidden">
      {/* Top bar */}
      <div className="h-[56px] shrink-0 border-b border-blue-100 bg-white/80 backdrop-blur flex items-center justify-between px-4 md:px-6 z-10">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="AI Insurance" className="h-8 w-auto bg-white rounded-lg border border-[#f3e8d3] object-contain p-0.5 hidden md:block"/>
          <div className="text-sm font-bold text-slate-800">AI Insurance Network Tree</div>
          <span className="hidden md:inline text-xs text-slate-500">ระบบบริหารเครือข่ายตัวแทน</span>
          <span className="hidden lg:inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-[#eff6ff] border border-blue-100 text-sky-700">⚡ AI อัจฉริยะ</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="hidden md:inline text-[11px] px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700">● พร้อมใช้งาน</span>
          <Link href="/login" className="px-4 py-2 rounded-full border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50">เข้าสู่ระบบ</Link>
          <Link href="/login" className="px-4 py-2 rounded-full bg-[#475569] text-white text-xs font-semibold hover:bg-slate-800">สร้างบัญชีสมาชิก</Link>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col w-full px-4 md:px-6 overflow-hidden">
        <AIIntelligentSearch variant="chat" topContent={hero} />
      </div>

      <footer className="shrink-0 py-2.5 text-center text-[11px] text-slate-400 border-t border-blue-50 bg-white/60">
        <span className="hidden sm:inline">AI อัจฉริยะ • ขนาน • จำได้ • ตรวจสอบได้ • </span>
        <Link href="/privacy" className="hover:underline">นโยบายความเป็นส่วนตัว</Link> • <Link href="/terms" className="hover:underline">ข้อกำหนด</Link> • © 2026 AI Insurance Network Tree
      </footer>
    </div>
  );
}
