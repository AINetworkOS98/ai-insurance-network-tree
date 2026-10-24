'use client';
// PwaRegister — ลงทะเบียน service worker ให้เว็บติดตั้งเป็นแอปได้ (PWA)
// ไม่แคชข้อมูล: ตัว SW เป็น network-only เพื่อไม่ให้ผู้ใช้เห็นใบเสร็จ/ผู้สนใจข้อมูลเก่า
import { useEffect } from 'react';

export default function PwaRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => null);
    };
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });
  }, []);
  return null;
}
