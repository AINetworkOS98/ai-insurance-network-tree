import Link from 'next/link';
export const metadata = { title: 'นโยบายความเป็นส่วนตัว — AI Insurance Network Tree' };
export default function Privacy(){
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[760px] mx-auto px-4 md:px-6 py-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-sky-600 hover:underline mb-6">← กลับหน้าแรก</Link>
        <h1 className="text-2xl font-bold text-slate-800">นโยบายความเป็นส่วนตัว</h1>
        <p className="text-sm text-slate-500 mt-1">ปรับปรุงล่าสุด: 12 กันยายน 2026</p>
        <div className="mt-6 space-y-4">
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800">1. ข้อมูลที่เราเก็บ</h2>
            <p className="text-sm text-slate-600 mt-2 leading-6">ชื่อ อีเมล เบอร์โทร รหัสสมาชิก ข้อมูลผลงาน/รายได้ และไฟล์ใบเสร็จที่คุณอัปโหลด — ใช้เพื่อบริหารเครือข่าย 1 แตก 5 คำนวณผลงาน และออกเอกสารทางการเงิน</p>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800">2. วิธีใช้ข้อมูล</h2>
            <p className="text-sm text-slate-600 mt-2 leading-6">แสดงผังเครือข่าย คำนวณยอด ประเมินเลื่อนตำแหน่ง และแจ้งเตือนตามรอบปิดยอด — ไม่ขายข้อมูลให้บุคคลที่สาม</p>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800">3. การเก็บและลบ</h2>
            <p className="text-sm text-slate-600 mt-2 leading-6">เก็บเท่าที่จำเป็นตามกฎหมายและสัญญา คุณสามารถขอลบ/แก้ไขได้ที่ <Link href="/settings" className="text-sky-600 underline">ตั้งค่า</Link> หรือติดต่อผู้ดูแลระบบ</p>
          </div>
        </div>
      </div>
    </div>
  );
}
