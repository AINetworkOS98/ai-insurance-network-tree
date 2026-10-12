'use client';
// LiveStamp — แสดงวัน/เวลาปัจจุบันของไทย (เดินจริง อัปเดตทุก 30 วินาที)
// ฝังที่หัวหน้าแรก/หน้าที่ต้องการบอกว่า "ข้อมูล ณ เวลานี้" เป็นปัจจุบัน
import { useEffect, useState } from 'react';
import { thaiDateFull, thaiDayName, thaiTime, thaiDateTimeFull } from '@/lib/now';

export function LiveStamp({ className = '', showDay = true }: { className?: string; showDay?: boolean }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const t = setInterval(() => setNow(new Date()), 30 * 1000);
    return () => clearInterval(t);
  }, []);
  // ก่อน mount ให้คำนวณจากฝั่งเซิร์ฟเวอร์ไปก่อน (ค่าเดียวกันเพราะใช้เขตเวลาไทยทั้งสองฝั่ง)
  const d = now || new Date();
  return (
    <span className={className} suppressHydrationWarning title="เวลาปัจจุบัน (เขตเวลาไทย UTC+7)">
      🕒 ข้อมูล ณ {thaiDateFull(d)}{showDay ? ` (วัน${thaiDayName(d)})` : ''} เวลา {thaiTime(d)} น.
    </span>
  );
}

/** © <ปี ค.ศ. ปัจจุบัน> */
export function CeYear({ className = '' }: { className?: string }) {
  const [y, setY] = useState<number>(new Date().getFullYear());
  useEffect(() => { setY(new Date().getFullYear()); }, []);
  return <span className={className} suppressHydrationWarning>{y}</span>;
}

/** วันที่ปัจจุบันแบบเต็ม เช่น "ปรับปรุงล่าสุด: 12 ตุลาคม 2569" */
export function CurrentDateTh({ prefix = '', suffix = '' }: { prefix?: string; suffix?: string }) {
  const [d, setD] = useState<Date>(new Date());
  useEffect(() => { setD(new Date()); }, []);
  return <span suppressHydrationWarning>{prefix}{thaiDateFull(d)}{suffix}</span>;
}

export { thaiDateTimeFull };
