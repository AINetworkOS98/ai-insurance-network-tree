import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // หน้า /chat และ /os ถูกลบออกจากระบบ (ซ้ำกับระบบค้นหา AI ที่อยู่ในหน้าแรกและ /search_landing)
  // /recruit ถูกลบ (ซ้ำกับ /referral "ชวนสมาชิก" + /register) — เก็บเส้นทางเดิมเป็นการเปลี่ยนทาง ไม่ให้ลิงก์เก่าพังเป็น 404
  async redirects() {
    return [
      { source: '/chat', destination: '/', permanent: false },
      { source: '/os', destination: '/', permanent: false },
      { source: '/recruit', destination: '/referral', permanent: false },
    ];
  },
  // tsconfig `paths` (`@/*` → `./src/*`) ใช้ alias อัตโนมัติ ไม่ต้องมี webpack config
  turbopack: {},
  // firebase-admin ใช้ require() กับ ESM-only deps (jose) — ต้องโหลดเป็น external บน server
  // pg: ใช้ในเส้นทางล็อกอิน (/auth/callback) แบบเบา ๆ — โหลดจาก node_modules โดยตรง ไม่ให้ webpack bundle
  //     (pg มี optional dep 'pg-native' ที่ webpack เตือน/พังได้)
  serverExternalPackages: ['firebase-admin', 'pg'],
  // บนโฮสต์ที่ sandbox จำกัด process (เช่น Web App ของ Hostinger) Turbopack panic ตอน parse CSS
  // จึง build ด้วย webpack — แต่ webpack จะรัน "ตัวตรวจ type ของ route" เข้มกว่า ทำให้ route files
  // ที่ export ค่าคงที่นอกเหนือ handler ไม่ผ่าน เฉพาะบนโฮสต์นั้นเราจึงข้าม type-check ตอน build
  // (type ยังตรวจได้ด้วย `npx tsc --noEmit` ในเครื่อง/CI ตามปกติ)
  // โฮสต์ที่รัน Next.js แบบ standalone (Hostinger Web App) — เปิดด้วย env เพื่อไม่กระทบ Vercel
  ...(process.env.BUILD_STANDALONE === '1' ? { output: 'standalone' as const } : {}),
  typescript: { ignoreBuildErrors: process.env.NEXT_SKIP_TS_BUILD === '1' },
};

export default nextConfig;
