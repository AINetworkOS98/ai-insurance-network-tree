'use client';
// ThreeStepsJourney.tsx — ส่วนแนะนำ "3 ขั้นสู่อิสรภาพทางการเงิน" (ไทย/อังกฤษ)
// ใช้เป็นส่วนแรกของหน้า /financial-freedom และ /prospects
//
// 🌐 ภาษา: อังกฤษเป็นค่าเริ่มต้น · เมื่อผู้ใช้กดปุ่มเลือกภาษา (LanguageMenu ของแอป) ข้อความเปลี่ยนตามทันที
//    - เลือกไทย → ชุดข้อความไทย · เลือกภาษาอื่น → อังกฤษ (สำรอง)
//    รับเหตุการณ์ 'app-lang-change' ที่ส่งจาก src/i18n + อ่าน localStorage('app-lang') ตอนเปิดหน้า
// ⛔ ไม่สัญญารายได้/ผลตอบแทน/อิสรภาพทางการเงินว่าเกิดขึ้นแน่นอน และไม่กำหนดเงื่อนไข/ค่าธรรมเนียม/กรอบเวลาเอง
// 🔗 ลิงก์คงตามที่กำหนด: /recruit · /register · /documents
import Link from 'next/link';
import { useT } from '@/i18n';

type CopyStep = { title: string; desc: string; cta: string };
type Copy = {
  headline1: string;
  headlineAccent: string;
  headline2: string;
  support: string;
  sideTagline: string;
  stepLabel: string;
  steps: CopyStep[];
  benefits: { icon: string; title: string; sub: string }[];
  footerLeft: string;
  footerArrow: string;
  footerRight: string;
  transparency: string;
};

// ลำดับ/ไอคอน/ลิงก์ ของ 3 ขั้น (คงที่ทั้งสองภาษา)
const STEP_META = [
  { n: '1', icon: '📝', url: 'https://ai-insurance-network-tree.vercel.app/register' },
  { n: '2', icon: '🧑‍💼', url: 'https://ai-insurance-network-tree.vercel.app/recruit' },
  { n: '3', icon: '🧾', url: 'https://ai-insurance-network-tree.vercel.app/documents' },
];

const EN: Copy = {
  headline1: 'Start Your Journey to',
  headlineAccent: 'Financial Freedom',
  headline2: 'in 3 Simple Steps',
  support:
    'Build a professional career, create new financial opportunities, and grow your future with the right support and a structured registration process.',
  sideTagline: 'Better Career\nBrighter Future',
  stepLabel: 'STEP',
  steps: [
    { title: 'Create Your Account', desc: 'Register with your email and password, then verify your email address.', cta: 'Go to Registration' },
    { title: 'Apply as a Prospective Agent', desc: 'Submit the prospective-agent application to continue the selection process.', cta: 'Go to Agent Application' },
    { title: 'Upload Your Payment Receipt', desc: 'Upload the receipt so the system reads the real amount and checks eligibility.', cta: 'Go to Receipt Upload' },
  ],
  benefits: [
    { icon: '🚀', title: 'Simple', sub: 'Easy to get started' },
    { icon: '🛡', title: 'Transparent', sub: 'Clear and trusted process' },
    { icon: '📈', title: 'Actionable', sub: 'Take the next step today' },
    { icon: '🎯', title: 'Your Future', sub: 'Starts here' },
  ],
  footerLeft: 'Small Steps Today',
  footerArrow: '→',
  footerRight: 'Big Opportunities Tomorrow',
  transparency:
    'Financial freedom is a long-term goal, not a guaranteed outcome — no income, return or approval timeline is promised. Requirements follow the company and the applicable documents.',
};

