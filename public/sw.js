// sw.js — service worker ขั้นต่ำเพื่อให้เว็บ "ติดตั้งเป็นแอป" ได้ (PWA)
// ⚠️ ตั้งใจไม่แคชหน้าเว็บ/API: ระบบนี้ข้อมูลเปลี่ยนบ่อย (ใบเสร็จ/ผู้สนใจ) — แคชแล้วผู้ใช้จะเห็นข้อมูลเก่า
//    ตัวฟังก์ชัน fetch ที่มีอยู่มีไว้ให้เบราว์เซอร์ถือว่าแอปติดตั้งได้ และปล่อยทุกคำขอไป network ตามปกติ
const VERSION = 'navi-sw-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // network-only โดยเจตนา (ไม่ respondWith = ปล่อยให้เบราว์เซอร์จัดการตามปกติ)
  void event.request;
});

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'version') {
    event.source?.postMessage?.({ type: 'version', version: VERSION });
  }
});
