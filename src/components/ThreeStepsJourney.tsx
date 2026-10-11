'use client';
// ThreeStepsJourney.tsx — ส่วนแนะนำ "3 ขั้นสู่อิสรภาพทางการเงิน" แสดงเป็นข้อความแรกของหน้า /prospects
// ข้อกำหนดจากเจ้าของระบบ: อังกฤษเป็นภาษาเริ่มต้น + รองรับการแปล (เมื่อผู้ใช้สลับภาษาเป็นไทยจะแสดงไทย)
// ⛔ ห้ามสัญญารายได้/ผลตอบแทน/อิสรภาพทางการเงินว่าเกิดขึ้นแน่นอน · ห้ามแต่งเงื่อนไข/ค่าธรรมเนียม/กรอบเวลาเอง
// 🔗 ลิงก์ทั้งสามต้องคงไว้ตรงตามที่กำหนด: /recruit · /register · /documents
import Link from 'next/link';
import { useT } from '@/i18n';

type Copy = {
  eyebrow: string;
  headline: string;
  support: string;
  steps: { title: string; desc: string; cta: string; note: string }[];
  stepLabel: string;
  compliance: string;
  langNote: string;
};

const EN: Copy = {
  eyebrow: 'GETTING STARTED',
  headline: 'Start Your Journey to Financial Freedom in 3 Simple Steps',
  support:
    'Take the first step toward building a professional career, developing your financial opportunities, and growing your future with a structured registration process.',
  stepLabel: 'Step',
  steps: [
    {
      title: 'Become a Prospective Insurance Agent',
      desc: 'Begin your journey by registering as a prospective life insurance agent.',
      cta: 'Become a Prospective Agent',
      note: 'Opens the prospective-agent registration form',
    },
    {
      title: 'Register Your Interest',
      desc: 'Complete the expression-of-interest registration to continue the application process.',
      cta: 'Register Your Interest',
      note: 'Tell us about yourself so the team can follow up',
    },
    {
      title: 'Submit Your Payment Receipt',
      desc: 'Upload or submit your payment receipt through the designated document submission page, following the applicable instructions.',
      cta: 'Submit Payment Receipt',
      note: 'Scan or upload your receipt — it is stored in your member document library',
    },
  ],
  compliance:
    'Financial freedom is a long-term goal, not a guaranteed outcome. This journey involves professional effort and time; no income, return or approval timeline is promised. Requirements are those stated by the company and the applicable documents.',
  langNote: 'This guide is shown in English by default and can be localized with the language selector.',
};

const TH: Copy = {
  eyebrow: 'เริ่มต้นกับเรา',
  headline: 'เริ่มเส้นทางสู่อิสรภาพทางการเงินใน 3 ขั้นตอนง่าย ๆ',
  support:
    'ก้าวแรกสู่การสร้างอาชีพอย่างมืออาชีพ พัฒนาโอกาสทางการเงิน และเติบโตไปข้างหน้าด้วยขั้นตอนรับสมัครที่เป็นระบบ',
  stepLabel: 'ขั้นที่',
  steps: [
    {
      title: 'สมัครเป็นผู้มุ่งหวังเป็นตัวแทนประกันชีวิต',
      desc: 'เริ่มต้นด้วยการลงทะเบียนเป็นผู้มุ่งหวังที่จะเป็นตัวแทนประกันชีวิต',
      cta: 'สมัครเป็นผู้มุ่งหวังเป็นตัวแทน',
      note: 'เปิดแบบฟอร์มรับสมัครผู้มุ่งหวังเป็นตัวแทน',
    },
    {
      title: 'ลงทะเบียนแสดงความสนใจ',
      desc: 'กรอกแบบฟอร์มแสดงความสนใจเพื่อดำเนินการสมัครในขั้นถัดไป',
      cta: 'ลงทะเบียนแสดงความสนใจ',
      note: 'แจ้งข้อมูลของคุณเพื่อให้ทีมงานติดต่อกลับ',
    },
    {
      title: 'ส่งหลักฐานการชำระเบี้ย',
      desc: 'อัปโหลดหรือส่งใบเสร็จการชำระเงินผ่านหน้าส่งเอกสารตามคำแนะนำที่กำหนด',
      cta: 'ส่งหลักฐานการชำระเบี้ย',
      note: 'สแกนหรืออัปโหลดใบเสร็จ ระบบเก็บไว้ในคลังเอกสารของสมาชิก',
    },
  ],
  compliance:
    'อิสรภาพทางการเงินเป็นเป้าหมายระยะยาว ไม่ใช่ผลลัพธ์ที่รับประกันได้ เส้นทางนี้ต้องใช้ความพยายามและเวลา ระบบไม่สัญญารายได้ ผลตอบแทน หรือกรอบเวลาการอนุมัติ และไม่กำหนดเงื่อนไข/ค่าธรรมเนียมใด ๆ เอง',
  langNote: 'หน้านี้แสดงภาษาอังกฤษเป็นค่าเริ่มต้น และแปลได้ตามภาษาที่เลือกจากตัวเลือกภาษา',
};

