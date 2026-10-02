'use client';

/**
 * UtmCapture — เก็บที่มาแคมเปญ (UTM / ttclid) ลง sessionStorage ตั้งแต่เปิดหน้าแรก
 * ------------------------------------------------------------------
 * • ทำงานทุกหน้า (รวมหน้าแรก) โดยไม่แสดงผลใด ๆ
 * • ใช้คีย์เดียวกัน (aintree_utm) กับฟอร์มลีด เพื่อให้ตอนส่งฟอร์มแนบที่มาไปได้
 * • ทำงานฝั่งเบราว์เซอร์เท่านั้น (useEffect) — ไม่กระทบการเรนเดอร์ฝั่งเซิร์ฟเวอร์
 */

import { useEffect } from 'react';
import { captureUtm } from '@/lib/utm';

export default function UtmCapture() {
  useEffect(() => {
    captureUtm();
  }, []);
  return null;
}
