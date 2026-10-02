import Link from 'next/link';
export const metadata = { title: 'รายละเอียดการประมวลผลข้อมูลส่วนบุคคล — AI Insurance Network Tree' };
export default function PrivacyDetails(){
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-[760px] mx-auto px-4 md:px-6 py-8">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-sky-600 hover:underline mb-6">← กลับหน้าแรก</Link>
        <h1 className="text-2xl font-bold text-slate-800">รายละเอียดการประมวลผลข้อมูลส่วนบุคคล</h1>
        <p className="text-sm text-slate-500 mt-1">ปรับปรุงล่าสุด: 23 กันยายน 2026</p>
        <div className="mt-6 space-y-4">
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800">1. ประเภทข้อมูลที่ประมวลผล</h2>
            <p className="text-sm text-slate-600 mt-2 leading-6">ข้อมูลระบุตัวตน (ชื่อ นามสกุล วันเกิด) ข้อมูลติดต่อ (อีเมล เบอร์โทร LINE ID) ข้อมูลประชากร (อาชีพ จังหวัด) และข้อมูลธุรกรรม (ผลงาน รายได้ ค่าคอมมิชชัน)</p>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800">2. ฐานทางกฎหมายในการประมวลผล</h2>
            <p className="text-sm text-slate-600 mt-2 leading-6">การประมวลผลอยู่บนฐานของความยินยอม (Consent) ที่ท่านให้ไว้ขณะสมัครสมาชิก และฐานความจำเป็นตามสัญญาในการให้บริการ</p>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800">3. สิทธิของเจ้าของข้อมูล</h2>
            <p className="text-sm text-slate-600 mt-2 leading-6">ท่านมีสิทธิเข้าถึง ขอสำเนา แก้ไข ลบ ระงับการใช้ โอนย้ายข้อมูล และถอนความยินยอมได้ตลอดเวลา โดยติดต่อผู้ดูแลระบบ</p>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800">4. ผู้ที่เกี่ยวข้องในการประมวลผล</h2>
            <p className="text-sm text-slate-600 mt-2 leading-6">ข้อมูลจะถูกประมวลผลโดยระบบและผู้ดูแลระบบเท่านั้น ไม่มีการเปิดเผยให้บุคคลที่สาม เว้นแต่ได้รับความยินยอมหรือเป็นไปตามกฎหมาย</p>
          </div>
          <div className="card p-5">
            <h2 className="font-semibold text-slate-800">5. ระยะเวลาการเก็บ</h2>
            <p className="text-sm text-slate-600 mt-2 leading-6">เก็บตราบเท่าที่จำเป็นต่อการให้บริการและตามระยะเวลาที่กฎหมายกำหนด เมื่อพ้นกำหนดหรือเมื่อท่านถอนความยินยอม จะลบหรือทำให้ไม่สามารถระบุตัวตนได้</p>
          </div>
        </div>
      </div>
    </div>
  );
}
