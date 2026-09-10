import Header from '@/components/Header';
import Link from 'next/link';
export default function Home(){
  const OS_BASE = 'https://ai-insurance-network-os.vercel.app';
  const OLD_OS = 'https://ai-insurance-network-3cp54o23p-ak-e11e.vercel.app';
  return (
    <div>
      <Header/>
      {/* Cross-system banner */}
      <div className="bg-[#0f2040] border-y border-white/10">
        <div className="max-w-[1280px] mx-auto px-6 py-2 flex flex-wrap gap-2 text-[11px] items-center">
          <span className="text-white/60">เชื่อมฐานเดียวกัน (akarapol798)</span>
          <span className="text-white/30">•</span>
          <a href={`${OS_BASE}/?tab=search_landing`} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-full bg-white text-[#0f2040] font-bold hover:bg-white/90">🔍 ค้นหา/ตรวจสมาชิก</a>
          <a href={`${OS_BASE}/?tab=members_mgmt`} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-full bg-white/10 text-white border border-white/20 hover:bg-white/20">👥 จัดการสมาชิก</a>
          <a href={`${OS_BASE}/?tab=recruit_agent`} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-full bg-white/10 text-white border border-white/20 hover:bg-white/20">📝 สมัครตัวแทน</a>
          <a href={`${OS_BASE}/?tab=ai_studio`} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-full bg-white/10 text-white border border-white/20 hover:bg-white/20">✦ AI Studio</a>
          <a href={`${OS_BASE}/?tab=career_plan`} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-full bg-white/10 text-white border border-white/20 hover:bg-white/20">🚀 แผนอาชีพ</a>
          <a href={OLD_OS} target="_blank" rel="noreferrer" className="px-2.5 py-1 rounded-full border border-white/20 text-white/70 hover:bg-white/10">↩ ระบบเก่า</a>
        </div>
      </div>
      <section className="bg-navy text-white">
        <div className="max-w-[1280px] mx-auto px-6 py-12 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-xs">✦ ระบบโปร่งใส ตรวจสอบได้ • ปฏิบัติตาม PDPA</div>
            <h1 className="text-3xl md:text-4xl font-bold leading-tight mt-4">สร้างทีม สร้างอนาคต<br/>ด้วยระบบ <span className="text-[#c8a84e]">AI Insurance Network Tree</span></h1>
            <p className="text-sm opacity-80 mt-3 leading-relaxed">บริหารผู้สนใจ ผู้สมัคร สมาชิก โครงสร้างทีมฐานกว้าง 5 คน ผลงาน รายได้ และเอกสารทางการเงินอย่างโปร่งใส ปลอดภัย ตรวจสอบย้อนหลังได้</p>
            <div className="flex gap-3 mt-6">
              <Link href="/register" className="px-6 py-3 rounded-full bg-[#c8a84e] text-[#0f2040] font-semibold">สมัครแสดงความสนใจ</Link>
              <Link href="/tree" className="px-6 py-3 rounded-full border border-white/30">ดูผังตัวอย่าง</Link>
            </div>
            <div className="flex gap-6 mt-6 text-xs opacity-70">
              <span>✓ ไม่นับ Prospect ในต้นไม้</span><span>✓ รายได้อ้างอิงผลงานจริง</span><span>✓ Audit Log ครบ</span>
            </div>
          </div>
          <div className="rounded-2xl bg-white text-slate-800 p-5">
            <div className="text-sm font-bold">เส้นทางความก้าวหน้า</div>
            <div className="mt-3 space-y-2 text-sm">
              {['ตัวแทน','ผู้บริหารหน่วย','ผู้บริหารศูนย์','ผู้บริหารภาค','ผู้จัดการฝ่าย','ผู้อำนวยการ'].map((t,i)=>(
                <div key={t} className="flex items-center gap-3 p-2.5 rounded-xl border bg-slate-50">
                  <div className="w-8 h-8 rounded-full bg-navy text-white flex items-center justify-center text-xs">{i+1}</div>
                  <div className="font-semibold">{t}</div>
                  <span className="ml-auto text-xs text-slate-500">เงื่อนไขปรับได้โดย Admin</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-3">การเลื่อนตำแหน่งต้องผ่านผู้มีอำนาจอนุมัติ • แสดง Progress Bar และสิ่งที่ยังขาด</p>
          </div>
        </div>
      </section>

      <section id="career" className="max-w-[1280px] mx-auto px-6 py-10 grid md:grid-cols-3 gap-6">
        {[
          {t:'ระบบพัฒนาทีม', d:'ต้นไม้ฐานกว้าง 5 คน BFS ซับซ้อนแต่โปร่งใส วางตำแหน่งยุติธรรม'},
          {t:'ศูนย์เรียนรู้', d:'วิดีโอ บทเรียนสาธารณะ และแบบประเมินก่อนสมัคร'},
          {t:'รายได้โปร่งใส', d:'Estimated / Approved / Paid แยกสีชัดเจน ไม่การันตีรายได้'},
        ].map(c=>(
          <div key={c.t} className="card p-6">
            <div className="font-bold text-[#0f2040]">{c.t}</div>
            <div className="text-sm text-slate-600 mt-1">{c.d}</div>
          </div>
        ))}
      </section>

      <section className="max-w-[1280px] mx-auto px-6 pb-10">
        <div className="card p-6">
          <h3 className="font-bold text-[#0f2040]">พันธมิตร</h3>
          <p className="text-xs text-slate-600 mt-1">หากต้องการระบุ “บริษัท ไทยประกันชีวิต จำกัด (มหาชน)” ต้องมีเอกสารอนุญาตก่อนแสดงว่าเป็น Partner อย่างเป็นทางการ มิฉะนั้นแสดง “พันธมิตรที่อยู่ระหว่างการตรวจสอบ” ห้ามใช้โลโก้โดยไม่ได้รับอนุญาต</p>
          <div className="mt-3 flex gap-3">
            <div className="px-4 py-3 rounded-xl border bg-amber-50 text-sm">พันธมิตรที่อยู่ระหว่างการตรวจสอบ <span className="badge-demo ml-2">ข้อมูลทดลอง</span></div>
            <div className="px-4 py-3 rounded-xl border bg-slate-50 text-sm">Brand Guideline ต้องได้รับอนุมัติ</div>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-4 text-xs text-amber-900">
          รายได้และผลประโยชน์ขึ้นอยู่กับผลงานจริง คุณสมบัติ เงื่อนไข การอนุมัติ และหลักเกณฑ์ที่ใช้ในแต่ละช่วงเวลา ตัวเลขประมาณการไม่ใช่การรับประกันรายได้ กรุณาตรวจสอบกับหน่วยงานหรือบริษัทที่เกี่ยวข้องก่อนนำไปใช้อ้างอิง
        </div>
      </section>

      <footer className="border-t bg-white">
        <div className="max-w-[1280px] mx-auto px-6 py-6 text-xs text-slate-500 flex flex-wrap gap-4">
          <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link><Link href="/terms">ข้อกำหนดการใช้งาน</Link><Link href="/faq">FAQ</Link><span className="ml-auto">© 2026 AI Insurance Network Tree</span>
        </div>
      </footer>
    </div>
  );
}
