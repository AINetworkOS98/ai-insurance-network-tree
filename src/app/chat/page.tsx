import Sidebar from '@/components/Sidebar';
import AIIntelligentSearch from '@/components/AIIntelligentSearch';

// หน้าแชตเต็มจอ — ช่องคุยบน + ช่องค้นหาล่าง
export default function ChatPage(){
  return (
    <div className="flex h-screen bg-white overflow-hidden">
      <Sidebar/>
      <div className="flex-1 flex flex-col min-w-0">
        <div className="h-[56px] border-b border-blue-100 bg-white flex items-center px-4 md:px-6 shrink-0">
          <div>
            <div className="text-sm font-bold text-slate-800">คุยกับ AI</div>
            <div className="text-[11px] text-slate-400">ระบบค้นหาด้วย AI อัจฉริยะ — พิมพ์ วางข้อมูล แนบไฟล์ แล้วให้ AI ช่วยทำงาน</div>
          </div>
          <div className="ml-auto text-[11px] text-slate-400 hidden md:block">กด <kbd className="px-1 py-0.5 bg-slate-100 border rounded text-[10px]">Ctrl</kbd>+<kbd className="px-1 py-0.5 bg-slate-100 border rounded text-[10px]">B</kbd> หด/ขยายเมนู</div>
        </div>
        <div className="flex-1 overflow-hidden bg-[#fcfdff] flex flex-col">
          <div className="flex-1 overflow-auto px-4 md:px-6 py-6">
            <AIIntelligentSearch variant="chat"/>
          </div>
        </div>
      </div>
    </div>
  );
}
