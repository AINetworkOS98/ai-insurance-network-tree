'use client';
// JoinShareCard — การ์ด "ชวนคนสนใจสมัครเข้าใช้ app": ลิงก์ + คัดลอก + QR (สแกนจากมือถือ)
// ใช้ในแท็บคีย์แมน (/prospects?tab=keyman) — ลิงก์ชี้ไปหน้า /join ซึ่งเป็นหน้าสาธารณะ
import { useEffect, useMemo, useState } from 'react';

export default function JoinShareCard({ src = 'keyman' }: { src?: string }) {
  const [origin, setOrigin] = useState('');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') setOrigin(window.location.origin);
  }, []);

  const url = useMemo(() => (origin ? `${origin}/join?src=${encodeURIComponent(src)}` : ''), [origin, src]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!url) return;
      try {
        const mod: any = await import('qrcode');
        const toDataURL = mod?.toDataURL || mod?.default?.toDataURL;
        const dataUrl = await toDataURL(url, { width: 220, margin: 1, color: { dark: '#0b2b5b', light: '#ffffff' } });
        if (alive) setQr(dataUrl);
      } catch {
        if (alive) setQr('');
      }
    })();
    return () => { alive = false; };
  }, [url]);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true); setMsg('คัดลอกลิงก์แล้ว — ส่งใน LINE/Facebook ได้เลย');
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setMsg('คัดลอกอัตโนมัติไม่ได้ — แตะที่ช่องลิงก์แล้วคัดลอกเอง');
    }
  }

  async function share() {
    if (!url) return;
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    if (nav?.share) {
      try { await nav.share({ title: 'สมัครเข้าใช้ระบบ AI Insurance Network (ฟรี)', text: 'เครื่องคำนวณเบี้ย/ภาษี + คลังใบเสร็จ + ระบบเครือข่าย', url }); return; } catch { /* ผู้ใช้ยกเลิก */ }
    }
    copy();
  }

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#475569]">📤 ชวนคนสนใจ “สมัครเข้าใช้ app”</div>
          <div className="mt-1 text-[11px] leading-relaxed text-slate-500">
            ส่งลิงก์นี้ให้ลูกค้า/ผู้สนใจ — เขากรอกชื่อกับเบอร์แล้วทีมติดต่อกลับ
            ข้อมูลจะเข้าระบบ “ผู้สนใจ” พร้อมคะแนนความสนใจ (PDPA: มี consent + ถอนได้)
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={share} className="rounded-full bg-[#0b2b5b] px-4 py-2 text-[11px] font-bold text-white">แชร์ลิงก์</button>
          <a href={url || '/join'} target="_blank" rel="noreferrer" className="rounded-full border px-4 py-2 text-[11px] font-semibold text-slate-700 no-underline">เปิดหน้าสมัคร ↗</a>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex-1 min-w-0">
          <label className="text-[10px] text-slate-500">ลิงก์หน้า /join (แชร์ได้ทุกช่องทาง)</label>
          <div className="mt-1 flex gap-2">
            <input readOnly value={url} placeholder="/join?src=keyman" className="w-full rounded-xl border border-[#dbeafe] bg-white px-3 py-2 text-xs text-slate-700" />
            <button type="button" onClick={copy} className="shrink-0 rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white">
              {copied ? 'คัดลอกแล้ว ✓' : 'คัดลอก'}
            </button>
          </div>
          {msg && <div className="mt-1 text-[10px] text-emerald-700">{msg}</div>}
          <div className="mt-2 text-[10px] text-slate-400">
            ตัวอย่างข้อความที่ส่งได้: “สนใจใช้ระบบคำนวณเบี้ย/ลดหย่อนภาษี + คลังใบเสร็จไหมครับ? สมัครฟรีที่ลิงก์นี้ ใช้เวลา 1 นาที”
          </div>
        </div>
        <div className="shrink-0 text-center">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="QR สมัครเข้าใช้ระบบ" className="h-[150px] w-[150px] rounded-xl border bg-white p-1" />
          ) : (
            <div className="flex h-[150px] w-[150px] items-center justify-center rounded-xl border bg-slate-50 text-[10px] text-slate-400">QR กำลังสร้าง…</div>
          )}
          <div className="mt-1 text-[10px] text-slate-500">สแกนด้วยมือถือ</div>
        </div>
      </div>
    </div>
  );
}
