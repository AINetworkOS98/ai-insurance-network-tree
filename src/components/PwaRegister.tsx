'use client';
// PwaRegister — ลงทะเบียน service worker + ดัก beforeinstallprompt "ตั้งแต่ต้น" ให้ทุกหน้า
// ทำไม: เบราว์เซอร์ยิง beforeinstallprompt ครั้งเดียวต่อการโหลดหน้า — ถ้าดักเฉพาะหน้า /join
// ผู้ใช้ที่เข้าหน้าอื่นก่อนแล้วค่อยไป /join จะไม่ได้ปุ่มติดตั้ง (event หายไปแล้ว)
// วิธีแก้: เก็บ event ไว้ที่ window.__naviInstallPrompt + ยิง event 'navi-install-available'
// ไม่แคชข้อมูลธุรกิจ: SW เป็น network-only (+ offline.html เฉพาะตอนเน็ตหลุด)
import { useEffect } from 'react';

type BipEvent = Event & { prompt?: () => Promise<void>; userChoice?: Promise<{ outcome: string }> };

declare global {
  interface Window {
    __naviInstallPrompt?: BipEvent | null;
    __naviInstalled?: boolean;
  }
}

export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 1) ดักจับก่อนที่ปุ่มในหน้าจะ mount
    const onPrompt = (e: Event) => {
      e.preventDefault();
      window.__naviInstallPrompt = e as BipEvent;
      try { window.dispatchEvent(new CustomEvent('navi-install-available')); } catch { /* noop */ }
    };
    const onInstalled = () => {
      window.__naviInstalled = true;
      window.__naviInstallPrompt = null;
      try { window.dispatchEvent(new CustomEvent('navi-installed')); } catch { /* noop */ }
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);

    // 2) ลงทะเบียน service worker (ทำให้ "ติดตั้งเป็นแอป" ได้)
    if ('serviceWorker' in navigator) {
      const register = () => { navigator.serviceWorker.register('/sw.js').catch(() => null); };
      if (document.readyState === 'complete') register();
      else window.addEventListener('load', register, { once: true });
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  return null;
}
