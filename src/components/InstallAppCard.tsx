'use client';
// InstallAppCard — ปุ่ม "ติดตั้งแอป" (PWA) สำหรับสมาชิก / Install-the-app (PWA) button
// ใช้ได้จริง 2 ทาง:
//   • Chrome/Edge/Android: จับ event beforeinstallprompt แล้วเรียก prompt() = ติดตั้งเป็นแอปทันที
//   • iPhone/iPad (Safari): ไม่มี install prompt → แสดงวิธี แชร์ ⬆️ → เพิ่มไปที่หน้าจอโฮม
// 🌐 สากล: ไทย / อังกฤษ (ภาษาอื่นใช้ภาษาอังกฤษ) ตามเมนูภาษาเดิม (getLang + 'app-lang-change')
import { useEffect, useState } from 'react';
import { getLang } from '@/i18n';

type Choice = { outcome: string };

export default function InstallAppCard({ compact = false }: { compact?: boolean }) {
  const [evt, setEvt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [en, setEn] = useState(false);
  const [msg, setMsg] = useState('');

  // ข้อความ 2 ภาษา: t('ไทย', 'English')
  const t = (th: string, e: string) => (en ? e : th);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // ภาษา (ไทย = ไทย · อื่น ๆ = อังกฤษ)
    const readLang = () => setEn(getLang() !== 'th');
    readLang();
    window.addEventListener('app-lang-change', readLang);

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
    const onInstalled = () => {
      setInstalled(true);
      setMsg(getLang() !== 'th' ? 'App installed — open it from the icon on your home screen.' : 'ติดตั้งแอปเรียบร้อย — เปิดจากไอคอนบนหน้าจอโฮมได้เลย');
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('navi-install-available', grab);
    window.addEventListener('navi-installed', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('navi-install-available', grab);
      window.removeEventListener('navi-installed', onInstalled);
      window.removeEventListener('app-lang-change', readLang);
    };
  }, []);

  async function install() {
    if (!evt) {
      setMsg(ios
        ? t('บน iPhone/iPad: กดปุ่มแชร์ ⬆️ แล้วเลือก “เพิ่มไปที่หน้าจอโฮม”', 'On iPhone/iPad: tap Share ⬆️ then “Add to Home Screen”.')
        : t('เบราว์เซอร์นี้ยังไม่เปิดปุ่มติดตั้ง — ใช้เมนู ⋮ → “ติดตั้งแอป/เพิ่มลงในหน้าจอหลัก”', 'This browser has not offered the install button — use ⋮ → “Install app / Add to Home screen”.'));
      return;
    }
    try {
      await evt.prompt();
      const choice: Choice = await evt.userChoice;
      setMsg(choice?.outcome === 'accepted'
        ? t('กำลังติดตั้งแอป…', 'Installing…')
        : t('ยกเลิกการติดตั้ง', 'Install cancelled'));
      if (choice?.outcome === 'accepted') setInstalled(true);
      setEvt(null);
    } catch {
      setMsg(t('ติดตั้งอัตโนมัติไม่ได้ — ใช้เมนู ⋮ → “เพิ่มลงในหน้าจอหลัก”', 'Automatic install failed — use ⋮ → “Add to Home screen”.'));
    }
  }

  if (compact) {
    return (
      <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900">
        <div className="flex flex-wrap items-center gap-2">
          <b>{t('📲 ใช้งานเป็นแอปได้ (ฟรี)', '📲 Use it as an app (free)')}</b>
          <button type="button" onClick={install} disabled={installed}
            className="rounded-full bg-emerald-700 px-3 py-1 font-bold text-white disabled:opacity-50">
            {installed ? t('ติดตั้งแล้ว ✓', 'Installed ✓') : t('ติดตั้งแอป', 'Install app')}
          </button>
          {ios && !installed && <span className="text-[10px] text-emerald-800">{t('iPhone/iPad: แชร์ ⬆️ → เพิ่มไปที่หน้าจอโฮม', 'iPhone/iPad: Share ⬆️ → Add to Home Screen')}</span>}
        </div>
        {msg && <div className="mt-1 text-[10px]">{msg}</div>}
      </div>
    );
  }

  return (
    <div className="card border-l-4 border-emerald-500 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-[#475569]">{t('📲 สมัครฟรีแล้วติดตั้งเป็นแอปได้ทันที', '📲 Install it as an app right away')}</div>
          <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
            {t('เปิดจากไอคอนบนมือถือ (ไม่ต้องผ่าน LINE) — กล้องเปิดได้เต็มจอ, สแกนใบเสร็จเร็วขึ้น, มีทางลัดไปหน้าเครื่องคำนวณเบี้ย/ภาษี · ไม่มีค่าใช้จ่าย ไม่มีโฆษณาแทรก',
              'Open from the icon on your phone (no LINE needed) — full-screen camera, faster receipt scanning, shortcuts to the premium and tax calculators · free, no ads')}
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <button type="button" onClick={install} disabled={installed}
            className="rounded-full bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white disabled:opacity-50">
            {installed ? t('ติดตั้งแล้ว ✓', 'Installed ✓') : t('ติดตั้งแอป (ฟรี)', 'Install app (free)')}
          </button>
          <span className="text-[10px] text-slate-400">
            {t('Android/Chrome: ติดตั้งในคลิกเดียว · iPhone: แชร์ ⬆️ → เพิ่มไปที่หน้าจอโฮม', 'Android/Chrome: one tap · iPhone: Share ⬆️ → Add to Home Screen')}
          </span>
        </div>
      </div>
      {msg && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-800">{msg}</p>}
    </div>
  );
}
