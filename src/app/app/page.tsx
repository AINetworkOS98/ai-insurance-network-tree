'use client';
// /app — หน้า "ติดตั้งแอป" สำหรับสมาชิก (PWA: ไม่ต้องโหลดจาก App Store / ไม่มีไฟล์ APK)
// ใช้ส่งลิงก์นี้ให้สมาชิกใน LINE: เปิด → กดปุ่มติดตั้ง → ได้ไอคอนบนหน้าจอโฮม → กล้องเต็มจอ
import { useEffect, useState } from 'react';
import Link from 'next/link';
import InstallAppCard from '@/components/InstallAppCard';

const SITE = 'https://ai-insurance-network-tree.vercel.app';

export default function InstallAppPage() {
  const [qr, setQr] = useState('');
  const [ua, setUa] = useState({ ios: false, android: false, standalone: false });

  useEffect(() => {
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
    return () => { alive = false; };
  }, []);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      {/* หัวเรื่อง */}
      <div className="mb-5">
        <Link href="/" className="text-[11px] font-semibold text-sky-700 underline">← กลับหน้าแรก</Link>
        <h1 className="mt-2 text-xl font-bold text-[#475569]">📲 ติดตั้งแอปสำหรับสมาชิก (ฟรี)</h1>
        <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
          ระบบนี้เป็น “เว็บแอป” (PWA) — <b>ไม่ต้องโหลดจาก App Store/Play Store และไม่มีไฟล์ APK</b>
          เปิดลิงก์นี้ในมือถือแล้วกดปุ่มติดตั้ง จะได้ไอคอนบนหน้าจอโฮม เปิดมาแล้วเป็นแอปเต็มจอ กล้องเปิดได้ทันที
        </p>
      </div>

      {/* ปุ่มติดตั้ง (จับ beforeinstallprompt ที่ระดับ layout) */}
      {ua.standalone ? (
        <div className="card border-l-4 border-emerald-500 p-4">
          <div className="text-sm font-bold text-emerald-800">ติดตั้งแล้ว ✓</div>
          <div className="mt-1 text-[11px] text-slate-500">
            คุณกำลังเปิดจากไอคอนแอป — ไม่ต้องติดตั้งซ้ำ ปิดหน้านี้แล้วใช้งานได้เลย
          </div>
        </div>
      ) : (
        <InstallAppCard />
      )}

      {/* วิธีติดตั้ง แยกตามเครื่อง */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className={`card p-4 ${ua.android ? 'border-l-4 border-sky-500' : ''}`}>
          <div className="text-sm font-bold text-[#475569]">🤖 Android (Chrome / Edge)</div>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[11px] leading-relaxed text-slate-600">
            <li>กดปุ่ม <b>ติดตั้งแอป</b> ด้านบน → ยืนยัน “ติดตั้ง”</li>
            <li>ถ้าไม่เห็นปุ่ม: กดเมนู <b>⋮</b> มุมขวา → <b>ติดตั้งแอป</b> หรือ <b>เพิ่มลงในหน้าจอหลัก</b></li>
            <li>เปิดจากไอคอน “สแกนใบเสร็จ” บนหน้าจอโฮมได้เลย</li>
          </ol>
        </div>
        <div className={`card p-4 ${ua.ios ? 'border-l-4 border-sky-500' : ''}`}>
          <div className="text-sm font-bold text-[#475569]">🍎 iPhone / iPad (Safari)</div>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-[11px] leading-relaxed text-slate-600">
            <li>เปิดหน้านี้ด้วย <b>Safari</b> (ไม่ใช่ LINE/Facebook ในแอป)</li>
            <li>กดปุ่ม <b>แชร์ ⬆️</b> ด้านล่างจอ</li>
            <li>เลือก <b>“เพิ่มไปที่หน้าจอโฮม”</b> → <b>เพิ่ม</b></li>
          </ol>
          <div className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[10px] leading-relaxed text-amber-800">
            ⚠️ บน iPhone/iPad ต้องเปิดใน Safari — เปิดจากใน LINE กล้องจะถูกบล็อกและไม่มีเมนูติดตั้ง
          </div>
        </div>
      </div>

      {/* QR สำหรับส่งให้สมาชิกคนอื่น */}
      <div className="card mt-4 p-4">
        <div className="text-sm font-bold text-[#475569]">🔗 ส่งต่อให้สมาชิกในทีม</div>
        <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          {qr
            ? <img src={qr} alt="QR ลิงก์ติดตั้งแอป" width={160} height={160} className="rounded-xl border" />
            : <div className="h-[160px] w-[160px] animate-pulse rounded-xl bg-slate-100" />}
          <div className="min-w-0 text-[11px] leading-relaxed text-slate-600">
            <div>สแกน QR ด้วยกล้องมือถือ หรือส่งลิงก์นี้ใน LINE:</div>
            <div className="mt-1 break-all rounded-lg bg-slate-50 px-2 py-1.5 font-mono text-[10px] text-slate-700">{SITE}/app</div>
            <div className="mt-2">สมาชิกใหม่ที่ยังไม่มีบัญชี: สมัครฟรีก่อนที่{' '}
              <Link href="/join" className="font-semibold text-sky-700 underline">หน้า /join</Link> แล้วค่อยติดตั้ง
            </div>
          </div>
        </div>
      </div>

      {/* คำถามที่เจอบ่อย */}
      <div className="card mt-4 p-4">
        <div className="text-sm font-bold text-[#475569]">คำถามที่พบบ่อย</div>
        <dl className="mt-2 space-y-2 text-[11px] leading-relaxed text-slate-600">
          <div>
            <dt className="font-semibold text-slate-700">ต้องโหลดไฟล์ .apk หรือซื้อแอปจาก Store ไหม?</dt>
            <dd>ไม่ต้อง — ติดตั้งจากเว็บนี้โดยตรง ฟรี ไม่มีค่าใช้จ่าย และไม่ต้องอัปเดตเอง (อัปเดตอัตโนมัติเมื่อเปิดแอป)</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-700">ไอคอนขึ้นเป็นภาพหน้าจอ ไม่ใช่โลโก้?</dt>
            <dd>เกิดกับเครื่องที่ติดตั้งไว้ก่อนอัปเดตไอคอน — ลบไอคอนเดิมออกแล้วติดตั้งใหม่</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-700">เปิดแอปแล้วเจอหน้าเข้าสู่ระบบ?</dt>
            <dd>ล็อกอินครั้งเดียว ระบบจะพากลับไปหน้าเดิม (เช่น หน้าสแกนใบเสร็จ) ให้อัตโนมัติ</dd>
          </div>
          <div>
            <dt className="font-semibold text-slate-700">อินเทอร์เน็ตหลุด?</dt>
            <dd>แอปจะแสดงหน้าแจ้งเตือนให้ต่อเน็ตก่อน — ข้อมูลใบเสร็จ/ผู้สนใจไม่ถูกเก็บไว้ในเครื่อง</dd>
          </div>
        </dl>
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Link href="/join" className="rounded-full bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white">สมัครใช้งานฟรี</Link>
        <Link href="/documents?m=1&cam=1" className="rounded-full border px-5 py-2.5 text-xs font-semibold text-slate-700">ไปหน้าสแกนใบเสร็จ</Link>
        <Link href="/login" className="rounded-full border px-5 py-2.5 text-xs font-semibold text-slate-700">เข้าสู่ระบบ</Link>
      </div>
    </main>
  );
}
