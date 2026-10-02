import Link from 'next/link';
export const metadata = { title: 'นโยบายความเป็นส่วนตัว (Privacy Policy) — AI Insurance Network Tree' };
export default function PrivacyPolicy(){
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[760px] mx-auto px-4 md:px-6 py-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-sky-600 hover:underline mb-6">← กลับหน้าแรก</Link>
        <h1 className="text-2xl font-bold text-slate-800">นโยบายความเป็นส่วนตัว (Privacy Policy)</h1>
        <p className="text-sm text-slate-500 mt-1">ปรับปรุงล่าสุด: 23 กันยายน 2026</p>
        <div className="mt-6 space-y-4">
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800">1. ข้อมูลที่เราเก็บรวบรวม</h2>
            <p className="text-sm text-slate-600 mt-2 leading-6">ชื่อ-นามสกุล อีเมล เบอร์โทรศัพท์ LINE ID วัน/เดือน/ปีเกิด อาชีพ จังหวัด และข้อมูลผลงาน/รายได้ที่เกี่ยวข้องกับการบริหารเครือข่ายทีมตัวแทนประกันชีวิต</p>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800">2. วัตถุประสงค์การใช้งาน</h2>
            <p className="text-sm text-slate-600 mt-2 leading-6">ใช้สำหรับการสมัครสมาชิก การให้บริการ การติดต่อ แสดงผังเครือข่าย คำนวณผลงาน/ค่าคอมมิชชัน ประเมินเลื่อนตำแหน่ง และการดำเนินการที่เกี่ยวข้องตามวัตถุประสงค์ที่แจ้งไว้</p>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800">3. การรักษาความปลอดภัย</h2>
            <p className="text-sm text-slate-600 mt-2 leading-6">ข้อมูลจะได้รับการดูแลตามมาตรการรักษาความปลอดภัยที่เหมาะสม ไม่ขายหรือเปิดเผยข้อมูลให้บุคคลที่สามโดยไม่ได้รับความยินยอม</p>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800">4. การเก็บและลบข้อมูล</h2>
            <p className="text-sm text-slate-600 mt-2 leading-6">เก็บเท่าที่จำเป็นตามกฎหมายและสัญญา คุณสามารถขอลบ/แก้ไขข้อมูลได้ที่ <Link href="/settings" className="text-sky-600 underline">ตั้งค่า</Link> หรือติดต่อผู้ดูแลระบบ</p>
          </div>
        </div>
      </div>
    </div>
  );
}
