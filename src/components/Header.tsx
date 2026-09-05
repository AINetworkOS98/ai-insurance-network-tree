'use client';
import Link from 'next/link';
export default function Header(){
  return (
    <header className="bg-[#0f2040] text-white sticky top-0 z-40">
      <div className="max-w-[1280px] mx-auto px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#c8a84e] flex items-center justify-center text-[#0f2040] font-bold">AI</div>
          <div>
            <div className="font-bold leading-none text-sm">AI Insurance Network Tree</div>
            <div className="text-[11px] opacity-70">ระบบบริหารเครือข่ายตัวแทน • ต้นไม้ฐาน 5 คน</div>
          </div>
        </Link>
        <nav className="hidden md:flex gap-5 text-sm">
          <Link href="/" className="opacity-80 hover:opacity-100">หน้าแรก</Link>
          <Link href="/#career" className="opacity-80 hover:opacity-100">เส้นทางความก้าวหน้า</Link>
          <Link href="/prospects" className="opacity-80 hover:opacity-100">ผู้สนใจ</Link>
          <Link href="/tree" className="opacity-80 hover:opacity-100">ผังเครือข่าย</Link>
          <Link href="/income" className="opacity-80 hover:opacity-100">รายได้</Link>
          <Link href="/admin" className="opacity-80 hover:opacity-100">ผู้ดูแล</Link>
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className="px-4 py-2 rounded-full bg-white text-[#0f2040] text-sm font-semibold">เข้าสู่ระบบ</Link>
          <Link href="/register" className="px-4 py-2 rounded-full bg-[#c8a84e] text-[#0f2040] text-sm font-semibold">สมัครแสดงความสนใจ</Link>
        </div>
      </div>
    </header>
  );
}
