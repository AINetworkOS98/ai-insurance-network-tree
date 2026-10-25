'use client';
// /download — หน้า "ดาวน์โหลดแอป" (เมนูย่อยคู่กับ /join)
//   • Android: ดาวน์โหลดไฟล์ APK ติดตั้งเองได้ทันที (แอป Flutter native)
//   • iPhone/iPad: ติดตั้งผ่าน Safari (PWA) — ยังไม่มีไฟล์ IPA บนเซิร์ฟเวอร์นี้
// หมายเหตุ: ไฟล์ APK ถูกวางไว้ที่ public/apk/ai-insurance-mobile.apk (path แยกจาก route นี้)
//          เว็บแอป Flutter (ตัวเดียวกับ APK) อยู่ที่ public/m/index.html
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Header from '@/components/Header';
import JoinAppTabs from '@/components/JoinAppTabs';
import { getLang } from '@/i18n';

const APK_URL = '/apk/ai-insurance-mobile.apk';            // arm64-v8a (มือถือส่วนใหญ่)
const APK_URL_ALL = '/apk/ai-insurance-mobile-universal.apk'; // รวมทุกสถาปัตยกรรม (เครื่องรุ่นเก่า)
const APK_VERSION = '1.0.0';
const APK_SIZE = '17.3 MB';
const WEB_APP = '/m/index.html';

