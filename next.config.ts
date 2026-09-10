import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // tsconfig `paths` (`@/*` → `./src/*`) ใช้ alias อัตโนมัติ ไม่ต้องมี webpack config
  turbopack: {},
};

export default nextConfig;
