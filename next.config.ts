import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // หน้า /chat และ /os ถูกลบออกจากระบบ (ซ้ำกับระบบค้นหา AI ที่อยู่ในหน้าแรกและ /search_landing)
  // เก็บเส้นทางเดิมไว้เป็นการเปลี่ยนทาง เพื่อไม่ให้ลิงก์เก่า/บุ๊กมาร์กพังเป็น 404
  async redirects() {
    return [
      { source: '/chat', destination: '/', permanent: false },
      { source: '/os', destination: '/', permanent: false },
    ];
  },
  // tsconfig `paths` (`@/*` → `./src/*`) ใช้ alias อัตโนมัติ ไม่ต้องมี webpack config
  turbopack: {},
  // firebase-admin ใช้ require() กับ ESM-only deps (jose) — ต้องโหลดเป็น external บน server
  serverExternalPackages: ['firebase-admin'],
};

export default nextConfig;
