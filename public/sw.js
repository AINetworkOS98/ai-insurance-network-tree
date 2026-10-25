// sw.js — service worker สำหรับให้เว็บ "ติดตั้งเป็นแอป" ได้ (PWA)
// ⚠️ ตั้งใจไม่แคชหน้าเว็บ/API: ระบบนี้ข้อมูลเปลี่ยนบ่อย (ใบเสร็จ/ผู้สนใจ) — แคชแล้วผู้ใช้จะเห็นข้อมูลเก่า
//    สิ่งเดียวที่แคชคือ /offline.html (หน้าข้อความล้วน) ใช้เฉพาะตอนเน็ตหลุด จะได้ไม่เจอหน้าม้าสีเทาของเบราว์เซอร์
const VERSION = 'navi-sw-v2';
const OFFLINE_URL = '/offline.html';
const OFFLINE_CACHE = 'navi-offline-v2';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    try {
      const cache = await caches.open(OFFLINE_CACHE);
      await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }));
    } catch {
      // เน็ตหลุดตอนติดตั้ง — ข้ามได้ ไม่บล็อกการติดตั้งแอป
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // ล้าง cache รุ่นเก่า (เหลือเฉพาะ offline)
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== OFFLINE_CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // network-only โดยเจตนา: คำขอที่ไม่ใช่ "เปิดหน้าเว็บ" ปล่อยให้เบราว์เซอร์โหลดจากเครือข่ายตามปกติ
  if (req.mode !== 'navigate') return;
  // เฉพาะการเปิดหน้า และเฉพาะตอนเน็ตหลุด → ค่อยใช้หน้า offline
  event.respondWith((async () => {
    try {
      return await fetch(req);
    } catch {
      const cached = await caches.match(OFFLINE_URL);
      return cached || new Response('ไม่มีการเชื่อมต่ออินเทอร์เน็ต', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }
  })());
});

self.addEventListener('message', (event) => {
  if (event?.data?.type === 'version') {
    event.source?.postMessage?.({ type: 'version', version: VERSION });
  }
});
