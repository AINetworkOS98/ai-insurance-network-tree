'use client';
// LiveStamp — แสดงวัน/เวลาปัจจุบันของไทย (เดินจริง อัปเดตทุกวินาที)
//
// ⚠ บทเรียนจากของจริง: หน้าที่ถูก prerender/cache ที่ CDN (เช่นหน้าแรก) จะ "ฝัง" เวลาที่
//   render ไว้ใน HTML — เปิดดูซ้ำอีกชั่วโมงต่อมาก็ยังเห็นเวลาเดิม (05:01 ค้างอยู่ทั้งที่จริง 06:15)
//   ดังนั้นห้ามโชว์ค่าที่ฝังมากับ HTML: ก่อน hydrate ให้แสดงข้อความกลาง ๆ แล้วแทนด้วย
//   เวลาจริงของเครื่องผู้ใช้ทันทีที่ mount + เดินต่อทุกวินาที และซิงค์ใหม่เมื่อกลับมาโฟกัสแท็บ
import { useEffect, useState } from 'react';
import { thaiDateFull, thaiDayName, thaiTime, thaiDateTimeFull } from '@/lib/now';

/** เวลาปัจจุบันที่เดินจริง (คืน null ก่อน hydrate) — อัปเดตทุก intervalMs + ซิงค์เมื่อกลับมาโฟกัสแท็บ */
export function useNow(intervalMs = 1000): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const t = setInterval(tick, intervalMs);
    const resync = () => { if (document.visibilityState !== 'hidden') tick(); };
    document.addEventListener('visibilitychange', resync);
    window.addEventListener('focus', resync);
    window.addEventListener('pageshow', resync);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', resync);
      window.removeEventListener('focus', resync);
      window.removeEventListener('pageshow', resync);
    };
  }, [intervalMs]);
  return now;
}

export function LiveStamp({ className = '', showDay = true }: { className?: string; showDay?: boolean }) {
  const now = useNow(1000);
  if (!now) {
    // ยังไม่ hydrate — ห้ามแสดงเวลาที่ฝังมากับ HTML (จะค้างเพราะหน้าเว็บถูก cache)
    return (
      <span className={className} suppressHydrationWarning title="เวลาปัจจุบัน (เขตเวลาไทย UTC+7)">
        🕒 กำลังอ่านเวลาปัจจุบัน (เขตเวลาไทย)…
      </span>
    );
  }
  return (
    <span className={className} suppressHydrationWarning title="เวลาปัจจุบัน (เขตเวลาไทย UTC+7)">
      🕒 ข้อมูล ณ {thaiDateFull(now)}{showDay ? ` (วัน${thaiDayName(now)})` : ''} เวลา {thaiTime(now)} น.
    </span>
  );
}

/** © <ปี ค.ศ. ปัจจุบัน> — คิดฝั่งผู้ใช้ ไม่ให้ปีค้างจาก HTML ที่ cache ไว้ */
export function CeYear({ className = '' }: { className?: string }) {
  const now = useNow(60 * 1000);
  return <span className={className} suppressHydrationWarning>{now ? now.getFullYear() : ''}</span>;
}

/** วันที่ปัจจุบันแบบเต็ม เช่น "ปรับปรุงล่าสุด: 12 ตุลาคม 2569" */
export function CurrentDateTh({ prefix = '', suffix = '' }: { prefix?: string; suffix?: string }) {
  const now = useNow(60 * 1000);
  return <span suppressHydrationWarning>{prefix}{now ? thaiDateFull(now) : '…'}{suffix}</span>;
}

export { thaiDateTimeFull };
