'use client';

import { useEffect, useState } from 'react';

export default function VisitorCounter() {
  const [count, setCount] = useState<number>(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // เรียก API เพื่อดึงจำนวนปัจจุบัน + บวก 1 (ครั้งแรกเมื่อโหลด)
    fetch('/api/visitor', { method: 'POST' })
      .then((res) => res.json())
      .then((data) => setCount(data.count))
      .catch(() => {});
  }, []);

  if (!mounted) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 py-2.5 px-4 text-center text-xs text-slate-500 z-50"
      style={{ fontFamily: "'Sarabun','Noto Sans Thai',sans-serif" }}
    >
      <span className="font-medium text-slate-700">
        ผู้เยี่ยมชมทั้งหมด:{' '}
        <span className="text-sky-600 font-semibold">{count.toLocaleString()}</span>{' '}
        ครั้ง
      </span>
    </div>
  );
}
