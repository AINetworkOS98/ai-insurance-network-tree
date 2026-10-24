'use client';
// ProspectCodeLookup — การ์ดสำหรับลิงก์รหัสผู้สนใจแบบสั้น เช่น /P-0URWO6
// middleware rewrite มาที่ /prospects?tab=members&code=P-0URWO6 แล้วการ์ดนี้จะค้นให้เห็นว่าเป็นใคร
// (เดิมลิงก์จากแจ้งเตือนต่อเป็น /P-0URWO6 ตรง ๆ แล้ว 404)
import { useEffect, useState } from 'react';

type Hit = {
  prospectId?: string; prospectCode?: string; name?: string; firstName?: string; lastName?: string;
  phone?: string; email?: string; status?: string; createdAt?: string; source?: string; score?: number;
};

export default function ProspectCodeLookup() {
  const [code, setCode] = useState('');
  const [hit, setHit] = useState<Hit | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState('');
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const c = (new URLSearchParams(window.location.search).get('code') || '').trim().toUpperCase();
    setCode(c);
  }, []);

  useEffect(() => {
    if (!code) return;
    let alive = true;
    (async () => {
      setLoading(true); setErr('');
      try {
        const r = await fetch('/api/dashboard/leads?limit=500', { credentials: 'include' });
        const j = await r.json().catch(() => ({}));
        const list: any[] = j?.leads || j?.data || j?.prospects || [];
        const found = list.find((x) => String(x.prospectId || x.prospectCode || x.code || '').toUpperCase() === code);
        if (!alive) return;
        if (found) setHit(found);
        else setErr('ไม่พบรหัสนี้ในรายการผู้สนใจ (อาจถูกลบ หรือยังไม่ได้โหลดข้อมูล)');
      } catch {
        if (alive) setErr('ค้นหาไม่สำเร็จ กรุณาลองใหม่');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [code]);

  if (!code || dismissed) return null;

  const name = hit ? ([hit.name || [hit.firstName, hit.lastName].filter(Boolean).join(' ')].filter(Boolean)[0] || '-') : '';

  return (
    <div className="card border-l-4 border-sky-500 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-bold text-[#475569]">🔎 รหัสผู้สนใจ <span className="font-mono">{code}</span></div>
          {loading && <div className="mt-1 text-[11px] text-slate-500">กำลังค้นหา…</div>}
          {!loading && hit && (
            <div className="mt-1 text-[12px] leading-relaxed text-slate-600">
              <div><b>{name}</b> · {hit.status || '-'}</div>
              <div>เบอร์: {hit.phone || '-'}{hit.email ? ` · อีเมล: ${hit.email}` : ''}</div>
              <div className="text-[11px] text-slate-400">
                {hit.source ? `ที่มา: ${hit.source} · ` : ''}{hit.createdAt ? new Date(hit.createdAt).toLocaleString('th-TH') : ''}
                {hit.score != null ? ` · คะแนน ${hit.score}` : ''}
              </div>
            </div>
          )}
          {!loading && err && <div className="mt-1 text-[11px] text-amber-700">{err}</div>}
          <div className="mt-1 text-[10px] text-slate-400">
            หน้านี้แสดงรายชื่อจากเมนู “ลงทะเบียนสมาชิกทั่วไป” — รหัสผู้สนใจเป็นข้อมูลลีด ไม่ใช่สมาชิก
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <a href={`/api/dashboard/leads?limit=500`} target="_blank" rel="noreferrer" className="rounded-full border px-3 py-1.5 text-[11px] font-semibold text-slate-700 no-underline">ดูข้อมูลลีด (JSON)</a>
          <button type="button" onClick={() => setDismissed(true)} className="rounded-full border px-3 py-1.5 text-[11px] text-slate-500">ปิด</button>
        </div>
      </div>
    </div>
  );
}
