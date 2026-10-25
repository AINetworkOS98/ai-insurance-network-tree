'use client';
// InstallAppCard — ปุ่ม "ติดตั้งแอป" (PWA) สำหรับผู้สมัครใช้งานฟรี
// ใช้ได้จริง 2 ทาง:
//   • Chrome/Edge/Android: จับ event beforeinstallprompt แล้วเรียก prompt() = ติดตั้งเป็นแอปทันที
//   • iPhone/iPad (Safari): ไม่มี install prompt → แสดงวิธี แชร์ ⬆️ → เพิ่มไปที่หน้าจอโฮม
import { useEffect, useState } from 'react';

export default function InstallAppCard({ compact = false }: { compact?: boolean }) {
  const [evt, setEvt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const ua = navigator.userAgent || '';
    setIos(/iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchend' in document));
    const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches || (navigator as any).standalone === true;
    setInstalled(Boolean(standalone));

    // event ที่ PwaRegister (ระดับ layout) ดักไว้ก่อนหน้า — ใช้ได้แม้ผู้ใช้เข้าหน้านี้ทีหลัง
    const grab = () => {
      const saved = (window as any).__naviInstallPrompt;
      if (saved) setEvt(saved);
      if ((window as any).__naviInstalled) setInstalled(true);
    };
    grab();

    const onPrompt = (e: any) => { e.preventDefault(); (window as any).__naviInstallPrompt = e; setEvt(e); };
    const onInstalled = () => { setInstalled(true); setMsg('ติดตั้งแอปเรียบร้อย — เปิดจากไอคอนบนหน้าจอโฮมได้เลย'); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('navi-install-available', grab);
    window.addEventListener('navi-installed', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('navi-install-available', grab);
      window.removeEventListener('navi-installed', onInstalled);
    };
  }, []);

  async function install() {
    if (!evt) {
      setMsg(ios
        ? 'บน iPhone/iPad: กดปุ่มแชร์ ⬆️ แล้วเลือก “เพิ่มไปที่หน้าจอโฮม”'
        : 'เบราว์เซอร์นี้ยังไม่เปิดปุ่มติดตั้ง — ใช้เมนู ⋮ → “ติดตั้งแอป/เพิ่มลงในหน้าจอหลัก”');
      return;
    }
    try {
      await evt.prompt();
      const choice = await evt.userChoice;
      setMsg(choice?.outcome === 'accepted' ? 'กำลังติดตั้งแอป…' : 'ยกเลิกการติดตั้ง');
      if (choice?.outcome === 'accepted') setInstalled(true);
      setEvt(null);
    } catch {
      setMsg('ติดตั้งอัตโนมัติไม่ได้ — ใช้เมนู ⋮ → “เพิ่มลงในหน้าจอหลัก”');
    }
  }

  if (compact) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900">
        <div className="flex flex-wrap items-center gap-2">
          <b>📲 ใช้งานเป็นแอปได้ (ฟรี)</b>
          <button type="button" onClick={install} disabled={installed}
            className="rounded-full bg-emerald-700 px-3 py-1 font-bold text-white disabled:opacity-50">
            {installed ? 'ติดตั้งแล้ว ✓' : 'ติดตั้งแอป'}
          </button>
          {ios && !installed && <span className="text-[10px] text-emerald-800">iPhone/iPad: แชร์ ⬆️ → เพิ่มไปที่หน้าจอโฮม</span>}
        </div>
        {msg && <div className="mt-1 text-[10px]">{msg}</div>}
      </div>
    );
  }

  return (
    <div className="card border-l-4 border-emerald-500 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-[#475569]">📲 สมัครฟรีแล้วติดตั้งเป็นแอปได้ทันที</div>
          <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
            เปิดจากไอคอนบนมือถือ (ไม่ต้องผ่าน LINE) — กล้องเปิดได้เต็มจอ, สแกนใบเสร็จเร็วขึ้น,
            มีทางลัดไปหน้าเครื่องคำนวณเบี้ย/ภาษี · ไม่มีค่าใช้จ่าย ไม่มีโฆษณาแทรก
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button type="button" onClick={install} disabled={installed}
            className="rounded-full bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">
            {installed ? 'ติดตั้งแล้ว ✓' : 'ติดตั้งแอป (ฟรี)'}
          </button>
          <span className="text-[10px] text-slate-400">Android/Chrome: ติดตั้งในคลิกเดียว · iPhone: แชร์ ⬆️ → เพิ่มไปที่หน้าจอโฮม</span>
        </div>
      </div>
      {msg && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">{msg}</p>}
    </div>
  );
}
