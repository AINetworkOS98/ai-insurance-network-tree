'use client';

import { useEffect, useState } from 'react';

/**
 * VisitorCounter — แถบล่างติดจอ แสดง "สมาชิกทั้งหมด" + "ผู้เยี่ยมชมทั้งหมด" ตลอดเวลา
 * - ตัวเลขสมาชิกดึงจาก /api/members/count (สาธารณะ, ไม่มีข้อมูลส่วนบุคคล)
 * - ตัวเลขผู้เยี่ยมชมจาก /api/visitor (นับ +1 ต่อการเปิดหน้า 1 ครั้ง)
 * - คุมความสูงให้คงที่ 1 บรรทัด (nowrap) เพื่อไม่ให้ทับปุ่มเมนูลอยที่ยกไว้ bottom-14
 */
export default function VisitorCounter() {
  const [visits, setVisits] = useState<number | null>(null);
  const [members, setMembers] = useState<{ total: number; active: number; withRank: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // ผู้เยี่ยมชม: นับครั้งนี้ด้วย
    fetch('/api/visitor', { method: 'POST' })
      .then((res) => res.json())
      .then((data) => setVisits(Number(data?.count) || 0))
      .catch(() => {});
    // สมาชิก: ตัวเลขสรุปเท่านั้น ไม่มีข้อมูลรายคน
    fetch('/api/members/count', { cache: 'no-store' })
      .then((res) => res.json())
      .then((j) => {
        if (j?.ok) setMembers({ total: Number(j.total) || 0, active: Number(j.active) || 0, withRank: Number(j.withRank) || 0 });
      })
      .catch(() => {});
  }, []);

  if (!mounted) return null;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur border-t border-slate-200 py-2.5 px-3 text-center text-[10px] sm:text-xs text-slate-500 z-50 overflow-hidden"
      style={{ fontFamily: "'Sarabun','Noto Sans Thai',sans-serif" }}
    >
      <div className="flex items-center justify-center whitespace-nowrap">
        <span className="font-medium text-slate-700">
          👥 สมาชิกทั้งหมด:{' '}
          <span className="font-semibold text-[#0b1b33]">{members ? members.total.toLocaleString() : '—'}</span> คน
        </span>
        {members && (
          <span className="ml-1 hidden text-slate-400 sm:inline">
            {' '}(ใช้งานอยู่ <span className="font-semibold text-emerald-600">{members.active.toLocaleString()}</span>
            {' '}· มีระดับตำแหน่ง <span className="font-semibold text-[#c8a84e]">{members.withRank.toLocaleString()}</span>)
          </span>
        )}
        <span className="mx-1.5 text-slate-300">·</span>
        <span className="font-medium text-slate-700">
          ผู้เยี่ยมชมทั้งหมด:{' '}
          <span className="font-semibold text-sky-600">{visits !== null ? visits.toLocaleString() : '—'}</span> ครั้ง
        </span>
      </div>
    </div>
  );
}