const TH: Copy = {
  headline1: 'เริ่มต้นเส้นทางสู่',
  headlineAccent: 'อิสรภาพทางการเงิน',
  headline2: 'เพียง 3 ขั้นตอน',
  support: 'สร้างอาชีพที่มั่นคง เปิดโอกาสทางการเงิน และเติบโตไปกับอนาคตที่คุณเลือกได้',
  sideTagline: 'เริ่มวันนี้\nเพื่ออนาคตที่ดีกว่า',
  stepLabel: 'ขั้นตอน',
  steps: [
    { title: 'ลงทะเบียน\nสมัครสมาชิก', desc: 'สมัครบัญชีด้วยอีเมลและรหัสผ่าน แล้วยืนยันอีเมลเพื่อเข้าใช้งาน', cta: 'เข้าสู่หน้าลงทะเบียน' },
    { title: 'สมัครเป็นตัวแทน\n(ผู้มุ่งหวัง)', desc: 'กรอกใบสมัคร/แสดงความสนใจ เพื่อเข้าสู่กระบวนการคัดเลือกตัวแทน', cta: 'เข้าสู่หน้าสมัครตัวแทน' },
    { title: 'อัปโหลดสลิป\n/ใบเสร็จ', desc: 'อัปโหลดสลิปให้ระบบอ่านยอดเงินจริง และตรวจคุณสมบัติอัตโนมัติ', cta: 'เข้าสู่หน้าอัปโหลดใบเสร็จ' },
  ],
  benefits: [
    { icon: '🚀', title: 'เริ่มต้นง่าย', sub: 'สมัครได้ทันที' },
    { icon: '🛡', title: 'โปร่งใส', sub: 'ทุกขั้นตอนชัดเจน' },
    { icon: '📈', title: 'เติบโตได้จริง', sub: 'ด้วยระบบสนับสนุนที่แข็งแกร่ง' },
    { icon: '🎯', title: 'อนาคตที่คุณสร้างได้', sub: 'เริ่มวันนี้' },
  ],
  footerLeft: 'ก้าวเล็ก ๆ วันนี้',
  footerArrow: '→',
  footerRight: 'สู่โอกาสใหญ่ในวันพรุ่งนี้',
  transparency:
    'อิสรภาพทางการเงินเป็นเป้าหมายระยะยาว ไม่ใช่ผลลัพธ์ที่รับประกันได้ — ระบบไม่สัญญารายได้ ผลตอบแทน หรือกรอบเวลาการอนุมัติ และไม่กำหนดเงื่อนไข/ค่าธรรมเนียมเอง',
};

const NAVY = '#123a6b';
const GOLD = '#c8a84e';

