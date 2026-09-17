'use client';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';

// หลักเกณฑ์การสร้าง 1 แตก 5 อัตโนมัติ — รายละเอียดการเข้าระบบสมาชิก
export default function OneBreakFiveRulesPage(){
  const steps = [
    { icon:'📋', title:'1. สมัครสมาชิก (ได้รหัสก่อน)', body:'สมาชิกทั่วไป / ผู้สนใจ สมัครผ่านหน้า register หรือเข้าสู่ระบบด้วย Google/GitHub/TikTok → ระบบออกรหัสสมาชิก (M-XXXXXX) และรหัสแนะนำ (R-XXXXXX) ให้อัตโนมัติ' },
    { icon:'🧾', title:'2. สแกนใบเสร็จรับเงิน 20,000 บาท', body:'สแกน/อัปโหลดใบเสร็จรับเงินจริงยอด 20,000 บาท (สองหมื่นบาท) ตามค่าที่ตั้งไว้ในระบบ → ระบบตรวจ OCR + รับรองยอด แล้วบันทึกผลงานอัตโนมัติ' },
    { icon:'👑', title:'3. แต่งตั้ง "หัวหน้าหน่วย" อัตโนมัติ', body:'เมื่อยอดใบเสร็จ 20,000 บาทผ่านการรับรอง → ระบบเลื่อนระดับเป็น "หัวหน้าหน่วย" ให้ทันที และเข้าระบบผัง 1 แตก 5 อัตโนมัติ' },
    { icon:'🌐', title:'4. จัดวาง 1 แตก 5 ตามลำดับเวลา', body:'ใครสแกนใบเสร็จก่อน → ขึ้นตำแหน่งก่อน → เข้าผัง 1 แตก 5 ก่อน (first-come-first-served) ไล่ไปจนถึงตำแหน่งสูงสุด (ผู้จัดการภาค)' },
  ];
  const waitRules = [
    'สมาชิกทั่วไปที่มีรหัสแล้ว แต่ยังไม่มียอดขายตามใบเสร็จรับเงิน → ยังไม่เข้าระบบ 1 แตก 5',
    'ระดับตัวแทนที่มีรหัสแล้ว แต่ยังไม่มียอดตามใบเสร็จ → ยังไม่เข้าระบบ 1 แตก 5',
    'รอจนกว่าจะสแกนใบเสร็จรับเงิน 20,000 บาทเข้ามา ถึงจะขึ้นตำแหน่งและเข้าระบบได้',
  ];
  const removeRules = [
    'สมาชิกในสาย 1 แตก 5 ที่รักษายอดตัวแทนไม่ได้ → ระบบดีดออกอัตโนมัติ',
    'เบี้ยปีต่อไป (ต่ออายุ) ไม่มี → ระบบเตือนแล้วดีดออกตามรอบที่ตั้งไว้',
    'ไม่มีสแกนจ่าย (ไม่มียอดใบเสร็จใหม่) → ระบบดีดออกอัตโนมัติ',
    'ตำแหน่งที่ว่าง → ระบบเลื่อนผู้มีคุณสมบัติครบชั้นล่างขึ้นแทนอัตโนมัติ',
  ];

  return (
    <div>
      <Header/>
      <div className="flex w-full">
        <Sidebar/>
        <main className="flex-1 p-6 space-y-5 w-full min-w-0">
          <div>
            <h1 className="text-xl font-bold text-navy">หลักเกณฑ์การสร้าง 1 แตก 5 อัตโนมัติ</h1>
            <p className="text-xs text-slate-500 mt-1">รายละเอียดการเข้าระบบสมาชิก — ระบบทำงานอัตโนมัติทั้งหมดตามหลักเกณฑ์นี้</p>
          </div>

          {/* ขั้นตอนการเข้า */}
          <div className="card p-5">
            <h3 className="font-semibold text-sm">ขั้นตอนการเข้าระบบ (อัตโนมัติ)</h3>
            <div className="mt-4 space-y-3">
              {steps.map((s,i)=>(
                <div key={i} className="flex gap-3 p-3 rounded-xl border bg-slate-50/60">
                  <div className="text-2xl shrink-0">{s.icon}</div>
                  <div>
                    <div className="text-sm font-semibold">{s.title}</div>
                    <div className="text-xs text-slate-600 mt-0.5">{s.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* เงื่อนไขการขึ้นตำแหน่ง */}
          <div className="card p-5">
            <h3 className="font-semibold text-sm">เงื่อนไขการขึ้นตำแหน่งหัวหน้าหน่วยอัตโนมัติ</h3>
            <div className="mt-3 p-4 rounded-xl bg-[#eff6ff] border border-[#dbeafe] text-sm">
              สแกนใบเสร็จรับเงิน <b>20,000 บาท (สองหมื่นบาท)</b> ตามหลักเกณฑ์และค่าที่ตั้งเซตไว้
              → ระบบ<b>แต่งตั้งเป็น "หัวหน้าหน่วย" อัตโนมัติ</b> และเข้าระบบ 1 แตก 5 ทันที
            </div>
            <div className="mt-2 text-xs text-slate-500">ใครสแกนใบเสร็จก่อน → ขึ้นตำแหน่งก่อน → เข้าผัง 1 แตก 5 ก่อน ไล่ไปตามลำดับเวลาที่สแกน จนถึงตำแหน่งสูงสุด</div>
          </div>

          {/* ผู้ที่ต้องรอ */}
          <div className="card p-5">
            <h3 className="font-semibold text-sm">ผู้ที่ยังไม่เข้าระบบ (รอการสแกนใบเสร็จ)</h3>
            <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
              {waitRules.map((r,i)=>(
                <li key={i} className="flex gap-2"><span className="text-amber-500">●</span>{r}</li>
              ))}
            </ul>
          </div>

          {/* การดีดออก */}
          <div className="card p-5">
            <h3 className="font-semibold text-sm">การดีดออกอัตโนมัติ (สาย 1 แตก 5)</h3>
            <ul className="mt-3 space-y-1.5 text-xs text-slate-600">
              {removeRules.map((r,i)=>(
                <li key={i} className="flex gap-2"><span className="text-rose-500">●</span>{r}</li>
              ))}
            </ul>
            <div className="mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
              หลักประกันความถูกต้อง: ตำแหน่งว่างไม่นับเป็นสมาชิก/ผลงาน/รายได้ • ทุกการจัดวางและการดีดออกบันทึก Audit Log • ระบบอ่านระดับตำแหน่งปัจจุบันจากฐานข้อมูลจริง (ไม่ใช้ค่า token ค้าง)
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