const STEPS_UI = [
  { icon: '🧭', href: 'https://ai-insurance-network-tree.vercel.app/recruit', accent: '#c8a84e' },
  { icon: '📝', href: 'https://ai-insurance-network-tree.vercel.app/register', accent: '#475569' },
  { icon: '🧾', href: 'https://ai-insurance-network-tree.vercel.app/documents', accent: '#0f766e' },
];

export default function ThreeStepsJourney() {
  const { lang } = useT();
  const c: Copy = lang === 'th' ? TH : EN; // อังกฤษ = ค่าเริ่มต้น · รองรับการแปล (ตอนนี้มีไทย)

  return (
    <section aria-labelledby="three-steps-heading" data-section="three-steps" className="space-y-5">
      {/* หัวเรื่อง */}
      <div className="rounded-2xl border border-[#f3e8d3] bg-gradient-to-br from-white to-[#FCFBF6] p-5 sm:p-7">
        <div className="text-[11px] font-semibold tracking-[0.14em] text-[#c8a84e]">{c.eyebrow}</div>
        <h1 id="three-steps-heading" className="mt-1.5 text-2xl sm:text-3xl font-bold leading-snug text-[#475569]">
          {c.headline}
        </h1>
        <p className="mt-3 max-w-3xl text-sm sm:text-[15px] leading-relaxed text-[#57534e]">{c.support}</p>
        <p className="mt-3 text-[11px] text-slate-400">🌐 {c.langNote}</p>
      </div>

      {/* 3 ขั้นตอน — เรียงตามลำดับ */}
      <ol className="grid grid-cols-1 md:grid-cols-3 gap-4 list-none p-0 m-0">
        {c.steps.map((s, i) => {
          const ui = STEPS_UI[i];
          return (
            <li key={ui.href} className="h-full">
              <div className="h-full flex flex-col rounded-2xl border border-[#e2e8f0] bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  <span
                    className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-lg text-white"
                    style={{ backgroundColor: ui.accent }}
                    aria-hidden="true"
                  >
                    {ui.icon}
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    {c.stepLabel} {i + 1}
                  </span>
                </div>

                <h2 className="mt-3 text-base font-bold leading-snug text-[#475569]">{s.title}</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-[#57534e]">{s.desc}</p>

                <p className="mt-3 text-[11px] text-slate-400">ℹ {s.note}</p>

                <Link
                  href={ui.href}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 transition"
                  style={{ backgroundColor: ui.accent }}
                  aria-label={`${c.stepLabel} ${i + 1}: ${s.cta}`}
                >
                  {s.cta} <span aria-hidden="true">→</span>
                </Link>

                <div className="mt-2 text-[11px] text-slate-400 break-all">{ui.href}</div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* ความโปร่งใส / ไม่สัญญาผลลัพธ์ */}
      <div className="rounded-2xl border border-[#f3e8d3] bg-[#FCFBF6] p-4">
        <p className="text-xs leading-relaxed text-[#57534e]">
          <span className="font-semibold text-[#475569]">⚠︎ Transparency. </span>
          {c.compliance}
        </p>
      </div>
    </section>
  );
}