export default function ThreeStepsJourney({
  showImage = true,
  showHeadline = true,
}: {
  /** แสดงภาพขั้นตอนด้านบน (ปิดได้เมื่อหน้าไหนไม่ต้องการรูป) */
  showImage?: boolean;
  /** แสดงหัวเรื่อง + คำโปรย (ปิดได้เมื่อหน้าไหนไม่อยากซ้ำข้อความใหญ่) */
  showHeadline?: boolean;
} = {}) {
  // ใช้ภาษาจากปุ่มเลือกภาษาของแอปโดยตรง (i18n/useT) → กดปุ่มแล้วทั้ง "ภาพ" และ "ข้อความ" เปลี่ยนทันที
  // ไทย = ภาพ+ข้อความไทย · ภาษาอื่น ๆ ทั้งหมด = ภาพ+ข้อความอังกฤษ (ชุดภาษาอังกฤษเป็นชุดสำรอง)
  const { lang } = useT();
  const isThai = String(lang) === 'th';
  const c: Copy = isThai ? TH : EN;
  const img = isThai ? '/steps/3-steps-th' : '/steps/3-steps-en';

  return (
    <section aria-labelledby="three-steps-heading" data-section="three-steps" className="max-w-6xl mx-auto mb-14">
      {/* ── ภาพขั้นตอน 3 ขั้น (แสดงก่อนทุกอย่าง) — เปลี่ยนตามภาษาที่เลือก: ไทย ⇄ อังกฤษ ── */}
      {showImage && (
      <figure className="m-0">
        <picture>
          <source srcSet={`${img}.webp`} type="image/webp" />
          <img
            src={`${img}.jpg`}
            alt={isThai
              ? 'เริ่มต้นเส้นทางสู่อิสรภาพทางการเงิน เพียง 3 ขั้นตอน: 1) ลงทะเบียนสมัครสมาชิก 2) สมัครเป็นตัวแทน (ผู้มุ่งหวัง) 3) อัปโหลดสลิป/ใบเสร็จ'
              : 'Start your journey to financial freedom in 3 simple steps: 1) Create your account 2) Apply as a prospective agent 3) Upload your payment receipt'}
            className="w-full h-auto rounded-3xl border border-slate-200 shadow-lg"
            width={1600}
            height={1093}
            loading="eager"
            data-step-art={isThai ? 'th' : 'en'}
          />
        </picture>
        <figcaption className="mt-2 text-center text-[11px] text-slate-400">
          🖼 {isThai ? 'ภาพชุดภาษาไทย' : 'English artwork'} · เปลี่ยนตามปุ่มเลือกภาษา (🇹🇭 ไทย / 🇬🇧 English)
        </figcaption>
      </figure>
      )}

      {/* ── หัวเรื่อง (ข้อความประกอบใต้ภาพ) ── */}
      {showHeadline && (
      <div className="rounded-3xl p-6 sm:p-8 text-white shadow-lg"
           style={{ background: 'linear-gradient(135deg, #123a6b 0%, #1c4f8a 60%, #2f6fb0 100%)' }}>
        <div className="flex flex-col md:flex-row md:items-center gap-6">
          <div className="flex-1">
            <h1 id="three-steps-heading" className="text-2xl sm:text-3xl md:text-4xl font-extrabold leading-tight">
              {c.headline1} <span style={{ color: GOLD }}>{c.headlineAccent}</span>{' '}
              <span className="block md:inline">{c.headline2}</span>
            </h1>
            <p className="mt-3 max-w-2xl text-sm sm:text-[15px] leading-relaxed text-white/90">{c.support}</p>
          </div>
          <div className="shrink-0 md:text-right">
            <div className="text-lg sm:text-xl font-semibold leading-snug whitespace-pre-line" style={{ color: GOLD }}>
              {c.sideTagline}
            </div>
          </div>
        </div>
      </div>
      )}

      {/* ── 3 ขั้นตอน ── */}
      <ol className={`${showHeadline || showImage ? 'mt-6' : 'mt-0'} grid grid-cols-1 md:grid-cols-3 gap-5 list-none p-0 m-0`}>
        {c.steps.map((s, i) => {
          const meta = STEP_META[i];
          return (
            <li key={meta.url} className="h-full">
              <div className="h-full flex flex-col rounded-3xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-3">
                  <span className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center text-xl font-extrabold text-white"
                        style={{ backgroundColor: NAVY }} aria-hidden="true">{meta.n}</span>
                  <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color: NAVY }}>
                    {c.stepLabel} {meta.n}
                  </span>
                </div>

                <h2 className="mt-3 text-lg font-bold leading-snug whitespace-pre-line" style={{ color: NAVY }}>{s.title}</h2>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{s.desc}</p>

                <div className="mt-4 h-28 rounded-2xl flex items-center justify-center text-5xl"
                     style={{ background: 'linear-gradient(160deg, #eef4fb 0%, #f8fafc 100%)' }} aria-hidden="true">
                  {meta.icon}
                </div>

                <Link href={meta.url}
                      className="mt-4 inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-sm sm:text-[15px] font-bold text-white shadow-sm hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 transition"
                      style={{ backgroundColor: NAVY }}
                      aria-label={c.stepLabel + ' ' + meta.n + ': ' + s.cta}>
                  <span aria-hidden="true">↗</span> {s.cta} <span aria-hidden="true">›</span>
                </Link>

                <div className="mt-3 flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-500" title={meta.url}>
                  <span aria-hidden="true">🔗</span>
                  <span className="truncate">{meta.url}</span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* ── แถบคุณสมบัติ 4 ข้อ + ประโยคปิดท้าย ── */}
      <div className="mt-6 rounded-3xl p-4 sm:p-5 text-white" style={{ backgroundColor: NAVY }}>
        <ul className="grid grid-cols-2 md:grid-cols-4 gap-4 list-none p-0 m-0">
          {c.benefits.map((b) => (
            <li key={b.title} className="flex items-center gap-3">
              <span className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-lg"
                    style={{ backgroundColor: 'rgba(255,255,255,0.12)' }} aria-hidden="true">{b.icon}</span>
              <span className="min-w-0">
                <span className="block text-sm font-bold">{b.title}</span>
                <span className="block text-[11px] text-white/75">{b.sub}</span>
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 border-t border-white/15 pt-3 text-center text-sm font-semibold">
          {c.footerLeft} <span style={{ color: GOLD }} className="mx-1">{c.footerArrow}</span>{' '}
          <span style={{ color: GOLD }} className="italic">{c.footerRight}</span>
        </div>
      </div>

      {/* ── ความโปร่งใส (ไม่สัญญาผลลัพธ์) ── */}
      <p className="mt-3 text-[11px] leading-relaxed text-slate-500">
        <span className="font-semibold text-slate-600">⚠︎ </span>
        {c.transparency}
      </p>
    </section>
  );
}
