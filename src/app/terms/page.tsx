import Link from 'next/link';
export const metadata = { title: 'ข้อกำหนดการใช้งาน — AI Insurance Network Tree' };
export default function Terms(){
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[760px] mx-auto px-4 md:px-6 py-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-sky-600 hover:underline mb-6">← กลับหน้าแรก</Link>
        <h1 className="text-2xl font-bold text-slate-800">ข้อกำหนดการใช้งาน</h1>
        <p className="text-sm text-slate-500 mt-1">มีผลตั้งแต่: 12 กันยายน 2026</p>
        <div className="mt-6 space-y-4">
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800">1. การใช้งานที่ยอมรับ</h2>
            <p className="text-sm text-slate-600 mt-2 leading-6">ใช้เพื่อบริหารเครือข่ายตัวแทนตามกฎหมาย ห้ามอัปโหลดข้อมูลเท็จ ใบเสร็จปลอม หรือละเมิดสิทธิ์ผู้อื่น</p>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800">2. ความถูกต้องของข้อมูล</h2>
            <p className="text-sm text-slate-600 mt-2 leading-6">ยอดผลงาน/รายได้คำนวณตามกฎที่ตั้งค่าในระบบ กรณีข้อพิพาทให้ยึดบันทึกและเอกสารที่ตรวจสอบแล้วเป็นหลัก</p>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800">3. บัญชีและความปลอดภัย</h2>
            <p className="text-sm text-slate-600 mt-2 leading-6">รักษารหัสผ่านเป็นความลับ แจ้งทันทีหากพบการเข้าถึงโดยไม่ได้รับอนุญาต ระบบอาจระงับบัญชีที่ฝ่าฝืนข้อกำหนด</p>
          </div>
        </div>
      </div>
    </div>
  );
}
