'use client';
/**
 * OfficialTaxDocs.tsx — รูป/ไฟล์เอกสารราชการสำหรับยื่นภาษีเงินได้บุคคลธรรมดา ปีภาษี 2568
 * ไฟล์ทั้งหมดดาวน์โหลดตรงจากกรมสรรพากร (rd.go.th) เก็บใน public/tax-docs
 * วางแสดง "หลังตารางฐานภาษี" และ "ก่อนโปรแกรมคำนวณภาษี"
 */
type Doc = {
  id: string;
  title: string;
  subtitle: string;
  desc: string;
  pages: string;
  size: string;
  file: string;
  previews: Array<{ src: string; label: string }>;
};

const DOCS: Doc[] = [
  {
    id: 'pnd90',
    title: 'ภ.ง.ด.90',
    subtitle: 'แบบแสดงรายการภาษีเงินได้บุคคลธรรมดา สำหรับผู้มีเงินได้กรณีทั่วไป',
    desc: 'ใช้เมื่อมีเงินได้มากกว่า 1 ประเภท หรือมีเงินได้มาตรา 40(2)–(8) — ข้อ 1–7 เงินได้/ค่าใช้จ่าย และข้อ 11 การคำนวณภาษี 1.–16.',
    pages: '5 หน้า',
    size: '1.6 MB',
    file: '/tax-docs/pnd90-2568.pdf',
    previews: [
      { src: '/tax-docs/img/pnd90-2568-p1.png', label: 'หน้า 1 · ข้อมูลผู้มีเงินได้' },
      { src: '/tax-docs/img/pnd90-2568-p2.png', label: 'หน้า 2 · ข้อ 1–7 (เงินได้ + หักค่าใช้จ่าย)' },
    ],
  },
  {
    id: 'pnd91',
    title: 'ภ.ง.ด.91',
    subtitle: 'แบบแสดงรายการฯ สำหรับผู้มีเงินได้จากเงินเดือนอย่างเดียว',
    desc: 'ใช้เมื่อมีเงินได้ตามมาตรา 40(1) ประเภทเดียวทั้งปี (เงินเดือน ค่าจ้าง โบนัส) — กรอกสั้นกว่า ภ.ง.ด.90',
    pages: '3 หน้า',
    size: '1.4 MB',
    file: '/tax-docs/pnd91-2568.pdf',
    previews: [{ src: '/tax-docs/img/pnd91-2568-p1.png', label: 'หน้า 1' }],
  },
  {
    id: 'attachment',
    title: 'ใบแนบแสดงรายละเอียดรายการลดหย่อนและยกเว้น',
    subtitle: 'ใบแนบ ภ.ง.ด.90 / ภ.ง.ด.91 — ค่าลดหย่อน ข้อ 1.–24.',
    desc: 'เลขข้อลดหย่อนที่โปรแกรมคำนวณด้านล่างอ้างอิงทั้งหมดมาจากใบแนบนี้ (ข้อ 8 สำรองเลี้ยงชีพ · ข้อ 12 ประกันสังคม · ข้อ 17 Easy E-Receipt · ข้อ 22 เที่ยวดีมีคืน ฯลฯ)',
    pages: '1 หน้า',
    size: '1.1 MB',
    file: '/tax-docs/attachment-deductions-2568.pdf',
    previews: [{ src: '/tax-docs/img/attachment-deductions-2568-p1.png', label: 'หน้า 1 · รายการลดหย่อน ข้อ 1.–24.' }],
  },
  {
    id: 'manual',
    title: 'คำชี้แจงการกรอก ภ.ง.ด.90',
    subtitle: 'คู่มือกรอกแบบทีละข้อ (พร้อมตัวอย่าง)',
    desc: 'อธิบายวิธีกรอกทุกช่องของแบบ ภ.ง.ด.90 และการหักค่าใช้จ่าย/ลดหย่อน — ใช้คู่กับโปรแกรมคำนวณได้เลย',
    pages: '18 หน้า',
    size: '0.8 MB',
    file: '/tax-docs/manual-pnd90-2568.pdf',
    previews: [{ src: '/tax-docs/img/manual-pnd90-2568-p1.png', label: 'หน้า 1' }],
  },
];

