import type { MetadataRoute } from 'next';

// PWA สำหรับสแกนใบเสร็จ — ติดตั้งบนมือถือแล้วเปิดกล้องได้ทันที (standalone = ไม่ผ่าน LINE/URL bar)
export default function manifest(): MetadataRoute.Manifest {
  return {
    // id = ตัวตนของแอป (ถ้าเปลี่ยน start_url ภายหลัง Chrome จะไม่มองเป็นแอปใหม่)
    id: '/',
    name: 'NAVI Agent — AI Insurance Network',
    short_name: 'NAVI Agent',
    description: 'NAVI Agent — AI-assisted insurance agency toolkit: scan receipts, track prospects and members, calculate premiums and tax. ระบบบริหารเครือข่ายตัวแทน + สแกนใบเสร็จด้วย AI',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#475569',
    lang: 'th',
    // ทางลัดเมื่อกดค้างที่ไอคอนแอป (Android/Chrome)
    shortcuts: [
      { name: 'ติดตั้งแอป (วิธีติดตั้ง)', short_name: 'ติดตั้งแอป', url: '/app', description: 'วิธีติดตั้งแอปบน Android/iPhone' },
      { name: 'สมัครใช้งานฟรี', short_name: 'สมัครฟรี', url: '/join', description: 'สมัครเข้าใช้ระบบฟรี' },
      { name: 'สแกน/อัปโหลดใบเสร็จ', short_name: 'สแกนใบเสร็จ', url: '/documents?m=1&cam=1' },
      { name: 'คำนวณเบี้ยประกัน', short_name: 'คำนวณเบี้ย', url: '/apply' },
      { name: 'คำนวณภาษี', short_name: 'ภาษี', url: '/prospects?tab=pit' },
    ],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
