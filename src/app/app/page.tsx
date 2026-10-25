'use client';
// /app — หน้า "ติดตั้งแอป" สำหรับสมาชิก (PWA: ไม่ต้องโหลดจาก App Store / ไม่มีไฟล์ APK)
// 🌐 สากล: ไทย / อังกฤษ — ภาษาอื่น ๆ ใช้ภาษาอังกฤษเป็นสะพาน (เหมือน AutoTranslate ของทั้งระบบ)
//    อ่านภาษาจาก getLang() (localStorage 'app-lang') + ฟัง event 'app-lang-change' จากเมนูภาษา
// ใช้ส่งลิงก์นี้ให้สมาชิกใน LINE: เปิด → กดปุ่มติดตั้ง → ได้ไอคอนบนหน้าจอโฮม → กล้องเต็มจอ
import { useEffect, useState } from 'react';
import Link from 'next/link';
import InstallAppCard from '@/components/InstallAppCard';
import { getLang } from '@/i18n';

const SITE = 'https://ai-insurance-network-tree.vercel.app';

const COPY = {
  th: {
    back: '← กลับหน้าแรก',
    title: '📲 ติดตั้งแอปสำหรับสมาชิก (ฟรี)',
    intro1: 'ระบบนี้เป็น “เว็บแอป” (PWA) — ',
    introStrong: 'ไม่ต้องโหลดจาก App Store/Play Store และไม่มีไฟล์ APK',
    intro2: ' เปิดลิงก์นี้ในมือถือแล้วกดปุ่มติดตั้ง จะได้ไอคอนบนหน้าจอโฮม เปิดมาแล้วเป็นแอปเต็มจอ กล้องเปิดได้ทันที',
    installedTitle: 'ติดตั้งแล้ว ✓',
    installedBody: 'คุณกำลังเปิดจากไอคอนแอป — ไม่ต้องติดตั้งซ้ำ ปิดหน้านี้แล้วใช้งานได้เลย',
    androidTitle: '🤖 Android (Chrome / Edge)',
    androidSteps: [
      'กดปุ่ม ติดตั้งแอป ด้านบน → ยืนยัน “ติดตั้ง”',
      'ถ้าไม่เห็นปุ่ม: กดเมนู ⋮ มุมขวา → ติดตั้งแอป หรือ เพิ่มลงในหน้าจอหลัก',
      'เปิดจากไอคอน “NAVI Agent” บนหน้าจอโฮมได้เลย',
    ],
    iosTitle: '🍎 iPhone / iPad (Safari)',
    iosSteps: [
      'เปิดหน้านี้ด้วย Safari (ไม่ใช่ LINE/Facebook ในแอป)',
      'กดปุ่ม แชร์ ⬆️ ด้านล่างจอ',
      'เลือก “เพิ่มไปที่หน้าจอโฮม” → เพิ่ม',
    ],
    iosWarn: '⚠️ บน iPhone/iPad ต้องเปิดใน Safari — เปิดจากใน LINE กล้องจะถูกบล็อกและไม่มีเมนูติดตั้ง',
    shareTitle: '🔗 ส่งต่อให้สมาชิกในทีม',
    shareScan: 'สแกน QR ด้วยกล้องมือถือ หรือส่งลิงก์นี้ใน LINE:',
    shareJoinPre: 'สมาชิกใหม่ที่ยังไม่มีบัญชี: สมัครฟรีก่อนที่ ',
    shareJoinLink: 'หน้า /join',
    shareJoinPost: ' แล้วค่อยติดตั้ง',
    faqTitle: 'คำถามที่พบบ่อย',
    faq: [
      ['ต้องโหลดไฟล์ .apk หรือซื้อแอปจาก Store ไหม?', 'ไม่ต้อง — ติดตั้งจากเว็บนี้โดยตรง ฟรี ไม่มีค่าใช้จ่าย และไม่ต้องอัปเดตเอง (อัปเดตอัตโนมัติเมื่อเปิดแอป)'],
      ['ไอคอนขึ้นเป็นภาพหน้าจอ ไม่ใช่โลโก้?', 'เกิดกับเครื่องที่ติดตั้งไว้ก่อนอัปเดตไอคอน — ลบไอคอนเดิมออกแล้วติดตั้งใหม่'],
      ['เปิดแอปแล้วเจอหน้าเข้าสู่ระบบ?', 'ล็อกอินครั้งเดียว ระบบจะพากลับไปหน้าเดิม (เช่น หน้าสแกนใบเสร็จ) ให้อัตโนมัติ'],
      ['อินเทอร์เน็ตหลุด?', 'แอปจะแสดงหน้าแจ้งเตือนให้ต่อเน็ตก่อน — ข้อมูลใบเสร็จ/ผู้สนใจไม่ถูกเก็บไว้ในเครื่อง'],
    ],
    ctaJoin: 'สมัครใช้งานฟรี',
    ctaScan: 'ไปหน้าสแกนใบเสร็จ',
    ctaLogin: 'เข้าสู่ระบบ',
  },
  en: {
    back: '← Back to home',
    title: '📲 Install the member app (free)',
    intro1: 'This system is a web app (PWA) — ',
    introStrong: 'no App Store/Play Store download and no APK file',
    intro2: '. Open this link on your phone and tap Install to get an icon on your home screen. It opens full screen with the camera ready.',
    installedTitle: 'Installed ✓',
    installedBody: 'You are running the installed app — nothing else to do. Close this page and start working.',
    androidTitle: '🤖 Android (Chrome / Edge)',
    androidSteps: [
      'Tap Install above, then confirm “Install”.',
      'No button? Open the ⋮ menu → Install app, or Add to Home screen.',
      'Launch it from the “NAVI Agent” icon on your home screen.',
    ],
    iosTitle: '🍎 iPhone / iPad (Safari)',
    iosSteps: [
      'Open this page in Safari (not the in-app browser of LINE/Facebook).',
      'Tap the Share ⬆️ button at the bottom.',
      'Choose “Add to Home Screen” → Add.',
    ],
    iosWarn: '⚠️ On iPhone/iPad you must use Safari — inside LINE the camera is blocked and there is no install menu.',
    shareTitle: '🔗 Share with your team',
    shareScan: 'Scan the QR with a phone camera, or send this link in LINE:',
    shareJoinPre: 'New members without an account: sign up first at ',
    shareJoinLink: '/join',
    shareJoinPost: ', then install.',
    faqTitle: 'Frequently asked questions',
    faq: [
      ['Do I need an .apk file or a paid store app?', 'No — it installs straight from this website, free of charge, and updates itself automatically when opened.'],
      ['The icon looks like a screenshot, not the logo?', 'That happens on devices installed before the icon update — remove the old icon and install again.'],
      ['Opening the app shows a login screen?', 'Sign in once; the app returns you to the page you came from (e.g. the receipt scanner) automatically.'],
      ['What if the internet drops?', 'The app shows an offline notice first — receipt and prospect data is never stored on the device.'],
    ],
    ctaJoin: 'Sign up free',
    ctaScan: 'Open receipt scanner',
    ctaLogin: 'Log in',
  },
};

