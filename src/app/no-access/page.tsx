// หน้าแจ้งสิทธิ์ — middleware rewrite มาที่นี่เมื่อผู้ใช้ล็อกอินแล้วแต่ไม่มีสิทธิ์เข้าหน้าสงวนสิทธิ์
// (กติกาอยู่ที่ lib/access-rules.ts → ADMIN_ONLY_PAGE_PREFIXES)
export default function NoAccessPage(){
  return (
    <div className="min-h-screen bg-soft-white flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl border border-[#f3e8d3] shadow-sm p-8 text-center">
        <div className="text-4xl mb-3">🔒</div>
        <h1 className="text-lg font-bold text-navy mb-2">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</h1>
        <p className="text-sm text-slate-500 mb-1">หน้า N8N Automation สงวนสิทธิ์ให้เฉพาะ</p>
        <p className="text-sm font-medium text-slate-700 mb-6">Admin หรือสมาชิกอีเมล akarapol.pro798@gmail.com</p>
        <div className="flex flex-wrap gap-3 justify-center">
          <a href="/" className="px-4 py-2 rounded-full bg-[#c8a84e] text-[#475569] text-sm font-semibold">กลับหน้าแรก</a>
          <a href="/contact" className="px-4 py-2 rounded-full border border-blue-200 bg-white text-sky-700 text-sm font-semibold">ติดต่อผู้ดูแลระบบ</a>
        </div>
      </div>
    </div>
  );
}