const COPY = {
  th: {
    title: '📲 ดาวน์โหลดแอปมือถือ',
    lead: 'แอปตัวแทนประกัน — ดูเครือข่าย 1 แตก 5 · สรุปค่าตอบแทน · ถ่ายใบเสร็จเบี้ยส่งเข้าทันที',
    leadNote: 'ใช้บัญชีเดิมของเว็บเข้าระบบได้เลย (อีเมล/ชื่อผู้ใช้ + รหัสผ่านเดียวกัน)',
    androidTitle: '🤖 Android — ติดตั้งจากไฟล์ APK',
    androidBadge: 'แนะนำสำหรับ Android',
    androidDesc: 'ไฟล์ติดตั้งตรงจากระบบเรา ไม่ผ่าน Play Store — ไม่มีค่าใช้จ่าย',
    androidBtn: 'ดาวน์โหลด APK',
    androidMeta: `เวอร์ชัน ${APK_VERSION} · ${APK_SIZE} · Android 7.0 ขึ้นไป`,
    androidStepsTitle: 'วิธีติดตั้ง (3 ขั้น)',
    androidSteps: [
      'กดปุ่ม «ดาวน์โหลด APK» แล้วรอไฟล์โหลดเสร็จ (จะเห็นแจ้งเตือนที่แถบด้านบน)',
      'เปิดไฟล์ที่โหลด → ถ้าระบบถาม ให้กด «อนุญาต» ติดตั้งจากแหล่งนี้ (ตั้งค่า → ความปลอดภัย)',
      'กด «ติดตั้ง» → เปิดแอปจากไอคอน “AI Insurance Network” แล้วเข้าสู่ระบบ',
    ],
    iosTitle: '🍎 iPhone / iPad — ติดตั้งผ่าน Safari',
    iosBadge: 'ยังไม่มีไฟล์ IPA',
    iosDesc: 'Apple ต้องใช้บัญชีนักพัฒนาและเครื่อง Mac ในการสร้างไฟล์ติดตั้ง — ระหว่างนี้ใช้แอปเว็บตัวเดียวกันได้เต็มรูปแบบ',
    iosBtn: 'เปิดแอปเว็บ (Safari)',
    iosStepsTitle: 'วิธีติดตั้งบนหน้าจอโฮม',
    iosSteps: [
      'เปิดลิงก์นี้ด้วย Safari (ห้ามเปิดจากการ์ดใน LINE/Facebook)',
      'กดปุ่มแชร์ ⬆️ ที่แถบล่างจอ',
      'เลือก «เพิ่มไปที่หน้าจอโฮม» → เพิ่ม',
      'เปิดจากไอคอนบนหน้าจอโฮม จะได้แอปเต็มจอ กล้องใช้งานได้',
    ],
    webTitle: '💻 ใช้บนคอมพิวเตอร์',
    webDesc: 'เปิดเว็บแอปเต็มรูปแบบได้เลย ไม่ต้องติดตั้งอะไร',
    webBtn: 'เปิดเว็บแอป',
    joinTitle: 'ยังไม่มีบัญชี?',
    joinDesc: 'สมัครขอเข้าใช้ระบบฟรีก่อน (ทีมงานติดต่อกลับภายใน 1 วันทำการ)',
    joinBtn: 'ไปหน้าสมัครสมาชิก',
    noteTitle: 'สิ่งที่แอปทำได้',
    features: [
      ['หน้าหลัก', 'ตำแหน่งปัจจุบัน เป้าตำแหน่ง และกำหนดส่งใบเสร็จของรอบ'],
      ['เครือข่าย 1 แตก 5', 'สมาชิกในสาย ช่องว่างที่รับสมัครได้ และสถานะเงื่อนไข'],
      ['รายได้', 'ยอดรับรองแล้ว รอตรวจ ไม่ผ่าน พร้อมรายการล่าสุด'],
      ['ใบเสร็จ', 'ถ่ายรูปด้วยกล้องแล้วอัปโหลด ระบบอ่านเลขใบเสร็จ/ยอดเงินให้'],
      ['ความปลอดภัย', 'เก็บเซสชันใน Keychain/Keystore ของเครื่อง ไม่เก็บรหัสผ่าน'],
    ],
    faqTitle: 'คำถามที่พบบ่อย',
    faq: [
      ['ต้องจ่ายเงินหรือสมัคร Store ไหม?', 'ไม่ต้อง — ดาวน์โหลด APK จากหน้านี้ได้ฟรี และไม่ต้องมีบัญชี Play Store'],
      ['ติดตั้งแล้วข้อมูลจะซ้ำกับเว็บไหม?', 'ไม่ซ้ำ ใช้ฐานข้อมูลเดียวกัน — เห็นข้อมูลชุดเดียวกันทั้งเว็บและแอป'],
      ['อัปเดตแอปอย่างไร?', 'เมื่อมีเวอร์ชันใหม่ ดาวน์โหลด APK จากหน้านี้ทับของเดิมได้เลย (ข้อมูลไม่หาย)'],
      ['iPhone ใช้ได้จริงไหม?', 'ได้ — ผ่าน Safari «เพิ่มไปที่หน้าจอโฮม» ทำงานเหมือนแอป (กล้อง/แจ้งเตือน/ไอคอน)'],
    ],
    back: '← กลับหน้าแรก',
  },
  en: {
    title: '📲 Download the mobile app',
    lead: 'Agent app — 5-branch network, commission summary, and receipt capture in one place',
    leadNote: 'Sign in with the same web account (email/username + password).',
    androidTitle: '🤖 Android — install the APK',
    androidBadge: 'Recommended on Android',
    androidDesc: 'Direct install file from our system, no Play Store, no charge.',
    androidBtn: 'Download APK',
    androidMeta: `Version ${APK_VERSION} · ${APK_SIZE} · Android 7.0+`,
    androidStepsTitle: 'How to install (3 steps)',
    androidSteps: [
      'Tap “Download APK” and wait for the file to finish downloading.',
      'Open the downloaded file and allow installing from this source if asked.',
      'Tap “Install”, then open “AI Insurance Network” and sign in.',
    ],
    iosTitle: '🍎 iPhone / iPad — install via Safari',
    iosBadge: 'No IPA yet',
    iosDesc: 'Apple requires a developer account and a Mac to produce an install file — meanwhile the same app runs as a web app.',
    iosBtn: 'Open the web app (Safari)',
    iosStepsTitle: 'Add to Home Screen',
    iosSteps: [
      'Open this link in Safari (not the in-app browser of LINE/Facebook).',
      'Tap the Share ⬆️ button at the bottom.',
      'Choose “Add to Home Screen” → Add.',
      'Launch it from the icon — full screen, camera ready.',
    ],
    webTitle: '💻 On a computer',
    webDesc: 'Use the full web app — nothing to install.',
    webBtn: 'Open web app',
    joinTitle: 'No account yet?',
    joinDesc: 'Sign up free; our team activates access within one business day.',
    joinBtn: 'Go to sign-up',
    noteTitle: 'What the app does',
    features: [
      ['Home', 'Current rank, next rank target, and the receipt deadline for the period.'],
      ['5-branch network', 'Members in your lines, open slots, and condition status.'],
      ['Income', 'Verified, pending and rejected amounts with recent transactions.'],
      ['Receipts', 'Capture with the camera and upload — the system extracts receipt no. and amount.'],
      ['Security', 'Session kept in the device Keychain/Keystore; passwords are never stored.'],
    ],
    faqTitle: 'FAQ',
    faq: [
      ['Is it paid or on a store?', 'No — download the APK here for free; no Play Store account needed.'],
      ['Will it duplicate my web data?', 'No. It uses the same database — identical data on web and app.'],
      ['How do I update?', 'Download the newer APK from this page and install over the old one; data is kept.'],
      ['Does it work on iPhone?', 'Yes — via Safari “Add to Home Screen”, it behaves like an app (camera, icon, full screen).'],
    ],
    back: '← Back to home',
  },
};

