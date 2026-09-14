import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // tsconfig `paths` (`@/*` → `./src/*`) ใช้ alias อัตโนมัติ ไม่ต้องมี webpack config
  turbopack: {},
  // firebase-admin ใช้ require() กับ ESM-only deps (jose) — ต้องโหลดเป็น external บน server
  serverExternalPackages: ['firebase-admin'],
};

export default nextConfig;
