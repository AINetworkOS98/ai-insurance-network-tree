import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import BusinessModelBoard from '@/components/BusinessModelBoard';
import Link from 'next/link';
import { minProgressRankName, rankNameSafe, MIN_PROGRESS_RANK } from '@/lib/progressAccess';

/**
 * ProgressLocked — หน้าแจ้งสิทธิ์ของ /progress (เรนเดอร์ฝั่งเซิร์ฟเวอร์)
 * ต้องไม่แสดงเนื้อหาจริงของหน้าเลย แม้แต่บางส่วน
 */
export default function ProgressLocked({ rankLevel }: { rankLevel: number }) {
  const current = rankNameSafe(rankLevel);
  return (
    <div>
      <Header />
      <div className="flex w-full">
        <Sidebar />
        <main className="min-w-0 flex-1 p-6 space-y-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-[#475569]">ความก้าวหน้า ⬆</h1>
            <span className="badge-demo">เฉพาะระดับบริหาร</span>
          </div>

          <div className="card p-6 border-l-4 border-l-[#c8a84e]">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0b1b33] text-lg">🔒</span>
              <div className="min-w-0">
                <div className="text-base font-bold text-[#0b1b33]">หน้านี้เปิดให้ดูตั้งแต่ระดับ “{minProgressRankName()}” ขึ้นไป</div>
                <div className="mt-0.5 text-xs text-slate-500">ระดับปัจจุบันของคุณ: <span className="font-semibold text-[#475569]">{current}</span> (level {rankLevel})</div>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="text-xs font-semibold text-[#475569]">ในหน้านี้มีอะไร (สำหรับระดับบริหาร)</div>
              <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
                {[
                  'โมเดลธุรกิจ 2 เครื่องยนต์ (ขาย = Active / สร้างทีม = Team)',
                  'Income Model + Funnel ขาย 10 ขั้น',
                  'Funnel สร้างทีม 9 ขั้น (Content → สร้างผู้บริหารรุ่นต่อไป)',
                  'KPI 4 ระดับ (Daily / Weekly / Monthly / Leadership)',
                  'Roadmap 24 เดือน 5 ช่วง',
                  'Dashboard ผู้บริหาร 11 ตัวชี้วัด',
                  'แผนปฏิบัติการ 90 วัน',
                  'ตารางทำงานรายวัน + AI/Automation',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-2 text-[11px] text-slate-600">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8a84e]" />
                    {t}
                  </li>
                ))}
              </ul>
            </div>

            <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-xs font-semibold text-amber-900">เกณฑ์ขึ้นระดับ “{minProgressRankName()}” — ข้อมูลจากเอกสาร</div>
              <div className="mt-1 text-[11px] leading-relaxed text-amber-900/90">
                อายุงาน 3–6 เดือน · ค่าคอมมิชชั่น 75,000 บาทขึ้นไป · สร้าง 3 หน่วย
              </div>
              <div className="mt-1 text-[10px] text-amber-900/70">※ เป็นเงื่อนไขประกอบการพิจารณาตามเอกสาร ไม่ใช่การรับประกันรายได้หรือการเลื่อนตำแหน่ง</div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Link href="/career" className="rounded-xl bg-[#0b1b33] px-4 py-2 text-xs font-semibold text-white hover:opacity-90">ดูเส้นทางตำแหน่ง ▲</Link>
              <Link href="/" className="rounded-xl border border-slate-300 px-4 py-2 text-xs font-semibold text-[#475569] hover:bg-slate-50">กลับหน้าแรก</Link>
            </div>

            <p className="mt-4 text-[11px] text-slate-500">
              หากคุณเพิ่งได้รับการเลื่อนตำแหน่งเป็น “{minProgressRankName()}” แล้วแต่ยังเห็นหน้านี้ ให้ออกจากระบบและเข้าสู่ระบบใหม่ (สิทธิ์จะอัปเดตตามตำแหน่งล่าสุด) หรือติดต่อผู้ดูแลระบบ
            </p>
            <p className="mt-1 text-[10px] text-slate-400">ระดับที่กำหนดไว้: ตั้งแต่ level {MIN_PROGRESS_RANK} ขึ้นไป · ผู้ดูแลระบบ (admin) เข้าได้เสมอ</p>
          </div>
        </main>
      </div>
    </div>
  );
}