type Lang = keyof typeof COPY;

export default function DownloadPage() {
  const [lang, setLang] = useState<Lang>('th');
  const [ua, setUa] = useState({ ios: false, android: false });

  useEffect(() => {
    const read = () => setLang(getLang() === 'th' ? 'th' : 'en');
    read();
    const onLang = () => read();
    window.addEventListener('app-lang-change', onLang);

    const s = navigator.userAgent || '';
    setUa({
      ios: /iPad|iPhone|iPod/.test(s) || (/Macintosh/.test(s) && 'ontouchend' in document),
      android: /Android/.test(s),
    });
    return () => window.removeEventListener('app-lang-change', onLang);
  }, []);

  const c = COPY[lang];
  const card = 'rounded-2xl border border-[#dbeafe] bg-[#f0f7ff] p-4';
  const primaryBtn =
    'block w-full rounded-xl bg-[#1d4ed8] px-4 py-3 text-center text-sm font-bold text-white shadow-sm hover:bg-[#1e40af]';
  const secondaryBtn =
    'block w-full rounded-xl border border-[#1d4ed8] bg-white px-4 py-3 text-center text-sm font-bold text-[#1d4ed8] hover:bg-[#eff6ff]';

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
        <JoinAppTabs active="download" />

        <div className="mb-4">
          <Link href="/" className="text-[11px] font-semibold text-sky-700 underline">
            {c.back}
          </Link>
          <h1 className="mt-2 text-xl font-bold text-[#334155]">{c.title}</h1>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-600">{c.lead}</p>
          <p className="mt-1 text-[11px] text-slate-500">{c.leadNote}</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {/* Android */}
          <section className={card + (ua.android ? ' ring-2 ring-[#1d4ed8]' : '')}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[#334155]">{c.androidTitle}</h2>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                {c.androidBadge}
              </span>
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-slate-600">{c.androidDesc}</p>
            <div className="mt-3">
              <a href={APK_URL} download className={primaryBtn}>
                ⬇️ {c.androidBtn}
              </a>
              <div className="mt-1.5 text-center text-[10px] text-slate-500">{c.androidMeta}</div>
              <div className="mt-1 text-center text-[10px] text-slate-500">
                เครื่องรุ่นเก่า/ติดตั้งไม่ผ่าน?{' '}
                <a href={APK_URL_ALL} download className="font-semibold text-sky-700 underline">
                  ดาวน์โหลดไฟล์รวมทุกเครื่อง (49.7 MB)
                </a>
              </div>
            </div>
            <div className="mt-3 text-[11px] font-bold text-[#334155]">{c.androidStepsTitle}</div>
            <ol className="mt-1.5 space-y-1.5">
              {c.androidSteps.map((s, i) => (
                <li key={i} className="flex gap-2 text-[11.5px] leading-relaxed text-slate-600">
                  <span className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full bg-[#1d4ed8] text-[9px] font-bold text-white">
                    {i + 1}
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </section>

          {/* iOS */}
          <section className={card + (ua.ios ? ' ring-2 ring-[#1d4ed8]' : '')}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[#334155]">{c.iosTitle}</h2>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                {c.iosBadge}
              </span>
            </div>
            <p className="mt-1 text-[11.5px] leading-relaxed text-slate-600">{c.iosDesc}</p>
            <div className="mt-3">
              <a href={WEB_APP} className={secondaryBtn}>
                {c.iosBtn}
              </a>
            </div>
            <div className="mt-3 text-[11px] font-bold text-[#334155]">{c.iosStepsTitle}</div>
            <ol className="mt-1.5 space-y-1.5">
              {c.iosSteps.map((s, i) => (
                <li key={i} className="flex gap-2 text-[11.5px] leading-relaxed text-slate-600">
                  <span className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full bg-[#475569] text-[9px] font-bold text-white">
                    {i + 1}
                  </span>
                  <span>{s}</span>
                </li>
              ))}
            </ol>
          </section>
        </div>

        {/* เว็บ + สมัคร */}
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <section className="rounded-2xl border border-[#e2e8f0] bg-white p-4">
            <h2 className="text-sm font-bold text-[#334155]">{c.webTitle}</h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-slate-600">{c.webDesc}</p>
            <div className="mt-3">
              <a href="/" className={secondaryBtn}>
                {c.webBtn}
              </a>
            </div>
          </section>
          <section className="rounded-2xl border border-[#e2e8f0] bg-white p-4">
            <h2 className="text-sm font-bold text-[#334155]">{c.joinTitle}</h2>
            <p className="mt-1 text-[11.5px] leading-relaxed text-slate-600">{c.joinDesc}</p>
            <div className="mt-3">
              <Link href="/join" className={secondaryBtn}>
                {c.joinBtn}
              </Link>
            </div>
          </section>
        </div>

        {/* ฟีเจอร์ */}
        <section className="mt-4 rounded-2xl border border-[#dbeafe] bg-white p-4">
          <h2 className="text-sm font-bold text-[#334155]">{c.noteTitle}</h2>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {c.features.map(([k, v]) => (
              <div key={k} className="rounded-xl bg-[#f8faff] px-3 py-2">
                <div className="text-[11.5px] font-bold text-[#334155]">{k}</div>
                <div className="text-[11px] leading-relaxed text-slate-600">{v}</div>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="mt-4 rounded-2xl border border-[#e2e8f0] bg-white p-4">
          <h2 className="text-sm font-bold text-[#334155]">{c.faqTitle}</h2>
          <div className="mt-2 space-y-2">
            {c.faq.map(([q, a]) => (
              <details key={q} className="rounded-xl border border-[#e2e8f0] px-3 py-2">
                <summary className="cursor-pointer text-[11.5px] font-semibold text-[#334155]">{q}</summary>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-600">{a}</p>
              </details>
            ))}
          </div>
        </section>

        <p className="mt-4 text-center text-[10px] text-slate-400">
          AI Insurance Network Tree · APK v{APK_VERSION} · ไม่เก็บรหัสผ่านในเครื่อง · ใช้บัญชีเดียวกับเว็บ
          <br />ติดตั้งจากไฟล์ตรง (sideload) — ไม่ผ่าน Play Store · อัปเดตโดยดาวน์โหลดไฟล์ใหม่ทับของเดิม
        </p>
      </main>
    </>
  );
}