type Lang = keyof typeof COPY;

export default function InstallAppPage() {
  const [qr, setQr] = useState('');
  const [lang, setLang] = useState<Lang>('th');
  const [ua, setUa] = useState({ ios: false, android: false, standalone: false });

  useEffect(() => {
    // ภาษา: ไทย = ไทย · ภาษาอื่นทั้งหมด = อังกฤษ (สะพานสากล เหมือน AutoTranslate)
    const read = () => setLang(getLang() === 'th' ? 'th' : 'en');
    read();
    const onLang = () => read();
    window.addEventListener('app-lang-change', onLang);

    let alive = true;
    import('qrcode')
      .then((m) => m.default.toDataURL(`${SITE}/app`, {
        width: 320, margin: 1,
        color: { dark: '#334155', light: '#ffffff' },
      }))
      .then((url) => { if (alive) setQr(url); })
      .catch(() => null);

    const s = navigator.userAgent || '';
    setUa({
      ios: /iPad|iPhone|iPod/.test(s) || (/Macintosh/.test(s) && 'ontouchend' in document),
      android: /Android/.test(s),
      standalone: window.matchMedia?.('(display-mode: standalone)')?.matches || (navigator as any).standalone === true,
    });

    return () => { alive = false; window.removeEventListener('app-lang-change', onLang); };
  }, []);

  const c = COPY[lang];

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      {/* หัวเรื่อง */}
      <div className="mb-5">
        <Link href="/" className="text-[11px] font-semibold text-sky-700 underline">{c.back}</Link>
        <h1 className="mt-2 text-xl font-bold text-[#475569]">{c.title}</h1>
        <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
          {c.intro1}<b>{c.introStrong}</b>{c.intro2}
        </p>
      </div>

      {/* ปุ่มติดตั้ง (จับ beforeinstallprompt ที่ระดับ layout) */}
      {ua.standalone ? (
        <div className="card border-l-4 border-emerald-500 p-4">
          <div className="text-sm font-bold text-emerald-800">{c.installedTitle}</div>
          <div className="mt-1 text-[11px] text-slate-500">{c.installedBody}</div>
        </div>
      ) : (
        <InstallAppCard />
      )}

      {/* วิธีติดตั้ง แยกตามเครื่อง */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className={`card p-4 ${ua.android ? 'border-l-4 border-sky-500' : ''}`}>
          <div className="text-sm font-bold text-[#475569]">{c.androidTitle}</div>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[11px] leading-relaxed text-slate-600">
            {c.androidSteps.map((s) => <li key={s}>{s}</li>)}
          </ol>
        </div>
        <div className={`card p-4 ${ua.ios ? 'border-l-4 border-sky-500' : ''}`}>
          <div className="text-sm font-bold text-[#475569]">{c.iosTitle}</div>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[11px] leading-relaxed text-slate-600">
            {c.iosSteps.map((s) => <li key={s}>{s}</li>)}
          </ol>
          <div className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[10px] leading-relaxed text-amber-800">
            {c.iosWarn}
          </div>
        </div>
      </div>

      {/* QR สำหรับส่งให้สมาชิกคนอื่น */}
      <div className="card mt-4 p-4">
        <div className="text-sm font-bold text-[#475569]">{c.shareTitle}</div>
        <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          {qr
            ? <img src={qr} alt="QR" width={160} height={160} className="rounded-xl border" />
            : <div className="h-[160px] w-[160px] animate-pulse rounded-xl bg-slate-100" />}
          <div className="min-w-0 text-[11px] leading-relaxed text-slate-600">
            <div>{c.shareScan}</div>
            <div className="mt-1 break-all rounded-lg bg-slate-50 px-2 py-1.5 font-mono text-[10px] text-slate-700">{SITE}/app</div>
            <div className="mt-2">{c.shareJoinPre}
              <Link href="/join" className="font-semibold text-sky-700 underline">{c.shareJoinLink}</Link>
              {c.shareJoinPost}
            </div>
          </div>
        </div>
      </div>

      {/* คำถามที่พบบ่อย */}
      <div className="card mt-4 p-4">
        <div className="text-sm font-bold text-[#475569]">{c.faqTitle}</div>
        <dl className="mt-2 space-y-2 text-[11px] leading-relaxed text-slate-600">
          {c.faq.map(([q, a]) => (
            <div key={q}>
              <dt className="font-semibold text-slate-700">{q}</dt>
              <dd>{a}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/join" className="rounded-full bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white">{c.ctaJoin}</Link>
        <Link href="/documents?m=1&cam=1" className="rounded-full border px-5 py-2.5 text-xs font-semibold text-slate-700">{c.ctaScan}</Link>
        <Link href="/login" className="rounded-full border px-5 py-2.5 text-xs font-semibold text-slate-700">{c.ctaLogin}</Link>
      </div>
    </main>
  );
}