function DocCard({ d }: { d: Doc }) {
  return (
    <article className="card p-4 flex flex-col">
      <div className="flex items-start gap-3">
        {/* รูปตัวอย่างเอกสาร */}
        <a href={d.file} target="_blank" rel="noreferrer" className="shrink-0 group" title={`เปิด ${d.title} (PDF)`}>
          <div className="relative w-[104px] h-[148px] rounded-lg overflow-hidden border border-gray-200 bg-slate-50 shadow-sm group-hover:shadow-md transition-shadow">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={d.previews[0].src} alt={`${d.title} หน้าแรก`} className="w-full h-full object-cover object-top" loading="lazy" />
          </div>
        </a>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-[#475569]">{d.title}</h3>
            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-white text-slate-500 tabular-nums">{d.pages}</span>
            <span className="text-[10px] px-2 py-0.5 rounded-full border bg-white text-slate-500 tabular-nums">{d.size}</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1 leading-4">{d.subtitle}</p>
          <p className="text-[11px] text-slate-400 mt-1.5 leading-4">{d.desc}</p>
          <div className="flex flex-wrap gap-2 mt-3">
            <a href={d.file} target="_blank" rel="noreferrer"
              className="px-3 py-1.5 rounded-full bg-[#475569] text-white text-[11px] font-semibold hover:opacity-90">🔍 เปิดดู PDF</a>
            <a href={d.file} download
              className="px-3 py-1.5 rounded-full border border-gray-200 bg-white text-[11px] font-semibold text-slate-600 hover:bg-sky-50">⤓ ดาวน์โหลด</a>
          </div>
        </div>
      </div>
      {d.previews.length > 1 && (
        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
          {d.previews.slice(1).map((p) => (
            <a key={p.src} href={d.file} target="_blank" rel="noreferrer" className="shrink-0 group">
              <div className="w-[104px] h-[148px] rounded-lg overflow-hidden border border-gray-200 bg-slate-50 group-hover:shadow-md transition-shadow">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.src} alt={p.label} className="w-full h-full object-cover object-top" loading="lazy" />
              </div>
              <div className="text-[10px] text-slate-400 mt-1 w-[104px] leading-3">{p.label}</div>
            </a>
          ))}
        </div>
      )}
    </article>
  );
}

export default function OfficialTaxDocs() {
  return (
    <section className="card overflow-hidden" id="official-tax-docs">
      <div className="p-5 sm:p-6 border-b border-gray-100 bg-gradient-to-br from-white via-white to-emerald-50/40">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-2.5 py-1">
            Revenue Department · Tax Year 2568
          </span>
          <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-slate-500 bg-white border border-gray-200 rounded-full px-2.5 py-1">
            ไฟล์ราชการต้นฉบับ
          </span>
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-[#475569] mt-3 tracking-tight">เอกสารที่ใช้ยื่นภาษี (ปีภาษี 2568)</h2>
        <p className="text-xs sm:text-sm text-slate-500 mt-1 leading-6 max-w-3xl">
          ดาวน์โหลดตรงจากกรมสรรพากร <span className="text-slate-600">rd.go.th</span> — เปิดดู/พิมพ์ได้ทันที
          และเป็นชุดเอกสารเดียวกับที่โปรแกรมคำนวณภาษีด้านล่างอ้างอิงเลขข้อทั้งหมด
        </p>
      </div>

      <div className="p-5 sm:p-6 grid lg:grid-cols-2 gap-4">
        {DOCS.map((d) => <DocCard key={d.id} d={d} />)}
      </div>

      <div className="px-5 sm:px-6 pb-6 text-[11px] text-slate-400 leading-5 border-t border-gray-100 pt-4">
        ต้นทาง:{' '}
        <a className="underline decoration-slate-300 hover:text-sky-700" href="https://www.rd.go.th/67335.html" target="_blank" rel="noreferrer">
          หน้าดาวน์โหลดแบบ ภ.ง.ด. ปี 2568 กรมสรรพากร
        </a>
        {' '}· เลขข้อในโปรแกรมคำนวณ (ข้อ 1–7, ข้อ 11, ใบแนบ ข้อ 1.–24.) อ้างจากเอกสารชุดนี้โดยตรง ·
        กำหนดยื่นแบบ ภายใน 31 มีนาคม ของปีถัดไป (ยื่นออนไลน์ได้ถึง 8 เมษายน)
      </div>
    </section>
  );
}
