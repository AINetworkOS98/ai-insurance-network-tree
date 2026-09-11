import Header from '@/components/Header';
import Link from 'next/link';
import { RANK_CATALOG } from '@/lib/rankCatalog';
// หน้าแรกสำหรับทุกระดับ — สมาชิกทั่วไป (rank 0) เห็นเฉพาะหน้านี้ ไม่โหลดข้อมูลหลังบ้าน (สเปคหมวด 2, 11)
export default function Home(){
  return (
    <div>
      <Header/>
      <section className="bg-white text-slate-800 relative overflow-hidden border-b border-blue-100">
        {/* เฟรมพื้นหลังสโลแกน — ฟ้าอ่อนนวล */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-4 md:inset-8 rounded-[28px] border border-blue-100 bg-[#f0f7ff]/60"></div>
          <div className="absolute inset-6 md:inset-10 rounded-[22px] border border-sky-100/70"></div>
        </div>
        <div className="max-w-[1280px] mx-auto px-6 py-12 grid md:grid-cols-2 gap-8 items-center relative">
          <div className="relative">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#eff6ff] border border-blue-200 text-xs text-sky-700">✦ ระบบโปร่งใส ตรวจสอบได้ • ปฏิบัติตาม PDPA</div>
            <div className="mt-4 p-5 md:p-6 rounded-2xl border border-blue-100 bg-[#f0f7ff] shadow-[0_8px_30px_rgba(59,130,246,.08)]">
              <h1 className="text-3xl md:text-4xl font-bold leading-tight">สร้างทีม สร้างอนาคต<br/>ด้วยระบบ <span className="text-sky-500">AI INSURANCE NETWORK OS</span></h1>
              <p className="text-sm text-slate-600 mt-3 leading-relaxed">บริหารผู้สนใจ ผู้สมัคร สมาชิก โครงสร้างทีมฐานกว้าง 5 คน ผลงาน รายได้ และเอกสารทางการเงินอย่างโปร่งใส ปลอดภัย ตรวจสอบย้อนหลังได้</p>
            </div>
            <div className="flex gap-3 mt-6">
              <Link href="/register" className="px-6 py-3 rounded-full bg-sky-400 text-white font-semibold shadow-sm hover:bg-sky-500">สมัครแสดงความสนใจ</Link>
              <Link href="/tree" className="px-6 py-3 rounded-full border border-blue-200 bg-[#eff6ff] text-sky-700">ดูผังตัวอย่าง</Link>
            </div>
            <div className="mt-4 p-3 rounded-xl bg-[#eff6ff] border border-blue-100 text-xs leading-relaxed">
              <div className="font-semibold text-sky-800">สำหรับผู้สนใจทั่วไป:</div>
              <div className="text-slate-600 mt-1">สมัครตัวแทน • แก้ข้อมูลบัญชีพื้นฐาน • ดูสถานะคำขอ • อ่านการแจ้งเตือนของตน — ไม่แสดงเมนูหลังบ้านจนกว่าจะเป็นตัวแทน</div>
            </div>
            <div className="flex gap-6 mt-4 text-xs text-slate-500">
              <span>✓ ไม่นับ Prospect ในต้นไม้</span><span>✓ รายได้อ้างอิงผลงานจริง</span><span>✓ Audit Log ครบ</span>
            </div>
          </div>
          <div className="rounded-2xl bg-[#f0f7ff] border border-blue-100 text-slate-800 p-5 shadow-[0_4px_20px_rgba(59,130,246,.06)]">
            <div className="text-sm font-bold">เส้นทางตำแหน่ง — 5 ขั้นตามสเปค (ไม่เกินผู้จัดการภาค)</div>
            <div className="mt-3 space-y-2 text-sm">
              {RANK_CATALOG.map((r)=>(
                <div key={r.code} className="flex items-center gap-3 p-2.5 rounded-xl border border-blue-100 bg-[#eff6ff]">
                  <div className="w-8 h-8 rounded-full bg-sky-400 text-white flex items-center justify-center text-xs">{r.level}</div>
                  <div>
                    <div className="font-semibold">{r.nameTh}</div>
                    <div className="text-[11px] text-slate-500">อ้างอิง: {r.nameRef}</div>
                  </div>
                  <span className="ml-auto text-xs text-slate-500">{r.level===0?'เริ่มทุกคน':'เลื่อนตามผลงานจริง'}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-3">สเปค: ผัง 1 แตก 5 ใช้จัดวางเท่านั้น แยกจากผังผู้แนะนำ/บังคับบัญชา — ครบ 5 คนไม่ได้เลื่อนตำแหน่งอัตโนมัติ</p>
          </div>
        </div>
      </section>

      <section id="career" className="max-w-[1280px] mx-auto px-6 py-10 grid md:grid-cols-3 gap-6 bg-white">
        {[
          {t:'ระบบพัฒนาทีม', d:'ต้นไม้ฐานกว้าง 5 คน BFS ซับซ้อนแต่โปร่งใส วางตำแหน่งยุติธรรม'},
          {t:'ศูนย์เรียนรู้', d:'วิดีโอ บทเรียนสาธารณะ และแบบประเมินก่อนสมัคร'},
          {t:'รายได้โปร่งใส', d:'Estimated / Approved / Paid แยกสีชัดเจน ไม่การันตีรายได้'},
        ].map(c=>(
          <div key={c.t} className="rounded-2xl p-6 border border-blue-100 bg-[#f0f7ff] shadow-[0_2px_12px_rgba(59,130,246,.06)]">
            <div className="font-bold text-slate-800">{c.t}</div>
            <div className="text-sm text-slate-600 mt-1">{c.d}</div>
          </div>
        ))}
      </section>

      <section className="max-w-[1280px] mx-auto px-6 pb-10 bg-white">
        <div className="rounded-2xl p-6 border border-blue-100 bg-[#f0f7ff] shadow-[0_2px_12px_rgba(59,130,246,.06)]">
          <h3 className="font-bold text-slate-800">พันธมิตร</h3>
          <p className="text-xs text-slate-600 mt-1">หากต้องการระบุ “บริษัท ไทยประกันชีวิต จำกัด (มหาชน)” ต้องมีเอกสารอนุญาตก่อนแสดงว่าเป็น Partner อย่างเป็นทางการ มิฉะนั้นแสดง “พันธมิตรที่อยู่ระหว่างการตรวจสอบ” ห้ามใช้โลโก้โดยไม่ได้รับอนุญาต</p>
          <div className="mt-3 flex gap-3">
            <div className="px-4 py-3 rounded-xl border border-blue-100 bg-[#eff6ff] text-sm">พันธมิตรที่อยู่ระหว่างการตรวจสอบ <span className="badge-demo ml-2">ข้อมูลทดลอง</span></div>
            <div className="px-4 py-3 rounded-xl border border-blue-100 bg-white text-sm">Brand Guideline ต้องได้รับอนุมัติ</div>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-[#eff6ff] border border-blue-100 p-4 text-xs text-sky-900">
          รายได้และผลประโยชน์ขึ้นอยู่กับผลงานจริง คุณสมบัติ เงื่อนไข การอนุมัติ และหลักเกณฑ์ที่ใช้ในแต่ละช่วงเวลา ตัวเลขประมาณการไม่ใช่การรับประกันรายได้ กรุณาตรวจสอบกับหน่วยงานหรือบริษัทที่เกี่ยวข้องก่อนนำไปใช้อ้างอิง
        </div>
      </section>

      <footer className="border-t border-gray-200 bg-white">
        <div className="max-w-[1280px] mx-auto px-6 py-6 text-xs text-slate-500 flex flex-wrap gap-4">
          <Link href="/privacy">นโยบายความเป็นส่วนตัว</Link><Link href="/terms">ข้อกำหนดการใช้งาน</Link><Link href="/faq">FAQ</Link><span className="ml-auto">© 2026 AI Insurance Network Tree</span>
        </div>
      </footer>
    </div>
  );
}
