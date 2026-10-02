'use client';

import { useEffect, useState } from 'react';

/**
 * DeniedPath — โชว์หน้าที่ผู้ใช้พยายามเข้าจริง ๆ
 * middleware ใช้ rewrite (ไม่เปลี่ยน URL) → location.pathname จึงยังเป็นหน้าต้นทาง
 * และปุ่มออกจากระบบ (ใช้เมื่อเพิ่งได้สิทธิ์ใหม่แต่ token ยังเก่า)
 */
export default function DeniedPath() {
  const [path, setPath] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setPath(window.location.pathname + window.location.search);
  }, []);

  const logout = async () => {
    setBusy(true);
    try { await fetch('/api/auth/logout', { method: 'POST' }); } catch {}
    window.location.href = '/admin';
  };

  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-left">
      <div className="text-[11px] text-slate-500">หน้าที่คุณพยายามเข้า</div>
      <div className="mt-0.5 break-all font-mono text-xs font-semibold text-slate-700">{path || '—'}</div>
      <button
        onClick={logout}
        disabled={busy}
        className="mt-3 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
      >
        {busy ? 'กำลังออกจากระบบ…' : 'ออกจากระบบแล้วเข้าใหม่ (อัปเดตสิทธิ์)'}
      </button>
    </div>
  );
}
